/*
 * Copyright (C) 2025 Qopy App
 *
 * This file is part of Qopy.
 *
 * Qopy is dual-licensed:
 *
 * 1. GNU Affero General Public License v3.0 (AGPL-3.0)
 *    For open source use. See LICENSE-AGPL for details.
 *
 * 2. Commercial License
 *    For proprietary/commercial use. Contact qopy.quiet156@passmail.net
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

const BaseService = require('./core/BaseService');
const fs = require('fs-extra');
const path = require('path');
const { createLimiter } = require('./utils/concurrencyLimiter');
const { safeDeleteFile } = require('./utils/fileOperations');

/**
 * CleanupService - Handles periodic cleanup of expired clips, uploads, and orphaned files.
 * Extracted from server.js to follow Single Responsibility Principle.
 */
class CleanupService extends BaseService {
    /**
     * @param {Object} pool - PostgreSQL connection pool
     * @param {string} storagePath - Base path for file storage
     * @param {Function} getRedis - Function that returns Redis client or null
     */
    constructor(pool, storagePath, getRedis) {
        super();
        this.pool = pool;
        this.storagePath = storagePath;
        this.getRedis = getRedis;
        this._cleanupInterval = null;
    }

    /**
     * Cleanup expired clips: delete associated files, mark as expired, purge old records,
     * and reset the sequence if approaching the limit.
     */
    async cleanupExpiredClips() {
        const now = Date.now();

        // Step 1: Delete files for expired clips
        try {
            const expiredClipsWithFiles = await this.pool.query(
                'SELECT clip_id, file_path FROM clips WHERE expiration_time < $1 AND is_expired = false AND file_path IS NOT NULL',
                [now]
            );

            let deletedFilesCount = 0;
            for (const clip of expiredClipsWithFiles.rows) {
                if (clip.file_path) {
                    try {
                        const result = await safeDeleteFile(clip.file_path);
                        if (result.success) {
                            deletedFilesCount++;
                        }
                    } catch (fileError) {
                        console.error(`❌ Error deleting file for clip ${clip.clip_id}:`, fileError.message);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error fetching expired clips with files:', error.message);
        }

        // Step 2: Mark expired clips as expired
        try {
            await this.pool.query(
                'UPDATE clips SET is_expired = true WHERE expiration_time < $1 AND is_expired = false',
                [now]
            );
        } catch (error) {
            console.error('❌ Error marking clips as expired:', error.message);
        }

        // Step 3: Delete clips that have been expired for more than 5 minutes
        try {
            await this.pool.query(
                'DELETE FROM clips WHERE is_expired = true AND expiration_time < $1',
                [now - (5 * 60 * 1000)] // 5 minutes ago
            );
        } catch (error) {
            console.error('❌ Error deleting old expired clips:', error.message);
        }

        // Step 4: Check if we need to reset the sequence (if we're approaching the limit)
        try {
            const sequenceCheck = await this.pool.query(
                'SELECT last_value FROM clips_id_seq'
            );
            const currentSequence = parseInt(sequenceCheck.rows[0].last_value);

            if (currentSequence > 2000000000) {
                const maxIdResult = await this.pool.query('SELECT COALESCE(MAX(id), 0) as max_id FROM clips');
                const maxId = parseInt(maxIdResult.rows[0].max_id);
                const newStartValue = Math.max(1, maxId + 1000); // Start 1000 above current max

                await this.pool.query(
                    'ALTER SEQUENCE clips_id_seq RESTART WITH $1',
                    [newStartValue]
                );

                console.log(`🔄 Reset SERIAL sequence to ${newStartValue} (was ${currentSequence})`);
            }
        } catch (error) {
            console.error('❌ Error checking/resetting sequence:', error.message);
        }
    }

    /**
     * Cleanup expired uploads and orphaned files
     */
    async cleanupExpiredUploads() {
        try {
            const now = Date.now();

            // Get expired upload session IDs
            const expiredSessions = await this.pool.query(
                'SELECT upload_id FROM upload_sessions WHERE expiration_time < $1 OR (status = $2 AND last_activity < $3)',
                [now, 'uploading', now - (24 * 60 * 60 * 1000)]
            );

            if (expiredSessions.rows.length > 0) {
                const expiredIds = expiredSessions.rows.map(s => s.upload_id);

                // Single JOIN query to get ALL chunk paths for expired sessions
                const allChunks = await this.pool.query(
                    'SELECT storage_path FROM file_chunks WHERE upload_id = ANY($1)',
                    [expiredIds]
                );

                // Parallel file deletion with concurrency limiter
                if (allChunks.rows.length > 0) {
                    const limit = createLimiter(10);
                    const deleteTasks = allChunks.rows.map(chunk =>
                        limit(async () => safeDeleteFile(chunk.storage_path))
                    );
                    await Promise.all(deleteTasks);
                }

                // Batch delete database records
                await this.pool.query('DELETE FROM file_chunks WHERE upload_id = ANY($1)', [expiredIds]);
                await this.pool.query('DELETE FROM upload_sessions WHERE upload_id = ANY($1)', [expiredIds]);

                // Redis cache cleanup
                const redis = this.getRedis();
                if (redis) {
                    const cacheKeys = expiredIds.map(id => `upload:${id}`);
                    await Promise.all(cacheKeys.map(key => redis.del(key).catch(() => {})));
                }
            }

            // Clean up orphaned files (files without corresponding clips)
            const orphanedFiles = await this.pool.query(`
                SELECT file_path FROM clips
                WHERE content_type = 'file' AND file_path IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM clips c2 WHERE c2.file_path = clips.file_path AND c2.expiration_time >= $1
                )
            `, [now]);

            if (orphanedFiles.rows.length > 0) {
                const limit = createLimiter(10);
                const deleteTasks = orphanedFiles.rows.map(file =>
                    limit(async () => safeDeleteFile(file.file_path))
                );
                await Promise.all(deleteTasks);
            }

        } catch (error) {
            console.error('❌ Error cleaning up expired uploads:', error.message);
        }
    }

    /**
     * Delete upload_statistics rows older than the retention period.
     * The upload_statistics table grows by ~1 row/day with no built-in cleanup,
     * so this prevents unbounded growth over months/years of operation.
     * @param {number} retentionDays - Number of days to retain (default: 90)
     */
    async cleanupUploadStatistics(retentionDays = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const result = await this.pool.query(
                'DELETE FROM upload_statistics WHERE date < $1',
                [cutoffDate.toISOString().split('T')[0]]
            );
            if (result.rowCount > 0) {
                console.log(`🧹 Cleaned up ${result.rowCount} old upload_statistics rows (older than ${retentionDays} days)`);
            }
        } catch (error) {
            console.error('❌ Error cleaning up upload statistics:', error.message);
        }
    }

    /**
     * Start the periodic cleanup interval
     * @param {number} intervalMs - Interval in milliseconds (default: 60000 = 1 minute)
     */
    start(intervalMs = 60000) {
        this._cleanupInterval = setInterval(async () => {
            await this.cleanupExpiredClips();
            await this.cleanupExpiredUploads();
            await this.cleanupUploadStatistics();
        }, intervalMs);
    }

    /**
     * Stop the periodic cleanup interval
     */
    stop() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
    }

    /**
     * Handle graceful shutdown (overrides BaseService)
     */
    async shutdown() {
        this.stop();
        await super.shutdown();
    }
}

module.exports = CleanupService;

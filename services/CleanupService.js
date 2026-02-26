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
     * Safely delete a file with permission handling
     * @param {string} filePath - Path to the file to delete
     * @returns {Promise<Object>} - Result object with success and reason
     */
    async safeDeleteFile(filePath) {
        try {
            // Check if file exists
            const fileExists = await fs.pathExists(filePath);
            if (!fileExists) {
                return { success: true, reason: 'file_not_exists' };
            }

            // Get file stats
            const stats = await fs.stat(filePath);

            // Try to delete
            await fs.unlink(filePath);
            return { success: true, reason: 'deleted' };
        } catch (error) {
            // Handle specific error cases
            if (error.code === 'ENOENT') {
                return { success: true, reason: 'file_not_exists' };
            } else if (error.code === 'EACCES' || error.code === 'EPERM') {
                return { success: false, reason: 'permission_denied', error: error.message };
            } else if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY') {
                return { success: false, reason: 'file_in_use', error: error.message };
            } else {
                return { success: false, reason: 'unknown_error', error: error.message };
            }
        }
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
                        const result = await this.safeDeleteFile(clip.file_path);
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
     * Native concurrency limiter to avoid p-limit ES6 import issues
     * @param {number} limit - Maximum concurrent operations
     * @returns {Function} - Limiter function
     */
    _createLimiter(limit) {
        let running = 0;
        const queue = [];

        const run = async (fn) => {
            return new Promise((resolve, reject) => {
                queue.push({ fn, resolve, reject });
                process();
            });
        };

        const process = async () => {
            if (running >= limit || queue.length === 0) return;

            running++;
            const { fn, resolve, reject } = queue.shift();

            try {
                const result = await fn();
                resolve(result);
            } catch (error) {
                reject(error);
            } finally {
                running--;
                process();
            }
        };

        return run;
    }

    /**
     * Cleanup expired uploads and orphaned files
     */
    async cleanupExpiredUploads() {
        try {
            const now = Date.now();

            // Get expired upload sessions
            const expiredSessions = await this.pool.query(
                'SELECT upload_id FROM upload_sessions WHERE expiration_time < $1 OR (status = $2 AND last_activity < $3)',
                [now, 'uploading', now - (24 * 60 * 60 * 1000)] // 24 hours old
            );

            for (const session of expiredSessions.rows) {
                const uploadId = session.upload_id;

                try {
                    // Get and delete chunks
                    const chunks = await this.pool.query(
                        'SELECT storage_path FROM file_chunks WHERE upload_id = $1',
                        [uploadId]
                    );

                    const limit = this._createLimiter(10); // Allow more concurrency for file deletion

                    const deleteTasks = chunks.rows.map(chunk =>
                        limit(async () => {
                            const result = await this.safeDeleteFile(chunk.storage_path);
                            if (!result.success) {
                                // Non-critical: chunk file cleanup failed
                            }
                            return result;
                        })
                    );

                    await Promise.all(deleteTasks);

                    // Delete database records
                    await this.pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
                    await this.pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);

                    // Clear cache
                    const redis = this.getRedis();
                    if (redis) {
                        await redis.del(`upload:${uploadId}`);
                    }

                } catch (error) {
                    // Individual upload cleanup error - continue with remaining
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

            let deletedCount = 0;
            let failedCount = 0;

            for (const file of orphanedFiles.rows) {
                const result = await this.safeDeleteFile(file.file_path);

                if (result.success) {
                    if (result.reason === 'deleted') {
                        deletedCount++;
                    }
                } else {
                    failedCount++;
                    // Non-critical: orphaned file cleanup failed
                }
            }

        } catch (error) {
            console.error('❌ Error cleaning up expired uploads:', error.message);
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

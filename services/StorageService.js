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

const fs = require('fs-extra');
const path = require('path');

/**
 * StorageService
 * Handles database operations and file storage for clips
 */
class StorageService {
    
    constructor(pool, STORAGE_PATH, generateUploadId) {
        this.pool = pool;
        this.STORAGE_PATH = STORAGE_PATH;
        this.generateUploadId = generateUploadId;
    }

    /**
     * Calculate expiration time based on expiration string
     * @param {string} expiration - Expiration time string
     * @returns {number} Expiration timestamp
     */
    calculateExpirationTime(expiration) {
        const expirationTimes = {
            '5min': 5 * 60 * 1000,
            '15min': 15 * 60 * 1000,
            '30min': 30 * 60 * 1000,
            '1hr': 60 * 60 * 1000,
            '6hr': 6 * 60 * 60 * 1000,
            '24hr': 24 * 60 * 60 * 1000
        };

        return Date.now() + expirationTimes[expiration];
    }

    /**
     * Determine password hash based on clip type
     * @param {boolean} quickShare - Is quick share
     * @param {string} _quickShareSecret - Unused (zero-knowledge: secret never sent to server)
     * @param {boolean} hasPassword - Has password protection
     * @returns {Object} Password hash result
     */
    determinePasswordHash(quickShare, _quickShareSecret, hasPassword) {
        let passwordHash = null;

        if (quickShare) {
            // Quick Share: Zero-knowledge — no secret stored on server
            passwordHash = null;
        } else if (hasPassword) {
            // Password-protected: Mark as client-encrypted
            passwordHash = 'client-encrypted';
        }

        return { passwordHash };
    }

    /**
     * Store clip as file in storage system
     * @param {Buffer} processedContent - Content to store
     * @param {string} clipId - Clip ID
     * @param {string} contentType - Content type
     * @param {string} mimeType - MIME type
     * @param {number} filesize - File size
     * @param {number} expirationTime - Expiration timestamp
     * @param {string} passwordHash - Password hash
     * @param {boolean} oneTime - One time access
     * @returns {Object} Storage result
     */
    async storeAsFile(processedContent, clipId, contentType, mimeType, filesize, expirationTime, passwordHash, oneTime) {
        try {
            const uploadId = this.generateUploadId();
            const storagePath = path.join(this.STORAGE_PATH, 'files', `${uploadId}.content`);
            await fs.writeFile(storagePath, processedContent);

            // Create file metadata
            const file_metadata = {
                originalSize: processedContent.length,
                contentType: contentType,
                storedAsFile: true
            };

            await this.pool.query(`
                INSERT INTO clips (
                    clip_id, content_type, file_path, mime_type, filesize, 
                    file_metadata, expiration_time, password_hash, one_time, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                clipId, contentType, storagePath, mimeType, filesize,
                JSON.stringify(file_metadata), expirationTime, passwordHash, 
                oneTime || false, Date.now()
            ]);

            return { success: true, storagePath };
            
        } catch (error) {
            console.error('❌ Error storing file:', error);
            throw error;
        }
    }

    /**
     * Store clip inline in database
     * @param {Buffer|string} processedContent - Content to store
     * @param {string} clipId - Clip ID
     * @param {string} contentType - Content type
     * @param {string} mimeType - MIME type
     * @param {number} filesize - File size
     * @param {number} expirationTime - Expiration timestamp
     * @param {string} passwordHash - Password hash
     * @param {boolean} oneTime - One time access
     * @returns {Object} Storage result
     */
    async storeInline(processedContent, clipId, contentType, mimeType, filesize, expirationTime, passwordHash, oneTime) {
        try {
            await this.pool.query(`
                INSERT INTO clips (
                    clip_id, content_type, content, mime_type, filesize,
                    expiration_time, password_hash, one_time, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                clipId, contentType, processedContent, mimeType, filesize,
                expirationTime, passwordHash, oneTime || false, Date.now()
            ]);

            return { success: true };
            
        } catch (error) {
            console.error('❌ Error storing inline:', error);
            throw error;
        }
    }

    /**
     * Store clip with automatic file/inline decision
     * @param {Object} params - Storage parameters
     * @returns {Object} Storage result
     */
    async storeClip(params) {
        const {
            processedContent, clipId, contentType, mimeType, filesize,
            expirationTime, passwordHash, oneTime, shouldStoreAsFile
        } = params;

        try {
            if (shouldStoreAsFile) {
                return await this.storeAsFile(
                    processedContent, clipId, contentType, mimeType, filesize,
                    expirationTime, passwordHash, oneTime
                );
            } else {
                return await this.storeInline(
                    processedContent, clipId, contentType, mimeType, filesize,
                    expirationTime, passwordHash, oneTime
                );
            }
        } catch (dbError) {
            console.error('❌ Database error:', dbError.message);
            if (dbError.message.includes('password_hash')) {
                return {
                    error: 'Database schema issue',
                    message: 'Password hash column too small for Quick Share secrets'
                };
            }
            throw dbError;
        }
    }
}

module.exports = StorageService;
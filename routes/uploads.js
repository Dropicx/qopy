/*
 * Copyright (C) 2025 Qopy App
 * Upload management routes (initiate, chunk upload, complete, status, cancel)
 */

const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const rateLimit = require('express-rate-limit');
const { UploadCompletionService, UploadCompletionError } = require('../services/UploadCompletionService');
const { createLimiter } = require('../services/utils/concurrencyLimiter');

// Upload ID generation
function generateUploadId() {
    return uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase();
}

/**
 * Register upload-related routes
 * @param {import('express').Application} app
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.upload - Multer upload middleware
 * @param {object} deps.redisManager - Centralized Redis manager
 * @param {Function} deps.getRedis - Helper to get Redis client safely
 * @param {string} deps.STORAGE_PATH - Base storage directory path
 * @param {number} deps.CHUNK_SIZE - Chunk size in bytes
 * @param {number} deps.MAX_FILE_SIZE - Maximum file size in bytes
 * @param {Function} deps.generateClipId - Clip ID generator function
 * @param {Function} deps.updateStatistics - Statistics update function
 * @param {Function} deps.safeDeleteFile - Safe file deletion helper
 * @param {Function} deps.assembleFile - File assembly function
 * @param {Function} deps.getUploadSession - Upload session retrieval function
 * @param {Function} deps.getClientIP - Client IP extraction function
 */
function registerUploadRoutes(app, {
    pool,
    upload,
    redisManager,
    getRedis,
    STORAGE_PATH,
    CHUNK_SIZE,
    MAX_FILE_SIZE,
    generateClipId,
    updateStatistics,
    safeDeleteFile,
    assembleFile,
    getUploadSession,
    getClientIP
}) {
    // Cache helper functions
    async function setCache(key, value, ttl = 3600) {
        const redis = getRedis();
        if (redis) {
            await redis.setEx(key, ttl, JSON.stringify(value));
        }
    }

    // Upload rate limiting - only limit session initiation, not individual chunks
    const uploadLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // 10 upload sessions per IP
        message: {
            error: 'Too many uploads',
            message: 'Upload rate limit exceeded. Please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: getClientIP
    });

    // Apply upload rate limiting only to session initiation (not chunks/completion)
    app.use('/api/upload/initiate', uploadLimiter);

    // Initialize upload completion service
    const uploadCompletionService = new UploadCompletionService(
        pool,
        redisManager,
        assembleFile,
        updateStatistics,
        generateClipId,
        getUploadSession
    );

    // ==========================================
    // UPLOAD ENDPOINTS
    // ==========================================

    // Complete upload
    app.post('/api/upload/complete/:uploadId', async (req, res) => {
        try {
            const { uploadId } = req.params;
            const result = await uploadCompletionService.completeUpload(uploadId, req.body, req);
            res.json(result);

        } catch (error) {
            console.error('Error completing upload:', error);

            if (error instanceof UploadCompletionError) {
                return res.status(error.statusCode).json({
                    error: error.message.includes('not found') ? 'Upload session not found' : 'Upload incomplete',
                    message: 'Upload could not be completed'
                });
            }

            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to complete upload'
            });
        }
    });

    // Upload status
    app.get('/api/upload/:uploadId/status', async (req, res) => {
        try {
            const { uploadId } = req.params;

            const session = await getUploadSession(uploadId);
            if (!session) {
                return res.status(404).json({
                    error: 'Upload session not found'
                });
            }

            res.json({
                success: true,
                uploadId,
                status: session.status,
                uploadedChunks: session.uploaded_chunks,
                totalChunks: session.total_chunks,
                progress: Math.round((session.uploaded_chunks / session.total_chunks) * 100)
            });

        } catch (error) {
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to get upload status'
            });
        }
    });

    // Initiate upload
    app.post('/api/upload/initiate', [
        body('filename').isString().isLength({ min: 1, max: 255 }).withMessage('Valid filename required'),
        body('totalChunks').optional().isInt({ min: 1, max: 20 }).withMessage('totalChunks must be between 1 and 20'),
        body('filesize').optional().isInt({ min: 1, max: MAX_FILE_SIZE }).withMessage(`File size must be between 1 byte and ${MAX_FILE_SIZE} bytes`),
        body('mimeType').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Valid MIME type required'),
        body('expiration').optional().isIn(['5min', '15min', '30min', '1hr', '6hr', '24hr']).withMessage('Invalid expiration time'),
        body('hasPassword').optional().isBoolean().withMessage('hasPassword must be a boolean'),
        body('oneTime').optional().isBoolean().withMessage('oneTime must be a boolean'),
        body('quickShare').optional().isBoolean().withMessage('quickShare must be a boolean'),
        body('contentType').optional().isIn(['text', 'file']).withMessage('contentType must be text or file'),
        body('isTextContent').optional().isBoolean().withMessage('isTextContent must be a boolean')
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { filename, filesize, totalChunks: clientTotalChunks, mimeType, expiration = '24hr', hasPassword = false, oneTime = false, quickShare = false, contentType = 'text', isTextContent = false } = req.body;

            // Set appropriate MIME type based on content type
            let finalMimeType = mimeType;
            if (isTextContent || contentType === 'text') {
                finalMimeType = 'text/plain; charset=utf-8';
            } else if (!mimeType) {
                finalMimeType = 'application/octet-stream';
            }

            // Use client-provided totalChunks, fall back to calculating from filesize for backward compatibility
            const totalChunks = clientTotalChunks || (filesize ? Math.ceil(filesize / CHUNK_SIZE) : 1);

            if (totalChunks < 1 || totalChunks > 20) {
                return res.status(400).json({
                    error: 'Validation failed',
                    message: 'totalChunks must be between 1 and 20'
                });
            }

            // Generate upload ID
            const uploadId = generateUploadId();

            // Calculate expiration time
            const expirationTimes = {
                '5min': 5 * 60 * 1000,
                '15min': 15 * 60 * 1000,
                '30min': 30 * 60 * 1000,
                '1hr': 60 * 60 * 1000,
                '6hr': 6 * 60 * 60 * 1000,
                '24hr': 24 * 60 * 60 * 1000
            };

            const expirationTime = Date.now() + expirationTimes[expiration];

            // Store upload session in database (no client_ip stored for privacy)
            await pool.query(`
                INSERT INTO upload_sessions (
                    upload_id, filename, original_filename, filesize, mime_type,
                    chunk_size, total_chunks, expiration_time, has_password,
                    one_time, quick_share, created_at, last_activity,
                    is_text_content
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
                uploadId, filename, filename, 0, finalMimeType,
                CHUNK_SIZE, totalChunks, expirationTime, hasPassword,
                oneTime, quickShare, Date.now(), Date.now(),
                isTextContent || contentType === 'text'
            ]);

            // Cache session data for quick access
            await setCache(`upload:${uploadId}`, {
                uploadId,
                filename,
                original_filename: filename,
                filesize: 0,
                mime_type: finalMimeType,
                chunk_size: CHUNK_SIZE,
                total_chunks: totalChunks,
                uploaded_chunks: 0,
                expiration_time: expirationTime,
                has_password: hasPassword,
                one_time: oneTime,
                quick_share: quickShare,
                created_at: Date.now(),
                last_activity: Date.now(),
                is_text_content: isTextContent || contentType === 'text',
                status: 'uploading'
            });

            res.json({
                success: true,
                uploadId,
                chunkSize: CHUNK_SIZE,
                totalChunks,
                uploadUrl: `/api/upload/chunk/${uploadId}`,
                expiresAt: expirationTime
            });

        } catch (error) {
            console.error('Error initiating upload:', error.message);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to initiate upload'
            });
        }
    });

    // Upload chunk
    app.post('/api/upload/chunk/:uploadId/:chunkNumber', [
        param('uploadId').isString().isLength({ min: 16, max: 16 }).withMessage('Invalid upload ID'),
        param('chunkNumber').isInt({ min: 0 }).withMessage('Invalid chunk number')
    ], upload.single('chunk'), async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { uploadId, chunkNumber } = req.params;
            const chunkNum = parseInt(chunkNumber);

            // Verify upload session exists and is active
            const sessionResult = await pool.query(
                'SELECT * FROM upload_sessions WHERE upload_id = $1 AND status = $2',
                [uploadId, 'uploading']
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Upload session not found',
                    message: 'Invalid or expired upload session'
                });
            }

            const session = sessionResult.rows[0];

            // Check if chunk number is valid
            if (chunkNum >= session.total_chunks) {
                return res.status(400).json({
                    error: 'Invalid chunk number',
                    message: `Chunk number must be less than ${session.total_chunks}`
                });
            }

            // Check if chunk already exists
            const existingChunk = await pool.query(
                'SELECT * FROM file_chunks WHERE upload_id = $1 AND chunk_number = $2',
                [uploadId, chunkNum]
            );

            if (existingChunk.rows.length > 0) {
                return res.status(409).json({
                    error: 'Chunk already uploaded',
                    message: 'This chunk has already been uploaded'
                });
            }

            // Check if file was uploaded
            if (!req.file) {
                return res.status(400).json({
                    error: 'No chunk file provided',
                    message: 'Chunk file is required'
                });
            }

            // Read chunk data from uploaded file
            const chunkData = await fs.readFile(req.file.path);

            // Validate chunk size
            let sizeValidationPassed = true;
            let validationMessage = '';

            if (session.is_text_content) {
                // For text content, encryption increases size, so we only check maximum reasonable size
                // Encrypted text can be up to ~8x larger due to IV + padding + encryption overhead
                const maxEncryptedSize = Math.max(session.chunk_size * 2, 1024 * 1024); // At least 1MB for encrypted text

                if (chunkData.length > maxEncryptedSize) {
                    sizeValidationPassed = false;
                    validationMessage = `Encrypted text chunk too large: ${chunkData.length} bytes exceeds maximum ${maxEncryptedSize} bytes`;
                }
            } else {
                // For regular files, encryption also increases size, so we need to account for that
                // Encrypted files can be larger due to IV + padding + encryption overhead
                // Allow for reasonable encryption overhead (typically 16-32 bytes for IV + padding)
                const maxEncryptedSize = session.chunk_size + 1024; // Allow 1KB overhead per chunk

                if (chunkData.length > maxEncryptedSize) {
                    sizeValidationPassed = false;
                    validationMessage = `Encrypted file chunk too large: ${chunkData.length} bytes exceeds maximum ${maxEncryptedSize} bytes`;
                }
            }

            if (!sizeValidationPassed) {
                // Clean up uploaded file
                await fs.unlink(req.file.path);
                return res.status(400).json({
                    error: 'Chunk too large',
                    message: validationMessage
                });
            }

            // Store chunk to file system
            const chunkDir = path.join(STORAGE_PATH, 'chunks', uploadId);
            await fs.mkdir(chunkDir, { recursive: true });
            const chunkPath = path.join(chunkDir, `chunk_${chunkNum}`);
            await fs.writeFile(chunkPath, chunkData);

            // Clean up temporary uploaded file
            await fs.unlink(req.file.path);

            // Store chunk metadata in database (no checksum needed)
            await pool.query(`
                INSERT INTO file_chunks (upload_id, chunk_number, chunk_size, storage_path, created_at)
                VALUES ($1, $2, $3, $4, $5)
            `, [uploadId, chunkNum, chunkData.length, chunkPath, Date.now()]);

            // Update upload session
            await pool.query(`
                UPDATE upload_sessions
                SET uploaded_chunks = uploaded_chunks + 1, last_activity = $1
                WHERE upload_id = $2
            `, [Date.now(), uploadId]);

            // Update cache - get fresh data from database to ensure consistency
            const redis = getRedis();
            if (redis) {
                const updatedSessionResult = await pool.query(
                    'SELECT * FROM upload_sessions WHERE upload_id = $1',
                    [uploadId]
                );
                if (updatedSessionResult.rows[0]) {
                    await redis.setEx(`upload:${uploadId}`, 3600, JSON.stringify(updatedSessionResult.rows[0]));
                }
            }

            res.json({
                success: true,
                chunkNumber: chunkNum,
                received: true,
                uploadedChunks: session.uploaded_chunks + 1,
                totalChunks: session.total_chunks
            });

        } catch (error) {
            console.error('Error uploading chunk:', error.message);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to upload chunk'
            });
        }
    });

    // Cancel upload
    app.delete('/api/upload/:uploadId', [
        param('uploadId').isString().isLength({ min: 16, max: 16 }).withMessage('Invalid upload ID')
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { uploadId } = req.params;

            // Get upload session
            const sessionResult = await pool.query(
                'SELECT * FROM upload_sessions WHERE upload_id = $1',
                [uploadId]
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'Upload session not found',
                    message: 'Invalid upload session'
                });
            }

            // Get and delete all chunks
            const chunksResult = await pool.query(
                'SELECT * FROM file_chunks WHERE upload_id = $1',
                [uploadId]
            );

            // Delete chunks concurrently with controlled concurrency
            const limit = createLimiter(10);

            const deleteTasks = chunksResult.rows.map(chunk =>
              limit(async () => {
                const result = await safeDeleteFile(chunk.storage_path);
                if (!result.success) {
                  // Non-critical: chunk file cleanup failed
                }
                return result;
              })
            );

            await Promise.all(deleteTasks);

            // Delete from database (order matters due to foreign key constraints)
            await pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
            await pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);

            // Clear cache
            if (redisManager.isConnected()) {
                await redisManager.del(`upload:${uploadId}`);
            }

            res.json({
                success: true,
                message: 'Upload cancelled successfully'
            });

        } catch (error) {
            console.error('Error cancelling upload:', error.message);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to cancel upload'
            });
        }
    });
}

module.exports = { registerUploadRoutes };

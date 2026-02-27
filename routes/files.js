/*
 * Copyright (C) 2025 Qopy App
 * File download and info routes
 */

const { body, validationResult } = require('express-validator');
const path = require('path');
const { clipIdValidator } = require('./shared/validators');
const { resolvePathUnderBase } = require('../services/utils/pathSafety');

/**
 * Register file-related routes
 * @param {import('express').Application} app
 * @param {{ pool: import('pg').Pool, fileService: object, fileDownloadLimiter: object, accessValidationMiddleware: Function, updateStatistics: Function, storagePath: string }} deps
 */
function registerFileRoutes(app, { pool, fileService, fileDownloadLimiter, accessValidationMiddleware, updateStatistics, storagePath }) {

    // ==========================================
    // FILE SHARING ENDPOINTS
    // ==========================================

    // Get file info
    app.get('/api/file/:clipId/info', fileDownloadLimiter, [
        clipIdValidator
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { clipId } = req.params;

            // Fetch only metadata columns needed for the file info response
            const result = await pool.query(
                'SELECT clip_id, original_filename, filesize, mime_type, expiration_time, one_time, password_hash FROM clips WHERE clip_id = $1 AND content_type = $2 AND is_expired = false',
                [clipId, 'file']
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'File not found',
                    message: 'The requested file does not exist or has expired'
                });
            }

            const clip = result.rows[0];

            res.json({
                success: true,
                clipId: clip.clip_id,
                filename: clip.original_filename,
                filesize: clip.filesize,
                mimeType: clip.mime_type,
                expiresAt: clip.expiration_time,
                oneTime: clip.one_time,
                hasPassword: clip.password_hash === 'client-encrypted'
            });

        } catch (error) {
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to get file info'
            });
        }
    });

    // File page route (serves the main app for file URLs with hash)
    app.get('/file/:clipId', [
        clipIdValidator
    ], async (req, res) => {
        // Serve the main index.html for file URLs (for client-side routing)
        // Use path relative to project root (one level up from routes/)
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    // Authenticated file download API (POST with optional access code hash in body) - Refactored with services
    app.post('/api/file/:clipId', fileDownloadLimiter, [
        clipIdValidator,
        body('accessCode').optional().isString().withMessage('Access code must be a string'),
        accessValidationMiddleware
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { clipId } = req.params;

            // Get clip data — only columns needed for file download and access control
            const result = await pool.query(
                'SELECT clip_id, file_path, original_filename, filesize, mime_type, one_time, password_hash FROM clips WHERE clip_id = $1 AND file_path IS NOT NULL AND is_expired = false',
                [clipId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'File not found',
                    message: 'The requested file does not exist or has expired'
                });
            }

            const clip = result.rows[0];

            // Ensure file_path is under storage root (path canonicalization)
            let safeFilePath;
            try {
                safeFilePath = storagePath ? resolvePathUnderBase(clip.file_path, storagePath) : clip.file_path;
            } catch (pathError) {
                return res.status(404).json({
                    error: 'File not found',
                    message: 'The requested file does not exist or has expired'
                });
            }

            // Check if file exists on storage
            if (!(await fileService.fileExists(safeFilePath))) {
                return res.status(404).json({
                    error: 'File not found on storage',
                    message: 'The file has been removed from storage'
                });
            }

            // Update access statistics
            await pool.query(`
                UPDATE clips
                SET access_count = access_count + 1, accessed_at = $1
                WHERE clip_id = $2
            `, [Date.now(), clipId]);

            await updateStatistics('file_accessed');

            // Handle one-time access
            let deleteFileAfterSend = false;
            if (clip.one_time) {
                const deleteResult = await pool.query('DELETE FROM clips WHERE clip_id = $1 AND is_expired = false RETURNING clip_id', [clipId]);
                if (deleteResult.rowCount === 0) {
                    return res.status(410).json({
                        error: 'File no longer available',
                        message: 'This one-time file has already been accessed'
                    });
                }
                deleteFileAfterSend = true;
            }

            // Set download headers and stream file (use safeFilePath from path check above)
            fileService.setDownloadHeaders(res, clip);
            await fileService.streamFile(safeFilePath, res, { deleteAfterSend: deleteFileAfterSend });

        } catch (error) {
            console.error('❌ File download error:', { method: req.method, path: req.path, error: error.message });
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal server error',
                    message: 'Failed to download file'
                });
            }
        }
    });

    // Legacy file download API (GET) - kept for backwards compatibility but returns 410 Gone
    app.get('/api/file/:clipId', fileDownloadLimiter, [
        clipIdValidator
    ], async (req, res) => {
        // Return 410 Gone for security - unauthenticated downloads no longer allowed
        res.status(410).json({
            error: 'Unauthenticated downloads disabled',
            message: 'File downloads now require authentication. Please use the web interface.',
            hint: 'This security measure prevents unauthorized access to encrypted files.'
        });
    });
}

module.exports = { registerFileRoutes };

const fs = require('fs').promises;
const fsSync = require('fs');
const BaseService = require('./core/BaseService');

/**
 * FileService - Handles file operations and streaming
 */
class FileService extends BaseService {
    constructor() {
        super();
    }
    /**
     * Check if file exists on storage
     * @param {string} filePath - Path to the file
     * @returns {Promise<boolean>} - True if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Set response headers for file download
     * @param {Object} res - Express response object
     * @param {Object} clip - Clip object with file metadata
     */
    setDownloadHeaders(res, clip) {
        if (!res || typeof res.setHeader !== 'function') return;
        const safeClip = clip || {};

        // Sanitize filename: strip control chars, null bytes, path separators
        const rawName = safeClip.original_filename ?? 'download';
        const safeName = rawName
            .replace(/[/\\]/g, '_')           // path separators → underscore
            .replace(/[\x00-\x1f\x7f]/g, '') // control characters (includes \n, \r, \0)
            .replace(/"/g, '\\"')             // escape quotes for Content-Disposition
            .substring(0, 255)                // cap length
            || 'download';                    // fallback if empty after sanitization

        res.setHeader('Content-Type', safeClip.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', safeClip.filesize ?? 0);
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Download-Options', 'noopen');
    }

    /**
     * Stream file to client with error handling
     * @param {string} filePath - Path to the file
     * @param {Object} res - Express response object
     * @param {Object} options - Streaming options
     */
    streamFile(filePath, res, options = {}) {
        return new Promise((resolve, reject) => {
            const fileStream = fsSync.createReadStream(filePath);
            
            fileStream.pipe(res);

            fileStream.on('error', (error) => {
                this.logError('Error streaming file', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'File stream error',
                        message: 'Failed to stream file'
                    });
                }
                reject(error);
            });

            fileStream.on('end', () => {
                this.logSuccess('File streaming completed');
                resolve();
            });

            // Handle one-time file deletion
            if (options.deleteAfterSend) {
                fileStream.on('end', async () => {
                    try {
                        await fs.unlink(filePath);
                        this.log('Deleted one-time file after streaming', { filePath });
                    } catch (fileError) {
                        this.logError('Could not delete one-time file', fileError);
                    }
                });
            }
        });
    }

    /**
     * Delete file from storage
     * @param {string} filePath - Path to the file
     * @returns {Promise<boolean>} - True if deleted successfully
     */
    async deleteFile(filePath) {
        try {
            await fs.unlink(filePath);
            this.log('File deleted', { filePath });
            return true;
        } catch (error) {
            this.logError('Could not delete file', error);
            return false;
        }
    }
}

module.exports = FileService;
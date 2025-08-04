const fs = require('fs').promises;
const fsSync = require('fs');

/**
 * FileService - Handles file operations and streaming
 */
class FileService {
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
        res.setHeader('Content-Type', clip.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', clip.filesize);
        res.setHeader('Content-Disposition', `attachment; filename="${clip.original_filename}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
                console.error('❌ Error streaming file:', error.message);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'File stream error',
                        message: 'Failed to stream file'
                    });
                }
                reject(error);
            });

            fileStream.on('end', () => {
                console.log('✅ File streaming completed');
                resolve();
            });

            // Handle one-time file deletion
            if (options.deleteAfterSend) {
                fileStream.on('end', async () => {
                    try {
                        await fs.unlink(filePath);
                        console.log('🧹 Deleted one-time file after streaming:', filePath);
                    } catch (fileError) {
                        console.warn('⚠️ Could not delete one-time file:', fileError.message);
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
            console.log('🧹 File deleted:', filePath);
            return true;
        } catch (error) {
            console.warn('⚠️ Could not delete file:', error.message);
            return false;
        }
    }
}

module.exports = FileService;
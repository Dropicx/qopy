const fs = require('fs').promises;
const path = require('path');

/**
 * Service for handling file chunk assembly
 */
class FileAssemblyService {
    /**
     * Assemble file from uploaded chunks by calling the main assembleFile function
     * @param {string} uploadId - Upload session ID 
     * @param {Object} session - Upload session data
     * @param {Function} assembleFileFn - The assembleFile function from main server
     * @returns {Promise<string>} - Path to assembled file
     */
    static async assembleFile(uploadId, session, assembleFileFn) {
        console.log('📝 About to assemble file:', uploadId);
        
        if (!assembleFileFn) {
            throw new Error('assembleFile function not provided');
        }
        
        const filePath = await assembleFileFn(uploadId, session);
        console.log('📝 File assembled successfully:', filePath);
        
        return filePath;
    }

    /**
     * Get file size from assembled file
     * @param {string} filePath - Path to the file
     * @returns {Promise<number>} - File size in bytes
     */
    static async getFileSize(filePath) {
        const stats = await fs.stat(filePath);
        return stats.size;
    }

    /**
     * Validate chunk completeness
     * @param {number} uploadedChunks - Number of uploaded chunks
     * @param {number} totalChunks - Total expected chunks
     * @returns {boolean} - Whether all chunks are uploaded
     */
    static validateChunkCompleteness(uploadedChunks, totalChunks) {
        return uploadedChunks >= totalChunks;
    }
}

module.exports = FileAssemblyService;
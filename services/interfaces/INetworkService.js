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
 *    For proprietary/commercial use. Contact qopy@lit.services
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

/**
 * Interface for network operations
 * Defines the contract for upload/download capabilities
 */
class INetworkService {
    /**
     * Handle file upload with progress tracking
     * @param {Object} uploadRequest - Upload request data
     * @param {Function} progressCallback - Progress callback function
     * @returns {Promise<Object>} - Upload result
     * @throws {Error} If upload fails
     */
    async uploadFile(uploadRequest, progressCallback) {
        throw new Error('uploadFile method must be implemented');
    }

    /**
     * Handle file download with streaming
     * @param {string} fileId - File identifier
     * @param {Object} downloadOptions - Download options
     * @returns {Promise<Stream>} - File stream
     * @throws {Error} If download fails
     */
    async downloadFile(fileId, downloadOptions) {
        throw new Error('downloadFile method must be implemented');
    }

    /**
     * Resume interrupted upload
     * @param {string} uploadId - Upload identifier
     * @param {Object} resumeOptions - Resume options
     * @returns {Promise<Object>} - Resume result
     * @throws {Error} If resume fails
     */
    async resumeUpload(uploadId, resumeOptions) {
        throw new Error('resumeUpload method must be implemented');
    }

    /**
     * Cancel ongoing upload/download
     * @param {string} operationId - Operation identifier
     * @returns {Promise<boolean>} - True if cancelled successfully
     * @throws {Error} If cancellation fails
     */
    async cancelOperation(operationId) {
        throw new Error('cancelOperation method must be implemented');
    }

    /**
     * Get upload/download progress
     * @param {string} operationId - Operation identifier
     * @returns {Promise<Object>} - Progress information
     * @throws {Error} If progress check fails
     */
    async getProgress(operationId) {
        throw new Error('getProgress method must be implemented');
    }

    /**
     * Validate network request
     * @param {Object} request - Network request
     * @returns {Promise<boolean>} - True if valid
     * @throws {Error} If validation fails
     */
    async validateRequest(request) {
        throw new Error('validateRequest method must be implemented');
    }

    /**
     * Set download headers for response
     * @param {Object} response - HTTP response object
     * @param {Object} fileMetadata - File metadata
     * @returns {Promise<void>}
     * @throws {Error} If header setting fails
     */
    async setDownloadHeaders(response, fileMetadata) {
        throw new Error('setDownloadHeaders method must be implemented');
    }

    /**
     * Handle chunked upload
     * @param {Object} chunkData - Chunk data
     * @param {Object} uploadContext - Upload context
     * @returns {Promise<Object>} - Chunk upload result
     * @throws {Error} If chunk upload fails
     */
    async uploadChunk(chunkData, uploadContext) {
        throw new Error('uploadChunk method must be implemented');
    }
}

module.exports = INetworkService;
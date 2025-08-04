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

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const INetworkService = require('../interfaces/INetworkService');
const BaseService = require('./BaseService');

/**
 * Core network service for upload/download operations
 * Implements resumable uploads, streaming downloads, and progress tracking
 */
class NetworkService extends BaseService {
    constructor(logger, validator, config = {}) {
        super(logger, validator);
        
        this.config = {
            maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB
            chunkSize: config.chunkSize || 1024 * 1024, // 1MB
            maxConcurrentUploads: config.maxConcurrentUploads || 10,
            uploadTimeout: config.uploadTimeout || 300000, // 5 minutes
            downloadTimeout: config.downloadTimeout || 60000, // 1 minute
            tempPath: config.tempPath || './temp',
            ...config
        };

        this.activeOperations = new Map();
        this.uploadSessions = new Map();
        this.downloadSessions = new Map();
    }

    /**
     * Handle file upload with progress tracking
     * @param {Object} uploadRequest - Upload request data
     * @param {Function} progressCallback - Progress callback function
     * @returns {Promise<Object>} - Upload result
     */
    async uploadFile(uploadRequest, progressCallback) {
        return this.executeOperation('uploadFile', async () => {
            const {
                file,
                sessionId,
                metadata = {},
                resumable = false,
                encrypted = false
            } = uploadRequest;

            await this.validateParams(uploadRequest, {
                file: { required: true, type: 'object' },
                sessionId: { required: true, type: 'string' }
            });

            const operationId = uuidv4();
            const startTime = Date.now();

            // Check file size limits
            if (file.size > this.config.maxFileSize) {
                throw this.createError(
                    `File size ${file.size} exceeds maximum allowed ${this.config.maxFileSize}`,
                    'FILE_TOO_LARGE'
                );
            }

            // Check active uploads limit
            if (this.activeOperations.size >= this.config.maxConcurrentUploads) {
                throw this.createError(
                    'Too many concurrent uploads',
                    'UPLOAD_LIMIT_EXCEEDED'
                );
            }

            const uploadContext = {
                operationId,
                sessionId,
                fileName: file.originalname || file.name,
                fileSize: file.size,
                mimeType: file.mimetype || file.type,
                startTime,
                uploaded: 0,
                encrypted,
                metadata,
                status: 'uploading'
            };

            this.activeOperations.set(operationId, uploadContext);
            this.uploadSessions.set(sessionId, uploadContext);

            try {
                let result;
                
                if (resumable || file.size > this.config.chunkSize) {
                    result = await this.handleChunkedUpload(file, uploadContext, progressCallback);
                } else {
                    result = await this.handleDirectUpload(file, uploadContext, progressCallback);
                }

                uploadContext.status = 'completed';
                uploadContext.completedAt = Date.now();
                uploadContext.duration = uploadContext.completedAt - startTime;

                this.logSuccess('File upload completed', {
                    operationId,
                    sessionId,
                    fileName: uploadContext.fileName,
                    fileSize: uploadContext.fileSize,
                    duration: uploadContext.duration
                });

                return {
                    operationId,
                    sessionId,
                    ...result,
                    metadata: uploadContext.metadata
                };

            } catch (error) {
                uploadContext.status = 'failed';
                uploadContext.error = error.message;
                throw error;
            } finally {
                // Cleanup after timeout
                setTimeout(() => {
                    this.activeOperations.delete(operationId);
                    this.uploadSessions.delete(sessionId);
                }, this.config.uploadTimeout);
            }
        });
    }

    /**
     * Handle file download with streaming
     * @param {string} fileId - File identifier
     * @param {Object} downloadOptions - Download options
     * @returns {Promise<Stream>} - File stream
     */
    async downloadFile(fileId, downloadOptions = {}) {
        return this.executeOperation('downloadFile', async () => {
            const {
                response,
                range,
                deleteAfterDownload = false,
                progressCallback
            } = downloadOptions;

            await this.validateParams({ fileId }, {
                fileId: { required: true, type: 'string' }
            });

            const operationId = uuidv4();
            const downloadContext = {
                operationId,
                fileId,
                startTime: Date.now(),
                downloaded: 0,
                status: 'downloading',
                deleteAfterDownload
            };

            this.activeOperations.set(operationId, downloadContext);
            this.downloadSessions.set(fileId, downloadContext);

            try {
                // Get file metadata and validate access
                const fileMetadata = await this.getFileMetadata(fileId);
                if (!fileMetadata) {
                    throw this.createError(`File not found: ${fileId}`, 'FILE_NOT_FOUND');
                }

                downloadContext.fileName = fileMetadata.fileName;
                downloadContext.fileSize = fileMetadata.fileSize;
                downloadContext.filePath = fileMetadata.filePath;

                // Set appropriate headers
                if (response) {
                    await this.setDownloadHeaders(response, fileMetadata);
                }

                // Create file stream
                const fileStream = await this.createFileStream(
                    fileMetadata.filePath,
                    { range }
                );

                // Track download progress
                if (progressCallback) {
                    fileStream.on('data', (chunk) => {
                        downloadContext.downloaded += chunk.length;
                        const progress = {
                            operationId,
                            downloaded: downloadContext.downloaded,
                            total: downloadContext.fileSize,
                            percentage: Math.round(
                                (downloadContext.downloaded / downloadContext.fileSize) * 100
                            )
                        };
                        progressCallback(progress);
                    });
                }

                // Handle stream completion
                fileStream.on('end', async () => {
                    downloadContext.status = 'completed';
                    downloadContext.completedAt = Date.now();
                    downloadContext.duration = downloadContext.completedAt - downloadContext.startTime;

                    this.logSuccess('File download completed', {
                        operationId,
                        fileId,
                        fileName: downloadContext.fileName,
                        downloaded: downloadContext.downloaded,
                        duration: downloadContext.duration
                    });

                    // Handle one-time file deletion
                    if (deleteAfterDownload) {
                        try {
                            await fs.unlink(fileMetadata.filePath);
                            this.log('One-time file deleted after download', { fileId, filePath: fileMetadata.filePath });
                        } catch (error) {
                            this.logError('Failed to delete one-time file', error);
                        }
                    }
                });

                // Handle stream errors
                fileStream.on('error', (error) => {
                    downloadContext.status = 'failed';
                    downloadContext.error = error.message;
                    this.logError('File download stream error', error);
                });

                return fileStream;

            } catch (error) {
                downloadContext.status = 'failed';
                downloadContext.error = error.message;
                throw error;
            } finally {
                // Cleanup after timeout
                setTimeout(() => {
                    this.activeOperations.delete(operationId);
                    this.downloadSessions.delete(fileId);
                }, this.config.downloadTimeout);
            }
        });
    }

    /**
     * Resume interrupted upload
     * @param {string} uploadId - Upload identifier
     * @param {Object} resumeOptions - Resume options
     * @returns {Promise<Object>} - Resume result
     */
    async resumeUpload(uploadId, resumeOptions) {
        return this.executeOperation('resumeUpload', async () => {
            const uploadContext = this.uploadSessions.get(uploadId);
            if (!uploadContext) {
                throw this.createError(`Upload session not found: ${uploadId}`, 'UPLOAD_NOT_FOUND');
            }

            if (uploadContext.status === 'completed') {
                return { message: 'Upload already completed', uploadContext };
            }

            // Resume from last uploaded position
            const { resumeFrom = uploadContext.uploaded, file } = resumeOptions;
            uploadContext.uploaded = resumeFrom;
            uploadContext.status = 'resuming';

            this.log('Resuming upload', {
                uploadId,
                resumeFrom,
                fileName: uploadContext.fileName,
                totalSize: uploadContext.fileSize
            });

            // Continue with chunked upload from resume point
            return await this.handleChunkedUpload(file, uploadContext, resumeOptions.progressCallback);
        });
    }

    /**
     * Cancel ongoing upload/download
     * @param {string} operationId - Operation identifier
     * @returns {Promise<boolean>} - True if cancelled successfully
     */
    async cancelOperation(operationId) {
        return this.executeOperation('cancelOperation', async () => {
            const operation = this.activeOperations.get(operationId);
            if (!operation) {
                return false;
            }

            operation.status = 'cancelled';
            operation.cancelledAt = Date.now();

            // Cleanup resources
            this.activeOperations.delete(operationId);
            
            // Remove from session maps
            if (operation.sessionId) {
                this.uploadSessions.delete(operation.sessionId);
            }
            if (operation.fileId) {
                this.downloadSessions.delete(operation.fileId);
            }

            this.log('Operation cancelled', {
                operationId,
                type: operation.fileId ? 'download' : 'upload',
                fileName: operation.fileName
            });

            return true;
        });
    }

    /**
     * Get upload/download progress
     * @param {string} operationId - Operation identifier
     * @returns {Promise<Object>} - Progress information
     */
    async getProgress(operationId) {
        const operation = this.activeOperations.get(operationId);
        if (!operation) {
            throw this.createError(`Operation not found: ${operationId}`, 'OPERATION_NOT_FOUND');
        }

        const progress = {
            operationId,
            status: operation.status,
            fileName: operation.fileName,
            fileSize: operation.fileSize,
            startTime: operation.startTime
        };

        if (operation.fileId) {
            // Download progress
            progress.type = 'download';
            progress.downloaded = operation.downloaded || 0;
            progress.percentage = operation.fileSize > 0 
                ? Math.round((progress.downloaded / operation.fileSize) * 100) 
                : 0;
        } else {
            // Upload progress
            progress.type = 'upload';
            progress.uploaded = operation.uploaded || 0;
            progress.percentage = operation.fileSize > 0 
                ? Math.round((progress.uploaded / operation.fileSize) * 100) 
                : 0;
        }

        if (operation.completedAt) {
            progress.duration = operation.completedAt - operation.startTime;
        } else {
            progress.duration = Date.now() - operation.startTime;
        }

        return progress;
    }

    /**
     * Validate network request
     * @param {Object} request - Network request
     * @returns {Promise<boolean>} - True if valid
     */
    async validateRequest(request) {
        const requiredFields = ['type'];
        
        for (const field of requiredFields) {
            if (!request[field]) {
                throw this.createError(`Missing required field: ${field}`, 'INVALID_REQUEST');
            }
        }

        if (request.type === 'upload') {
            if (!request.file || !request.sessionId) {
                throw this.createError('Upload requests require file and sessionId', 'INVALID_UPLOAD_REQUEST');
            }
        } else if (request.type === 'download') {
            if (!request.fileId) {
                throw this.createError('Download requests require fileId', 'INVALID_DOWNLOAD_REQUEST');
            }
        }

        return true;
    }

    /**
     * Set download headers for response
     * @param {Object} response - HTTP response object
     * @param {Object} fileMetadata - File metadata
     */
    async setDownloadHeaders(response, fileMetadata) {
        response.setHeader('Content-Type', fileMetadata.mimeType || 'application/octet-stream');
        response.setHeader('Content-Length', fileMetadata.fileSize);
        response.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.fileName}"`);
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
        
        // Add CORS headers if needed
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Headers', 'Range');
        response.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');
    }

    /**
     * Handle chunked upload
     * @param {Object} chunkData - Chunk data
     * @param {Object} uploadContext - Upload context
     * @returns {Promise<Object>} - Chunk upload result
     */
    async uploadChunk(chunkData, uploadContext) {
        const { chunk, chunkIndex, totalChunks } = chunkData;
        const chunkSize = chunk.length;
        
        // Create temporary chunk file
        const chunkPath = path.join(
            this.config.tempPath,
            `${uploadContext.sessionId}_chunk_${chunkIndex}`
        );

        await fs.writeFile(chunkPath, chunk);
        
        uploadContext.uploaded += chunkSize;
        
        this.log('Chunk uploaded', {
            sessionId: uploadContext.sessionId,
            chunkIndex,
            totalChunks,
            chunkSize,
            totalUploaded: uploadContext.uploaded
        });

        return {
            chunkIndex,
            chunkSize,
            chunkPath,
            totalUploaded: uploadContext.uploaded,
            isComplete: chunkIndex === totalChunks - 1
        };
    }

    /**
     * Handle direct file upload (non-chunked)
     * @private
     */
    async handleDirectUpload(file, uploadContext, progressCallback) {
        const filePath = path.join(this.config.tempPath, `${uploadContext.sessionId}_${Date.now()}`);
        
        // Ensure temp directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        
        // Write file
        await fs.writeFile(filePath, file.buffer || file);
        
        uploadContext.uploaded = uploadContext.fileSize;
        
        if (progressCallback) {
            progressCallback({
                operationId: uploadContext.operationId,
                uploaded: uploadContext.uploaded,
                total: uploadContext.fileSize,
                percentage: 100
            });
        }

        return {
            filePath,
            fileSize: uploadContext.fileSize,
            mimeType: uploadContext.mimeType
        };
    }

    /**
     * Handle chunked file upload
     * @private
     */
    async handleChunkedUpload(file, uploadContext, progressCallback) {
        const chunks = Math.ceil(uploadContext.fileSize / this.config.chunkSize);
        const chunkPaths = [];
        
        for (let i = 0; i < chunks; i++) {
            const start = i * this.config.chunkSize;
            const end = Math.min(start + this.config.chunkSize, uploadContext.fileSize);
            const chunk = file.buffer ? file.buffer.slice(start, end) : file.slice(start, end);
            
            const chunkResult = await this.uploadChunk(
                { chunk, chunkIndex: i, totalChunks: chunks },
                uploadContext
            );
            
            chunkPaths.push(chunkResult.chunkPath);
            
            if (progressCallback) {
                progressCallback({
                    operationId: uploadContext.operationId,
                    uploaded: uploadContext.uploaded,
                    total: uploadContext.fileSize,
                    percentage: Math.round((uploadContext.uploaded / uploadContext.fileSize) * 100)
                });
            }
        }

        // Combine chunks into final file
        const finalPath = path.join(this.config.tempPath, `${uploadContext.sessionId}_final`);
        return await this.combineChunks(chunkPaths, finalPath, uploadContext);
    }

    /**
     * Combine chunks into final file
     * @private
     */
    async combineChunks(chunkPaths, finalPath, uploadContext) {
        const writeStream = fsSync.createWriteStream(finalPath);
        
        for (const chunkPath of chunkPaths) {
            const chunkData = await fs.readFile(chunkPath);
            writeStream.write(chunkData);
            
            // Clean up chunk file
            await fs.unlink(chunkPath);
        }
        
        writeStream.end();
        
        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                resolve({
                    filePath: finalPath,
                    fileSize: uploadContext.fileSize,
                    mimeType: uploadContext.mimeType
                });
            });
            
            writeStream.on('error', reject);
        });
    }

    /**
     * Create file stream for download
     * @private
     */
    async createFileStream(filePath, options = {}) {
        const { range } = options;
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            throw this.createError(`File not accessible: ${filePath}`, 'FILE_NOT_ACCESSIBLE');
        }

        const streamOptions = {};
        
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : undefined;
            
            streamOptions.start = start;
            if (end) {
                streamOptions.end = end;
            }
        }

        return fsSync.createReadStream(filePath, streamOptions);
    }

    /**
     * Get file metadata (to be implemented by storage layer)
     * @private
     */
    async getFileMetadata(fileId) {
        // This should be implemented by the storage service
        // For now, return mock metadata
        return {
            fileId,
            fileName: 'unknown',
            fileSize: 0,
            mimeType: 'application/octet-stream',
            filePath: `/path/to/${fileId}`
        };
    }
}

module.exports = NetworkService;
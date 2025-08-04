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
 * FileProcessor - Handles file chunking, processing, and upload coordination
 * 
 * This service follows the Single Responsibility Principle by focusing on
 * file processing logic, separated from UI concerns and network operations.
 */
class FileProcessor {
    constructor(config = {}) {
        this.config = {
            chunkSize: config.chunkSize || 5 * 1024 * 1024, // 5MB default
            maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB default
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };
        
        this.currentProcessing = null;
        this.abortController = null;
    }

    /**
     * Process file for upload with chunking
     * @param {File} file - File to process
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Processing result
     */
    async processFile(file, options = {}) {
        try {
            // Validate file
            await this.validateFile(file);
            
            // Initialize processing session
            const session = this.initializeSession(file, options);
            this.currentProcessing = session;
            
            // Generate chunks
            const chunks = await this.generateChunks(file, session);
            
            // Calculate file hash for integrity
            const fileHash = await this.calculateFileHash(file);
            
            return {
                session,
                chunks,
                fileHash,
                metadata: {
                    originalName: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified,
                    chunkCount: chunks.length,
                    chunkSize: this.config.chunkSize
                }
            };
            
        } catch (error) {
            this.currentProcessing = null;
            throw new Error(`File processing failed: ${error.message}`);
        }
    }

    /**
     * Validate file before processing
     * @param {File} file - File to validate
     * @throws {Error} If validation fails
     */
    async validateFile(file) {
        if (!file) {
            throw new Error('No file provided');
        }

        if (file.size === 0) {
            throw new Error('File is empty');
        }

        if (file.size > this.config.maxFileSize) {
            const maxSizeMB = Math.round(this.config.maxFileSize / (1024 * 1024));
            throw new Error(`File size exceeds maximum limit of ${maxSizeMB}MB`);
        }

        // Check file type if restrictions are configured
        if (this.config.allowedTypes && this.config.allowedTypes.length > 0) {
            const isAllowed = this.config.allowedTypes.some(type => 
                file.type.startsWith(type) || file.name.toLowerCase().endsWith(type)
            );
            
            if (!isAllowed) {
                throw new Error(`File type not allowed: ${file.type}`);
            }
        }

        // Check for blocked file types
        if (this.config.blockedTypes && this.config.blockedTypes.length > 0) {
            const isBlocked = this.config.blockedTypes.some(type => 
                file.type.startsWith(type) || file.name.toLowerCase().endsWith(type)
            );
            
            if (isBlocked) {
                throw new Error(`File type blocked: ${file.type}`);
            }
        }
    }

    /**
     * Initialize processing session
     * @param {File} file - File being processed
     * @param {Object} options - Processing options
     * @returns {Object} Session object
     */
    initializeSession(file, options) {
        return {
            id: this.generateSessionId(),
            file,
            options,
            startTime: Date.now(),
            status: 'initialized',
            progress: {
                chunksProcessed: 0,
                totalChunks: 0,
                bytesProcessed: 0,
                totalBytes: file.size,
                percentage: 0
            },
            retries: {},
            errors: []
        };
    }

    /**
     * Generate file chunks for upload
     * @param {File} file - File to chunk
     * @param {Object} session - Processing session
     * @returns {Promise<Array>} Array of chunk objects
     */
    async generateChunks(file, session) {
        const chunks = [];
        const totalChunks = Math.ceil(file.size / this.config.chunkSize);
        session.progress.totalChunks = totalChunks;

        for (let i = 0; i < totalChunks; i++) {
            this.checkAborted();
            
            const start = i * this.config.chunkSize;
            const end = Math.min(start + this.config.chunkSize, file.size);
            const blob = file.slice(start, end);
            
            const chunk = {
                index: i,
                start,
                end,
                size: blob.size,
                blob,
                hash: await this.calculateChunkHash(blob),
                status: 'ready',
                retries: 0
            };
            
            chunks.push(chunk);
            
            // Update progress
            session.progress.chunksProcessed = i + 1;
            session.progress.percentage = (session.progress.chunksProcessed / totalChunks) * 100;
        }

        return chunks;
    }

    /**
     * Calculate hash for entire file
     * @param {File} file - File to hash
     * @returns {Promise<string>} File hash
     */
    async calculateFileHash(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Calculate hash for chunk
     * @param {Blob} blob - Chunk blob to hash
     * @returns {Promise<string>} Chunk hash
     */
    async calculateChunkHash(blob) {
        const buffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Upload chunk with retry logic
     * @param {Object} chunk - Chunk to upload
     * @param {string} uploadUrl - URL to upload to
     * @param {Object} session - Processing session
     * @returns {Promise<Object>} Upload result
     */
    async uploadChunk(chunk, uploadUrl, session) {
        let lastError = null;
        
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            this.checkAborted();
            
            try {
                const result = await this.performChunkUpload(chunk, uploadUrl, session, attempt);
                chunk.status = 'completed';
                return result;
                
            } catch (error) {
                lastError = error;
                chunk.retries = attempt + 1;
                chunk.status = 'error';
                
                // Add to session errors
                session.errors.push({
                    chunkIndex: chunk.index,
                    attempt: attempt + 1,
                    error: error.message,
                    timestamp: Date.now()
                });
                
                // If not the last attempt, wait before retrying
                if (attempt < this.config.maxRetries) {
                    const delay = this.config.retryDelay * Math.pow(2, attempt);
                    await this.delay(delay);
                    chunk.status = 'retrying';
                }
            }
        }
        
        throw new Error(`Chunk upload failed after ${this.config.maxRetries + 1} attempts: ${lastError.message}`);
    }

    /**
     * Perform actual chunk upload
     * @param {Object} chunk - Chunk to upload
     * @param {string} uploadUrl - Upload URL
     * @param {Object} session - Processing session
     * @param {number} attempt - Current attempt number
     * @returns {Promise<Object>} Upload response
     */
    async performChunkUpload(chunk, uploadUrl, session, attempt) {
        const formData = new FormData();
        formData.append('chunk', chunk.blob);
        formData.append('chunkIndex', chunk.index.toString());
        formData.append('chunkHash', chunk.hash);
        formData.append('sessionId', session.id);
        formData.append('attempt', attempt.toString());

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
            signal: this.abortController?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Resume processing from a previous session
     * @param {Object} sessionData - Previous session data
     * @param {File} file - Original file
     * @returns {Promise<Object>} Resumed session
     */
    async resumeProcessing(sessionData, file) {
        // Validate file matches previous session
        if (sessionData.metadata?.size !== file.size || 
            sessionData.metadata?.lastModified !== file.lastModified) {
            throw new Error('File has changed since last session');
        }

        // Recreate session
        const session = {
            ...sessionData,
            file,
            status: 'resumed',
            resumedAt: Date.now()
        };

        this.currentProcessing = session;
        return session;
    }

    /**
     * Abort current processing
     */
    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
        
        if (this.currentProcessing) {
            this.currentProcessing.status = 'aborted';
            this.currentProcessing.abortedAt = Date.now();
        }
    }

    /**
     * Get current processing status
     * @returns {Object|null} Current session or null
     */
    getCurrentStatus() {
        return this.currentProcessing ? {
            ...this.currentProcessing,
            // Exclude file object from status to avoid circular references
            file: {
                name: this.currentProcessing.file.name,
                size: this.currentProcessing.file.size,
                type: this.currentProcessing.file.type
            }
        } : null;
    }

    /**
     * Check if processing is currently active
     * @returns {boolean} True if processing
     */
    isProcessing() {
        return this.currentProcessing && 
               ['initialized', 'processing', 'uploading'].includes(this.currentProcessing.status);
    }

    /**
     * Utility methods
     */
    
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    checkAborted() {
        if (this.abortController?.signal.aborted) {
            throw new Error('Processing aborted');
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Set abort controller for cancellation
     * @param {AbortController} controller - Abort controller
     */
    setAbortController(controller) {
        this.abortController = controller;
    }

    /**
     * Update configuration
     * @param {Object} newConfig - New configuration options
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}

module.exports = FileProcessor;
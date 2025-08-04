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

const EventBus = require('./EventBus');
const UIController = require('./UIController');
const FileProcessor = require('./FileProcessor');
const EncryptionService = require('./EncryptionService');
const UploadValidator = require('./UploadValidator');

/**
 * RefactoredFileUploadManager - Orchestrates file upload using dependency injection
 * 
 * This refactored version follows SOLID principles:
 * - Single Responsibility: Orchestrates components, doesn't do everything
 * - Open/Closed: Extensible through strategy injection
 * - Liskov Substitution: Components are interchangeable
 * - Interface Segregation: Clean interfaces between components
 * - Dependency Inversion: Depends on abstractions, not concretions
 */
class RefactoredFileUploadManager {
    constructor(dependencies = {}) {
        // Dependency injection - allows for testing and flexibility
        this.eventBus = dependencies.eventBus || new EventBus();
        this.uiController = dependencies.uiController || new UIController(this.eventBus);
        this.fileProcessor = dependencies.fileProcessor || new FileProcessor();
        this.encryptionService = dependencies.encryptionService || new EncryptionService();
        this.uploadValidator = dependencies.uploadValidator || new UploadValidator();
        
        // Configuration
        this.config = {
            apiBaseUrl: dependencies.apiBaseUrl || '/api',
            enableEncryption: dependencies.enableEncryption !== false,
            enableResume: dependencies.enableResume !== false,
            ...dependencies.config
        };

        // State management
        this.state = {
            currentUpload: null,
            uploadQueue: [],
            isInitialized: false
        };

        this.init();
    }

    /**
     * Initialize the upload manager
     */
    async init() {
        if (this.state.isInitialized) {
            return;
        }

        try {
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize dependencies
            await this.initializeDependencies();
            
            this.state.isInitialized = true;
            this.eventBus.emit('manager:initialized');
            
        } catch (error) {
            console.error('Failed to initialize FileUploadManager:', error);
            this.eventBus.emit('manager:error', { 
                type: 'initialization', 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Setup event listeners for coordinating between components
     */
    setupEventListeners() {
        // File selection events
        this.eventBus.on('file:selected', async (data) => {
            await this.handleFileSelected(data.file);
        });

        this.eventBus.on('file:reset', () => {
            this.handleFileReset();
        });

        // Upload control events
        this.eventBus.on('upload:start', async (options) => {
            await this.handleUploadStart(options);
        });

        this.eventBus.on('upload:cancel', () => {
            this.handleUploadCancel();
        });

        this.eventBus.on('upload:pause', () => {
            this.handleUploadPause();
        });

        this.eventBus.on('upload:resume', () => {
            this.handleUploadResume();
        });

        // Progress and status events
        this.eventBus.on('chunk:uploaded', (data) => {
            this.handleChunkUploaded(data);
        });

        this.eventBus.on('chunk:failed', (data) => {
            this.handleChunkFailed(data);
        });
    }

    /**
     * Initialize dependencies if needed
     */
    async initializeDependencies() {
        // Initialize encryption service if enabled
        if (this.config.enableEncryption && this.encryptionService.init) {
            await this.encryptionService.init();
        }

        // Initialize validator
        if (this.uploadValidator.init) {
            await this.uploadValidator.init();
        }
    }

    /**
     * Handle file selection
     */
    async handleFileSelected(file) {
        try {
            // Validate file
            await this.uploadValidator.validateFile(file);
            
            // Process file for upload preparation
            const processingResult = await this.fileProcessor.processFile(file, {
                enableEncryption: this.config.enableEncryption
            });

            // Update state
            this.state.currentUpload = {
                file,
                processingResult,
                status: 'ready',
                createdAt: Date.now()
            };

            this.eventBus.emit('file:validated', { 
                file, 
                processingResult 
            });

        } catch (error) {
            this.eventBus.emit('file:validation:error', { 
                file, 
                error: error.message 
            });
        }
    }

    /**
     * Handle file reset
     */
    handleFileReset() {
        if (this.state.currentUpload) {
            // Cancel any ongoing processing
            this.fileProcessor.abort();
            
            // Clear state
            this.state.currentUpload = null;
            
            this.eventBus.emit('upload:reset');
        }
    }

    /**
     * Handle upload start
     */
    async handleUploadStart(options) {
        if (!this.state.currentUpload) {
            this.eventBus.emit('upload:error', { 
                error: new Error('No file selected for upload') 
            });
            return;
        }

        try {
            const upload = this.state.currentUpload;
            upload.status = 'uploading';
            upload.startedAt = Date.now();
            upload.abortController = new AbortController();

            // Set abort controller for processor
            this.fileProcessor.setAbortController(upload.abortController);

            // Start upload process
            await this.performUpload(upload, options);

        } catch (error) {
            this.eventBus.emit('upload:error', { error });
        }
    }

    /**
     * Perform the actual upload process
     */
    async performUpload(upload, options) {
        const { file, processingResult } = upload;
        const { chunks, metadata, fileHash } = processingResult;

        try {
            // Initialize upload session with server
            const session = await this.initializeUploadSession(metadata, fileHash, options);
            upload.sessionId = session.id;

            this.eventBus.emit('upload:session:created', { session });

            // Upload chunks
            const uploadResults = await this.uploadChunks(chunks, session, upload);

            // Complete upload
            const completionResult = await this.completeUpload(session, uploadResults);

            // Update state
            upload.status = 'completed';
            upload.completedAt = Date.now();
            upload.result = completionResult;

            this.eventBus.emit('upload:complete', completionResult);

        } catch (error) {
            upload.status = 'error';
            upload.error = error.message;
            upload.errorAt = Date.now();

            this.eventBus.emit('upload:error', { error });
            throw error;
        }
    }

    /**
     * Initialize upload session with server
     */
    async initializeUploadSession(metadata, fileHash, options) {
        const sessionData = {
            filename: metadata.originalName,
            filesize: metadata.size,
            mimetype: metadata.type,
            fileHash,
            chunkCount: metadata.chunkCount,
            chunkSize: metadata.chunkSize,
            password: options.password,
            enableEncryption: this.config.enableEncryption
        };

        const response = await fetch(`${this.config.apiBaseUrl}/upload/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sessionData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to initialize upload session: ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Upload all chunks
     */
    async uploadChunks(chunks, session, upload) {
        const results = [];
        let uploadedBytes = 0;
        const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            try {
                // Check if upload was cancelled
                if (upload.abortController.signal.aborted) {
                    throw new Error('Upload cancelled');
                }

                // Upload chunk
                const result = await this.fileProcessor.uploadChunk(
                    chunk, 
                    `${this.config.apiBaseUrl}/upload/chunk`, 
                    session
                );

                results.push(result);
                uploadedBytes += chunk.size;

                // Update progress with proper bounds checking and consistent rounding
                const progressRaw = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;
                const progress = Math.min(100, Math.max(0, Math.round(progressRaw * 10) / 10)); // Round to 1 decimal
                
                this.eventBus.emit('upload:progress', { 
                    progress, 
                    chunkIndex: i,
                    totalChunks: chunks.length,
                    uploadedBytes,
                    totalBytes,
                    message: `Uploading chunk ${i + 1} of ${chunks.length}...`
                });

                this.eventBus.emit('chunk:uploaded', { 
                    chunkIndex: i, 
                    result 
                });

            } catch (error) {
                this.eventBus.emit('chunk:failed', { 
                    chunkIndex: i, 
                    error: error.message 
                });
                throw error;
            }
        }

        return results;
    }

    /**
     * Complete upload process
     */
    async completeUpload(session, uploadResults) {
        const completionData = {
            sessionId: session.id,
            chunkResults: uploadResults.map(r => ({
                index: r.chunkIndex,
                hash: r.hash,
                size: r.size
            }))
        };

        const response = await fetch(`${this.config.apiBaseUrl}/upload/complete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(completionData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to complete upload: ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Handle upload cancellation
     */
    handleUploadCancel() {
        if (this.state.currentUpload && this.state.currentUpload.abortController) {
            this.state.currentUpload.abortController.abort();
            this.state.currentUpload.status = 'cancelled';
            this.state.currentUpload.cancelledAt = Date.now();
            
            this.eventBus.emit('upload:cancelled');
        }
    }

    /**
     * Handle upload pause (if supported)
     */
    handleUploadPause() {
        // Implementation would depend on server support for pausing
        if (this.state.currentUpload) {
            this.state.currentUpload.status = 'paused';
            this.state.currentUpload.pausedAt = Date.now();
            
            this.eventBus.emit('upload:paused');
        }
    }

    /**
     * Handle upload resume (if supported)
     */
    handleUploadResume() {
        // Implementation would depend on server support for resuming
        if (this.state.currentUpload && this.state.currentUpload.status === 'paused') {
            this.state.currentUpload.status = 'uploading';
            this.state.currentUpload.resumedAt = Date.now();
            
            this.eventBus.emit('upload:resumed');
        }
    }

    /**
     * Handle successful chunk upload
     */
    handleChunkUploaded(data) {
        // Could be used for additional processing or logging
        console.log(`Chunk ${data.chunkIndex} uploaded successfully`);
    }

    /**
     * Handle failed chunk upload
     */
    handleChunkFailed(data) {
        console.error(`Chunk ${data.chunkIndex} failed:`, data.error);
    }

    /**
     * Get current upload status
     */
    getStatus() {
        return {
            isInitialized: this.state.isInitialized,
            currentUpload: this.state.currentUpload ? {
                status: this.state.currentUpload.status,
                progress: this.fileProcessor.getCurrentStatus()?.progress || null,
                file: this.state.currentUpload.file ? {
                    name: this.state.currentUpload.file.name,
                    size: this.state.currentUpload.file.size,
                    type: this.state.currentUpload.file.type
                } : null
            } : null,
            queueLength: this.state.uploadQueue.length,
            config: this.config
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Update dependencies if needed
        if (this.fileProcessor.updateConfig) {
            this.fileProcessor.updateConfig(newConfig);
        }

        this.eventBus.emit('config:updated', { config: this.config });
    }

    /**
     * Destroy the upload manager and cleanup resources
     */
    destroy() {
        // Cancel any ongoing uploads
        this.handleUploadCancel();
        
        // Remove all event listeners
        this.eventBus.removeAllListeners();
        
        // Clear state
        this.state = {
            currentUpload: null,
            uploadQueue: [],
            isInitialized: false
        };

        this.eventBus.emit('manager:destroyed');
    }

    /**
     * Enable debug mode
     */
    enableDebug() {
        this.eventBus.setDebugging(true);
        console.log('FileUploadManager debug mode enabled');
    }

    /**
     * Disable debug mode
     */
    disableDebug() {
        this.eventBus.setDebugging(false);
        console.log('FileUploadManager debug mode disabled');
    }

    /**
     * Get statistics about the upload manager
     */
    getStats() {
        return {
            ...this.getStatus(),
            eventBus: this.eventBus.getStats(),
            fileProcessor: this.fileProcessor.getConfig()
        };
    }
}

// Factory function for easier instantiation
RefactoredFileUploadManager.create = function(config = {}) {
    return new RefactoredFileUploadManager(config);
};

module.exports = RefactoredFileUploadManager;
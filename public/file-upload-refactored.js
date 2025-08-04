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
 * Refactored File Upload Client Integration
 * 
 * This file demonstrates how to use the refactored SOLID-compliant
 * file upload system in a browser environment. It replaces the monolithic
 * FileUploadManager with a properly architected solution.
 */

// Note: In a real implementation, these would be loaded via modules or bundling
// For now, we'll assume they're loaded in the global scope

class FileUploadApp {
    constructor() {
        this.uploadManager = null;
        this.init();
    }

    async init() {
        try {
            // Initialize the refactored upload manager with configuration
            this.uploadManager = RefactoredFileUploadManager.create({
                apiBaseUrl: '/api',
                enableEncryption: true,
                enableResume: true,
                config: {
                    chunkSize: 5 * 1024 * 1024, // 5MB chunks
                    maxFileSize: 100 * 1024 * 1024, // 100MB max
                    maxRetries: 3,
                    retryDelay: 1000
                }
            });

            // Setup application-level event listeners
            this.setupAppEventListeners();

            // Initialize the manager
            await this.uploadManager.init();

            console.log('File upload system initialized successfully');

        } catch (error) {
            console.error('Failed to initialize file upload system:', error);
            this.showError('Failed to initialize upload system');
        }
    }

    setupAppEventListeners() {
        const eventBus = this.uploadManager.eventBus;

        // Listen for manager initialization
        eventBus.on('manager:initialized', () => {
            console.log('Upload manager ready');
            this.showStatus('Upload system ready');
        });

        // Listen for upload progress
        eventBus.on('upload:progress', (data) => {
            this.updateGlobalProgress(data);
        });

        // Listen for upload completion
        eventBus.on('upload:complete', (result) => {
            this.handleUploadSuccess(result);
        });

        // Listen for upload errors
        eventBus.on('upload:error', (data) => {
            this.handleUploadError(data.error);
        });

        // Listen for file validation errors
        eventBus.on('file:validation:error', (data) => {
            this.handleValidationError(data.error);
        });

        // Listen for upload cancellation
        eventBus.on('upload:cancelled', () => {
            this.handleUploadCancelled();
        });

        // Debug mode for development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.uploadManager.enableDebug();
        }
    }

    updateGlobalProgress(data) {
        // Update any global progress indicators
        const globalProgressBar = document.getElementById('global-progress-bar');
        if (globalProgressBar) {
            globalProgressBar.style.width = `${data.progress}%`;
        }

        const globalProgressText = document.getElementById('global-progress-text');
        if (globalProgressText) {
            globalProgressText.textContent = data.message || `${Math.round(data.progress)}% complete`;
        }

        // Update browser title with progress
        if (data.progress > 0 && data.progress < 100) {
            document.title = `(${Math.round(data.progress)}%) Qopy - Upload in progress`;
        } else if (data.progress === 100) {
            document.title = 'Qopy - Upload complete';
        }
    }

    handleUploadSuccess(result) {
        console.log('Upload completed successfully:', result);
        
        // Show success message
        this.showSuccess('File uploaded successfully!');
        
        // Reset title
        document.title = 'Qopy - Secure File Sharing';
        
        // Show share link if available
        if (result.shareUrl) {
            this.showShareResult(result);
        }

        // Analytics or logging
        this.trackUploadSuccess(result);
    }

    handleUploadError(error) {
        console.error('Upload failed:', error);
        
        // Show user-friendly error message
        this.showError(`Upload failed: ${error.message}`);
        
        // Reset title
        document.title = 'Qopy - Secure File Sharing';
        
        // Analytics or logging
        this.trackUploadError(error);
    }

    handleValidationError(error) {
        console.warn('File validation failed:', error);
        this.showError(`File validation failed: ${error}`);
    }

    handleUploadCancelled() {
        console.log('Upload was cancelled');
        this.showStatus('Upload cancelled');
        
        // Reset title
        document.title = 'Qopy - Secure File Sharing';
    }

    showShareResult(result) {
        // Create or update share result display
        const shareSection = document.getElementById('share-result') || this.createShareSection();
        
        shareSection.innerHTML = `
            <div class="share-success">
                <h3>Upload Complete!</h3>
                <div class="share-link-container">
                    <label>Share Link:</label>
                    <div class="share-link-input">
                        <input type="text" value="${result.shareUrl}" readonly>
                        <button onclick="this.select(); document.execCommand('copy'); this.nextElementSibling.textContent='Copied!'">Copy</button>
                        <span class="copy-feedback"></span>
                    </div>
                </div>
                ${result.accessCode ? `
                    <div class="access-code-container">
                        <label>Access Code:</label>
                        <code>${result.accessCode}</code>
                    </div>
                ` : ''}
                <div class="share-options">
                    <button onclick="window.open('${result.shareUrl}', '_blank')">Test Link</button>
                    <button onclick="this.shareViaEmail('${result.shareUrl}')">Share via Email</button>
                </div>
            </div>
        `;
        
        shareSection.style.display = 'block';
    }

    createShareSection() {
        const section = document.createElement('div');
        section.id = 'share-result';
        section.className = 'share-result-section';
        
        // Insert after upload section or at end of main content
        const uploadSection = document.querySelector('.upload-section');
        if (uploadSection) {
            uploadSection.parentNode.insertBefore(section, uploadSection.nextSibling);
        } else {
            document.body.appendChild(section);
        }
        
        return section;
    }

    shareViaEmail(shareUrl) {
        const subject = encodeURIComponent('File shared via Qopy');
        const body = encodeURIComponent(`I've shared a file with you via Qopy:\n\n${shareUrl}\n\nThis link is secure and encrypted.`);
        window.open(`mailto:?subject=${subject}&body=${body}`);
    }

    showStatus(message, type = 'info') {
        this.showMessage(message, type, 3000);
    }

    showSuccess(message) {
        this.showMessage(message, 'success', 5000);
    }

    showError(message) {
        this.showMessage(message, 'error', 7000);
    }

    showMessage(message, type = 'info', duration = 3000) {
        // Create or update global message display
        let messageContainer = document.getElementById('global-messages');
        if (!messageContainer) {
            messageContainer = document.createElement('div');
            messageContainer.id = 'global-messages';
            messageContainer.className = 'global-messages';
            document.body.appendChild(messageContainer);
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message message-${type}`;
        messageElement.textContent = message;
        
        messageContainer.appendChild(messageElement);

        // Auto remove after duration
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, duration);
    }

    trackUploadSuccess(result) {
        // Analytics tracking for successful uploads
        if (window.gtag) {
            window.gtag('event', 'upload_success', {
                file_size: result.fileSize,
                file_type: result.fileType,
                upload_duration: result.uploadDuration
            });
        }
    }

    trackUploadError(error) {
        // Analytics tracking for upload errors
        if (window.gtag) {
            window.gtag('event', 'upload_error', {
                error_message: error.message,
                error_type: error.constructor.name
            });
        }
    }

    // Public API methods for external control
    getStatus() {
        return this.uploadManager ? this.uploadManager.getStatus() : null;
    }

    cancelUpload() {
        if (this.uploadManager) {
            this.uploadManager.eventBus.emit('upload:cancel');
        }
    }

    pauseUpload() {
        if (this.uploadManager) {
            this.uploadManager.eventBus.emit('upload:pause');
        }
    }

    resumeUpload() {
        if (this.uploadManager) {
            this.uploadManager.eventBus.emit('upload:resume');
        }
    }

    enableDebug() {
        if (this.uploadManager) {
            this.uploadManager.enableDebug();
        }
    }

    disableDebug() {
        if (this.uploadManager) {
            this.uploadManager.disableDebug();
        }
    }

    getStats() {
        return this.uploadManager ? this.uploadManager.getStats() : null;
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.fileUploadApp = new FileUploadApp();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileUploadApp;
}
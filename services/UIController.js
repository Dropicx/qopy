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
 * UIController - Handles UI state management and DOM interactions
 * 
 * This service follows the Single Responsibility Principle by focusing solely
 * on UI concerns, separated from business logic and file processing.
 */
class UIController {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.elements = {};
        this.state = {
            currentFile: null,
            uploadState: 'idle', // idle, uploading, paused, completed, error
            progress: 0
        };
        
        this.init();
    }

    /**
     * Initialize UI controller and cache DOM elements
     */
    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.setupDropZone();
        this.bindEventBusHandlers();
    }

    /**
     * Cache frequently used DOM elements
     */
    cacheElements() {
        this.elements = {
            fileInput: document.getElementById('file-input'),
            uploadButton: document.getElementById('file-upload-button'),
            cancelButton: document.getElementById('cancel-upload-button'),
            cancelButtonProgress: document.getElementById('cancel-upload-button-progress'),
            resetButton: document.getElementById('file-reset-button'),
            passwordCheckbox: document.getElementById('file-password-checkbox'),
            passwordSection: document.getElementById('file-password-section'),
            passwordInput: document.getElementById('file-password-input'),
            dropZone: document.getElementById('file-drop-zone'),
            progressBar: document.getElementById('upload-progress-bar'),
            progressText: document.getElementById('upload-progress-text'),
            statusMessage: document.getElementById('upload-status-message'),
            fileInfo: document.getElementById('selected-file-info')
        };
    }

    /**
     * Setup DOM event listeners
     */
    setupEventListeners() {
        // File input change
        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelection(e.target.files[0]);
                }
            });
        }

        // Upload button
        if (this.elements.uploadButton) {
            this.elements.uploadButton.addEventListener('click', () => {
                this.startUpload();
            });
        }

        // Cancel buttons
        [this.elements.cancelButton, this.elements.cancelButtonProgress].forEach(button => {
            if (button) {
                button.addEventListener('click', () => {
                    this.cancelUpload();
                });
            }
        });

        // Reset button
        if (this.elements.resetButton) {
            this.elements.resetButton.addEventListener('click', () => {
                this.resetFileSelection();
            });
        }

        // Password checkbox
        if (this.elements.passwordCheckbox && this.elements.passwordSection) {
            this.elements.passwordCheckbox.addEventListener('change', () => {
                this.togglePasswordSection();
            });
        }
    }

    /**
     * Setup drag and drop functionality
     */
    setupDropZone() {
        const dropZone = this.elements.dropZone;
        if (!dropZone) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        // Highlight drop zone when dragging
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => this.highlight(dropZone), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => this.unhighlight(dropZone), false);
        });

        // Handle dropped files
        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelection(files[0]);
            }
        }, false);
    }

    /**
     * Bind event bus handlers for external events
     */
    bindEventBusHandlers() {
        this.eventBus.on('upload:progress', (data) => {
            this.updateProgress(data.progress, data.message);
        });

        this.eventBus.on('upload:complete', (data) => {
            this.handleUploadComplete(data);
        });

        this.eventBus.on('upload:error', (error) => {
            this.handleUploadError(error);
        });

        this.eventBus.on('upload:cancelled', () => {
            this.handleUploadCancelled();
        });

        this.eventBus.on('file:validation:error', (error) => {
            this.showValidationError(error.message);
        });
    }

    /**
     * Handle file selection from input or drag-drop
     */
    handleFileSelection(file) {
        this.state.currentFile = file;
        this.eventBus.emit('file:selected', { file });
        this.updateFileInfo(file);
        this.updateUploadState('ready');
    }

    /**
     * Start upload process
     */
    startUpload() {
        if (!this.state.currentFile) {
            this.showError('No file selected');
            return;
        }

        const uploadOptions = {
            file: this.state.currentFile,
            password: this.elements.passwordCheckbox?.checked ? 
                     this.elements.passwordInput?.value : null
        };

        this.updateUploadState('uploading');
        this.eventBus.emit('upload:start', uploadOptions);
    }

    /**
     * Cancel current upload
     */
    cancelUpload() {
        this.eventBus.emit('upload:cancel');
        this.updateUploadState('cancelled');
    }

    /**
     * Reset file selection
     */
    resetFileSelection() {
        this.state.currentFile = null;
        this.elements.fileInput.value = '';
        this.updateUploadState('idle');
        this.clearFileInfo();
        this.clearProgress();
        this.eventBus.emit('file:reset');
    }

    /**
     * Toggle password section visibility
     */
    togglePasswordSection() {
        if (this.elements.passwordCheckbox.checked) {
            this.elements.passwordSection.style.display = 'block';
            this.elements.passwordInput?.focus();
        } else {
            this.elements.passwordSection.style.display = 'none';
        }
    }

    /**
     * Update upload progress
     */
    updateProgress(progress, message = '') {
        this.state.progress = progress;
        
        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = `${progress}%`;
        }
        
        if (this.elements.progressText) {
            this.elements.progressText.textContent = `${Math.round(progress)}%`;
        }
        
        if (message && this.elements.statusMessage) {
            this.elements.statusMessage.textContent = message;
        }
    }

    /**
     * Update upload state and UI accordingly
     */
    updateUploadState(newState) {
        const previousState = this.state.uploadState;
        this.state.uploadState = newState;
        
        this.updateUIForState(newState, previousState);
        this.eventBus.emit('ui:state:changed', { 
            newState, 
            previousState, 
            progress: this.state.progress 
        });
    }

    /**
     * Update UI elements based on current state
     */
    updateUIForState(state, previousState = null) {
        const elements = this.elements;
        
        switch (state) {
            case 'idle':
                this.setElementVisibility(elements.uploadButton, false);
                this.setElementVisibility(elements.cancelButton, false);
                this.setElementVisibility(elements.resetButton, false);
                this.clearProgress();
                this.clearStatusMessage();
                break;
                
            case 'ready':
                this.setElementVisibility(elements.uploadButton, true);
                this.setElementVisibility(elements.cancelButton, false);
                this.setElementVisibility(elements.resetButton, true);
                this.showStatusMessage('File ready for upload');
                break;
                
            case 'uploading':
                this.setElementVisibility(elements.uploadButton, false);
                this.setElementVisibility(elements.cancelButton, true);
                this.setElementVisibility(elements.resetButton, false);
                this.showStatusMessage('Uploading...');
                break;
                
            case 'completed':
                this.setElementVisibility(elements.uploadButton, false);
                this.setElementVisibility(elements.cancelButton, false);
                this.setElementVisibility(elements.resetButton, true);
                this.showStatusMessage('Upload completed successfully!', 'success');
                break;
                
            case 'error':
                this.setElementVisibility(elements.uploadButton, true);
                this.setElementVisibility(elements.cancelButton, false);
                this.setElementVisibility(elements.resetButton, true);
                break;
                
            case 'cancelled':
                this.setElementVisibility(elements.uploadButton, true);
                this.setElementVisibility(elements.cancelButton, false);
                this.setElementVisibility(elements.resetButton, true);
                this.showStatusMessage('Upload cancelled');
                break;
        }
    }

    /**
     * Handle upload completion
     */
    handleUploadComplete(data) {
        this.updateUploadState('completed');
        this.updateProgress(100, 'Upload complete!');
        
        // Show success message with share link if available
        if (data.shareUrl) {
            this.showShareLink(data.shareUrl);
        }
    }

    /**
     * Handle upload error
     */
    handleUploadError(error) {
        this.updateUploadState('error');
        this.showError(error.message || 'Upload failed');
    }

    /**
     * Handle upload cancellation
     */
    handleUploadCancelled() {
        this.updateUploadState('cancelled');
        this.clearProgress();
    }

    /**
     * Update file information display
     */
    updateFileInfo(file) {
        if (!this.elements.fileInfo) return;
        
        const sizeFormatted = this.formatFileSize(file.size);
        this.elements.fileInfo.innerHTML = `
            <div class="file-details">
                <strong>${file.name}</strong><br>
                <span class="file-size">${sizeFormatted}</span> • 
                <span class="file-type">${file.type || 'Unknown type'}</span>
            </div>
        `;
    }

    /**
     * Clear file information display
     */
    clearFileInfo() {
        if (this.elements.fileInfo) {
            this.elements.fileInfo.innerHTML = '';
        }
    }

    /**
     * Clear progress indicators
     */
    clearProgress() {
        this.updateProgress(0, '');
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showStatusMessage(message, 'error');
    }

    /**
     * Show validation error
     */
    showValidationError(message) {
        this.showError(`Validation Error: ${message}`);
    }

    /**
     * Show status message
     */
    showStatusMessage(message, type = 'info') {
        if (!this.elements.statusMessage) return;
        
        this.elements.statusMessage.textContent = message;
        this.elements.statusMessage.className = `status-message ${type}`;
    }

    /**
     * Clear status message
     */
    clearStatusMessage() {
        if (this.elements.statusMessage) {
            this.elements.statusMessage.textContent = '';
            this.elements.statusMessage.className = 'status-message';
        }
    }

    /**
     * Show share link after successful upload
     */
    showShareLink(shareUrl) {
        // This could be enhanced to show a modal or dedicated section
        this.showStatusMessage(`Share link: ${shareUrl}`, 'success');
    }

    /**
     * Utility methods
     */
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    highlight(element) {
        element.classList.add('drag-over');
    }

    unhighlight(element) {
        element.classList.remove('drag-over');
    }

    setElementVisibility(element, visible) {
        if (element) {
            element.style.display = visible ? 'block' : 'none';
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Get current UI state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Get current file
     */
    getCurrentFile() {
        return this.state.currentFile;
    }

    /**
     * Check if upload is in progress
     */
    isUploading() {
        return this.state.uploadState === 'uploading';
    }
}

module.exports = UIController;
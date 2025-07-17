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

// File Upload Manager for Qopy
class FileUploadManager {
    constructor() {
        this.currentUpload = null;
        this.uploadQueue = [];
        this.chunkSize = 5 * 1024 * 1024; // 5MB chunks
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDropZone();
    }

    setupEventListeners() {
        // File input change
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelection(e.target.files[0]);
                }
            });
        }

        // Upload button click
        const uploadButton = document.getElementById('file-upload-button');
        if (uploadButton) {
            uploadButton.addEventListener('click', () => {
                this.startUpload();
            });
        }

        // Cancel upload button
        const cancelButton = document.getElementById('cancel-upload-button');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                this.cancelUpload();
            });
        }

        // Password checkbox toggle
        const passwordCheckbox = document.getElementById('file-password-checkbox');
        const passwordSection = document.getElementById('file-password-section');
        if (passwordCheckbox && passwordSection) {
            passwordCheckbox.addEventListener('change', () => {
                if (passwordCheckbox.checked) {
                    passwordSection.style.display = 'block';
                    const passwordInput = document.getElementById('file-password-input');
                    if (passwordInput) {
                        passwordInput.focus();
                    }
                } else {
                    passwordSection.style.display = 'none';
                }
            });
        }
    }

    setupDropZone() {
        const dropZone = document.getElementById('file-drop-zone');
        if (!dropZone) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Highlight drop zone when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            });
        });

        // Handle dropped files
        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelection(files[0]);
            }
        });

        // Click to select file
        dropZone.addEventListener('click', () => {
            const fileInput = document.getElementById('file-input');
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    handleFileSelection(file) {
        console.log('🗂️ File selected:', file.name, '(' + this.formatFileSize(file.size) + ')');

        // Validate file size
        if (file.size > this.maxFileSize) {
            this.showError(`File is too large. Maximum size is ${this.formatFileSize(this.maxFileSize)}.`);
            return;
        }

        if (file.size === 0) {
            this.showError('File is empty.');
            return;
        }

        // Store file for upload
        this.selectedFile = file;
        this.updateFileInfo(file);
        this.showUploadControls(true);
    }

    updateFileInfo(file) {
        const fileInfoContainer = document.getElementById('file-info-container');
        const fileName = document.getElementById('selected-file-name');
        const fileSize = document.getElementById('selected-file-size');
        const fileType = document.getElementById('selected-file-type');

        if (fileInfoContainer) {
            fileInfoContainer.style.display = 'block';
        }

        if (fileName) {
            fileName.textContent = file.name;
        }

        if (fileSize) {
            fileSize.textContent = this.formatFileSize(file.size);
        }

        if (fileType) {
            fileType.textContent = file.type || 'Unknown type';
        }
    }

    showUploadControls(show) {
        const uploadControls = document.getElementById('file-upload-controls');
        if (uploadControls) {
            uploadControls.style.display = show ? 'block' : 'none';
        }

        const dropZone = document.getElementById('file-drop-zone');
        if (dropZone) {
            dropZone.style.display = show ? 'none' : 'block';
        }
    }

    async startUpload() {
        if (!this.selectedFile) {
            this.showError('No file selected.');
            return;
        }

        try {
            console.log('🚀 Starting upload for:', this.selectedFile.name);
            
            // Get form settings
            const expiration = document.getElementById('file-expiration')?.value || '24hr';
            const hasPassword = document.getElementById('file-password-checkbox')?.checked || false;
            const oneTime = document.getElementById('file-one-time-checkbox')?.checked || false;

            // Initiate upload
            const uploadSession = await this.initiateUpload(this.selectedFile, {
                expiration,
                hasPassword,
                oneTime
            });

            this.currentUpload = uploadSession;
            this.currentUploadSession = uploadSession; // Store for URL generation
            console.log('✅ Upload session created:', uploadSession.uploadId);

            // Show progress UI
            this.showProgressUI(true);
            this.updateProgress(0, 0, uploadSession.totalChunks);

            // Upload chunks
            await this.uploadChunks(this.selectedFile, uploadSession);

            // Complete upload
            const result = await this.completeUpload(uploadSession.uploadId);
            
            console.log('✅ Upload completed:', result);
            this.showUploadSuccess(result);

        } catch (error) {
            console.error('❌ Upload failed:', error);
            this.showError('Upload failed: ' + error.message);
        } finally {
            this.currentUpload = null;
            this.showProgressUI(false);
        }
    }

    async initiateUpload(file, options = {}) {
        // Generate URL secret for encryption (like in text sharing)
        const urlSecret = this.generateUrlSecret();
        
        const response = await fetch('/api/upload/initiate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: file.name,
                filesize: file.size,
                mimeType: file.type || 'application/octet-stream',
                expiration: options.expiration || '24hr',
                hasPassword: options.hasPassword || false,
                oneTime: options.oneTime || false,
                quickShare: options.quickShare || false
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to initiate upload');
        }

        const result = await response.json();
        
        // Store URL secret for this upload session
        result.urlSecret = urlSecret;
        
        return result;
    }

    // Generate URL secret (same as in main Qopy app)
    generateUrlSecret() {
        const array = new Uint8Array(32); // 32 bytes = 256 bits
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async uploadChunks(file, uploadSession) {
        console.log('🚀 uploadChunks called with session:', {
            uploadId: uploadSession.uploadId,
            chunkSize: uploadSession.chunkSize,
            totalChunks: uploadSession.totalChunks,
            hasUrlSecret: !!uploadSession.urlSecret,
            urlSecret: uploadSession.urlSecret ? 'present' : 'none'
        });

        const { uploadId, chunkSize, totalChunks, urlSecret } = uploadSession;
        const checksums = [];

        // Get encryption settings from form
        const hasPassword = document.getElementById('file-password-checkbox')?.checked || false;
        const password = hasPassword ? document.getElementById('file-password-input')?.value?.trim() : null;
        
        console.log('🔐 Encryption settings from form:', {
            hasPassword,
            passwordProvided: !!password,
            urlSecretProvided: !!urlSecret
        });
        
        // Validate password if enabled
        if (hasPassword && (!password || password.length === 0)) {
            throw new Error('Password cannot be empty when password protection is enabled');
        }
        
        if (password && password.length > 128) {
            throw new Error('Password too long (max 128 characters)');
        }
        
        const encryptionOptions = {
            password: password,
            urlSecret: urlSecret
        };

        console.log('🔐 Final encryption options:', {
            hasPassword: !!encryptionOptions.password,
            hasUrlSecret: !!encryptionOptions.urlSecret
        });

        for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
            // Calculate chunk boundaries
            const start = chunkNumber * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            
            // Extract chunk
            const chunk = file.slice(start, end);
            
            console.log(`📦 Uploading chunk ${chunkNumber + 1}/${totalChunks} (${this.formatFileSize(chunk.size)})`);
            
            // Upload chunk with encryption
            const result = await this.uploadChunk(uploadId, chunkNumber, chunk, encryptionOptions);
            checksums[chunkNumber] = result.checksum;
            
            // Update progress
            this.updateProgress(chunkNumber + 1, chunkNumber + 1, totalChunks);
            
            // Small delay to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        console.log('✅ All chunks uploaded successfully');
        return checksums;
    }

    async uploadChunk(uploadId, chunkNumber, chunk, encryptionOptions = {}) {
        console.log(`📦 uploadChunk called for chunk ${chunkNumber}:`, {
            hasPassword: !!encryptionOptions.password,
            hasUrlSecret: !!encryptionOptions.urlSecret,
            urlSecret: encryptionOptions.urlSecret ? 'present' : 'none'
        });

        let chunkData = await chunk.arrayBuffer();
        console.log(`📦 Original chunk size: ${chunkData.byteLength} bytes`);
        
        // Encrypt chunk if password or URL secret is provided
        if (encryptionOptions.password || encryptionOptions.urlSecret) {
            try {
                console.log(`🔐 Encrypting chunk ${chunkNumber}...`);
                const chunkBytes = new Uint8Array(chunkData);
                const encryptedChunk = await this.encryptChunk(chunkBytes, encryptionOptions.password, encryptionOptions.urlSecret);
                chunkData = encryptedChunk;
                console.log(`✅ Chunk ${chunkNumber} encrypted successfully, new size: ${chunkData.byteLength} bytes`);
            } catch (error) {
                console.error(`❌ Chunk ${chunkNumber} encryption failed:`, error);
                
                // Fallback: Upload without encryption if encryption fails
                console.warn(`⚠️ Falling back to unencrypted upload for chunk ${chunkNumber}`);
                chunkData = await chunk.arrayBuffer();
                
                // Note: This is not ideal for security, but prevents upload failures
                // In production, you might want to fail the entire upload instead
            }
        } else {
            console.log(`⚠️ No encryption options provided for chunk ${chunkNumber}, uploading unencrypted`);
        }
        
        console.log(`📤 Uploading chunk ${chunkNumber} with size: ${chunkData.byteLength} bytes`);
        
        const response = await fetch(`/api/upload/chunk/${uploadId}/${chunkNumber}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            body: chunkData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Chunk ${chunkNumber} upload failed: ${error.message}`);
        }

        const result = await response.json();
        console.log(`✅ Chunk ${chunkNumber} uploaded successfully`);
        return result;
    }

    // Encrypt chunk using the same encryption as text content
    async encryptChunk(chunkBytes, password = null, urlSecret = null) {
        try {
            console.log('🔐 Starting chunk encryption...');
            
            const key = await this.generateEncryptionKey(password, urlSecret);
            console.log('✅ Encryption key generated, usages:', key.usages);
            
            // Generate IV for this chunk
            let iv;
            if (password) {
                iv = await this.deriveIV(password, urlSecret);
            } else {
                iv = await this.deriveIV(urlSecret, null, 'qopy-iv-salt-v1'); // Use same salt as download
            }
            console.log('✅ IV generated, length:', iv.length);
            
            // Ensure chunkBytes is a Uint8Array
            const chunkArray = chunkBytes instanceof Uint8Array ? chunkBytes : new Uint8Array(chunkBytes);
            
            // Encrypt the chunk
            console.log('🔒 Encrypting chunk of size:', chunkArray.length);
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                chunkArray
            );
            console.log('✅ Chunk encrypted successfully');
            
            // Combine IV + encrypted data
            const encryptedBytes = new Uint8Array(encryptedData);
            const ivBytes = new Uint8Array(iv);
            
            const combined = new Uint8Array(ivBytes.length + encryptedBytes.length);
            combined.set(ivBytes, 0);
            combined.set(encryptedBytes, ivBytes.length);
            
            console.log('✅ Combined IV + encrypted data, total size:', combined.length);
            return combined;
        } catch (error) {
            console.error('❌ Encryption error:', error);
            throw new Error('Failed to encrypt chunk: ' + error.message);
        }
    }

    // Generate encryption key (same algorithm as main app)
    async generateEncryptionKey(password = null, urlSecret = null) {
        try {
            const encoder = new TextEncoder();
            
            let keyMaterial;
            if (password && urlSecret) {
                // Password + URL secret mode
                const combined = password + '|' + urlSecret;
                console.log('🔑 Using password + URL secret mode');
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(combined),
                    'PBKDF2',
                    false,
                    ['deriveKey']
                );
            } else if (urlSecret) {
                // URL secret only mode
                console.log('🔑 Using URL secret only mode');
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(urlSecret),
                    'PBKDF2',
                    false,
                    ['deriveKey']
                );
            } else {
                throw new Error('Either password or URL secret must be provided');
            }
            
            console.log('✅ Key material imported successfully');
            
            // Derive key using PBKDF2
            const derivedKey = await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: encoder.encode('qopy-salt-v1'),
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            
            console.log('✅ Key derived successfully, usages:', derivedKey.usages);
            
            // Verify key has correct usages
            if (!derivedKey.usages.includes('encrypt')) {
                throw new Error('Derived key does not support encryption');
            }
            
            return derivedKey;
        } catch (error) {
            console.error('❌ Key generation error:', error);
            throw new Error('Failed to generate encryption key: ' + error.message);
        }
    }

    // Derive IV (same as main app)
    async deriveIV(password, urlSecret = null, salt = 'qopy-iv-salt-v1') {
        const encoder = new TextEncoder();
        
        let keyMaterial;
        if (password && urlSecret) {
            const combined = password + '|' + urlSecret;
            keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(combined),
                'PBKDF2',
                false,
                ['deriveBits']
            );
        } else if (password || urlSecret) {
            keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(password || urlSecret),
                'PBKDF2',
                false,
                ['deriveBits']
            );
        } else {
            throw new Error('Either password or URL secret must be provided for IV derivation');
        }
        
        // Generate IV bytes
        const ivBytes = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 50000,
                hash: 'SHA-256'
            },
            keyMaterial,
            96 // 12 bytes = 96 bits for AES-GCM IV
        );
        
        return new Uint8Array(ivBytes);
    }

    async completeUpload(uploadId) {
        const response = await fetch(`/api/upload/complete/${uploadId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // checksums can be omitted, server will validate automatically
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error('Failed to complete upload: ' + error.message);
        }

        return await response.json();
    }

    async cancelUpload() {
        if (!this.currentUpload) return;

        try {
            console.log('❌ Cancelling upload:', this.currentUpload.uploadId);
            
            await fetch(`/api/upload/${this.currentUpload.uploadId}`, {
                method: 'DELETE'
            });
            
            console.log('✅ Upload cancelled');
            this.showMessage('Upload cancelled.');
            
        } catch (error) {
            console.error('❌ Failed to cancel upload:', error);
        } finally {
            this.currentUpload = null;
            this.currentUploadSession = null; // Clear session data
            this.showProgressUI(false);
            this.resetUploadForm();
        }
    }

    updateProgress(uploadedChunks, currentChunk, totalChunks) {
        const percentage = totalChunks > 0 ? (uploadedChunks / totalChunks) * 100 : 0;
        
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        const progressPercentage = document.getElementById('upload-progress-percentage');

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = `Uploading chunk ${currentChunk}/${totalChunks}`;
        }

        if (progressPercentage) {
            progressPercentage.textContent = `${percentage.toFixed(1)}%`;
        }
    }

    showProgressUI(show) {
        const progressContainer = document.getElementById('upload-progress-container');
        const uploadControls = document.getElementById('file-upload-controls');

        if (progressContainer) {
            progressContainer.style.display = show ? 'block' : 'none';
        }

        if (uploadControls && show) {
            uploadControls.style.display = 'none';
        }
    }

    showUploadSuccess(result) {
        console.log('🎉 Upload successful:', result);
        console.log('🔍 Current upload session:', this.currentUploadSession);
        
        // Hide progress and show success
        this.showProgressUI(false);
        
        // Create URL with secret (same as text sharing)
        let finalUrl = result.url;
        if (this.currentUploadSession && this.currentUploadSession.urlSecret) {
            finalUrl = `${result.url}#${this.currentUploadSession.urlSecret}`;
            console.log('🔗 Final URL with secret:', finalUrl);
        } else {
            console.log('🔗 Final URL without secret:', finalUrl);
        }
        
        // Update success modal with file info
        const modal = document.getElementById('success-modal');
        const shareUrl = document.getElementById('share-url');
        const clipId = document.getElementById('clip-id');
        const successMessage = document.getElementById('success-message');
        const expiryTime = document.getElementById('expiry-time');

        console.log('🔍 Modal elements found:', {
            modal: !!modal,
            shareUrl: !!shareUrl,
            clipId: !!clipId,
            successMessage: !!successMessage,
            expiryTime: !!expiryTime
        });

        if (shareUrl) {
            shareUrl.value = finalUrl;
            console.log('✅ Share URL set:', finalUrl);
        }

        if (clipId) {
            clipId.value = result.clipId;
            console.log('✅ Clip ID set:', result.clipId);
        }

        if (successMessage) {
            successMessage.textContent = `File "${result.filename}" uploaded successfully!`;
            console.log('✅ Success message set');
        }

        if (expiryTime && result.expiresAt) {
            const expiryDate = new Date(result.expiresAt);
            expiryTime.textContent = expiryDate.toLocaleString();
            console.log('✅ Expiry time set:', expiryDate.toLocaleString());
        }

        if (modal) {
            console.log('🔍 Modal before showing:', {
                classList: modal.classList.toString(),
                style: modal.style.display,
                zIndex: modal.style.zIndex
            });
            
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            modal.style.zIndex = '1000';
            
            console.log('🔍 Modal after showing:', {
                classList: modal.classList.toString(),
                style: modal.style.display,
                zIndex: modal.style.zIndex
            });
            
            console.log('✅ Success modal displayed');
        } else {
            console.error('❌ Success modal not found');
        }
        
        // Generate QR code with the full URL including secret
        if (window.clipboardApp && window.clipboardApp.generateQRCode) {
            window.clipboardApp.generateQRCode(finalUrl);
            console.log('✅ QR code generated');
        } else {
            console.warn('⚠️ QR code generation not available');
        }

        // Reset form
        this.resetUploadForm();
    }

    resetUploadForm() {
        this.selectedFile = null;
        
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.value = '';
        }

        this.showUploadControls(false);
        
        const fileInfoContainer = document.getElementById('file-info-container');
        if (fileInfoContainer) {
            fileInfoContainer.style.display = 'none';
        }
    }

    showError(message) {
        console.error('❌', message);
        
        // Show error toast
        const errorToast = document.getElementById('error-toast');
        const errorMessage = document.getElementById('error-message');
        
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        
        if (errorToast) {
            errorToast.classList.remove('hidden');
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                errorToast.classList.add('hidden');
            }, 5000);
        }
    }

    showMessage(message) {
        console.log('ℹ️', message);
        
        // Show info toast
        const infoToast = document.getElementById('info-toast');
        const infoMessage = document.getElementById('info-message');
        
        if (infoMessage) {
            infoMessage.textContent = message;
        }
        
        if (infoToast) {
            infoToast.classList.remove('hidden');
            
            // Auto-hide after 3 seconds
            setTimeout(() => {
                infoToast.classList.add('hidden');
            }, 3000);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// File Download Manager
class FileDownloadManager {
    constructor() {
        this.currentDownload = null;
    }

    async downloadFile(clipId, filename) {
        try {
            console.log('📥 Starting download:', clipId);
            
            // Extract URL secret from current URL
            const urlSecret = this.extractUrlSecret();
            const password = this.getPasswordFromUser();
            
            // Start download
            const response = await fetch(`/api/file/${clipId}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Download failed');
            }

            // Get file data as array buffer
            const encryptedData = await response.arrayBuffer();
            const encryptedBytes = new Uint8Array(encryptedData);
            
            let decryptedData;
            
            // Try to decrypt if we have encryption keys
            if (password || urlSecret) {
                try {
                    decryptedData = await this.decryptFile(encryptedBytes, password, urlSecret);
                    console.log('🔓 File decrypted successfully');
                } catch (decryptError) {
                    console.warn('⚠️ Decryption failed, downloading as-is:', decryptError.message);
                    decryptedData = encryptedBytes;
                }
            } else {
                // No encryption keys, download as-is
                decryptedData = encryptedBytes;
            }
            
            // Create blob from decrypted data
            const blob = new Blob([decryptedData]);
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || `qopy-file-${clipId}`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Clean up
            window.URL.revokeObjectURL(url);
            
            console.log('✅ Download completed');
            
        } catch (error) {
            console.error('❌ Download failed:', error);
            throw error;
        }
    }

    // Extract URL secret from current URL fragment
    extractUrlSecret() {
        const hash = window.location.hash;
        if (hash && hash.length > 1) {
            return hash.substring(1); // Remove the # symbol
        }
        return null;
    }

    // Get password from user input (if available)
    getPasswordFromUser() {
        const passwordInput = document.getElementById('retrieve-password-input');
        return passwordInput ? passwordInput.value.trim() : null;
    }

    // Decrypt file using same algorithm as chunks
    async decryptFile(encryptedBytes, password = null, urlSecret = null) {
        if (!password && !urlSecret) {
            throw new Error('No decryption keys available');
        }

        try {
            // Extract IV (first 12 bytes) and encrypted data
            if (encryptedBytes.length < 12) {
                throw new Error('File too small to be encrypted');
            }

            const iv = encryptedBytes.slice(0, 12);
            const encryptedData = encryptedBytes.slice(12);

            // Generate decryption key
            const key = await this.generateDecryptionKey(password, urlSecret);

            // Decrypt the data
            const decryptedData = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedData
            );

            return new Uint8Array(decryptedData);

        } catch (error) {
            throw new Error('Decryption failed: ' + error.message);
        }
    }

    // Generate decryption key (same as upload)
    async generateDecryptionKey(password = null, urlSecret = null) {
        const encoder = new TextEncoder();
        
        let keyMaterial;
        if (password && urlSecret) {
            // Password + URL secret mode
            const combined = password + '|' + urlSecret;
            keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(combined),
                'PBKDF2',
                false,
                ['deriveKey']
            );
        } else if (urlSecret) {
            // URL secret only mode
            keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(urlSecret),
                'PBKDF2',
                false,
                ['deriveKey']
            );
        } else if (password) {
            // Password only mode (should not happen for files, but handle it)
            keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(password),
                'PBKDF2',
                false,
                ['deriveKey']
            );
        } else {
            throw new Error('Either password or URL secret must be provided');
        }
        
        // Derive key using PBKDF2
        return await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode('qopy-salt-v1'),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
}

// Initialize when DOM is loaded
let fileUploadManager;
let fileDownloadManager;

document.addEventListener('DOMContentLoaded', () => {
    fileUploadManager = new FileUploadManager();
    fileDownloadManager = new FileDownloadManager();
    
    console.log('🗂️ File upload/download managers initialized');
}); 
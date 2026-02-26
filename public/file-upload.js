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
 *    For proprietary/commercial use. Contact qopy.quiet156@passmail.net
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

// File Upload Manager for Qopy
const FILE_UPLOAD_DEBUG = false;

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

        // Cancel upload button (progress section)
        const cancelButtonProgress = document.getElementById('cancel-upload-button-progress');
        if (cancelButtonProgress) {
            cancelButtonProgress.addEventListener('click', () => {
                this.cancelUpload();
            });
        }

        // File reset button
        const fileResetButton = document.getElementById('file-reset-button');
        if (fileResetButton) {
            fileResetButton.addEventListener('click', () => {
                this.resetFileSelection();
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
        FILE_UPLOAD_DEBUG && console.log('🗂️ File selected:', file.name, '(' + this.formatFileSize(file.size) + ')');

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

    resetFileSelection() {
        // Clear selected file
        this.selectedFile = null;
        
        // Clear file input
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Hide file info container
        const fileInfoContainer = document.getElementById('file-info-container');
        if (fileInfoContainer) {
            fileInfoContainer.style.display = 'none';
        }
        
        // Hide and reset upload controls
        this.showUploadControls(false);
        this.resetUploadControls();
        
        // Hide progress container if visible
        const progressContainer = document.getElementById('upload-progress-container');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
        
        FILE_UPLOAD_DEBUG && console.log('🔄 File selection reset');
    }

    resetUploadControls() {
        // Reset checkboxes
        const oneTimeCheckbox = document.getElementById('file-one-time-checkbox');
        const passwordCheckbox = document.getElementById('file-password-checkbox');
        const passwordSection = document.getElementById('file-password-section');
        const passwordInput = document.getElementById('file-password-input');
        const expirationSelect = document.getElementById('file-expiration');
        
        if (oneTimeCheckbox) {
            oneTimeCheckbox.checked = false;
        }
        
        if (passwordCheckbox) {
            passwordCheckbox.checked = false;
        }
        
        if (passwordSection) {
            passwordSection.style.display = 'none';
        }
        
        if (passwordInput) {
            passwordInput.value = '';
        }
        
        if (expirationSelect) {
            expirationSelect.value = '30min'; // Reset to default
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
            FILE_UPLOAD_DEBUG && console.log('🚀 Starting upload for:', this.selectedFile.name);
            
            // Get form settings
            const expiration = document.getElementById('file-expiration')?.value || '24hr';
            const requiresAccessCode = document.getElementById('file-password-checkbox')?.checked || false;
            const oneTime = document.getElementById('file-one-time-checkbox')?.checked || false;

            // Store access code for later use during completion
            const accessCode = requiresAccessCode ? document.getElementById('file-password-input')?.value?.trim() : null;
            
            // Initiate upload
            const uploadSession = await this.initiateUpload(this.selectedFile, {
                expiration,
                hasPassword: requiresAccessCode, // Keep backward compatibility
                oneTime
            });

            this.currentUpload = uploadSession;
            this.currentUploadSession = uploadSession; // Store for URL generation
            
            // Store access code in session for completion
            if (accessCode) {
                this.currentUploadSession.accessCode = accessCode;
                FILE_UPLOAD_DEBUG && console.log('💾 Stored access code in session for completion');
            }
            FILE_UPLOAD_DEBUG && console.log('✅ Upload session created:', uploadSession.uploadId);

            // Show progress UI
            this.showProgressUI(true);
            this.updateProgress(0, 0, uploadSession.totalChunks);

            // Upload chunks (this also completes the upload)
            const result = await this.uploadChunks(this.selectedFile, uploadSession);
            
            FILE_UPLOAD_DEBUG && console.log('✅ Upload completed:', result);
            this.showUploadSuccess(result);

        } catch (error) {
            console.error('❌ Upload failed:', error);
            this.showError('Upload failed: ' + error.message);
        } finally {
            this.currentUpload = null;
            this.showProgressUI(false);
        }
    }

    // Generate URL secret (same as in main Qopy app)
    generateUrlSecret() {
        const array = new Uint8Array(32); // 32 bytes = 256 bits
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Generate hash-based anonymous filename (no extension needed)
    async generateHashFilename() {
        // Generate a random hash for filename
        const array = new Uint8Array(16); // 16 bytes = 32 hex chars
        window.crypto.getRandomValues(array);
        const hash = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        
        // Options for anonymous filename:
        // return `${hash}.bin`;     // Generic binary file
        // return `${hash}`;         // No extension (current)
        // return `${hash}.enc`;     // Encrypted file
        // return `${hash}.qopy`;    // Custom extension
        
        return `${hash}`; // No extension - clean anonymous filename
    }

    // Add minimal padding only for very small files to obscure tiny content
    addMinimalPadding(data) {
        const originalSize = data.length;
        const minimumSize = 10 * 1024; // 10KB minimum for small files
        
        // Only pad files smaller than 10KB
        if (originalSize >= minimumSize) {
            FILE_UPLOAD_DEBUG && console.log(`📦 File size ${originalSize} bytes >= 10KB, no padding needed`);
            return data; // No padding for larger files
        }
        
        const paddingSize = minimumSize - originalSize;
        FILE_UPLOAD_DEBUG && console.log(`🔒 Minimal padding: ${originalSize} bytes → ${minimumSize} bytes (+${paddingSize} padding)`);
        
        // Generate cryptographically secure random padding
        const padding = new Uint8Array(paddingSize);
        window.crypto.getRandomValues(padding);
        
        // Combine original data + padding + size marker (4 bytes for original size)
        const result = new Uint8Array(originalSize + paddingSize + 4);
        result.set(data, 0);                                    // Original data first
        result.set(padding, originalSize);                      // Random padding
        
        // Add original size as 4-byte integer at the end (for decryption)
        const sizeBytes = new ArrayBuffer(4);
        new DataView(sizeBytes).setUint32(0, originalSize, false); // Big-endian
        result.set(new Uint8Array(sizeBytes), originalSize + paddingSize);
        
        return result;
    }

    // Embed encrypted metadata into file for zero-knowledge retrieval (compatible version)
    async embedMetadata(fileData, originalFilename, originalSize, originalMimeType, compatibleSecret) {
        // Create comprehensive metadata object including MIME type
        const metadata = {
            filename: originalFilename,
            size: originalSize,
            mimeType: originalMimeType,
            timestamp: Date.now(),
            version: 'v2-compatible'  // Version marker for compatibility
        };
        
        const metadataJson = JSON.stringify(metadata);
        const encoder = new TextEncoder();
        const metadataBytes = encoder.encode(metadataJson);
        
        FILE_UPLOAD_DEBUG && console.log(`🔐 Embedding compatible encrypted metadata: ${metadataJson}`);
        
        // Encrypt metadata with compatible secret using AES-GCM
        const metadataKey = await this.generateCompatibleEncryptionKey(null, compatibleSecret);
        const metadataIV = await this.deriveCompatibleIV(null, compatibleSecret, 'qopy-metadata-salt');
        
        const encryptedMetadata = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: metadataIV
            },
            metadataKey,
            metadataBytes
        );
        
        const encryptedMetadataArray = new Uint8Array(encryptedMetadata);
        
        // Create final file structure: [4 bytes: metadata_length][encrypted_metadata][file_data]
        const metadataLengthBytes = new ArrayBuffer(4);
        new DataView(metadataLengthBytes).setUint32(0, encryptedMetadataArray.length, true); // Little-endian
        
        const finalFile = new Uint8Array(4 + encryptedMetadataArray.length + fileData.length);
        finalFile.set(new Uint8Array(metadataLengthBytes), 0);
        finalFile.set(encryptedMetadataArray, 4);
        finalFile.set(fileData, 4 + encryptedMetadataArray.length);
        
        FILE_UPLOAD_DEBUG && console.log(`✅ Compatible metadata embedded: ${metadataJson.length} chars → ${encryptedMetadataArray.length} encrypted bytes`);
        return finalFile;
    }

    // Extract metadata from file during download
    async extractMetadata(fileWithMetadata, securePassphrase) {
        try {
            if (fileWithMetadata.length < 4) {
                return { metadata: null, fileData: fileWithMetadata };
            }
            
            // Read metadata length
            const metadataLength = new DataView(fileWithMetadata.buffer.slice(0, 4)).getUint32(0, false);
            
            if (metadataLength > fileWithMetadata.length - 4 || metadataLength > 1024) { // Sanity check
                FILE_UPLOAD_DEBUG && console.log('📦 No valid metadata found, treating as raw file');
                return { metadata: null, fileData: fileWithMetadata };
            }
            
            // Extract encrypted metadata
            const encryptedMetadata = fileWithMetadata.slice(4, 4 + metadataLength);
            const fileData = fileWithMetadata.slice(4 + metadataLength);
            
            // Decrypt metadata using same key as file content
            const metadataKey = await this.generateEnhancedEncryptionKey(null, securePassphrase);
            const metadataIV = await this.deriveEnhancedIV(securePassphrase, null, 'qopy-metadata-salt');
            
            const decryptedMetadataBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: metadataIV },
                metadataKey,
                encryptedMetadata
            );
            
            const metadataJson = new TextDecoder().decode(decryptedMetadataBuffer);
            const metadata = JSON.parse(metadataJson);
            
            FILE_UPLOAD_DEBUG && console.log(`🔓 Extracted encrypted metadata: ${metadataJson}`);
            return { metadata, fileData };
            
        } catch (error) {
            FILE_UPLOAD_DEBUG && console.warn('⚠️ Failed to extract metadata (wrong key or corrupted):', error.message);
            return { metadata: null, fileData: fileWithMetadata };
        }
    }

    // Generate secure passphrase (like Proton Drive's recovery phrases) for enhanced security
    generateSecurePassphrase() {
        FILE_UPLOAD_DEBUG && console.log('🔐 [ENTROPY] Generating enhanced secure passphrase...');
        
        const startTime = performance.now();
        
        // Generate 256 bits of entropy (32 bytes) for maximum security
        const entropyBytes = new Uint8Array(32);
        window.crypto.getRandomValues(entropyBytes);
        
        // Convert to base64 for a longer, more secure passphrase
        const base64Passphrase = btoa(String.fromCharCode.apply(null, entropyBytes));
        
        const generationTime = performance.now() - startTime;
        
        FILE_UPLOAD_DEBUG && console.log('✅ Enhanced passphrase generated:', {
            type: 'BASE64_ENCODED',
            entropyBits: 256,
            length: base64Passphrase.length,
            preview: base64Passphrase.substring(0, 8) + '...',
            format: 'Proton Drive style',
            generationTime: generationTime.toFixed(2) + 'ms'
        });
        
        return base64Passphrase;
    }

    // Alternative: Generate BIP39-style word-based passphrase (like Proton Drive)
    generateWordBasedPassphrase() {
        // Simple word list for demonstration (in production, use full BIP39 wordlist)
        const words = [
            'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
            'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
            'acoustic', 'acquire', 'across', 'action', 'actor', 'actress', 'actual', 'adapt',
            'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance', 'advice',
            'aerobic', 'affair', 'afford', 'afraid', 'again', 'agent', 'agree', 'ahead',
            'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol', 'alert',
            'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already',
            'also', 'alter', 'always', 'amateur', 'amazing', 'among', 'amount', 'amused',
            'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry', 'animal', 'ankle',
            'announce', 'annual', 'another', 'answer', 'antenna', 'antique', 'anxiety', 'any',
            'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch', 'arctic',
            'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around',
            'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artist', 'artwork', 'ask',
            'aspect', 'assault', 'asset', 'assist', 'assume', 'asthma', 'athlete', 'atom',
            'attack', 'attend', 'attitude', 'attract', 'auction', 'audit', 'august', 'aunt',
            'author', 'auto', 'autumn', 'average', 'avocado', 'avoid', 'awake', 'aware'
        ];
        
        // Generate 12 words for good entropy (like Proton's recovery phrases)
        const passphrase = [];
        for (let i = 0; i < 12; i++) {
            const randomIndex = Math.floor(Math.random() * words.length);
            passphrase.push(words[randomIndex]);
        }
        
        const wordPassphrase = passphrase.join(' ');
        FILE_UPLOAD_DEBUG && console.log(`🔐 Generated word-based passphrase: 12 words (~128 bits entropy)`);
        return wordPassphrase;
    }

    // Enhanced key derivation with backward compatibility + extensive logging
    async generateCompatibleEncryptionKey(password = null, secret = null) {
        try {
            const encoder = new TextEncoder();
            
            // Detect if this is an old URL secret (16 chars) or new enhanced passphrase (43+ chars)
            const isOldUrlSecret = secret && secret.length === 16 && /^[A-Za-z0-9]{16}$/.test(secret);
            const isEnhancedPassphrase = secret && secret.length >= 40;
            
            let keyMaterial;
            let salt;
            let iterations;
            let mode;
            
            if (password && secret) {
                // Combined mode
                if (isOldUrlSecret) {
                    // Legacy format: urlSecret:password (compatible with script.js)
                    const combined = secret + ':' + password;
                    mode = 'LEGACY_COMBINED';
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(combined),
                        'PBKDF2',
                        false,
                        ['deriveKey']
                    );
                    salt = 'qopy-salt-v1';           // Legacy salt
                    iterations = 100000;             // Legacy iterations
                } else if (isEnhancedPassphrase) {
                    // Enhanced format: passphrase:password
                    const combined = secret + ':' + password;
                    mode = 'ENHANCED_COMBINED';
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(combined),
                        'PBKDF2',
                        false,
                        ['deriveKey']
                    );
                    salt = 'qopy-enhanced-salt-v2';   // Enhanced salt
                    iterations = 250000;             // Enhanced iterations
                } else {
                    throw new Error(`Invalid secret format: length=${secret.length}, pattern=${secret.substring(0, 8)}...`);
                }
            } else if (secret) {
                // Secret-only mode
                if (isOldUrlSecret) {
                    mode = 'LEGACY_SECRET_ONLY';
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(secret),
                        'PBKDF2',
                        false,
                        ['deriveKey']
                    );
                    salt = 'qopy-salt-v1';
                    iterations = 100000;
                } else if (isEnhancedPassphrase) {
                    mode = 'ENHANCED_SECRET_ONLY';
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(secret),
                        'PBKDF2',
                        false,
                        ['deriveKey']
                    );
                    salt = 'qopy-enhanced-salt-v2';
                    iterations = 250000;
                } else {
                    throw new Error(`Invalid secret format: length=${secret.length}, pattern=${secret.substring(0, 8)}...`);
                }
            } else {
                throw new Error('Either password or secret must be provided');
            }
            
            // Derive key using appropriate parameters
            const derivationStart = performance.now();
            const derivedKey = await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: encoder.encode(salt),
                    iterations: iterations,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            const derivationTime = performance.now() - derivationStart;
            
            return derivedKey;
        } catch (error) {
            console.error('❌ Compatible key generation error:', error.message);
            throw new Error('Failed to generate compatible encryption key: ' + error.message);
        }
    }

    // Compatible IV derivation
    async deriveCompatibleIV(password, secret = null, customSalt = null) {
        try {
            const encoder = new TextEncoder();
            
            // Detect format
            const isOldUrlSecret = secret && secret.length === 16 && /^[A-Za-z0-9]{16}$/.test(secret);
            const isEnhancedPassphrase = secret && secret.length >= 40;
            
            let keyMaterial;
            let salt;
            let iterations;
            let mode;
            
            if (password && secret) {
                // Combined mode
                if (isOldUrlSecret) {
                    // Legacy format: urlSecret:password
                    const combined = secret + ':' + password;
                    mode = 'LEGACY_COMBINED_IV';
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(combined),
                        'PBKDF2',
                        false,
                        ['deriveBits']
                    );
                    salt = customSalt || 'qopy-iv-salt-v1';
                    iterations = 100000;
                } else if (isEnhancedPassphrase) {
                    // Enhanced format: passphrase:password
                    const combined = secret + ':' + password;
                    mode = 'ENHANCED_COMBINED_IV';
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(combined),
                        'PBKDF2',
                        false,
                        ['deriveBits']
                    );
                    salt = customSalt || 'qopy-enhanced-iv-salt-v2';
                    iterations = 100000;
                } else {
                    throw new Error(`Invalid secret format for IV derivation: length=${secret.length}`);
                }
            } else if (secret) {
                // Secret-only mode
                if (isOldUrlSecret) {
                    mode = 'LEGACY_SECRET_ONLY_IV';
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(secret),
                        'PBKDF2',
                        false,
                        ['deriveBits']
                    );
                    salt = customSalt || 'qopy-iv-salt-v1';
                    iterations = 100000;
                } else if (isEnhancedPassphrase) {
                    mode = 'ENHANCED_SECRET_ONLY_IV';
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(secret),
                        'PBKDF2',
                        false,
                        ['deriveBits']
                    );
                    salt = customSalt || 'qopy-enhanced-iv-salt-v2';
                    iterations = 100000;
                } else {
                    throw new Error(`Invalid secret format for IV derivation: length=${secret.length}`);
                }
            } else {
                throw new Error('Either password or secret must be provided for IV derivation');
            }
            
            // Derive IV using appropriate parameters
            const derivationStart = performance.now();
            const ivBytes = await window.crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: encoder.encode(salt),
                    iterations: iterations,
                    hash: 'SHA-256'
                },
                keyMaterial,
                96 // 12 bytes = 96 bits for AES-GCM IV
            );
            const derivationTime = performance.now() - derivationStart;
            
            const iv = new Uint8Array(ivBytes);
            return iv;
        } catch (error) {
            console.error('❌ Compatible IV derivation error:', error.message);
            throw new Error('Failed to derive compatible IV: ' + error.message);
        }
    }

    // Generate backward-compatible secret with extensive logging
    generateCompatibleSecret(enhanced = true) {
        FILE_UPLOAD_DEBUG && console.group('🎲 [SECRET GENERATION] Compatible Secret Creation');
        
        const startTime = performance.now();
        
        try {
            let secret;
            let secretType;
            
            if (enhanced) {
                // Generate enhanced passphrase (new default)
                secret = this.generateSecurePassphrase();
                secretType = 'ENHANCED_PASSPHRASE';
                FILE_UPLOAD_DEBUG && console.log('🔐 Generated enhanced passphrase for maximum security');
            } else {
                // Generate legacy URL secret (for compatibility)
                secret = this.generateLegacyUrlSecret();
                secretType = 'LEGACY_URL_SECRET';
                FILE_UPLOAD_DEBUG && console.log('🔑 Generated legacy URL secret for backward compatibility');
            }
            
            const totalTime = performance.now() - startTime;
            
            FILE_UPLOAD_DEBUG && console.log('✅ Compatible secret generated:', {
                type: secretType,
                length: secret.length,
                preview: secret.substring(0, 8) + '...',
                enhanced,
                entropy: enhanced ? '256-bit' : '128-bit',
                generationTime: totalTime.toFixed(2) + 'ms'
            });
            
            FILE_UPLOAD_DEBUG && console.groupEnd();
            return secret;
        } catch (error) {
            const totalTime = performance.now() - startTime;
            console.error('❌ Secret generation error:', {
                error: error.message,
                enhanced,
                totalTime: totalTime.toFixed(2) + 'ms'
            });
            FILE_UPLOAD_DEBUG && console.groupEnd();
            throw error;
        }
    }

    // Legacy URL secret generation with logging
    generateLegacyUrlSecret() {
        FILE_UPLOAD_DEBUG && console.log('🔑 [LEGACY] Generating backward-compatible URL secret...');
        
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 16; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        FILE_UPLOAD_DEBUG && console.log('✅ Legacy URL secret generated:', {
            type: 'ALPHANUMERIC',
            entropyBits: 128,
            length: result.length,
            preview: result.substring(0, 8) + '...',
            format: 'script.js compatible'
        });
        
        return result;
    }

    // Enhanced key derivation with longer passphrase (like Proton Drive)
    async generateEnhancedEncryptionKey(password = null, securePassphrase = null) {
        try {
            const encoder = new TextEncoder();
            
            let keyMaterial;
            if (password && securePassphrase) {
                // Combined mode: password + secure passphrase (like Proton's system)
                const combined = securePassphrase + ':' + password;
                FILE_UPLOAD_DEBUG && console.log('🔑 Using password + secure passphrase mode (Proton-style)');
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(combined),
                    'PBKDF2',
                    false,
                    ['deriveKey']
                );
            } else if (securePassphrase) {
                // Secure passphrase only mode
                FILE_UPLOAD_DEBUG && console.log('🔑 Using secure passphrase only mode');
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(securePassphrase),
                    'PBKDF2',
                    false,
                    ['deriveKey']
                );
            } else {
                throw new Error('Either password or secure passphrase must be provided');
            }
            
            FILE_UPLOAD_DEBUG && console.log('✅ Key material imported successfully');
            
            // Enhanced PBKDF2 with more iterations for longer passphrase
            const derivedKey = await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: encoder.encode('qopy-enhanced-salt-v2'), // New salt for enhanced security
                    iterations: 250000, // Increased from 100k to 250k for longer passphrases
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            
            FILE_UPLOAD_DEBUG && console.log('✅ Enhanced key derived successfully with 250k iterations');
            return derivedKey;
        } catch (error) {
            console.error('❌ Enhanced key generation error:', error);
            throw new Error('Failed to generate enhanced encryption key: ' + error.message);
        }
    }

    // Enhanced IV derivation with secure passphrase
    async deriveEnhancedIV(password, securePassphrase = null, salt = 'qopy-enhanced-iv-salt-v2') {
        const encoder = new TextEncoder();
        
        let keyMaterial;
        if (password && securePassphrase) {
            // MUST match enhanced encryption format
            const combined = securePassphrase + ':' + password;
            keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(combined),
                'PBKDF2',
                false,
                ['deriveBits']
            );
        } else if (securePassphrase) {
            keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(securePassphrase),
                'PBKDF2',
                false,
                ['deriveBits']
            );
        } else {
            throw new Error('Either password or secure passphrase must be provided for enhanced IV derivation');
        }
        
        // Enhanced IV derivation with more iterations
        const ivBytes = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 100000, // Enhanced iterations for IV
                hash: 'SHA-256'
            },
            keyMaterial,
            96 // 12 bytes = 96 bits for AES-GCM IV
        );
        
        return new Uint8Array(ivBytes);
    }

    async initiateUpload(file, options = {}) {
        const uploadStartTime = performance.now();
        FILE_UPLOAD_DEBUG && console.group('📤 [UPLOAD INIT] Starting Compatible File Upload');
        
        try {
            // Generate enhanced passphrase for new uploads (but support legacy for downloads)
            FILE_UPLOAD_DEBUG && console.log('🔐 Generating compatible secret for upload...');
            const compatibleSecret = this.generateCompatibleSecret(true); // true = enhanced mode
            
            // Store original file metadata for success display
            this.storeOriginalMetadata(file.name, file.size, file.type);
            FILE_UPLOAD_DEBUG && console.log('💾 Original metadata stored for success display');
            
            // Generate hash-based anonymous filename
            FILE_UPLOAD_DEBUG && console.log('🎭 Generating anonymous filename...');
            const anonymousFilename = await this.generateHashFilename();
            FILE_UPLOAD_DEBUG && console.log('✅ Anonymous filename generated:', anonymousFilename);
            
            // Read file data and apply minimal padding only for small files
            FILE_UPLOAD_DEBUG && console.log('📖 Reading file data and applying padding logic...');
            const fileReadStart = performance.now();
            const fileBuffer = await file.arrayBuffer();
            const originalData = new Uint8Array(fileBuffer);
            const fileReadTime = performance.now() - fileReadStart;
            
            FILE_UPLOAD_DEBUG && console.log('📊 File read completed:', {
                originalSize: originalData.length,
                readTime: fileReadTime.toFixed(2) + 'ms'
            });
            
            const paddingStart = performance.now();
            const paddedData = this.addMinimalPadding(originalData);
            const paddingTime = performance.now() - paddingStart;
            
            const paddingApplied = paddedData.length !== originalData.length;
            FILE_UPLOAD_DEBUG && console.log('🔒 Padding analysis:', {
                paddingApplied,
                originalSize: originalData.length,
                paddedSize: paddedData.length,
                paddingAdded: paddedData.length - originalData.length,
                paddingTime: paddingTime.toFixed(2) + 'ms'
            });
            
            // Embed metadata (including MIME type) into padded data
            FILE_UPLOAD_DEBUG && console.log('📋 Embedding encrypted metadata...');
            const metadataStart = performance.now();
            const fileWithMetadata = await this.embedMetadata(
                paddedData, 
                file.name, 
                file.size, 
                file.type,
                compatibleSecret
            );
            const metadataTime = performance.now() - metadataStart;
            
            FILE_UPLOAD_DEBUG && console.log('✅ Metadata embedding completed:', {
                finalSize: fileWithMetadata.length,
                metadataOverhead: fileWithMetadata.length - paddedData.length,
                embeddingTime: metadataTime.toFixed(2) + 'ms'
            });
            
            const uploadPreparationTime = performance.now() - uploadStartTime;
            
            FILE_UPLOAD_DEBUG && console.log(`🔒 Backward-compatible zero-knowledge upload preparation completed:`, {
                original: {
                    filename: file.name,
                    size: file.size,
                    sizeFormatted: this.formatFileSize(file.size),
                    mimeType: file.type
                },
                processed: {
                    anonymousFilename,
                    finalSize: fileWithMetadata.length,
                    finalSizeFormatted: this.formatFileSize(fileWithMetadata.length),
                    serverMimeType: 'application/octet-stream'
                },
                security: {
                    secretType: compatibleSecret.length >= 40 ? 'Enhanced' : 'Legacy',
                    secretLength: compatibleSecret.length,
                    paddingApplied,
                    metadataEncrypted: true
                },
                performance: {
                    preparationTime: uploadPreparationTime.toFixed(2) + 'ms',
                    fileReadTime: fileReadTime.toFixed(2) + 'ms',
                    paddingTime: paddingTime.toFixed(2) + 'ms',
                    metadataTime: metadataTime.toFixed(2) + 'ms'
                }
            });
            
            const totalChunks = Math.ceil(fileWithMetadata.length / this.chunkSize);
            const requestBody = {
                filename: anonymousFilename,
                totalChunks,
                expiration: options.expiration || '24hr',
                hasPassword: options.hasPassword || false,
                oneTime: options.oneTime || false,
                quickShare: options.quickShare || false,
                contentType: 'file',
                isTextContent: false
            };
            
            FILE_UPLOAD_DEBUG && console.log('📡 Making upload initiation request to server...', requestBody);
            const serverRequestStart = performance.now();
            
            const response = await fetch('/api/upload/initiate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            const serverRequestTime = performance.now() - serverRequestStart;
            
            if (!response.ok) {
                const error = await response.json();
                console.error('❌ Server upload initiation failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: error.message,
                    serverRequestTime: serverRequestTime.toFixed(2) + 'ms'
                });
                throw new Error(error.message || 'Failed to initiate upload');
            }
            
            const result = await response.json();
            const totalInitTime = performance.now() - uploadStartTime;
            
            FILE_UPLOAD_DEBUG && console.log('✅ Upload session initiated successfully:', {
                uploadId: result.uploadId,
                chunkSize: result.chunkSize,
                totalChunks: result.totalChunks,
                serverRequestTime: serverRequestTime.toFixed(2) + 'ms',
                totalInitTime: totalInitTime.toFixed(2) + 'ms'
            });
            
            // Store compatible secret and prepared file data for upload
            result.compatibleSecret = compatibleSecret;
            result.fileDataToUpload = fileWithMetadata;
            
            FILE_UPLOAD_DEBUG && console.groupEnd();
            return result;
            
        } catch (error) {
            const totalTime = performance.now() - uploadStartTime;
            console.error('❌ Upload initiation failed:', {
                error: error.message,
                fileName: file.name,
                fileSize: file.size,
                totalTime: totalTime.toFixed(2) + 'ms'
            });
            FILE_UPLOAD_DEBUG && console.groupEnd();
            throw error;
        }
    }

    async uploadChunks(file, uploadSession) {
        const uploadStartTime = performance.now();
        FILE_UPLOAD_DEBUG && console.group('📤 [UPLOAD CHUNKS] Compatible File Upload');
        
        try {
            const { uploadId, chunkSize, totalChunks, compatibleSecret, fileDataToUpload } = uploadSession;

            // Get access code settings from form
            const requiresAccessCode = document.getElementById('file-password-checkbox')?.checked || false;
            const accessCode = requiresAccessCode ? document.getElementById('file-password-input')?.value?.trim() : null;
            
            FILE_UPLOAD_DEBUG && console.log('🔐 Access code settings analysis:', {
                requiresAccessCode,
                accessCodeLength: accessCode ? accessCode.length : 0,
                accessCodeProvided: requiresAccessCode && accessCode
            });
            
            if (requiresAccessCode && !accessCode) {
                throw new Error('Access code protection enabled but no access code provided');
            }

            // Use compatible encryption (URL-Secret only for file encryption)
            FILE_UPLOAD_DEBUG && console.log('🔐 Preparing compatible encryption...');
            const encryptionStart = performance.now();
            
            // For Access Code System: File encryption uses only URL-Secret, not password
            const encryptionKey = await this.generateCompatibleEncryptionKey(null, compatibleSecret);
            const iv = await this.deriveCompatibleIV(null, compatibleSecret);
            
            const encryptionPrepTime = performance.now() - encryptionStart;
            
            FILE_UPLOAD_DEBUG && console.log('🔐 Compatible encryption prepared:', {
                keyType: 'secret-only', // Access Code System: File encryption uses only URL-Secret
                accessCode: accessCode ? 'enabled' : 'disabled',
                secretLength: compatibleSecret.length,
                secretType: compatibleSecret.length >= 40 ? 'Enhanced (43+ chars)' : 'Legacy (16 chars)',
                ivLength: iv.length,
                dataSize: fileDataToUpload.length,
                dataSizeFormatted: this.formatFileSize(fileDataToUpload.length),
                preparationTime: encryptionPrepTime.toFixed(2) + 'ms'
            });

            // Encrypt the entire file data with metadata
            FILE_UPLOAD_DEBUG && console.log('🔒 Encrypting file data...');
            const fileEncryptionStart = performance.now();
            
            const encryptedData = await window.crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                encryptionKey,
                fileDataToUpload
            );
            
            const fileEncryptionTime = performance.now() - fileEncryptionStart;
            const encryptedArray = new Uint8Array(encryptedData);
            
            // Create final structure: IV (12 bytes) + encrypted data
            const finalData = new Uint8Array(iv.length + encryptedArray.length);
            finalData.set(iv, 0);
            finalData.set(encryptedArray, iv.length);
            
            FILE_UPLOAD_DEBUG && console.log(`✅ File encryption completed:`, {
                originalSize: fileDataToUpload.length,
                encryptedSize: encryptedArray.length,
                ivSize: iv.length,
                finalSize: finalData.length,
                encryptionOverhead: encryptedArray.length - fileDataToUpload.length,
                compressionRatio: (encryptedArray.length / fileDataToUpload.length * 100).toFixed(2) + '%',
                encryptionTime: fileEncryptionTime.toFixed(2) + 'ms'
            });

            // Upload chunks with detailed progress tracking
            FILE_UPLOAD_DEBUG && console.log('📦 Starting chunk upload process...');
            const chunkUploadStart = performance.now();
            let totalBytesUploaded = 0;
            
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const chunkStart = performance.now();
                const start = chunkIndex * chunkSize;
                const end = Math.min(start + chunkSize, finalData.length);
                const chunk = finalData.slice(start, end);
                
                FILE_UPLOAD_DEBUG && console.log(`📦 [CHUNK ${chunkIndex + 1}/${totalChunks}] Uploading chunk:`, {
                    chunkIndex,
                    start,
                    end,
                    chunkSize: chunk.length,
                    chunkSizeFormatted: this.formatFileSize(chunk.length)
                });

                const formData = new FormData();
                formData.append('chunk', new Blob([chunk], { type: 'application/octet-stream' }));
                formData.append('chunkIndex', chunkIndex.toString());

                const chunkRequestStart = performance.now();
                const response = await fetch(`/api/upload/chunk/${uploadId}/${chunkIndex}`, {
                    method: 'POST',
                    body: formData
                });
                const chunkRequestTime = performance.now() - chunkRequestStart;

                if (!response.ok) {
                    const error = await response.json();
                    console.error(`❌ [CHUNK ${chunkIndex + 1}] Upload failed:`, {
                        chunkIndex,
                        status: response.status,
                        error: error.message,
                        requestTime: chunkRequestTime.toFixed(2) + 'ms'
                    });
                    throw new Error(`Chunk upload failed: ${error.message}`);
                }

                totalBytesUploaded += chunk.length;
                // Calculate progress with proper bounds checking
                const progressRaw = ((chunkIndex + 1) / totalChunks) * 100;
                const progress = Math.min(100, Math.max(0, Math.round(progressRaw)));
                const chunkTime = performance.now() - chunkStart;
                
                FILE_UPLOAD_DEBUG && console.log(`✅ [CHUNK ${chunkIndex + 1}/${totalChunks}] Upload successful:`, {
                    progress: progress + '%',
                    bytesUploaded: totalBytesUploaded,
                    bytesUploadedFormatted: this.formatFileSize(totalBytesUploaded),
                    chunkTime: chunkTime.toFixed(2) + 'ms',
                    requestTime: chunkRequestTime.toFixed(2) + 'ms'
                });

                // Update progress
                this.updateUploadProgress(progress);
            }
            
            const chunkUploadTime = performance.now() - chunkUploadStart;
            
            FILE_UPLOAD_DEBUG && console.log('📦 All chunks uploaded successfully:', {
                totalChunks,
                totalBytesUploaded,
                totalBytesUploadedFormatted: this.formatFileSize(totalBytesUploaded),
                chunkUploadTime: chunkUploadTime.toFixed(2) + 'ms',
                averageChunkTime: (chunkUploadTime / totalChunks).toFixed(2) + 'ms'
            });

            // Complete upload with access code if required
            FILE_UPLOAD_DEBUG && console.log('🏁 Completing upload...');
            const completeStart = performance.now();
            
            // Use the completeUpload method to handle access code properly
            FILE_UPLOAD_DEBUG && console.log('🔐 Using completeUpload method for access code handling');
            const result = await this.completeUpload(uploadId);
            
            const completeTime = performance.now() - completeStart;
            const totalUploadTime = performance.now() - uploadStartTime;
            
            FILE_UPLOAD_DEBUG && console.log('🎉 Upload completed successfully:', {
                uploadId,
                result,
                performance: {
                    encryptionPrepTime: encryptionPrepTime.toFixed(2) + 'ms',
                    fileEncryptionTime: fileEncryptionTime.toFixed(2) + 'ms',
                    chunkUploadTime: chunkUploadTime.toFixed(2) + 'ms',
                    completeTime: completeTime.toFixed(2) + 'ms',
                    totalUploadTime: totalUploadTime.toFixed(2) + 'ms'
                }
            });
            
            FILE_UPLOAD_DEBUG && console.groupEnd();
            return result;
            
        } catch (error) {
            const totalTime = performance.now() - uploadStartTime;
            console.error('❌ Compatible chunk upload failed:', {
                error: error.message,
                uploadId: uploadSession.uploadId,
                totalTime: totalTime.toFixed(2) + 'ms'
            });
            FILE_UPLOAD_DEBUG && console.groupEnd();
            throw error;
        }
    }

    async uploadChunk(uploadId, chunkNumber, chunk, encryptionOptions = {}) {
        FILE_UPLOAD_DEBUG && console.log(`📦 uploadChunk called for chunk ${chunkNumber}:`, {
            hasPassword: !!encryptionOptions.password,
            hasUrlSecret: !!encryptionOptions.urlSecret,
            urlSecret: encryptionOptions.urlSecret ? 'present' : 'none'
        });

        let chunkData = await chunk.arrayBuffer();
        FILE_UPLOAD_DEBUG && console.log(`📦 Original chunk size: ${chunkData.byteLength} bytes`);
        
        // Encrypt chunk if password or URL secret is provided (but not if already pre-encrypted)
        if ((encryptionOptions.password || encryptionOptions.urlSecret) && !encryptionOptions.preEncrypted) {
            try {
                FILE_UPLOAD_DEBUG && console.log(`🔐 Encrypting chunk ${chunkNumber}...`);
                const chunkBytes = new Uint8Array(chunkData);
                const encryptedChunk = await this.encryptChunk(chunkBytes, encryptionOptions.password, encryptionOptions.urlSecret);
                chunkData = encryptedChunk;
                FILE_UPLOAD_DEBUG && console.log(`✅ Chunk ${chunkNumber} encrypted successfully, new size: ${chunkData.byteLength} bytes`);
            } catch (error) {
                console.error(`❌ Chunk ${chunkNumber} encryption failed:`, error);
                
                // Fallback: Upload without encryption if encryption fails
                FILE_UPLOAD_DEBUG && console.warn(`⚠️ Falling back to unencrypted upload for chunk ${chunkNumber}`);
                chunkData = await chunk.arrayBuffer();
                
                // Note: This is not ideal for security, but prevents upload failures
                // In production, you might want to fail the entire upload instead
            }
        } else if (encryptionOptions.preEncrypted) {
            FILE_UPLOAD_DEBUG && console.log(`📦 Chunk ${chunkNumber} is already pre-encrypted, uploading as-is`);
        } else {
            FILE_UPLOAD_DEBUG && console.log(`⚠️ No encryption options provided for chunk ${chunkNumber}, uploading unencrypted`);
        }
        
        FILE_UPLOAD_DEBUG && console.log(`📤 Uploading chunk ${chunkNumber} with size: ${chunkData.byteLength} bytes`);
        
        // Create FormData for chunk upload (same as text uploads)
        const formData = new FormData();
        formData.append('chunk', new Blob([chunkData]));
        formData.append('chunkNumber', chunkNumber);
        
        const response = await fetch(`/api/upload/chunk/${uploadId}/${chunkNumber}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Chunk ${chunkNumber} upload failed: ${error.message}`);
        }

        const result = await response.json();
        FILE_UPLOAD_DEBUG && console.log(`✅ Chunk ${chunkNumber} uploaded successfully`);
        return result;
    }

    // Encrypt chunk using the same encryption as text content
    async encryptChunk(chunkBytes, password = null, urlSecret = null) {
        try {
            FILE_UPLOAD_DEBUG && console.log('🔐 Starting chunk encryption...');
            
            const key = await this.generateEncryptionKey(password, urlSecret);
            FILE_UPLOAD_DEBUG && console.log('✅ Encryption key generated, usages:', key.usages);
            
            // Generate IV for this chunk
            let iv;
            if (password) {
                iv = await this.deriveIV(password, urlSecret);
            } else {
                iv = await this.deriveIV(urlSecret, null, 'qopy-iv-salt-v1'); // Use same salt as download
            }
            FILE_UPLOAD_DEBUG && console.log('✅ IV generated, length:', iv.length);
            
            // Ensure chunkBytes is a Uint8Array
            const chunkArray = chunkBytes instanceof Uint8Array ? chunkBytes : new Uint8Array(chunkBytes);
            
            // Encrypt the chunk
            FILE_UPLOAD_DEBUG && console.log('🔒 Encrypting chunk of size:', chunkArray.length);
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                chunkArray
            );
            FILE_UPLOAD_DEBUG && console.log('✅ Chunk encrypted successfully');
            
            // Combine IV + encrypted data
            const encryptedBytes = new Uint8Array(encryptedData);
            const ivBytes = new Uint8Array(iv);
            
            const combined = new Uint8Array(ivBytes.length + encryptedBytes.length);
            combined.set(ivBytes, 0);
            combined.set(encryptedBytes, ivBytes.length);
            
            FILE_UPLOAD_DEBUG && console.log('✅ Combined IV + encrypted data, total size:', combined.length);
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
                // Password + URL secret mode - MUST match script.js format
                const combined = urlSecret + ':' + password;
                FILE_UPLOAD_DEBUG && console.log('🔑 Using password + URL secret mode');
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(combined),
                    'PBKDF2',
                    false,
                    ['deriveKey']
                );
            } else if (urlSecret) {
                // URL secret only mode
                FILE_UPLOAD_DEBUG && console.log('🔑 Using URL secret only mode');
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
            
            FILE_UPLOAD_DEBUG && console.log('✅ Key material imported successfully');
            
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
            
            FILE_UPLOAD_DEBUG && console.log('✅ Key derived successfully, usages:', derivedKey.usages);
            
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
            // MUST match script.js format
            const combined = urlSecret + ':' + password;
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
        // Get form settings for access code and download token generation
        const passwordCheckbox = document.getElementById('file-password-checkbox');
        const passwordInput = document.getElementById('file-password-input');
        
        const requiresAccessCode = passwordCheckbox?.checked || false;
        
        // Try to get access code from form first, then from stored session
        let accessCode = requiresAccessCode ? passwordInput?.value?.trim() : null;
        if (!accessCode && this.currentUploadSession?.accessCode) {
            accessCode = this.currentUploadSession.accessCode;
            FILE_UPLOAD_DEBUG && console.log('🔐 Using stored access code from session');
        }
        
        // Hash the access code on client side before sending to server
        let accessCodeHash = null;
        if (accessCode) {
            FILE_UPLOAD_DEBUG && console.log('🔐 Generating client-side access code hash');
            accessCodeHash = await this.generateAccessCodeHash(accessCode);
            FILE_UPLOAD_DEBUG && console.log('🔐 Client-side access code hash generated:', accessCodeHash.substring(0, 16) + '...');
        }
        
        const urlSecret = this.currentUploadSession?.urlSecret || null;
        
        FILE_UPLOAD_DEBUG && console.log('🔍 Form state during completion:', {
            checkboxChecked: passwordCheckbox?.checked,
            inputValue: passwordInput?.value ? passwordInput.value.substring(0, 3) + '***' : null,
            inputValueLength: passwordInput?.value?.length || 0,
            requiresAccessCode,
            accessCode: accessCode ? accessCode.substring(0, 3) + '***' : null,
            accessCodeLength: accessCode?.length || 0
        });
        
        FILE_UPLOAD_DEBUG && console.log('🔐 Sending authentication parameters for upload completion:', {
            requiresAccessCode: !!accessCode,
            accessCode: accessCode ? accessCode.substring(0, 3) + '***' : null,
            accessCodeLength: accessCode ? accessCode.length : 0,
            hasUrlSecret: !!urlSecret
        });
        
        const requestBody = {
            password: accessCodeHash, // Send hashed access code instead of plaintext
            urlSecret: urlSecret
            // checksums can be omitted, server will validate automatically
        };
        
        FILE_UPLOAD_DEBUG && console.log('📡 Upload completion request body:', {
            password: accessCodeHash ? accessCodeHash.substring(0, 16) + '...' : null,
            passwordLength: accessCodeHash ? accessCodeHash.length : 0,
            hasUrlSecret: !!urlSecret,
            isHashed: !!accessCodeHash
        });
        
        const response = await fetch(`/api/upload/complete/${uploadId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
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
            FILE_UPLOAD_DEBUG && console.log('❌ Cancelling upload:', this.currentUpload.uploadId);
            
            await fetch(`/api/upload/${this.currentUpload.uploadId}`, {
                method: 'DELETE'
            });
            
            FILE_UPLOAD_DEBUG && console.log('✅ Upload cancelled');
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
        // Calculate percentage with proper bounds checking and consistent rounding
        const percentageRaw = totalChunks > 0 ? (uploadedChunks / totalChunks) * 100 : 0;
        const percentage = Math.min(100, Math.max(0, Math.round(percentageRaw * 10) / 10)); // Round to 1 decimal
        
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        const progressPercentage = document.getElementById('upload-progress-percentage');

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = `Uploading chunks`;
        }

        if (progressPercentage) {
            progressPercentage.textContent = `${percentage}%`;
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
        FILE_UPLOAD_DEBUG && console.log('🎉 Upload successful:', result);
        FILE_UPLOAD_DEBUG && console.log('🔍 Current upload session:', this.currentUploadSession);
        
        // Hide progress and show success
        this.showProgressUI(false);
        
        // Create URL with compatible secret (backward-compatible approach)
        let finalUrl = result.url;
        let urlFragment = '';
        
        if (this.currentUploadSession && this.currentUploadSession.compatibleSecret) {
            urlFragment = this.currentUploadSession.compatibleSecret;
            const secretType = urlFragment.length >= 40 ? 'Enhanced' : 'Legacy';
            FILE_UPLOAD_DEBUG && console.log(`🔗 Compatible secret for link (${secretType}):`, urlFragment.substring(0, 8) + '...');
        }
        
        if (urlFragment) {
            finalUrl += '#' + urlFragment;
        }
        
        // Show success message using the main success modal
        const originalMetadata = this.currentUploadSession?.originalMetadata || {};
        const secretType = urlFragment?.length >= 40 ? 'Enhanced (256-bit)' : 'Legacy (128-bit)';
        const isEnhanced = urlFragment?.length >= 40;
        
        // Check if access code was used
        const requiresAccessCode = document.getElementById('file-password-checkbox')?.checked || false;
        const accessCodeUsed = requiresAccessCode && document.getElementById('file-password-input')?.value?.trim();
        
        FILE_UPLOAD_DEBUG && console.log('🔐 Upload security summary:', {
            secretType,
            isEnhanced,
            requiresAccessCode,
            accessCodeUsed: !!accessCodeUsed
        });
        
        // Use the main success modal instead of a separate upload-success div
        document.getElementById('share-url').value = finalUrl;
        document.getElementById('clip-id').value = result.clipId;
        
        // Hide clip ID section for file uploads (since they use 10-character IDs with URL secrets)
        const clipIdSection = document.getElementById('clip-id-section');
        if (clipIdSection) {
            clipIdSection.style.display = 'none';
        }
        
        // Generate QR code using the correct method
        try {
            const qrCodeImg = document.getElementById('qr-code');
            if (qrCodeImg && window.QRCode) {
                // Clear any existing QR code
                qrCodeImg.style.display = 'none';
                
                // Create a temporary container for QR code generation
                const tempContainer = document.createElement('div');
                tempContainer.style.position = 'absolute';
                tempContainer.style.left = '-9999px';
                tempContainer.style.top = '-9999px';
                document.body.appendChild(tempContainer);
                
                // Generate QR code using the qrcode.js library
                new QRCode(tempContainer, {
                    text: finalUrl,
                    width: 200,
                    height: 200,
                    colorDark: '#000000',
                    colorLight: '#FFFFFF',
                    correctLevel: QRCode.CorrectLevel.M
                });
                
                // Wait a moment for the QR code to be generated
                setTimeout(() => {
                    const generatedImg = tempContainer.querySelector('img');
                    if (generatedImg) {
                        qrCodeImg.src = generatedImg.src;
                        qrCodeImg.style.display = 'block';
                    }
                    // Clean up temporary container
                    document.body.removeChild(tempContainer);
                }, 100);
            }
        } catch (error) {
            FILE_UPLOAD_DEBUG && console.warn('QR code generation failed:', error);
            this.showToast('QR code generation failed, but URL is available', 'info');
        }
        
        // Set expiry time with robust error handling
        try {
            const expiresAt = result.expiresAt;
            FILE_UPLOAD_DEBUG && console.log('🔍 Debug expiresAt:', { value: expiresAt, type: typeof expiresAt });
            
            if (expiresAt === null || expiresAt === undefined) {
                document.getElementById('expiry-time').textContent = 'No expiration set';
                return;
            }
            
            // Handle empty strings or zero values
            if (expiresAt === '' || expiresAt === 0 || expiresAt === '0') {
                document.getElementById('expiry-time').textContent = 'No expiration';
                return;
            }
            
            // Convert to number for timestamp processing
            let timestamp;
            if (typeof expiresAt === 'string') {
                // Validate string format (should be numeric)
                if (!/^\d+$/.test(expiresAt.trim())) {
                    FILE_UPLOAD_DEBUG && console.warn('Invalid timestamp format:', expiresAt);
                    document.getElementById('expiry-time').textContent = 'Invalid date format';
                    return;
                }
                timestamp = parseInt(expiresAt.trim(), 10);
            } else if (typeof expiresAt === 'number') {
                timestamp = expiresAt;
            } else {
                FILE_UPLOAD_DEBUG && console.warn('Unexpected expiry date type:', typeof expiresAt, expiresAt);
                document.getElementById('expiry-time').textContent = 'Invalid date type';
                return;
            }
            
            // Auto-detect seconds vs milliseconds
            let finalTimestamp = timestamp;
            
            // If timestamp looks like seconds (smaller number), convert to milliseconds
            if (timestamp < 10000000000) { // Less than year 2286 in seconds
                finalTimestamp = timestamp * 1000;
                FILE_UPLOAD_DEBUG && console.log('Converted seconds to milliseconds:', timestamp, '->', finalTimestamp);
            }
            
            // Create and validate Date object
            const expiryDate = new Date(finalTimestamp);
            
            if (!isNaN(expiryDate.getTime())) {
                const formattedDate = expiryDate.toLocaleString();
                FILE_UPLOAD_DEBUG && console.log('Successfully formatted date:', formattedDate);
                const expiryElement = document.getElementById('expiry-time');
                if (expiryElement) {
                    expiryElement.textContent = formattedDate;
                }
            } else {
                FILE_UPLOAD_DEBUG && console.warn('Failed to create valid date from timestamp:', finalTimestamp);
                document.getElementById('expiry-time').textContent = 'Invalid date';
            }
        } catch (error) {
            console.error('🚨 Expiry date error:', error, { expiresAt: result.expiresAt });
            document.getElementById('expiry-time').textContent = 'Error formatting date';
        }
        
        // Show the main success modal
        const successModal = document.getElementById('success-modal');
        if (successModal) {
            successModal.classList.remove('hidden');
        }
        
        // File upload success is handled by the main success modal above
        
        // Clear the current upload session
        this.currentUploadSession = null;
    }

    // Update upload progress with consistent bounds checking
    updateUploadProgress(progress) {
        // Ensure progress is within bounds and properly rounded
        const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));
        
        const progressBar = document.getElementById('upload-progress-bar');
        const progressPercentage = document.getElementById('upload-progress-percentage');
        
        if (progressBar) {
            progressBar.style.width = safeProgress + '%';
        }
        
        // Don't update progressText here - it should keep showing "Uploading chunk X/Y"
        // Only update the percentage display element
        if (progressPercentage) {
            progressPercentage.textContent = `${safeProgress}%`;
        }
        
        FILE_UPLOAD_DEBUG && console.log(`📊 Upload progress: ${safeProgress}%`);
    }

    // Remove minimal padding from file data (shared method for both upload and download)
    removeMinimalPadding(paddedData, originalSize = null) {
        if (!originalSize) {
            // If no original size provided, return data as-is
            return paddedData;
        }
        
        if (originalSize > paddedData.length) {
            FILE_UPLOAD_DEBUG && console.warn('⚠️ Original size larger than padded data, returning padded data');
            return paddedData;
        }
        
        // Extract original data by removing padding
        const originalData = paddedData.slice(0, originalSize);
        const paddingRemoved = paddedData.length - originalSize;
        
        if (paddingRemoved > 0) {
            FILE_UPLOAD_DEBUG && console.log(`🔓 Padding removed: ${paddingRemoved} bytes`);
        }
        
        return originalData;
    }

    // Store original metadata for display in success message
    storeOriginalMetadata(filename, size, mimeType) {
        if (!this.currentUploadSession) {
            this.currentUploadSession = {};
        }
        
        this.currentUploadSession.originalMetadata = {
            filename: filename,
            size: size,
            mimeType: mimeType
        };
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
        FILE_UPLOAD_DEBUG && console.log('ℹ️', message);
        
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

    // Generate access code hash on client side (same as server)
    async generateAccessCodeHash(password, salt) {
        if (!salt) {
            salt = await this._getPbkdf2Salt();
        }
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        
        const derivedBits = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 100000,
                hash: 'SHA-512'
            },
            keyMaterial,
            512 // 64 bytes = 512 bits
        );
        
        return Array.from(new Uint8Array(derivedBits), byte => 
            byte.toString(16).padStart(2, '0')
        ).join('');
    }

    // Fetch PBKDF2 salt from server config (cached)
    async _getPbkdf2Salt() {
        if (this._pbkdf2Salt) return this._pbkdf2Salt;
        try {
            const res = await fetch('/api/config');
            const cfg = await res.json();
            this._pbkdf2Salt = cfg.pbkdf2Salt || 'qopy-access-salt-v1';
        } catch {
            this._pbkdf2Salt = 'qopy-access-salt-v1';
        }
        return this._pbkdf2Salt;
    }

    // Toast Notifications
    showToast(message, type = 'error') {
        let toastId, messageId;
        
        if (type === 'error') {
            toastId = 'error-toast';
            messageId = 'error-message';
        } else if (type === 'success' || type === 'info') {
            // Use success toast for both success and info messages
            toastId = 'success-toast';
            messageId = 'success-toast-message';
        }
        
        // Hide any existing toasts
        document.querySelectorAll('#error-toast, #info-toast, #success-toast').forEach(toast => {
            toast.classList.add('hidden');
        });
        
        // Show new toast
        const messageElement = document.getElementById(messageId);
        const toastElement = document.getElementById(toastId);
        
        if (messageElement && toastElement) {
            messageElement.textContent = message;
            toastElement.classList.remove('hidden');
            
            // Auto-hide after 3 seconds for success/copy messages, 4 seconds for errors
            const autoHideDelay = (type === 'success' || type === 'info') ? 3000 : 4000;
            setTimeout(() => {
                toastElement.classList.add('hidden');
            }, autoHideDelay);
        } else {
            // Fallback to console if toast elements don't exist
            FILE_UPLOAD_DEBUG && console.log(`Toast (${type}): ${message}`);
        }
    }
}

// File Download Manager with Backward-Compatible Security
class FileDownloadManager {
    constructor() {
        this.currentDownload = null;
    }

    // Extract compatible secret from current URL fragment (supports both legacy and enhanced)
    extractCompatibleSecret() {
        FILE_UPLOAD_DEBUG && console.group('🔍 [SECRET EXTRACTION] Analyzing URL Fragment');
        
        try {
            const hash = window.location.hash;
            
            if (hash && hash.length > 1) {
                const secret = hash.substring(1); // Remove the # symbol
                
                // Detect type for comprehensive logging
                const isLegacy = secret.length === 16 && /^[A-Za-z0-9]{16}$/.test(secret);
                const isEnhanced = secret.length >= 40;
                const isUnknown = !isLegacy && !isEnhanced;
                
                let detectedFormat;
                let expectedSecurity;
                let compatibility;
                
                if (isLegacy) {
                    detectedFormat = 'LEGACY_URL_SECRET';
                    expectedSecurity = '128-bit entropy';
                    compatibility = 'script.js compatible';
                    FILE_UPLOAD_DEBUG && console.log('🔑 Detected legacy URL secret (16 chars)');
                } else if (isEnhanced) {
                    detectedFormat = 'ENHANCED_PASSPHRASE';
                    expectedSecurity = '256-bit entropy';
                    compatibility = 'Proton Drive style';
                    FILE_UPLOAD_DEBUG && console.log('🔑 Detected enhanced passphrase (43+ chars)');
                } else {
                    detectedFormat = 'UNKNOWN_FORMAT';
                    expectedSecurity = 'Unknown';
                    compatibility = 'May not be compatible';
                    FILE_UPLOAD_DEBUG && console.log('⚠️ Detected unknown secret format');
                }
                
                FILE_UPLOAD_DEBUG && console.log('✅ Secret extraction completed:', {
                    detectedFormat,
                    secretLength: secret.length,
                    expectedSecurity,
                    compatibility,
                    willUseParams: {
                        salt: isLegacy ? 'qopy-salt-v1' : 'qopy-enhanced-salt-v2',
                        iterations: isLegacy ? 100000 : 250000
                    }
                });
                
                FILE_UPLOAD_DEBUG && console.groupEnd();
                return secret;
            } else {
                FILE_UPLOAD_DEBUG && console.log('❌ No URL fragment found - secret required for decryption');
                FILE_UPLOAD_DEBUG && console.groupEnd();
                return null;
            }
        } catch (error) {
            console.error('❌ Secret extraction error:', error.message);
            FILE_UPLOAD_DEBUG && console.groupEnd();
            throw error;
        }
    }

    async downloadFile(clipId, filename) {
        const downloadStartTime = performance.now();
        FILE_UPLOAD_DEBUG && console.group('📥 [DOWNLOAD] Starting Backward-Compatible Zero-Knowledge Download');
        
        try {
            // Extract compatible secret from current URL
            const compatibleSecret = this.extractCompatibleSecret();
            const password = this.getPasswordFromUser();
            
            const secretType = compatibleSecret?.length >= 40 ? 'Enhanced' : compatibleSecret?.length === 16 ? 'Legacy' : 'Unknown';
            
            FILE_UPLOAD_DEBUG && console.log('🔐 Download authentication analysis:', { 
                hasCompatibleSecret: !!compatibleSecret, 
                hasPassword: !!password,
                secretLength: compatibleSecret ? compatibleSecret.length : 0,
                passwordLength: password ? password.length : 0,
                secretType,
                authenticationMode: password && compatibleSecret ? 'DUAL_AUTH' : compatibleSecret ? 'SECRET_ONLY' : 'NO_AUTH'
            });
            
            if (!compatibleSecret) {
                throw new Error('No compatible secret found in URL - required for zero-knowledge decryption');
            }
            
            // Generate download token for authentication
            FILE_UPLOAD_DEBUG && console.log('🎫 Generating download authentication token...');
            const tokenStart = performance.now();
            const downloadToken = await this.generateDownloadToken(clipId, password, compatibleSecret);
            const tokenTime = performance.now() - tokenStart;
            
            FILE_UPLOAD_DEBUG && console.log('✅ Download token generated:', {
                tokenLength: downloadToken.length,
                tokenPreview: downloadToken.substring(0, 8) + '...',
                generationTime: tokenTime.toFixed(2) + 'ms'
            });
            
            // Download encrypted file
            FILE_UPLOAD_DEBUG && console.log('📡 Requesting encrypted file from server...');
            const downloadRequestStart = performance.now();
            
            const downloadResponse = await fetch(`/api/download/${clipId}/${downloadToken}`);
            
            const downloadRequestTime = performance.now() - downloadRequestStart;
            
            if (!downloadResponse.ok) {
                console.error('❌ Server download request failed:', {
                    status: downloadResponse.status,
                    statusText: downloadResponse.statusText,
                    clipId,
                    requestTime: downloadRequestTime.toFixed(2) + 'ms'
                });
                throw new Error('Download failed: ' + downloadResponse.statusText);
            }
            
            const encryptedData = await downloadResponse.arrayBuffer();
            const downloadDataTime = performance.now() - downloadRequestStart;
            
            FILE_UPLOAD_DEBUG && console.log('📦 Encrypted file downloaded successfully:', {
                encryptedSize: encryptedData.byteLength,
                encryptedSizeFormatted: this.formatFileSize(encryptedData.byteLength),
                downloadTime: downloadDataTime.toFixed(2) + 'ms',
                requestTime: downloadRequestTime.toFixed(2) + 'ms'
            });
            
            // Use compatible decryption based on secret type
            FILE_UPLOAD_DEBUG && console.log(`🔓 Starting compatible decryption for ${secretType} format...`);
            const decryptionStart = performance.now();
            
            const decryptionKey = await this.generateCompatibleEncryptionKey(password, compatibleSecret);
            const iv = await this.deriveCompatibleIV(password || '', compatibleSecret);
            
            const keyGenTime = performance.now() - decryptionStart;
            
            FILE_UPLOAD_DEBUG && console.log('🔑 Decryption keys prepared:', {
                secretType,
                keyGenerationTime: keyGenTime.toFixed(2) + 'ms',
                ivLength: iv.length
            });
            
            // Decrypt the file
            FILE_UPLOAD_DEBUG && console.log('🔓 Decrypting file data...');
            const fileDecryptionStart = performance.now();
            
            const decryptedData = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                decryptionKey,
                encryptedData
            );
            
            const fileDecryptionTime = performance.now() - fileDecryptionStart;
            
            FILE_UPLOAD_DEBUG && console.log('✅ File decryption completed:', {
                encryptedSize: encryptedData.byteLength,
                decryptedSize: decryptedData.byteLength,
                decryptionOverhead: encryptedData.byteLength - decryptedData.byteLength,
                decryptionTime: fileDecryptionTime.toFixed(2) + 'ms'
            });
            
            // Extract metadata from decrypted file (compatible version)
            FILE_UPLOAD_DEBUG && console.log('📋 Extracting embedded metadata...');
            const metadataStart = performance.now();
            const { fileData, metadata } = await this.extractCompatibleMetadata(new Uint8Array(decryptedData), compatibleSecret);
            const metadataTime = performance.now() - metadataStart;
            
            FILE_UPLOAD_DEBUG && console.log('📋 Metadata extraction completed:', {
                originalFilename: metadata?.filename,
                originalSize: metadata?.size,
                originalSizeFormatted: metadata?.size ? this.formatFileSize(metadata.size) : 'Unknown',
                mimeType: metadata?.mimeType,
                version: metadata?.version,
                paddingRemoved: decryptedData.byteLength - fileData.length,
                metadataTime: metadataTime.toFixed(2) + 'ms'
            });
            
            // Create blob with correct MIME type from metadata
            FILE_UPLOAD_DEBUG && console.log('🏗️ Creating download blob...');
            const blobStart = performance.now();
            
            const blob = new Blob([fileData], { type: metadata?.mimeType || 'application/octet-stream' });
            
            const blobTime = performance.now() - blobStart;
            
            FILE_UPLOAD_DEBUG && console.log('📦 Download blob created:', {
                blobSize: blob.size,
                blobSizeFormatted: this.formatFileSize(blob.size),
                mimeType: blob.type,
                blobCreationTime: blobTime.toFixed(2) + 'ms'
            });
            
            // Create download link and trigger download
            FILE_UPLOAD_DEBUG && console.log('💾 Triggering browser download...');
            const triggerStart = performance.now();
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = metadata?.filename || filename || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            const triggerTime = performance.now() - triggerStart;
            const totalDownloadTime = performance.now() - downloadStartTime;
            
            FILE_UPLOAD_DEBUG && console.log('🎉 Download process completed successfully:', {
                finalFilename: metadata?.filename || filename || 'download',
                finalSize: fileData.length,
                finalSizeFormatted: this.formatFileSize(fileData.length),
                performance: {
                    tokenTime: tokenTime.toFixed(2) + 'ms',
                    downloadTime: downloadDataTime.toFixed(2) + 'ms',
                    keyGenTime: keyGenTime.toFixed(2) + 'ms',
                    decryptionTime: fileDecryptionTime.toFixed(2) + 'ms',
                    metadataTime: metadataTime.toFixed(2) + 'ms',
                    blobTime: blobTime.toFixed(2) + 'ms',
                    triggerTime: triggerTime.toFixed(2) + 'ms',
                    totalTime: totalDownloadTime.toFixed(2) + 'ms'
                }
            });
            
            // Show success message
            this.showDownloadSuccess(metadata, secretType);
            
            FILE_UPLOAD_DEBUG && console.groupEnd();
            
        } catch (error) {
            const totalTime = performance.now() - downloadStartTime;
            console.error('❌ Compatible download failed:', {
                error: error.message,
                clipId,
                requestedFilename: filename,
                totalTime: totalTime.toFixed(2) + 'ms',
                stack: error.stack
            });
            FILE_UPLOAD_DEBUG && console.groupEnd();
            this.showDownloadError(error.message);
        }
    }

    // Extract metadata with comprehensive logging
    async extractCompatibleMetadata(fileWithMetadata, compatibleSecret) {
        const startTime = performance.now();
        FILE_UPLOAD_DEBUG && console.group('📋 [METADATA EXTRACTION] Decrypting Embedded Metadata');
        
        try {
            if (fileWithMetadata.length < 4) {
                throw new Error(`File too small to contain metadata: ${fileWithMetadata.length} bytes`);
            }
            
            // Read metadata length (first 4 bytes)
            FILE_UPLOAD_DEBUG && console.log('📏 Reading metadata length header...');
            const metadataLengthBytes = fileWithMetadata.slice(0, 4);
            const metadataLength = new DataView(metadataLengthBytes.buffer).getUint32(0, true);
            
            FILE_UPLOAD_DEBUG && console.log('📊 Metadata length analysis:', {
                lengthHeaderBytes: Array.from(metadataLengthBytes),
                metadataLength,
                metadataLengthFormatted: this.formatFileSize(metadataLength),
                remainingFileSize: fileWithMetadata.length - 4,
                isValidLength: metadataLength > 0 && metadataLength <= fileWithMetadata.length - 4
            });
            
            if (metadataLength <= 0 || metadataLength > fileWithMetadata.length - 4) {
                throw new Error(`Invalid metadata length: ${metadataLength} bytes (file size: ${fileWithMetadata.length})`);
            }
            
            // Extract encrypted metadata and file data
            FILE_UPLOAD_DEBUG && console.log('✂️ Extracting metadata and file data sections...');
            const encryptedMetadata = fileWithMetadata.slice(4, 4 + metadataLength);
            const fileData = fileWithMetadata.slice(4 + metadataLength);
            
            FILE_UPLOAD_DEBUG && console.log('📦 Data sections extracted:', {
                encryptedMetadataSize: encryptedMetadata.length,
                fileDataSize: fileData.length,
                totalReconstructed: 4 + encryptedMetadata.length + fileData.length,
                matchesOriginal: (4 + encryptedMetadata.length + fileData.length) === fileWithMetadata.length
            });
            
            // Decrypt metadata using compatible key derivation
            FILE_UPLOAD_DEBUG && console.log('🔓 Decrypting metadata with compatible keys...');
            const keyGenStart = performance.now();
            const metadataKey = await this.generateCompatibleEncryptionKey(null, compatibleSecret);
            const metadataIV = await this.deriveCompatibleIV(null, compatibleSecret, 'qopy-metadata-salt');
            const keyGenTime = performance.now() - keyGenStart;
            
            FILE_UPLOAD_DEBUG && console.log('🔑 Metadata decryption keys generated:', {
                keyGenerationTime: keyGenTime.toFixed(2) + 'ms',
                ivLength: metadataIV.length,
                salt: 'qopy-metadata-salt'
            });
            
            const decryptionStart = performance.now();
            const decryptedMetadataBuffer = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: metadataIV
                },
                metadataKey,
                encryptedMetadata
            );
            const decryptionTime = performance.now() - decryptionStart;
            
            FILE_UPLOAD_DEBUG && console.log('🔓 Metadata decryption completed:', {
                encryptedSize: encryptedMetadata.length,
                decryptedSize: decryptedMetadataBuffer.byteLength,
                decryptionTime: decryptionTime.toFixed(2) + 'ms'
            });
            
            const metadataJson = new TextDecoder().decode(decryptedMetadataBuffer);
            const metadata = JSON.parse(metadataJson);
            
            FILE_UPLOAD_DEBUG && console.log('📋 Metadata parsing completed:', {
                jsonLength: metadataJson.length,
                jsonPreview: metadataJson.substring(0, 100) + '...',
                parsedMetadata: metadata
            });
            
            // Remove padding if present
            FILE_UPLOAD_DEBUG && console.log('✂️ Removing padding from file data...');
            const paddingStart = performance.now();
            const finalFileData = this.removeMinimalPadding(fileData, metadata.size);
            const paddingTime = performance.now() - paddingStart;
            
            const paddingRemoved = fileData.length - finalFileData.length;
            
            FILE_UPLOAD_DEBUG && console.log('🔓 Padding removal completed:', {
                originalFileDataSize: fileData.length,
                finalFileDataSize: finalFileData.length,
                paddingRemoved,
                paddingTime: paddingTime.toFixed(2) + 'ms',
                paddingWasPresent: paddingRemoved > 0
            });
            
            const totalTime = performance.now() - startTime;
            
            FILE_UPLOAD_DEBUG && console.log('✅ Compatible metadata extraction successful:', {
                metadata: {
                    filename: metadata.filename,
                    size: metadata.size,
                    mimeType: metadata.mimeType,
                    version: metadata.version,
                    timestamp: new Date(metadata.timestamp).toISOString()
                },
                performance: {
                    keyGenTime: keyGenTime.toFixed(2) + 'ms',
                    decryptionTime: decryptionTime.toFixed(2) + 'ms',
                    paddingTime: paddingTime.toFixed(2) + 'ms',
                    totalTime: totalTime.toFixed(2) + 'ms'
                }
            });
            
            FILE_UPLOAD_DEBUG && console.groupEnd();
            return { fileData: finalFileData, metadata };
            
        } catch (error) {
            const totalTime = performance.now() - startTime;
            console.error('❌ Compatible metadata extraction failed:', {
                error: error.message,
                fileSize: fileWithMetadata.length,
                secretLength: compatibleSecret ? compatibleSecret.length : 0,
                totalTime: totalTime.toFixed(2) + 'ms',
                stack: error.stack
            });
            FILE_UPLOAD_DEBUG && console.groupEnd();
            
            // Return file as-is if metadata extraction fails
            FILE_UPLOAD_DEBUG && console.log('⚠️ Falling back to raw file data without metadata');
            return { fileData: fileWithMetadata, metadata: null };
        }
    }

    // Generate download token with logging
    async generateDownloadToken(clipId, password = null, compatibleSecret = null) {
        const startTime = performance.now();
        FILE_UPLOAD_DEBUG && console.group('🎫 [TOKEN] Generating Download Authentication Token');
        
        try {
            
            const encoder = new TextEncoder();
            const tokenData = `enhanced:${clipId}:${password || ''}:${compatibleSecret || ''}`;
            
            FILE_UPLOAD_DEBUG && console.log('🔨 Token data assembly:', {
                tokenDataLength: tokenData.length,
                tokenDataPreview: tokenData.substring(0, 50) + '...',
                algorithm: 'Compatible (deterministic)'
            });
            
            const hashStart = performance.now();
            const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(tokenData));
            const hashTime = performance.now() - hashStart;
            
            const hashArray = new Uint8Array(hashBuffer);
            const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
            const finalToken = hashHex.substring(0, 32); // 32 character token
            
            const totalTime = performance.now() - startTime;
            
            FILE_UPLOAD_DEBUG && console.log('✅ Download token generated successfully:', {
                fullHashLength: hashHex.length,
                tokenLength: finalToken.length,
                tokenPreview: finalToken.substring(0, 8) + '...',
                performance: {
                    hashTime: hashTime.toFixed(2) + 'ms',
                    totalTime: totalTime.toFixed(2) + 'ms'
                }
            });
            
            FILE_UPLOAD_DEBUG && console.groupEnd();
            return finalToken;
            
        } catch (error) {
            const totalTime = performance.now() - startTime;
            console.error('❌ Token generation failed:', {
                error: error.message,
                clipId,
                totalTime: totalTime.toFixed(2) + 'ms'
            });
            FILE_UPLOAD_DEBUG && console.groupEnd();
            throw error;
        }
    }

    // Compatible key generation methods
    async generateCompatibleEncryptionKey(password = null, secret = null) {
        try {
            const encoder = new TextEncoder();
            
            // Detect secret format
            const isOldUrlSecret = secret && secret.length === 16 && /^[A-Za-z0-9]{16}$/.test(secret);
            const isEnhancedPassphrase = secret && secret.length >= 40;
            
            let keyMaterial;
            let salt;
            let iterations;
            
            if (password && secret) {
                // Combined mode
                if (isOldUrlSecret) {
                    // Legacy format: urlSecret:password (compatible with script.js)
                    const combined = secret + ':' + password;
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(combined),
                        'PBKDF2',
                        false,
                        ['deriveKey']
                    );
                    salt = 'qopy-salt-v1';           // Legacy salt
                    iterations = 100000;             // Legacy iterations
                } else if (isEnhancedPassphrase) {
                    // Enhanced format: passphrase:password  
                    const combined = secret + ':' + password;
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(combined),
                        'PBKDF2',
                        false,
                        ['deriveKey']
                    );
                    salt = 'qopy-enhanced-salt-v2';   // Enhanced salt
                    iterations = 250000;             // Enhanced iterations
                } else {
                    throw new Error('Invalid secret format');
                }
            } else if (secret) {
                // Secret-only mode
                if (isOldUrlSecret) {
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(secret),
                        'PBKDF2',
                        false,
                        ['deriveKey']
                    );
                    salt = 'qopy-salt-v1';
                    iterations = 100000;
                } else if (isEnhancedPassphrase) {
                    keyMaterial = await window.crypto.subtle.importKey(
                        'raw',
                        encoder.encode(secret),
                        'PBKDF2',
                        false,
                        ['deriveKey']
                    );
                    salt = 'qopy-enhanced-salt-v2';
                    iterations = 250000;
                } else {
                    throw new Error('Invalid secret format');
                }
            } else {
                throw new Error('Either password or secret must be provided');
            }
            
            const derivedKey = await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: encoder.encode(salt),
                    iterations: iterations,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            
            return derivedKey;
        } catch (error) {
            throw new Error('Failed to generate compatible encryption key: ' + error.message);
        }
    }

    async deriveCompatibleIV(password, secret = null, customSalt = null) {
        const encoder = new TextEncoder();
        
        // Detect format
        const isOldUrlSecret = secret && secret.length === 16 && /^[A-Za-z0-9]{16}$/.test(secret);
        const isEnhancedPassphrase = secret && secret.length >= 40;
        
        let keyMaterial;
        let salt;
        let iterations;
        
        if (password && secret) {
            // Combined mode
            if (isOldUrlSecret) {
                const combined = secret + ':' + password;
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(combined),
                    'PBKDF2',
                    false,
                    ['deriveBits']
                );
                salt = customSalt || 'qopy-iv-salt-v1';
                iterations = 100000;
            } else if (isEnhancedPassphrase) {
                const combined = secret + ':' + password;
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(combined),
                    'PBKDF2',
                    false,
                    ['deriveBits']
                );
                salt = customSalt || 'qopy-enhanced-iv-salt-v2';
                iterations = 100000;
            } else {
                throw new Error('Invalid secret format for IV derivation');
            }
        } else if (secret) {
            // Secret-only mode
            if (isOldUrlSecret) {
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(secret),
                    'PBKDF2',
                    false,
                    ['deriveBits']
                );
                salt = customSalt || 'qopy-iv-salt-v1';
                iterations = 100000;
            } else if (isEnhancedPassphrase) {
                keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(secret),
                    'PBKDF2',
                    false,
                    ['deriveBits']
                );
                salt = customSalt || 'qopy-enhanced-iv-salt-v2';
                iterations = 100000;
            } else {
                throw new Error('Invalid secret format for IV derivation');
            }
        } else {
            throw new Error('Either password or secret must be provided for IV derivation');
        }
        
        const ivBytes = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            96
        );
        
        return new Uint8Array(ivBytes);
    }

    // Show download success message (updated for compatibility info)
    showDownloadSuccess(metadata, secretType) {
        FILE_UPLOAD_DEBUG && console.log('🎉 Backward-compatible zero-knowledge download successful!');
        
        let successDiv = document.getElementById('download-success');
        if (!successDiv) {
            successDiv = document.createElement('div');
            successDiv.id = 'download-success';
            successDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 15px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 1000;
                max-width: min(400px, calc(100vw - 24px));
            `;
            document.body.appendChild(successDiv);
        }
        
        successDiv.innerHTML = `
            <h4>✅ Compatible Zero-Knowledge Download Successful!</h4>
            <p><strong>File:</strong> ${metadata?.filename || 'Unknown'}</p>
            <p><strong>Size:</strong> ${metadata?.size ? this.formatFileSize(metadata.size) : 'Unknown'}</p>
            <p><strong>Type:</strong> ${metadata?.mimeType || 'Unknown'}</p>
            <p><strong>Security:</strong> ${secretType} encryption verified ✓</p>
            <p><strong>Version:</strong> ${metadata?.version || 'Legacy'}</p>
        `;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 5000);
    }



    // Get password from user input (if available)
    getPasswordFromUser() {
        const passwordInput = document.getElementById('retrieve-password-input');
        return passwordInput ? passwordInput.value.trim() : null;
    }

    // Format file size helper method
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Show download error message
    showDownloadError(errorMessage) {
        console.error('❌ Enhanced download failed:', errorMessage);
        
        // Create or update error message
        let errorDiv = document.getElementById('download-error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'download-error';
            errorDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f44336;
                color: white;
                padding: 15px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 1000;
                max-width: min(400px, calc(100vw - 24px));
            `;
            document.body.appendChild(errorDiv);
        }
        
        errorDiv.innerHTML = `
            <h4>❌ Enhanced Download Failed</h4>
            <p>${errorMessage}</p>
            <p><small>Please check your link and try again.</small></p>
        `;
        
        // Auto-hide after 8 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 8000);
    }
}

// Initialize when DOM is loaded
let fileUploadManager;
let fileDownloadManager;

document.addEventListener('DOMContentLoaded', () => {
    fileUploadManager = new FileUploadManager();
    fileDownloadManager = new FileDownloadManager();
    
    FILE_UPLOAD_DEBUG && console.log('🗂️ File upload/download managers initialized');
}); 
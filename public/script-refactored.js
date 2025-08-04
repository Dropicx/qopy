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

// Import helper modules and constants
import { UIHelpers } from './js/helpers/UIHelpers.js';
import { ApiClient } from './js/services/ApiClient.js';
import { 
    ERROR_MESSAGES, 
    SUCCESS_MESSAGES, 
    INFO_MESSAGES, 
    TOAST_TYPES, 
    getErrorMessage, 
    getSuccessMessage, 
    getInfoMessage 
} from './js/constants/ErrorMessages.js';

// Qopy Application JavaScript
class ClipboardApp {
    constructor() {
        this.baseUrl = window.location.origin;
        this.apiClient = new ApiClient({ 
            baseUrl: this.baseUrl,
            debug: true,
            onLoadingStateChange: (isLoading) => {
                if (isLoading) {
                    this.showLoading('retrieve-loading');
                } else {
                    this.hideLoading('retrieve-loading');
                }
            }
        });
        this.init();
    }

    init() {
        this.setupTypingAnimation();
        this.setupEventListeners();
        this.setupRouting();
        this.setupKeyboardShortcuts();
        this.checkPrivacyNotice();
        
        // Ensure password field is visible on page load
        setTimeout(() => {
            const passwordField = document.getElementById('password-input');
            if (passwordField) {
                passwordField.style.display = 'block';
                passwordField.classList.remove('hidden');
            }
        }, 500);
    }

    // Typing Animation
    setupTypingAnimation() {
        const text = 'qopy.app';
        const typingElement = document.getElementById('typing-text');
        const cursorElement = document.querySelector('.cursor');
        let currentIndex = 0;
        
        // Hide cursor initially
        cursorElement.style.opacity = '0';
        
        const typeNextChar = () => {
            if (currentIndex < text.length) {
                const char = text[currentIndex];
                const charSpan = document.createElement('span');
                charSpan.textContent = char;
                charSpan.className = 'char';
                charSpan.style.animationDelay = `${currentIndex * 0.15}s`;
                typingElement.appendChild(charSpan);
                currentIndex++;
                
                // Add slight delay between characters
                setTimeout(typeNextChar, 150);
            } else {
                // Animation complete - show cursor
                cursorElement.style.opacity = '1';
            }
        };
        
        // Start typing animation after a short delay
        setTimeout(typeNextChar, 500);
    }

    // Event Listeners
    setupEventListeners() {
        // Tab navigation
        document.getElementById('share-tab').addEventListener('click', () => {
            this.switchTab('share');
        });

        document.getElementById('file-tab').addEventListener('click', () => {
            this.switchTab('file');
        });

        document.getElementById('retrieve-tab').addEventListener('click', () => {
            this.switchTab('retrieve');
        });

        // Character counter
        const contentInput = document.getElementById('content-input');
        contentInput.addEventListener('input', this.updateCharCounter.bind(this));

        // Share form
        document.getElementById('share-button').addEventListener('click', this.shareContent.bind(this));

        // File upload
        const fileInput = document.getElementById('file-input');
        const fileButton = document.getElementById('file-share-button');
        const dropZone = document.getElementById('drop-zone');
        
        if (fileInput && fileButton) {
            fileInput.addEventListener('change', this.handleFileUpload.bind(this));
            fileButton.addEventListener('click', this.shareFile.bind(this));
        }
        
        if (dropZone) {
            dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
            dropZone.addEventListener('drop', this.handleFileDrop.bind(this));
        }

        // Retrieve form
        document.getElementById('retrieve-button').addEventListener('click', this.retrieveContent.bind(this));
        document.getElementById('retrieve-input').addEventListener('input', (e) => {
            const retrieveButton = document.getElementById('retrieve-button');
            retrieveButton.disabled = !e.target.value.trim();
        });

        // Auto-retrieve on page load if ID is in URL
        const clipId = this.getClipIdFromUrl();
        if (clipId) {
            document.getElementById('retrieve-input').value = clipId;
            setTimeout(() => {
                this.autoRetrieveClip(clipId);
            }, 100);
        }

        // Privacy notice
        document.getElementById('privacy-ok').addEventListener('click', this.acceptPrivacyNotice.bind(this));
    }

    /**
     * Refactored autoRetrieveClip method using helper modules and ApiClient
     * Eliminates DRY violations and improves maintainability
     */
    async autoRetrieveClip(clipId) {
        try {
            // Validate clip ID format
            if (!/^[A-Z0-9]{4}$|^[A-Z0-9]{10}$/.test(clipId)) {
                return;
            }

            UIHelpers.showLoading('retrieve-loading');
            
            // Extract URL secret and password for potential authentication
            const urlSecret = this.extractUrlSecret();
            const password = UIHelpers.getPasswordValue();
            
            // Check if this is a file URL (from routing)
            const isFileUrl = this.isFileRequest === true;
            const isQuickShare = clipId.length === 4;
            
            console.log('🔍 Auto-retrieve info:', {
                clipId, 
                isFileUrl, 
                isQuickShare, 
                hasUrlSecret: !!urlSecret, 
                hasPassword: !!password
            });
            
            if (isQuickShare) {
                // Quick Share (4-digit): no download token needed
                console.log('⚡ Quick Share auto-retrieve - no download token needed:', clipId);
                
                // First, get clip info to check if it has password
                const infoResult = await this.apiClient.getClipInfo(clipId);
                
                if (!infoResult.success) {
                    // Clip not found or expired, don't try to decrypt
                    UIHelpers.hideLoading('retrieve-loading');
                    return;
                }
                
                // Quick Share never has passwords, proceed with retrieval
                const result = await this.apiClient.getClip(clipId);
                
                if (result.success) {
                    await this.showRetrieveResult(result.data);
                }
                
            } else if (isFileUrl && !isQuickShare) {
                // File URL (not Quick Share): requires authentication, check URL secret first
                console.log('📁 File URL detected - checking credentials before API call:', clipId);
                
                if (!urlSecret) {
                    // No URL secret - this file URL is invalid
                    UIHelpers.hideLoading('retrieve-loading');
                    this.showToast(getErrorMessage('ACCESS_DENIED_FILE'), 'error');
                    return;
                }
                
                // First try with just URL secret (no password) - many files don't need passwords
                console.log('🔑 File URL with URL secret - trying authentication without password first');
                
                // Use Zero-Knowledge system - no authentication needed for file info
                const infoResult = await this.apiClient.getClipInfo(clipId);
                
                if (infoResult.success) {
                    // File info retrieved successfully - check if password is required
                    console.log('✅ File info retrieved - checking password requirements');
                    console.log('🔍 File info data:', infoResult.data);
                    
                    if (infoResult.data.hasPassword && !password) {
                        // File requires password but user hasn't provided one
                        console.log('🔑 File requires password - showing password field');
                        
                        UIHelpers.hideLoading('retrieve-loading');
                        UIHelpers.showPasswordSection();
                        this.showToast(getInfoMessage('FILE_PASSWORD_REQUIRED'), 'info');
                        return;
                    }
                    
                    // No password required or password provided - proceed with file retrieval
                    console.log('✅ File accessible - no password required or password provided');
                    
                    // Proceed with authenticated retrieval
                    const result = await this.apiClient.getClip(clipId);
                    
                    if (result.success) {
                        // Add hasPassword information from infoResult to the response data
                        result.data.hasPassword = infoResult.data.hasPassword;
                        await this.showRetrieveResult(result.data);
                    } else {
                        UIHelpers.hideLoading('retrieve-loading');
                        this.showToast(getErrorMessage('FAILED_TO_LOAD_FILE'), 'error');
                    }
                    
                } else if ((infoResult.status === 401 || infoResult.status === 403) && !password) {
                    // Authentication failed with URL secret only - check if password required
                    const fileRequiresPassword = infoResult.data?.hasPassword === true;
                    
                    if (fileRequiresPassword) {
                        // File requires password - show password field
                        console.log('🔑 File requires password (from error response) - showing password field');
                        
                        UIHelpers.hideLoading('retrieve-loading');
                        UIHelpers.showPasswordSection();
                        this.showToast(getInfoMessage('FILE_PASSWORD_REQUIRED'), 'info');
                    } else {
                        // File doesn't require password - wrong URL secret
                        console.log('🔑 File does not require password - wrong URL secret');
                        UIHelpers.hideLoading('retrieve-loading');
                        this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
                    }
                    return;
                    
                } else if ((infoResult.status === 401 || infoResult.status === 403) && password) {
                    // Authentication failed with URL secret only, but we have a password - try with both
                    console.log('🔑 URL secret failed, trying with password too');
                    
                    // Retry with Zero-Knowledge Access Code system
                    const accessCodeHash = await this.generateAccessCodeHash(password);
                    const retryInfoResult = await this.apiClient.getClipInfo(clipId, accessCodeHash);
                    
                    if (retryInfoResult.success) {
                        // Proceed with authenticated retrieval
                        const result = await this.apiClient.getClip(clipId, accessCodeHash);
                        
                        if (result.success) {
                            // Add hasPassword information from infoResult to the response data
                            result.data.hasPassword = retryInfoResult.data.hasPassword;
                            await this.showRetrieveResult(result.data);
                        } else {
                            UIHelpers.hideLoading('retrieve-loading');
                            this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
                        }
                    } else {
                        UIHelpers.hideLoading('retrieve-loading');
                        this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
                    }
                    
                } else {
                    // Other error (file not found, expired, etc.)
                    UIHelpers.hideLoading('retrieve-loading');
                    if (infoResult.status === 404) {
                        this.showToast(getErrorMessage('FILE_NOT_FOUND'), 'error');
                    } else {
                        this.showToast(getErrorMessage('FAILED_TO_ACCESS_FILE'), 'error');
                    }
                }
            } else {
                // Normal clip (10-digit): First get info to check if password is required
                if (urlSecret) {
                    // We have URL secret - use Zero-Knowledge system
                    console.log('🔐 Normal clip with URL secret - using Zero-Knowledge system:', clipId);
                    
                    // ALWAYS check clip info first to see if password is required
                    const infoResult = await this.apiClient.getClipInfo(clipId);
                    
                    console.log('🔍 Clip info response:', infoResult.data);
                    
                    // If clip requires password but user hasn't provided one, show password form
                    if (infoResult.data.hasPassword && !password) {
                        console.log('🔒 Clip requires password - showing password section');
                        UIHelpers.hideLoading('retrieve-loading');
                        
                        // Show password section using UIHelpers
                        UIHelpers.showPasswordSection();
                        console.log('✅ Password section shown');
                        
                        // BLOCK any further automatic retrievals
                        this.blockAutoRetrieve = true;
                        
                        this.showToast(getInfoMessage('PASSWORD_REQUIRED_ABOVE'), 'info');
                        return;
                    }
                    
                    if (infoResult.success) {
                        // Authentication successful - proceed with retrieval
                        console.log('✅ Authentication successful for clip:', clipId);
                        
                        let result;
                        if (password) {
                            // Use Zero-Knowledge Access Code system
                            const accessCodeHash = await this.generateAccessCodeHash(password);
                            result = await this.apiClient.getClip(clipId, accessCodeHash);
                        } else {
                            // Non-password clip - direct retrieval
                            result = await this.apiClient.getClip(clipId);
                        }
                        
                        if (result.success) {
                            await this.showRetrieveResult(result.data);
                        } else {
                            console.error('❌ Authenticated retrieval failed:', result.status);
                            this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
                        }
                    } else if ((infoResult.status === 401 || infoResult.status === 403) && !password && infoResult.data?.hasPassword === true) {
                        // Authentication failed but server indicates password required
                        console.log('🔑 Authentication failed - password required');
                        UIHelpers.hideLoading('retrieve-loading');
                        
                        UIHelpers.showPasswordSection();
                        this.showToast(getInfoMessage('PASSWORD_REQUIRED'), 'info');
                    } else {
                        // Authentication failed with wrong credentials
                        console.error('❌ Authentication failed - invalid credentials:', infoResult.status);
                        UIHelpers.hideLoading('retrieve-loading');
                        this.showToast(getErrorMessage('ACCESS_DENIED_PASSWORD'), 'error');
                    }
                } else {
                    // No URL secret - try without token first (for legacy clips or clips without URL secrets)
                    console.log('🔐 Normal clip without URL secret - trying without token first:', clipId);
                    
                    const infoResult = await this.apiClient.getClipInfo(clipId);

                    if (infoResult.success) {
                        // No authentication required - proceed normally
                        console.log('✅ No authentication required for clip:', clipId);
                        
                        // Check if clip has password
                        if (infoResult.data.hasPassword) {
                            UIHelpers.hideLoading('retrieve-loading');
                            
                            // Show password section and focus password input using UIHelpers
                            UIHelpers.showPasswordSection();
                            
                            console.log('🔑 Password-protected clip detected - showing password field');
                            return;
                        }
                        
                        // No password required, proceed with retrieval
                        const result = await this.apiClient.getClip(clipId);
                        
                        if (result.success) {
                            // Add hasPassword information from infoResult to the response data
                            result.data.hasPassword = infoResult.data.hasPassword;
                            await this.showRetrieveResult(result.data);
                        }
                        
                    } else if (infoResult.status === 401 || infoResult.status === 403) {
                        // Authentication required (likely a file clip)
                        console.log('🔐 Authentication required for clip:', clipId, 'checking if password available');
                        
                        if (urlSecret) {
                            // We have URL secret - use Zero-Knowledge system
                            console.log('🔑 URL secret available - using Zero-Knowledge system:', { hasPassword: !!password, hasUrlSecret: !!urlSecret });
                            
                            // Retry with Zero-Knowledge Access Code system
                            let retryInfoResult;
                            if (password) {
                                const accessCodeHash = await this.generateAccessCodeHash(password);
                                retryInfoResult = await this.apiClient.getClipInfo(clipId, accessCodeHash);
                            } else {
                                retryInfoResult = await this.apiClient.getClipInfo(clipId);
                            }
                            
                            if (retryInfoResult.success) {
                                // Authentication successful - proceed with retrieval
                                console.log('✅ Authentication successful for clip:', clipId);
                                
                                let result;
                                if (password) {
                                    // Use Zero-Knowledge Access Code system
                                    const accessCodeHash = await this.generateAccessCodeHash(password);
                                    result = await this.apiClient.getClip(clipId, accessCodeHash);
                                } else {
                                    // Non-password clip - direct retrieval
                                    result = await this.apiClient.getClip(clipId);
                                }
                                
                                if (result.success) {
                                    // Add hasPassword information from infoResult to the response data
                                    result.data.hasPassword = retryInfoResult.data.hasPassword;
                                    await this.showRetrieveResult(result.data);
                                } else {
                                    console.error('❌ Authenticated retrieval failed:', result.status);
                                    this.showToast(getErrorMessage('AUTHENTICATION_FAILED'), 'error');
                                }
                            } else if ((retryInfoResult.status === 401 || retryInfoResult.status === 403) && !password && retryInfoResult.data?.hasPassword === true) {
                                // Authentication failed but server indicates password required
                                console.log('🔑 Authentication failed - password required');
                                UIHelpers.hideLoading('retrieve-loading');
                                
                                UIHelpers.showPasswordSection();
                                this.showToast(getInfoMessage('PASSWORD_REQUIRED'), 'info');
                            } else {
                                // Authentication failed with wrong credentials
                                console.error('❌ Authentication failed - invalid credentials:', retryInfoResult.status);
                                UIHelpers.hideLoading('retrieve-loading');
                                this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
                            }
                            
                        } else {
                            // No URL secret - this shouldn't happen for normal clips
                            console.log('❌ No URL secret available for normal clip');
                            UIHelpers.hideLoading('retrieve-loading');
                            this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
                            return;
                        }
                    } else {
                        // Other error (clip not found, expired, etc.)
                        console.log('❌ Clip not found or expired:', clipId);
                        UIHelpers.hideLoading('retrieve-loading');
                        return;
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ Error in autoRetrieveClip:', error);
            this.showToast(getErrorMessage('FAILED_TO_RETRIEVE'), 'error');
        } finally {
            UIHelpers.hideLoading('retrieve-loading');
        }
    }

    // Tab Management
    switchTab(tab) {
        try {
            // Update tab buttons
            const tabButtons = document.querySelectorAll('.tab-button');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            const targetTabButton = document.getElementById(`${tab}-tab`);
            if (targetTabButton) {
                targetTabButton.classList.add('active');
            }
            
            // Update sections
            const sections = document.querySelectorAll('.section');
            sections.forEach(section => section.classList.remove('active'));
            
            const targetSection = document.getElementById(`${tab}-section`);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            // Clear any previous results/errors when switching tabs
            this.clearResults();
            
            // Special handling for retrieve tab
            if (tab === 'retrieve') {
                const retrieveInput = document.getElementById('retrieve-input');
                if (retrieveInput) {
                    retrieveInput.focus();
                }

                // If we have a clip ID in URL, auto-fill the input
                const clipId = this.getClipIdFromUrl();
                if (clipId) {
                    retrieveInput.value = clipId;
                    const retrieveButton = document.getElementById('retrieve-button');
                    if (retrieveButton) {
                        retrieveButton.disabled = false;
                    }
                }

                // Show password field if URL contains secret or query parameter
                const hasUrlSecret = this.extractUrlSecret();
                const passwordField = document.getElementById('password-input');
                if (hasUrlSecret && passwordField) {
                    passwordField.style.display = 'block';
                    passwordField.classList.remove('hidden');
                }
            }
            
            // Special handling for share tab
            if (tab === 'share') {
                const contentInput = document.getElementById('content-input');
                if (contentInput) {
                    contentInput.focus();
                }
            }
            
            // Special handling for file tab
            if (tab === 'file') {
                const fileInput = document.getElementById('file-input');
                if (fileInput) {
                    fileInput.focus();
                }
            }
            
        } catch (error) {
            console.error('❌ Error switching tabs:', error);
        }
    }

    // Character Counter
    updateCharCounter() {
        const contentInput = document.getElementById('content-input');
        const charCounter = document.getElementById('char-counter');
        const shareButton = document.getElementById('share-button');
        
        if (contentInput && charCounter) {
            const length = contentInput.value.length;
            const maxLength = 1000000; // 1MB limit
            
            charCounter.textContent = `${length.toLocaleString()} / ${maxLength.toLocaleString()} characters`;
            
            if (length > maxLength) {
                charCounter.style.color = '#e74c3c';
                shareButton.disabled = true;
            } else {
                charCounter.style.color = '#7f8c8d';
                shareButton.disabled = !contentInput.value.trim();
            }
        }
    }

    // Share Content
    async shareContent() {
        try {
            const contentInput = document.getElementById('content-input');
            const passwordInput = document.getElementById('password-input');
            const content = contentInput.value.trim();
            const password = passwordInput.value;

            if (!content) {
                this.showToast('❌ Please enter some content to share', 'error');
                contentInput.focus();
                return;
            }

            // Validate password length
            if (password && password.length > 128) {
                this.showToast(`❌ Password too long: ${password.length} characters (max 128)`, 'error');
                passwordInput.focus();
                return;
            }

            this.showLoading('share-loading');

            // Prepare share data
            const shareData = {
                content: content,
                password: password || null,
                expiresIn: '24h' // Default expiration
            };

            const result = await this.apiClient.createClip(shareData);

            if (result.success) {
                this.showShareResult(result.data);
                this.showToast(getSuccessMessage('CONTENT_SHARED'), 'success');
            } else {
                this.showToast(getErrorMessage('FAILED_TO_SHARE'), 'error');
            }

        } catch (error) {
            console.error('❌ Error sharing content:', error);
            this.showToast(getErrorMessage('FAILED_TO_SHARE'), 'error');
        } finally {
            this.hideLoading('share-loading');
        }
    }

    // Retrieve Content
    async retrieveContent() {
        try {
            const retrieveInput = document.getElementById('retrieve-input');
            const passwordInput = document.getElementById('retrieve-password-input');
            const clipId = retrieveInput.value.trim().toUpperCase();
            const password = passwordInput.value;

            if (!clipId) {
                this.showToast('❌ Please enter a clip ID', 'error');
                retrieveInput.focus();
                return;
            }

            // Validate password length
            if (password && password.length > 128) {
                this.showToast(`❌ Password too long: ${password.length} characters (max 128)`, 'error');
                passwordInput.focus();
                return;
            }

            // Check if password is required but not provided
            if (!password && UIHelpers.isPasswordSectionVisible()) {
                this.showToast(getErrorMessage('INVALID_PASSWORD'), 'error');
                passwordInput.focus();
                return;
            }

            UIHelpers.showLoading('retrieve-loading');

            // Use ApiClient for retrieval
            let result;
            if (password) {
                const accessCodeHash = await this.generateAccessCodeHash(password);
                result = await this.apiClient.getClip(clipId, accessCodeHash);
            } else {
                result = await this.apiClient.getClip(clipId);
            }

            if (result.success) {
                await this.showRetrieveResult(result.data);
                this.showToast(getSuccessMessage('CONTENT_RETRIEVED'), 'success');
            } else if (result.status === 401 || result.status === 403) {
                UIHelpers.showPasswordSection();
                this.showToast(getInfoMessage('PASSWORD_REQUIRED'), 'info');
            } else if (result.status === 404) {
                this.showToast(getErrorMessage('CLIP_NOT_FOUND'), 'error');
            } else {
                this.showToast(getErrorMessage('FAILED_TO_RETRIEVE'), 'error');
            }

        } catch (error) {
            console.error('❌ Error retrieving content:', error);
            this.showToast(getErrorMessage('FAILED_TO_RETRIEVE'), 'error');
        } finally {
            UIHelpers.hideLoading('retrieve-loading');
        }
    }

    // Helper methods that would continue from the original script...
    // These are placeholder methods that would need to be implemented based on the original script

    showLoading(elementId) {
        UIHelpers.showLoading(elementId);
    }

    hideLoading(elementId) {
        UIHelpers.hideLoading(elementId);
    }

    showToast(message, type = 'info') {
        // Toast implementation would go here
        console.log(`Toast [${type}]: ${message}`);
    }

    extractUrlSecret() {
        // Extract URL secret implementation
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('s') || urlParams.get('secret');
    }

    getClipIdFromUrl() {
        // Extract clip ID from URL implementation
        const pathParts = window.location.pathname.split('/');
        return pathParts[pathParts.length - 1] || null;
    }

    async generateAccessCodeHash(password) {
        // Password hashing implementation
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async showRetrieveResult(data) {
        // Show retrieve result implementation
        console.log('Retrieved data:', data);
    }

    showShareResult(data) {
        // Show share result implementation
        console.log('Shared data:', data);
    }

    clearResults() {
        // Clear results implementation
        console.log('Clearing results');
    }

    setupRouting() {
        // Routing setup implementation
        console.log('Setting up routing');
    }

    setupKeyboardShortcuts() {
        // Keyboard shortcuts implementation
        console.log('Setting up keyboard shortcuts');
    }

    checkPrivacyNotice() {
        // Privacy notice implementation
        console.log('Checking privacy notice');
    }

    acceptPrivacyNotice() {
        // Accept privacy notice implementation
        console.log('Privacy notice accepted');
    }

    handleFileUpload() {
        // File upload implementation
        console.log('Handling file upload');
    }

    shareFile() {
        // Share file implementation
        console.log('Sharing file');
    }

    handleDragOver(e) {
        // Drag over implementation
        e.preventDefault();
    }

    handleFileDrop(e) {
        // File drop implementation
        e.preventDefault();
        console.log('File dropped');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ClipboardApp();
});
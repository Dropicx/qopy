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

// Qopy Application JavaScript
const CLIP_CONFIG = {
    QUICK_SHARE_ID_LENGTH: 6,
    NORMAL_ID_LENGTH: 10,
    URL_SECRET_LENGTH: 16,
    CHAR_LIMIT: 50000,
    CLIP_ID_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    PBKDF2_ITERATIONS_V3: 600000,      // V3 — OWASP 2025 recommendation
    AES_IV_LENGTH: 12,
    SALT_LENGTH_V3: 32,
    FORMAT_VERSION_V3: 0x03,
    MAX_CONTENT_SIZE: 5 * 1024 * 1024,
};

class ClipboardApp {
    constructor() {
        this.baseUrl = window.location.origin;
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

        // Quick Share checkbox
        document.getElementById('quick-share-checkbox').addEventListener('change', this.handleQuickShareChange.bind(this));

        // Retrieve form
        document.getElementById('retrieve-button').addEventListener('click', this.retrieveContent.bind(this));
        document.getElementById('clip-id-input').addEventListener('input', this.checkClipId.bind(this));

        // Auto-uppercase clip ID input
        document.getElementById('clip-id-input').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });

        // Copy buttons
        document.getElementById('copy-url-button').addEventListener('click', () => {
            this.copyToClipboard(document.getElementById('share-url').value, 'Share URL copied!');
        });

        document.getElementById('copy-id-button').addEventListener('click', () => {
            this.copyToClipboard(document.getElementById('clip-id').value, 'Clip ID copied!');
        });

        const copyVerbalBtn = document.getElementById('copy-verbal-button');
        if (copyVerbalBtn) {
            copyVerbalBtn.addEventListener('click', () => {
                this.copyToClipboard(document.getElementById('verbal-code-display').textContent, 'Verbal code copied!');
            });
        }

        document.getElementById('copy-content-button').addEventListener('click', () => {
            this.copyToClipboard(document.getElementById('retrieved-content').textContent, 'Content copied!');
        });

        // Modal controls
        document.getElementById('close-modal').addEventListener('click', this.closeModal.bind(this));
        document.getElementById('success-modal').addEventListener('click', (e) => {
            if (e.target.id === 'success-modal') this.closeModal();
        });

        // Toast close buttons — event delegation for dynamic toasts
        document.addEventListener('click', (e) => {
            if (e.target.closest('.toast-close')) {
                e.target.closest('.toast')?.classList.add('hidden');
            }
        });

        // Enter key handling
        document.getElementById('clip-id-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.retrieveContent();
        });

        document.getElementById('retrieve-password-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.retrieveContent();
        });

        // Enter key handling for share form
        document.getElementById('content-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.shareContent();
            }
        });

        document.getElementById('password-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.shareContent();
            }
        });

        // FAQ Accordion — event delegation for all FAQ questions
        document.addEventListener('click', (e) => {
            const faqButton = e.target.closest('.faq-question');
            if (faqButton) {
                this.toggleFAQ(faqButton.dataset.faq);
            }
        });

        // File download button — event delegation on stable parent
        const contentResult = document.getElementById('content-result');
        if (contentResult) {
            contentResult.addEventListener('click', async (e) => {
                if (e.target.closest('#download-file-button') && this._pendingFileDownload) {
                    try {
                        const clipId = document.getElementById('clip-id-input').value.trim();
                        await this.downloadFile(clipId, this._pendingFileDownload.filename);
                    } catch (error) {
                        console.error('Download failed:', error);
                        this.showToast('Download failed: ' + error.message, 'error');
                    }
                }
            });
        }

        // Privacy Notice Dismiss
        document.getElementById('privacy-dismiss').addEventListener('click', () => {
            this.dismissPrivacyNotice();
        });

        // New Paste button
        document.getElementById('new-paste-button').addEventListener('click', () => {
            if (confirm('Are you sure you want to create a new paste? This will clear the current content.')) {
                this.goToHome();
            }
        });

        // Logo/Title click to return to home
        const typingElement = document.getElementById('typing-text');
        if (typingElement) {
            typingElement.addEventListener('click', () => {
                this.goToHome();
            });
            // Add cursor pointer to indicate it's clickable
            typingElement.style.cursor = 'pointer';
        }
    }

    // Keyboard Shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + 1 for share tab
            if ((e.ctrlKey || e.metaKey) && e.key === '1') {
                e.preventDefault();
                this.switchTab('share');
            }

            // Ctrl/Cmd + 2 for retrieve tab
            if ((e.ctrlKey || e.metaKey) && e.key === '2') {
                e.preventDefault();
                this.switchTab('retrieve');
            }

            // Escape to close modal
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    // URL Routing
    setupRouting() {
        try {
            const path = window.location.pathname;
            
            // Reset file request flag
            this.isFileRequest = false;
            
            // More robust pattern matching for clip URLs
            let clipId = null;
            
            // Check for /clip/ABC123 pattern (10-char normal ID)
            if (path.startsWith('/clip/') && path.length === 16) {
                clipId = path.substring(6);
            }
            // Check for /clip/ABC1XY pattern (6-char Quick Share ID)
            else if (path.startsWith('/clip/') && path.length === 12) {
                clipId = path.substring(6);
            }
            // Check for /file/ABC123 pattern (10-char file ID)
            else if (path.startsWith('/file/') && path.length === 16) {
                clipId = path.substring(6);
                // Mark this as a file request
                this.isFileRequest = true;
            }
            // Check for /file/ABC1XY pattern (6-char file ID)
            else if (path.startsWith('/file/') && path.length === 12) {
                clipId = path.substring(6);
                // Mark this as a file request
                this.isFileRequest = true;
            }
            // Check for /ABC123 pattern (direct 10-char ID)
            else if (path.length === 11 && path.startsWith('/') && /^[A-Z0-9]{10}$/.test(path.substring(1))) {
                clipId = path.substring(1);
            }
            // Check for /ABC1XY pattern (direct 6-char Quick Share ID)
            else if (path.length === 7 && path.startsWith('/') && /^[A-Z0-9]{6}$/.test(path.substring(1))) {
                clipId = path.substring(1);
            }
            
            if (clipId) {
                // Validate clip ID format
                if (/^[A-Z0-9]{6}$|^[A-Z0-9]{10}$/.test(clipId)) {
                    this.switchTab('retrieve');
                    document.getElementById('clip-id-input').value = clipId;
                    this.autoRetrieveClip(clipId);
                }
            }
        } catch (error) {
            // Routing error - non-critical
        }
    }

    // Auto-retrieve clip from URL
    async autoRetrieveClip(clipId) {
        try {
            // Validate clip ID format
            if (!/^[A-Z0-9]{6}$|^[A-Z0-9]{10}$/.test(clipId)) {
                return;
            }

            this.showLoading('retrieve-loading');
            
            // Extract URL secret and password for potential authentication
            const urlSecret = this.extractUrlSecret();
            const password = this.getPasswordFromUser();
            
            // Check if this is a file URL (from routing)
            const isFileUrl = this.isFileRequest === true;
            const isQuickShare = clipId.length === CLIP_CONFIG.QUICK_SHARE_ID_LENGTH;

            if (isQuickShare) {
                // Quick Share (6-digit): zero-knowledge, uses URL fragment secret

                if (!urlSecret) {
                    // No URL fragment — show secret input for verbal sharing case
                    this.hideLoading('retrieve-loading');
                    const secretSection = document.getElementById('quick-share-secret-section');
                    if (secretSection) secretSection.classList.remove('hidden');
                    return;
                }

                // First, get clip info to check existence
                const infoResponse = await fetch(`/api/clip/${clipId}/info`);
                if (!infoResponse.ok) {
                    this.hideLoading('retrieve-loading');
                    return;
                }

                // Retrieve encrypted content (server has no secret)
                const response = await fetch(`/api/clip/${clipId}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    await this.showRetrieveResult(data);
                }

            } else if (isFileUrl && !isQuickShare) {
                // File URL (not Quick Share): requires authentication, check URL secret first
                
                if (!urlSecret) {
                    // No URL secret - this file URL is invalid
                    this.hideLoading('retrieve-loading');
                    this.showToast('🔐 Access denied: Invalid file URL (missing secret)', 'error');
                    return;
                }
                
                // First try with just URL secret (no password) - many files don't need passwords
                
                // Use Zero-Knowledge system - no authentication needed for file info
                let infoResponse = await fetch(`/api/clip/${clipId}/info`);
                let infoData = await infoResponse.json();
                
                if (infoResponse.ok) {
                    // File info retrieved successfully - check if password is required
                    
                    if (infoData.hasPassword && !password) {
                        // File requires password but user hasn't provided one
                        
                        this.hideLoading('retrieve-loading');
                        
                        if (window.UIHelpers) window.UIHelpers.showPasswordSection();
                        this.showToast((window.INFO_MESSAGES && window.INFO_MESSAGES.FILE_PASSWORD_REQUIRED) || '🔐 This file requires a password. Please enter it below.', 'info');
                        return;
                    }
                    
                    // No password required or password provided - proceed with file retrieval
                    
                    // Proceed with authenticated retrieval
                    let response = await fetch(`/api/clip/${clipId}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        // Add hasPassword information from infoData to the response data
                        data.hasPassword = infoData.hasPassword;
                        await this.showRetrieveResult(data);
                    } else {
                        this.hideLoading('retrieve-loading');
                        this.showToast('❌ Failed to load file', 'error');
                    }
                    
                } else if ((infoResponse.status === 401 || infoResponse.status === 403) && !password) {
                    // Authentication failed with URL secret only - check if password required
                    const fileRequiresPassword = infoData?.hasPassword === true;
                    
                    if (fileRequiresPassword) {
                        // File requires password - show password field
                        
                        this.hideLoading('retrieve-loading');
                        
                        const passwordInput = document.getElementById('retrieve-password-input');

                        this.setPasswordSectionVisible(true);
                        if (passwordInput) {
                            passwordInput.focus();
                        }

                        this.showToast((window.INFO_MESSAGES && window.INFO_MESSAGES.FILE_PASSWORD_REQUIRED) || '🔐 This file requires a password. Please enter it below.', 'info');
                    } else {
                        // File doesn't require password - wrong URL secret
                        this.hideLoading('retrieve-loading');
                        this.showToast((window.ERROR_MESSAGES && window.ERROR_MESSAGES.ACCESS_DENIED) || '❌ Access denied: Invalid credentials or clip not found', 'error');
                    }
                    return;
                    
                } else if ((infoResponse.status === 401 || infoResponse.status === 403) && password) {
                    // Authentication failed with URL secret only, but we have a password - try with both
                    
                    // Retry with Zero-Knowledge Access Code system
                    const accessCodeHash = await this.generateAccessCodeHash(password);
                    infoResponse = await fetch(`/api/clip/${clipId}/info`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            accessCode: accessCodeHash
                        })
                    });
                    infoData = await infoResponse.json();
                    
                    if (infoResponse.ok) {
                        // Proceed with authenticated retrieval
                        const accessCodeHash = await this.generateAccessCodeHash(password);
                        let response = await fetch(`/api/clip/${clipId}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                accessCode: accessCodeHash
                            })
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            // Add hasPassword information from infoData to the response data
                            data.hasPassword = infoData.hasPassword;
                            await this.showRetrieveResult(data);
                        } else {
                            this.hideLoading('retrieve-loading');
                            this.showToast((window.ERROR_MESSAGES && window.ERROR_MESSAGES.ACCESS_DENIED) || '❌ Access denied: Invalid credentials or clip not found', 'error');
                        }
                    } else {
                        this.hideLoading('retrieve-loading');
                        this.showToast((window.ERROR_MESSAGES && window.ERROR_MESSAGES.ACCESS_DENIED) || '❌ Access denied: Invalid credentials or clip not found', 'error');
                    }
                    
                } else {
                    // Other error (file not found, expired, etc.)
                    this.hideLoading('retrieve-loading');
                    if (infoResponse.status === 404) {
                        this.showToast((window.ERROR_MESSAGES && window.ERROR_MESSAGES.FILE_NOT_FOUND) || '❌ File not found or expired', 'error');
                    } else {
                        this.showToast('❌ Failed to access file', 'error');
                    }
                }
            } else {
                // Normal clip (10-digit): First get info to check if password is required
                if (urlSecret) {
                    // We have URL secret - use Zero-Knowledge system
                    
                    // ALWAYS check clip info first to see if password is required
                    let infoResponse = await fetch(`/api/clip/${clipId}/info`);
                    let infoData = await infoResponse.json();
                    
                    
                    // If clip requires password but user hasn't provided one, show password form
                    if (infoData.hasPassword && !password) {
                        this.hideLoading('retrieve-loading');
                        
                        // Show password section
                        this.setPasswordSectionVisible(true);

                        // BLOCK any further automatic retrievals
                        this.blockAutoRetrieve = true;
                        
                        this.showToast('🔒 This clip requires a password. Please enter it above.', 'info');
                        return;
                    }
                    
                    if (infoResponse.ok) {
                        // Authentication successful - proceed with retrieval
                        
                        let response;
                        if (password) {
                            // Use Zero-Knowledge Access Code system
                            const accessCodeHash = await this.generateAccessCodeHash(password);
                            response = await fetch(`/api/clip/${clipId}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    accessCode: accessCodeHash
                                })
                            });
                        } else {
                            // Non-password clip - direct retrieval
                            response = await fetch(`/api/clip/${clipId}`, {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            });
                        }
                        
                        if (response.ok) {
                            const data = await response.json();
                            await this.showRetrieveResult(data);
                        } else {
                            console.error('❌ Authenticated retrieval failed:', response.status);
                            this.showToast((window.ERROR_MESSAGES && window.ERROR_MESSAGES.ACCESS_DENIED) || '❌ Access denied: Invalid credentials or clip not found', 'error');
                        }
                    } else if ((infoResponse.status === 401 || infoResponse.status === 403) && !password && infoData?.hasPassword === true) {
                        // Authentication failed but server indicates password required
                        this.hideLoading('retrieve-loading');
                        
                        const passwordInput = document.getElementById('retrieve-password-input');

                        this.setPasswordSectionVisible(true);
                        if (passwordInput) {
                            passwordInput.focus();
                        }

                        this.showToast('🔐 This clip requires a password. Please enter it below.', 'info');
                    } else {
                        // Authentication failed with wrong credentials
                        console.error('❌ Authentication failed - invalid credentials:', infoResponse.status);
                        this.hideLoading('retrieve-loading');
                        this.showToast('🔐 Access denied: Invalid URL secret or password', 'error');
                    }
                } else {
                    // No URL secret - try without token first (for clips without URL secrets)
                    
                    let infoResponse = await fetch(`/api/clip/${clipId}/info`);
                    let infoData = await infoResponse.json();
                
                if (infoResponse.ok) {
                    // No authentication required - proceed normally
                    
                    // Check if clip has password
                    if (infoData.hasPassword) {
                        this.hideLoading('retrieve-loading');
                        
                        // Show password section and focus password input
                        const passwordInput = document.getElementById('retrieve-password-input');

                        this.setPasswordSectionVisible(true);
                        if (passwordInput) {
                            passwordInput.focus();
                        }

                        return;
                    }

                    // No password required, proceed with retrieval
                    const response = await fetch(`/api/clip/${clipId}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        // Add hasPassword information from infoData to the response data
                        data.hasPassword = infoData.hasPassword;
                        await this.showRetrieveResult(data);
                    }
                    
                } else if (infoResponse.status === 401 || infoResponse.status === 403) {
                    // Authentication required (likely a file clip)
                    
                    if (urlSecret) {
                        // We have URL secret - use Zero-Knowledge system
                        
                        // Retry with Zero-Knowledge Access Code system
                        if (password) {
                            const accessCodeHash = await this.generateAccessCodeHash(password);
                            infoResponse = await fetch(`/api/clip/${clipId}/info`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    accessCode: accessCodeHash
                                })
                            });
                        } else {
                            infoResponse = await fetch(`/api/clip/${clipId}/info`);
                        }
                        infoData = await infoResponse.json();
                        
                        if (infoResponse.ok) {
                            // Authentication successful - proceed with retrieval
                            
                            let response;
                            if (password) {
                                // Use Zero-Knowledge Access Code system
                                const accessCodeHash = await this.generateAccessCodeHash(password);
                                response = await fetch(`/api/clip/${clipId}`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        accessCode: accessCodeHash
                                    })
                                });
                            } else {
                                // Non-password clip - direct retrieval
                                response = await fetch(`/api/clip/${clipId}`, {
                                    method: 'GET',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    }
                                });
                            }
                            
                            if (response.ok) {
                                const data = await response.json();
                                // Add hasPassword information from infoData to the response data
                                data.hasPassword = infoData.hasPassword;
                                await this.showRetrieveResult(data);
                            } else {
                                console.error('❌ Authenticated retrieval failed:', response.status);
                                this.showToast('🔐 Authentication failed - please check your credentials', 'error');
                            }
                        } else if ((infoResponse.status === 401 || infoResponse.status === 403) && !password && infoData?.hasPassword === true) {
                            // Authentication failed but server indicates password required
                            this.hideLoading('retrieve-loading');
                            
                            const passwordInput = document.getElementById('retrieve-password-input');

                            this.setPasswordSectionVisible(true);
                            if (passwordInput) {
                                passwordInput.focus();
                            }

                            this.showToast('🔐 This clip requires a password. Please enter it below.', 'info');
                        } else {
                            // Authentication failed with wrong credentials
                            console.error('❌ Authentication failed - invalid credentials:', infoResponse.status);
                            this.hideLoading('retrieve-loading');
                            this.showToast((window.ERROR_MESSAGES && window.ERROR_MESSAGES.ACCESS_DENIED) || '❌ Access denied: Invalid credentials or clip not found', 'error');
                        }
                        
                    } else {
                        // No URL secret - this shouldn't happen for normal clips
                        this.hideLoading('retrieve-loading');
                        this.showToast((window.ERROR_MESSAGES && window.ERROR_MESSAGES.ACCESS_DENIED) || '❌ Access denied: Invalid credentials or clip not found', 'error');
                        return;
                    }
                } else {
                    // Other error (clip not found, expired, etc.)
                    this.hideLoading('retrieve-loading');
                    return;
                }
            }
        }
            
        } catch (error) {
            console.error('❌ Error in autoRetrieveClip:', error);
            this.showToast('❌ Failed to retrieve content', 'error');
        } finally {
            this.hideLoading('retrieve-loading');
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

            // Update URL without reloading (only for share tab)
            if (tab === 'share') {
                history.replaceState(null, '', '/');
            }

            // Ensure password field is visible in share tab
            if (tab === 'share') {
                const passwordField = document.getElementById('password-input');
                if (passwordField) {
                    passwordField.style.display = 'block';
                    passwordField.classList.remove('hidden');
                }
            }
            
            // Ensure password field is hidden by default in retrieve tab
            if (tab === 'retrieve') {
                // Hide password section by default - it will be shown only if server indicates password is required
                this.setPasswordSectionVisible(false);
            }

            // Focus appropriate input after a short delay
            setTimeout(() => {
                if (tab === 'share') {
                    const contentInput = document.getElementById('content-input');
                    if (contentInput) {
                        contentInput.focus();
                    }
                } else if (tab === 'retrieve') {
                    // Check if we're in an auto-retrieve scenario with a password-protected clip
                    const clipIdInput = document.getElementById('clip-id-input');
                    const passwordInput = document.getElementById('retrieve-password-input');
                    const passwordSection = document.getElementById('password-section');
                    
                    // If password section is visible (indicating password-protected clip), focus password input
                    if (passwordSection && !passwordSection.classList.contains('hidden') && passwordInput) {
                        passwordInput.focus();
                    } else if (clipIdInput) {
                        // Otherwise focus the clip ID input
                        clipIdInput.focus();
                    }
                }
            }, 200);
        } catch (error) {
            // Tab switching error - non-critical
        }
    }

    // Character Counter
    updateCharCounter() {
        const content = document.getElementById('content-input').value;
        const counter = document.getElementById('char-count');
        counter.textContent = content.length.toLocaleString();
        
        // Change color based on usage
        const percentage = (content.length / 100000) * 100;
        if (percentage > 90) {
            counter.style.color = 'var(--error-color)';
        } else if (percentage > 75) {
            counter.style.color = 'var(--warning-color)';
        } else {
            counter.style.color = 'var(--text-muted)';
        }
    }

    // Check Clip ID and show password field if needed
    async checkClipId() {
        // Block automatic retrieval if password form is already shown
        if (this.blockAutoRetrieve) {
            return;
        }
        
        const clipId = document.getElementById('clip-id-input').value.trim();
        const passwordInput = document.getElementById('retrieve-password-input');

        // Always hide password section by default
        this.setPasswordSectionVisible(false);
        if (passwordInput) {
            passwordInput.value = '';
        }
        
        if (clipId.length === CLIP_CONFIG.QUICK_SHARE_ID_LENGTH || clipId.length === CLIP_CONFIG.NORMAL_ID_LENGTH) {
            try {
                // Extract URL secret and password for potential authentication
                const urlSecret = this.extractUrlSecret();
                const password = this.getPasswordFromUser();

                if (clipId.length > 6) {
                    // Normal clip: use Zero-Knowledge system
                    let response;
                    if (password) {
                        // Use Zero-Knowledge Access Code system
                        const accessCodeHash = await this.generateAccessCodeHash(password);
                        response = await fetch(`/api/clip/${clipId}/info`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                accessCode: accessCodeHash
                            })
                        });
                    } else {
                        response = await fetch(`/api/clip/${clipId}/info`);
                    }
                } else {
                    // Quick Share (6-digit): zero-knowledge, check if secret input needed
                    const qsSecret = urlSecret || (document.getElementById('quick-share-secret-input') ? document.getElementById('quick-share-secret-input').value.trim().toUpperCase() : '');
                    const secretSection = document.getElementById('quick-share-secret-section');
                    if (!qsSecret && secretSection) {
                        secretSection.classList.remove('hidden');
                    }
                    const response = await fetch(`/api/clip/${clipId}/info`);
                }
                const data = await response.json();
                
                
                if (response.ok) {
                    // Show password section ONLY for text content with passwords
                    // Files handle their own password logic in showRetrieveResult
                    if (data.hasPassword && data.contentType === 'text') {
                        this.setPasswordSectionVisible(true);
                        if (passwordInput) {
                            passwordInput.focus();
                        }
                    }
                    // For files, we'll handle password display in showRetrieveResult
                } else {
                    // For authentication errors, show specific message
                    if (response.status === 401 || response.status === 403) {
                        // Don't show error toast here to avoid interrupting user input
                    } else {
                    }
                    // Clip not found or expired - password section stays hidden
                }
            } catch (error) {
                console.error('❌ Error in checkClipId:', error);
                // On error, password section stays hidden
            }
        } else {
        }
        // If clip ID is not complete, password section stays hidden (default behavior)
    }

    // Share Content
    async shareContent() {
        const content = document.getElementById('content-input').value.trim();
        const password = document.getElementById('password-input').value.trim();
        const expiration = document.getElementById('expiration-select').value;
        const oneTime = document.getElementById('one-time-checkbox').checked;
        const quickShare = document.getElementById('quick-share-checkbox').checked;

        // Enhanced validation with specific error messages
        if (!content) {
            this.showToast('Please enter some content to share', 'error');
            document.getElementById('content-input').focus();
            return;
        }

        if (content.trim().length === 0) {
            this.showToast('❌ Content cannot be empty (only spaces/whitespace)', 'error');
            document.getElementById('content-input').focus();
            return;
        }

        if (content.length > 400000) {
            this.showToast(`❌ Content too long: ${content.length.toLocaleString()} characters (max 400,000)`, 'error');
            document.getElementById('content-input').focus();
            return;
        }

        // Validate password if provided
        if (password && !quickShare) {
            if (password.length < 1) {
                this.showToast('❌ Password cannot be empty', 'error');
                document.getElementById('password-input').focus();
                return;
            }
            if (password.length > 128) {
                this.showToast(`❌ Password too long: ${password.length} characters (max 128)`, 'error');
                document.getElementById('password-input').focus();
                return;
            }
        }

        this.showLoading('loading');
        const shareButton = document.getElementById('share-button');
        shareButton.disabled = true;

        try {
            // Convert text to file-like object for multi-part upload (no extension, no mime type)
            const textBlob = new Blob([content]);
            const randomHash = this.generateRandomHash();
            
            // Apply padding to text content for security (hide actual size)
            const textBytes = new Uint8Array(await textBlob.arrayBuffer());
            const paddedTextBytes = this.addMinimalPadding(textBytes);
            const paddedTextBlob = new Blob([paddedTextBytes]);
            
            const textFile = new File([paddedTextBlob], randomHash);
            
            // Use the existing file upload system for text
            await this.uploadTextAsFile(textFile, content, password, expiration, oneTime, quickShare);
            
        } catch (error) {
            this.showToast(error.message || 'Failed to create share link', 'error');
        } finally {
            this.hideLoading('loading');
            shareButton.disabled = false;
        }
    }

    // Upload text as file using multi-part upload system
    async uploadTextAsFile(file, originalContent, password, expiration, oneTime, quickShare) {
        try {
            let urlSecret = null;

            // Determine encryption method based on mode
            if (quickShare) {
                urlSecret = this.generateQuickShareSecret();
            } else if (!password) {
                urlSecret = this.generateUrlSecret();
            } else {
                urlSecret = this.generateUrlSecret();
            }

            // Create upload session
            const sessionResponse = await fetch('/api/upload/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    totalChunks: Math.ceil(file.size / CLIP_CONFIG.MAX_CONTENT_SIZE),
                    expiration: expiration,
                    oneTime: oneTime,
                    hasPassword: !!password,
                    quickShare: quickShare,
                    contentType: 'text',
                    isTextContent: true
                })
            });

            const sessionData = await sessionResponse.json();
            if (!sessionResponse.ok) {
                throw new Error(sessionData.message || 'Failed to create upload session');
            }

            const { uploadId, totalChunks } = sessionData;

            // Upload chunks
            const chunkSize = CLIP_CONFIG.MAX_CONTENT_SIZE;
            let uploadedChunks = 0;

            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);

                // Encrypt chunk based on mode
                let encryptedChunk;
                if (quickShare) {
                    encryptedChunk = await this.encryptFileChunk(chunk, null, urlSecret);
                } else if (!password) {
                    encryptedChunk = await this.encryptFileChunk(chunk, null, urlSecret);
                } else {
                    encryptedChunk = await this.encryptFileChunk(chunk, password, urlSecret);
                }

                // Upload encrypted chunk
                const formData = new FormData();
                formData.append('chunk', new Blob([encryptedChunk]));
                formData.append('chunkNumber', i);

                const chunkResponse = await fetch(`/api/upload/chunk/${uploadId}/${i}`, {
                    method: 'POST',
                    body: formData
                });

                if (!chunkResponse.ok) {
                    let errorData = {};
                    try { errorData = await chunkResponse.json(); } catch (e) {}
                    console.error(`[TextUpload] Chunk ${i} upload failed:`, errorData);
                    throw new Error(errorData.message || `Failed to upload chunk ${i}`);
                }

                uploadedChunks++;
            }

            // Complete upload
            const completePayload = {
                isTextUpload: true, // Flag to indicate this is a text upload, not a file
                contentType: 'text'
            };

            // NEW: Access Code System - only send hashed password for access control
            // URL Secret and password remain client-side for encryption
            if (!quickShare && password) {
                // Generate client-side access code hash for password protection
                const accessCodeHash = await this.generateAccessCodeHash(password);
                completePayload.accessCodeHash = accessCodeHash;
                completePayload.requiresAccessCode = true;
            } else if (!quickShare) {
                completePayload.requiresAccessCode = false;
            }
            
            const completeResponse = await fetch(`/api/upload/complete/${uploadId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(completePayload)
            });

            const completeData = await completeResponse.json();
            if (!completeResponse.ok) {
                throw new Error(completeData.message || 'Failed to complete upload');
            }

            // Add URL secret to share URL (both normal clips and Quick Shares use fragments now)
            const shareUrl = `${completeData.url}#${urlSecret}`;
            completeData.url = shareUrl;
            completeData.quickShareUrlSecret = quickShare ? urlSecret : null;

            this.showShareResult(completeData);

        } catch (error) {
            console.error('[TextUpload] ❌ Text upload error:', error);
            throw error;
        }
    }

    // Encrypt file chunk with binary data support
    async encryptFileChunk(chunk, password = null, urlSecret = null) {
        const arrayBuffer = await chunk.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Use binary encryption logic
        return await this.encryptBinaryData(uint8Array, password, urlSecret);
    }

    // Encrypt binary data (for file chunks) — V3 format
    async encryptBinaryData(data, password = null, urlSecret = null) {
        try {
            // Input validation
            if (!(data instanceof Uint8Array)) {
                throw new Error('Data must be a Uint8Array');
            }

            if (data.length === 0) {
                throw new Error('Data cannot be empty');
            }

            if (password !== null && (typeof password !== 'string' || password.length === 0)) {
                throw new Error('Password must be a non-empty string or null');
            }

            if (urlSecret !== null && (typeof urlSecret !== 'string' || urlSecret.length === 0)) {
                throw new Error('URL secret must be a non-empty string or null');
            }

            // Validation: At least one of password or urlSecret must be provided
            if (!password && !urlSecret) {
                throw new Error('Either password or urlSecret must be provided for encryption');
            }

            // V3: random salt + random IV
            const salt = new Uint8Array(CLIP_CONFIG.SALT_LENGTH_V3);
            window.crypto.getRandomValues(salt);
            const iv = new Uint8Array(CLIP_CONFIG.AES_IV_LENGTH);
            window.crypto.getRandomValues(iv);

            const key = await this.generateKeyV3(password, urlSecret, salt);
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv }, key, data
            );

            const encryptedBytes = new Uint8Array(encryptedData);
            // V3 payload: [version:1][salt:32][IV:12][ciphertext]
            const combined = new Uint8Array(1 + salt.length + iv.length + encryptedBytes.length);
            combined[0] = CLIP_CONFIG.FORMAT_VERSION_V3;
            combined.set(salt, 1);
            combined.set(iv, 1 + salt.length);
            combined.set(encryptedBytes, 1 + salt.length + iv.length);
            return combined;
        } catch (error) {
            console.error('🔐 [EncryptBinaryData] ❌ Encryption failed:', error);
            throw new Error(`Failed to encrypt binary data: ${error.message}`);
        }
    }

    // Generate enhanced URL secret for maximum security (like File Share)
    generateUrlSecret() {
        // Generate 256 bits of entropy (32 bytes) for maximum security
        const entropyBytes = new Uint8Array(32);
        window.crypto.getRandomValues(entropyBytes);
        
        // Convert to base64 for a longer, more secure passphrase
        const base64Passphrase = btoa(String.fromCharCode.apply(null, entropyBytes));

        return base64Passphrase;
    }

    // Generate 6-character alphanumeric secret for Quick Share (zero-knowledge)
    generateQuickShareSecret() {
        const chars = CLIP_CONFIG.CLIP_ID_CHARS;
        const reject = 256 - (256 % chars.length); // 252 for 36 chars
        let secret = '';
        while (secret.length < CLIP_CONFIG.QUICK_SHARE_ID_LENGTH) {
            const byte = crypto.getRandomValues(new Uint8Array(1))[0];
            if (byte < reject) {
                secret += chars[byte % chars.length];
            }
        }
        return secret;
    }

    // Generate random hash for filenames
    generateRandomHash() {
        // Generate a random 16-character hash for filenames
        const array = new Uint8Array(8); // 64 bits
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Add minimal padding only for very small text content to obscure actual size
    addMinimalPadding(data) {
        const originalSize = data.length;
        const minimumSize = 10 * 1024; // 10KB minimum for small content
        
        // Only pad content smaller than 10KB
        if (originalSize >= minimumSize) {
            return data; // No padding for larger content
        }
        
        const paddingSize = minimumSize - originalSize;
        
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

    // Remove minimal padding from text content during decryption
    removeMinimalPadding(paddedData, originalSize = null) {
        if (!originalSize) {
            // If no original size provided, return data as-is
            return paddedData;
        }
        
        if (originalSize > paddedData.length) {
            console.warn('⚠️ Original size larger than padded data, returning padded data');
            return paddedData;
        }
        
        // Extract original data by removing padding
        const originalData = paddedData.slice(0, originalSize);
        const paddingRemoved = paddedData.length - originalSize;
        
        if (paddingRemoved > 0) {
        }
        
        return originalData;
    }

    // Hash a secret for use in encryption
    async hashSecret(secret) {
        const encoder = new TextEncoder();
        const data = encoder.encode(secret);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Generate clip ID (6 characters for Quick Share, 10 for normal)
    generateClipId(quickShare = false) {
        const chars = CLIP_CONFIG.CLIP_ID_CHARS;
        const length = quickShare ? CLIP_CONFIG.QUICK_SHARE_ID_LENGTH : CLIP_CONFIG.NORMAL_ID_LENGTH;
        const reject = 256 - (256 % chars.length); // 252 for 36 chars
        let result = '';
        while (result.length < length) {
            const byte = crypto.getRandomValues(new Uint8Array(1))[0];
            if (byte < reject) {
                result += chars.charAt(byte % chars.length);
            }
        }
        return result;
    }

    // Retrieve Content
    async retrieveContent() {
        const clipId = document.getElementById('clip-id-input').value.trim();
        const password = document.getElementById('retrieve-password-input').value.trim();

        // Reset auto-retrieve block when user manually triggers retrieve
        this.blockAutoRetrieve = false;
        // Enhanced validation with specific error messages
        if (!clipId) {
            this.showToast('❌ Please enter a clip ID', 'error');
            document.getElementById('clip-id-input').focus();
            return;
        }

        if (clipId.trim().length === 0) {
            this.showToast('❌ Clip ID cannot be empty (only spaces/whitespace)', 'error');
            document.getElementById('clip-id-input').focus();
            return;
        }

        if (clipId.length !== 6 && clipId.length !== 10) {
            this.showToast(`❌ Invalid clip ID length: ${clipId.length} characters (must be exactly 6 or 10)`, 'error');
            document.getElementById('clip-id-input').focus();
            return;
        }

        // Validate clip ID format (only uppercase letters and numbers)
        if (!/^[A-Z0-9]+$/.test(clipId)) {
            const invalidChars = clipId.split('').filter(char => !/[A-Z0-9]/.test(char));
            this.showToast(`❌ Invalid characters in clip ID: ${invalidChars.join(', ')} (only A-Z and 0-9 allowed)`, 'error');
            document.getElementById('clip-id-input').focus();
            return;
        }

        // Validate password if required
        if (clipId.length === CLIP_CONFIG.NORMAL_ID_LENGTH && password) {
            if (password.length > 128) {
                this.showToast(`❌ Password too long: ${password.length} characters (max 128)`, 'error');
                document.getElementById('retrieve-password-input').focus();
                return;
            }
        }

        // Check if this clip requires a password by checking the password field visibility
        const passwordSection = document.getElementById('password-section');
        if (passwordSection && !passwordSection.classList.contains('hidden')) {
            // Password field is visible, which means this clip requires a password
            if (!password || password.trim().length === 0) {
                this.showToast('❌ Please enter the password for this protected content', 'error');
                document.getElementById('retrieve-password-input').focus();
                return;
            }
        }

        this.showLoading('retrieve-loading');
        const retrieveButton = document.getElementById('retrieve-button');
        retrieveButton.disabled = true;

        try {
            // Extract URL secret from current URL if available
            const urlSecret = this.extractUrlSecret();
            
            // NEW: Zero-Knowledge Access Code System - No download tokens
            // URL Secret stays client-side for encryption, password sent for access control only
            let requestBody = null;
            let fetchOptions = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            };
            
            if (clipId.length === CLIP_CONFIG.NORMAL_ID_LENGTH && password) {
                // Normal clip with password: Use POST with hashed access code (Zero-Knowledge - server never sees password)
                fetchOptions.method = 'POST';
                const accessCodeHash = await this.generateAccessCodeHash(password);
                requestBody = { accessCode: accessCodeHash };
                fetchOptions.body = JSON.stringify(requestBody);
            } else if (clipId.length === CLIP_CONFIG.NORMAL_ID_LENGTH) {
                // Normal clip without password: URL secret only (client-side)
                // Stay with GET request, no authentication needed
            } else {
                // Quick Share (6-digit): no authentication needed
            }
            
            // Make API request with Zero-Knowledge access code system
            const response = await fetch(`/api/clip/${clipId}`, fetchOptions);

            const data = await response.json();

            if (response.ok) {
                // Check if this is a text file stored as file (needs redirect to showRetrieveResult)
                if (data.contentType === 'text' && data.redirectTo) {
                    await this.showRetrieveResult(data);
                    return;
                }

                // Check if this is a file first
                if (data.contentType === 'file' && data.redirectTo) {
                    // Since we're in retrieveContent, the user has already been authenticated
                    // and provided a password, so we don't need to check hasPassword again
                    data.hasPassword = false; // User is already authenticated
                    this.handleFileDownload(data);
                    return;
                }

                // Check if this is a file by checking for file_path
                if (data.file_path) {
                    // Since we're in retrieveContent, the user has already been authenticated
                    // and provided a password, so we don't need to check hasPassword again
                    data.hasPassword = false; // User is already authenticated
                    this.handleFileDownload(data);
                    return;
                }

                // Decrypt the content before showing (only for text content)
                try {
                    let decryptedContent;
                    
                    // Check if this is a Quick Share (short ID) or normal clip
                    if (clipId.length === CLIP_CONFIG.QUICK_SHARE_ID_LENGTH) {
                        // Quick Share: Use URL secret from fragment or manual input
                        const qsUrlSecret = urlSecret || (document.getElementById('quick-share-secret-input') ? document.getElementById('quick-share-secret-input').value.trim().toUpperCase() : '');
                        if (!qsUrlSecret) {
                            throw new Error('Quick Share secret not provided. Enter the 6-character secret to decrypt.');
                        }
                        decryptedContent = await this.decryptContent(data.content, null, qsUrlSecret);
                    } else {
                        // Normal mode: Decrypt the content
                        decryptedContent = await this.decryptContent(data.content, password, urlSecret);
                    }
                    
                    // Create a new data object with decrypted content but preserve other properties
                    const resultData = {
                        ...data,
                        content: decryptedContent
                    };
                    await this.showRetrieveResult(resultData);
                } catch (decryptError) {
                    console.error('❌ Decryption error:', decryptError);
                    if (decryptError.message.includes('password is incorrect')) {
                        throw new Error('❌ Wrong password or URL secret');
                    } else if (decryptError.message.includes('corrupted')) {
                        throw new Error('❌ Content appears to be corrupted or tampered with');
                    } else if (decryptError.message.includes('Quick Share secret not found')) {
                        throw new Error('❌ Quick Share secret not found - clip may be corrupted');
                    } else {
                        throw new Error(`❌ Decryption failed: ${decryptError.message}`);
                    }
                }
            } else {
                console.error('❌ API error response:', data);
                
                // Handle authentication errors with generic messages to prevent brute force attacks
                if (response.status === 401 || response.status === 403) {
                    // Generic error message for authentication failures
                    // This prevents attackers from knowing if the clip exists or what type it is
                    throw new Error('❌ Access denied: Invalid credentials or clip not found');
                }
                
                // Handle other errors
                if (data.message) {
                    throw new Error(`❌ ${data.error || 'Server error'}: ${data.message}`);
                } else {
                    throw new Error(`❌ ${data.error || 'Failed to retrieve clip'}`);
                }
            }
        } catch (error) {
            console.error('❌ retrieveContent error:', error);
            this.showToast(error.message || '❌ Failed to retrieve content', 'error');
            document.getElementById('content-result').classList.add('hidden');
        } finally {
            this.hideLoading('retrieve-loading');
            retrieveButton.disabled = false;
        }
    }

    // Show Share Result Modal
    showShareResult(data) {
        document.getElementById('share-url').value = data.url;
        document.getElementById('clip-id').value = data.clipId;
        
        // Show/hide clip ID section based on Quick Share mode
        const clipIdSection = document.getElementById('clip-id-section');
        if (data.quickShare) {
            // For Quick Share: show the ID section
            clipIdSection.style.display = 'block';
        } else {
            // For normal clips: hide the ID section (URL secret is needed anyway)
            clipIdSection.style.display = 'none';
        }
        
        // Show verbal code for Quick Share
        const verbalCodeSection = document.getElementById('verbal-code-section');
        if (verbalCodeSection) {
            if (data.quickShare && data.quickShareUrlSecret) {
                const verbalCode = `${data.clipId} · ${data.quickShareUrlSecret}`;
                document.getElementById('verbal-code-display').textContent = verbalCode;
                verbalCodeSection.style.display = 'block';
            } else {
                verbalCodeSection.style.display = 'none';
            }
        }

        // Generate QR code client-side
        this.generateQRCode(data.url);

        // Format expiration time with robust error handling
        try {
            const expiresAt = data.expiresAt;
            
            if (expiresAt === null || expiresAt === undefined) {
                document.getElementById('expiry-time').textContent = 'Not available';
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
                    console.warn('Invalid timestamp format:', expiresAt);
                    document.getElementById('expiry-time').textContent = 'Invalid date format';
                    return;
                }
                timestamp = parseInt(expiresAt.trim(), 10);
            } else if (typeof expiresAt === 'number') {
                timestamp = expiresAt;
            } else {
                console.warn('Unexpected expiry date type:', typeof expiresAt, expiresAt);
                document.getElementById('expiry-time').textContent = 'Invalid date type';
                return;
            }
            
            // Validate timestamp range
            if (timestamp < 0) {
                console.warn('Negative timestamp:', timestamp);
                document.getElementById('expiry-time').textContent = 'Invalid timestamp';
                return;
            }
            
            // Auto-detect seconds vs milliseconds
            // Timestamps in seconds are typically < 2^31 (2038 problem)
            // Millisecond timestamps are much larger
            const currentTime = Date.now();
            const currentTimeSeconds = Math.floor(currentTime / 1000);
            
            let finalTimestamp = timestamp;
            
            // If timestamp looks like seconds (smaller number), convert to milliseconds
            if (timestamp < 10000000000) { // Less than year 2286 in seconds
                finalTimestamp = timestamp * 1000;
            }
            
            // Validate the final timestamp is reasonable
            const minValidTime = new Date('2020-01-01').getTime(); // Minimum reasonable time
            const maxValidTime = new Date('2100-01-01').getTime(); // Maximum reasonable time
            
            if (finalTimestamp < minValidTime || finalTimestamp > maxValidTime) {
                console.warn('Timestamp out of reasonable range:', finalTimestamp);
                document.getElementById('expiry-time').textContent = 'Date out of range';
                return;
            }
            
            // Create and validate Date object
            const expiryDate = new Date(finalTimestamp);
            
            if (!isNaN(expiryDate.getTime())) {
                const formattedDate = expiryDate.toLocaleString();
                document.getElementById('expiry-time').textContent = formattedDate;
                
                // Add expiry status indicator
                const now = new Date();
                if (expiryDate < now) {
                    const expiryElement = document.getElementById('expiry-time');
                    expiryElement.style.color = '#dc2626'; // Red for expired
                    expiryElement.textContent = formattedDate + ' (Expired)';
                } else {
                    const expiryElement = document.getElementById('expiry-time');
                    expiryElement.style.color = '#059669'; // Green for valid
                }
            } else {
                console.error('Created invalid Date object from timestamp:', finalTimestamp);
                document.getElementById('expiry-time').textContent = 'Date parsing failed';
            }
            
        } catch (error) {
            console.error('Error formatting expiry date:', error, { expiresAt: data.expiresAt });
            document.getElementById('expiry-time').textContent = 'Error formatting date';
        }
        
        document.getElementById('success-modal').classList.remove('hidden');
    }

    // Generate QR code client-side
    async generateQRCode(url) {
        try {
            const qrCodeImg = document.getElementById('qr-code');
            
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
                text: url,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#FFFFFF',
                correctLevel: QRCode.CorrectLevel.M
            });
            
            // Wait a moment for the QR code to be generated
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Get the generated image
            const generatedImg = tempContainer.querySelector('img');
            if (generatedImg) {
                qrCodeImg.src = generatedImg.src;
                qrCodeImg.style.display = 'block';
            } else {
                throw new Error('QR code image not generated');
            }
            
            // Clean up temporary container
            document.body.removeChild(tempContainer);
            
        } catch (error) {
            // Fallback to text if QR generation fails
            const qrCodeImg = document.getElementById('qr-code');
            qrCodeImg.style.display = 'none';
            this.showToast('QR code generation failed, but URL is available', 'info');
        }
    }

    // Show Retrieve Result
    async showRetrieveResult(data) {
        // Check if this is a text file stored as file (needs programmatic download + decryption)
        if (data.contentType === 'text' && data.redirectTo && data.isTextFile) {
            await this.handleTextFileDownload(data);
            return;
        }

        // Check if this is a file redirect (for files stored on disk)
        if (data.contentType === 'file' && data.redirectTo) {
            this.handleFileDownload(data);
            return;
        }

        // Check if this is a file by checking for file_path
        if (data.file_path) {
            this.handleFileDownload(data);
            return;
        }

        // Check if this is a file by checking for filename and filesize (for multi-part uploads)
        // BUT: If contentType is 'text', treat it as text content even if it has filename/filesize
        if (data.filename && data.filesize && data.contentType !== 'text') {
            this.handleFileDownload(data);
            return;
        }

        // Special handling for text content that was uploaded as a file (e.g., .txt files)
        // If contentType is 'text' but we have filename/filesize, treat it as text content
        if (data.contentType === 'text' && data.filename && data.filesize) {
            // This is text content that was uploaded as a file (like .txt files)
            // We should decrypt and display it as text, not download it
        }
        // Handle content based on type
        if (data.contentType === 'text' && typeof data.content === 'string') {
            // Unencrypted text content
            document.getElementById('retrieved-content').textContent = data.content;
        } else if (Array.isArray(data.content)) {
            // Binary content - could be encrypted text or binary data
            try {
                // Extract decryption keys - both Quick Share and normal clips use URL fragment
                let urlSecret = this.extractUrlSecret();
                let password = this.getPasswordFromUser();

                // For Quick Share, also check manual secret input
                if (!urlSecret) {
                    const secretInput = document.getElementById('quick-share-secret-input');
                    if (secretInput && secretInput.value.trim()) {
                        urlSecret = secretInput.value.trim().toUpperCase();
                    }
                }

                if (urlSecret || password) {
                    // Attempt decryption
                    const decryptedText = await this.decryptContent(data.content, password, urlSecret);
                    document.getElementById('retrieved-content').textContent = decryptedText;
                } else {
                    // No decryption keys available, try to decode as UTF-8
                    const bytes = new Uint8Array(data.content);
                    const text = new TextDecoder('utf-8').decode(bytes);
                    document.getElementById('retrieved-content').textContent = text;
                }
            } catch (error) {
                console.error('❌ Content decryption error:', error);
                this.showToast('❌ Failed to decrypt content: ' + error.message, 'error');
                return;
            }
        } else {
            // Other content types
            document.getElementById('retrieved-content').textContent = 'Content type not supported for display';
        }

        // Set metadata
        document.getElementById('created-time').textContent = new Date().toLocaleString();

        // Format expiration time
        try {
            const expiresAt = data.expiresAt;
            if (expiresAt) {
                const expiresAtNumber = typeof expiresAt === 'string' ? parseInt(expiresAt, 10) : expiresAt;
                const expiryDate = new Date(expiresAtNumber);

                if (!isNaN(expiryDate.getTime())) {
                    const now = new Date();
                    const timeLeft = expiryDate - now;

                    if (timeLeft <= 0) {
                        document.getElementById('expiry-info').textContent = 'This content has expired';
                        document.getElementById('expiry-info').style.color = 'var(--error-color)';
                    } else {
                        const minutes = Math.floor(timeLeft / 60000);
                        const hours = Math.floor(minutes / 60);
                        const days = Math.floor(hours / 24);

                        let timeLeftText;
                        if (days > 0) {
                            timeLeftText = `${days} day${days > 1 ? 's' : ''}`;
                        } else if (hours > 0) {
                            timeLeftText = `${hours} hour${hours > 1 ? 's' : ''}`;
                        } else {
                            timeLeftText = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
                        }

                        document.getElementById('expiry-info').textContent = `Expires in ${timeLeftText} (${expiryDate.toLocaleString()})`;
                        document.getElementById('expiry-info').style.color = 'var(--text-secondary)';
                    }
                } else {
                    document.getElementById('expiry-info').textContent = 'Unknown expiration';
                }
            } else {
                document.getElementById('expiry-info').textContent = 'No expiration set';
            }
        } catch (error) {
            console.error('❌ Expiry time parsing error:', error);
            document.getElementById('expiry-info').textContent = 'Unknown expiration';
        }

        // Handle one-time access notification
        if (data.oneTime) {
            document.getElementById('one-time-info').style.display = 'block';
        } else {
            document.getElementById('one-time-info').style.display = 'none';
        }

        // Show the result
        document.getElementById('result-container').style.display = 'block';
        this.hideLoading('retrieve-loading');

        // Auto-focus on copy button for better UX
        setTimeout(() => {
            const copyButton = document.getElementById('copy-content-button');
            if (copyButton) {
                copyButton.focus();
            }
        }, 100);

        // Handle file information if this is a text upload as file
        if (data.filename && data.filesize) {
            
            // Extract URL secret from fragment or manual input (zero-knowledge)
            urlSecret = this.extractUrlSecret();
            if (!urlSecret) {
                const secretInput = document.getElementById('quick-share-secret-input');
                if (secretInput && secretInput.value.trim()) {
                    urlSecret = secretInput.value.trim().toUpperCase();
                }
            }
        }
    }

    // Handle text file download and decryption
    async handleTextFileDownload(data) {
        try {
            
            // Extract decryption keys based on clip type
            let urlSecret = null;
            let password = null;
            
            // Extract decryption keys - Quick Share and normal clips both use URL fragment
            urlSecret = this.extractUrlSecret();
            password = this.getPasswordFromUser();

            // For Quick Share, also check manual secret input if no URL fragment
            if (!urlSecret && data.redirectTo) {
                const clipId = data.redirectTo.split('/').pop();
                if (clipId.length === CLIP_CONFIG.QUICK_SHARE_ID_LENGTH) {
                    const secretInput = document.getElementById('quick-share-secret-input');
                    if (secretInput && secretInput.value.trim()) {
                        urlSecret = secretInput.value.trim().toUpperCase();
                    }
                }
            }

            // Download the encrypted file using new authenticated method
            
            // Extract clipId from redirectTo URL (e.g., "/api/file/H6LEGF78SB" -> "H6LEGF78SB")
            const clipId = data.redirectTo.split('/').pop();
            
            // NEW: Use Zero-Knowledge Access Code System instead of download tokens
            let requestBody = {};
            
            if (clipId.length === CLIP_CONFIG.NORMAL_ID_LENGTH && password) {
                // Normal clip with password: Use access code for authentication
                requestBody.accessCode = password; // Send password for access control
            } else if (clipId.length === CLIP_CONFIG.NORMAL_ID_LENGTH) {
                // Normal clip without password: No authentication needed (URL secret is client-side)
            } else {
                // Quick Share (6-digit): No authentication needed
            }
            
            // Make authenticated POST request
            const response = await fetch(data.redirectTo, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('❌ Text file download API error:', error);
                if (response.status === 401 || response.status === 403) {
                    throw new Error('❌ Access denied: Wrong password or URL secret for text file');
                }
                throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
            }

            // Get the encrypted file as array buffer
            const encryptedBuffer = await response.arrayBuffer();
            const encryptedBytes = new Uint8Array(encryptedBuffer);
            

            // Decrypt the content using the same method as file downloads
            const decryptedBytes = await this.decryptFile(encryptedBytes, password, urlSecret);
            
            // Remove padding if present (check if data has padding marker)
            let finalDecryptedBytes = decryptedBytes;
            if (decryptedBytes.length >= 4) {
                // Check if there's a size marker at the end (padding was applied)
                const sizeMarker = new DataView(decryptedBytes.buffer.slice(decryptedBytes.length - 4)).getUint32(0, false);
                if (sizeMarker > 0 && sizeMarker < decryptedBytes.length - 4) {
                    // Padding was applied, remove it
                    finalDecryptedBytes = this.removeMinimalPadding(decryptedBytes, sizeMarker);
                }
            }
            
            const decoder = new TextDecoder();
            const decryptedText = decoder.decode(finalDecryptedBytes);
            

            // Display as text content
            document.getElementById('retrieved-content').textContent = decryptedText;
            
            // Set metadata
            document.getElementById('created-time').textContent = new Date().toLocaleString();
            
            // Format expiration time
            try {
                const expiresAt = data.expiresAt;
                if (expiresAt) {
                    const expiresAtNumber = typeof expiresAt === 'string' ? parseInt(expiresAt, 10) : expiresAt;
                    const expiryDate = new Date(expiresAtNumber);
                    
                    if (!isNaN(expiryDate.getTime())) {
                        const timeRemaining = this.formatTimeRemaining(expiryDate.getTime());
                        const formattedDate = expiryDate.toLocaleString();
                        document.getElementById('expires-time').textContent = `${formattedDate} (${timeRemaining} remaining)`;
                    } else {
                        document.getElementById('expires-time').textContent = 'Invalid date';
                    }
                } else {
                    document.getElementById('expires-time').textContent = 'Not available';
                }
            } catch (error) {
                document.getElementById('expires-time').textContent = 'Error formatting date';
            }
            
            // Handle one-time notice
            const oneTimeNotice = document.getElementById('one-time-notice');
            if (data.oneTime) {
                oneTimeNotice.classList.remove('hidden');
            } else {
                oneTimeNotice.classList.add('hidden');
            }
            
            // Show text-related elements
            this.showTextElements();
            
            // Show the result container
            document.getElementById('content-result').classList.remove('hidden');
            document.getElementById('content-result').style.display = 'block';
            
            // Scroll to result
            document.getElementById('content-result').scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error('❌ Text file download/decryption error:', error);
            
            if (error.message.includes('password is incorrect')) {
                this.showToast('❌ Wrong password or URL secret', 'error');
            } else if (error.message.includes('corrupted')) {
                this.showToast('❌ Content appears to be corrupted or tampered with', 'error');
            } else {
                this.showToast(`❌ Failed to decrypt text file: ${error.message}`, 'error');
            }
        }
    }

    // Check if a file requires password input
    checkFilePasswordRequirement(data) {
        const passwordInput = document.getElementById('retrieve-password-input');

        // Check if we have URL secret (indicates encryption)
        const urlSecret = this.extractUrlSecret();

        // For files, show password section only if:
        // 1. We have a URL secret (indicating encryption) AND
        // 2. The file has a password hash (indicating it was password-protected)
        if (urlSecret && data.hasPassword) {
            // URL secret exists AND file has password, show password input
            this.setPasswordSectionVisible(true);
            if (passwordInput) {
                passwordInput.focus();
            }
        } else {
            // No URL secret OR no password, hide password section
            this.setPasswordSectionVisible(false);
        }
    }

    // Lazy-initialized cache for text-related DOM elements.
    // These elements are static (never added/removed from the DOM), so we only
    // need to query them once and can reuse the references across hide/show calls.
    _getTextElements() {
        if (!this._textElementsCache) {
            this._textElementsCache = {
                retrievedContent: document.getElementById('retrieved-content'),
                copyContentButton: document.getElementById('copy-content-button'),
                oneTimeNotice: document.getElementById('one-time-notice'),
                contentActions: document.querySelector('.content-actions'),
                contentDisplay: document.querySelector('.content-display'),
                contentInfo: document.querySelector('.content-info'),
                newPasteSection: document.querySelector('.new-paste-section')
            };
        }
        return this._textElementsCache;
    }

    // Helper function to hide all text-related elements
    hideAllTextElements() {
        const els = this._getTextElements();

        if (els.retrievedContent) els.retrievedContent.style.display = 'none';
        if (els.copyContentButton) els.copyContentButton.style.display = 'none';
        if (els.contentActions) els.contentActions.style.display = 'none';
        if (els.contentDisplay) els.contentDisplay.style.display = 'none';
        if (els.contentInfo) els.contentInfo.style.display = 'none';
        if (els.newPasteSection) els.newPasteSection.style.display = 'none';
        if (els.oneTimeNotice) els.oneTimeNotice.style.display = 'none';

        // Note: Password section visibility is handled by checkClipId function
        // which shows it only for text content with passwords, not for files
    }

    // Helper function to show all text-related elements
    showTextElements() {
        const els = this._getTextElements();

        if (els.retrievedContent) els.retrievedContent.style.display = 'block';
        if (els.copyContentButton) els.copyContentButton.style.display = 'block';
        if (els.contentActions) els.contentActions.style.display = 'flex';
        if (els.contentDisplay) els.contentDisplay.style.display = 'block';
        if (els.contentInfo) els.contentInfo.style.display = 'block';
        if (els.newPasteSection) els.newPasteSection.style.display = 'block';
        if (els.oneTimeNotice) els.oneTimeNotice.style.display = 'block';
    }

    // Copy to Clipboard
    async copyToClipboard(text, successMessage = 'Copied to clipboard!') {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(successMessage, 'success');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showToast(successMessage, 'success');
            } catch (fallbackError) {
                this.showToast('Failed to copy to clipboard', 'error');
            }
            document.body.removeChild(textArea);
        }
    }

    // Modal Management
    closeModal() {
        document.getElementById('success-modal').classList.add('hidden');
        
        // Reset the share form when modal is closed
        this.resetShareForm();
    }

    // Reset Share Form
    resetShareForm() {
        // Clear content input
        document.getElementById('content-input').value = '';
        
        // Clear password input
        document.getElementById('password-input').value = '';
        
        // Reset checkboxes to default state
        document.getElementById('one-time-checkbox').checked = false;
        document.getElementById('quick-share-checkbox').checked = false;
        
        // Reset expiration to default (30 minutes)
        document.getElementById('expiration-select').value = '30min';
        
        // Re-enable all form controls that might have been disabled by Quick Share
        const expirationSelect = document.getElementById('expiration-select');
        const oneTimeCheckbox = document.getElementById('one-time-checkbox');
        const passwordInput = document.getElementById('password-input');
        const passwordGroup = passwordInput.closest('.form-row');
        
        // Re-enable expiration select
        expirationSelect.disabled = false;
        
        // Re-enable one-time checkbox (always enabled now)
        oneTimeCheckbox.disabled = false;
        
        // Re-enable password input and restore opacity
        passwordInput.disabled = false;
        passwordGroup.style.opacity = '1';
        
        // Update character counter
        this.updateCharCounter();
        
        // Focus back to content input for better UX
        document.getElementById('content-input').focus();
    }

    // Loading States
    showLoading(loadingId) {
        document.getElementById(loadingId).classList.remove('hidden');
    }

    hideLoading(loadingId) {
        document.getElementById(loadingId).classList.add('hidden');
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
        document.getElementById(messageId).textContent = message;
        document.getElementById(toastId).classList.remove('hidden');
        
        // Auto-hide after 3 seconds for success/copy messages, 4 seconds for errors
        const autoHideDelay = (type === 'success' || type === 'info') ? 3000 : 4000;
        setTimeout(() => {
            document.getElementById(toastId).classList.add('hidden');
        }, autoHideDelay);
    }

    // Utility Methods
    formatTimeRemaining(expiresAt) {
        const now = Date.now();
        const remaining = expiresAt - now;
        
        if (remaining <= 0) return 'Expired';
        
        const minutes = Math.floor(remaining / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        return `${minutes}m`;
    }

    // Input sanitization
    sanitizeInput(input) {
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    setPasswordSectionVisible(visible) {
        const passwordSection = document.getElementById('password-section');
        if (!passwordSection) return;
        if (visible) {
            passwordSection.classList.remove('hidden');
            passwordSection.style.display = 'block';
        } else {
            passwordSection.classList.add('hidden');
            passwordSection.style.display = '';
        }
    }

    // FAQ Accordion functionality with dynamic height
    toggleFAQ(faqId) {
        const question = document.querySelector(`[data-faq="${faqId}"]`);
        const answer = document.getElementById(`faq-${faqId}`);
        
        // Close all other FAQs
        document.querySelectorAll('.faq-question').forEach(btn => {
            if (btn !== question) {
                btn.classList.remove('active');
                const otherId = btn.dataset.faq;
                const otherAnswer = document.getElementById(`faq-${otherId}`);
                if (otherAnswer) {
                    otherAnswer.classList.remove('active');
                    // Reset height for closed answers
                    otherAnswer.style.maxHeight = '0px';
                }
            }
        });
        
        // Toggle current FAQ
        const isActive = question.classList.contains('active');
        if (isActive) {
            // Closing
            question.classList.remove('active');
            answer.classList.remove('active');
            answer.style.maxHeight = '0px';
        } else {
            // Opening
            question.classList.add('active');
            answer.classList.add('active');
            
            // Calculate the actual content height
            const contentHeight = answer.scrollHeight;
            const maxViewportHeight = window.innerHeight * 0.8; // 80% of viewport height
            const finalHeight = Math.min(contentHeight, maxViewportHeight);
            
            // Set the height for smooth animation
            answer.style.maxHeight = `${finalHeight}px`;
            
            // Add scroll if content is taller than viewport
            if (contentHeight > maxViewportHeight) {
                answer.style.overflowY = 'auto';
            } else {
                answer.style.overflowY = 'hidden';
            }
        }
    }

    // Privacy Notice Management
    dismissPrivacyNotice() {
        const privacyNotice = document.getElementById('privacy-notice');
        privacyNotice.classList.add('hidden');
        
        // Store dismissal in localStorage to remember user preference
        try {
            localStorage.setItem('privacy-notice-dismissed', 'true');
        } catch (e) {
            // If localStorage is not available, just hide the notice
        }
    }

    // Check if privacy notice should be shown
    checkPrivacyNotice() {
        try {
            const dismissed = localStorage.getItem('privacy-notice-dismissed');
            if (dismissed === 'true') {
                document.getElementById('privacy-notice').classList.add('hidden');
            } else {
                document.getElementById('privacy-notice').classList.remove('hidden');
            }
        } catch (e) {
            // Fallback: always show
            document.getElementById('privacy-notice').classList.remove('hidden');
        }
    }

    // V3 key derivation: per-clip random salt, 600k iterations
    async generateKeyV3(password, urlSecret, saltBytes) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Web Crypto API not available. Please use HTTPS.');
        }
        let secret;
        if (password && urlSecret) {
            secret = urlSecret + ':' + password;
        } else if (urlSecret) {
            secret = urlSecret;
        } else {
            throw new Error('Either password or urlSecret must be provided');
        }

        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: CLIP_CONFIG.PBKDF2_ITERATIONS_V3,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async encryptContent(content, password = null, urlSecret = null) {
        try {
            // Input validation
            if (typeof content !== 'string' || content.length === 0) {
                throw new Error('Content must be a non-empty string');
            }

            if (content.length > 400000) {
                throw new Error('Content too large (max 400,000 characters)');
            }

            if (password !== null && (typeof password !== 'string' || password.length === 0)) {
                throw new Error('Password must be a non-empty string or null');
            }

            if (urlSecret !== null && (typeof urlSecret !== 'string' || urlSecret.length === 0)) {
                throw new Error('URL secret must be a non-empty string or null');
            }

            // Check if content is already encrypted
            if (this.isEncrypted(content)) {
                return content; // Already encrypted, return as-is
            }

            const encoder = new TextEncoder();
            const data = encoder.encode(content);

            // V3 format: random salt, random IV, 600k iterations
            const salt = new Uint8Array(CLIP_CONFIG.SALT_LENGTH_V3);
            window.crypto.getRandomValues(salt);
            const iv = new Uint8Array(CLIP_CONFIG.AES_IV_LENGTH);
            window.crypto.getRandomValues(iv);

            const key = await this.generateKeyV3(password, urlSecret, salt);
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            const encryptedBytes = new Uint8Array(encryptedData);

            // V3 payload: [version:1][salt:32][IV:12][ciphertext]
            const combined = new Uint8Array(1 + salt.length + iv.length + encryptedBytes.length);
            combined[0] = CLIP_CONFIG.FORMAT_VERSION_V3;
            combined.set(salt, 1);
            combined.set(iv, 1 + salt.length);
            combined.set(encryptedBytes, 1 + salt.length + iv.length);

            return combined;
        } catch (error) {
            throw new Error('Failed to encrypt content');
        }
    }

    isEncrypted(content) {
        try {
            // Check if content is a Uint8Array, Array, or base64 string
            if (content instanceof Uint8Array) {
                // New format: raw bytes
                return content.length >= 20; // Minimum size: IV (12 bytes) + some encrypted data
            } else if (Array.isArray(content)) {
                // Array format from server
                return content.length >= 20;
            } else if (typeof content === 'string') {
                // Old format: base64 string
                if (content.length < 20) {
                    return false;
                }
                
                // Try to decode as base64
                const decoded = atob(content);
                const bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) {
                    bytes[i] = decoded.charCodeAt(i);
                }
                
                return bytes.length >= 20;
            }
            
            return false;
        } catch {
            // If decoding fails, it's not encrypted
            return false;
        }
    }

    async decryptContent(encryptedContent, password = null, urlSecret = null) {
        try {
            // Input validation
            if (encryptedContent === null || encryptedContent === undefined) {
                throw new Error('Encrypted content cannot be null or undefined');
            }

            if (password !== null && (typeof password !== 'string' || password.length === 0)) {
                throw new Error('Password must be a non-empty string or null');
            }

            if (urlSecret !== null && (typeof urlSecret !== 'string' || urlSecret.length === 0)) {
                throw new Error('URL secret must be a non-empty string or null');
            }

            // Check if content is actually encrypted
            if (!this.isEncrypted(encryptedContent)) {
                return encryptedContent;
            }

            let bytes;

            // Handle multiple formats: Uint8Array, Array, and base64 string
            if (encryptedContent instanceof Uint8Array) {
                bytes = encryptedContent;
            } else if (Array.isArray(encryptedContent)) {
                bytes = new Uint8Array(encryptedContent);
            } else if (typeof encryptedContent === 'string') {
                const decoded = atob(encryptedContent);
                bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) {
                    bytes[i] = decoded.charCodeAt(i);
                }
            } else {
                throw new Error('Invalid encrypted content format');
            }

            if (bytes.length < 12) {
                throw new Error('Invalid encrypted data: too short');
            }

            const V3_HEADER = 1 + CLIP_CONFIG.SALT_LENGTH_V3 + CLIP_CONFIG.AES_IV_LENGTH; // 45
            let iv, encryptedData, key;

            if (bytes[0] === CLIP_CONFIG.FORMAT_VERSION_V3 && bytes.length >= V3_HEADER + 16) {
                // V3 format: [version:1][salt:32][IV:12][ciphertext]
                const salt = bytes.slice(1, 1 + CLIP_CONFIG.SALT_LENGTH_V3);
                iv = bytes.slice(1 + CLIP_CONFIG.SALT_LENGTH_V3, V3_HEADER);
                encryptedData = bytes.slice(V3_HEADER);
                key = await this.generateKeyV3(password, urlSecret, salt);
            } else {
                throw new Error('Unsupported encryption format (legacy V1/V2 no longer supported)');
            }

            const decryptedData = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedData
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedData);
        } catch (error) {
            throw new Error('Failed to decrypt content. The content may be corrupted or the password is incorrect.');
        }
    }

    // Handle Quick Share checkbox change
    handleQuickShareChange() {
        const quickShare = document.getElementById('quick-share-checkbox').checked;
        const expirationSelect = document.getElementById('expiration-select');
        const oneTimeCheckbox = document.getElementById('one-time-checkbox');
        const passwordInput = document.getElementById('password-input');
        const passwordGroup = passwordInput.closest('.form-row');
        
        if (quickShare) {
            // Quick Share mode: Set to 5min, disable expiration and password, but keep one-time option
            expirationSelect.value = '5min';
            expirationSelect.disabled = true;
            // Keep one-time checkbox enabled for Quick Share
            oneTimeCheckbox.disabled = false;
            passwordInput.value = '';
            passwordGroup.style.opacity = '0.5';
            passwordInput.disabled = true;
        } else {
            // Normal mode: Re-enable all options
            expirationSelect.disabled = false;
            oneTimeCheckbox.disabled = false;
            passwordGroup.style.opacity = '1';
            passwordInput.disabled = false;
        }
    }

    // Go to home page (share tab)
    goToHome() {
        // Update URL to home page
        history.replaceState(null, '', '/');
        
        // Switch to share tab
        this.switchTab('share');
        
        // Clear any retrieved content
        const contentResult = document.getElementById('content-result');
        if (contentResult) {
            contentResult.classList.add('hidden');
        }
        
        // Clear clip ID input
        const clipIdInput = document.getElementById('clip-id-input');
        if (clipIdInput) {
            clipIdInput.value = '';
        }
        
        // Hide password section
        this.setPasswordSectionVisible(false);
    }

    // Handle File Download
    async handleFileDownload(data) {
        // Check if password is required
        const urlSecret = this.extractUrlSecret();
        const passwordRequired = urlSecret && data.hasPassword;
        
        if (passwordRequired) {
            // Password required - show password field and don't show file yet
            this.checkFilePasswordRequirement(data);
            
            // Show info message
            this.showToast('🔐 This file requires a password. Please enter it and click Retrieve.', 'info');
            return; // Don't show file download UI yet
        }
        
        // No password required - show file download UI
        this.showFileDownloadUI(data);
    }

    // Show file download UI (separate function for cleaner code)
    showFileDownloadUI(data) {
        // Hide all text-related elements first
        this.hideAllTextElements();
        
        // Create file download UI
        const contentResult = document.getElementById('content-result');
        
        
        // Create file download section if it doesn't exist
        let fileSection = document.getElementById('file-download-section');
        if (!fileSection) {
            fileSection = document.createElement('div');
            fileSection.id = 'file-download-section';
            fileSection.className = 'file-download-section';
            contentResult.appendChild(fileSection);
        } else {
        }
        
        // Create modern file download UI
        fileSection.innerHTML = `
            <div class="result-header">
                <label class="label">🔒 Encrypted File Ready</label>
            </div>
            <div class="file-download-card">
                <div class="file-info">
                    <div class="file-icon">📄</div>
                    <div class="file-details">
                        <div class="file-name" id="download-filename"></div>
                        <div class="file-size" id="download-filesize"></div>
                    </div>
                </div>
                <div class="file-actions">
                    <button id="download-file-button" class="primary-button">
                        <span class="button-icon">📥</span>
                        Download File
                    </button>
                </div>
            </div>
            <div class="one-time-file-notice hidden" id="one-time-file-notice">
                <div class="notice-box warning">
                    <span class="notice-icon">🔥</span>
                    <span class="notice-text">
                        <strong>Self-Destruct File:</strong> This file will be permanently deleted after download. 
                        Make sure to save it to your device before the download completes.
                    </span>
                </div>
            </div>
            <div class="content-info">
                <p>📅 Retrieved: <span id="file-created-time"></span></p>
                <p>⏰ Expires: <span id="file-expires-time"></span></p>
            </div>
        `;
        
        // Set text content safely
        const filenameElement = document.getElementById('download-filename');
        const filesizeElement = document.getElementById('download-filesize');
        

        if (filenameElement) {
            filenameElement.textContent = 'Encrypted File';
        }

        if (filesizeElement) {
            filesizeElement.textContent = 'File size available after decryption';
        }
        
        // Show one-time notice if applicable
        const oneTimeFileNotice = document.getElementById('one-time-file-notice');
        if (data.oneTime && oneTimeFileNotice) {
            oneTimeFileNotice.classList.remove('hidden');
        } else if (oneTimeFileNotice) {
            oneTimeFileNotice.classList.add('hidden');
        }
        
        // Store data for the delegated download handler
        this._pendingFileDownload = { filename: data.filename };
        
        // Set time stamps
        const fileCreatedTime = document.getElementById('file-created-time');
        const fileExpiresTime = document.getElementById('file-expires-time');
        
        if (fileCreatedTime) {
            fileCreatedTime.textContent = new Date().toLocaleString();
        }
        
        if (fileExpiresTime && data.expiresAt) {
            try {
                const expiresAtNumber = typeof data.expiresAt === 'string' ? parseInt(data.expiresAt, 10) : data.expiresAt;
                const expiryDate = new Date(expiresAtNumber);
                
                if (!isNaN(expiryDate.getTime())) {
                    const timeRemaining = this.formatTimeRemaining(expiryDate.getTime());
                    const formattedDate = expiryDate.toLocaleString();
                    fileExpiresTime.textContent = `${formattedDate} (${timeRemaining} remaining)`;
                } else {
                    fileExpiresTime.textContent = 'Invalid date';
                }
            } catch (error) {
                fileExpiresTime.textContent = 'Error formatting date';
            }
        } else if (fileExpiresTime) {
            fileExpiresTime.textContent = 'Not available';
        }
        
        // Show the content result
        contentResult.classList.remove('hidden');
        contentResult.style.display = 'block';
    }

    // Format file size for display
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1000;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Download file functionality
    async downloadFile(clipId, filename) {
        try {

            // Extract URL secret from current URL or manual input (Quick Share)
            let urlSecret = this.extractUrlSecret();
            const password = this.getPasswordFromUser();

            // For Quick Share, also check manual secret input
            if (!urlSecret && clipId.length === CLIP_CONFIG.QUICK_SHARE_ID_LENGTH) {
                const secretInput = document.getElementById('quick-share-secret-input');
                if (secretInput && secretInput.value.trim()) {
                    urlSecret = secretInput.value.trim().toUpperCase();
                }
            }

            // NEW: Zero-Knowledge Access Code System - no download tokens needed
            const requestBody = {};
            
            if (clipId.length === CLIP_CONFIG.NORMAL_ID_LENGTH && password) {
                // Normal clip with password: Use access code for authentication
                requestBody.accessCode = password; // Send password for access control
            } else if (clipId.length === CLIP_CONFIG.NORMAL_ID_LENGTH) {
                // Normal clip without password: No authentication needed (URL secret is client-side)
            } else {
                // Quick Share (6-digit): No authentication needed
            }
            
            // Start download with authentication
            const response = await fetch(`/api/file/${clipId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });
            
            
            if (!response.ok) {
                const error = await response.json();
                console.error('❌ Download API error:', error);
                if (response.status === 401 || response.status === 403) {
                    throw new Error('❌ Access denied: Wrong password or URL secret');
                }
                throw new Error(error.message || 'Download failed');
            }

            // Get file data as array buffer
            const encryptedData = await response.arrayBuffer();
            const encryptedBytes = new Uint8Array(encryptedData);
            
            
            let decryptedData;
            
            // Try to decrypt if we have encryption keys
            if (urlSecret) {
                try {
                    // Access Code System: File decryption uses only URL-Secret, not password
                    const decryptResult = await this.decryptFileWithMetadata(encryptedBytes, null, urlSecret);
                    
                    // Check if we have metadata from decryption
                    if (decryptResult.metadata) {
                        // Update the download card with real file info
                        const filenameEl = document.getElementById('download-filename');
                        const filesizeEl = document.getElementById('download-filesize');
                        if (filenameEl) filenameEl.textContent = decryptResult.metadata.filename || filename;
                        if (filesizeEl) filesizeEl.textContent = this.formatFileSize(decryptResult.metadata.size || decryptResult.data.length);

                        // Use original filename and mime type from metadata
                        const originalFilename = decryptResult.metadata.filename || filename;
                        const originalMimeType = decryptResult.metadata.mimeType || 'application/octet-stream';

                        // Create blob with correct mime type
                        const blob = new Blob([decryptResult.data], { type: originalMimeType });
                        
                        // Create download link with original filename
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = originalFilename;
                        
                        
                        // Trigger download
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        
                        // Clean up
                        window.URL.revokeObjectURL(url);
                        
                        this.showToast('✅ File downloaded successfully!', 'success');
                        return; // Exit early since we handled the download
                    } else {
                        decryptedData = decryptResult.data; // Use decrypted file data
                    }
                } catch (decryptError) {
                    console.warn('⚠️ Decryption failed, downloading as-is:', decryptError.message);
                    decryptedData = encryptedBytes;
                }
            } else {
                // No encryption keys, download as-is
                decryptedData = encryptedBytes;
            }
            
            // Create blob from decrypted data (fallback if no metadata)
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
            
            this.showToast('✅ File downloaded successfully!', 'success');
            
        } catch (error) {
            console.error('❌ Download failed:', error);
            throw error;
        }
    }

    // Extract URL secret from current URL fragment
    extractUrlSecret() {
        const hash = window.location.hash;
        if (hash && hash.length > 1) {
            const secret = hash.substring(1); // Remove the # symbol
            return secret;
        }
        return null;
    }

    // Get password from user input (if available)
    getPasswordFromUser() {
        // Use the regular password input (for both text and file content)
        const passwordInput = document.getElementById('retrieve-password-input');
        if (passwordInput && passwordInput.value.trim()) {
            return passwordInput.value.trim();
        }
        
        return null;
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
                iterations: CLIP_CONFIG.PBKDF2_ITERATIONS_V3,
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

    // Get access code from user input (alias for getPasswordFromUser)
    getAccessCodeFromUser() {
        return this.getPasswordFromUser();
    }

    // Decrypt file using same algorithm as chunks (for TEXT content - simple IV + data structure)
    async decryptFile(encryptedBytes, password = null, urlSecret = null) {
        if (!password && !urlSecret) {
            console.error('❌ No decryption keys available for file decryption');
            throw new Error('No decryption keys available. This might be a Quick Share that requires a server secret.');
        }

        try {
            if (encryptedBytes.length < 12) {
                throw new Error('File too small to be encrypted');
            }

            const V3_HEADER = 1 + CLIP_CONFIG.SALT_LENGTH_V3 + CLIP_CONFIG.AES_IV_LENGTH;
            let iv, encryptedData, key;

            if (encryptedBytes[0] === CLIP_CONFIG.FORMAT_VERSION_V3 && encryptedBytes.length >= V3_HEADER + 16) {
                // V3 format: [version:1][salt:32][IV:12][ciphertext]
                const salt = encryptedBytes.slice(1, 1 + CLIP_CONFIG.SALT_LENGTH_V3);
                iv = encryptedBytes.slice(1 + CLIP_CONFIG.SALT_LENGTH_V3, V3_HEADER);
                encryptedData = encryptedBytes.slice(V3_HEADER);
                key = await this.generateKeyV3(password, urlSecret, salt);
            } else {
                throw new Error('Unsupported encryption format (legacy V1/V2 no longer supported)');
            }

            const decryptedData = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedData
            );

            return new Uint8Array(decryptedData);

        } catch (error) {
            console.error('❌ Decryption error:', error);
            if (error.message.includes('decrypt')) {
                throw new Error('Decryption failed: Invalid decryption key or corrupted data');
            }
            throw new Error('Decryption failed: ' + error.message);
        }
    }

    // Decrypt file with metadata support (for FILE content - metadata header + IV + data structure)
    async decryptFileWithMetadata(encryptedBytes, password = null, urlSecret = null) {
        if (!password && !urlSecret) {
            console.error('❌ No decryption keys available for file decryption');
            throw new Error('No decryption keys available. This might be a Quick Share that requires a server secret.');
        }

        try {
            if (encryptedBytes.length < 12) {
                throw new Error('File too small to contain IV');
            }

            const V3_HEADER = 1 + CLIP_CONFIG.SALT_LENGTH_V3 + CLIP_CONFIG.AES_IV_LENGTH;
            let iv, encryptedData, key;

            if (encryptedBytes[0] === CLIP_CONFIG.FORMAT_VERSION_V3 && encryptedBytes.length >= V3_HEADER + 16) {
                // V3 format: [version:1][salt:32][IV:12][ciphertext]
                const salt = encryptedBytes.slice(1, 1 + CLIP_CONFIG.SALT_LENGTH_V3);
                iv = encryptedBytes.slice(1 + CLIP_CONFIG.SALT_LENGTH_V3, V3_HEADER);
                encryptedData = encryptedBytes.slice(V3_HEADER);
                key = await this.generateKeyV3(password, urlSecret, salt);
            } else {
                throw new Error('Unsupported encryption format (legacy V1/V2 no longer supported)');
            }

            const decryptedData = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedData
            );

            const decryptedBytes = new Uint8Array(decryptedData);
            
            // Now parse metadata from decrypted data: [metadata_length][encrypted_metadata][file_data]
            if (decryptedBytes.length < 4) {
                return {
                    data: decryptedBytes,
                    metadata: null
                };
            }

            
            // Read metadata length (4 bytes, little-endian)
            const metadataLength = new DataView(decryptedBytes.buffer.slice(0, 4)).getUint32(0, true);

            // Sanity checks for metadata
            if (metadataLength > 0 && metadataLength <= 1024 && (4 + metadataLength) < decryptedBytes.length) {
                
                // Extract encrypted metadata and file data
                const encryptedMetadata = decryptedBytes.slice(4, 4 + metadataLength);
                const fileData = decryptedBytes.slice(4 + metadataLength);

                // Decrypt metadata (V3 only)
                try {
                    let metadataKey, metadataIV, metadataCiphertext;
                    if (encryptedMetadata[0] === CLIP_CONFIG.FORMAT_VERSION_V3 && encryptedMetadata.length >= 45 + 16) {
                        const metaSalt = encryptedMetadata.slice(1, 33);
                        metadataIV = encryptedMetadata.slice(33, 45);
                        metadataCiphertext = encryptedMetadata.slice(45);
                        metadataKey = await this.generateKeyV3(null, urlSecret, metaSalt);
                    } else {
                        throw new Error('Unsupported encryption format (legacy V1/V2 no longer supported)');
                    }

                    const decryptedMetadataBuffer = await window.crypto.subtle.decrypt(
                        { name: 'AES-GCM', iv: metadataIV },
                        metadataKey,
                        metadataCiphertext
                    );
                    
                    const metadataJson = new TextDecoder().decode(decryptedMetadataBuffer);
                    const metadata = JSON.parse(metadataJson);
                    

                    return {
                        data: fileData,
                        metadata: metadata
                    };
                    
                } catch (metadataError) {
                    console.warn('⚠️ Failed to decrypt metadata from decrypted data, returning file data only:', metadataError.message);
                    return {
                        data: fileData,
                        metadata: null
                    };
                }
            }

            // No valid metadata structure found
            return {
                data: decryptedBytes,
                metadata: null
            };

        } catch (error) {
            throw new Error('Decryption failed: ' + error.message);
        }
    }

    // Extract metadata from file during download (compatible with upload system)
    async extractMetadata(fileWithMetadata, urlSecret) {
        try {
            if (fileWithMetadata.length < 4) {
                return { metadata: null, fileData: fileWithMetadata };
            }
            
            // Read metadata length (4 bytes, little-endian)
            const metadataLength = new DataView(fileWithMetadata.buffer.slice(0, 4)).getUint32(0, true);
            
            
            if (metadataLength > fileWithMetadata.length - 4 || metadataLength > 1024) { // Sanity check
                return { metadata: null, fileData: fileWithMetadata };
            }
            
            // Extract encrypted metadata
            const encryptedMetadata = fileWithMetadata.slice(4, 4 + metadataLength);
            const fileData = fileWithMetadata.slice(4 + metadataLength);

            // Detect V3 metadata format and decrypt accordingly
            let metadataKey, metadataIV, metadataCiphertext;
            if (encryptedMetadata[0] === CLIP_CONFIG.FORMAT_VERSION_V3 && encryptedMetadata.length >= 45 + 16) {
                // V3: [version:1][salt:32][IV:12][ciphertext]
                const metaSalt = encryptedMetadata.slice(1, 33);
                metadataIV = encryptedMetadata.slice(33, 45);
                metadataCiphertext = encryptedMetadata.slice(45);
                metadataKey = await this.generateKeyV3(null, urlSecret, metaSalt);
            } else {
                throw new Error('Unsupported encryption format (legacy V1/V2 no longer supported)');
            }

            const decryptedMetadataBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: metadataIV },
                metadataKey,
                metadataCiphertext
            );

            const metadataJson = new TextDecoder().decode(decryptedMetadataBuffer);
            const metadata = JSON.parse(metadataJson);
            
            return { metadata, fileData };
            
        } catch (error) {
            console.warn('⚠️ Failed to extract metadata (wrong key or corrupted):', error.message);
            return { metadata: null, fileData: fileWithMetadata };
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.clipboardApp = new ClipboardApp();
});

// Service Worker registration removed - not needed for current functionality 
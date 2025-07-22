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

// Qopy Application JavaScript
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

        document.getElementById('copy-content-button').addEventListener('click', () => {
            this.copyToClipboard(document.getElementById('retrieved-content').textContent, 'Content copied!');
        });

        // Modal controls
        document.getElementById('close-modal').addEventListener('click', this.closeModal.bind(this));
        document.getElementById('success-modal').addEventListener('click', (e) => {
            if (e.target.id === 'success-modal') this.closeModal();
        });

        // Toast close buttons
        document.querySelectorAll('.toast-close').forEach(button => {
            button.addEventListener('click', (e) => {
                e.target.closest('.toast').classList.add('hidden');
            });
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

        // FAQ Accordion
        document.querySelectorAll('.faq-question').forEach(button => {
            button.addEventListener('click', () => {
                this.toggleFAQ(button.dataset.faq);
            });
        });

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
            // Check for /clip/ABC1 pattern (4-char Quick Share ID)
            else if (path.startsWith('/clip/') && path.length === 10) {
                clipId = path.substring(6);
            }
            // Check for /file/ABC123 pattern (10-char file ID)
            else if (path.startsWith('/file/') && path.length === 16) {
                clipId = path.substring(6);
                // Mark this as a file request
                this.isFileRequest = true;
            }
            // Check for /file/ABC1 pattern (4-char file ID)
            else if (path.startsWith('/file/') && path.length === 10) {
                clipId = path.substring(6);
                // Mark this as a file request
                this.isFileRequest = true;
            }
            // Check for /ABC123 pattern (direct 10-char ID)
            else if (path.length === 11 && path.startsWith('/') && /^[A-Z0-9]{10}$/.test(path.substring(1))) {
                clipId = path.substring(1);
            }
            // Check for /ABC1 pattern (direct 4-char Quick Share ID)
            else if (path.length === 5 && path.startsWith('/') && /^[A-Z0-9]{4}$/.test(path.substring(1))) {
                clipId = path.substring(1);
            }
            
            if (clipId) {
                // Validate clip ID format
                if (/^[A-Z0-9]{4}$|^[A-Z0-9]{10}$/.test(clipId)) {
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
            if (!/^[A-Z0-9]{4}$|^[A-Z0-9]{10}$/.test(clipId)) {
                return;
            }

            this.showLoading('retrieve-loading');
            
            // Extract URL secret and password for potential authentication
            const urlSecret = this.extractUrlSecret();
            const password = this.getPasswordFromUser();
            
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
                const infoResponse = await fetch(`/api/clip/${clipId}/info`);
                const infoData = await infoResponse.json();
                
                if (!infoResponse.ok) {
                    // Clip not found or expired, don't try to decrypt
                    this.hideLoading('retrieve-loading');
                    return;
                }
                
                // Quick Share never has passwords, proceed with retrieval
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
                console.log('📁 File URL detected - checking credentials before API call:', clipId);
                
                if (!urlSecret) {
                    // No URL secret - this file URL is invalid
                    this.hideLoading('retrieve-loading');
                    this.showToast('🔐 Access denied: Invalid file URL (missing secret)', 'error');
                    return;
                }
                
                // First try with just URL secret (no password) - many files don't need passwords
                console.log('🔑 File URL with URL secret - trying authentication without password first');
                
                let downloadToken = await this.generateDownloadToken(clipId, null, urlSecret);
                let queryParams = `?downloadToken=${downloadToken}`;
                
                // Get clip info with URL secret only
                let infoResponse = await fetch(`/api/clip/${clipId}/info${queryParams}`);
                let infoData = await infoResponse.json();
                
                if (infoResponse.ok) {
                    // Success with URL secret only - no password needed
                    console.log('✅ File accessible with URL secret only - no password required');
                    
                    // Proceed with authenticated retrieval
                    const response = await fetch(`/api/clip/${clipId}${queryParams}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        await this.showRetrieveResult(data);
                    } else {
                        this.hideLoading('retrieve-loading');
                        this.showToast('❌ Failed to load file', 'error');
                    }
                    
                } else if ((infoResponse.status === 401 || infoResponse.status === 403) && !password) {
                    // Authentication failed with URL secret only - password required
                    console.log('🔑 File requires password - showing password field');
                    
                    this.hideLoading('retrieve-loading');
                    
                    const passwordSection = document.getElementById('password-section');
                    const passwordInput = document.getElementById('retrieve-password-input');
                    
                    if (passwordSection && passwordInput) {
                        passwordSection.classList.remove('hidden');
                        passwordInput.focus();
                    }
                    
                    this.showToast('🔐 This file requires a password. Please enter it below.', 'info');
                    return;
                    
                } else if ((infoResponse.status === 401 || infoResponse.status === 403) && password) {
                    // Authentication failed with URL secret only, but we have a password - try with both
                    console.log('🔑 URL secret failed, trying with password too');
                    
                    downloadToken = await this.generateDownloadToken(clipId, password, urlSecret);
                    queryParams = `?downloadToken=${downloadToken}`;
                    
                    // Retry with both URL secret and password
                    infoResponse = await fetch(`/api/clip/${clipId}/info${queryParams}`);
                    infoData = await infoResponse.json();
                    
                    if (infoResponse.ok) {
                        // Proceed with authenticated retrieval
                        const response = await fetch(`/api/clip/${clipId}${queryParams}`, {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                            }
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            await this.showRetrieveResult(data);
                        } else {
                            this.hideLoading('retrieve-loading');
                            this.showToast('🔐 Authentication failed - please check your credentials', 'error');
                        }
                    } else {
                        this.hideLoading('retrieve-loading');
                        this.showToast('🔐 Access denied: Wrong password or URL secret', 'error');
                    }
                    
                } else {
                    // Other error (file not found, expired, etc.)
                    this.hideLoading('retrieve-loading');
                    if (infoResponse.status === 404) {
                        this.showToast('❌ File not found or expired', 'error');
                    } else {
                        this.showToast('❌ Failed to access file', 'error');
                    }
                }
            } else {
                // Normal clip (10-digit): Try without token first, then with token if needed
                console.log('🔐 Normal clip auto-retrieve - trying without token first:', clipId);
                
                // First attempt: get clip info WITHOUT download token
                let infoResponse = await fetch(`/api/clip/${clipId}/info`);
                let infoData = await infoResponse.json();
                
                if (infoResponse.ok) {
                    // No authentication required - proceed normally
                    console.log('✅ No authentication required for clip:', clipId);
                    
                    // Check if clip has password
                    if (infoData.hasPassword) {
                        this.hideLoading('retrieve-loading');
                        
                        // Show password section and focus password input
                        const passwordSection = document.getElementById('password-section');
                        const passwordInput = document.getElementById('retrieve-password-input');
                        
                        if (passwordSection && passwordInput) {
                            passwordSection.classList.remove('hidden');
                            passwordInput.focus();
                        }
                        
                        console.log('🔑 Password-protected clip detected - showing password field');
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
                        await this.showRetrieveResult(data);
                    }
                    
                } else if (infoResponse.status === 401 || infoResponse.status === 403) {
                    // Authentication required (likely a file clip)
                    console.log('🔐 Authentication required for clip:', clipId, 'checking if password available');
                    
                    if (password && urlSecret) {
                        // We have both password and URL secret - generate token and try again
                        console.log('🔑 Password and URL secret available - generating token and retrying');
                        
                        const downloadToken = await this.generateDownloadToken(clipId, password, urlSecret);
                        const queryParams = `?downloadToken=${downloadToken}`;
                        
                        // Retry with authentication
                        infoResponse = await fetch(`/api/clip/${clipId}/info${queryParams}`);
                        infoData = await infoResponse.json();
                        
                        if (infoResponse.ok) {
                            // Proceed with authenticated retrieval
                            const response = await fetch(`/api/clip/${clipId}${queryParams}`, {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            });
                            
                            if (response.ok) {
                                const data = await response.json();
                                await this.showRetrieveResult(data);
                            } else {
                                console.error('❌ Authenticated retrieval failed:', response.status);
                                this.showToast('🔐 Authentication failed - please check your credentials', 'error');
                            }
                        } else {
                            console.error('❌ Authenticated info request failed:', infoResponse.status);
                            this.showToast('🔐 Access denied: Invalid credentials', 'error');
                        }
                        
                    } else {
                        // Missing password or URL secret - show password field
                        this.hideLoading('retrieve-loading');
                        
                        const passwordSection = document.getElementById('password-section');
                        const passwordInput = document.getElementById('retrieve-password-input');
                        
                        if (passwordSection && passwordInput) {
                            passwordSection.classList.remove('hidden');
                            passwordInput.focus();
                        }
                        
                        if (!password && urlSecret) {
                            console.log('🔑 URL secret found but password missing - showing password field');
                            this.showToast('🔐 This file requires a password. Please enter it below.', 'info');
                        } else if (!urlSecret) {
                            console.log('🔑 No URL secret found - this file requires both URL secret and password');
                            this.showToast('🔐 Access denied: Invalid URL or missing credentials', 'error');
                        } else {
                            console.log('🔑 Missing credentials - showing password field');
                            this.showToast('🔐 This file requires authentication. Please enter the password.', 'info');
                        }
                        
                        return;
                    }
                } else {
                    // Other error (clip not found, expired, etc.)
                    console.log('❌ Clip not found or expired:', clipId);
                    this.hideLoading('retrieve-loading');
                    return;
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
            
            // Ensure password field is visible in retrieve tab if URL secret is present
            if (tab === 'retrieve') {
                const urlSecret = this.extractUrlSecret();
                const passwordSection = document.getElementById('password-section');
                
                // Hide password section by default
                if (passwordSection) {
                    passwordSection.classList.add('hidden');
                }
                
                // Only show if URL secret is present (indicates password-protected clip)
                if (urlSecret) {
                    if (passwordSection) {
                        passwordSection.classList.remove('hidden');
                    }
                }
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
        const clipId = document.getElementById('clip-id-input').value.trim();
        const passwordSection = document.getElementById('password-section');
        const passwordInput = document.getElementById('retrieve-password-input');
        
        console.log('checkClipId called with clipId:', clipId, 'length:', clipId.length);
        
        // Always hide password section by default
        if (passwordSection) {
            passwordSection.classList.add('hidden');
            console.log('Hiding password section by default');
        }
        if (passwordInput) {
            passwordInput.value = '';
        }
        
        if (clipId.length === 4 || clipId.length === 10) {
            try {
                // Extract URL secret and password for potential authentication
                const urlSecret = this.extractUrlSecret();
                const password = this.getPasswordFromUser();
                
                // Generate download token only for normal clips (10-digit), not Quick Share (4-digit)
                let downloadToken = null;
                let queryParams = '';
                
                if (clipId.length === 10) {
                    // Normal clip: generate download token for file authentication
                    downloadToken = await this.generateDownloadToken(clipId, password, urlSecret);
                    queryParams = downloadToken ? `?downloadToken=${downloadToken}` : '';
                    console.log('🔐 Generated download token for normal clip checkClipId:', clipId, 'hasUrlSecret:', !!urlSecret, 'hasPassword:', !!password);
                } else {
                    // Quick Share (4-digit): no download token needed
                    console.log('⚡ Quick Share checkClipId - no download token needed:', clipId);
                }
                
                console.log('🔍 Fetching clip info for:', clipId);
                const response = await fetch(`/api/clip/${clipId}/info${queryParams}`);
                const data = await response.json();
                
                console.log('🔍 Clip info response:', data);
                
                if (response.ok) {
                    // Show password section ONLY for text content with passwords
                    // Files handle their own password logic in showRetrieveResult
                    if (data.hasPassword && data.contentType === 'text') {
                        console.log('🔑 Showing password section for text content with password');
                        if (passwordSection) {
                            passwordSection.classList.remove('hidden');
                        }
                        if (passwordInput) {
                            passwordInput.focus();
                        }
                    } else {
                        console.log('🔒 Not showing password section:', {
                            hasPassword: data.hasPassword,
                            contentType: data.contentType,
                            condition: data.hasPassword && data.contentType === 'text'
                        });
                    }
                    // For files, we'll handle password display in showRetrieveResult
                } else {
                    // For authentication errors, show specific message
                    if (response.status === 401 || response.status === 403) {
                        console.log('🔐 Authentication failed for clipId:', clipId);
                        // Don't show error toast here to avoid interrupting user input
                    } else {
                        console.log('❌ Clip not found or expired - password section stays hidden');
                    }
                    // Clip not found or expired - password section stays hidden
                }
            } catch (error) {
                console.error('❌ Error in checkClipId:', error);
                // On error, password section stays hidden
            }
        } else {
            console.log('🔒 Clip ID not complete - password section stays hidden');
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
            // Convert text to file-like object for multi-part upload
            const textBlob = new Blob([content], { type: 'text/plain; charset=utf-8' });
            const randomHash = this.generateRandomHash();
            const textFile = new File([textBlob], `${randomHash}.txt`, { type: 'text/plain; charset=utf-8' });
            
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
            let quickShareSecret = null;
            
            // Determine encryption method based on mode
            if (quickShare) {
                quickShareSecret = this.generateRandomSecret();
                urlSecret = null;
            } else if (!password) {
                urlSecret = this.generateUrlSecret();
            } else {
                urlSecret = this.generateUrlSecret();
            }

            console.log('[TextUpload] Initiating upload session:', {
                filename: file.name,
                filesize: file.size,
                expiration,
                oneTime,
                hasPassword: !!password, // This refers to user-entered password, not URL secret
                quickShare,
                contentType: 'text'
            });

            // Create upload session
            const sessionResponse = await fetch('/api/upload/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    filesize: file.size,
                    mimeType: file.type || 'text/plain',
                    expiration: expiration,
                    oneTime: oneTime,
                    hasPassword: !!password,
                    quickShare: quickShare,
                    contentType: 'text',
                    isTextContent: true
                })
            });

            const sessionData = await sessionResponse.json();
            console.log('[TextUpload] Session response:', sessionData);
            if (!sessionResponse.ok) {
                throw new Error(sessionData.message || 'Failed to create upload session');
            }

            const { uploadId, totalChunks } = sessionData;
            console.log(`[TextUpload] Starting text upload: ${totalChunks} chunks, ${file.size} bytes, uploadId=${uploadId}`);

            // Upload chunks
            const chunkSize = 5 * 1024 * 1024; // 5MB chunks
            let uploadedChunks = 0;

            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);
                console.log(`[TextUpload] Preparing chunk ${i} (bytes ${start}-${end})`);

                // Encrypt chunk based on mode
                let encryptedChunk;
                if (quickShare) {
                    encryptedChunk = await this.encryptFileChunk(chunk, null, quickShareSecret);
                } else if (!password) {
                    encryptedChunk = await this.encryptFileChunk(chunk, null, urlSecret);
                } else {
                    encryptedChunk = await this.encryptFileChunk(chunk, password, urlSecret);
                }
                console.log(`[TextUpload] Encrypted chunk ${i}, size: ${encryptedChunk.length}`);

                // Upload encrypted chunk
                const formData = new FormData();
                formData.append('chunk', new Blob([encryptedChunk]));
                formData.append('chunkNumber', i);

                console.log(`[TextUpload] Uploading chunk ${i} to /api/upload/chunk/${uploadId}/${i}`);
                const chunkResponse = await fetch(`/api/upload/chunk/${uploadId}/${i}`, {
                    method: 'POST',
                    body: formData
                });
                console.log(`[TextUpload] Chunk ${i} upload response status:`, chunkResponse.status);

                if (!chunkResponse.ok) {
                    let errorData = {};
                    try { errorData = await chunkResponse.json(); } catch (e) {}
                    console.error(`[TextUpload] Chunk ${i} upload failed:`, errorData);
                    throw new Error(errorData.message || `Failed to upload chunk ${i}`);
                }

                uploadedChunks++;
                console.log(`[TextUpload] Uploaded chunk ${uploadedChunks}/${totalChunks}`);
            }

            // Complete upload
            console.log(`[TextUpload] Completing upload for uploadId=${uploadId}`);
            const completePayload = {
                quickShareSecret: quickShareSecret
            };
            
            // Add authentication parameters for normal clips (server will generate token)
            if (!quickShare && (password || urlSecret)) {
                completePayload.password = password;
                completePayload.urlSecret = urlSecret;
                console.log('🔐 Sending authentication parameters for token generation');
            }
            
            const completeResponse = await fetch(`/api/upload/complete/${uploadId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(completePayload)
            });

            const completeData = await completeResponse.json();
            console.log('[TextUpload] Complete response:', completeData);
            if (!completeResponse.ok) {
                throw new Error(completeData.message || 'Failed to complete upload');
            }

            // Add URL secret to share URL for normal clips
            const shareUrl = (!quickShare) ? `${completeData.url}#${urlSecret}` : completeData.url;
            completeData.url = shareUrl;
            
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

    // Encrypt binary data (for file chunks)
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
            
            const key = await this.generateKey(password, urlSecret);
            
            // Generate IV: deterministic for all clips using URL secret
            let iv;
            if (password) {
                iv = await this.deriveIV(password, urlSecret);
            } else {
                // For non-password clips, derive IV from URL secret
                iv = await this.deriveIV(urlSecret, null, 'qopy-iv-salt-v1');
            }
            
            // Encrypt the data
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );
            
            // Direct byte concatenation: IV + encrypted data (no key storage needed)
            const encryptedBytes = new Uint8Array(encryptedData);
            const ivBytes = new Uint8Array(iv);
            
            // All clips: IV + encrypted data (key derived from URL secret/password)
            const combined = new Uint8Array(ivBytes.length + encryptedBytes.length);
            combined.set(ivBytes, 0);
            combined.set(encryptedBytes, ivBytes.length);
            
            // Return raw bytes
            return combined;
        } catch (error) {
            throw new Error('Failed to encrypt binary data');
        }
    }

    // Generate URL secret for enhanced security
    generateUrlSecret() {
        // Generate a random 16-character secret for URL fragment
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 16; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Generate random secret for Quick Share encryption
    generateRandomSecret() {
        // Generate a cryptographically secure random secret (128 bits = 32 hex chars)
        const array = new Uint8Array(16); // 128 bits
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Generate random hash for filenames
    generateRandomHash() {
        // Generate a random 16-character hash for filenames
        const array = new Uint8Array(8); // 64 bits
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Hash a secret for use in encryption
    async hashSecret(secret) {
        const encoder = new TextEncoder();
        const data = encoder.encode(secret);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Generate clip ID (4 characters for Quick Share, 10 for normal)
    generateClipId(quickShare = false) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const length = quickShare ? 4 : 10;
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Derive Quick Share secret from clip ID
    async deriveQuickShareSecret(clipId) {
        const encoder = new TextEncoder();
        const data = encoder.encode(`quick-share-${clipId}-secret`);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Retrieve Content
    async retrieveContent() {
        const clipId = document.getElementById('clip-id-input').value.trim();
        const password = document.getElementById('retrieve-password-input').value.trim();

        console.log('🔍 Starting retrieveContent with:', { clipId, hasPassword: !!password });

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

        if (clipId.length !== 4 && clipId.length !== 10) {
            this.showToast(`❌ Invalid clip ID length: ${clipId.length} characters (must be exactly 4 or 10)`, 'error');
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
        if (clipId.length === 10 && password) {
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
            console.log('🔗 URL secret extracted:', urlSecret ? 'present' : 'none');
            
            // Generate download token only for normal clips (10-digit), not Quick Share (4-digit)
            let downloadToken = null;
            let queryParams = '';
            
            if (clipId.length === 10) {
                // Normal clip: generate download token for file authentication
                downloadToken = await this.generateDownloadToken(clipId, password, urlSecret);
                queryParams = downloadToken ? `?downloadToken=${downloadToken}` : '';
                console.log('🔐 Generated download token for normal clip retrieveContent:', clipId, 'hasUrlSecret:', !!urlSecret, 'hasPassword:', !!password);
            } else {
                // Quick Share (4-digit): no download token needed
                console.log('⚡ Quick Share retrieveContent - no download token needed:', clipId);
            }
            
            // Always use GET - no password needed for server authentication
            // Content is already encrypted client-side
            console.log('📡 Making API request to:', `/api/clip/${clipId}${queryParams}`);
            const response = await fetch(`/api/clip/${clipId}${queryParams}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            console.log('📡 API response status:', response.status);
            const data = await response.json();
            console.log('📡 API response data:', {
                contentType: data.contentType,
                hasContent: !!data.content,
                hasFile: !!data.file_path,
                hasRedirectTo: !!data.redirectTo,
                expiresAt: data.expiresAt,
                oneTime: data.oneTime,
                quickShareSecret: data.quickShareSecret,
                keys: Object.keys(data)
            });
            console.log('📡 Full API response:', data);

            if (response.ok) {
                // Check if this is a text file stored as file (needs redirect to showRetrieveResult)
                if (data.contentType === 'text' && data.redirectTo) {
                    console.log('📝 Detected text content stored as file, calling showRetrieveResult directly');
                    await this.showRetrieveResult(data);
                    return;
                }

                // Check if this is a file first
                if (data.contentType === 'file' && data.redirectTo) {
                    console.log('📁 Detected file content, calling handleFileDownload directly');
                    this.handleFileDownload(data);
                    return;
                }

                // Check if this is a file by checking for file_path
                if (data.file_path) {
                    console.log('📁 Detected file by file_path, calling handleFileDownload directly');
                    this.handleFileDownload(data);
                    return;
                }

                // Decrypt the content before showing (only for text content)
                try {
                    let decryptedContent;
                    
                    // Check if this is a Quick Share (4-digit ID) or normal clip
                    if (clipId.length === 4) {
                        console.log('🔐 Processing Quick Share clip');
                        // Quick Share: Use the secret from server response
                        const quickShareSecret = data.quickShareSecret || data.password_hash;
                        if (!quickShareSecret) {
                            throw new Error('Quick Share secret not found');
                        }
                        decryptedContent = await this.decryptContent(data.content, null, quickShareSecret);
                    } else {
                        console.log('🔐 Processing normal clip');
                        // Normal mode: Decrypt the content
                        decryptedContent = await this.decryptContent(data.content, password, urlSecret);
                    }
                    
                    // Create a new data object with decrypted content but preserve other properties
                    const resultData = {
                        ...data,
                        content: decryptedContent
                    };
                    console.log('✅ Decryption successful, calling showRetrieveResult with:', {
                        contentType: resultData.contentType,
                        hasContent: !!resultData.content,
                        hasFile: !!resultData.file_path,
                        hasRedirectTo: !!resultData.redirectTo
                    });
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
                
                // Handle file authentication errors specifically
                if (data.requiresAuth) {
                    if (response.status === 401) {
                        throw new Error('🔐 This file requires authentication. Please check your URL for the secret or enter the correct password.');
                    } else if (response.status === 403) {
                        throw new Error('🔐 Access denied. Please check your URL secret or password for this file.');
                    }
                }
                
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
        
        // Generate QR code client-side
        this.generateQRCode(data.url);
        
        // Format expiration time properly (handle both string and number timestamps)
        try {
            const expiresAt = data.expiresAt;
            if (expiresAt) {
                const expiresAtNumber = typeof expiresAt === 'string' ? parseInt(expiresAt, 10) : expiresAt;
                const expiryDate = new Date(expiresAtNumber);
                
                if (!isNaN(expiryDate.getTime())) {
                    document.getElementById('expiry-time').textContent = expiryDate.toLocaleString();
                } else {
                    document.getElementById('expiry-time').textContent = 'Invalid date';
                }
            } else {
                document.getElementById('expiry-time').textContent = 'Not available';
            }
        } catch (error) {
            console.error('Error formatting expiry date:', error);
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
        console.log('🎯 showRetrieveResult called with data:', {
            contentType: data.contentType,
            hasContent: !!data.content,
            hasFile: !!data.file_path,
            hasRedirectTo: !!data.redirectTo,
            keys: Object.keys(data)
        });

        // Check if this is a text file stored as file (needs programmatic download + decryption)
        if (data.contentType === 'text' && data.redirectTo && data.isTextFile) {
            console.log('📝 Detected text content stored as file, downloading and decrypting...');
            await this.handleTextFileDownload(data);
            return;
        }

        // Check if this is a file redirect (for files stored on disk)
        if (data.contentType === 'file' && data.redirectTo) {
            console.log('📁 Detected file content with redirect, calling handleFileDownload');
            // Check if this file needs password
            this.checkFilePasswordRequirement(data);
            // Immediately hide all text elements before calling handleFileDownload
            this.hideAllTextElements();
            this.handleFileDownload(data);
            return;
        }

        // Check if this is a file by checking for file_path
        if (data.file_path) {
            console.log('📁 Detected file by file_path, calling handleFileDownload');
            // Check if this file needs password
            this.checkFilePasswordRequirement(data);
            // Immediately hide all text elements before calling handleFileDownload
            this.hideAllTextElements();
            this.handleFileDownload(data);
            return;
        }

        // Check if this is a file by checking for filename and filesize (for multi-part uploads)
        // BUT: If contentType is 'text', treat it as text content even if it has filename/filesize
        if (data.filename && data.filesize && data.contentType !== 'text') {
            console.log('📁 Detected file by filename/filesize, calling handleFileDownload');
            // Check if this file needs password
            this.checkFilePasswordRequirement(data);
            // Immediately hide all text elements before calling handleFileDownload
            this.hideAllTextElements();
            this.handleFileDownload(data);
            return;
        }

        // Special handling for text content that was uploaded as a file (e.g., .txt files)
        // If contentType is 'text' but we have filename/filesize, treat it as text content
        if (data.contentType === 'text' && data.filename && data.filesize) {
            console.log('📝 Detected text content uploaded as file, processing as text');
            // This is text content that was uploaded as a file (like .txt files)
            // We should decrypt and display it as text, not download it
        }

        console.log('📝 Processing as text content');

        // Handle content based on type
        if (data.contentType === 'text' && typeof data.content === 'string') {
            // Unencrypted text content
            document.getElementById('retrieved-content').textContent = data.content;
        } else if (Array.isArray(data.content)) {
            // Binary content - could be encrypted text or binary data
            try {
                // Try to decrypt as text first
                const urlSecret = this.extractUrlSecret();
                const password = this.getPasswordFromUser();
                
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
                console.error('❌ Decryption failed:', error);
                document.getElementById('retrieved-content').textContent = '[Encrypted content - decryption failed]';
            }
        } else {
            // Fallback
            document.getElementById('retrieved-content').textContent = data.content || '[No content]';
        }
        
        // Use current time as created time since API doesn't provide it
        document.getElementById('created-time').textContent = new Date().toLocaleString();
        
        // Format expiration time with better error handling
        try {
            const expiresAt = data.expiresAt;
            
            if (expiresAt) {
                // Convert to number if it's a string
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
        
        const oneTimeNotice = document.getElementById('one-time-notice');
        if (data.oneTime) {
            oneTimeNotice.classList.remove('hidden');
        } else {
            oneTimeNotice.classList.add('hidden');
        }
        
        // Show text-related elements
        this.showTextElements();
        
        document.getElementById('content-result').classList.remove('hidden');
        document.getElementById('content-result').style.display = 'block';
        
        // Scroll to result
        document.getElementById('content-result').scrollIntoView({ behavior: 'smooth' });
    }

    // Handle text file download and decryption
    async handleTextFileDownload(data) {
        try {
            console.log('📥 Starting programmatic text file download from:', data.redirectTo);
            
            // Extract decryption keys based on clip type
            let urlSecret = null;
            let password = null;
            
            if (data.quickShareSecret) {
                // Quick Share mode - use the secret from server response
                urlSecret = data.quickShareSecret;
                password = null;
                console.log('🔑 Using Quick Share secret for decryption');
            } else {
                // Normal mode - extract from URL and user input
                urlSecret = this.extractUrlSecret();
                password = this.getPasswordFromUser();
                console.log('🔑 Using URL secret and password for decryption');
            }

            // Download the encrypted file using new authenticated method
            console.log('📥 Downloading encrypted file using authenticated method');
            
            // Extract clipId from redirectTo URL (e.g., "/api/file/H6LEGF78SB" -> "H6LEGF78SB")
            const clipId = data.redirectTo.split('/').pop();
            console.log('🔍 Extracted clipId from redirectTo:', clipId);
            
            // Generate download token for authentication
            const downloadToken = await this.generateDownloadToken(clipId, password, urlSecret);
            console.log('🔐 Generated download token for text file download');
            
            // Make authenticated POST request
            const response = await fetch(data.redirectTo, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    downloadToken: downloadToken
                })
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
            
            console.log(`📥 Downloaded encrypted text file: ${encryptedBytes.length} bytes`);

            // Decrypt the content using the same method as file downloads
            const decryptedBytes = await this.decryptFile(encryptedBytes, password, urlSecret);
            const decoder = new TextDecoder();
            const decryptedText = decoder.decode(decryptedBytes);
            
            console.log('✅ Text file decrypted successfully');

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
        const passwordSection = document.getElementById('password-section');
        const passwordInput = document.getElementById('retrieve-password-input');
        
        // Check if we have URL secret (indicates encryption)
        const urlSecret = this.extractUrlSecret();
        
        // For files, show password section only if:
        // 1. We have a URL secret (indicating encryption) AND
        // 2. The file has a password hash (indicating it was password-protected)
        if (urlSecret && data.hasPassword) {
            // URL secret exists AND file has password, show password input
            if (passwordSection) {
                passwordSection.classList.remove('hidden');
            }
            if (passwordInput) {
                passwordInput.focus();
            }
        } else {
            // No URL secret OR no password, hide password section
            if (passwordSection) {
                passwordSection.classList.add('hidden');
            }
        }
    }

    // Helper function to hide all text-related elements
    hideAllTextElements() {
        console.log('🗂️ Hiding all text-related elements');
        
        // Hide individual text-related elements
        const retrievedContent = document.getElementById('retrieved-content');
        const copyContentButton = document.getElementById('copy-content-button');
        const oneTimeNotice = document.getElementById('one-time-notice');
        const contentActions = document.querySelector('.content-actions');
        const contentDisplay = document.querySelector('.content-display');
        const contentInfo = document.querySelector('.content-info');
        const newPasteSection = document.querySelector('.new-paste-section');
        
        // Hide text content display
        if (retrievedContent) {
            retrievedContent.style.display = 'none';
        }
        
        // Hide copy content button
        if (copyContentButton) {
            copyContentButton.style.display = 'none';
        }
        
        // Hide content actions (contains copy button)
        if (contentActions) {
            contentActions.style.display = 'none';
        }
        
        // Hide content display container
        if (contentDisplay) {
            contentDisplay.style.display = 'none';
        }
        
        // Hide content info (Created/Expires times)
        if (contentInfo) {
            contentInfo.style.display = 'none';
        }
        
        // Hide new paste section
        if (newPasteSection) {
            newPasteSection.style.display = 'none';
        }
        
        // Hide one-time notice
        if (oneTimeNotice) {
            oneTimeNotice.style.display = 'none';
        }

        // Note: Password section visibility is handled by checkClipId function
        // which shows it only for text content with passwords, not for files
    }

    // Helper function to show all text-related elements
    showTextElements() {
        console.log('📝 Showing all text-related elements');
        
        // Show individual text-related elements
        const retrievedContent = document.getElementById('retrieved-content');
        const copyContentButton = document.getElementById('copy-content-button');
        const oneTimeNotice = document.getElementById('one-time-notice');
        const contentActions = document.querySelector('.content-actions');
        const contentDisplay = document.querySelector('.content-display');
        const contentInfo = document.querySelector('.content-info');
        const newPasteSection = document.querySelector('.new-paste-section');
        
        // Show text content display
        if (retrievedContent) {
            retrievedContent.style.display = 'block';
        }
        
        // Show copy content button
        if (copyContentButton) {
            copyContentButton.style.display = 'block';
        }
        
        // Show content actions (contains copy button)
        if (contentActions) {
            contentActions.style.display = 'flex';
        }
        
        // Show content display container
        if (contentDisplay) {
            contentDisplay.style.display = 'block';
        }
        
        // Show content info (Created/Expires times)
        if (contentInfo) {
            contentInfo.style.display = 'block';
        }
        
        // Show new paste section
        if (newPasteSection) {
            newPasteSection.style.display = 'block';
        }
        
        // Show one-time notice (will be controlled by data.oneTime)
        if (oneTimeNotice) {
            oneTimeNotice.style.display = 'block';
        }
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

    // Initialize toast close buttons
    initializeToastCloseButtons() {
        document.querySelectorAll('.toast-close').forEach(button => {
            button.addEventListener('click', (e) => {
                const toast = e.target.closest('#error-toast, #info-toast, #success-toast');
                if (toast) {
                    toast.classList.add('hidden');
                }
            });
        });
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

    // Enhanced key derivation with URL secret + password
    async generateKey(password = null, urlSecret = null) {
        // Input validation
        if (password !== null && (typeof password !== 'string' || password.length === 0)) {
            throw new Error('Password must be a non-empty string or null');
        }
        
        if (urlSecret !== null && (typeof urlSecret !== 'string' || urlSecret.length === 0)) {
            throw new Error('URL secret must be a non-empty string or null');
        }
        
        // Check if Web Crypto API is available
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Web Crypto API not available. Please use HTTPS.');
        }
        
        if (password) {
            // Combine URL secret with password for enhanced security
            let combinedSecret = password;
            if (urlSecret) {
                combinedSecret = urlSecret + ':' + password;
            }
            
            // Derive key from combined secret using PBKDF2
            const encoder = new TextEncoder();
            const salt = encoder.encode('qopy-salt-v1');
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(combinedSecret),
                { name: 'PBKDF2' },
                false,
                ['deriveBits', 'deriveKey']
            );
            return await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
        } else {
            // For non-password clips, derive key from URL secret for enhanced security
            if (!urlSecret) {
                throw new Error('URL secret is required for non-password clips');
            }
            
            // Derive key from URL secret using PBKDF2
            const encoder = new TextEncoder();
            const salt = encoder.encode('qopy-salt-v1');
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(urlSecret),
                { name: 'PBKDF2' },
                false,
                ['deriveBits', 'deriveKey']
            );
            return await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
        }
    }

    // Enhanced IV derivation with URL secret + password or URL secret only
    async deriveIV(primarySecret, secondarySecret = null, salt = 'qopy-iv-salt-v1') {
        // Input validation
        if (typeof primarySecret !== 'string' || primarySecret.length === 0) {
            throw new Error('Primary secret must be a non-empty string');
        }
        
        if (secondarySecret !== null && (typeof secondarySecret !== 'string' || secondarySecret.length === 0)) {
            throw new Error('Secondary secret must be a non-empty string or null');
        }
        
        if (typeof salt !== 'string' || salt.length === 0) {
            throw new Error('Salt must be a non-empty string');
        }
        
        // Combine secrets for enhanced security
        let combinedSecret = primarySecret;
        if (secondarySecret) {
            combinedSecret = secondarySecret + ':' + primarySecret;
        }
        
        const encoder = new TextEncoder();
        const saltBytes = encoder.encode(salt);
        const secretBytes = encoder.encode(combinedSecret);
        
        // Use PBKDF2 to derive IV bytes
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            secretBytes,
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );
        
        const ivBytes = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: 50000, // Lower iterations for IV derivation
                hash: 'SHA-256'
            },
            keyMaterial,
            96 // 12 bytes = 96 bits for AES-GCM IV
        );
        
        return new Uint8Array(ivBytes);
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
            
            const key = await this.generateKey(password, urlSecret);
            const encoder = new TextEncoder();
            const data = encoder.encode(content);
            
            // Generate IV: deterministic for all clips using URL secret
            let iv;
            if (password) {
                iv = await this.deriveIV(password, urlSecret);
            } else {
                // For non-password clips, derive IV from URL secret
                iv = await this.deriveIV(urlSecret, null, 'qopy-iv-salt-v1');
            }
            
            // Encrypt the content
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );
            
            // Direct byte concatenation: IV + encrypted data (no key storage needed)
            const encryptedBytes = new Uint8Array(encryptedData);
            const ivBytes = new Uint8Array(iv);
            
            // All clips: IV + encrypted data (key derived from URL secret/password)
            const combined = new Uint8Array(ivBytes.length + encryptedBytes.length);
            combined.set(ivBytes, 0);
            combined.set(encryptedBytes, ivBytes.length);
            
            // Return raw bytes instead of base64
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
                // New format: raw bytes
                bytes = encryptedContent;
            } else if (Array.isArray(encryptedContent)) {
                // Array format from server
                bytes = new Uint8Array(encryptedContent);
            } else if (typeof encryptedContent === 'string') {
                // Old format: base64 string
                const decoded = atob(encryptedContent);
                bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) {
                    bytes[i] = decoded.charCodeAt(i);
                }
            } else {
                throw new Error('Invalid encrypted content format');
            }
            
            // Extract IV (first 12 bytes)
            if (bytes.length < 12) {
                throw new Error('Invalid encrypted data: too short');
            }
            const iv = bytes.slice(0, 12);
            const encryptedData = bytes.slice(12);
            
            let key;
            if (password) {
                // Password-protected: derive key from password + URL secret
                key = await this.generateKey(password, urlSecret);
                
                // Decrypt password-protected content
                const decryptedData = await window.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    encryptedData
                );
                
                const decoder = new TextDecoder();
                return decoder.decode(decryptedData);
            } else {
                // Non-password: derive key from URL secret
                if (!urlSecret) {
                    throw new Error('URL secret is required for non-password clips');
                }
                
                key = await this.generateKey(null, urlSecret);
                
                // Decrypt the content
                const decryptedData = await window.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    key,
                    encryptedData
                );
                
                const decoder = new TextDecoder();
                return decoder.decode(decryptedData);
            }
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
        const passwordSection = document.getElementById('password-section');
        if (passwordSection) {
            passwordSection.classList.add('hidden');
        }
    }

    // Handle File Download
    async handleFileDownload(data) {
        console.log('🗂️ handleFileDownload called with data:', {
            filename: data.filename,
            filesize: data.filesize,
            file_path: data.file_path,
            redirectTo: data.redirectTo,
            contentType: data.contentType,
            keys: Object.keys(data)
        });
        
        // Hide all text-related elements first
        this.hideAllTextElements();
        
        // Create file download UI
        const contentResult = document.getElementById('content-result');
        
        console.log('🗂️ Setting up file download UI');
        
        // Create file download section if it doesn't exist
        let fileSection = document.getElementById('file-download-section');
        if (!fileSection) {
            console.log('🗂️ Creating new file download section');
            fileSection = document.createElement('div');
            fileSection.id = 'file-download-section';
            fileSection.className = 'file-download-section';
            contentResult.appendChild(fileSection);
        } else {
            console.log('🗂️ Using existing file download section');
        }
        
        // Create modern file download UI
        fileSection.innerHTML = `
            <div class="result-header">
                <label class="label">📄 File Ready for Download</label>
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
        
        const filename = data.filename || 'Unknown File';
        const filesize = data.filesize || 0;
        
        console.log('🗂️ Setting file info:', { filename, filesize });
        
        if (filenameElement) {
            filenameElement.textContent = filename;
        }
        
        if (filesizeElement) {
            filesizeElement.textContent = this.formatFileSize(filesize);
        }
        
        // Show one-time notice if applicable
        const oneTimeFileNotice = document.getElementById('one-time-file-notice');
        if (data.oneTime && oneTimeFileNotice) {
            console.log('🔥 Showing one-time file warning for file download');
            oneTimeFileNotice.classList.remove('hidden');
        } else if (oneTimeFileNotice) {
            oneTimeFileNotice.classList.add('hidden');
        }
        
        // Add download event listener
        const downloadButton = document.getElementById('download-file-button');
        if (downloadButton) {
            console.log('🗂️ Adding download button event listener');
            downloadButton.addEventListener('click', async () => {
                try {
                    const clipId = document.getElementById('clip-id-input').value.trim();
                    console.log('🗂️ Download button clicked for clipId:', clipId);
                    await this.downloadFile(clipId, filename);
                } catch (error) {
                    console.error('❌ Download failed:', error);
                    this.showToast('❌ Download failed: ' + error.message, 'error');
                }
            });
        } else {
            console.error('❌ Download button not found!');
        }
        
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
        console.log('🗂️ File download UI setup complete');
    }

    // Format file size for display
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Download file functionality
    async downloadFile(clipId, filename) {
        try {
            console.log('📥 downloadFile called with:', { clipId, filename });
            
            // Extract URL secret from current URL
            const urlSecret = this.extractUrlSecret();
            const password = this.getPasswordFromUser();
            
            console.log('📥 Encryption keys:', { 
                hasUrlSecret: !!urlSecret, 
                hasPassword: !!password,
                urlSecret: urlSecret ? 'present' : 'none'
            });
            
            // Generate download token for authentication
            const downloadToken = await this.generateDownloadToken(clipId, password, urlSecret);
            console.log('🔐 Generated download token for authentication');
            
            // Start download with authentication
            console.log('📥 Making authenticated download request to:', `/api/file/${clipId}`);
            const response = await fetch(`/api/file/${clipId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    downloadToken: downloadToken
                })
            });
            
            console.log('📥 Download response status:', response.status);
            console.log('📥 Download response headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                const error = await response.json();
                console.error('❌ Download API error:', error);
                if (response.status === 401 || response.status === 403) {
                    throw new Error('❌ Access denied: Wrong password or URL secret');
                }
                throw new Error(error.message || 'Download failed');
            }

            // Get file data as array buffer
            console.log('📥 Reading response as array buffer');
            const encryptedData = await response.arrayBuffer();
            const encryptedBytes = new Uint8Array(encryptedData);
            
            console.log('📥 Received encrypted data size:', encryptedBytes.length, 'bytes');
            
            let decryptedData;
            
            // Try to decrypt if we have encryption keys
            if (password || urlSecret) {
                try {
                    console.log('📥 Attempting to decrypt file data');
                    decryptedData = await this.decryptFile(encryptedBytes, password, urlSecret);
                    console.log('🔓 File decrypted successfully, size:', decryptedData.length, 'bytes');
                } catch (decryptError) {
                    console.warn('⚠️ Decryption failed, downloading as-is:', decryptError.message);
                    decryptedData = encryptedBytes;
                }
            } else {
                // No encryption keys, download as-is
                console.log('📥 No encryption keys, downloading as-is');
                decryptedData = encryptedBytes;
            }
            
            // Create blob from decrypted data
            console.log('📥 Creating blob from data');
            const blob = new Blob([decryptedData]);
            console.log('📥 Blob created, size:', blob.size, 'bytes');
            
            // Create download link
            console.log('📥 Creating download link');
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || `qopy-file-${clipId}`;
            
            console.log('📥 Triggering download with filename:', a.download);
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Clean up
            window.URL.revokeObjectURL(url);
            
            console.log('✅ Download completed successfully');
            this.showToast('✅ File downloaded successfully!', 'success');
            
        } catch (error) {
            console.error('❌ Download failed:', error);
            throw error;
        }
    }

    // Generate download token for authentication
    async generateDownloadToken(clipId, password, urlSecret) {
        try {
            // Create a combined secret for token generation
            let tokenData = clipId; // Always include clip ID
            
            // Add URL secret if available
            if (urlSecret) {
                tokenData += ':' + urlSecret;
            }
            
            // Add password if available
            if (password) {
                tokenData += ':' + password;
            }
            
            // Generate SHA-256 hash of the combined data
            const encoder = new TextEncoder();
            const data = encoder.encode(tokenData);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = new Uint8Array(hashBuffer);
            
            // Convert to hex string
            const token = Array.from(hashArray)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            
            console.log('🔐 Download token generated from:', {
                clipId: clipId,
                hasUrlSecret: !!urlSecret,
                hasPassword: !!password,
                tokenLength: token.length
            });
            
            return token;
        } catch (error) {
            console.error('❌ Failed to generate download token:', error);
            throw new Error('Failed to generate authentication token');
        }
    }

    // Extract URL secret from current URL fragment
    extractUrlSecret() {
        const hash = window.location.hash;
        console.log('🔗 extractUrlSecret - current hash:', hash);
        if (hash && hash.length > 1) {
            const secret = hash.substring(1); // Remove the # symbol
            console.log('🔗 URL secret extracted:', secret ? 'present' : 'none');
            return secret;
        }
        console.log('🔗 No URL secret found');
        return null;
    }

    // Get password from user input (if available)
    getPasswordFromUser() {
        const passwordInput = document.getElementById('retrieve-password-input');
        if (passwordInput && passwordInput.value.trim()) {
            return passwordInput.value.trim();
        }
        return null;
    }

    // Decrypt file using same algorithm as chunks
    async decryptFile(encryptedBytes, password = null, urlSecret = null) {
        console.log('🔓 decryptFile called with:', {
            dataSize: encryptedBytes.length,
            hasPassword: !!password,
            hasUrlSecret: !!urlSecret
        });

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
            
            console.log('🔓 Extracted IV and encrypted data:', {
                ivLength: iv.length,
                encryptedDataLength: encryptedData.length
            });

            // Generate decryption key
            console.log('🔓 Generating decryption key');
            const key = await this.generateDecryptionKey(password, urlSecret);
            console.log('🔓 Decryption key generated successfully');

            // Decrypt the data
            console.log('🔓 Starting decryption with AES-GCM');
            const decryptedData = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedData
            );

            console.log('🔓 Decryption successful, result size:', decryptedData.byteLength);
            return new Uint8Array(decryptedData);

        } catch (error) {
            console.error('❌ Decryption error:', error);
            throw new Error('Decryption failed: ' + error.message);
        }
    }

    // Generate decryption key (same as upload)
    async generateDecryptionKey(password = null, urlSecret = null) {
        console.log('🔑 generateDecryptionKey called with:', {
            hasPassword: !!password,
            hasUrlSecret: !!urlSecret
        });

        const encoder = new TextEncoder();
        
        let keyMaterial;
        if (password && urlSecret) {
            // Password + URL secret mode
            console.log('🔑 Using password + URL secret mode');
            const combined = urlSecret + ':' + password;
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
        } else if (password) {
            // Password only mode (should not happen for files, but handle it)
            console.log('🔑 Using password only mode');
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
        
        console.log('🔑 Deriving key with PBKDF2');
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
        
        console.log('🔑 Key derivation successful');
        return derivedKey;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.clipboardApp = new ClipboardApp();
    // Initialize toast close buttons
    window.clipboardApp.initializeToastCloseButtons();
});

// Service Worker registration removed - not needed for current functionality 
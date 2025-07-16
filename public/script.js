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
            this.goToHome();
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
            
            // First, get clip info to check if it has password
            const infoResponse = await fetch(`/api/clip/${clipId}/info`);
            const infoData = await infoResponse.json();
            
            if (!infoResponse.ok) {
                // Clip not found or expired, don't try to decrypt
                this.hideLoading('retrieve-loading');
                return;
            }
            
            // If clip has password, don't auto-decrypt - just prepare UI
            if (infoData.hasPassword) {
                this.hideLoading('retrieve-loading');
                
                // Show password section and focus password input
                const passwordSection = document.getElementById('password-section');
                const passwordInput = document.getElementById('retrieve-password-input');
                
                if (passwordSection && passwordInput) {
                    passwordSection.classList.remove('hidden');
                    passwordInput.focus();
                }
                return;
            }
            
            // Extract URL secret from current URL if available
            const urlSecret = this.extractUrlSecret();
            
            const response = await fetch(`/api/clip/${clipId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();

            if (response.ok) {
                // Decrypt the content before showing
                try {
                    let decryptedContent;
                    
                    // Check if this is a Quick Share (4-digit ID) or normal clip
                    if (clipId.length === 4) {
                        // Quick Share: Decrypt without URL secret (like normal clips without password)
                        decryptedContent = await this.decryptContent(data.content, null, null);
                    } else {
                        // Normal mode: Decrypt the content
                        decryptedContent = await this.decryptContent(data.content, null, urlSecret);
                    }
                    
                    data.content = decryptedContent;
                    
                    // Hide password section since content was successfully retrieved without password
                    const passwordSection = document.getElementById('password-section');
                    if (passwordSection) {
                        passwordSection.classList.add('hidden');
                    }
                    
                    this.showRetrieveResult(data);
                } catch (decryptError) {
                    // For auto-retrieve, don't show error - let user manually retrieve
                }
            } else {
                // For auto-retrieve, don't show error - let user manually retrieve
            }
        } catch (error) {
            // For auto-retrieve, don't show error - let user manually retrieve
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
        
        // Always hide password section by default
        if (passwordSection) {
            passwordSection.classList.add('hidden');
        }
        if (passwordInput) {
            passwordInput.value = '';
        }
        
        if (clipId.length === 4 || clipId.length === 10) {
            try {
                const response = await fetch(`/api/clip/${clipId}/info`);
                const data = await response.json();
                
                if (response.ok) {
                    // Show password section ONLY if clip has password
                    if (data.hasPassword) {
                        if (passwordSection) {
                            passwordSection.classList.remove('hidden');
                        }
                        if (passwordInput) {
                            passwordInput.focus();
                        }
                    }
                    // If no password, password section stays hidden (default behavior)
                } else {
                    // Clip not found or expired - password section stays hidden
                }
            } catch (error) {
                // On error, password section stays hidden
            }
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

        // Validation
        if (!content) {
            this.showToast('Please enter content to share', 'error');
            document.getElementById('content-input').focus();
            return;
        }

        if (content.length > 400000) {
            this.showToast('Content is too long (max 400,000 characters)', 'error');
            return;
        }

        this.showLoading('loading');
        const shareButton = document.getElementById('share-button');
        shareButton.disabled = true;

        try {
            let encryptedContent;
            let urlSecret = null;
            
            if (quickShare) {
                // Quick Share: Use normal encryption without URL secret (like clips without password)
                encryptedContent = await this.encryptContent(content, null, null);
            } else if (!password) {
                // Normal clip without password: generate and use URL secret
                urlSecret = this.generateUrlSecret();
                encryptedContent = await this.encryptContent(content, null, urlSecret);
            } else {
                // Normal mode: Use encryption with password and URL secret
                urlSecret = this.generateUrlSecret();
                encryptedContent = await this.encryptContent(content, password, urlSecret);
            }
            
            // Convert Uint8Array to regular array for JSON serialization
            const contentArray = Array.from(encryptedContent);
            
            // No password sent to server - content is already encrypted!
            const response = await fetch('/api/share', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: contentArray,
                    expiration,
                    oneTime,
                    hasPassword: !!password, // Just indicate if password protection is used
                    quickShare
                })
            });

            const data = await response.json();

            if (response.ok) {
                // For all normal clips (not Quick Share), always add the URL secret as fragment
                const shareUrl = (!quickShare) ? `${data.url}#${urlSecret}` : data.url;
                data.url = shareUrl;
                this.showShareResult(data);
            } else {
                if (data.details && data.details.length > 0) {
                    const errorMessages = data.details.map(detail => detail.msg).join(', ');
                    throw new Error(`Validation failed: ${errorMessages}`);
                } else {
                    throw new Error(data.error || 'Failed to create clip');
                }
            }
        } catch (error) {
            this.showToast(error.message || 'Failed to create share link', 'error');
        } finally {
            this.hideLoading('loading');
            shareButton.disabled = false;
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

    // Retrieve Content
    async retrieveContent() {
        const clipId = document.getElementById('clip-id-input').value.trim();
        const password = document.getElementById('retrieve-password-input').value.trim();

        // Validation
        if (!clipId) {
            this.showToast('Please enter a clip ID', 'error');
            document.getElementById('clip-id-input').focus();
            return;
        }

        if (clipId.length !== 4 && clipId.length !== 10) {
            this.showToast('Clip ID must be exactly 4 or 10 characters', 'error');
            return;
        }

        this.showLoading('retrieve-loading');
        const retrieveButton = document.getElementById('retrieve-button');
        retrieveButton.disabled = true;

        try {
            // Extract URL secret from current URL if available
            const urlSecret = this.extractUrlSecret();
            
            // Always use GET - no password needed for server authentication
            // Content is already encrypted client-side
            const response = await fetch(`/api/clip/${clipId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();

            if (response.ok) {
                // Decrypt the content before showing
                try {
                    let decryptedContent;
                    
                    // Check if this is a Quick Share (4-digit ID) or normal clip
                    if (clipId.length === 4) {
                        // Quick Share: Decrypt without URL secret (like normal clips without password)
                        decryptedContent = await this.decryptContent(data.content, null, null);
                    } else {
                        // Normal mode: Decrypt the content
                        decryptedContent = await this.decryptContent(data.content, password, urlSecret);
                    }
                    
                    data.content = decryptedContent;
                    this.showRetrieveResult(data);
                } catch (decryptError) {
                    throw new Error(decryptError.message);
                }
            } else {
                throw new Error(data.error || 'Failed to retrieve clip');
            }
        } catch (error) {
            this.showToast(error.message || 'Failed to retrieve content', 'error');
            document.getElementById('content-result').classList.add('hidden');
        } finally {
            this.hideLoading('retrieve-loading');
            retrieveButton.disabled = false;
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
        
        document.getElementById('expiry-time').textContent = new Date(data.expiresAt).toLocaleString();
        
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
    showRetrieveResult(data) {
        document.getElementById('retrieved-content').textContent = data.content;
        
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
        
        document.getElementById('content-result').classList.remove('hidden');
        
        // Scroll to result
        document.getElementById('content-result').scrollIntoView({ behavior: 'smooth' });
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
        
        // Re-enable one-time checkbox
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
            messageId = 'success-message';
        }
        
        // Hide any existing toasts
        document.querySelectorAll('.toast').forEach(toast => {
            toast.classList.add('hidden');
        });
        
        // Show new toast
        document.getElementById(messageId).textContent = message;
        document.getElementById(toastId).classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            document.getElementById(toastId).classList.add('hidden');
        }, 5000);
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
                iv = await this.deriveIV(urlSecret, null, 'qopy-iv-salt-nopass-v1');
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
            // Quick Share mode: Set to 5min, disable other options
            expirationSelect.value = '5min';
            expirationSelect.disabled = true;
            oneTimeCheckbox.checked = false;
            oneTimeCheckbox.disabled = true;
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
        
        // Clear password input
        const passwordInput = document.getElementById('retrieve-password-input');
        if (passwordInput) {
            passwordInput.value = '';
        }
        
        // Focus on content input
        setTimeout(() => {
            const contentInput = document.getElementById('content-input');
            if (contentInput) {
                contentInput.focus();
            }
        }, 100);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.clipboardApp = new ClipboardApp();
});

// Service Worker registration removed - not needed for current functionality 
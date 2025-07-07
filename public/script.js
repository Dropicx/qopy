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
            console.log('🔗 Current path:', path);
            
            // More robust pattern matching for clip URLs
            let clipId = null;
            
            // Check for /clip/ABC123 pattern
            if (path.startsWith('/clip/') && path.length === 12) {
                clipId = path.substring(6);
                console.log('🔗 Detected /clip/ pattern:', clipId);
            }
            // Check for /ABC123 pattern (direct 6-char ID)
            else if (path.length === 7 && path.startsWith('/') && /^[A-Z0-9]{6}$/.test(path.substring(1))) {
                clipId = path.substring(1);
                console.log('🔗 Detected direct ID pattern:', clipId);
            }
            
            if (clipId && /^[A-Z0-9]{6}$/.test(clipId)) {
                console.log('🔗 Valid clip ID detected:', clipId);
                
                // Force switch to retrieve tab immediately
                this.switchTab('retrieve');
                
                // Set clip ID in input field
                const clipIdInput = document.getElementById('clip-id-input');
                if (clipIdInput) {
                    clipIdInput.value = clipId;
                    console.log('✅ Clip ID set in input field');
                }
                
                // Auto-retrieve after a short delay to ensure DOM is ready
                setTimeout(() => {
                    console.log('🔄 Auto-retrieving clip:', clipId);
                    this.autoRetrieveClip(clipId);
                }, 300);
                
            } else if (path === '/retrieve') {
                // Handle /retrieve URL by redirecting to home and switching to retrieve tab
                console.log('🔄 Redirecting /retrieve to home with retrieve tab');
                history.replaceState(null, '', '/');
                this.switchTab('retrieve');
            } else {
                // Default to share tab for root path
                console.log('🏠 Defaulting to share tab');
                this.switchTab('share');
            }
        } catch (error) {
            console.error('❌ Error in setupRouting:', error);
        }
    }

    // Auto-retrieve clip with password handling
    async autoRetrieveClip(clipId) {
        try {
            console.log('🔍 Checking clip info for:', clipId);
            
            // First check if clip needs password
            const infoResponse = await fetch(`/api/clip/${clipId}/info`);
            console.log('📋 Info response status:', infoResponse.status);
            
            if (infoResponse.ok) {
                const info = await infoResponse.json();
                console.log('📋 Clip info:', info);
                
                if (info.hasPassword) {
                    // Show password field and focus on it
                    console.log('🔐 Password required, showing password field');
                    const passwordSection = document.getElementById('password-section');
                    if (passwordSection) {
                        passwordSection.classList.remove('hidden');
                        console.log('✅ Password section shown');
                    }
                    
                    const passwordInput = document.getElementById('retrieve-password-input');
                    if (passwordInput) {
                        passwordInput.focus();
                        console.log('✅ Password input focused');
                    }
                    
                    this.showToast('This clip is password protected', 'info');
                } else {
                    // No password needed, retrieve immediately
                    console.log('✅ No password required, retrieving content');
                    
                    // Ensure we're on the retrieve tab
                    this.switchTab('retrieve');
                    
                    // Set the clip ID if not already set
                    const clipIdInput = document.getElementById('clip-id-input');
                    if (clipIdInput && !clipIdInput.value) {
                        clipIdInput.value = clipId;
                        console.log('✅ Clip ID set in input field');
                    }
                    
                    // Call retrieve content
                    this.retrieveContent();
                }
            } else {
                // Clip not found or other error
                console.log('❌ Clip not found or error:', infoResponse.status);
                this.showToast('Clip not found or has expired', 'error');
            }
        } catch (error) {
            console.error('❌ Auto-retrieve error:', error);
            this.showToast('Failed to check clip status', 'error');
        }
    }

    // Tab Management
    switchTab(tab) {
        try {
            console.log('🔄 Switching to tab:', tab);
            
            // Update tab buttons
            const tabButtons = document.querySelectorAll('.tab-button');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            const targetTabButton = document.getElementById(`${tab}-tab`);
            if (targetTabButton) {
                targetTabButton.classList.add('active');
                console.log('✅ Tab button updated');
            } else {
                console.error('❌ Tab button not found:', `${tab}-tab`);
            }
            
            // Update sections
            const sections = document.querySelectorAll('.section');
            sections.forEach(section => section.classList.remove('active'));
            
            const targetSection = document.getElementById(`${tab}-section`);
            if (targetSection) {
                targetSection.classList.add('active');
                console.log('✅ Section updated');
            } else {
                console.error('❌ Section not found:', `${tab}-section`);
            }

            // Update URL without reloading (only for share tab)
            if (tab === 'share') {
                history.replaceState(null, '', '/');
            }

            // Focus appropriate input after a short delay
            setTimeout(() => {
                if (tab === 'share') {
                    const contentInput = document.getElementById('content-input');
                    if (contentInput) {
                        contentInput.focus();
                        console.log('✅ Content input focused');
                    }
                } else if (tab === 'retrieve') {
                    const clipIdInput = document.getElementById('clip-id-input');
                    if (clipIdInput) {
                        clipIdInput.focus();
                        console.log('✅ Clip ID input focused');
                    }
                }
            }, 200);
            
            console.log('✅ Tab switched successfully');
        } catch (error) {
            console.error('❌ Error in switchTab:', error);
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
        
        if (clipId.length === 6) {
            try {
                const response = await fetch(`/api/clip/${clipId}/info`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.hasPassword) {
                        passwordSection.classList.remove('hidden');
                        document.getElementById('retrieve-password-input').focus();
                    } else {
                        passwordSection.classList.add('hidden');
                    }
                } else {
                    passwordSection.classList.add('hidden');
                }
            } catch (error) {
                passwordSection.classList.add('hidden');
            }
        } else {
            passwordSection.classList.add('hidden');
        }
    }

    // Share Content
    async shareContent() {
        const content = document.getElementById('content-input').value.trim();
        const expiration = document.getElementById('expiration-select').value;
        const oneTime = document.getElementById('one-time-checkbox').checked;
        const password = document.getElementById('password-input').value.trim();

        // Validation
        if (!content) {
            this.showToast('Please enter some content to share', 'error');
            document.getElementById('content-input').focus();
            return;
        }

        if (content.length > 100000) {
            this.showToast('Content is too long (max 100,000 characters)', 'error');
            return;
        }

        this.showLoading('loading');
        const shareButton = document.getElementById('share-button');
        shareButton.disabled = true;

        try {
            const encryptedContent = await this.encryptContent(content, password);
            const response = await fetch('/api/share', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: encryptedContent,
                    expiration,
                    oneTime,
                    password: password || undefined
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showShareResult(data);
            } else {
                throw new Error(data.error || 'Failed to create clip');
            }
        } catch (error) {
            console.error('Share error:', error);
            this.showToast(error.message || 'Failed to create share link', 'error');
        } finally {
            this.hideLoading('loading');
            shareButton.disabled = false;
        }
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

        if (clipId.length !== 6) {
            this.showToast('Clip ID must be exactly 6 characters', 'error');
            return;
        }

        this.showLoading('retrieve-loading');
        const retrieveButton = document.getElementById('retrieve-button');
        retrieveButton.disabled = true;

        try {
            let response;
            if (password) {
                // Use POST for password-protected clips
                response = await fetch(`/api/clip/${clipId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ password })
                });
            } else {
                // Use GET for non-password-protected clips
                response = await fetch(`/api/clip/${clipId}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
            }

            const data = await response.json();

            if (response.ok) {
                // Decrypt the content before showing
                try {
                    const decryptedContent = await this.decryptContent(data.content, password);
                    data.content = decryptedContent;
                    this.showRetrieveResult(data);
                } catch (decryptError) {
                    throw new Error(decryptError.message);
                }
            } else {
                throw new Error(data.error || 'Failed to retrieve clip');
            }
        } catch (error) {
            console.error('Retrieve error:', error);
            this.showToast(error.message || 'Failed to retrieve content', 'error');
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
        
        // Generate QR code using external service
        const qrCodeImg = document.getElementById('qr-code');
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.url)}`;
        qrCodeImg.src = qrCodeUrl;
        qrCodeImg.style.display = 'block';
        
        document.getElementById('expiry-time').textContent = new Date(data.expiresAt).toLocaleString();
        
        document.getElementById('success-modal').classList.remove('hidden');
        
        // Clear form
        document.getElementById('content-input').value = '';
        document.getElementById('password-input').value = '';
        document.getElementById('one-time-checkbox').checked = false;
        this.updateCharCounter();
    }

    // Show Retrieve Result
    showRetrieveResult(data) {
        console.log('📋 Retrieve result data:', data);
        
        document.getElementById('retrieved-content').textContent = data.content;
        
        // Use current time as created time since API doesn't provide it
        document.getElementById('created-time').textContent = new Date().toLocaleString();
        
        // Format expiration time with better error handling
        try {
            const expiresAt = data.expiresAt;
            console.log('⏰ Raw expiresAt:', expiresAt, 'Type:', typeof expiresAt);
            
            if (expiresAt) {
                // Convert to number if it's a string
                const expiresAtNumber = typeof expiresAt === 'string' ? parseInt(expiresAt, 10) : expiresAt;
                console.log('🔢 Converted expiresAt:', expiresAtNumber);
                
                const expiryDate = new Date(expiresAtNumber);
                console.log('📅 Parsed expiry date:', expiryDate);
                console.log('📅 Date.getTime():', expiryDate.getTime());
                console.log('📅 Is valid:', !isNaN(expiryDate.getTime()));
                
                if (!isNaN(expiryDate.getTime())) {
                    const timeRemaining = this.formatTimeRemaining(expiryDate.getTime());
                    const formattedDate = expiryDate.toLocaleString();
                    document.getElementById('expires-time').textContent = `${formattedDate} (${timeRemaining} remaining)`;
                } else {
                    console.error('❌ Invalid expiry date:', expiresAt, 'Converted:', expiresAtNumber);
                    document.getElementById('expires-time').textContent = 'Invalid date';
                }
            } else {
                console.error('❌ No expiresAt field in response');
                document.getElementById('expires-time').textContent = 'Not available';
            }
        } catch (error) {
            console.error('❌ Error formatting expiry date:', error);
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
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                // Fallback for older browsers or non-secure contexts
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
            }
            this.showToast(successMessage, 'success');
        } catch (error) {
            console.error('Copy failed:', error);
            this.showToast('Failed to copy to clipboard', 'error');
        }
    }

    // Modal Management
    closeModal() {
        document.getElementById('success-modal').classList.add('hidden');
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
            console.log('localStorage not available, notice hidden for this session only');
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

    // Crypto utilities for client-side encryption
    async generateKey(password = null) {
        // Check if Web Crypto API is available
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Web Crypto API not available. Please use HTTPS.');
        }
        if (password) {
            // Derive key from password using PBKDF2
            const encoder = new TextEncoder();
            const salt = encoder.encode('qopy-salt-v1');
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(password),
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
            // Generate random key for non-password clips
            return await window.crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
        }
    }

    async encryptContent(content, password = null) {
        try {
            // Check if content is already encrypted
            if (this.isEncrypted(content)) {
                return content; // Already encrypted, return as-is
            }
            
            const key = await this.generateKey(password);
            const encoder = new TextEncoder();
            const data = encoder.encode(content);
            
            // Generate random IV
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            
            // Encrypt the content
            const encryptedData = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );
            
            // Export key if it was randomly generated (for non-password clips)
            let keyData = null;
            if (!password) {
                keyData = await window.crypto.subtle.exportKey('raw', key);
            }
            
            // Combine IV + encrypted data + key (if present)
            const result = {
                iv: Array.from(iv),
                data: Array.from(new Uint8Array(encryptedData)),
                key: keyData ? Array.from(new Uint8Array(keyData)) : null
            };
            
            // Convert to base64 for storage
            return btoa(JSON.stringify(result));
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Failed to encrypt content');
        }
    }

    isEncrypted(content) {
        try {
            // Check if content looks like base64
            if (typeof content !== 'string' || content.length < 20) {
                return false;
            }
            
            // Try to parse as encrypted content
            const parsed = JSON.parse(atob(content));
            return parsed && typeof parsed === 'object' && 
                   Array.isArray(parsed.iv) && parsed.iv.length === 12 &&
                   Array.isArray(parsed.data) && parsed.data.length > 0;
        } catch {
            // If parsing fails, it's not encrypted
            return false;
        }
    }

    async decryptContent(encryptedContent, password = null) {
        try {
            // Check if content is actually encrypted
            if (!this.isEncrypted(encryptedContent)) {
                return encryptedContent;
            }
            
            // Parse the encrypted data
            const encrypted = JSON.parse(atob(encryptedContent));
            
            let key;
            if (password) {
                key = await this.generateKey(password);
            } else if (encrypted.key) {
                const keyArray = new Uint8Array(encrypted.key);
                
                if (keyArray.byteLength !== 32) {
                    throw new Error(`Invalid key length: ${keyArray.byteLength} bytes (expected 32)`);
                }
                
                key = await window.crypto.subtle.importKey(
                    'raw',
                    keyArray,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['decrypt']
                );
            } else {
                throw new Error('No key available for decryption');
            }
            
            // Decrypt the content
            const decryptedData = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
                key,
                new Uint8Array(encrypted.data)
            );
            
            const decoder = new TextDecoder();
            return decoder.decode(decryptedData);
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt content. The content may be corrupted or the password is incorrect.');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.clipboardApp = new ClipboardApp();
});

// Service Worker registration removed - not needed for current functionality 
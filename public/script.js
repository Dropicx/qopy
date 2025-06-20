// Qopy Application JavaScript
class ClipboardApp {
    constructor() {
        this.baseUrl = window.location.origin;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupRouting();
        this.setupKeyboardShortcuts();
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
        const path = window.location.pathname;
        const clipIdMatch = path.match(/^\/([A-Z0-9]{6})$/);
        
        if (clipIdMatch) {
            const clipId = clipIdMatch[1];
            this.switchTab('retrieve');
            document.getElementById('clip-id-input').value = clipId;
            // Auto-retrieve if it's a direct clip URL
            setTimeout(() => this.checkClipId(), 100);
        }
    }

    // Tab Management
    switchTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');

        // Update sections
        document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
        document.getElementById(`${tab}-section`).classList.add('active');

        // Update URL without reloading
        const newUrl = tab === 'share' ? '/' : `/${tab}`;
        history.replaceState(null, '', newUrl);

        // Focus appropriate input
        if (tab === 'share') {
            document.getElementById('content-input').focus();
        } else if (tab === 'retrieve') {
            document.getElementById('clip-id-input').focus();
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
            const response = await fetch('/api/clip', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content,
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
            const requestBody = password ? { password } : {};
            const response = await fetch(`/api/clip/${clipId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                ...(password && {
                    method: 'POST',
                    body: JSON.stringify(requestBody)
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showRetrieveResult(data);
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
        document.getElementById('share-url').value = data.shareUrl;
        document.getElementById('clip-id').value = data.clipId;
        
        // Handle QR code
        const qrCodeImg = document.getElementById('qr-code');
        if (data.qrCode) {
            qrCodeImg.src = data.qrCode;
            qrCodeImg.style.display = 'block';
        } else {
            qrCodeImg.style.display = 'none';
            console.warn('QR code not available');
        }
        
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
        document.getElementById('retrieved-content').textContent = data.content;
        document.getElementById('created-time').textContent = new Date(data.createdAt).toLocaleString();
        document.getElementById('expires-time').textContent = new Date(data.expiresAt).toLocaleString();
        
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
        const toastId = type === 'error' ? 'error-toast' : 'success-toast';
        const messageId = type === 'error' ? 'error-message' : 'success-message';
        
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

    // FAQ Accordion functionality
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
                }
            }
        });
        
        // Toggle current FAQ
        const isActive = question.classList.contains('active');
        if (isActive) {
            question.classList.remove('active');
            answer.classList.remove('active');
        } else {
            question.classList.add('active');
            answer.classList.add('active');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.clipboardApp = new ClipboardApp();
});

// Service Worker registration for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
} 
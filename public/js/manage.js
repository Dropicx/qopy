class SubscriptionManager {
    constructor() {
        this.stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY || 'pk_test_...');
        this.anonymousId = null;
        this.subscriptionData = null;

        this.init();
    }

    init() {
        // Check URL for anonymous ID
        const urlParams = new URLSearchParams(window.location.search);
        const idFromUrl = urlParams.get('id');

        if (idFromUrl) {
            document.getElementById('anonymousIdInput').value = idFromUrl;
            this.loadSubscription();
        }

        // Format anonymous ID input
        document.getElementById('anonymousIdInput').addEventListener('input', this.formatAnonymousId);
        document.getElementById('anonymousIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadSubscription();
            }
        });
    }

    formatAnonymousId(e) {
        let value = e.target.value.replace(/[^A-Z0-9]/g, '');
        let formatted = '';

        for (let i = 0; i < value.length && i < 16; i++) {
            if (i > 0 && i % 4 === 0) {
                formatted += '-';
            }
            formatted += value[i];
        }

        e.target.value = formatted;
    }

    async loadSubscription() {
        const anonymousId = document.getElementById('anonymousIdInput').value.trim();

        if (!anonymousId) {
            this.showError('Please enter your Anonymous ID');
            return;
        }

        if (!this.validateAnonymousId(anonymousId)) {
            this.showError('Invalid Anonymous ID format. Should be XXXX-XXXX-XXXX-XXXX');
            return;
        }

        try {
            this.showLoading(true);
            this.hideMessages();

            const response = await fetch(`/api/payment/status/${anonymousId}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to load subscription');
            }

            const data = await response.json();
            this.anonymousId = anonymousId;
            this.subscriptionData = data;

            this.displaySubscriptionData(data);
            this.showSubscriptionDetails(true);

        } catch (error) {
            this.showError('Failed to load subscription: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    displaySubscriptionData(data) {
        // Basic subscription info
        document.getElementById('displayAnonymousId').textContent = data.anonymousId;

        if (data.subscription) {
            document.getElementById('planName').textContent =
                data.subscription.plan_name || (data.subscription.plan_code + ' Plan');
            document.getElementById('planPrice').textContent =
                '$' + (data.subscription.price_cents / 100).toFixed(2) + '/month';
        }

        // Status
        const statusElement = document.getElementById('subscriptionStatus');
        if (data.stripe && data.stripe.exists) {
            statusElement.textContent = data.stripe.status || 'Unknown';
            statusElement.className = `status-badge status-${data.stripe.status || 'unknown'}`;

            // Next billing
            if (data.stripe.currentPeriodEnd) {
                const nextBilling = new Date(data.stripe.currentPeriodEnd);
                document.getElementById('nextBilling').textContent = nextBilling.toLocaleDateString();
            }
        } else {
            statusElement.textContent = 'Not Found';
            statusElement.className = 'status-badge status-canceled';
            document.getElementById('nextBilling').textContent = 'N/A';
        }

        // Usage data
        this.displayUsageData(data.usage || []);
    }

    displayUsageData(usage) {
        const usageSection = document.getElementById('usageSection');
        usageSection.innerHTML = '';

        if (!usage || usage.length === 0) {
            usageSection.innerHTML = '<p style="color: #64748b; text-align: center;">No usage data available</p>';
            return;
        }

        usage.forEach(quota => {
            const usageItem = document.createElement('div');
            usageItem.className = 'usage-item';

            const percentage = quota.usage_percentage || 0;
            let fillClass = '';
            if (percentage >= 90) fillClass = 'critical';
            else if (percentage >= 75) fillClass = 'high';

            // Build DOM elements safely (no innerHTML with server data)
            const labelDiv = document.createElement('div');
            labelDiv.style.minWidth = '120px';
            const labelStrong = document.createElement('strong');
            labelStrong.textContent = this.formatQuotaType(quota.quota_type);
            const labelDetail = document.createElement('div');
            labelDetail.style.fontSize = '12px';
            labelDetail.style.color = '#64748b';
            labelDetail.textContent = `${quota.current_usage.toLocaleString()} / ${quota.quota_limit.toLocaleString()}`;
            labelDiv.appendChild(labelStrong);
            labelDiv.appendChild(labelDetail);

            const barDiv = document.createElement('div');
            barDiv.className = 'usage-bar';
            const fillDiv = document.createElement('div');
            fillDiv.className = `usage-fill ${fillClass}`;
            fillDiv.style.width = `${Math.min(percentage, 100)}%`;
            barDiv.appendChild(fillDiv);

            const percentDiv = document.createElement('div');
            percentDiv.style.minWidth = '50px';
            percentDiv.style.textAlign = 'right';
            percentDiv.style.fontWeight = '600';
            percentDiv.textContent = `${percentage.toFixed(1)}%`;

            usageItem.appendChild(labelDiv);
            usageItem.appendChild(barDiv);
            usageItem.appendChild(percentDiv);

            usageSection.appendChild(usageItem);
        });
    }

    formatQuotaType(quotaType) {
        const formats = {
            'storage_mb': 'Storage (MB)',
            'uploads_per_day': 'Daily Uploads',
            'api_calls_per_hour': 'API Calls/Hour'
        };
        return formats[quotaType] || quotaType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    async updatePaymentMethod() {
        try {
            this.showLoading(true);

            // Create setup intent
            const response = await fetch('/api/payment/setup-intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    anonymousId: this.anonymousId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to create setup intent');
            }

            const { clientSecret } = await response.json();

            // Redirect to Stripe for payment method update
            const { error } = await this.stripe.confirmCardSetup(clientSecret);

            if (error) {
                throw new Error(error.message);
            }

            this.showSuccess('Payment method updated successfully');

        } catch (error) {
            this.showError('Failed to update payment method: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async downloadInvoices() {
        this.showError('Invoice download feature coming soon');
    }

    cancelSubscription() {
        document.getElementById('cancelModal').classList.add('visible');
    }

    async confirmCancel(immediately) {
        try {
            this.closeModal('cancelModal');
            this.showLoading(true);

            const response = await fetch('/api/payment/cancel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    anonymousId: this.anonymousId,
                    immediately: immediately
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to cancel subscription');
            }

            const cancelData = await response.json();

            if (immediately) {
                this.showSuccess('Subscription cancelled immediately');
            } else {
                this.showSuccess('Subscription will be cancelled at the end of the current billing period');
            }

            // Reload subscription data
            setTimeout(() => {
                this.loadSubscription();
            }, 2000);

        } catch (error) {
            this.showError('Failed to cancel subscription: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('visible');
    }

    validateAnonymousId(anonymousId) {
        const pattern = /^[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
        return pattern.test(anonymousId);
    }

    showLoading(show) {
        document.getElementById('loading').classList.toggle('visible', show);
        document.getElementById('loadBtn').disabled = show;
    }

    showSubscriptionDetails(show) {
        document.getElementById('subscriptionDetails').classList.toggle('visible', show);
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorMessage').classList.add('visible');
    }

    showSuccess(message) {
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successMessage').classList.add('visible');
    }

    hideMessages() {
        document.getElementById('errorMessage').classList.remove('visible');
        document.getElementById('successMessage').classList.remove('visible');
    }
}

// Initialize when DOM is loaded
let subscriptionManager;

document.addEventListener('DOMContentLoaded', () => {
    subscriptionManager = new SubscriptionManager();

    // Bind button event listeners
    document.getElementById('loadBtn').addEventListener('click', () => {
        subscriptionManager.loadSubscription();
    });
    document.getElementById('updatePaymentBtn').addEventListener('click', () => {
        subscriptionManager.updatePaymentMethod();
    });
    document.getElementById('downloadInvoicesBtn').addEventListener('click', () => {
        subscriptionManager.downloadInvoices();
    });
    document.getElementById('cancelSubBtn').addEventListener('click', () => {
        subscriptionManager.cancelSubscription();
    });
    document.getElementById('confirmCancelBtn').addEventListener('click', () => {
        subscriptionManager.confirmCancel(true);
    });
    document.getElementById('cancelCancelBtn').addEventListener('click', () => {
        subscriptionManager.confirmCancel(false);
    });
    document.getElementById('closeCancelModalBtn').addEventListener('click', () => {
        subscriptionManager.closeModal('cancelModal');
    });
});

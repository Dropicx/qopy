class PaymentSuccess {
    constructor() {
        this.sessionId = null;
        this.anonymousId = null;
        this.subscriptionData = null;

        this.init();
    }

    async init() {
        try {
            // Get session ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            this.sessionId = urlParams.get('session_id');
            this.anonymousId = urlParams.get('anonymous_id');

            if (!this.sessionId || !this.anonymousId) {
                throw new Error('Missing payment session information');
            }

            // Verify payment and get subscription details
            await this.verifyPayment();

        } catch (error) {
            console.error('Payment verification error:', error);
            this.showError(error.message);
        }
    }

    async verifyPayment() {
        try {
            const response = await fetch('/api/payment/verify-success', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    anonymousId: this.anonymousId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Payment verification failed');
            }

            this.subscriptionData = await response.json();
            this.showSuccess();

        } catch (error) {
            throw error;
        }
    }

    showSuccess() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('successState').style.display = 'block';

        // Populate data
        document.getElementById('anonymousId').textContent = this.anonymousId;
        document.getElementById('planName').textContent = this.subscriptionData.planType.charAt(0).toUpperCase() + this.subscriptionData.planType.slice(1) + ' Plan';
        document.getElementById('planPrice').textContent = '$' + (this.subscriptionData.amount / 100).toFixed(2) + '/month';

        if (this.subscriptionData.currentPeriodEnd) {
            const nextBilling = new Date(this.subscriptionData.currentPeriodEnd);
            document.getElementById('nextBilling').textContent = nextBilling.toLocaleDateString();
        }

        // Update page title
        document.title = 'Qopy - Subscription Active';
    }

    showError(message) {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
        document.getElementById('errorMessage').textContent = message;
    }
}

// Utility functions
function copyAnonymousId() {
    const anonymousId = document.getElementById('anonymousId').textContent;
    const copyButton = document.getElementById('copyButton');

    if (navigator.clipboard) {
        navigator.clipboard.writeText(anonymousId).then(() => {
            copyButton.textContent = 'Copied!';
            copyButton.classList.add('copied');
            setTimeout(() => {
                copyButton.textContent = 'Copy ID';
                copyButton.classList.remove('copied');
            }, 2000);
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = anonymousId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        copyButton.textContent = 'Copied!';
        copyButton.classList.add('copied');
        setTimeout(() => {
            copyButton.textContent = 'Copy ID';
            copyButton.classList.remove('copied');
        }, 2000);
    }
}

function downloadIdFile() {
    const anonymousId = document.getElementById('anonymousId').textContent;
    const content = `Qopy Anonymous ID: ${anonymousId}\n\nIMPORTANT: Keep this ID safe!\nThis is your only way to manage your subscription.\n\nManage your subscription at:\nhttps://qopy.app/manage?id=${anonymousId}\n\nDate: ${new Date().toISOString()}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qopy-anonymous-id-${anonymousId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showManageSubscription() {
    const anonymousId = document.getElementById('anonymousId').textContent;
    window.location.href = `/manage?id=${anonymousId}`;
}

// Bind button event listeners
document.addEventListener('DOMContentLoaded', () => {
    new PaymentSuccess();

    document.getElementById('copyButton').addEventListener('click', copyAnonymousId);
    document.getElementById('downloadIdBtn').addEventListener('click', downloadIdFile);
    document.getElementById('manageSubBtn').addEventListener('click', showManageSubscription);
});

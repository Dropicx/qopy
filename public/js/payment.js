class AnonymousPayment {
    constructor() {
        this.stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY || 'pk_test_...'); // Will be set by server
        this.anonymousId = null;
        this.selectedPlan = null;
        this.plans = [];

        this.init();
    }

    async init() {
        try {
            // Generate anonymous ID
            await this.generateAnonymousId();

            // Load available plans
            await this.loadPlans();

            // Set up event listeners
            this.setupEventListeners();

        } catch (error) {
            this.showError('Failed to initialize payment system: ' + error.message);
        }
    }

    async generateAnonymousId() {
        try {
            const response = await fetch('/api/payment/generate-id', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to generate anonymous ID');
            }

            const data = await response.json();
            this.anonymousId = data.anonymousId;

            document.getElementById('anonymousId').textContent = this.anonymousId;

        } catch (error) {
            throw new Error('ID generation failed: ' + error.message);
        }
    }

    async loadPlans() {
        try {
            const response = await fetch('/api/payment/plans');

            if (!response.ok) {
                throw new Error('Failed to load plans');
            }

            const data = await response.json();
            this.plans = data.plans;

            this.renderPlans();

        } catch (error) {
            throw new Error('Plans loading failed: ' + error.message);
        }
    }

    renderPlans() {
        const plansGrid = document.getElementById('plansGrid');
        plansGrid.innerHTML = '';

        this.plans.forEach(plan => {
            const planCard = document.createElement('div');
            planCard.className = 'plan-card';
            planCard.dataset.planId = plan.id;

            const features = Array.isArray(plan.features)
                ? plan.features
                : JSON.parse(plan.features || '[]');

            planCard.innerHTML = `
                <div class="plan-name">${plan.name}</div>
                <div class="plan-price">${plan.priceFormatted}/month</div>
                <div class="plan-description">${plan.description || ''}</div>
                <ul class="plan-features">
                    ${features.map(feature => `<li>${feature}</li>`).join('')}
                </ul>
            `;

            planCard.addEventListener('click', () => this.selectPlan(plan));
            plansGrid.appendChild(planCard);
        });
    }

    selectPlan(plan) {
        this.selectedPlan = plan;

        // Update UI
        document.querySelectorAll('.plan-card').forEach(card => {
            card.classList.remove('selected');
        });

        document.querySelector(`[data-plan-id="${plan.id}"]`).classList.add('selected');

        const paymentButton = document.getElementById('paymentButton');
        paymentButton.disabled = false;
        paymentButton.textContent = `Subscribe to ${plan.name} - ${plan.priceFormatted}/month`;
    }

    setupEventListeners() {
        document.getElementById('paymentButton').addEventListener('click', () => {
            this.processPayment();
        });
    }

    async processPayment() {
        if (!this.selectedPlan) {
            this.showError('Please select a plan');
            return;
        }

        try {
            this.showLoading(true);
            this.hideError();

            // Create payment session
            const response = await fetch('/api/payment/create-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    anonymousId: this.anonymousId,
                    planType: this.selectedPlan.id,
                    successUrl: window.location.origin + '/payment-success.html',
                    cancelUrl: window.location.origin + '/payment.html'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to create payment session');
            }

            const { sessionUrl } = await response.json();

            // Redirect to Stripe Checkout
            window.location.href = sessionUrl;

        } catch (error) {
            this.showLoading(false);
            this.showError('Payment processing failed: ' + error.message);
        }
    }

    showLoading(show) {
        document.getElementById('loading').classList.toggle('visible', show);
        document.getElementById('paymentButton').disabled = show;
    }

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        errorElement.textContent = message;
        errorElement.classList.add('visible');
    }

    hideError() {
        document.getElementById('errorMessage').classList.remove('visible');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AnonymousPayment();
});

// Handle URL parameters (e.g., from cancelled payment)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('cancelled') === 'true') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            document.getElementById('errorMessage').textContent = 'Payment was cancelled. You can try again below.';
            document.getElementById('errorMessage').classList.add('visible');
        }, 1000);
    });
}

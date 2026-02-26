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

const BaseService = require('./core/BaseService');
const AnonymousPaymentService = require('./AnonymousPaymentService');
const SubscriptionRepository = require('./SubscriptionRepository');
const rateLimit = require('express-rate-limit');

/**
 * PaymentController - API endpoints for anonymous payment system
 * Handles all payment-related HTTP requests and responses
 */
class PaymentController extends BaseService {
    constructor(dbPool) {
        super('PaymentController');
        this.paymentService = new AnonymousPaymentService();
        this.subscriptionRepo = new SubscriptionRepository(dbPool);
        
        // Rate limiting for payment endpoints
        this.paymentLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 10, // 10 requests per window
            message: {
                error: 'Too many payment requests',
                message: 'Please wait before trying again'
            },
            standardHeaders: true,
            legacyHeaders: false
        });
        
        this.webhookLimiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 100, // 100 webhook calls per minute
            message: {
                error: 'Webhook rate limit exceeded'
            },
            skip: (req) => {
                // Skip rate limiting for valid Stripe webhooks
                return this.isValidStripeWebhook(req);
            }
        });
    }

    /**
     * Get route handlers for Express
     */
    getRoutes() {
        return {
            // Generate anonymous ID
            'POST /api/payment/generate-id': this.paymentLimiter.bind(this),
            'POST /api/payment/generate-id/handler': this.generateAnonymousId.bind(this),
            
            // Get available plans
            'GET /api/payment/plans': this.getPlans.bind(this),
            
            // Create payment session
            'POST /api/payment/create-session': this.paymentLimiter.bind(this),
            'POST /api/payment/create-session/handler': this.createPaymentSession.bind(this),
            
            // Verify payment success
            'POST /api/payment/verify-success': this.verifyPaymentSuccess.bind(this),
            
            // Get subscription status
            'GET /api/payment/status/:anonymousId': this.getSubscriptionStatus.bind(this),
            
            // Cancel subscription
            'POST /api/payment/cancel': this.paymentLimiter.bind(this),
            'POST /api/payment/cancel/handler': this.cancelSubscription.bind(this),
            
            // Update payment method
            'POST /api/payment/update-method': this.paymentLimiter.bind(this),
            'POST /api/payment/update-method/handler': this.updatePaymentMethod.bind(this),
            
            // Create setup intent for payment method updates
            'POST /api/payment/setup-intent': this.paymentLimiter.bind(this),
            'POST /api/payment/setup-intent/handler': this.createSetupIntent.bind(this),
            
            // Stripe webhooks
            'POST /api/payment/webhook': this.webhookLimiter.bind(this),
            'POST /api/payment/webhook/handler': this.handleStripeWebhook.bind(this),
            
            // Usage and quotas
            'GET /api/payment/usage/:anonymousId': this.getUsage.bind(this),
            'POST /api/payment/usage/update': this.updateUsage.bind(this)
        };
    }

    /**
     * Generate anonymous ID
     */
    async generateAnonymousId(req, res) {
        try {
            const anonymousId = this.paymentService.generateAnonymousId();
            
            this.logInfo('Generated anonymous ID');
            
            res.json({
                success: true,
                anonymousId: anonymousId,
                message: 'Anonymous ID generated successfully'
            });
            
        } catch (error) {
            this.logError('Failed to generate anonymous ID', error);
            res.status(500).json({
                success: false,
                error: 'ID generation failed',
                message: error.message
            });
        }
    }

    /**
     * Get available subscription plans
     */
    async getPlans(req, res) {
        try {
            const plans = this.paymentService.getSupportedPlans();
            
            res.json({
                success: true,
                plans: plans
            });
            
        } catch (error) {
            this.logError('Failed to get plans', error);
            res.status(500).json({
                success: false,
                error: 'Failed to load plans',
                message: error.message
            });
        }
    }

    /**
     * Create payment session
     */
    async createPaymentSession(req, res) {
        try {
            const { anonymousId, planType, successUrl, cancelUrl } = req.body;
            
            // Validate input
            if (!anonymousId || !planType || !successUrl || !cancelUrl) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    message: 'anonymousId, planType, successUrl, and cancelUrl are required'
                });
            }
            
            if (!this.paymentService.validateAnonymousId(anonymousId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid anonymous ID format',
                    message: 'Anonymous ID must be in format XXXX-XXXX-XXXX-XXXX'
                });
            }
            
            // Create payment session
            const sessionData = await this.paymentService.createPaymentSession(
                anonymousId, 
                planType, 
                successUrl, 
                cancelUrl
            );
            
            this.logInfo(`Created payment session for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            res.json({
                success: true,
                sessionId: sessionData.sessionId,
                sessionUrl: sessionData.sessionUrl,
                anonymousId: sessionData.anonymousId,
                planType: sessionData.planType,
                amount: sessionData.amount
            });
            
        } catch (error) {
            this.logError('Failed to create payment session', error);
            res.status(500).json({
                success: false,
                error: 'Payment session creation failed',
                message: error.message
            });
        }
    }

    /**
     * Verify payment success
     */
    async verifyPaymentSuccess(req, res) {
        try {
            const { sessionId, anonymousId } = req.body;
            
            if (!sessionId || !anonymousId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing session ID or anonymous ID'
                });
            }
            
            // Handle payment success with Stripe
            const subscriptionData = await this.paymentService.handlePaymentSuccess(sessionId, anonymousId);
            
            // Store subscription in database
            await this.subscriptionRepo.createSubscription(subscriptionData);
            
            this.logInfo(`Payment verified for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            res.json({
                success: true,
                anonymousId: subscriptionData.anonymousId,
                planType: subscriptionData.planType,
                status: subscriptionData.status,
                currentPeriodStart: subscriptionData.currentPeriodStart,
                currentPeriodEnd: subscriptionData.currentPeriodEnd,
                amount: subscriptionData.amount || 0
            });
            
        } catch (error) {
            this.logError('Payment verification failed', error);
            res.status(400).json({
                success: false,
                error: 'Payment verification failed',
                message: error.message
            });
        }
    }

    /**
     * Get subscription status
     */
    async getSubscriptionStatus(req, res) {
        try {
            const { anonymousId } = req.params;
            
            if (!this.paymentService.validateAnonymousId(anonymousId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid anonymous ID format'
                });
            }
            
            // Get from Stripe
            const stripeStatus = await this.paymentService.getSubscriptionStatus(anonymousId);
            
            // Get from database
            const dbSubscription = await this.subscriptionRepo.getSubscriptionByAnonymousId(anonymousId);
            
            // Get usage quotas
            const usageQuotas = await this.subscriptionRepo.getUsageQuotas(anonymousId);
            
            res.json({
                success: true,
                anonymousId: anonymousId,
                stripe: stripeStatus,
                subscription: dbSubscription,
                usage: usageQuotas
            });
            
        } catch (error) {
            this.logError('Failed to get subscription status', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get subscription status',
                message: error.message
            });
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(req, res) {
        try {
            const { anonymousId, immediately } = req.body;
            
            if (!anonymousId) {
                return res.status(400).json({
                    success: false,
                    error: 'Anonymous ID is required'
                });
            }
            
            if (!this.paymentService.validateAnonymousId(anonymousId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid anonymous ID format'
                });
            }
            
            // Cancel with Stripe
            const cancelData = await this.paymentService.cancelSubscription(anonymousId, immediately === true);
            
            // Update database
            await this.subscriptionRepo.updateSubscriptionStatus(cancelData.subscriptionId, {
                status: immediately ? 'canceled' : 'active',
                cancelAtPeriodEnd: !immediately,
                canceledAt: immediately ? new Date() : null,
                cancellationReason: 'user_requested'
            });
            
            this.logInfo(`Subscription canceled for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            res.json({
                success: true,
                anonymousId: cancelData.anonymousId,
                status: cancelData.status,
                canceledAt: cancelData.canceledAt,
                cancelAtPeriodEnd: cancelData.cancelAtPeriodEnd,
                currentPeriodEnd: cancelData.currentPeriodEnd
            });
            
        } catch (error) {
            this.logError('Failed to cancel subscription', error);
            res.status(500).json({
                success: false,
                error: 'Subscription cancellation failed',
                message: error.message
            });
        }
    }

    /**
     * Update payment method
     */
    async updatePaymentMethod(req, res) {
        try {
            const { anonymousId, setupIntentId } = req.body;
            
            if (!anonymousId || !setupIntentId) {
                return res.status(400).json({
                    success: false,
                    error: 'Anonymous ID and setup intent ID are required'
                });
            }
            
            if (!this.paymentService.validateAnonymousId(anonymousId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid anonymous ID format'
                });
            }
            
            const updateData = await this.paymentService.updatePaymentMethod(anonymousId, setupIntentId);
            
            this.logInfo(`Payment method updated for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            res.json({
                success: true,
                anonymousId: updateData.anonymousId,
                subscriptionId: updateData.subscriptionId,
                paymentMethodId: updateData.paymentMethodId,
                status: updateData.status
            });
            
        } catch (error) {
            this.logError('Failed to update payment method', error);
            res.status(500).json({
                success: false,
                error: 'Payment method update failed',
                message: error.message
            });
        }
    }

    /**
     * Create setup intent for payment method updates
     */
    async createSetupIntent(req, res) {
        try {
            const { anonymousId } = req.body;
            
            if (!anonymousId) {
                return res.status(400).json({
                    success: false,
                    error: 'Anonymous ID is required'
                });
            }
            
            if (!this.paymentService.validateAnonymousId(anonymousId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid anonymous ID format'
                });
            }
            
            const setupIntentData = await this.paymentService.createSetupIntent(anonymousId);
            
            res.json({
                success: true,
                setupIntentId: setupIntentData.setupIntentId,
                clientSecret: setupIntentData.clientSecret,
                anonymousId: setupIntentData.anonymousId
            });
            
        } catch (error) {
            this.logError('Failed to create setup intent', error);
            res.status(500).json({
                success: false,
                error: 'Setup intent creation failed',
                message: error.message
            });
        }
    }

    /**
     * Handle Stripe webhooks
     */
    async handleStripeWebhook(req, res) {
        try {
            const signature = req.headers['stripe-signature'];
            
            if (!signature) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing Stripe signature'
                });
            }
            
            // Validate webhook signature
            const event = this.paymentService.validateWebhookSignature(req.body, signature);
            
            // Process webhook event
            await this.processWebhookEvent(event);
            
            res.json({
                success: true,
                received: true
            });
            
        } catch (error) {
            this.logError('Webhook processing failed', error);
            res.status(400).json({
                success: false,
                error: 'Webhook processing failed',
                message: error.message
            });
        }
    }

    /**
     * Process webhook event
     */
    async processWebhookEvent(event) {
        try {
            const eventData = {
                eventType: event.type,
                stripeEventId: event.id,
                eventData: event.data,
                processed: false
            };
            
            // Extract relevant data based on event type
            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                case 'customer.subscription.deleted':
                    eventData.stripeSubscriptionId = event.data.object.id;
                    await this.handleSubscriptionEvent(event);
                    break;
                    
                case 'invoice.payment_succeeded':
                case 'invoice.payment_failed':
                    eventData.amountCents = event.data.object.amount_paid;
                    eventData.currency = event.data.object.currency;
                    eventData.stripeSubscriptionId = event.data.object.subscription;
                    eventData.paymentStatus = event.type === 'invoice.payment_succeeded' ? 'succeeded' : 'failed';
                    break;
                    
                case 'payment_method.attached':
                case 'payment_method.detached':
                    // Handle payment method changes
                    break;
            }
            
            // Record event in database
            await this.subscriptionRepo.recordPaymentEvent({
                ...eventData,
                processed: true
            });
            
            this.logInfo(`Processed webhook event: ${event.type}`);
            
        } catch (error) {
            this.logError('Failed to process webhook event', error);
            
            // Record failed event
            await this.subscriptionRepo.recordPaymentEvent({
                eventType: event.type,
                stripeEventId: event.id,
                eventData: event.data,
                processed: false,
                lastProcessingError: error.message
            });
            
            throw error;
        }
    }

    /**
     * Handle subscription-related webhook events
     */
    async handleSubscriptionEvent(event) {
        const subscription = event.data.object;
        
        const statusData = {
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
        };
        
        if (event.type === 'customer.subscription.deleted') {
            statusData.cancellationReason = 'stripe_cancelled';
        }
        
        await this.subscriptionRepo.updateSubscriptionStatus(subscription.id, statusData);
    }

    /**
     * Get usage information
     */
    async getUsage(req, res) {
        try {
            const { anonymousId } = req.params;
            
            if (!this.paymentService.validateAnonymousId(anonymousId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid anonymous ID format'
                });
            }
            
            const usage = await this.subscriptionRepo.getUsageQuotas(anonymousId);
            
            res.json({
                success: true,
                anonymousId: anonymousId,
                usage: usage
            });
            
        } catch (error) {
            this.logError('Failed to get usage', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get usage information',
                message: error.message
            });
        }
    }

    /**
     * Update usage (for internal use)
     */
    async updateUsage(req, res) {
        try {
            const { anonymousId, quotaType, increment } = req.body;
            
            if (!anonymousId || !quotaType) {
                return res.status(400).json({
                    success: false,
                    error: 'Anonymous ID and quota type are required'
                });
            }
            
            const result = await this.subscriptionRepo.updateUsageQuota(
                anonymousId, 
                quotaType, 
                increment || 1
            );
            
            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: 'Quota not found or user not found'
                });
            }
            
            res.json({
                success: true,
                usage: result
            });
            
        } catch (error) {
            this.logError('Failed to update usage', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update usage',
                message: error.message
            });
        }
    }

    /**
     * Check if request is a valid Stripe webhook (for rate limiting)
     */
    isValidStripeWebhook(req) {
        try {
            const signature = req.headers['stripe-signature'];
            if (!signature) return false;
            
            // Basic validation - full validation happens in handler
            return signature.startsWith('t=') && signature.includes(',v1=');
        } catch (error) {
            return false;
        }
    }
}

module.exports = PaymentController;
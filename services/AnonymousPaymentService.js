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

const crypto = require('crypto');
const BaseService = require('./core/BaseService');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * AnonymousPaymentService - Handles Stripe integration for anonymous payments
 * Implements Mullvad-style anonymous ID system for subscriptions without PII
 */
class AnonymousPaymentService extends BaseService {
    constructor() {
        super('AnonymousPaymentService');
        this.idLength = 16; // Minimum 16 characters like Mullvad
        this.supportedPlans = new Map([
            ['basic', { priceId: process.env.STRIPE_BASIC_PRICE_ID, name: 'Basic Plan', price: 500 }], // $5.00
            ['pro', { priceId: process.env.STRIPE_PRO_PRICE_ID, name: 'Pro Plan', price: 1500 }], // $15.00
            ['enterprise', { priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID, name: 'Enterprise Plan', price: 5000 }] // $50.00
        ]);
    }

    /**
     * Generate anonymous ID using cryptographically secure random bytes
     * Format: XXXX-XXXX-XXXX-XXXX (16 characters excluding dashes)
     * Uses alphanumeric characters (0-9, A-Z) for better UX
     */
    generateAnonymousId() {
        try {
            // Generate 16 random bytes
            const randomBytes = crypto.randomBytes(12);
            
            // Convert to base32-like encoding (0-9, A-Z, excluding confusing chars like 0, O, I, L)
            const charset = '123456789ABCDEFGHJKMNPQRSTUVWXYZ';
            let result = '';
            
            // Convert bytes to custom base32
            for (let i = 0; i < randomBytes.length; i++) {
                result += charset[randomBytes[i] % charset.length];
            }
            
            // Add additional randomness to reach 16 characters
            while (result.length < 16) {
                const extraByte = crypto.randomBytes(1)[0];
                result += charset[extraByte % charset.length];
            }
            
            // Format as XXXX-XXXX-XXXX-XXXX for better readability
            return `${result.substring(0, 4)}-${result.substring(4, 8)}-${result.substring(8, 12)}-${result.substring(12, 16)}`;
            
        } catch (error) {
            this.logError('Failed to generate anonymous ID', error);
            throw new Error('ID generation failed');
        }
    }

    /**
     * Validate anonymous ID format
     */
    validateAnonymousId(anonymousId) {
        if (!anonymousId || typeof anonymousId !== 'string') {
            return false;
        }
        
        // Check format: XXXX-XXXX-XXXX-XXXX (16 chars + 3 dashes = 19 total)
        const pattern = /^[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
        return pattern.test(anonymousId);
    }

    /**
     * Create Stripe Customer with anonymous metadata
     * No PII stored - only anonymous ID and service metadata
     */
    async createStripeCustomer(anonymousId, planType = 'basic') {
        try {
            if (!this.validateAnonymousId(anonymousId)) {
                throw new Error('Invalid anonymous ID format');
            }

            if (!this.supportedPlans.has(planType)) {
                throw new Error(`Unsupported plan type: ${planType}`);
            }

            const plan = this.supportedPlans.get(planType);
            
            // Create Stripe customer with minimal metadata (no PII)
            const customer = await stripe.customers.create({
                description: `Qopy Anonymous User`,
                metadata: {
                    anonymous_id: anonymousId,
                    service: 'qopy',
                    plan_type: planType,
                    created_method: 'anonymous_registration',
                    account_type: 'anonymous',
                    // No email, name, or other PII
                }
            });

            this.logInfo(`Created Stripe customer for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            return {
                customerId: customer.id,
                anonymousId: anonymousId,
                planType: planType,
                created: customer.created
            };

        } catch (error) {
            this.logError('Failed to create Stripe customer', error);
            throw error;
        }
    }

    /**
     * Create payment session for anonymous subscription
     */
    async createPaymentSession(anonymousId, planType, successUrl, cancelUrl) {
        try {
            if (!this.validateAnonymousId(anonymousId)) {
                throw new Error('Invalid anonymous ID format');
            }

            if (!this.supportedPlans.has(planType)) {
                throw new Error(`Unsupported plan type: ${planType}`);
            }

            const plan = this.supportedPlans.get(planType);
            
            // Create or retrieve Stripe customer
            const customerData = await this.createStripeCustomer(anonymousId, planType);
            
            // Create Checkout session
            const session = await stripe.checkout.sessions.create({
                customer: customerData.customerId,
                payment_method_types: ['card'],
                line_items: [{
                    price: plan.priceId,
                    quantity: 1,
                }],
                mode: 'subscription',
                success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}&anonymous_id=${anonymousId}`,
                cancel_url: `${cancelUrl}?anonymous_id=${anonymousId}`,
                metadata: {
                    anonymous_id: anonymousId,
                    plan_type: planType,
                    service: 'qopy'
                },
                // Disable customer email collection for true anonymity
                customer_email: undefined,
                // Allow promotion codes
                allow_promotion_codes: true,
                // Set subscription data
                subscription_data: {
                    metadata: {
                        anonymous_id: anonymousId,
                        plan_type: planType,
                        service: 'qopy'
                    }
                }
            });

            this.logInfo(`Created payment session for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            return {
                sessionId: session.id,
                sessionUrl: session.url,
                customerId: customerData.customerId,
                anonymousId: anonymousId,
                planType: planType,
                amount: plan.price
            };

        } catch (error) {
            this.logError('Failed to create payment session', error);
            throw error;
        }
    }

    /**
     * Handle successful payment completion
     */
    async handlePaymentSuccess(sessionId, anonymousId) {
        try {
            // Retrieve the checkout session
            const session = await stripe.checkout.sessions.retrieve(sessionId, {
                expand: ['subscription', 'customer']
            });

            if (session.metadata.anonymous_id !== anonymousId) {
                throw new Error('Anonymous ID mismatch');
            }

            const subscription = session.subscription;
            const customer = session.customer;

            // Extract subscription data
            const subscriptionData = {
                anonymousId: anonymousId,
                stripeCustomerId: customer.id,
                stripeSubscriptionId: subscription.id,
                planType: session.metadata.plan_type,
                status: subscription.status,
                currentPeriodStart: new Date(subscription.current_period_start * 1000),
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                createdAt: new Date()
            };

            this.logInfo(`Payment successful for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            return subscriptionData;

        } catch (error) {
            this.logError('Failed to handle payment success', error);
            throw error;
        }
    }

    /**
     * Retrieve subscription status by anonymous ID
     */
    async getSubscriptionStatus(anonymousId) {
        try {
            if (!this.validateAnonymousId(anonymousId)) {
                throw new Error('Invalid anonymous ID format');
            }

            // Search for customer by anonymous ID in metadata
            const customers = await stripe.customers.search({
                query: `metadata['anonymous_id']:'${anonymousId}'`,
                limit: 1
            });

            if (customers.data.length === 0) {
                return {
                    exists: false,
                    anonymousId: anonymousId,
                    message: 'No subscription found'
                };
            }

            const customer = customers.data[0];
            
            // Get active subscriptions for this customer
            const subscriptions = await stripe.subscriptions.list({
                customer: customer.id,
                status: 'all',
                limit: 10
            });

            const activeSubscription = subscriptions.data.find(sub => 
                ['active', 'trialing', 'past_due'].includes(sub.status)
            );

            if (!activeSubscription) {
                return {
                    exists: true,
                    anonymousId: anonymousId,
                    customerId: customer.id,
                    status: 'inactive',
                    message: 'No active subscription'
                };
            }

            return {
                exists: true,
                anonymousId: anonymousId,
                customerId: customer.id,
                subscriptionId: activeSubscription.id,
                status: activeSubscription.status,
                planType: customer.metadata.plan_type,
                currentPeriodStart: new Date(activeSubscription.current_period_start * 1000),
                currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000),
                cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
                trialEnd: activeSubscription.trial_end ? new Date(activeSubscription.trial_end * 1000) : null
            };

        } catch (error) {
            this.logError('Failed to get subscription status', error);
            throw error;
        }
    }

    /**
     * Cancel subscription for anonymous user
     */
    async cancelSubscription(anonymousId, immediately = false) {
        try {
            if (!this.validateAnonymousId(anonymousId)) {
                throw new Error('Invalid anonymous ID format');
            }

            const statusData = await this.getSubscriptionStatus(anonymousId);
            
            if (!statusData.exists || !statusData.subscriptionId) {
                throw new Error('No active subscription found');
            }

            let canceledSubscription;
            
            if (immediately) {
                // Cancel immediately
                canceledSubscription = await stripe.subscriptions.cancel(statusData.subscriptionId);
            } else {
                // Cancel at period end
                canceledSubscription = await stripe.subscriptions.update(statusData.subscriptionId, {
                    cancel_at_period_end: true
                });
            }

            this.logInfo(`Subscription canceled for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            return {
                anonymousId: anonymousId,
                subscriptionId: canceledSubscription.id,
                status: canceledSubscription.status,
                canceledAt: immediately ? new Date() : null,
                cancelAtPeriodEnd: canceledSubscription.cancel_at_period_end,
                currentPeriodEnd: new Date(canceledSubscription.current_period_end * 1000)
            };

        } catch (error) {
            this.logError('Failed to cancel subscription', error);
            throw error;
        }
    }

    /**
     * Update payment method for anonymous user
     */
    async updatePaymentMethod(anonymousId, setupIntentId) {
        try {
            if (!this.validateAnonymousId(anonymousId)) {
                throw new Error('Invalid anonymous ID format');
            }

            const statusData = await this.getSubscriptionStatus(anonymousId);
            
            if (!statusData.exists || !statusData.subscriptionId) {
                throw new Error('No active subscription found');
            }

            // Retrieve the setup intent to get the payment method
            const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
            
            if (setupIntent.status !== 'succeeded') {
                throw new Error('Payment method setup not completed');
            }

            // Update the subscription's default payment method
            const updatedSubscription = await stripe.subscriptions.update(statusData.subscriptionId, {
                default_payment_method: setupIntent.payment_method
            });

            this.logInfo(`Payment method updated for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            return {
                anonymousId: anonymousId,
                subscriptionId: updatedSubscription.id,
                paymentMethodId: setupIntent.payment_method,
                status: 'updated'
            };

        } catch (error) {
            this.logError('Failed to update payment method', error);
            throw error;
        }
    }

    /**
     * Create setup intent for payment method updates
     */
    async createSetupIntent(anonymousId) {
        try {
            if (!this.validateAnonymousId(anonymousId)) {
                throw new Error('Invalid anonymous ID format');
            }

            const statusData = await this.getSubscriptionStatus(anonymousId);
            
            if (!statusData.exists) {
                throw new Error('No customer found');
            }

            const setupIntent = await stripe.setupIntents.create({
                customer: statusData.customerId,
                payment_method_types: ['card'],
                usage: 'off_session',
                metadata: {
                    anonymous_id: anonymousId,
                    purpose: 'payment_method_update'
                }
            });

            return {
                setupIntentId: setupIntent.id,
                clientSecret: setupIntent.client_secret,
                anonymousId: anonymousId
            };

        } catch (error) {
            this.logError('Failed to create setup intent', error);
            throw error;
        }
    }

    /**
     * Get supported plans and pricing
     */
    getSupportedPlans() {
        const plans = [];
        for (const [key, plan] of this.supportedPlans) {
            plans.push({
                id: key,
                name: plan.name,
                price: plan.price,
                priceFormatted: `$${(plan.price / 100).toFixed(2)}`,
                priceId: plan.priceId
            });
        }
        return plans;
    }

    /**
     * Validate webhook signature from Stripe
     */
    validateWebhookSignature(payload, signature) {
        try {
            const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
            if (!endpointSecret) {
                throw new Error('Webhook secret not configured');
            }

            return stripe.webhooks.constructEvent(payload, signature, endpointSecret);
        } catch (error) {
            this.logError('Invalid webhook signature', error);
            throw error;
        }
    }
}

module.exports = AnonymousPaymentService;
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

const BaseService = require('./core/BaseService');
const { Pool } = require('pg');

/**
 * SubscriptionRepository - Database operations for anonymous subscriptions
 * Handles all database interactions for the anonymous payment system
 */
class SubscriptionRepository extends BaseService {
    constructor(dbPool) {
        super('SubscriptionRepository');
        this.pool = dbPool || new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }

    /**
     * Create anonymous user record
     */
    async createAnonymousUser(anonymousId, options = {}) {
        const client = await this.pool.connect();
        try {
            const query = `
                INSERT INTO anonymous_users (anonymous_id, timezone, preferred_language, account_notes)
                VALUES ($1, $2, $3, $4)
                RETURNING id, anonymous_id, created_at, status
            `;
            
            const values = [
                anonymousId,
                options.timezone || null,
                options.preferredLanguage || null,
                options.accountNotes || null
            ];
            
            const result = await client.query(query, values);
            
            this.logInfo(`Created anonymous user: ${anonymousId.substring(0, 8)}...`);
            return result.rows[0];
            
        } catch (error) {
            this.logError('Failed to create anonymous user', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get anonymous user by anonymous ID
     */
    async getAnonymousUser(anonymousId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT id, anonymous_id, created_at, updated_at, status, 
                       timezone, preferred_language, account_notes
                FROM anonymous_users 
                WHERE anonymous_id = $1 AND status = 'active'
            `;
            
            const result = await client.query(query, [anonymousId]);
            return result.rows[0] || null;
            
        } catch (error) {
            this.logError('Failed to get anonymous user', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create subscription record
     */
    async createSubscription(subscriptionData) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Get or create anonymous user
            let user = await this.getAnonymousUser(subscriptionData.anonymousId);
            if (!user) {
                user = await this.createAnonymousUser(subscriptionData.anonymousId);
            }

            // Get plan ID
            const planQuery = 'SELECT id FROM subscription_plans WHERE plan_code = $1 AND active = true';
            const planResult = await client.query(planQuery, [subscriptionData.planType]);
            
            if (planResult.rows.length === 0) {
                throw new Error(`Plan not found: ${subscriptionData.planType}`);
            }
            
            const planId = planResult.rows[0].id;

            // Create subscription
            const subscriptionQuery = `
                INSERT INTO anonymous_subscriptions (
                    anonymous_user_id, plan_id, stripe_customer_id, stripe_subscription_id,
                    stripe_payment_method_id, status, current_period_start, current_period_end,
                    trial_start, trial_end, cancel_at_period_end
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id, created_at
            `;
            
            const subscriptionValues = [
                user.id,
                planId,
                subscriptionData.stripeCustomerId,
                subscriptionData.stripeSubscriptionId,
                subscriptionData.stripePaymentMethodId || null,
                subscriptionData.status,
                subscriptionData.currentPeriodStart,
                subscriptionData.currentPeriodEnd,
                subscriptionData.trialStart || null,
                subscriptionData.trialEnd || null,
                subscriptionData.cancelAtPeriodEnd || false
            ];
            
            const subscriptionResult = await client.query(subscriptionQuery, subscriptionValues);
            
            // Initialize usage quotas based on plan
            await this.initializeUsageQuotas(client, user.id, subscriptionResult.rows[0].id, subscriptionData.planType);
            
            await client.query('COMMIT');
            
            this.logInfo(`Created subscription for anonymous ID: ${subscriptionData.anonymousId.substring(0, 8)}...`);
            
            return {
                subscriptionId: subscriptionResult.rows[0].id,
                userId: user.id,
                anonymousId: subscriptionData.anonymousId,
                createdAt: subscriptionResult.rows[0].created_at
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            this.logError('Failed to create subscription', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Initialize usage quotas for a new subscription
     */
    async initializeUsageQuotas(client, userId, subscriptionId, planType) {
        const quotaConfigurations = {
            basic: [
                { type: 'storage_mb', limit: 100, resetPeriod: 'month' },
                { type: 'uploads_per_day', limit: 10, resetPeriod: 'day' },
                { type: 'api_calls_per_hour', limit: 100, resetPeriod: 'hour' }
            ],
            pro: [
                { type: 'storage_mb', limit: 1000, resetPeriod: 'month' },
                { type: 'uploads_per_day', limit: 100, resetPeriod: 'day' },
                { type: 'api_calls_per_hour', limit: 1000, resetPeriod: 'hour' }
            ],
            enterprise: [
                { type: 'storage_mb', limit: 10000, resetPeriod: 'month' },
                { type: 'uploads_per_day', limit: 1000, resetPeriod: 'day' },
                { type: 'api_calls_per_hour', limit: 10000, resetPeriod: 'hour' }
            ]
        };

        const quotas = quotaConfigurations[planType] || quotaConfigurations.basic;
        
        for (const quota of quotas) {
            const nextReset = this.calculateNextReset(quota.resetPeriod);
            
            const quotaQuery = `
                INSERT INTO usage_quotas (
                    anonymous_user_id, subscription_id, quota_type, 
                    quota_limit, reset_period, next_reset_at
                )
                VALUES ($1, $2, $3, $4, $5, $6)
            `;
            
            await client.query(quotaQuery, [
                userId, subscriptionId, quota.type, 
                quota.limit, quota.resetPeriod, nextReset
            ]);
        }
    }

    /**
     * Calculate next reset time based on period
     */
    calculateNextReset(resetPeriod) {
        const now = new Date();
        
        switch (resetPeriod) {
            case 'hour':
                return new Date(now.getTime() + 60 * 60 * 1000);
            case 'day':
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                return tomorrow;
            case 'week':
                const nextWeek = new Date(now);
                nextWeek.setDate(nextWeek.getDate() + (7 - nextWeek.getDay()));
                nextWeek.setHours(0, 0, 0, 0);
                return nextWeek;
            case 'month':
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                return nextMonth;
            default:
                return null; // 'never' case
        }
    }

    /**
     * Get subscription by anonymous ID
     */
    async getSubscriptionByAnonymousId(anonymousId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT 
                    asub.id as subscription_id,
                    asub.stripe_customer_id,
                    asub.stripe_subscription_id,
                    asub.stripe_payment_method_id,
                    asub.status,
                    asub.current_period_start,
                    asub.current_period_end,
                    asub.trial_start,
                    asub.trial_end,
                    asub.cancel_at_period_end,
                    asub.canceled_at,
                    asub.cancellation_reason,
                    asub.usage_data,
                    asub.created_at as subscription_created_at,
                    sp.plan_code,
                    sp.plan_name,
                    sp.price_cents,
                    sp.features,
                    au.id as user_id,
                    au.anonymous_id
                FROM anonymous_subscriptions asub
                JOIN anonymous_users au ON asub.anonymous_user_id = au.id
                JOIN subscription_plans sp ON asub.plan_id = sp.id
                WHERE au.anonymous_id = $1 
                AND au.status = 'active'
                ORDER BY asub.created_at DESC
                LIMIT 1
            `;
            
            const result = await client.query(query, [anonymousId]);
            return result.rows[0] || null;
            
        } catch (error) {
            this.logError('Failed to get subscription', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update subscription status
     */
    async updateSubscriptionStatus(stripeSubscriptionId, statusData) {
        const client = await this.pool.connect();
        try {
            const query = `
                UPDATE anonymous_subscriptions 
                SET 
                    status = $1,
                    current_period_start = $2,
                    current_period_end = $3,
                    cancel_at_period_end = $4,
                    canceled_at = $5,
                    cancellation_reason = $6,
                    updated_at = CURRENT_TIMESTAMP
                WHERE stripe_subscription_id = $7
                RETURNING id, anonymous_user_id
            `;
            
            const values = [
                statusData.status,
                statusData.currentPeriodStart,
                statusData.currentPeriodEnd,
                statusData.cancelAtPeriodEnd || false,
                statusData.canceledAt || null,
                statusData.cancellationReason || null,
                stripeSubscriptionId
            ];
            
            const result = await client.query(query, values);
            
            if (result.rows.length > 0) {
                this.logInfo(`Updated subscription status: ${stripeSubscriptionId}`);
                return result.rows[0];
            }
            
            return null;
            
        } catch (error) {
            this.logError('Failed to update subscription status', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Record payment event from webhook
     */
    async recordPaymentEvent(eventData) {
        const client = await this.pool.connect();
        try {
            // Get user ID if subscription exists
            let userId = null;
            let subscriptionId = null;
            
            if (eventData.stripeSubscriptionId) {
                const subQuery = `
                    SELECT asub.id, asub.anonymous_user_id 
                    FROM anonymous_subscriptions asub
                    WHERE asub.stripe_subscription_id = $1
                `;
                const subResult = await client.query(subQuery, [eventData.stripeSubscriptionId]);
                if (subResult.rows.length > 0) {
                    subscriptionId = subResult.rows[0].id;
                    userId = subResult.rows[0].anonymous_user_id;
                }
            }
            
            const query = `
                INSERT INTO payment_events (
                    anonymous_user_id, subscription_id, event_type, stripe_event_id,
                    amount_cents, currency, payment_method_type, payment_status,
                    event_data, processed
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (stripe_event_id) DO NOTHING
                RETURNING id
            `;
            
            const values = [
                userId,
                subscriptionId,
                eventData.eventType,
                eventData.stripeEventId,
                eventData.amountCents || null,
                eventData.currency || 'USD',
                eventData.paymentMethodType || null,
                eventData.paymentStatus || null,
                JSON.stringify(eventData.eventData || {}),
                eventData.processed || false
            ];
            
            const result = await client.query(query, values);
            
            if (result.rows.length > 0) {
                this.logInfo(`Recorded payment event: ${eventData.eventType}`);
                return result.rows[0].id;
            }
            
            return null; // Already processed (conflict)
            
        } catch (error) {
            this.logError('Failed to record payment event', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get usage quotas for anonymous user
     */
    async getUsageQuotas(anonymousId) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT 
                    uq.quota_type,
                    uq.current_usage,
                    uq.quota_limit,
                    uq.reset_period,
                    uq.last_reset_at,
                    uq.next_reset_at,
                    ROUND((uq.current_usage::decimal / uq.quota_limit::decimal) * 100, 2) as usage_percentage
                FROM usage_quotas uq
                JOIN anonymous_users au ON uq.anonymous_user_id = au.id
                WHERE au.anonymous_id = $1 
                AND uq.active = true
                AND au.status = 'active'
                ORDER BY uq.quota_type
            `;
            
            const result = await client.query(query, [anonymousId]);
            return result.rows;
            
        } catch (error) {
            this.logError('Failed to get usage quotas', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update usage quota
     */
    async updateUsageQuota(anonymousId, quotaType, usageIncrement = 1) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            
            // Check if quota needs reset
            const resetQuery = `
                UPDATE usage_quotas 
                SET 
                    current_usage = 0,
                    last_reset_at = CURRENT_TIMESTAMP,
                    next_reset_at = $1
                FROM anonymous_users au
                WHERE usage_quotas.anonymous_user_id = au.id
                AND au.anonymous_id = $2
                AND usage_quotas.quota_type = $3
                AND usage_quotas.next_reset_at IS NOT NULL
                AND usage_quotas.next_reset_at <= CURRENT_TIMESTAMP
            `;
            
            const nextReset = this.calculateNextReset('day'); // Default to daily reset
            await client.query(resetQuery, [nextReset, anonymousId, quotaType]);
            
            // Update usage
            const updateQuery = `
                UPDATE usage_quotas 
                SET 
                    current_usage = current_usage + $1,
                    updated_at = CURRENT_TIMESTAMP
                FROM anonymous_users au
                WHERE usage_quotas.anonymous_user_id = au.id
                AND au.anonymous_id = $2
                AND usage_quotas.quota_type = $3
                AND usage_quotas.active = true
                RETURNING usage_quotas.current_usage, usage_quotas.quota_limit
            `;
            
            const result = await client.query(updateQuery, [usageIncrement, anonymousId, quotaType]);
            
            await client.query('COMMIT');
            
            if (result.rows.length > 0) {
                const { current_usage, quota_limit } = result.rows[0];
                return {
                    quotaType,
                    currentUsage: current_usage,
                    quotaLimit: quota_limit,
                    remainingUsage: quota_limit - current_usage,
                    usagePercentage: Math.round((current_usage / quota_limit) * 100)
                };
            }
            
            return null;
            
        } catch (error) {
            await client.query('ROLLBACK');
            this.logError('Failed to update usage quota', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Create anonymous session
     */
    async createSession(anonymousId, sessionToken, expiresAt, options = {}) {
        const client = await this.pool.connect();
        try {
            const user = await this.getAnonymousUser(anonymousId);
            if (!user) {
                throw new Error('Anonymous user not found');
            }
            
            const query = `
                INSERT INTO anonymous_sessions (
                    anonymous_user_id, session_token, expires_at, 
                    ip_address, user_agent_hash
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, created_at
            `;
            
            const values = [
                user.id,
                sessionToken,
                expiresAt,
                options.ipAddress || null,
                options.userAgentHash || null
            ];
            
            const result = await client.query(query, values);
            
            this.logInfo(`Created session for anonymous ID: ${anonymousId.substring(0, 8)}...`);
            
            return {
                sessionId: result.rows[0].id,
                anonymousId: anonymousId,
                createdAt: result.rows[0].created_at
            };
            
        } catch (error) {
            this.logError('Failed to create session', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Validate session token
     */
    async validateSession(sessionToken) {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT 
                    asess.id as session_id,
                    asess.expires_at,
                    asess.active,
                    au.anonymous_id,
                    au.id as user_id
                FROM anonymous_sessions asess
                JOIN anonymous_users au ON asess.anonymous_user_id = au.id
                WHERE asess.session_token = $1
                AND asess.active = true
                AND asess.expires_at > CURRENT_TIMESTAMP
                AND au.status = 'active'
            `;
            
            const result = await client.query(query, [sessionToken]);
            
            if (result.rows.length > 0) {
                // Update last used timestamp
                const updateQuery = `
                    UPDATE anonymous_sessions 
                    SET last_used_at = CURRENT_TIMESTAMP 
                    WHERE id = $1
                `;
                await client.query(updateQuery, [result.rows[0].session_id]);
                
                return result.rows[0];
            }
            
            return null;
            
        } catch (error) {
            this.logError('Failed to validate session', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get subscription plans
     */
    async getSubscriptionPlans() {
        const client = await this.pool.connect();
        try {
            const query = `
                SELECT plan_code, plan_name, description, price_cents, 
                       currency, interval_type, interval_count, trial_days,
                       features, stripe_price_id
                FROM subscription_plans 
                WHERE active = true
                ORDER BY price_cents ASC
            `;
            
            const result = await client.query(query);
            return result.rows;
            
        } catch (error) {
            this.logError('Failed to get subscription plans', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Close database connection pool
     */
    async close() {
        try {
            await this.pool.end();
            this.logInfo('Database connection pool closed');
        } catch (error) {
            this.logError('Failed to close database connection pool', error);
        }
    }
}

module.exports = SubscriptionRepository;
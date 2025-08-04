/*
 * Anonymous Subscriptions Database Schema
 * 
 * This schema supports anonymous subscriptions without storing any PII.
 * Uses anonymous IDs (Mullvad-style) for user identification.
 * 
 * Copyright (C) 2025 Qopy App - Dual Licensed (AGPL-3.0 OR Commercial)
 */

-- Create extension for UUID generation if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Anonymous Users table (no PII stored)
CREATE TABLE IF NOT EXISTS anonymous_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anonymous_id VARCHAR(19) UNIQUE NOT NULL, -- Format: XXXX-XXXX-XXXX-XXXX
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    -- Metadata (no PII)
    timezone VARCHAR(50), -- Optional: user's timezone for better UX
    preferred_language VARCHAR(10), -- Optional: language preference
    account_notes TEXT -- Optional: internal notes (no PII)
);

-- Subscription Plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_code VARCHAR(50) UNIQUE NOT NULL, -- 'basic', 'pro', 'enterprise'
    plan_name VARCHAR(100) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL, -- Price in cents
    currency VARCHAR(3) DEFAULT 'USD',
    interval_type VARCHAR(20) DEFAULT 'month' CHECK (interval_type IN ('day', 'week', 'month', 'year')),
    interval_count INTEGER DEFAULT 1,
    trial_days INTEGER DEFAULT 0,
    features JSONB, -- JSON array of features
    stripe_price_id VARCHAR(100), -- Stripe Price ID
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Anonymous Subscriptions table
CREATE TABLE IF NOT EXISTS anonymous_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anonymous_user_id UUID NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    
    -- Stripe Integration
    stripe_customer_id VARCHAR(100) NOT NULL,
    stripe_subscription_id VARCHAR(100) UNIQUE NOT NULL,
    stripe_payment_method_id VARCHAR(100),
    
    -- Subscription Status
    status VARCHAR(20) NOT NULL CHECK (status IN (
        'incomplete', 'incomplete_expired', 'trialing', 'active', 
        'past_due', 'canceled', 'unpaid', 'paused'
    )),
    
    -- Billing Periods
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    
    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason VARCHAR(100),
    
    -- Usage Tracking (for quotas/limits)
    usage_data JSONB DEFAULT '{}', -- JSON object for plan-specific usage
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment Events table (for audit and webhook processing)
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anonymous_user_id UUID REFERENCES anonymous_users(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES anonymous_subscriptions(id) ON DELETE SET NULL,
    
    -- Event Details
    event_type VARCHAR(50) NOT NULL, -- 'payment_succeeded', 'payment_failed', 'subscription_created', etc.
    stripe_event_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Payment Information (no PII)
    amount_cents INTEGER,
    currency VARCHAR(3),
    payment_method_type VARCHAR(50), -- 'card', 'crypto', etc.
    payment_status VARCHAR(20),
    
    -- Event Data
    event_data JSONB, -- Full Stripe event data (sanitized)
    processed BOOLEAN DEFAULT false,
    processing_attempts INTEGER DEFAULT 0,
    last_processing_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Anonymous Sessions table (for temporary authentication)
CREATE TABLE IF NOT EXISTS anonymous_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anonymous_user_id UUID NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    
    -- Session Data
    ip_address INET, -- Optional: for security
    user_agent_hash VARCHAR(64), -- Optional: hashed user agent for security
    
    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Status
    active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Usage Quotas table (plan-based limits)
CREATE TABLE IF NOT EXISTS usage_quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anonymous_user_id UUID NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES anonymous_subscriptions(id) ON DELETE SET NULL,
    
    -- Quota Type
    quota_type VARCHAR(50) NOT NULL, -- 'storage_mb', 'uploads_per_day', 'api_calls_per_hour', etc.
    
    -- Current Usage
    current_usage BIGINT DEFAULT 0,
    quota_limit BIGINT NOT NULL,
    
    -- Reset Information
    reset_period VARCHAR(20) CHECK (reset_period IN ('hour', 'day', 'week', 'month', 'never')),
    last_reset_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    next_reset_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_anonymous_users_anonymous_id ON anonymous_users(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_status ON anonymous_users(status);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_created_at ON anonymous_users(created_at);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_code ON subscription_plans(plan_code);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(active);

CREATE INDEX IF NOT EXISTS idx_anonymous_subscriptions_user_id ON anonymous_subscriptions(anonymous_user_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_subscriptions_stripe_customer ON anonymous_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_subscriptions_stripe_subscription ON anonymous_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_subscriptions_status ON anonymous_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_anonymous_subscriptions_period_end ON anonymous_subscriptions(current_period_end);

CREATE INDEX IF NOT EXISTS idx_payment_events_user_id ON payment_events(anonymous_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_subscription_id ON payment_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_stripe_event ON payment_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_processed ON payment_events(processed);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON payment_events(created_at);

CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_user_id ON anonymous_sessions(anonymous_user_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_token ON anonymous_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_expires_at ON anonymous_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_active ON anonymous_sessions(active);

CREATE INDEX IF NOT EXISTS idx_usage_quotas_user_id ON usage_quotas(anonymous_user_id);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_subscription_id ON usage_quotas(subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_type ON usage_quotas(quota_type);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_active ON usage_quotas(active);

-- Update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_anonymous_users_updated_at 
    BEFORE UPDATE ON anonymous_users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at 
    BEFORE UPDATE ON subscription_plans 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_anonymous_subscriptions_updated_at 
    BEFORE UPDATE ON anonymous_subscriptions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_quotas_updated_at 
    BEFORE UPDATE ON usage_quotas 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default subscription plans
INSERT INTO subscription_plans (plan_code, plan_name, description, price_cents, features, stripe_price_id) 
VALUES 
    ('basic', 'Basic Plan', 'Essential features for personal use', 500, 
     '["10MB file uploads", "7-day retention", "Basic encryption", "10 shares per day"]', 
     'price_basic_monthly'),
    ('pro', 'Pro Plan', 'Advanced features for power users', 1500, 
     '["100MB file uploads", "30-day retention", "Advanced encryption", "Unlimited shares", "Custom expiration", "Password protection"]', 
     'price_pro_monthly'),
    ('enterprise', 'Enterprise Plan', 'Full-featured plan for teams', 5000, 
     '["1GB file uploads", "90-day retention", "Enterprise encryption", "Unlimited shares", "Custom branding", "API access", "Priority support"]', 
     'price_enterprise_monthly')
ON CONFLICT (plan_code) DO NOTHING;

-- Create view for active subscriptions with plan details
CREATE OR REPLACE VIEW active_subscriptions AS
SELECT 
    au.anonymous_id,
    au.id as user_id,
    sp.plan_code,
    sp.plan_name,
    sp.price_cents,
    asub.status,
    asub.current_period_start,
    asub.current_period_end,
    asub.trial_end,
    asub.cancel_at_period_end,
    asub.stripe_customer_id,
    asub.stripe_subscription_id,
    asub.usage_data,
    asub.created_at as subscription_created_at
FROM anonymous_users au
JOIN anonymous_subscriptions asub ON au.id = asub.anonymous_user_id
JOIN subscription_plans sp ON asub.plan_id = sp.id
WHERE asub.status IN ('trialing', 'active', 'past_due')
AND au.status = 'active';

-- Create view for subscription usage summary
CREATE OR REPLACE VIEW subscription_usage_summary AS
SELECT 
    au.anonymous_id,
    sp.plan_code,
    jsonb_agg(
        jsonb_build_object(
            'quota_type', uq.quota_type,
            'current_usage', uq.current_usage,
            'quota_limit', uq.quota_limit,
            'usage_percentage', ROUND((uq.current_usage::decimal / uq.quota_limit::decimal) * 100, 2)
        )
    ) as quota_usage
FROM anonymous_users au
JOIN anonymous_subscriptions asub ON au.id = asub.anonymous_user_id
JOIN subscription_plans sp ON asub.plan_id = sp.id
LEFT JOIN usage_quotas uq ON au.id = uq.anonymous_user_id AND uq.active = true
WHERE asub.status IN ('trialing', 'active', 'past_due')
AND au.status = 'active'
GROUP BY au.anonymous_id, sp.plan_code;

COMMENT ON TABLE anonymous_users IS 'Anonymous users with no PII - identified only by anonymous_id';
COMMENT ON TABLE subscription_plans IS 'Available subscription plans with features and pricing';
COMMENT ON TABLE anonymous_subscriptions IS 'User subscriptions linked to Stripe without PII';
COMMENT ON TABLE payment_events IS 'Audit log of all payment-related events from Stripe webhooks';
COMMENT ON TABLE anonymous_sessions IS 'Temporary authentication sessions for anonymous users';
COMMENT ON TABLE usage_quotas IS 'Plan-based usage limits and current consumption tracking';

COMMENT ON COLUMN anonymous_users.anonymous_id IS 'Mullvad-style anonymous ID (XXXX-XXXX-XXXX-XXXX format)';
COMMENT ON COLUMN anonymous_subscriptions.stripe_customer_id IS 'Stripe Customer ID (contains no PII in metadata)';
COMMENT ON COLUMN payment_events.stripe_event_id IS 'Unique Stripe webhook event ID for idempotency';
COMMENT ON COLUMN usage_quotas.quota_type IS 'Type of quota: storage_mb, uploads_per_day, api_calls_per_hour, etc.';
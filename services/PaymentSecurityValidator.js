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

const crypto = require('crypto');
const BaseService = require('./core/BaseService');
const { ANONYMOUS_ID_PATTERN, validateAnonymousIdFormat } = require('./utils/anonymousIdValidator');

/**
 * PaymentSecurityValidator - Security validation for anonymous payment system
 * Implements comprehensive security checks and validation for payment operations
 */
class PaymentSecurityValidator extends BaseService {
    constructor() {
        super();
        
        // Security thresholds and limits
        this.limits = {
            maxSessionsPerIP: 10,
            maxFailedAttemptsPerIP: 5,
            maxPaymentAttemptsPerHour: 3,
            maxAnonymousIdGenPerIP: 20,
            sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
            ipBlockTimeout: 60 * 60 * 1000, // 1 hour
            suspiciousActivityThreshold: 0.7
        };
        
        // Maximum entries per tracking Map to prevent unbounded growth
        this.MAX_MAP_SIZE = 10000;

        // Blocked IPs and suspicious activity tracking
        this.blockedIPs = new Map();
        this.suspiciousActivity = new Map();
        this.rateLimitTracking = new Map();
        
        // Valid anonymous ID pattern (shared utility)
        this.anonymousIdPattern = ANONYMOUS_ID_PATTERN;
        
        // Cleanup intervals
        this.startCleanupIntervals();
    }

    /**
     * Validate anonymous ID format and entropy
     */
    validateAnonymousId(anonymousId, strict = true) {
        try {
            // Basic format validation using shared utility
            const formatResult = validateAnonymousIdFormat(anonymousId);
            if (!formatResult.valid) {
                return {
                    valid: false,
                    error: formatResult.error,
                    severity: 'medium'
                };
            }
            
            if (strict) {
                // Check for suspicious patterns
                const suspiciousPatterns = this.detectSuspiciousIdPatterns(anonymousId);
                if (suspiciousPatterns.length > 0) {
                    return {
                        valid: false,
                        error: 'Anonymous ID contains suspicious patterns',
                        patterns: suspiciousPatterns,
                        severity: 'high'
                    };
                }
                
                // Check entropy
                const entropyScore = this.calculateIdEntropy(anonymousId);
                if (entropyScore < 0.7) {
                    return {
                        valid: false,
                        error: 'Anonymous ID has insufficient entropy',
                        entropy: entropyScore,
                        severity: 'high'
                    };
                }
            }
            
            return {
                valid: true,
                entropy: this.calculateIdEntropy(anonymousId)
            };
            
        } catch (error) {
            this.logError('Anonymous ID validation error', error);
            return {
                valid: false,
                error: 'Validation error occurred',
                severity: 'high'
            };
        }
    }

    /**
     * Detect suspicious patterns in anonymous IDs
     */
    detectSuspiciousIdPatterns(anonymousId) {
        const patterns = [];
        const cleanId = anonymousId.replace(/-/g, '');
        
        // Sequential characters (ABCD, 1234)
        if (this.hasSequentialPattern(cleanId)) {
            patterns.push('sequential_characters');
        }
        
        // Repeated patterns (AAAA, 1111)
        if (this.hasRepeatedPattern(cleanId)) {
            patterns.push('repeated_characters');
        }
        
        // Dictionary words or common patterns
        if (this.hasDictionaryPattern(cleanId)) {
            patterns.push('dictionary_pattern');
        }
        
        // Timestamp-like patterns
        if (this.hasTimestampPattern(cleanId)) {
            patterns.push('timestamp_pattern');
        }
        
        return patterns;
    }

    /**
     * Calculate entropy of anonymous ID
     */
    calculateIdEntropy(anonymousId) {
        const cleanId = anonymousId.replace(/-/g, '');
        const charCounts = {};
        
        // Count character frequencies
        for (const char of cleanId) {
            charCounts[char] = (charCounts[char] || 0) + 1;
        }
        
        // Calculate Shannon entropy
        const length = cleanId.length;
        let entropy = 0;
        
        for (const count of Object.values(charCounts)) {
            const probability = count / length;
            entropy -= probability * Math.log2(probability);
        }
        
        // Normalize to 0-1 scale (max entropy for our charset is ~5.02)
        return Math.min(entropy / 5.02, 1.0);
    }

    /**
     * Validate IP address for security threats
     */
    async validateIPAddress(ipAddress, operation = 'general') {
        try {
            if (!ipAddress) {
                return {
                    valid: true,
                    warnings: ['No IP address provided']
                };
            }
            
            const validation = {
                valid: true,
                blocked: false,
                warnings: [],
                rateLimited: false,
                suspiciousScore: 0
            };
            
            // Check if IP is blocked
            if (this.isIPBlocked(ipAddress)) {
                validation.valid = false;
                validation.blocked = true;
                validation.error = 'IP address is temporarily blocked';
                return validation;
            }
            
            // Check rate limits
            const rateLimitResult = this.checkRateLimit(ipAddress, operation);
            if (!rateLimitResult.allowed) {
                validation.valid = false;
                validation.rateLimited = true;
                validation.error = rateLimitResult.error;
                validation.retryAfter = rateLimitResult.retryAfter;
                return validation;
            }
            
            // Calculate suspicious activity score
            validation.suspiciousScore = this.calculateSuspiciousScore(ipAddress);
            
            if (validation.suspiciousScore > this.limits.suspiciousActivityThreshold) {
                validation.warnings.push('High suspicious activity score');
            }
            
            return validation;
            
        } catch (error) {
            this.logError('IP validation error', error);
            return {
                valid: false,
                error: 'IP validation failed',
                severity: 'high'
            };
        }
    }

    /**
     * Validate payment request for security issues
     */
    async validatePaymentRequest(req, anonymousId, planType) {
        try {
            const validation = {
                valid: true,
                warnings: [],
                securityScore: 1.0
            };
            
            // Validate anonymous ID
            const idValidation = this.validateAnonymousId(anonymousId);
            if (!idValidation.valid) {
                validation.valid = false;
                validation.error = idValidation.error;
                validation.idValidation = idValidation;
                return validation;
            }
            
            // Validate IP address
            const ipAddress = this.extractIPAddress(req);
            const ipValidation = await this.validateIPAddress(ipAddress, 'payment');
            if (!ipValidation.valid) {
                validation.valid = false;
                validation.error = ipValidation.error;
                validation.ipValidation = ipValidation;
                return validation;
            }
            
            // Validate plan type
            const validPlans = ['basic', 'pro', 'enterprise'];
            if (!validPlans.includes(planType)) {
                validation.valid = false;
                validation.error = 'Invalid plan type';
                return validation;
            }
            
            // Check for suspicious request patterns
            const requestValidation = this.validateRequestHeaders(req);
            if (!requestValidation.valid) {
                validation.warnings.push('Suspicious request headers detected');
                validation.securityScore *= 0.8;
            }
            
            // Check for automation patterns
            const automationCheck = this.detectAutomation(req, anonymousId);
            if (automationCheck.isAutomated) {
                validation.warnings.push('Potential automated request detected');
                validation.securityScore *= 0.7;
                validation.automationReasons = automationCheck.reasons;
            }
            
            // Update tracking
            this.trackPaymentRequest(ipAddress, anonymousId, planType);
            
            return validation;
            
        } catch (error) {
            this.logError('Payment request validation error', error);
            return {
                valid: false,
                error: 'Payment validation failed',
                severity: 'high'
            };
        }
    }

    /**
     * Validate session token security
     */
    validateSessionSecurity(sessionToken, ipAddress, userAgent) {
        try {
            const validation = {
                valid: true,
                warnings: []
            };
            
            // Validate token format and entropy
            if (!sessionToken || sessionToken.length < 32) {
                validation.valid = false;
                validation.error = 'Invalid session token format';
                return validation;
            }
            
            // Check token entropy
            const tokenEntropy = this.calculateTokenEntropy(sessionToken);
            if (tokenEntropy < 0.8) {
                validation.valid = false;
                validation.error = 'Session token has insufficient entropy';
                validation.entropy = tokenEntropy;
                return validation;
            }
            
            // Validate IP consistency (optional)
            if (ipAddress) {
                const ipValidation = this.validateIPAddress(ipAddress, 'session');
                if (!ipValidation.valid) {
                    validation.warnings.push('IP address validation failed');
                }
            }
            
            return validation;
            
        } catch (error) {
            this.logError('Session validation error', error);
            return {
                valid: false,
                error: 'Session validation failed'
            };
        }
    }

    /**
     * Rate limiting implementation
     */
    checkRateLimit(ipAddress, operation) {
        const key = `${ipAddress}:${operation}`;
        const now = Date.now();
        const windowSize = 60 * 60 * 1000; // 1 hour
        
        if (!this.rateLimitTracking.has(key)) {
            this.rateLimitTracking.set(key, []);
            this._enforceMapLimit(this.rateLimitTracking);
        }

        const requests = this.rateLimitTracking.get(key);

        // Remove old requests outside the window
        const validRequests = requests.filter(timestamp => (now - timestamp) < windowSize);
        this.rateLimitTracking.set(key, validRequests);
        
        // Get operation-specific limits
        const limit = this.getOperationLimit(operation);
        
        if (validRequests.length >= limit) {
            return {
                allowed: false,
                error: `Rate limit exceeded for ${operation}`,
                retryAfter: windowSize - (now - validRequests[0])
            };
        }
        
        // Record this request
        validRequests.push(now);
        
        return {
            allowed: true,
            remaining: limit - validRequests.length
        };
    }

    /**
     * Get operation-specific rate limits
     */
    getOperationLimit(operation) {
        const limits = {
            'payment': 3,
            'generate-id': 20,
            'session': 10,
            'general': 100
        };
        
        return limits[operation] || limits.general;
    }

    /**
     * Check if IP is blocked
     */
    isIPBlocked(ipAddress) {
        const blockInfo = this.blockedIPs.get(ipAddress);
        if (!blockInfo) return false;
        
        if (Date.now() > blockInfo.expiresAt) {
            this.blockedIPs.delete(ipAddress);
            return false;
        }
        
        return true;
    }

    /**
     * Block IP address temporarily
     */
    blockIP(ipAddress, reason, duration = null) {
        const blockDuration = duration || this.limits.ipBlockTimeout;
        const expiresAt = Date.now() + blockDuration;
        
        this.blockedIPs.set(ipAddress, {
            reason: reason,
            blockedAt: Date.now(),
            expiresAt: expiresAt
        });
        this._enforceMapLimit(this.blockedIPs);

        this.logWarning(`Blocked IP ${ipAddress}: ${reason}`);
    }

    /**
     * Extract IP address from request
     */
    extractIPAddress(req) {
        return req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               'unknown';
    }

    /**
     * Calculate suspicious activity score for IP
     */
    calculateSuspiciousScore(ipAddress) {
        const activity = this.suspiciousActivity.get(ipAddress);
        if (!activity) return 0;
        
        const now = Date.now();
        const recentActivity = activity.filter(event => (now - event.timestamp) < (24 * 60 * 60 * 1000));
        
        let score = 0;
        
        // Weight different types of suspicious activity
        const weights = {
            'failed_payment': 0.3,
            'invalid_id': 0.2,
            'rate_limit': 0.1,
            'automation': 0.4,
            'malicious_request': 0.5
        };
        
        for (const event of recentActivity) {
            score += weights[event.type] || 0.1;
        }
        
        return Math.min(score, 1.0);
    }

    /**
     * Record suspicious activity
     */
    recordSuspiciousActivity(ipAddress, type, details = {}) {
        if (!this.suspiciousActivity.has(ipAddress)) {
            this.suspiciousActivity.set(ipAddress, []);
            this._enforceMapLimit(this.suspiciousActivity);
        }

        const activity = this.suspiciousActivity.get(ipAddress);
        activity.push({
            type: type,
            timestamp: Date.now(),
            details: details
        });

        // Keep only recent activity (last 24 hours)
        const recent = activity.filter(event => (Date.now() - event.timestamp) < (24 * 60 * 60 * 1000));
        this.suspiciousActivity.set(ipAddress, recent);
        
        // Auto-block if too much suspicious activity
        const score = this.calculateSuspiciousScore(ipAddress);
        if (score > this.limits.suspiciousActivityThreshold) {
            this.blockIP(ipAddress, `High suspicious activity score: ${score}`);
        }
    }

    /**
     * Detect automation patterns
     */
    detectAutomation(req, anonymousId) {
        const reasons = [];
        
        // Check User-Agent
        const userAgent = req.headers['user-agent'];
        if (!userAgent || this.isSuspiciousUserAgent(userAgent)) {
            reasons.push('suspicious_user_agent');
        }
        
        // Check timing patterns (if we have previous requests)
        if (this.hasUniformTiming(req.ip, anonymousId)) {
            reasons.push('uniform_timing');
        }
        
        // Check for missing browser headers
        if (this.hasMissingBrowserHeaders(req)) {
            reasons.push('missing_browser_headers');
        }
        
        return {
            isAutomated: reasons.length >= 2,
            reasons: reasons
        };
    }

    /**
     * Helper methods for pattern detection
     */
    hasSequentialPattern(str) {
        const charset = '123456789ABCDEFGHJKMNPQRSTUVWXYZ';
        for (let i = 0; i < str.length - 2; i++) {
            const a = charset.indexOf(str[i]);
            const b = charset.indexOf(str[i + 1]);
            const c = charset.indexOf(str[i + 2]);
            
            if (a >= 0 && b >= 0 && c >= 0 && b === a + 1 && c === b + 1) {
                return true;
            }
        }
        return false;
    }

    hasRepeatedPattern(str) {
        // Check for 3+ consecutive identical characters
        return /(.)\1{2,}/.test(str);
    }

    hasDictionaryPattern(str) {
        const commonPatterns = ['TEST', 'DEMO', 'FAKE', 'NULL', 'VOID', 'TEMP'];
        return commonPatterns.some(pattern => str.includes(pattern));
    }

    hasTimestampPattern(str) {
        // Check for patterns that look like timestamps or dates
        return /20[0-9]{2}|[0-9]{8,}/.test(str);
    }

    calculateTokenEntropy(token) {
        const charCounts = {};
        for (const char of token) {
            charCounts[char] = (charCounts[char] || 0) + 1;
        }
        
        const length = token.length;
        let entropy = 0;
        
        for (const count of Object.values(charCounts)) {
            const probability = count / length;
            entropy -= probability * Math.log2(probability);
        }
        
        return Math.min(entropy / 6.0, 1.0); // Normalize for typical token charset
    }

    validateRequestHeaders(req) {
        const suspicious = [];
        
        // Check for common attack headers
        const attackHeaders = ['x-forwarded-host', 'x-originating-ip', 'x-cluster-client-ip'];
        for (const header of attackHeaders) {
            if (req.headers[header] && req.headers[header] !== req.headers['x-forwarded-for']) {
                suspicious.push(`Suspicious header: ${header}`);
            }
        }
        
        return {
            valid: suspicious.length === 0,
            issues: suspicious
        };
    }

    isSuspiciousUserAgent(userAgent) {
        const suspiciousPatterns = [
            /curl/i, /wget/i, /python/i, /bot/i, /crawler/i, /spider/i,
            /postman/i, /insomnia/i, /httpie/i
        ];
        
        return suspiciousPatterns.some(pattern => pattern.test(userAgent));
    }

    hasMissingBrowserHeaders(req) {
        const browserHeaders = ['accept', 'accept-language', 'accept-encoding'];
        return browserHeaders.some(header => !req.headers[header]);
    }

    hasUniformTiming(ip, anonymousId) {
        // This would check for suspiciously uniform timing between requests
        // Implementation would require storing request timestamps
        return false;
    }

    trackPaymentRequest(ipAddress, anonymousId, planType) {
        // Track payment patterns for analysis
        const key = `payment:${ipAddress}`;
        // Implementation would store this data for pattern analysis
    }

    /**
     * Enforce maximum size on a Map by evicting oldest entries (first inserted)
     */
    _enforceMapLimit(map) {
        if (map.size > this.MAX_MAP_SIZE) {
            const entriesToDelete = map.size - this.MAX_MAP_SIZE;
            const iterator = map.keys();
            for (let i = 0; i < entriesToDelete; i++) {
                map.delete(iterator.next().value);
            }
        }
    }

    /**
     * Clean up all intervals and tracking data
     */
    destroy() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
        if (this._suspiciousCleanupInterval) {
            clearInterval(this._suspiciousCleanupInterval);
            this._suspiciousCleanupInterval = null;
        }
        if (this._blockedIPsCleanupInterval) {
            clearInterval(this._blockedIPsCleanupInterval);
            this._blockedIPsCleanupInterval = null;
        }
        this.blockedIPs.clear();
        this.suspiciousActivity.clear();
        this.rateLimitTracking.clear();
    }

    /**
     * Start cleanup intervals
     */
    startCleanupIntervals() {
        // Clean up old rate limit data every 5 minutes
        this._cleanupInterval = setInterval(() => {
            this.cleanupRateLimitData();
        }, 5 * 60 * 1000);

        // Clean up old suspicious activity every hour
        this._suspiciousCleanupInterval = setInterval(() => {
            this.cleanupSuspiciousActivity();
        }, 60 * 60 * 1000);

        // Clean up expired IP blocks every 10 minutes
        this._blockedIPsCleanupInterval = setInterval(() => {
            this.cleanupBlockedIPs();
        }, 10 * 60 * 1000);
    }

    /**
     * Cleanup methods
     */
    cleanupRateLimitData() {
        const now = Date.now();
        const windowSize = 60 * 60 * 1000; // 1 hour
        
        for (const [key, requests] of this.rateLimitTracking.entries()) {
            const validRequests = requests.filter(timestamp => (now - timestamp) < windowSize);
            if (validRequests.length === 0) {
                this.rateLimitTracking.delete(key);
            } else {
                this.rateLimitTracking.set(key, validRequests);
            }
        }
    }

    cleanupSuspiciousActivity() {
        const now = Date.now();
        const windowSize = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [ip, activity] of this.suspiciousActivity.entries()) {
            const recentActivity = activity.filter(event => (now - event.timestamp) < windowSize);
            if (recentActivity.length === 0) {
                this.suspiciousActivity.delete(ip);
            } else {
                this.suspiciousActivity.set(ip, recentActivity);
            }
        }
    }

    cleanupBlockedIPs() {
        const now = Date.now();
        
        for (const [ip, blockInfo] of this.blockedIPs.entries()) {
            if (now > blockInfo.expiresAt) {
                this.blockedIPs.delete(ip);
            }
        }
    }
}

module.exports = PaymentSecurityValidator;
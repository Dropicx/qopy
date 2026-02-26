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

/**
 * QuickShareProtection middleware
 * Tracks failed lookups for short clip IDs and blocks IPs that exceed threshold.
 * Prevents brute-force enumeration of Quick Share IDs.
 */
class QuickShareProtection {
    constructor(options = {}) {
        this.maxFailedAttempts = options.maxFailedAttempts || 20;
        this.blockDurationMs = options.blockDurationMs || 5 * 60 * 1000; // 5 minutes
        this.cleanupIntervalMs = options.cleanupIntervalMs || 60 * 1000; // 1 minute
        this.maxClipIdLength = options.maxClipIdLength || 6;

        // Map<ip, { failures: number, blockedUntil: number | null }>
        this.tracker = new Map();
        this.cleanupTimer = null;
    }

    /**
     * Start periodic cleanup of expired entries
     */
    startCleanup() {
        if (this.cleanupTimer) return;
        this.cleanupTimer = setInterval(() => this._cleanup(), this.cleanupIntervalMs);
        // Allow the process to exit without waiting for this timer
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }

    /**
     * Stop cleanup and clear all tracked data
     */
    shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.tracker.clear();
    }

    /**
     * Remove expired block entries
     */
    _cleanup() {
        const now = Date.now();
        for (const [ip, entry] of this.tracker) {
            if (entry.blockedUntil && entry.blockedUntil < now) {
                this.tracker.delete(ip);
            }
        }
    }

    /**
     * Check if an IP is currently blocked
     */
    isBlocked(ip) {
        const entry = this.tracker.get(ip);
        if (!entry || !entry.blockedUntil) return false;
        if (entry.blockedUntil < Date.now()) {
            this.tracker.delete(ip);
            return false;
        }
        return true;
    }

    /**
     * Record a failed lookup for an IP
     */
    recordFailure(ip) {
        const entry = this.tracker.get(ip) || { failures: 0, blockedUntil: null };
        entry.failures += 1;
        if (entry.failures >= this.maxFailedAttempts) {
            entry.blockedUntil = Date.now() + this.blockDurationMs;
        }
        this.tracker.set(ip, entry);
    }

    /**
     * Reset failure count on successful lookup
     */
    recordSuccess(ip) {
        this.tracker.delete(ip);
    }

    /**
     * Express middleware factory
     * @param {Function} getClientIP - Function to extract client IP from request
     * @returns {Function} Express middleware
     */
    middleware(getClientIP) {
        this.startCleanup();

        return (req, res, next) => {
            // Only apply to clip retrieval routes with short IDs
            const clipIdMatch = req.path.match(/^\/api\/clip\/([A-Za-z0-9]+)/);
            if (!clipIdMatch || clipIdMatch[1].length > this.maxClipIdLength) {
                return next();
            }

            const ip = getClientIP(req);

            // Check if IP is blocked
            if (this.isBlocked(ip)) {
                return res.status(429).json({
                    error: 'Too many failed attempts',
                    message: 'You have been temporarily blocked due to excessive failed lookups. Please try again later.'
                });
            }

            // Intercept the response to track success/failure
            const originalJson = res.json.bind(res);
            res.json = (body) => {
                if (res.statusCode === 404) {
                    this.recordFailure(ip);
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    this.recordSuccess(ip);
                }
                return originalJson(body);
            };

            next();
        };
    }
}

module.exports = QuickShareProtection;

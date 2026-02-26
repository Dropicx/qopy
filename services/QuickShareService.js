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

/**
 * QuickShareService
 * Handles Quick Share specific logic and settings
 */
class QuickShareService {
    
    /**
     * Apply Quick Share overrides to settings
     * @param {Object} settings - Original settings
     * @returns {Object} Modified settings for Quick Share
     */
    static applyQuickShareSettings(settings) {
        if (!settings || !settings.quickShare) {
            return settings;
        }

        // Quick Share Mode: Override settings
        return {
            ...settings,
            expiration: '5min',  // Always 5 minutes for Quick Share
            hasPassword: false,  // No password protection for Quick Share
            // Keep oneTime setting from user (don't override)
        };
    }

    /**
     * Update Quick Share statistics
     * @param {Function} updateStatistics - Statistics update function
     * @param {Object} settings - Share settings
     * @returns {Promise} Statistics update promises
     */
    static async updateQuickShareStatistics(updateStatistics, settings) {
        const promises = [];

        if (settings.quickShare) {
            promises.push(updateStatistics('quick_share_created'));
        } else if (settings.hasPassword) {
            promises.push(updateStatistics('password_protected_created'));
        } else {
            promises.push(updateStatistics('normal_created'));
        }
        
        if (settings.oneTime) {
            promises.push(updateStatistics('one_time_created'));
        }

        await Promise.all(promises);
    }

    /**
     * Prepare response data for Quick Share
     * @param {Object} params - Response parameters
     * @returns {Object} Response data
     */
    static prepareQuickShareResponse(params) {
        const { clipId, req, expirationTime, oneTime, quickShare } = params;

        return {
            success: true,
            clipId: clipId,
            url: `${req.protocol}://${req.get('host')}/clip/${clipId}`,
            expiresAt: expirationTime,
            oneTime: oneTime || false,
            quickShare: quickShare || false
        };
    }

    /**
     * Check if settings indicate Quick Share mode
     * @param {Object} settings - Share settings
     * @returns {boolean} Whether this is a Quick Share
     */
    static isQuickShare(settings) {
        return Boolean(settings && settings.quickShare);
    }
}

module.exports = QuickShareService;
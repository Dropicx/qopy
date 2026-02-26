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

const { body, validationResult } = require('express-validator');

/**
 * ShareValidationMiddleware
 * Validation middleware for share endpoint
 */
class ShareValidationMiddleware {
    
    /**
     * Get validation rules for share endpoint
     * @returns {Array} Array of validation middleware
     */
    static getValidationRules() {
        return [
            body('content').custom((value) => {
                // Validate content as binary array or string
                if (Array.isArray(value)) {
                    // New format: binary array
                    if (value.length === 0) {
                        throw new Error('Content cannot be empty');
                    }
                    if (value.length > 400000) {
                        throw new Error('Content too large (max 400KB)');
                    }
                    // Validate all elements are numbers
                    if (!value.every(item => typeof item === 'number' && item >= 0 && item <= 255)) {
                        throw new Error('Invalid binary data format');
                    }
                    return true;
                } else if (typeof value === 'string') {
                    // Text content or base64 string
                    if (value.length === 0) {
                        throw new Error('Content cannot be empty');
                    }
                    if (value.length > 400000) {
                        throw new Error('Content too large (max 400KB)');
                    }
                    return true;
                } else {
                    throw new Error('Content must be an array or string');
                }
            }),
            body('expiration')
                .isIn(['5min', '15min', '30min', '1hr', '6hr', '24hr'])
                .withMessage('Invalid expiration time'),
            body('hasPassword')
                .optional()
                .isBoolean()
                .withMessage('hasPassword must be a boolean'),
            body('oneTime')
                .optional()
                .isBoolean()
                .withMessage('oneTime must be a boolean'),
            body('quickShare')
                .optional()
                .isBoolean()
                .withMessage('quickShare must be a boolean'),
            body('contentType')
                .optional()
                .isIn(['text', 'binary'])
                .withMessage('contentType must be text or binary')
        ];
    }

    /**
     * Middleware to handle validation errors
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    static handleValidationErrors(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }
        next();
    }

    /**
     * Get complete validation middleware array
     * @returns {Array} Complete validation middleware
     */
    static getMiddleware() {
        return [
            ...this.getValidationRules(),
            this.handleValidationErrors
        ];
    }
}

module.exports = ShareValidationMiddleware;
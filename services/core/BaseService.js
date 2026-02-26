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
 * Base service class providing common functionality
 * Implements shared patterns and utilities for all services
 */
class BaseService {
    constructor(logger = console, validator = null) {
        this.logger = logger;
        this.validator = validator;
        this.name = this.constructor.name;
        this.startTime = Date.now();
        this.metrics = {
            operations: 0,
            errors: 0,
            successes: 0
        };
    }

    /**
     * Log information with service context
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    log(message, context = {}) {
        this.logger.log(`[${this.name}] ${message}`, {
            ...context,
            service: this.name,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log informational message with service context
     * @param {string} message - Info message
     * @param {Object} context - Additional context
     */
    logInfo(message, context = {}) {
        this.logger.log(`[${this.name}] INFO: ${message}`, {
            ...context,
            service: this.name,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log warning with service context
     * @param {string} message - Warning message
     * @param {Object} context - Additional context
     */
    logWarning(message, context = {}) {
        const logFn = this.logger.warn || this.logger.log;
        logFn.call(this.logger, `[${this.name}] WARNING: ${message}`, {
            ...context,
            service: this.name,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log error with service context
     * @param {string} message - Error message
     * @param {Error|Object} error - Error object or context
     */
    logError(message, error = {}) {
        this.metrics.errors++;
        this.logger.error(`[${this.name}] ❌ ${message}`, {
            error: error.message || error,
            stack: error.stack,
            service: this.name,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log success with service context
     * @param {string} message - Success message
     * @param {Object} context - Additional context
     */
    logSuccess(message, context = {}) {
        this.metrics.successes++;
        this.logger.log(`[${this.name}] ✅ ${message}`, {
            ...context,
            service: this.name,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Execute operation with error handling and metrics
     * @param {string} operationName - Name of the operation
     * @param {Function} operation - Operation to execute
     * @param {Object} context - Operation context
     * @returns {Promise<any>} - Operation result
     */
    async executeOperation(operationName, operation, context = {}) {
        const startTime = Date.now();
        this.metrics.operations++;

        try {
            this.log(`Starting ${operationName}`, context);
            const result = await operation();
            const duration = Date.now() - startTime;
            
            this.logSuccess(`Completed ${operationName} in ${duration}ms`, {
                ...context,
                duration
            });
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.logError(`Failed ${operationName} after ${duration}ms`, {
                ...error,
                ...context,
                duration
            });
            throw error;
        }
    }

    /**
     * Validate input parameters
     * @param {Object} params - Parameters to validate
     * @param {Object} schema - Validation schema
     * @returns {Promise<boolean>} - True if valid
     * @throws {Error} If validation fails
     */
    async validateParams(params, schema) {
        if (!this.validator) {
            this.log('No validator configured, skipping validation');
            return true;
        }

        try {
            return await this.validator.validate(params, schema);
        } catch (error) {
            this.logError('Parameter validation failed', error);
            throw new Error(`Invalid parameters: ${error.message}`);
        }
    }

    /**
     * Get service metrics
     * @returns {Object} - Service metrics
     */
    getMetrics() {
        const uptime = Date.now() - this.startTime;
        const successRate = this.metrics.operations > 0 
            ? (this.metrics.successes / this.metrics.operations) * 100 
            : 0;

        return {
            service: this.name,
            uptime,
            operations: this.metrics.operations,
            successes: this.metrics.successes,
            errors: this.metrics.errors,
            successRate: Math.round(successRate * 100) / 100,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Create standardized error response
     * @param {string} message - Error message
     * @param {string} code - Error code
     * @param {Object} details - Additional error details
     * @returns {Error} - Standardized error
     */
    createError(message, code = 'INTERNAL_ERROR', details = {}) {
        const error = new Error(message);
        error.code = code;
        error.service = this.name;
        error.details = details;
        error.timestamp = new Date().toISOString();
        return error;
    }

    /**
     * Create standardized success response
     * @param {any} data - Response data
     * @param {string} message - Success message
     * @param {Object} metadata - Additional metadata
     * @returns {Object} - Standardized response
     */
    createResponse(data, message = 'Operation successful', metadata = {}) {
        return {
            success: true,
            message,
            data,
            metadata: {
                ...metadata,
                service: this.name,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Handle graceful shutdown
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.log('Shutting down service', this.getMetrics());
        // Override in child classes for cleanup
    }
}

module.exports = BaseService;
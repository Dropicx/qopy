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

const { EventEmitter } = require('events');
const BaseService = require('./BaseService');

/**
 * Service Registry for managing service lifecycle and health
 * Implements service discovery, health monitoring, and lifecycle management
 */
class ServiceRegistry extends EventEmitter {
    constructor(logger = console) {
        super();
        this.logger = logger;
        this.services = new Map();
        this.healthChecks = new Map();
        this.startTime = Date.now();
        this.healthCheckInterval = null;
        this.healthCheckFrequency = 30000; // 30 seconds
    }

    /**
     * Register a service with health monitoring
     * @param {string} name - Service name
     * @param {Object} service - Service instance
     * @param {Object} options - Registration options
     * @returns {Promise<void>}
     */
    async register(name, service, options = {}) {
        if (this.services.has(name)) {
            throw new Error(`Service '${name}' is already registered`);
        }

        const registration = {
            name,
            service,
            registeredAt: Date.now(),
            status: 'registered',
            version: options.version || '1.0.0',
            tags: options.tags || [],
            metadata: options.metadata || {},
            healthCheck: options.healthCheck || null,
            lastHealthCheck: null,
            healthStatus: 'unknown',
            errors: [],
            metrics: {
                requests: 0,
                successes: 0,
                failures: 0,
                avgResponseTime: 0
            }
        };

        this.services.set(name, registration);

        // Set up health check if provided
        if (options.healthCheck) {
            this.setupHealthCheck(name, options.healthCheck);
        }

        // Start the service if it has a start method
        if (typeof service.start === 'function') {
            try {
                await service.start();
                registration.status = 'running';
                this.logger.log(`[ServiceRegistry] Service '${name}' started successfully`);
            } catch (error) {
                registration.status = 'failed';
                registration.errors.push({
                    message: error.message,
                    timestamp: Date.now()
                });
                this.logger.error(`[ServiceRegistry] Failed to start service '${name}':`, error);
                throw error;
            }
        } else {
            registration.status = 'running';
        }

        this.emit('serviceRegistered', { name, service: registration });
        this.logger.log(`[ServiceRegistry] ✅ Service '${name}' registered successfully`);
    }

    /**
     * Unregister a service
     * @param {string} name - Service name
     * @returns {Promise<void>}
     */
    async unregister(name) {
        const registration = this.services.get(name);
        if (!registration) {
            throw new Error(`Service '${name}' is not registered`);
        }

        // Stop the service if it has a stop method
        if (typeof registration.service.stop === 'function') {
            try {
                await registration.service.stop();
                this.logger.log(`[ServiceRegistry] Service '${name}' stopped successfully`);
            } catch (error) {
                this.logger.error(`[ServiceRegistry] Error stopping service '${name}':`, error);
            }
        }

        // Remove health check
        if (this.healthChecks.has(name)) {
            clearInterval(this.healthChecks.get(name));
            this.healthChecks.delete(name);
        }

        this.services.delete(name);
        this.emit('serviceUnregistered', { name });
        this.logger.log(`[ServiceRegistry] Service '${name}' unregistered`);
    }

    /**
     * Get a service by name
     * @param {string} name - Service name
     * @returns {Object|null} - Service instance or null
     */
    getService(name) {
        const registration = this.services.get(name);
        return registration ? registration.service : null;
    }

    /**
     * Get service registration info
     * @param {string} name - Service name
     * @returns {Object|null} - Service registration info
     */
    getServiceInfo(name) {
        const registration = this.services.get(name);
        if (!registration) {
            return null;
        }

        return {
            name: registration.name,
            status: registration.status,
            version: registration.version,
            tags: registration.tags,
            metadata: registration.metadata,
            registeredAt: registration.registeredAt,
            healthStatus: registration.healthStatus,
            lastHealthCheck: registration.lastHealthCheck,
            uptime: Date.now() - registration.registeredAt,
            metrics: { ...registration.metrics },
            errorCount: registration.errors.length,
            recentErrors: registration.errors.slice(-5)
        };
    }

    /**
     * List all registered services
     * @param {Object} filters - Optional filters
     * @returns {Array<Object>} - List of service info
     */
    listServices(filters = {}) {
        const services = Array.from(this.services.keys()).map(name => this.getServiceInfo(name));
        
        let filtered = services;

        if (filters.status) {
            filtered = filtered.filter(s => s.status === filters.status);
        }

        if (filters.tag) {
            filtered = filtered.filter(s => s.tags.includes(filters.tag));
        }

        if (filters.healthStatus) {
            filtered = filtered.filter(s => s.healthStatus === filters.healthStatus);
        }

        return filtered;
    }

    /**
     * Set up health check for a service
     * @param {string} name - Service name
     * @param {Function} healthCheckFn - Health check function
     * @private
     */
    setupHealthCheck(name, healthCheckFn) {
        const interval = setInterval(async () => {
            await this.performHealthCheck(name, healthCheckFn);
        }, this.healthCheckFrequency);

        this.healthChecks.set(name, interval);

        // Perform initial health check
        setImmediate(() => this.performHealthCheck(name, healthCheckFn));
    }

    /**
     * Perform health check for a service
     * @param {string} name - Service name
     * @param {Function} healthCheckFn - Health check function
     * @private
     */
    async performHealthCheck(name, healthCheckFn) {
        const registration = this.services.get(name);
        if (!registration) {
            return;
        }

        const startTime = Date.now();
        
        try {
            const result = await healthCheckFn(registration.service);
            const responseTime = Date.now() - startTime;

            registration.lastHealthCheck = Date.now();
            registration.healthStatus = result.healthy ? 'healthy' : 'unhealthy';
            
            if (result.healthy) {
                registration.metrics.successes++;
            } else {
                registration.metrics.failures++;
                registration.errors.push({
                    message: result.message || 'Health check failed',
                    timestamp: Date.now()
                });
            }

            registration.metrics.requests++;
            registration.metrics.avgResponseTime = 
                (registration.metrics.avgResponseTime + responseTime) / 2;

            this.emit('healthCheckCompleted', {
                name,
                healthy: result.healthy,
                responseTime,
                message: result.message
            });

        } catch (error) {
            registration.lastHealthCheck = Date.now();
            registration.healthStatus = 'error';
            registration.metrics.failures++;
            registration.errors.push({
                message: error.message,
                timestamp: Date.now()
            });

            this.emit('healthCheckError', { name, error });
            this.logger.error(`[ServiceRegistry] Health check failed for service '${name}':`, error);
        }
    }

    /**
     * Start periodic health checks for all services
     */
    startHealthChecks() {
        if (this.healthCheckInterval) {
            return;
        }

        this.healthCheckInterval = setInterval(() => {
            this.emit('healthCheckCycle', { timestamp: Date.now() });
        }, this.healthCheckFrequency);

        this.logger.log(`[ServiceRegistry] Health checks started (every ${this.healthCheckFrequency}ms)`);
    }

    /**
     * Stop periodic health checks
     */
    stopHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        for (const interval of this.healthChecks.values()) {
            clearInterval(interval);
        }
        this.healthChecks.clear();

        this.logger.log('[ServiceRegistry] Health checks stopped');
    }

    /**
     * Get registry metrics and status
     * @returns {Object} - Registry metrics
     */
    getMetrics() {
        const services = this.listServices();
        const healthyCount = services.filter(s => s.healthStatus === 'healthy').length;
        const unhealthyCount = services.filter(s => s.healthStatus === 'unhealthy').length;
        const errorCount = services.filter(s => s.healthStatus === 'error').length;

        const totalRequests = services.reduce((sum, s) => sum + s.metrics.requests, 0);
        const totalSuccesses = services.reduce((sum, s) => sum + s.metrics.successes, 0);
        const totalFailures = services.reduce((sum, s) => sum + s.metrics.failures, 0);
        const avgResponseTime = services.reduce((sum, s) => sum + s.metrics.avgResponseTime, 0) / services.length;

        return {
            registry: {
                uptime: Date.now() - this.startTime,
                totalServices: services.length,
                healthyServices: healthyCount,
                unhealthyServices: unhealthyCount,
                errorServices: errorCount,
                healthChecksEnabled: !!this.healthCheckInterval
            },
            aggregateMetrics: {
                totalRequests,
                totalSuccesses,
                totalFailures,
                successRate: totalRequests > 0 ? (totalSuccesses / totalRequests) * 100 : 0,
                avgResponseTime: Math.round(avgResponseTime * 100) / 100
            },
            services: services.map(s => ({
                name: s.name,
                status: s.status,
                healthStatus: s.healthStatus,
                uptime: s.uptime,
                requests: s.metrics.requests,
                successRate: s.metrics.requests > 0 ? 
                    (s.metrics.successes / s.metrics.requests) * 100 : 0
            })),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Graceful shutdown of all services
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.logger.log('[ServiceRegistry] Shutting down all services...');
        
        this.stopHealthChecks();
        
        const shutdownPromises = [];
        
        for (const [name, registration] of this.services.entries()) {
            if (typeof registration.service.shutdown === 'function') {
                shutdownPromises.push(
                    registration.service.shutdown().catch(error => {
                        this.logger.error(`[ServiceRegistry] Error shutting down service '${name}':`, error);
                    })
                );
            }
        }

        await Promise.all(shutdownPromises);
        
        this.services.clear();
        this.emit('registryShutdown');
        this.logger.log('[ServiceRegistry] ✅ All services shut down successfully');
    }
}

module.exports = ServiceRegistry;
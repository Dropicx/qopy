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

const CryptoService = require('./CryptoService');
const NetworkService = require('./NetworkService');

/**
 * Service Factory for dependency injection and service management
 * Implements the Factory pattern with singleton registry
 */
class ServiceFactory {
    constructor(config = {}) {
        this.config = config;
        this.services = new Map();
        this.logger = config.logger || console;
        this.validator = config.validator || null;
        this.initialized = false;
    }

    /**
     * Initialize the service factory with configuration
     * @param {Object} factoryConfig - Factory configuration
     * @returns {Promise<void>}
     */
    async initialize(factoryConfig = {}) {
        if (this.initialized) {
            this.logger.warn('[ServiceFactory] Already initialized, skipping...');
            return;
        }

        this.config = { ...this.config, ...factoryConfig };
        
        this.logger.log('[ServiceFactory] Initializing service factory...', {
            services: Object.keys(this.config.services || {}),
            timestamp: new Date().toISOString()
        });

        // Pre-register default services
        await this.registerDefaultServices();
        
        this.initialized = true;
        this.logger.log('[ServiceFactory] ✅ Service factory initialized successfully');
    }

    /**
     * Register default services with their configurations
     * @private
     */
    async registerDefaultServices() {
        const defaultServices = {
            crypto: {
                class: CryptoService,
                config: this.config.crypto || {},
                singleton: true
            },
            network: {
                class: NetworkService,
                config: this.config.network || {},
                singleton: true
            }
        };

        for (const [name, serviceConfig] of Object.entries(defaultServices)) {
            this.registerService(name, serviceConfig);
        }
    }

    /**
     * Register a service with the factory
     * @param {string} name - Service name
     * @param {Object} serviceConfig - Service configuration
     */
    registerService(name, serviceConfig) {
        if (this.services.has(name)) {
            this.logger.warn(`[ServiceFactory] Service '${name}' already registered, overriding...`);
        }

        const config = {
            class: serviceConfig.class,
            config: serviceConfig.config || {},
            singleton: serviceConfig.singleton !== false, // Default to singleton
            instance: null,
            dependencies: serviceConfig.dependencies || []
        };

        this.services.set(name, config);
        
        this.logger.log(`[ServiceFactory] Registered service: ${name}`, {
            singleton: config.singleton,
            dependencies: config.dependencies
        });
    }

    /**
     * Create or retrieve a service instance
     * @param {string} name - Service name
     * @param {Object} overrideConfig - Configuration overrides
     * @returns {Promise<Object>} - Service instance
     */
    async getService(name, overrideConfig = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        const serviceConfig = this.services.get(name);
        if (!serviceConfig) {
            throw new Error(`Service '${name}' not registered`);
        }

        // Return singleton instance if exists
        if (serviceConfig.singleton && serviceConfig.instance) {
            return serviceConfig.instance;
        }

        // Resolve dependencies first
        const dependencies = await this.resolveDependencies(serviceConfig.dependencies);

        // Create new instance
        const finalConfig = { ...serviceConfig.config, ...overrideConfig };
        const instance = new serviceConfig.class(
            this.logger,
            this.validator,
            finalConfig,
            ...dependencies
        );

        // Initialize service if it has an init method
        if (typeof instance.initialize === 'function') {
            await instance.initialize();
        }

        // Store singleton instance
        if (serviceConfig.singleton) {
            serviceConfig.instance = instance;
        }

        this.logger.log(`[ServiceFactory] Created service instance: ${name}`, {
            singleton: serviceConfig.singleton,
            className: serviceConfig.class.name
        });

        return instance;
    }

    /**
     * Resolve service dependencies
     * @param {Array<string>} dependencies - Dependency names
     * @returns {Promise<Array>} - Resolved dependencies
     * @private
     */
    async resolveDependencies(dependencies) {
        const resolved = [];
        
        for (const dependency of dependencies) {
            try {
                const service = await this.getService(dependency);
                resolved.push(service);
            } catch (error) {
                throw new Error(`Failed to resolve dependency '${dependency}': ${error.message}`);
            }
        }

        return resolved;
    }

    /**
     * Create service instance without registration (factory method)
     * @param {Function} ServiceClass - Service class
     * @param {Object} config - Service configuration
     * @param {Array} dependencies - Service dependencies
     * @returns {Promise<Object>} - Service instance
     */
    async createService(ServiceClass, config = {}, dependencies = []) {
        const resolvedDependencies = await this.resolveDependencies(dependencies);
        
        const instance = new ServiceClass(
            this.logger,
            this.validator,
            config,
            ...resolvedDependencies
        );

        if (typeof instance.initialize === 'function') {
            await instance.initialize();
        }

        return instance;
    }

    /**
     * Get all registered service names
     * @returns {Array<string>} - Service names
     */
    getRegisteredServices() {
        return Array.from(this.services.keys());
    }

    /**
     * Check if a service is registered
     * @param {string} name - Service name
     * @returns {boolean} - True if registered
     */
    hasService(name) {
        return this.services.has(name);
    }

    /**
     * Get service registration info
     * @param {string} name - Service name
     * @returns {Object|null} - Service registration info
     */
    getServiceInfo(name) {
        const serviceConfig = this.services.get(name);
        if (!serviceConfig) {
            return null;
        }

        return {
            name,
            className: serviceConfig.class.name,
            singleton: serviceConfig.singleton,
            hasInstance: !!serviceConfig.instance,
            dependencies: serviceConfig.dependencies,
            config: Object.keys(serviceConfig.config)
        };
    }

    /**
     * Shutdown all services gracefully
     * @returns {Promise<void>}
     */
    async shutdown() {
        this.logger.log('[ServiceFactory] Shutting down all services...');
        
        const shutdownPromises = [];
        
        for (const [name, serviceConfig] of this.services.entries()) {
            if (serviceConfig.instance && typeof serviceConfig.instance.shutdown === 'function') {
                shutdownPromises.push(
                    serviceConfig.instance.shutdown().catch(error => {
                        this.logger.error(`[ServiceFactory] Error shutting down service '${name}':`, error);
                    })
                );
            }
        }

        await Promise.all(shutdownPromises);
        
        // Clear all instances
        for (const serviceConfig of this.services.values()) {
            serviceConfig.instance = null;
        }

        this.initialized = false;
        this.logger.log('[ServiceFactory] ✅ All services shut down successfully');
    }

    /**
     * Clear all registered services
     */
    clear() {
        this.services.clear();
        this.initialized = false;
        this.logger.log('[ServiceFactory] Service registry cleared');
    }

    /**
     * Get factory metrics and status
     * @returns {Object} - Factory metrics
     */
    getMetrics() {
        const services = Array.from(this.services.entries()).map(([name, config]) => ({
            name,
            className: config.class.name,
            singleton: config.singleton,
            hasInstance: !!config.instance,
            dependencies: config.dependencies.length
        }));

        return {
            initialized: this.initialized,
            totalServices: this.services.size,
            activeInstances: services.filter(s => s.hasInstance).length,
            services,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Default service factory instance (singleton)
 */
let defaultFactory = null;

/**
 * Get the default service factory instance
 * @param {Object} config - Factory configuration
 * @returns {ServiceFactory} - Default factory instance
 */
function getDefaultFactory(config = {}) {
    if (!defaultFactory) {
        defaultFactory = new ServiceFactory(config);
    }
    return defaultFactory;
}

/**
 * Create a new service factory instance
 * @param {Object} config - Factory configuration
 * @returns {ServiceFactory} - New factory instance
 */
function createFactory(config = {}) {
    return new ServiceFactory(config);
}

module.exports = {
    ServiceFactory,
    getDefaultFactory,
    createFactory
};
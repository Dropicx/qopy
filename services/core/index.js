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
 * Core Services Module
 * Provides centralized access to all core services with proper dependency injection
 */

// Base classes and interfaces
const BaseService = require('./BaseService');
const ICryptoService = require('../interfaces/ICryptoService');
const INetworkService = require('../interfaces/INetworkService');

// Core services
const CryptoService = require('./CryptoService');
const NetworkService = require('./NetworkService');

// Service management
const { ServiceFactory, getDefaultFactory, createFactory } = require('./ServiceFactory');
const ServiceRegistry = require('./ServiceRegistry');

/**
 * Initialize core services with default configuration
 * @param {Object} config - Service configuration
 * @returns {Promise<Object>} - Initialized services
 */
async function initializeCoreServices(config = {}) {
    const logger = config.logger || console;
    const validator = config.validator || null;

    logger.log('[CoreServices] Initializing core services...');

    // Create service factory with configuration
    const factory = createFactory({
        logger,
        validator,
        crypto: config.crypto || {},
        network: config.network || {}
    });

    // Initialize factory
    await factory.initialize();

    // Create service registry for health monitoring
    const registry = new ServiceRegistry(logger);

    // Get service instances
    const cryptoService = await factory.getService('crypto');
    const networkService = await factory.getService('network');

    // Register services with health monitoring
    await registry.register('crypto', cryptoService, {
        version: '2.0.0',
        tags: ['encryption', 'security', 'zero-knowledge'],
        healthCheck: async (service) => {
            try {
                const metrics = service.getMetrics();
                return {
                    healthy: metrics.errors < 10, // Arbitrary threshold
                    message: `Operations: ${metrics.operations}, Success rate: ${metrics.successRate}%`
                };
            } catch (error) {
                return { healthy: false, message: error.message };
            }
        }
    });

    await registry.register('network', networkService, {
        version: '2.0.0',
        tags: ['upload', 'download', 'streaming', 'resumable'],
        healthCheck: async (service) => {
            try {
                const metrics = service.getMetrics();
                return {
                    healthy: metrics.errors < 5,
                    message: `Operations: ${metrics.operations}, Success rate: ${metrics.successRate}%`
                };
            } catch (error) {
                return { healthy: false, message: error.message };
            }
        }
    });

    // Start health monitoring
    registry.startHealthChecks();

    logger.log('[CoreServices] ✅ Core services initialized successfully');

    return {
        factory,
        registry,
        services: {
            crypto: cryptoService,
            network: networkService
        },
        // Utility methods
        async shutdown() {
            logger.log('[CoreServices] Shutting down core services...');
            await registry.shutdown();
            await factory.shutdown();
            logger.log('[CoreServices] ✅ Core services shut down successfully');
        },
        getMetrics() {
            return {
                factory: factory.getMetrics(),
                registry: registry.getMetrics(),
                timestamp: new Date().toISOString()
            };
        }
    };
}

/**
 * Create a lightweight service container for testing
 * @param {Object} config - Test configuration
 * @returns {Promise<Object>} - Test service container
 */
async function createTestContainer(config = {}) {
    const logger = config.logger || { log: () => {}, error: () => {}, warn: () => {} };
    
    const factory = createFactory({
        logger,
        validator: config.validator || null,
        crypto: { ...config.crypto, algorithm: 'aes-256-gcm' },
        network: { ...config.network, maxFileSize: 10 * 1024 * 1024 } // 10MB for tests
    });

    await factory.initialize();

    return {
        factory,
        crypto: await factory.getService('crypto'),
        network: await factory.getService('network'),
        async cleanup() {
            await factory.shutdown();
        }
    };
}

// Export everything
module.exports = {
    // Base classes and interfaces
    BaseService,
    ICryptoService,
    INetworkService,
    
    // Core services
    CryptoService,
    NetworkService,
    
    // Service management
    ServiceFactory,
    ServiceRegistry,
    getDefaultFactory,
    createFactory,
    
    // Initialization helpers
    initializeCoreServices,
    createTestContainer
};
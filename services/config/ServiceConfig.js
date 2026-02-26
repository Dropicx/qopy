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
 * Service Configuration Management
 * Provides centralized configuration for all core services
 */

const path = require('path');

/**
 * Default service configurations following SOLID principles
 */
const DEFAULT_CONFIG = {
    // Crypto Service Configuration
    crypto: {
        algorithm: 'aes-256-gcm',
        keyDerivation: 'pbkdf2',
        iterations: 100000,
        keyLength: 32,
        saltLength: 16,
        ivLength: 12,
        tagLength: 16,
        strategies: {
            'zero-knowledge': { enabled: true, priority: 1 },
            'quick-share': { enabled: true, priority: 2 },
            'password-protected': { enabled: true, priority: 3 },
            'url-secret': { enabled: true, priority: 4 }
        }
    },

    // Network Service Configuration
    network: {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        chunkSize: 1024 * 1024, // 1MB
        maxConcurrentUploads: 10,
        uploadTimeout: 300000, // 5 minutes
        downloadTimeout: 60000, // 1 minute
        tempPath: './temp',
        enableCompression: true,
        compressionLevel: 6,
        retryAttempts: 3,
        retryDelay: 1000
    },

    // Service Factory Configuration
    factory: {
        enableMetrics: true,
        enableHealthChecks: true,
        shutdownTimeout: 30000,
        dependencyTimeout: 10000
    },

    // Service Registry Configuration
    registry: {
        healthCheckFrequency: 30000, // 30 seconds
        maxErrorHistory: 100,
        enableEventLogging: true,
        gracefulShutdownTimeout: 15000
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'json',
        enableConsole: true,
        enableFile: false,
        maxFiles: 5,
        maxSize: '10m'
    },

    // Validation Configuration
    validation: {
        strictMode: true,
        enableTypeChecking: true,
        maxValidationErrors: 10,
        customValidators: {}
    }
};

/**
 * Environment-specific configurations
 */
const ENVIRONMENT_CONFIGS = {
    development: {
        crypto: {
            iterations: 10000 // Faster for development
        },
        network: {
            maxFileSize: 50 * 1024 * 1024, // 50MB
            uploadTimeout: 120000 // 2 minutes
        },
        logging: {
            level: 'debug',
            enableConsole: true
        },
        validation: {
            strictMode: false
        }
    },

    test: {
        crypto: {
            iterations: 1000 // Much faster for tests
        },
        network: {
            maxFileSize: 10 * 1024 * 1024, // 10MB
            uploadTimeout: 30000, // 30 seconds
            tempPath: './test-temp'
        },
        registry: {
            healthCheckFrequency: 5000 // 5 seconds
        },
        logging: {
            level: 'warn',
            enableConsole: false
        }
    },

    production: {
        crypto: {
            iterations: 150000 // More secure for production
        },
        network: {
            maxFileSize: 500 * 1024 * 1024, // 500MB
            uploadTimeout: 600000, // 10 minutes
            enableCompression: true
        },
        logging: {
            level: 'info',
            enableFile: true,
            enableConsole: false
        },
        validation: {
            strictMode: true
        }
    }
};

/**
 * Service Configuration Manager
 */
class ServiceConfig {
    constructor(environment = null) {
        this.environment = environment || process.env.NODE_ENV || 'development';
        this.config = this.mergeConfigs();
        this.customConfig = {};
    }

    /**
     * Merge default and environment-specific configurations
     * @private
     */
    mergeConfigs() {
        const envConfig = ENVIRONMENT_CONFIGS[this.environment] || {};
        return this.deepMerge(DEFAULT_CONFIG, envConfig);
    }

    /**
     * Deep merge configuration objects
     * @param {Object} target - Target configuration
     * @param {Object} source - Source configuration
     * @returns {Object} - Merged configuration
     * @private
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    /**
     * Get configuration for a specific service
     * @param {string} serviceName - Service name
     * @returns {Object} - Service configuration
     */
    getServiceConfig(serviceName) {
        const serviceConfig = this.config[serviceName] || {};
        const customServiceConfig = this.customConfig[serviceName] || {};
        
        return this.deepMerge(serviceConfig, customServiceConfig);
    }

    /**
     * Get complete configuration
     * @returns {Object} - Complete configuration
     */
    getConfig() {
        return this.deepMerge(this.config, this.customConfig);
    }

    /**
     * Set custom configuration
     * @param {string} path - Configuration path (e.g., 'crypto.iterations')
     * @param {any} value - Configuration value
     */
    set(path, value) {
        const pathParts = path.split('.');
        let current = this.customConfig;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
        
        current[pathParts[pathParts.length - 1]] = value;
    }

    /**
     * Get configuration value by path
     * @param {string} path - Configuration path
     * @returns {any} - Configuration value
     */
    get(path) {
        const pathParts = path.split('.');
        let current = this.getConfig();
        
        for (const part of pathParts) {
            if (current && typeof current === 'object') {
                current = current[part];
            } else {
                return undefined;
            }
        }
        
        return current;
    }

    /**
     * Validate configuration
     * @returns {Object} - Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];
        
        // Validate crypto configuration
        const cryptoConfig = this.getServiceConfig('crypto');
        if (cryptoConfig.iterations < 1000) {
            warnings.push('Crypto iterations less than 1000 may be insecure');
        }
        if (cryptoConfig.keyLength < 16) {
            errors.push('Crypto key length must be at least 16 bytes');
        }

        // Validate network configuration
        const networkConfig = this.getServiceConfig('network');
        if (networkConfig.maxFileSize <= 0) {
            errors.push('Network max file size must be positive');
        }
        if (networkConfig.chunkSize <= 0) {
            errors.push('Network chunk size must be positive');
        }

        // Validate paths
        if (networkConfig.tempPath && !path.isAbsolute(networkConfig.tempPath)) {
            // Convert relative path to absolute
            const absolutePath = path.resolve(process.cwd(), networkConfig.tempPath);
            this.set('network.tempPath', absolutePath);
            warnings.push(`Converted relative temp path to absolute: ${absolutePath}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            environment: this.environment
        };
    }

    /**
     * Load configuration from file
     * @param {string} filePath - Configuration file path
     * @returns {Promise<void>}
     */
    async loadFromFile(filePath) {
        try {
            const fileConfig = require(path.resolve(filePath));
            this.customConfig = this.deepMerge(this.customConfig, fileConfig);
        } catch (error) {
            throw new Error(`Failed to load configuration from ${filePath}: ${error.message}`);
        }
    }

    /**
     * Save configuration to file
     * @param {string} filePath - Output file path
     * @returns {Promise<void>}
     */
    async saveToFile(filePath) {
        const fs = require('fs').promises;
        const configToSave = {
            environment: this.environment,
            config: this.getConfig(),
            generatedAt: new Date().toISOString()
        };
        
        await fs.writeFile(
            path.resolve(filePath),
            JSON.stringify(configToSave, null, 2),
            'utf8'
        );
    }

    /**
     * Create configuration for specific environment
     * @param {string} environment - Target environment
     * @returns {ServiceConfig} - New configuration instance
     */
    forEnvironment(environment) {
        return new ServiceConfig(environment);
    }

    /**
     * Get configuration summary
     * @returns {Object} - Configuration summary
     */
    getSummary() {
        const config = this.getConfig();
        
        return {
            environment: this.environment,
            services: Object.keys(config),
            cryptoAlgorithm: config.crypto?.algorithm,
            maxFileSize: config.network?.maxFileSize,
            healthChecksEnabled: config.registry?.healthCheckFrequency > 0,
            loggingLevel: config.logging?.level,
            validationStrictMode: config.validation?.strictMode,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Create service configuration instance
 * @param {string} environment - Environment name
 * @returns {ServiceConfig} - Configuration instance
 */
function createServiceConfig(environment) {
    return new ServiceConfig(environment);
}

/**
 * Get default service configuration
 * @returns {Object} - Default configuration
 */
function getDefaultConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

module.exports = {
    ServiceConfig,
    createServiceConfig,
    getDefaultConfig,
    DEFAULT_CONFIG,
    ENVIRONMENT_CONFIGS
};
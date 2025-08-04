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

const crypto = require('crypto');
const ICryptoService = require('../interfaces/ICryptoService');
const BaseService = require('./BaseService');

/**
 * Core cryptographic service implementing zero-knowledge encryption
 * Supports multiple encryption strategies and access control patterns
 */
class CryptoService extends BaseService {
    constructor(logger, validator, config = {}) {
        super(logger, validator);
        
        this.config = {
            algorithm: config.algorithm || 'aes-256-gcm',
            keyDerivation: config.keyDerivation || 'pbkdf2',
            iterations: config.iterations || 100000,
            keyLength: config.keyLength || 32,
            saltLength: config.saltLength || 16,
            ivLength: config.ivLength || 12,
            tagLength: config.tagLength || 16,
            ...config
        };

        this.strategies = new Map();
        this.initializeStrategies();
    }

    /**
     * Initialize encryption strategies
     * @private
     */
    initializeStrategies() {
        this.strategies.set('zero-knowledge', new ZeroKnowledgeStrategy(this.config));
        this.strategies.set('quick-share', new QuickShareStrategy(this.config));
        this.strategies.set('password-protected', new PasswordProtectedStrategy(this.config));
        this.strategies.set('url-secret', new UrlSecretStrategy(this.config));
    }

    /**
     * Process access code and encryption settings
     * @param {Object} session - Upload session data
     * @param {Object} requestData - Parsed request data
     * @returns {Promise<Object>} - Encryption configuration
     */
    async processAccessCode(session, requestData) {
        return this.executeOperation('processAccessCode', async () => {
            const { quickShareSecret, clientAccessCodeHash, requiresAccessCode } = requestData;
            
            // Validate input parameters
            await this.validateParams({ session, requestData }, {
                session: { required: true, type: 'object' },
                requestData: { required: true, type: 'object' }
            });

            this.log('Processing access code configuration', {
                uploadId: session.upload_id,
                sessionHasPassword: session.has_password,
                isQuickShare: session.quick_share,
                hasQuickShareSecret: !!quickShareSecret,
                hasClientAccessCodeHash: !!clientAccessCodeHash,
                requiresAccessCode: requiresAccessCode
            });

            let strategy;
            let config = {};

            // Determine encryption strategy based on request data
            if (session.quick_share && quickShareSecret) {
                strategy = this.strategies.get('quick-share');
                config = await strategy.processAccessCode(session, { quickShareSecret });
            } else if (requiresAccessCode && clientAccessCodeHash) {
                strategy = this.strategies.get('password-protected');
                config = await strategy.processAccessCode(session, { clientAccessCodeHash });
            } else {
                strategy = this.strategies.get('url-secret');
                config = await strategy.processAccessCode(session, {});
            }

            // Add strategy metadata
            config.strategy = strategy.name;
            config.zeroKnowledge = true;

            this.logSuccess('Access code processed successfully', {
                uploadId: session.upload_id,
                strategy: config.strategy,
                requiresAccessCode: config.shouldRequireAccessCode
            });

            return config;
        });
    }

    /**
     * Create file metadata for secure system
     * @param {string} uploadId - Upload ID
     * @param {Object} session - Upload session
     * @param {number} actualFilesize - Actual file size
     * @returns {Promise<Object>} - File metadata
     */
    async createFileMetadata(uploadId, session, actualFilesize) {
        return this.executeOperation('createFileMetadata', async () => {
            await this.validateParams({ uploadId, session, actualFilesize }, {
                uploadId: { required: true, type: 'string' },
                session: { required: true, type: 'object' },
                actualFilesize: { required: true, type: 'number' }
            });

            const metadata = {
                uploadId,
                originalFileSize: session.filesize,
                actualFileSize: actualFilesize,
                originalUploadSession: true,
                zeroKnowledge: true,
                encryptionVersion: '2.0',
                created: new Date().toISOString(),
                service: this.name
            };

            this.log('File metadata created', metadata);
            return metadata;
        });
    }

    /**
     * Generate encryption key based on strategy
     * @param {Object} options - Key generation options
     * @returns {Promise<string>} - Generated encryption key
     */
    async generateKey(options = {}) {
        return this.executeOperation('generateKey', async () => {
            const {
                password,
                salt = crypto.randomBytes(this.config.saltLength),
                iterations = this.config.iterations
            } = options;

            if (!password) {
                throw this.createError('Password is required for key generation', 'INVALID_INPUT');
            }

            const key = crypto.pbkdf2Sync(
                password,
                salt,
                iterations,
                this.config.keyLength,
                'sha256'
            );

            return {
                key: key.toString('hex'),
                salt: salt.toString('hex'),
                iterations
            };
        });
    }

    /**
     * Encrypt content using the selected strategy
     * @param {Buffer|string} content - Content to encrypt
     * @param {Object} options - Encryption options
     * @returns {Promise<Buffer>} - Encrypted content
     */
    async encrypt(content, options = {}) {
        return this.executeOperation('encrypt', async () => {
            const { strategy = 'zero-knowledge', key, metadata = {} } = options;
            
            const encryptionStrategy = this.strategies.get(strategy);
            if (!encryptionStrategy) {
                throw this.createError(`Unknown encryption strategy: ${strategy}`, 'INVALID_STRATEGY');
            }

            const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
            return await encryptionStrategy.encrypt(contentBuffer, { key, metadata });
        });
    }

    /**
     * Decrypt content using the selected strategy
     * @param {Buffer} encryptedContent - Content to decrypt
     * @param {Object} options - Decryption options
     * @returns {Promise<Buffer>} - Decrypted content
     */
    async decrypt(encryptedContent, options = {}) {
        return this.executeOperation('decrypt', async () => {
            const { strategy = 'zero-knowledge', key, metadata = {} } = options;
            
            const encryptionStrategy = this.strategies.get(strategy);
            if (!encryptionStrategy) {
                throw this.createError(`Unknown encryption strategy: ${strategy}`, 'INVALID_STRATEGY');
            }

            return await encryptionStrategy.decrypt(encryptedContent, { key, metadata });
        });
    }

    /**
     * Validate encryption configuration
     * @param {Object} config - Encryption configuration
     * @returns {Promise<boolean>} - True if valid
     */
    async validateConfig(config) {
        return this.executeOperation('validateConfig', async () => {
            const requiredFields = ['strategy'];
            
            for (const field of requiredFields) {
                if (!config[field]) {
                    throw this.createError(`Missing required field: ${field}`, 'INVALID_CONFIG');
                }
            }

            const strategy = this.strategies.get(config.strategy);
            if (!strategy) {
                throw this.createError(`Invalid strategy: ${config.strategy}`, 'INVALID_STRATEGY');
            }

            return true;
        });
    }
}

/**
 * Base encryption strategy class
 */
class EncryptionStrategy {
    constructor(config) {
        this.config = config;
        this.name = this.constructor.name;
    }

    async processAccessCode(session, data) {
        throw new Error('processAccessCode method must be implemented');
    }

    async encrypt(content, options) {
        throw new Error('encrypt method must be implemented');
    }

    async decrypt(content, options) {
        throw new Error('decrypt method must be implemented');
    }
}

/**
 * Zero-knowledge encryption strategy
 * All encryption happens client-side, server only stores encrypted data
 */
class ZeroKnowledgeStrategy extends EncryptionStrategy {
    async processAccessCode(session, data) {
        return {
            passwordHash: null,
            accessCodeHash: null,
            shouldRequireAccessCode: false,
            strategy: 'zero-knowledge'
        };
    }

    async encrypt(content, options) {
        // In zero-knowledge mode, content is already encrypted client-side
        return content;
    }

    async decrypt(content, options) {
        // In zero-knowledge mode, decryption happens client-side
        return content;
    }
}

/**
 * Quick share strategy with server-side secret
 */
class QuickShareStrategy extends EncryptionStrategy {
    async processAccessCode(session, data) {
        const { quickShareSecret } = data;
        
        if (!quickShareSecret) {
            throw new Error('Quick share secret is required');
        }

        return {
            passwordHash: quickShareSecret,
            accessCodeHash: null,
            shouldRequireAccessCode: false,
            strategy: 'quick-share'
        };
    }

    async encrypt(content, options) {
        const { key } = options;
        if (!key) {
            throw new Error('Encryption key is required for quick share');
        }

        const iv = crypto.randomBytes(this.config.ivLength);
        const cipher = crypto.createCipher(this.config.algorithm, key);
        
        const encrypted = Buffer.concat([
            cipher.update(content),
            cipher.final()
        ]);

        return Buffer.concat([iv, encrypted]);
    }

    async decrypt(content, options) {
        const { key } = options;
        if (!key) {
            throw new Error('Decryption key is required for quick share');
        }

        const iv = content.slice(0, this.config.ivLength);
        const encrypted = content.slice(this.config.ivLength);
        
        const decipher = crypto.createDecipher(this.config.algorithm, key);
        
        return Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);
    }
}

/**
 * Password-protected strategy with client-side hashing
 */
class PasswordProtectedStrategy extends EncryptionStrategy {
    async processAccessCode(session, data) {
        const { clientAccessCodeHash } = data;
        
        if (!clientAccessCodeHash) {
            throw new Error('Client access code hash is required');
        }

        return {
            passwordHash: 'client-encrypted',
            accessCodeHash: clientAccessCodeHash,
            shouldRequireAccessCode: true,
            strategy: 'password-protected'
        };
    }

    async encrypt(content, options) {
        // Content is encrypted client-side with user password
        return content;
    }

    async decrypt(content, options) {
        // Content is decrypted client-side with user password
        return content;
    }
}

/**
 * URL secret strategy for client-side encryption
 */
class UrlSecretStrategy extends EncryptionStrategy {
    async processAccessCode(session, data) {
        return {
            passwordHash: null,
            accessCodeHash: null,
            shouldRequireAccessCode: false,
            strategy: 'url-secret'
        };
    }

    async encrypt(content, options) {
        // Content is encrypted client-side with URL secret
        return content;
    }

    async decrypt(content, options) {
        // Content is decrypted client-side with URL secret
        return content;
    }
}

module.exports = CryptoService;
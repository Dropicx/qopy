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
 * Interface for cryptographic operations
 * Defines the contract for all encryption strategies
 */
class ICryptoService {
    /**
     * Process access code and encryption settings
     * @param {Object} session - Upload session data
     * @param {Object} requestData - Parsed request data
     * @returns {Promise<Object>} - Encryption configuration
     * @throws {Error} If encryption processing fails
     */
    async processAccessCode(session, requestData) {
        throw new Error('processAccessCode method must be implemented');
    }

    /**
     * Create file metadata for secure system
     * @param {string} uploadId - Upload ID
     * @param {Object} session - Upload session
     * @param {number} actualFilesize - Actual file size
     * @returns {Promise<Object>} - File metadata
     * @throws {Error} If metadata creation fails
     */
    async createFileMetadata(uploadId, session, actualFilesize) {
        throw new Error('createFileMetadata method must be implemented');
    }

    /**
     * Generate encryption key based on strategy
     * @param {Object} options - Key generation options
     * @returns {Promise<string>} - Generated encryption key
     * @throws {Error} If key generation fails
     */
    async generateKey(options) {
        throw new Error('generateKey method must be implemented');
    }

    /**
     * Encrypt content using the selected strategy
     * @param {Buffer|string} content - Content to encrypt
     * @param {Object} options - Encryption options
     * @returns {Promise<Buffer>} - Encrypted content
     * @throws {Error} If encryption fails
     */
    async encrypt(content, options) {
        throw new Error('encrypt method must be implemented');
    }

    /**
     * Decrypt content using the selected strategy
     * @param {Buffer} encryptedContent - Content to decrypt
     * @param {Object} options - Decryption options
     * @returns {Promise<Buffer>} - Decrypted content
     * @throws {Error} If decryption fails
     */
    async decrypt(encryptedContent, options) {
        throw new Error('decrypt method must be implemented');
    }

    /**
     * Validate encryption configuration
     * @param {Object} config - Encryption configuration
     * @returns {Promise<boolean>} - True if valid
     * @throws {Error} If validation fails
     */
    async validateConfig(config) {
        throw new Error('validateConfig method must be implemented');
    }
}

module.exports = ICryptoService;
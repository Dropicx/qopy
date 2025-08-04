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
 * ContentProcessor Service
 * Handles content validation, processing, and type detection
 */
class ContentProcessor {
    
    /**
     * Validate content based on format and size limits
     * @param {*} content - Content to validate (array, string, etc.)
     * @returns {Object} Validation result
     */
    static validateContent(content) {
        if (Array.isArray(content)) {
            // New format: binary array
            if (content.length === 0) {
                return { valid: false, error: 'Content cannot be empty' };
            }
            if (content.length > 400000) {
                return { valid: false, error: 'Content too large (max 400KB)' };
            }
            // Validate all elements are numbers
            if (!content.every(item => typeof item === 'number' && item >= 0 && item <= 255)) {
                return { valid: false, error: 'Invalid binary data format' };
            }
            return { valid: true };
        } else if (typeof content === 'string') {
            // Text content or base64 string
            if (content.length === 0) {
                return { valid: false, error: 'Content cannot be empty' };
            }
            if (content.length > 400000) {
                return { valid: false, error: 'Content too large (max 400KB)' };
            }
            return { valid: true };
        } else {
            return { valid: false, error: 'Content must be an array or string' };
        }
    }

    /**
     * Process content based on type and detect format
     * @param {*} content - Content to process
     * @param {string} contentType - Content type ('text' or 'binary')
     * @returns {Object} Processed content with metadata
     */
    static processContent(content, contentType = 'text') {
        let processedContent;
        let mimeType = 'text/plain';
        let filesize = 0;

        try {
            if (contentType === 'text' && typeof content === 'string') {
                // Text content - check if it's base64 encoded encrypted data
                try {
                    // Try to decode as base64 first
                    const decoded = Buffer.from(content, 'base64');
                    // If it's valid base64, treat as encrypted binary data
                    if (decoded.length > 0) {
                        processedContent = decoded; // Store as buffer for encrypted data
                        filesize = decoded.length;
                        mimeType = 'application/octet-stream'; // Mark as binary for encrypted content
                        contentType = 'binary'; // Override to binary since it's encrypted
                    } else {
                        // Empty base64, treat as plain text
                        processedContent = content;
                        filesize = Buffer.from(content, 'utf-8').length;
                        mimeType = 'text/plain; charset=utf-8';
                    }
                } catch (base64Error) {
                    // Not valid base64, treat as plain text
                    processedContent = content;
                    filesize = Buffer.from(content, 'utf-8').length;
                    mimeType = 'text/plain; charset=utf-8';
                }
            } else if (Array.isArray(content)) {
                // Binary content: raw bytes array from client
                processedContent = Buffer.from(content);
                filesize = processedContent.length;
                mimeType = 'application/octet-stream';
            } else if (typeof content === 'string') {
                // Check if this is base64 encoded binary or plain text
                try {
                    // Try to decode as base64 first
                    const decoded = Buffer.from(content, 'base64');
                    // If it's valid base64 and looks like binary data, treat as binary
                    if (decoded.length > 0 && !decoded.toString('utf-8').match(/^[\x00-\x7F]*$/)) {
                        processedContent = decoded;
                        filesize = processedContent.length;
                        mimeType = 'application/octet-stream';
                    } else {
                        // Treat as plain text
                        processedContent = content;
                        filesize = Buffer.from(content, 'utf-8').length;
                        mimeType = 'text/plain; charset=utf-8';
                        contentType = 'text'; // Override content type
                    }
                } catch (base64Error) {
                    // Not valid base64, treat as plain text
                    processedContent = content;
                    filesize = Buffer.from(content, 'utf-8').length;
                    mimeType = 'text/plain; charset=utf-8';
                    contentType = 'text'; // Override content type
                }
            } else {
                throw new Error('Invalid content format');
            }

            return {
                success: true,
                processedContent,
                mimeType,
                filesize,
                contentType
            };
            
        } catch (error) {
            console.error('❌ Error processing content:', error);
            return {
                success: false,
                error: 'Invalid content format',
                message: 'Content must be valid text or binary data.'
            };
        }
    }

    /**
     * Check if content should be stored as file (>1MB threshold)
     * @param {Buffer|string} processedContent - Processed content
     * @returns {boolean} Whether to store as file
     */
    static shouldStoreAsFile(processedContent) {
        return processedContent.length > 1024 * 1024; // 1MB threshold
    }

    /**
     * Validate content exists and is not empty
     * @param {*} content - Content to validate
     * @returns {Object} Validation result
     */
    static validateContentExists(content) {
        if (!content || (typeof content === 'string' && content.trim().length === 0)) {
            return {
                valid: false,
                error: 'Invalid content',
                message: 'Content is required.'
            };
        }
        return { valid: true };
    }
}

module.exports = ContentProcessor;
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

const ContentProcessor = require('./ContentProcessor');
const StorageService = require('./StorageService');
const QuickShareService = require('./QuickShareService');
const ShareValidationMiddleware = require('./ShareValidationMiddleware');

/**
 * RefactoredShareEndpoint
 * Clean, service-based implementation of the share endpoint
 * 
 * This is the refactored version of the deprecated /api/share endpoint
 * that was replaced by the unified upload system (/api/upload/initiate + /api/upload/complete)
 */
class RefactoredShareEndpoint {
    
    constructor(pool, STORAGE_PATH, generateClipId, generateUploadId, updateStatistics) {
        this.storageService = new StorageService(pool, STORAGE_PATH, generateUploadId);
        this.generateClipId = generateClipId;
        this.updateStatistics = updateStatistics;
    }

    /**
     * Get the validation middleware for the endpoint
     * @returns {Array} Validation middleware array
     */
    getValidationMiddleware() {
        return ShareValidationMiddleware.getMiddleware();
    }

    /**
     * Handle the share endpoint request
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async handleShareRequest(req, res) {
        try {
            // Extract and validate input
            let { content, expiration, hasPassword, oneTime, quickShare, quickShareSecret, contentType = 'text' } = req.body;

            // Apply Quick Share settings override
            const settings = QuickShareService.applyQuickShareSettings({
                content, expiration, hasPassword, oneTime, quickShare, quickShareSecret, contentType
            });

            // Update variables with processed settings
            ({ expiration, hasPassword, oneTime } = settings);

            // Validate content exists
            const contentExistsValidation = ContentProcessor.validateContentExists(content);
            if (!contentExistsValidation.valid) {
                return res.status(400).json({
                    error: contentExistsValidation.error,
                    message: contentExistsValidation.message
                });
            }

            // Process content
            const contentResult = ContentProcessor.processContent(content, contentType);
            if (!contentResult.success) {
                return res.status(400).json({
                    error: contentResult.error,
                    message: contentResult.message
                });
            }

            const { processedContent, mimeType, filesize } = contentResult;
            contentType = contentResult.contentType; // Use updated content type

            // Calculate expiration time
            const expirationTime = this.storageService.calculateExpirationTime(expiration);
            const clipId = this.generateClipId(quickShare);

            // Handle password hash
            const passwordResult = this.storageService.determinePasswordHash(quickShare, quickShareSecret, hasPassword);
            if (passwordResult.error) {
                return res.status(400).json({
                    error: passwordResult.error,
                    message: passwordResult.message
                });
            }
            const { passwordHash } = passwordResult;

            // Determine storage method
            const shouldStoreAsFile = ContentProcessor.shouldStoreAsFile(processedContent);

            // Store the clip
            const storageResult = await this.storageService.storeClip({
                processedContent,
                clipId,
                contentType,
                mimeType,
                filesize,
                expirationTime,
                passwordHash,
                oneTime,
                shouldStoreAsFile
            });

            if (storageResult.error) {
                return res.status(500).json({
                    error: storageResult.error,
                    message: storageResult.message
                });
            }

            // Update statistics
            await this.updateStatistics('clip_created');
            await QuickShareService.updateQuickShareStatistics(this.updateStatistics, {
                quickShare, hasPassword, oneTime
            });

            // Prepare and send response
            const response = QuickShareService.prepareQuickShareResponse({
                clipId, req, expirationTime, oneTime, quickShare
            });

            res.json(response);

        } catch (error) {
            console.error('❌ Error creating clip:', error.message);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to create clip'
            });
        }
    }

    /**
     * Create the complete endpoint with middleware
     * @param {Object} app - Express app instance
     */
    createEndpoint(app) {
        // DEPRECATED: /api/share endpoint - replaced by upload system (/api/upload/initiate + /api/upload/complete)
        // This endpoint is no longer used since all text sharing now uses the unified file upload system
        /*
        app.post('/api/share', 
            this.getValidationMiddleware(),
            (req, res) => this.handleShareRequest(req, res)
        );
        */
    }
}

module.exports = RefactoredShareEndpoint;
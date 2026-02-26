const TokenService = require('./TokenService');

/**
 * AccessValidator - Handles access validation logic for clips
 */
class AccessValidator {
    constructor(pool) {
        this.pool = pool;
        this.tokenService = new TokenService();
    }

    /**
     * Check if clip requires access code
     * @param {string} clipId - The clip ID
     * @returns {Promise<Object>} - Validation result
     */
    async checkAccessRequirement(clipId) {
        try {
            const result = await this.pool.query(
                'SELECT requires_access_code FROM clips WHERE clip_id = $1 AND is_expired = false',
                [clipId]
            );
            
            return {
                exists: result.rows.length > 0,
                requiresAccess: result.rows.length > 0 && result.rows[0].requires_access_code
            };
        } catch (error) {
            console.error('❌ Error checking access requirement:', error);
            throw new Error('Failed to check access requirement');
        }
    }

    /**
     * Validate access code for clip
     * @param {string} clipId - The clip ID
     * @param {string} accessCode - The provided access code
     * @returns {Promise<Object>} - Validation result
     */
    async validateAccess(clipId, accessCode) {
        try {
            // Check if 4-char clip ID is actually a quick share in the database
            if (clipId.length === 4) {
                const qsResult = await this.pool.query(
                    'SELECT quick_share FROM clips WHERE clip_id = $1 AND is_expired = false AND expiration_time > $2',
                    [clipId, Date.now()]
                );

                if (qsResult.rows.length === 0) {
                    return { valid: false, error: 'Clip not found', statusCode: 404 };
                }

                if (qsResult.rows[0].quick_share) {
                    console.log(`⚡ Quick Share download - no authentication needed for clipId: ${clipId}`);
                    return { valid: true, isQuickShare: true };
                }
                // Not a quick share — fall through to normal access code validation
            }

            console.log(`🔐 Normal clip download - checking access code for clipId: ${clipId}`);

            // Check if access code is required
            const accessRequirement = await this.checkAccessRequirement(clipId);
            
            if (!accessRequirement.exists) {
                return { valid: false, error: 'Clip not found', statusCode: 404 };
            }

            if (!accessRequirement.requiresAccess) {
                return { valid: true, isQuickShare: false };
            }

            // Access code is required
            if (!accessCode) {
                console.log(`❌ Access code required but not provided for clipId: ${clipId}`);
                return { 
                    valid: false, 
                    error: 'Access code required',
                    message: 'This file requires an access code',
                    statusCode: 401 
                };
            }

            // Validate the access code
            const validationResult = await this.pool.query(
                'SELECT access_code_hash, requires_access_code FROM clips WHERE clip_id = $1 AND is_expired = false',
                [clipId]
            );
            
            if (validationResult.rows.length === 0) {
                console.log(`❌ Clip not found for access code validation: ${clipId}`);
                return { 
                    valid: false, 
                    error: 'Clip not found',
                    message: 'The requested clip does not exist',
                    statusCode: 404 
                };
            }
            
            const clip = validationResult.rows[0];
            
            // If access code required but no hash stored, deny
            if (!clip.access_code_hash) {
                console.log(`❌ No access code hash stored for clipId: ${clipId}`);
                return { 
                    valid: false, 
                    error: 'Access denied',
                    message: 'Invalid access code configuration',
                    statusCode: 401 
                };
            }
            
            // Validate the access code using TokenService
            const isValid = await this.tokenService.validateAccessCode(accessCode, clip.access_code_hash);
            
            if (!isValid) {
                console.log(`❌ Invalid access code for file clipId: ${clipId}`);
                return { 
                    valid: false, 
                    error: 'Access denied',
                    message: 'Invalid access code',
                    statusCode: 401 
                };
            }
            
            console.log(`✅ Access code validated for file clipId: ${clipId}`);
            return { valid: true, isQuickShare: false };
            
        } catch (error) {
            console.error('❌ Error validating access:', error);
            return { 
                valid: false, 
                error: 'Internal server error',
                message: 'Failed to validate access code',
                statusCode: 500 
            };
        }
    }
}

module.exports = AccessValidator;
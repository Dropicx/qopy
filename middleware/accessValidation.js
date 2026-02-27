const AccessValidator = require('../services/AccessValidator');

/**
 * Access validation middleware for file downloads
 * @param {Object} pool - Database connection pool
 * @returns {Function} - Express middleware function
 */
function createAccessValidationMiddleware(pool) {
    const validator = new AccessValidator(pool);
    
    return async (req, res, next) => {
        try {
            const { clipId } = req.params;
            const { accessCode } = req.body;

            const validationResult = await validator.validateAccess(clipId, accessCode);
            
            if (!validationResult.valid) {
                return res.status(validationResult.statusCode || 401).json({
                    error: validationResult.error,
                    message: validationResult.message
                });
            }

            // Add validation result to request for use in route handler
            req.accessValidation = validationResult;
            next();
            
        } catch (error) {
            console.error('❌ Error in access validation middleware:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to validate access'
            });
        }
    };
}

module.exports = createAccessValidationMiddleware;
/*
 * Copyright (C) 2025 Qopy App
 *
 * Input Sanitizer Utility
 * Additional defense-in-depth layer for input validation
 *
 * Note: This is a secondary defense layer. The primary protection
 * against SQL injection comes from parameterized queries.
 */

/**
 * Sanitize input for additional security
 * Detects and logs suspicious patterns
 *
 * @param {string} input - User input to sanitize
 * @param {string} fieldName - Name of the field for logging
 * @returns {Object} - {sanitized: string, suspicious: boolean}
 */
function sanitizeInput(input, fieldName = 'unknown') {
    if (typeof input !== 'string') {
        return { sanitized: input, suspicious: false };
    }

    // SQL injection patterns to detect (for logging)
    const suspiciousPatterns = [
        /(\bOR\b.*=.*)/i,
        /(\bAND\b.*=.*)/i,
        /(\bUNION\b.*\bSELECT\b)/i,
        /(\bDROP\b.*\bTABLE\b)/i,
        /(\bINSERT\b.*\bINTO\b)/i,
        /(\bDELETE\b.*\bFROM\b)/i,
        /(\bUPDATE\b.*\bSET\b)/i,
        /(--\s*$)/,
        /(\/\*.*\*\/)/,
        /('.*OR.*'.*=.*')/i,
        /(\bEXEC\b|\bEXECUTE\b)/i,
        /(pg_sleep|waitfor|benchmark)/i
    ];

    let suspicious = false;
    let detectedPattern = null;

    // Check for suspicious patterns
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(input)) {
            suspicious = true;
            detectedPattern = pattern.toString();
            break;
        }
    }

    // Log suspicious input for security monitoring
    if (suspicious) {
        console.warn('⚠️ SECURITY: Suspicious input detected', {
            field: fieldName,
            pattern: detectedPattern,
            inputLength: input.length,
            timestamp: new Date().toISOString()
        });
    }

    // Return original input (parameterized queries handle safety)
    // but flag for monitoring
    return {
        sanitized: input,
        suspicious: suspicious
    };
}

/**
 * Validate clip ID format
 * Quick share: 4 characters
 * Enhanced: 10 characters
 *
 * @param {string} clipId - Clip ID to validate
 * @returns {boolean} - True if valid format
 */
function isValidClipId(clipId) {
    if (typeof clipId !== 'string') {
        return false;
    }

    // Quick share: exactly 4 alphanumeric characters
    const quickSharePattern = /^[a-zA-Z0-9]{4}$/;

    // Enhanced: exactly 10 alphanumeric characters
    const enhancedPattern = /^[a-zA-Z0-9]{10}$/;

    return quickSharePattern.test(clipId) || enhancedPattern.test(clipId);
}

/**
 * Validate upload ID format (UUID v4)
 *
 * @param {string} uploadId - Upload ID to validate
 * @returns {boolean} - True if valid UUID format
 */
function isValidUploadId(uploadId) {
    if (typeof uploadId !== 'string') {
        return false;
    }

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    return uuidPattern.test(uploadId);
}

/**
 * Validate expiration time format
 *
 * @param {string} expiration - Expiration string
 * @returns {boolean} - True if valid expiration
 */
function isValidExpiration(expiration) {
    const validExpirations = ['5min', '15min', '30min', '1hr', '6hr', '24hr'];
    return validExpirations.includes(expiration);
}

/**
 * Sanitize file name to prevent path traversal
 *
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
function sanitizeFilename(filename) {
    if (typeof filename !== 'string') {
        return 'untitled';
    }

    // Remove path traversal attempts
    let sanitized = filename.replace(/\.\./g, '');

    // Remove directory separators
    sanitized = sanitized.replace(/[\/\\]/g, '-');

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Limit length
    if (sanitized.length > 255) {
        const ext = sanitized.slice(sanitized.lastIndexOf('.'));
        sanitized = sanitized.slice(0, 255 - ext.length) + ext;
    }

    return sanitized || 'untitled';
}

/**
 * Check if input contains only safe characters
 *
 * @param {string} input - Input to check
 * @param {string} allowedPattern - Regex pattern for allowed characters
 * @returns {boolean} - True if input is safe
 */
function containsOnlySafeCharacters(input, allowedPattern = /^[a-zA-Z0-9\-_]+$/) {
    if (typeof input !== 'string') {
        return false;
    }

    return allowedPattern.test(input);
}

/**
 * Escape special characters for safe display
 * (Not for SQL - parameterized queries handle that)
 *
 * @param {string} input - Input to escape
 * @returns {string} - Escaped output
 */
function escapeForDisplay(input) {
    if (typeof input !== 'string') {
        return String(input);
    }

    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

module.exports = {
    sanitizeInput,
    isValidClipId,
    isValidUploadId,
    isValidExpiration,
    sanitizeFilename,
    containsOnlySafeCharacters,
    escapeForDisplay
};

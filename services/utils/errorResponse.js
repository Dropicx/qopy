/**
 * Standard error response format
 * @param {string} code - Error code (e.g., 'INVALID_INPUT', 'NOT_FOUND')
 * @param {string} message - Human-readable error message
 * @returns {{ success: false, error: { code: string, message: string } }}
 */
function errorResponse(code, message) {
    return { success: false, error: { code, message } };
}

/**
 * Standard success response format
 * @param {Object} data - Response data
 * @returns {{ success: true, ...data }}
 */
function successResponse(data = {}) {
    return { success: true, ...data };
}

module.exports = { errorResponse, successResponse };

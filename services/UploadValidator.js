/**
 * Service for validating upload requests and data
 */
class UploadValidator {
    /**
     * Parse and validate request body for different upload systems
     * @param {Object} requestBody - Express request body
     * @returns {Object} - Parsed and validated upload data
     */
    static parseUploadRequest(requestBody) {
        let clientAccessCodeHash, requiresAccessCode, textContent, isTextUpload, contentType;
        let password, urlSecret; // File upload system

        try {
            // Try new text upload system first - check for isTextUpload
            if (requestBody.accessCodeHash || requestBody.requiresAccessCode !== undefined ||
                requestBody.isTextUpload) {
                ({ accessCodeHash: clientAccessCodeHash, requiresAccessCode,
                   textContent, isTextUpload, contentType } = requestBody);
            } else {
                ({ password, urlSecret } = requestBody);
                // Convert old system to new system
                isTextUpload = false;
                contentType = 'file';
                requiresAccessCode = !!password;
                clientAccessCodeHash = password; // Use password as access code hash for legacy
            }

            return {
                clientAccessCodeHash,
                requiresAccessCode,
                textContent,
                isTextUpload,
                contentType,
                password,
                urlSecret
            };
        } catch (destructureError) {
            console.error('Error parsing upload request:', destructureError);
            throw destructureError;
        }
    }

    /**
     * Validate upload session
     * @param {Object} session - Upload session
     * @returns {Object} - Validated session with proper structure
     */
    static validateSession(session) {
        if (!session) {
            throw new Error('Upload session not found');
        }

        // Ensure session has required fields with fallbacks
        if (!session.upload_id) session.upload_id = session.id;
        if (!session.quick_share) session.quick_share = false;
        if (!session.has_password) session.has_password = false;
        if (!session.one_time) session.one_time = false;
        if (!session.is_text_content) session.is_text_content = false;
        if (!session.uploaded_chunks) session.uploaded_chunks = 0;
        if (!session.total_chunks) session.total_chunks = 1;

        // Ensure expiration_time is set (fallback to 24 hours if missing)
        if (!session.expiration_time) {
            console.warn(`Missing expiration_time for session ${session.upload_id}, using 24 hours as fallback`);
            session.expiration_time = Date.now() + (24 * 60 * 60 * 1000);
        }

        return session;
    }

    /**
     * Validate chunk completeness
     * @param {Object} session - Upload session
     * @returns {Object} - Validation result
     */
    static validateChunks(session) {
        const uploadedChunks = session.uploaded_chunks || 0;
        const totalChunks = session.total_chunks || 1;

        return {
            uploadedChunks,
            totalChunks,
            isComplete: uploadedChunks >= totalChunks
        };
    }
}

module.exports = UploadValidator;

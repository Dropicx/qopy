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
        console.log('🔍 Request body:', JSON.stringify(requestBody, null, 2));
        
        let quickShareSecret, clientAccessCodeHash, requiresAccessCode, textContent, isTextUpload, contentType;
        let password, urlSecret; // File upload system
        
        try {
            // Try new text upload system first - check for isTextUpload or quickShareSecret too
            if (requestBody.accessCodeHash || requestBody.requiresAccessCode !== undefined || 
                requestBody.isTextUpload || requestBody.quickShareSecret) {
                console.log('🔍 Using NEW text upload system');
                ({ quickShareSecret, accessCodeHash: clientAccessCodeHash, requiresAccessCode, 
                   textContent, isTextUpload, contentType } = requestBody);
            } else {
                console.log('🔍 Using OLD file upload system');
                ({ password, urlSecret } = requestBody);
                // Convert old system to new system
                isTextUpload = false;
                contentType = 'file';
                requiresAccessCode = !!password;
                clientAccessCodeHash = password; // Use password as access code hash for legacy
            }
            
            console.log('🔑 Upload complete request body:', { 
                quickShareSecret: quickShareSecret,
                hasAccessCodeHash: !!clientAccessCodeHash,
                requiresAccessCode: requiresAccessCode,
                isTextUpload: isTextUpload,
                contentType: contentType,
                fullRequestBody: requestBody
            });
            
            return {
                quickShareSecret,
                clientAccessCodeHash,
                requiresAccessCode,
                textContent,
                isTextUpload,
                contentType,
                password,
                urlSecret
            };
        } catch (destructureError) {
            console.error('❌ Error destructuring request body:', destructureError);
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

        try {
            console.log('🔑 Upload session details:', { 
                uploadId: session.upload_id, 
                quick_share: session.quick_share, 
                has_password: session.has_password,
                one_time: session.one_time,
                is_text_content: session.is_text_content,
                uploaded_chunks: session.uploaded_chunks,
                total_chunks: session.total_chunks
            });
        } catch (error) {
            console.error('❌ Error logging session details:', error);
            console.log('🔍 Session object keys:', Object.keys(session));
            console.log('🔍 Session object values:', Object.values(session));
            
            // FORCE session structure to be compatible
            if (!session.upload_id) session.upload_id = session.id;
            if (!session.quick_share) session.quick_share = false;
            if (!session.has_password) session.has_password = false;
            if (!session.one_time) session.one_time = false;
            if (!session.is_text_content) session.is_text_content = false;
            if (!session.uploaded_chunks) session.uploaded_chunks = 0;
            if (!session.total_chunks) session.total_chunks = 1;
            
            console.log('🔧 FORCED session structure:', {
                uploadId: session.upload_id,
                quick_share: session.quick_share,
                has_password: session.has_password,
                one_time: session.one_time,
                is_text_content: session.is_text_content,
                uploaded_chunks: session.uploaded_chunks,
                total_chunks: session.total_chunks
            });
        }

        // Ensure expiration_time is set (fallback to 24 hours if missing)
        if (!session.expiration_time) {
            console.warn(`⚠️ Missing expiration_time for session ${session.upload_id}, using 24 hours as fallback`);
            session.expiration_time = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
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
        
        console.log('📝 Chunk check:', { uploadedChunks, totalChunks });
        
        return {
            uploadedChunks,
            totalChunks,
            isComplete: uploadedChunks >= totalChunks
        };
    }
}

module.exports = UploadValidator;
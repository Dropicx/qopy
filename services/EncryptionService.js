/**
 * Service for handling file encryption and access code management
 */
class EncryptionService {
    /**
     * Process access code and encryption settings
     * @param {Object} session - Upload session data
     * @param {Object} requestData - Parsed request data
     * @returns {Object} - Encryption configuration
     */
    static processAccessCode(session, requestData) {
        const { quickShareSecret, clientAccessCodeHash, requiresAccessCode } = requestData;
        
        // Validate access code hash - must be non-empty, 32-128 chars (bcrypt hashes are 60 chars)
        const isValidAccessCodeHash = clientAccessCodeHash &&
            typeof clientAccessCodeHash === 'string' &&
            clientAccessCodeHash.length >= 32 &&
            clientAccessCodeHash.length <= 128;
        
        let passwordHash = null;
        let accessCodeHash = null;
        let shouldRequireAccessCode = false;
        
        try {
            console.log('🔐 Processing access code for upload:', session.upload_id);
        } catch (error) {
            console.error('❌ Error in Zero-Knowledge Access Code Analysis:', error);
        }
        
        try {
            if (session.quick_share && quickShareSecret) {
                // Quick Share: Store secret in password_hash field (legacy compatibility)
                console.log('🔑 Setting Quick Share secret for upload:', session.upload_id);
                passwordHash = quickShareSecret;
                accessCodeHash = null;
                shouldRequireAccessCode = false;
            } else if (requiresAccessCode && isValidAccessCodeHash) {
                // Normal Share with Password: Use client-generated access code hash
                console.log('🔐 Using client-side access code hash (Zero-Knowledge):', session.upload_id);
                accessCodeHash = clientAccessCodeHash;
                shouldRequireAccessCode = true; // FORCE TRUE
                passwordHash = 'client-encrypted'; // Mark as client-encrypted for legacy compatibility
                console.log('🔐 Access code hash stored for upload:', session.upload_id);
            } else {
                console.log('🔐 No access code provided for upload:', session.upload_id);
                passwordHash = null;
                accessCodeHash = null;
                shouldRequireAccessCode = false;
            }
        } catch (error) {
            console.error('❌ Error in upload logic:', error);
            throw error;
        }

        // NEW: Zero-Knowledge File System - No download tokens needed
        // All authentication happens via access codes, URL secrets remain client-side
        console.log('🔐 Zero-Knowledge File System: No download tokens needed');

        // FORCE requiresAccessCode to boolean
        if (requiresAccessCode && isValidAccessCodeHash) {
            shouldRequireAccessCode = true;
        }

        return {
            passwordHash,
            accessCodeHash,
            shouldRequireAccessCode
        };
    }

    /**
     * Create file metadata for zero-knowledge system
     * @param {string} uploadId - Upload ID
     * @param {Object} session - Upload session
     * @param {number} actualFilesize - Actual file size
     * @returns {Object} - File metadata
     */
    static createFileMetadata(uploadId, session, actualFilesize) {
        const fileMetadata = {
            uploadId,
            originalUploadSession: true,
            originalFileSize: Number(session?.filesize ?? session?.file_size ?? actualFilesize), // Store original size in metadata
            actualFileSize: actualFilesize,
            // No downloadToken - using Zero-Knowledge access code system
            zeroKnowledge: true
        };

        console.log('📝 File metadata created for upload:', uploadId);
        return fileMetadata;
    }
}

module.exports = EncryptionService;
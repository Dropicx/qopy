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
            console.log('🔐 Zero-Knowledge Access Code Analysis:', {
                uploadId: session.upload_id,
                sessionHasPassword: session.has_password,
                isQuickShare: session.quick_share,
                hasQuickShareSecret: !!quickShareSecret,
                hasClientAccessCodeHash: !!clientAccessCodeHash,
                clientAccessCodeHashLength: clientAccessCodeHash ? clientAccessCodeHash.length : 0,
                requiresAccessCode: requiresAccessCode,
                requiresAccessCodeType: typeof requiresAccessCode
            });
        } catch (error) {
            console.error('❌ Error in Zero-Knowledge Access Code Analysis:', error);
        }
        
        try {
            if (session.quick_share && quickShareSecret) {
                // Quick Share: Store secret in password_hash field (legacy compatibility)
                console.log('🔑 Setting Quick Share secret for upload:', session.upload_id, 'secret:', quickShareSecret);
                passwordHash = quickShareSecret;
                accessCodeHash = null;
                shouldRequireAccessCode = false;
            } else if (requiresAccessCode && isValidAccessCodeHash) {
                // Normal Share with Password: Use client-generated access code hash
                console.log('🔐 Using client-side access code hash (Zero-Knowledge):', session.upload_id);
                accessCodeHash = clientAccessCodeHash;
                shouldRequireAccessCode = true; // FORCE TRUE
                passwordHash = 'client-encrypted'; // Mark as client-encrypted for legacy compatibility
                console.log('🔐 Zero-Knowledge Access Code Hash stored:', {
                    accessCodeHash: accessCodeHash ? accessCodeHash.substring(0, 16) + '...' : null,
                    requiresAccessCode: shouldRequireAccessCode,
                    passwordHash: 'client-encrypted'
                });
            } else {
                console.log('🔐 Condition check failed:', {
                    requiresAccessCode: requiresAccessCode,
                    hasClientAccessCodeHash: !!clientAccessCodeHash,
                    condition: requiresAccessCode && clientAccessCodeHash
                });
                // Normal Share without Password: Only URL secret protection (client-side only)
                console.log('🔐 URL secret only protection (Zero-Knowledge):', session.upload_id);
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
        console.log('🔐 Zero-Knowledge File System: No download tokens generated - client handles all encryption and URL secrets');

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
            originalFileSize: session?.filesize ?? session?.file_size ?? actualFilesize, // Store original size in metadata
            actualFileSize: actualFilesize,
            // No downloadToken - using Zero-Knowledge access code system
            zeroKnowledge: true
        };

        console.log('📝 Storing file_metadata:', fileMetadata);
        return fileMetadata;
    }
}

module.exports = EncryptionService;
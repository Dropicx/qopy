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
        const { clientAccessCodeHash, requiresAccessCode } = requestData || {};

        // Validate access code hash - must be non-empty, 32-128 chars (bcrypt hashes are 60 chars)
        const isValidAccessCodeHash = clientAccessCodeHash &&
            typeof clientAccessCodeHash === 'string' &&
            clientAccessCodeHash.length >= 32 &&
            clientAccessCodeHash.length <= 128;

        let passwordHash = null;
        let accessCodeHash = null;
        let shouldRequireAccessCode = false;

        try {
            if (session && session.quick_share) {
                // Quick Share: Zero-knowledge — no secret stored on server
                passwordHash = null;
                accessCodeHash = null;
                shouldRequireAccessCode = false;
            } else if (requiresAccessCode && isValidAccessCodeHash) {
                // Normal Share with Password: Use client-generated access code hash
                accessCodeHash = clientAccessCodeHash;
                shouldRequireAccessCode = true;
                passwordHash = 'client-encrypted'; // Mark as client-encrypted for legacy compatibility
            } else {
                passwordHash = null;
                accessCodeHash = null;
                shouldRequireAccessCode = false;
            }
        } catch (error) {
            console.error('Error processing access code:', error);
            throw error;
        }

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
        return {
            uploadId,
            originalUploadSession: true,
            originalFileSize: Number(session?.filesize ?? session?.file_size ?? actualFilesize),
            actualFileSize: actualFilesize,
            zeroKnowledge: true
        };
    }
}

module.exports = EncryptionService;

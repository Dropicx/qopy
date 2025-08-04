/**
 * UploadCompletionService - Orchestrates the entire upload completion workflow
 * Handles validation, file assembly, encryption, and storage
 */

const UploadValidator = require('./UploadValidator');
const FileAssemblyService = require('./FileAssemblyService');
const EncryptionService = require('./EncryptionService');
const UploadRepository = require('./UploadRepository');

class UploadCompletionService {
    constructor(pool, redis, assembleFile, updateStatistics, generateClipId, getUploadSession) {
        this.pool = pool;
        this.redis = redis;
        this.assembleFile = assembleFile;
        this.updateStatistics = updateStatistics;
        this.generateClipId = generateClipId;
        this.getUploadSession = getUploadSession;
        this.repository = new UploadRepository(pool, redis);
    }

    /**
     * Complete upload workflow
     * @param {string} uploadId - Upload session ID
     * @param {object} requestData - Request body data
     * @param {object} req - Express request object for URL generation
     * @returns {object} Upload completion result
     */
    async completeUpload(uploadId, requestData, req) {
        console.log('🔍 Starting upload completion for:', uploadId);

        // Parse and validate request
        const parsedData = UploadValidator.parseUploadRequest(requestData);
        
        // Get and validate upload session
        const session = await this.getUploadSession(uploadId);
        if (!session) {
            throw new UploadCompletionError('Upload session not found', 404);
        }

        const validatedSession = UploadValidator.validateSession(session);
        
        // Validate chunk completeness
        const chunkValidation = UploadValidator.validateChunks(validatedSession);
        if (!chunkValidation.isComplete) {
            throw new UploadCompletionError(
                `Upload incomplete: ${chunkValidation.uploadedChunks}/${chunkValidation.totalChunks} chunks uploaded`,
                400
            );
        }

        // Assemble file and get metadata
        const filePath = await FileAssemblyService.assembleFile(uploadId, validatedSession, this.assembleFile);
        const actualFilesize = await FileAssemblyService.getFileSize(filePath);
        
        // Generate clip ID and prepare encryption
        const clipId = this.generateClipId(validatedSession.is_text_content ? validatedSession.quick_share : false);
        const encryptionConfig = EncryptionService.processAccessCode(validatedSession, parsedData);
        const fileMetadata = EncryptionService.createFileMetadata(uploadId, validatedSession, actualFilesize);
        
        // Store clip in database
        await this.repository.createClip({
            clipId,
            session: validatedSession,
            filePath,
            actualFilesize,
            isFile: true,
            passwordHash: encryptionConfig.passwordHash,
            accessCodeHash: encryptionConfig.accessCodeHash,
            shouldRequireAccessCode: encryptionConfig.shouldRequireAccessCode,
            fileMetadata
        });

        // Update statistics and cleanup
        await this.repository.updateSessionStatistics(validatedSession, this.updateStatistics);
        await this.repository.cleanupUploadSession(uploadId);

        // Generate response
        return this.formatResponse(validatedSession, clipId, req);
    }

    /**
     * Format upload completion response
     * @param {object} session - Validated session data
     * @param {string} clipId - Generated clip ID
     * @param {object} req - Express request object
     * @returns {object} Formatted response
     */
    formatResponse(session, clipId, req) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const url = session.is_text_content 
            ? `${baseUrl}/clip/${clipId}`
            : `${baseUrl}/file/${clipId}`;

        return {
            success: true,
            clipId,
            url,
            filename: session.original_filename,
            filesize: session.filesize,
            expiresAt: session.expiration_time,
            quickShare: session.quick_share,
            oneTime: session.one_time,
            isFile: true
        };
    }
}

/**
 * Custom error class for upload completion errors
 */
class UploadCompletionError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = 'UploadCompletionError';
        this.statusCode = statusCode;
    }
}

module.exports = { UploadCompletionService, UploadCompletionError };
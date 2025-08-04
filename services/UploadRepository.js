/**
 * Service for database operations related to uploads
 */
class UploadRepository {
    constructor(pool, redis) {
        this.pool = pool;
        this.redis = redis;
    }

    /**
     * Create a clip record in the database
     * @param {Object} clipData - Clip data to insert
     * @returns {Promise<void>}
     */
    async createClip(clipData) {
        const {
            clipId,
            session,
            filePath,
            actualFilesize,
            isFile,
            passwordHash,
            accessCodeHash,
            shouldRequireAccessCode,
            fileMetadata
        } = clipData;

        // Log database insert parameters for debugging
        console.log('💾 Database Insert Parameters:', {
            clipId,
            contentType: session.is_text_content ? 'text' : 'file',
            passwordHash,
            accessCodeHash: accessCodeHash ? accessCodeHash.substring(0, 16) + '...' : null,
            requiresAccessCode: shouldRequireAccessCode,
            requiresAccessCodeType: typeof shouldRequireAccessCode,
            FORCED_VALUE: shouldRequireAccessCode,
            isFile
        });

        // Store clip in database (content column removed - all content stored as files)
        await this.pool.query(`
            INSERT INTO clips 
            (clip_id, content_type, expiration_time, password_hash, one_time, quick_share, created_at,
             file_path, original_filename, mime_type, filesize, is_file, file_metadata,
             access_code_hash, requires_access_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            clipId,
            // Keep content_type = 'text' for text content, even when stored as file
            session.is_text_content ? 'text' : 'file',
            session.expiration_time,
            passwordHash, // Use the calculated password hash (Quick Share secret or 'client-encrypted')
            session.one_time,
            session.quick_share, // Add quick_share from session
            Date.now(),
            isFile ? filePath : null,
            session.original_filename,
            session.mime_type,
            actualFilesize, // Use actual file size (encrypted if applicable)
            isFile,
            JSON.stringify(fileMetadata),
            accessCodeHash, // New: Access code hash for password protection
            shouldRequireAccessCode // New: Whether access code is required
        ]);

        console.log('✅ Database insert completed successfully');
    }

    /**
     * Update statistics counters
     * @param {string} statType - Type of statistic to update
     * @param {Function} updateStatisticsFn - The updateStatistics function from main server
     * @returns {Promise<void>}
     */
    async updateStatistics(statType, updateStatisticsFn) {
        if (!updateStatisticsFn) {
            throw new Error('updateStatistics function not provided');
        }
        await updateStatisticsFn(statType);
    }

    /**
     * Update various statistics based on session properties
     * @param {Object} session - Upload session
     * @param {Function} updateStatisticsFn - The updateStatistics function from main server
     * @returns {Promise<void>}
     */
    async updateSessionStatistics(session, updateStatisticsFn) {
        await this.updateStatistics('clip_created', updateStatisticsFn);
        
        if (session.quick_share) {
            await this.updateStatistics('quick_share_created', updateStatisticsFn);
        } else if (session.has_password) {
            await this.updateStatistics('password_protected_created', updateStatisticsFn);
        } else {
            await this.updateStatistics('normal_created', updateStatisticsFn);
        }
        
        if (session.one_time) {
            await this.updateStatistics('one_time_created', updateStatisticsFn);
        }
    }

    /**
     * Clean up upload session and related data
     * @param {string} uploadId - Upload ID to clean up
     * @returns {Promise<void>}
     */
    async cleanupUploadSession(uploadId) {
        // Clean up upload session (order matters due to foreign key constraints)
        await this.pool.query('DELETE FROM file_chunks WHERE upload_id = $1', [uploadId]);
        await this.pool.query('DELETE FROM upload_sessions WHERE upload_id = $1', [uploadId]);
        
        if (this.redis) {
            await this.redis.del(`upload:${uploadId}`);
        }
    }
}

module.exports = UploadRepository;
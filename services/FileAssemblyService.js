const fs = require('fs').promises;
const path = require('path');
const BaseService = require('./core/BaseService');
const { createLimiter } = require('./utils/concurrencyLimiter');

// Static logger instance for use in static methods
const logger = new BaseService();
logger.name = 'FileAssemblyService';

/**
 * Service for handling file chunk assembly with parallel processing optimization
 */
class FileAssemblyService {
    /**
     * 🚀 PARALLEL OPTIMIZATION: Assemble file from uploaded chunks using parallel processing
     * @param {string} uploadId - Upload session ID 
     * @param {Object} session - Upload session data
     * @param {string} storagePath - Base storage path for chunks
     * @param {string} outputPath - Final output file path
     * @returns {Promise<string>} - Path to assembled file
     */
    static async assembleFile(uploadId, session, storagePath, outputPath) {
        logger.log('Parallel file assembly starting', { uploadId });
        const startTime = Date.now();
        
        const totalChunks = session?.total_chunks ?? session?.chunk_count;
        if (!uploadId || !session || !totalChunks) {
            throw new Error('Invalid parameters for file assembly');
        }
        
        try {
            // 🚀 PARALLEL OPTIMIZATION: Read all chunks concurrently with controlled concurrency
            const limit = createLimiter(5); // Limit concurrent reads to prevent overwhelming the filesystem
            const chunkTasks = [];
            
            for (let i = 0; i < totalChunks; i++) {
                chunkTasks.push(limit(async () => {
                    const chunkPath = path.join(storagePath, 'chunks', uploadId, `chunk_${i}`);
                    
                    // Check if chunk exists
                    try {
                        await fs.access(chunkPath);
                    } catch (error) {
                        throw new Error(`Chunk ${i} not found`);
                    }
                    
                    // Read chunk data
                    const chunkData = await fs.readFile(chunkPath);
                    logger.log(`Chunk ${i}: ${chunkData.length} bytes`);
                    
                    return {
                        index: i,
                        data: chunkData,
                        size: chunkData.length
                    };
                }));
            }
            
            // Execute all chunk reads in parallel
            logger.log(`Reading ${totalChunks} chunks in parallel`);
            const chunks = await Promise.all(chunkTasks);
            
            // Sort chunks by index to ensure correct order
            chunks.sort((a, b) => a.index - b.index);
            
            // 🚀 MEMORY OPTIMIZATION: Use Buffer.concat() for efficient memory usage
            logger.log('Assembling chunks with Buffer.concat()');
            const buffers = chunks.map(chunk => chunk.data);
            const assembledBuffer = Buffer.concat(buffers);
            
            // Calculate total size for verification
            const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
            logger.log(`Assembly stats: ${chunks.length} chunks, ${totalSize} bytes total`);
            
            // Ensure output directory exists
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            
            // Write assembled file
            await fs.writeFile(outputPath, assembledBuffer);
            
            const duration = Date.now() - startTime;
            logger.logSuccess(`Parallel assembly completed in ${duration}ms`, { outputPath });
            
            return outputPath;
            
        } catch (error) {
            logger.logError(`Parallel assembly failed for ${uploadId}`, error);
            throw new Error(`Failed to assemble file chunks: ${error.message}`);
        }
    }

    /**
     * Legacy wrapper for backward compatibility
     * @param {string} uploadId - Upload session ID 
     * @param {Object} session - Upload session data
     * @param {Function} assembleFileFn - The assembleFile function from main server
     * @returns {Promise<string>} - Path to assembled file
     */
    static async assembleFileLegacy(uploadId, session, assembleFileFn) {
        logger.log('Legacy assembly wrapper', { uploadId });
        
        if (!assembleFileFn) {
            throw new Error('assembleFile function not provided');
        }
        
        const filePath = await assembleFileFn(uploadId, session);
        logger.logSuccess('Legacy assembly completed', { filePath });
        
        return filePath;
    }

    /**
     * Get file size from assembled file
     * @param {string} filePath - Path to the file
     * @returns {Promise<number>} - File size in bytes
     */
    static async getFileSize(filePath) {
        const stats = await fs.stat(filePath);
        return stats.size;
    }

    /**
     * 🚀 PARALLEL OPTIMIZATION: Clean up chunk files with parallel processing
     * @param {string} uploadId - Upload session ID
     * @param {number} totalChunks - Total number of chunks to clean
     * @param {string} storagePath - Base storage path for chunks
     * @returns {Promise<Object>} - Cleanup results with success/failure counts
     */
    static async cleanupChunks(uploadId, totalChunks, storagePath) {
        logger.log(`Starting parallel cleanup for ${totalChunks} chunks`);
        const startTime = Date.now();
        
        try {
            // 🚀 PARALLEL OPTIMIZATION: Delete chunks concurrently
            const limit = createLimiter(10); // Higher concurrency for file deletion
            const cleanupTasks = [];
            
            for (let i = 0; i < totalChunks; i++) {
                cleanupTasks.push(limit(async () => {
                    const chunkPath = path.join(storagePath, 'chunks', uploadId, `chunk_${i}`);
                    
                    try {
                        await fs.unlink(chunkPath);
                        logger.logSuccess(`Cleaned chunk ${i}`, { chunkPath });
                        return { success: true, chunkIndex: i, path: chunkPath };
                    } catch (error) {
                        // Don't throw - just log and continue with other chunks
                        logger.logError(`Failed to clean chunk ${i}`, error);
                        return { success: false, chunkIndex: i, path: chunkPath, error: error.message };
                    }
                }));
            }
            
            // Execute all cleanup operations in parallel
            const results = await Promise.all(cleanupTasks);
            
            // Calculate success/failure statistics
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            
            const duration = Date.now() - startTime;
            logger.logSuccess(`Parallel cleanup completed in ${duration}ms: ${successful} success, ${failed} failed`);
            
            // Remove chunks directory after cleanup (recursive removes any remaining files)
            if (successful > 0) {
                const chunksDir = path.join(storagePath, 'chunks', uploadId);
                try {
                    await fs.rm(chunksDir, { recursive: true, force: true });
                } catch (dirError) {
                    // Ignore - directory may not exist or already removed
                }
            }
            
            return {
                totalChunks,
                successful,
                failed,
                duration,
                results
            };
            
        } catch (error) {
            logger.logError(`Parallel cleanup failed for ${uploadId}`, error);
            throw new Error(`Failed to cleanup chunks: ${error.message}`);
        }
    }

    /**
     * 🚀 PARALLEL OPTIMIZATION: Validate chunk files existence in parallel
     * @param {string} uploadId - Upload session ID
     * @param {number} totalChunks - Total expected chunks
     * @param {string} storagePath - Base storage path for chunks
     * @returns {Promise<Object>} - Validation results with missing chunks info
     */
    static async validateChunksParallel(uploadId, totalChunks, storagePath) {
        logger.log(`Validating ${totalChunks} chunks in parallel`);
        const startTime = Date.now();
        
        try {
            const limit = createLimiter(8); // Moderate concurrency for file system checks
            const validationTasks = [];
            
            for (let i = 0; i < totalChunks; i++) {
                validationTasks.push(limit(async () => {
                    const chunkPath = path.join(storagePath, 'chunks', uploadId, `chunk_${i}`);
                    
                    try {
                        const stats = await fs.stat(chunkPath);
                        return {
                            chunkIndex: i,
                            exists: true,
                            size: stats.size,
                            path: chunkPath
                        };
                    } catch (error) {
                        return {
                            chunkIndex: i,
                            exists: false,
                            size: 0,
                            path: chunkPath,
                            error: error.message
                        };
                    }
                }));
            }
            
            // Execute all validation checks in parallel
            const results = await Promise.all(validationTasks);
            
            // Analyze results
            const existingChunks = results.filter(r => r.exists);
            const missingChunks = results.filter(r => !r.exists);
            const totalSize = existingChunks.reduce((sum, chunk) => sum + chunk.size, 0);
            
            const duration = Date.now() - startTime;
            const isComplete = missingChunks.length === 0;
            
            logger.logSuccess(`Validation completed in ${duration}ms: ${existingChunks.length}/${totalChunks} chunks found`);
            
            return {
                isComplete,
                totalChunks,
                existingChunks: existingChunks.length,
                missingChunks: missingChunks.length,
                totalSize,
                duration,
                missingChunkIndices: missingChunks.map(c => c.chunkIndex),
                results
            };
            
        } catch (error) {
            logger.logError(`Parallel validation failed for ${uploadId}`, error);
            throw new Error(`Failed to validate chunks: ${error.message}`);
        }
    }

    /**
     * Validate chunk completeness (legacy method)
     * @param {number} uploadedChunks - Number of uploaded chunks
     * @param {number} totalChunks - Total expected chunks
     * @returns {boolean} - Whether all chunks are uploaded
     */
    static validateChunkCompleteness(uploadedChunks, totalChunks) {
        return uploadedChunks >= totalChunks;
    }
}

module.exports = FileAssemblyService;
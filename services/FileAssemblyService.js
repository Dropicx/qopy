const fs = require('fs').promises;
const path = require('path');

/**
 * Simple concurrency limiter using native JavaScript
 * @param {number} limit - Maximum concurrent operations
 * @returns {function} - Limited function executor
 */
function createLimiter(limit) {
    let running = 0;
    const queue = [];
    
    const run = async (fn) => {
        return new Promise((resolve, reject) => {
            queue.push({ fn, resolve, reject });
            process();
        });
    };
    
    const process = async () => {
        if (running >= limit || queue.length === 0) return;
        
        running++;
        const { fn, resolve, reject } = queue.shift();
        
        try {
            const result = await fn();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            running--;
            process();
        }
    };
    
    return run;
}

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
        console.log('🚀 Parallel file assembly starting:', uploadId);
        const startTime = Date.now();
        
        if (!uploadId || !session || !session.total_chunks) {
            throw new Error('Invalid parameters for file assembly');
        }
        
        try {
            // 🚀 PARALLEL OPTIMIZATION: Read all chunks concurrently with controlled concurrency
            const limit = createLimiter(5); // Limit concurrent reads to prevent overwhelming the filesystem
            const chunkTasks = [];
            
            for (let i = 0; i < session.total_chunks; i++) {
                chunkTasks.push(limit(async () => {
                    const chunkPath = path.join(storagePath, 'chunks', uploadId, `chunk_${i}`);
                    
                    // Check if chunk exists
                    try {
                        await fs.access(chunkPath);
                    } catch (error) {
                        throw new Error(`Chunk ${i} not found at: ${chunkPath}`);
                    }
                    
                    // Read chunk data
                    const chunkData = await fs.readFile(chunkPath);
                    console.log(`📦 Chunk ${i}: ${chunkData.length} bytes`);
                    
                    return {
                        index: i,
                        data: chunkData,
                        size: chunkData.length
                    };
                }));
            }
            
            // Execute all chunk reads in parallel
            console.log(`🔄 Reading ${session.total_chunks} chunks in parallel...`);
            const chunks = await Promise.all(chunkTasks);
            
            // Sort chunks by index to ensure correct order
            chunks.sort((a, b) => a.index - b.index);
            
            // 🚀 MEMORY OPTIMIZATION: Use Buffer.concat() for efficient memory usage
            console.log('🔗 Assembling chunks with Buffer.concat()...');
            const buffers = chunks.map(chunk => chunk.data);
            const assembledBuffer = Buffer.concat(buffers);
            
            // Calculate total size for verification
            const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
            console.log(`📊 Assembly stats: ${chunks.length} chunks, ${totalSize} bytes total`);
            
            // Ensure output directory exists
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            
            // Write assembled file
            await fs.writeFile(outputPath, assembledBuffer);
            
            const duration = Date.now() - startTime;
            console.log(`✅ Parallel assembly completed in ${duration}ms: ${outputPath}`);
            
            return outputPath;
            
        } catch (error) {
            console.error(`❌ Parallel assembly failed for ${uploadId}:`, error);
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
        console.log('📝 Legacy assembly wrapper:', uploadId);
        
        if (!assembleFileFn) {
            throw new Error('assembleFile function not provided');
        }
        
        const filePath = await assembleFileFn(uploadId, session);
        console.log('📝 Legacy assembly completed:', filePath);
        
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
        console.log(`🧹 Starting parallel cleanup for ${totalChunks} chunks...`);
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
                        console.log(`✅ Cleaned chunk ${i}: ${chunkPath}`);
                        return { success: true, chunkIndex: i, path: chunkPath };
                    } catch (error) {
                        // Don't throw - just log and continue with other chunks
                        console.warn(`⚠️ Failed to clean chunk ${i}: ${error.message}`);
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
            console.log(`🧹 Parallel cleanup completed in ${duration}ms: ${successful} success, ${failed} failed`);
            
            return {
                totalChunks,
                successful,
                failed,
                duration,
                results
            };
            
        } catch (error) {
            console.error(`❌ Parallel cleanup failed for ${uploadId}:`, error);
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
        console.log(`🔍 Validating ${totalChunks} chunks in parallel...`);
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
            
            console.log(`🔍 Validation completed in ${duration}ms: ${existingChunks.length}/${totalChunks} chunks found`);
            
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
            console.error(`❌ Parallel validation failed for ${uploadId}:`, error);
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
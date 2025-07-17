/*
 * Copyright (C) 2025 Qopy App
 * 
 * This file is part of Qopy.
 * 
 * Qopy is dual-licensed:
 * 
 * 1. GNU Affero General Public License v3.0 (AGPL-3.0)
 *    For open source use. See LICENSE-AGPL for details.
 * 
 * 2. Commercial License
 *    For proprietary/commercial use. Contact qopy@lit.services
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class StorageManager {
    constructor() {
        // Railway.app volume path or local development path
        this.basePath = process.env.RAILWAY_VOLUME_MOUNT_PATH || './storage';
        this.chunksPath = path.join(this.basePath, 'chunks');
        this.filesPath = path.join(this.basePath, 'files');
        this.init();
    }

    async init() {
        try {
            // Ensure directories exist
            await fs.ensureDir(this.basePath);
            await fs.ensureDir(this.chunksPath);
            await fs.ensureDir(this.filesPath);
            
            console.log(`✅ Storage initialized at: ${this.basePath}`);
            
            // Clean up old chunks on startup (older than 24 hours)
            await this.cleanupOldChunks();
            
        } catch (error) {
            console.error('❌ Storage initialization failed:', error.message);
            throw error;
        }
    }

    // Generate secure file path
    generateFilePath(clipId, filename) {
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const hash = crypto.createHash('sha256').update(clipId + filename).digest('hex').substring(0, 8);
        return path.join(this.filesPath, `${clipId}_${hash}_${sanitizedFilename}`);
    }

    // Generate chunk path
    generateChunkPath(uploadId, chunkNumber) {
        return path.join(this.chunksPath, uploadId, `chunk_${chunkNumber.toString().padStart(4, '0')}`);
    }

    // Store a chunk
    async storeChunk(uploadId, chunkNumber, chunkData) {
        try {
            const chunkPath = this.generateChunkPath(uploadId, chunkNumber);
            await fs.ensureDir(path.dirname(chunkPath));
            await fs.writeFile(chunkPath, chunkData);
            
            // Generate checksum
            const checksum = crypto.createHash('sha256').update(chunkData).digest('hex');
            
            return checksum;
        } catch (error) {
            console.error(`❌ Error storing chunk ${chunkNumber} for upload ${uploadId}:`, error.message);
            throw error;
        }
    }

    // Get a chunk
    async getChunk(uploadId, chunkNumber) {
        try {
            const chunkPath = this.generateChunkPath(uploadId, chunkNumber);
            const exists = await fs.pathExists(chunkPath);
            
            if (!exists) {
                return null;
            }
            
            return await fs.readFile(chunkPath);
        } catch (error) {
            console.error(`❌ Error getting chunk ${chunkNumber} for upload ${uploadId}:`, error.message);
            throw error;
        }
    }

    // Assemble chunks into final file
    async assembleFile(uploadId, clipId, filename, totalChunks) {
        try {
            const filePath = this.generateFilePath(clipId, filename);
            const writeStream = fs.createWriteStream(filePath);
            
            let assembledSize = 0;
            
            // Assemble chunks in order
            for (let i = 0; i < totalChunks; i++) {
                const chunkData = await this.getChunk(uploadId, i);
                if (!chunkData) {
                    throw new Error(`Missing chunk ${i} for upload ${uploadId}`);
                }
                
                writeStream.write(chunkData);
                assembledSize += chunkData.length;
            }
            
            writeStream.end();
            
            // Wait for write to complete
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });
            
            // Clean up chunks
            await this.cleanupChunks(uploadId);
            
            return {
                filePath: filePath,
                fileSize: assembledSize
            };
            
        } catch (error) {
            console.error(`❌ Error assembling file for upload ${uploadId}:`, error.message);
            throw error;
        }
    }

    // Get file for download
    async getFile(filePath) {
        try {
            const exists = await fs.pathExists(filePath);
            if (!exists) {
                return null;
            }
            
            const stats = await fs.stat(filePath);
            return {
                stream: fs.createReadStream(filePath),
                size: stats.size,
                lastModified: stats.mtime
            };
            
        } catch (error) {
            console.error(`❌ Error getting file ${filePath}:`, error.message);
            throw error;
        }
    }

    // Delete file
    async deleteFile(filePath) {
        try {
            const exists = await fs.pathExists(filePath);
            if (exists) {
                await fs.unlink(filePath);
                console.log(`🗑️ Deleted file: ${filePath}`);
            }
        } catch (error) {
            console.error(`❌ Error deleting file ${filePath}:`, error.message);
        }
    }

    // Clean up chunks for an upload
    async cleanupChunks(uploadId) {
        try {
            const chunkDir = path.join(this.chunksPath, uploadId);
            const exists = await fs.pathExists(chunkDir);
            
            if (exists) {
                await fs.remove(chunkDir);
                console.log(`🧹 Cleaned up chunks for upload: ${uploadId}`);
            }
        } catch (error) {
            console.error(`❌ Error cleaning up chunks for upload ${uploadId}:`, error.message);
        }
    }

    // Clean up old chunks (older than 24 hours)
    async cleanupOldChunks() {
        try {
            const chunkDirs = await fs.readdir(this.chunksPath);
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            
            let cleanedCount = 0;
            
            for (const dir of chunkDirs) {
                const dirPath = path.join(this.chunksPath, dir);
                const stats = await fs.stat(dirPath);
                
                if (stats.isDirectory() && (now - stats.mtime.getTime()) > maxAge) {
                    await fs.remove(dirPath);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`🧹 Cleaned up ${cleanedCount} old chunk directories`);
            }
            
        } catch (error) {
            console.error('❌ Error cleaning up old chunks:', error.message);
        }
    }

    // Get storage statistics
    async getStorageStats() {
        try {
            const filesSize = await this.getDirectorySize(this.filesPath);
            const chunksSize = await this.getDirectorySize(this.chunksPath);
            
            return {
                totalUsed: filesSize + chunksSize,
                filesUsed: filesSize,
                chunksUsed: chunksSize,
                path: this.basePath
            };
            
        } catch (error) {
            console.error('❌ Error getting storage stats:', error.message);
            return {
                totalUsed: 0,
                filesUsed: 0,
                chunksUsed: 0,
                path: this.basePath,
                error: error.message
            };
        }
    }

    // Calculate directory size recursively
    async getDirectorySize(dirPath) {
        try {
            const exists = await fs.pathExists(dirPath);
            if (!exists) return 0;
            
            let totalSize = 0;
            const items = await fs.readdir(dirPath);
            
            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stats = await fs.stat(itemPath);
                
                if (stats.isDirectory()) {
                    totalSize += await this.getDirectorySize(itemPath);
                } else {
                    totalSize += stats.size;
                }
            }
            
            return totalSize;
            
        } catch (error) {
            console.error(`❌ Error calculating directory size for ${dirPath}:`, error.message);
            return 0;
        }
    }

    // Format bytes to human readable
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Verify file integrity
    async verifyFileIntegrity(filePath, expectedSize, expectedChecksum = null) {
        try {
            const exists = await fs.pathExists(filePath);
            if (!exists) {
                return { valid: false, reason: 'File does not exist' };
            }
            
            const stats = await fs.stat(filePath);
            if (stats.size !== expectedSize) {
                return { 
                    valid: false, 
                    reason: `Size mismatch: expected ${expectedSize}, got ${stats.size}` 
                };
            }
            
            if (expectedChecksum) {
                const fileData = await fs.readFile(filePath);
                const actualChecksum = crypto.createHash('sha256').update(fileData).digest('hex');
                
                if (actualChecksum !== expectedChecksum) {
                    return { 
                        valid: false, 
                        reason: `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}` 
                    };
                }
            }
            
            return { valid: true };
            
        } catch (error) {
            return { 
                valid: false, 
                reason: `Verification error: ${error.message}` 
            };
        }
    }
}

// Singleton instance
const storageManager = new StorageManager();

module.exports = storageManager; 
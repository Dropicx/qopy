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

const redis = require('redis');

class RedisManager {
    constructor() {
        this.client = null;
        this.connected = false;
        this.retryAttempts = 0;
        this.maxRetries = 3;
        // Track event listeners to prevent memory leaks
        this.eventListeners = new Map();
        this.isShuttingDown = false;
    }

    async connect() {
        try {
            // Railway.app Redis configuration
            const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
            
            if (redisUrl) {
                console.log('🔗 Connecting to Redis...');
                this.client = redis.createClient({
                    url: redisUrl,
                    retry_strategy: (options) => {
                        if (options.error && options.error.code === 'ECONNREFUSED') {
                            console.error('❌ Redis server refused connection');
                        }
                        if (options.total_retry_time > 1000 * 60 * 60) {
                            console.error('❌ Redis retry time exhausted');
                            return new Error('Retry time exhausted');
                        }
                        if (options.attempt > this.maxRetries) {
                            console.error('❌ Redis max retry attempts reached');
                            return undefined;
                        }
                        // Reconnect after
                        return Math.min(options.attempt * 100, 3000);
                    }
                });

                // Track and attach event listeners with cleanup capability
                const errorHandler = (err) => {
                    console.error('❌ Redis Client Error:', err);
                    this.connected = false;
                    // Trigger cleanup on critical errors
                    const criticalErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
                    if (criticalErrors.includes(err.code)) {
                        this.cleanup();
                    }
                };
                this.client.on('error', errorHandler);
                this.eventListeners.set('error', errorHandler);

                const connectHandler = () => {
                    console.log('✅ Redis connected');
                    this.connected = true;
                    this.retryAttempts = 0;
                };
                this.client.on('connect', connectHandler);
                this.eventListeners.set('connect', connectHandler);

                const readyHandler = () => {
                    console.log('✅ Redis ready');
                    this.connected = true;
                };
                this.client.on('ready', readyHandler);
                this.eventListeners.set('ready', readyHandler);

                const endHandler = () => {
                    console.log('⚠️ Redis connection ended');
                    this.connected = false;
                    // Clean up listeners when connection ends
                    this.cleanup();
                };
                this.client.on('end', endHandler);
                this.eventListeners.set('end', endHandler);

                await this.client.connect();
                
            } else {
                console.warn('⚠️ No Redis URL found - running without Redis cache');
                this.connected = false;
            }
            
        } catch (error) {
            console.error('❌ Redis connection failed:', error.message);
            this.connected = false;
            this.retryAttempts++;
            
            if (this.retryAttempts < this.maxRetries) {
                console.log(`🔄 Retrying Redis connection (${this.retryAttempts}/${this.maxRetries})...`);
                setTimeout(() => this.connect(), 5000);
            } else {
                console.warn('⚠️ Redis max retries reached - continuing without cache');
            }
        }
    }

    isConnected() {
        return this.connected && this.client && this.client.isReady;
    }

    async set(key, value, ttl = null) {
        if (!this.isConnected()) return false;
        
        try {
            if (ttl) {
                await this.client.setEx(key, ttl, JSON.stringify(value));
            } else {
                await this.client.set(key, JSON.stringify(value));
            }
            return true;
        } catch (error) {
            console.error('❌ Redis SET error:', error.message);
            return false;
        }
    }

    async get(key) {
        if (!this.isConnected()) return null;
        
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('❌ Redis GET error:', error.message);
            return null;
        }
    }

    async del(key) {
        if (!this.isConnected()) return false;
        
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('❌ Redis DEL error:', error.message);
            return false;
        }
    }

    async exists(key) {
        if (!this.isConnected()) return false;
        
        try {
            const exists = await this.client.exists(key);
            return exists === 1;
        } catch (error) {
            console.error('❌ Redis EXISTS error:', error.message);
            return false;
        }
    }

    async incr(key) {
        if (!this.isConnected()) return null;
        
        try {
            return await this.client.incr(key);
        } catch (error) {
            console.error('❌ Redis INCR error:', error.message);
            return null;
        }
    }

    async expire(key, ttl) {
        if (!this.isConnected()) return false;
        
        try {
            await this.client.expire(key, ttl);
            return true;
        } catch (error) {
            console.error('❌ Redis EXPIRE error:', error.message);
            return false;
        }
    }

    /**
     * Clean up event listeners to prevent memory leaks
     */
    cleanup() {
        if (this.isShuttingDown) return; // Prevent multiple cleanup calls
        this.isShuttingDown = true;
        
        // Stop heartbeat monitoring
        this.stopHeartbeat();
        
        console.log('🧹 Cleaning up Redis event listeners...');
        
        if (this.client && this.eventListeners.size > 0) {
            // Remove all tracked event listeners
            for (const [event, handler] of this.eventListeners) {
                try {
                    this.client.removeListener(event, handler);
                    console.log(`✅ Removed ${event} listener`);
                } catch (error) {
                    console.error(`❌ Error removing ${event} listener:`, error.message);
                }
            }
            
            // Clear the listener tracking map
            this.eventListeners.clear();
            console.log('✅ All Redis event listeners cleaned up');
        }
        
        this.connected = false;
    }

    async disconnect() {
        if (this.client) {
            try {
                // Clean up listeners before disconnecting
                this.cleanup();
                
                await this.client.disconnect();
                console.log('✅ Redis disconnected');
                
                // Reset state
                this.client = null;
                this.isShuttingDown = false;
            } catch (error) {
                console.error('❌ Redis disconnect error:', error.message);
            }
        }
    }

    // Upload session specific methods
    async storeUploadSession(uploadId, sessionData, ttl = 3600) {
        return await this.set(`upload:${uploadId}`, sessionData, ttl);
    }

    async getUploadSession(uploadId) {
        return await this.get(`upload:${uploadId}`);
    }

    async deleteUploadSession(uploadId) {
        return await this.del(`upload:${uploadId}`);
    }

    async updateUploadProgress(uploadId, chunkNumber) {
        if (!this.isConnected()) return false;
        
        try {
            const key = `upload:${uploadId}:progress`;
            await this.client.sAdd(key, chunkNumber.toString());
            await this.client.expire(key, 3600); // 1 hour TTL
            return true;
        } catch (error) {
            console.error('❌ Redis upload progress error:', error.message);
            return false;
        }
    }

    /**
     * Start health monitoring for Redis connection
     */
    startHeartbeat() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                if (!this.isShuttingDown && this.client && this.connected) {
                    await this.client.ping();
                    this.lastHeartbeat = Date.now();
                }
            } catch (error) {
                console.error('❌ Redis heartbeat failed:', error.message);
                this.connected = false;
                if (!this.isShuttingDown && this.retryAttempts < this.maxRetries) {
                    setTimeout(() => this.connect(), 2000);
                }
            }
        }, 30000);
    }

    /**
     * Stop health monitoring
     */
    stopHeartbeat() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    async getUploadProgress(uploadId) {
        if (!this.isConnected()) return null;
        
        try {
            const key = `upload:${uploadId}:progress`;
            const chunks = await this.client.sMembers(key);
            return chunks.map(chunk => parseInt(chunk));
        } catch (error) {
            console.error('❌ Redis get upload progress error:', error.message);
            return null;
        }
    }
}

// Singleton instance
const redisManager = new RedisManager();

// Graceful shutdown handling to prevent memory leaks
const gracefulShutdown = async (signal) => {
    console.log(`🛑 Received ${signal}, shutting down Redis connection gracefully...`);
    try {
        await redisManager.disconnect();
        console.log('✅ Redis shutdown complete');
    } catch (error) {
        console.error('❌ Error during Redis shutdown:', error.message);
    }
};

// Register shutdown handlers for various termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught Exception:', error);
    await gracefulShutdown('uncaughtException');
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    await gracefulShutdown('unhandledRejection');
    process.exit(1);
});

module.exports = redisManager; 
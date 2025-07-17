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

                this.client.on('error', (err) => {
                    console.error('❌ Redis Client Error:', err);
                    this.connected = false;
                });

                this.client.on('connect', () => {
                    console.log('✅ Redis connected');
                    this.connected = true;
                    this.retryAttempts = 0;
                });

                this.client.on('ready', () => {
                    console.log('✅ Redis ready');
                    this.connected = true;
                });

                this.client.on('end', () => {
                    console.log('⚠️ Redis connection ended');
                    this.connected = false;
                });

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

    async disconnect() {
        if (this.client) {
            try {
                await this.client.disconnect();
                console.log('✅ Redis disconnected');
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

module.exports = redisManager; 
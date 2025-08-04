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

/**
 * ApiClient - Centralized API communication service
 * Consolidates all HTTP requests into a single, maintainable service
 */
export class ApiClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '';
        this.timeout = options.timeout || 30000;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.debug = options.debug || false;
        
        // Loading state management
        this.activeRequests = new Set();
        this.loadingStateCallback = options.onLoadingStateChange || null;
        
        // Request/Response interceptors
        this.requestInterceptors = [];
        this.responseInterceptors = [];
    }
    
    // Core request method with error handling and retry logic
    async request(url, options = {}) {
        const requestId = Math.random().toString(36).substr(2, 9);
        this.activeRequests.add(requestId);
        this._updateLoadingState();
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const finalOptions = {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };
            
            // Apply request interceptors
            for (const interceptor of this.requestInterceptors) {
                await interceptor(url, finalOptions);
            }
            
            let lastError;
            for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
                try {
                    if (this.debug) {
                        console.log(`🔄 API Request (attempt ${attempt + 1}):`, url, finalOptions);
                    }
                    
                    const response = await fetch(this.baseUrl + url, finalOptions);
                    clearTimeout(timeoutId);
                    
                    // Apply response interceptors
                    for (const interceptor of this.responseInterceptors) {
                        await interceptor(response);
                    }
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        const error = new Error(errorData.message || `HTTP ${response.status}`);
                        error.status = response.status;
                        error.data = errorData;
                        
                        // Don't retry on client errors (4xx)
                        if (response.status >= 400 && response.status < 500) {
                            throw error;
                        }
                        
                        lastError = error;
                        continue;
                    }
                    
                    const data = await response.json();
                    return { success: true, data, status: response.status };
                    
                } catch (error) {
                    clearTimeout(timeoutId);
                    
                    if (error.name === 'AbortError') {
                        throw new Error('Request timed out');
                    }
                    
                    lastError = error;
                    
                    // Don't retry on final attempt
                    if (attempt < this.retryAttempts - 1) {
                        await this._delay(this.retryDelay * (attempt + 1));
                    }
                }
            }
            
            throw lastError;
            
        } finally {
            this.activeRequests.delete(requestId);
            this._updateLoadingState();
        }
    }
    
    // Clip API methods
    async getClipInfo(clipId, accessCode = null) {
        const url = `/api/clip/${clipId}/info`;
        
        if (accessCode) {
            return this.request(url, {
                method: 'POST',
                body: JSON.stringify({ accessCode })
            });
        }
        
        return this.request(url, { method: 'GET' });
    }
    
    async getClip(clipId, accessCode = null) {
        const url = `/api/clip/${clipId}`;
        
        if (accessCode) {
            return this.request(url, {
                method: 'POST',
                body: JSON.stringify({ accessCode })
            });
        }
        
        return this.request(url, { method: 'GET' });
    }
    
    async createClip(clipData) {
        return this.request('/api/share', {
            method: 'POST',
            body: JSON.stringify(clipData)
        });
    }
    
    // File API methods
    async downloadFile(clipId, accessCode = null) {
        const url = `/api/file/${clipId}`;
        
        if (accessCode) {
            return this.request(url, {
                method: 'POST',
                body: JSON.stringify({ accessCode })
            });
        }
        
        return this.request(url, { method: 'GET' });
    }
    
    // Upload API methods
    async initiateUpload(uploadData) {
        return this.request('/api/upload/initiate', {
            method: 'POST',
            body: JSON.stringify(uploadData)
        });
    }
    
    async uploadChunk(uploadId, chunkIndex, chunkData, metadata = {}) {
        const formData = new FormData();
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', chunkIndex);
        formData.append('chunk', chunkData);
        
        Object.entries(metadata).forEach(([key, value]) => {
            formData.append(key, value);
        });
        
        return this.request('/api/upload/chunk', {
            method: 'POST',
            body: formData,
            headers: {} // Let browser set Content-Type for FormData
        });
    }
    
    async completeUpload(uploadId, completionData) {
        return this.request('/api/upload/complete', {
            method: 'POST',
            body: JSON.stringify({
                uploadId,
                ...completionData
            })
        });
    }
    
    async cancelUpload(uploadId) {
        return this.request(`/api/upload/${uploadId}/cancel`, {
            method: 'POST'
        });
    }
    
    async getUploadProgress(uploadId) {
        return this.request(`/api/upload/${uploadId}/progress`, {
            method: 'GET'
        });
    }
    
    // Admin API methods
    async adminAuth(password) {
        return this.request('/api/admin/auth', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
    }
    
    async getAdminStats() {
        return this.request('/api/admin/stats', {
            method: 'GET'
        });
    }
    
    async getSystemInfo() {
        return this.request('/api/admin/system', {
            method: 'GET'
        });
    }
    
    // Helper methods
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    _updateLoadingState() {
        if (this.loadingStateCallback) {
            this.loadingStateCallback(this.activeRequests.size > 0);
        }
    }
    
    // Interceptor management
    addRequestInterceptor(interceptor) {
        this.requestInterceptors.push(interceptor);
    }
    
    addResponseInterceptor(interceptor) {
        this.responseInterceptors.push(interceptor);
    }
    
    removeRequestInterceptor(interceptor) {
        const index = this.requestInterceptors.indexOf(interceptor);
        if (index > -1) {
            this.requestInterceptors.splice(index, 1);
        }
    }
    
    removeResponseInterceptor(interceptor) {
        const index = this.responseInterceptors.indexOf(interceptor);
        if (index > -1) {
            this.responseInterceptors.splice(index, 1);
        }
    }
    
    // Loading state helpers
    isLoading() {
        return this.activeRequests.size > 0;
    }
    
    getActiveRequestCount() {
        return this.activeRequests.size;
    }
}
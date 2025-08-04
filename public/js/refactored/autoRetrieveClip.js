/*
 * Copyright (C) 2025 Qopy App
 * 
 * Refactored autoRetrieveClip method - Breaking down 427-line monolith
 * into focused, single-responsibility methods
 */

import { UIHelpers } from '../helpers/UIHelpers.js';
import { ERROR_MESSAGES, INFO_MESSAGES, getErrorMessage, getInfoMessage } from '../constants/ErrorMessages.js';

/**
 * Refactored autoRetrieveClip - Now an orchestrator method (33 lines)
 * Original: 427 lines (265-694)
 */
async autoRetrieveClip(clipId) {
    try {
        // Validate clip ID format
        if (!/^[A-Z0-9]{4}$|^[A-Z0-9]{10}$/.test(clipId)) {
            return;
        }

        UIHelpers.showLoading('retrieve-loading');
        
        // Extract URL secret and password for potential authentication
        const urlSecret = this.extractUrlSecret();
        const password = UIHelpers.getPasswordValue();
        
        // Check if this is a file URL (from routing)
        const isFileUrl = this.isFileRequest === true;
        const isQuickShare = clipId.length === 4;
        
        console.log('🔍 Auto-retrieve info:', {
            clipId, 
            isFileUrl, 
            isQuickShare, 
            hasUrlSecret: !!urlSecret, 
            hasPassword: !!password
        });
        
        let success = false;
        
        if (isQuickShare) {
            success = await this.handleQuickShareClip(clipId);
        } else if (isFileUrl) {
            success = await this.handleFileUrlClip(clipId, urlSecret, password);
        } else {
            success = await this.handleNormalClip(clipId, urlSecret, password);
        }
        
        if (!success) {
            console.log('⚠️ Auto-retrieve was not successful for:', clipId);
        }
        
    } catch (error) {
        console.error('❌ Error in autoRetrieveClip:', error);
        this.showToast(getErrorMessage('FAILED_TO_RETRIEVE'), 'error');
    } finally {
        UIHelpers.hideLoading('retrieve-loading');
    }
}

/**
 * Handle 4-digit quick share clips (47 lines)
 * Extracted from lines 290-316 of original
 */
async handleQuickShareClip(clipId) {
    console.log('⚡ Quick Share auto-retrieve - no download token needed:', clipId);
    
    try {
        // First, get clip info to check if it has password
        const infoResult = await this.apiClient.getClipInfo(clipId);
        
        if (!infoResult.success) {
            // Clip not found or expired, don't try to decrypt
            return false;
        }
        
        // Quick Share never has passwords, proceed with retrieval
        const result = await this.apiClient.getClip(clipId);
        
        if (result.success) {
            await this.showRetrieveResult(result.data);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Error in handleQuickShareClip:', error);
        return false;
    }
}

/**
 * Handle file URL clips with authentication (36 lines)
 * Extracted from lines 317-460 of original
 */
async handleFileUrlClip(clipId, urlSecret, password) {
    console.log('📁 File URL detected - checking credentials before API call:', clipId);
    
    if (!urlSecret) {
        this.showToast(getErrorMessage('ACCESS_DENIED_FILE'), 'error');
        return false;
    }
    
    try {
        // Use Zero-Knowledge system - no authentication needed for file info
        const infoResult = await this.apiClient.getClipInfo(clipId);
        
        if (infoResult.success) {
            return await this._handleFileUrlWithInfo(clipId, infoResult.data, password);
        } else if (infoResult.status === 401 || infoResult.status === 403) {
            return await this._handleFileUrlAuthError(clipId, infoResult.data, password);
        } else {
            // Other error (file not found, expired, etc.)
            const message = infoResult.status === 404 ? 
                getErrorMessage('FILE_NOT_FOUND') : 
                getErrorMessage('FAILED_TO_ACCESS_FILE');
            this.showToast(message, 'error');
            return false;
        }
    } catch (error) {
        console.error('❌ Error in handleFileUrlClip:', error);
        return false;
    }
}

/**
 * Handle 10-digit normal clips (15 lines)
 * Extracted from lines 461-685 of original
 */
async handleNormalClip(clipId, urlSecret, password) {
    console.log('🔐 Normal clip processing:', { clipId, hasUrlSecret: !!urlSecret, hasPassword: !!password });
    
    try {
        if (urlSecret) {
            return await this._handleNormalClipWithSecret(clipId, password);
        } else {
            return await this._handleNormalClipWithoutSecret(clipId, password);
        }
    } catch (error) {
        console.error('❌ Error in handleNormalClip:', error);
        return false;
    }
}

/**
 * Shared authentication and retrieval logic (42 lines)
 * Extracted from repeated patterns throughout original
 */
async authenticateAndRetrieve(clipId, password, urlSecret = null) {
    try {
        let result;
        
        if (password) {
            // Use Zero-Knowledge Access Code system
            const accessCodeHash = await this.generateAccessCodeHash(password);
            result = await this.apiClient.getClip(clipId, accessCodeHash);
        } else {
            // Non-password clip - direct retrieval
            result = await this.apiClient.getClip(clipId);
        }
        
        if (result.success) {
            await this.showRetrieveResult(result.data);
            return true;
        } else {
            console.error('❌ Authentication/retrieval failed:', result.status);
            this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
            return false;
        }
    } catch (error) {
        console.error('❌ Error in authenticateAndRetrieve:', error);
        return false;
    }
}

// Helper methods (all under 50 lines each)

/**
 * Helper: Handle file URL when info is successfully retrieved (29 lines)
 */
async _handleFileUrlWithInfo(clipId, infoData, password) {
    console.log('✅ File info retrieved - checking password requirements');
    
    if (infoData.hasPassword && !password) {
        UIHelpers.showPasswordSection();
        this.showToast(getInfoMessage('FILE_PASSWORD_REQUIRED'), 'info');
        return false;
    }
    
    // No password required or password provided - proceed with file retrieval
    const result = await this.apiClient.getClip(clipId);
    
    if (result.success) {
        result.data.hasPassword = infoData.hasPassword;
        await this.showRetrieveResult(result.data);
        return true;
    } else {
        this.showToast(getErrorMessage('FAILED_TO_LOAD_FILE'), 'error');
        return false;
    }
}

/**
 * Helper: Handle file URL authentication errors (35 lines)
 */
async _handleFileUrlAuthError(clipId, infoData, password) {
    const fileRequiresPassword = infoData?.hasPassword === true;
    
    if (!password && fileRequiresPassword) {
        UIHelpers.showPasswordSection();
        this.showToast(getInfoMessage('FILE_PASSWORD_REQUIRED'), 'info');
        return false;
    } else if (password) {
        // Retry with Zero-Knowledge Access Code system
        const accessCodeHash = await this.generateAccessCodeHash(password);
        const infoResult = await this.apiClient.getClipInfo(clipId, accessCodeHash);
        
        if (infoResult.success) {
            return await this.authenticateAndRetrieve(clipId, password);
        } else {
            this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
            return false;
        }
    } else {
        this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
        return false;
    }
}

/**
 * Helper: Handle normal clip with URL secret (23 lines)
 */
async _handleNormalClipWithSecret(clipId, password) {
    // Always check clip info first to see if password is required
    const infoResult = await this.apiClient.getClipInfo(clipId);
    
    // If clip requires password but user hasn't provided one, show password form
    if (infoResult.data?.hasPassword && !password) {
        UIHelpers.showPasswordSection();
        this.blockAutoRetrieve = true;
        this.showToast(getInfoMessage('PASSWORD_REQUIRED_ABOVE'), 'info');
        return false;
    }
    
    if (infoResult.success) {
        return await this.authenticateAndRetrieve(clipId, password);
    } else if ((infoResult.status === 401 || infoResult.status === 403) && 
               !password && infoResult.data?.hasPassword === true) {
        UIHelpers.showPasswordSection();
        this.showToast(getInfoMessage('PASSWORD_REQUIRED'), 'info');
        return false;
    } else {
        this.showToast(getErrorMessage('ACCESS_DENIED_PASSWORD'), 'error');
        return false;
    }
}

/**
 * Helper: Handle normal clip without URL secret (20 lines)
 */
async _handleNormalClipWithoutSecret(clipId, password) {
    const infoResult = await this.apiClient.getClipInfo(clipId);
    
    if (infoResult.success) {
        if (infoResult.data?.hasPassword && !password) {
            UIHelpers.showPasswordSection();
            return false;
        }
        
        return await this.authenticateAndRetrieve(clipId, password);
    } else if (infoResult.status === 401 || infoResult.status === 403) {
        this.showToast(getErrorMessage('ACCESS_DENIED'), 'error');
        return false;
    } else {
        console.log('❌ Clip not found or expired:', clipId);
        return false;
    }
}
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
 * Centralized error messages and constants
 * Eliminates message duplication throughout the codebase
 */

// Error Messages
export const ERROR_MESSAGES = {
    // Authentication & Access
    ACCESS_DENIED: '❌ Access denied: Invalid credentials or clip not found',
    ACCESS_DENIED_FILE: '🔐 Access denied: Invalid file URL (missing secret)',
    ACCESS_DENIED_PASSWORD: '🔐 Access denied: Invalid URL secret or password',
    INVALID_CREDENTIALS: '❌ Invalid credentials',
    AUTHENTICATION_FAILED: '🔐 Authentication failed - please check your credentials',
    
    // File & Content Errors
    FILE_NOT_FOUND: '❌ File not found or expired',
    CLIP_NOT_FOUND: '❌ Clip not found or expired',
    FAILED_TO_LOAD_FILE: '❌ Failed to load file',
    FAILED_TO_ACCESS_FILE: '❌ Failed to access file',
    FAILED_TO_RETRIEVE: '❌ Failed to retrieve content',
    FAILED_TO_SHARE: '❌ Failed to share content',
    
    // Encryption & Decryption
    DECRYPTION_FAILED: '❌ Failed to decrypt content',
    ENCRYPTION_FAILED: '❌ Failed to encrypt content',
    INVALID_PASSWORD: '❌ Invalid password',
    
    // Upload & Download
    UPLOAD_FAILED: '❌ Upload failed',
    DOWNLOAD_FAILED: '❌ Download failed',
    FILE_TOO_LARGE: '❌ File too large',
    INVALID_FILE_TYPE: '❌ Invalid file type',
    
    // Server & Network
    SERVER_ERROR: '❌ Server error occurred',
    NETWORK_ERROR: '❌ Network error occurred',
    TIMEOUT_ERROR: '❌ Request timed out',
    
    // General
    UNKNOWN_ERROR: '❌ An unknown error occurred',
    OPERATION_FAILED: '❌ Operation failed',
    VALIDATION_FAILED: '❌ Validation failed'
};

// Success Messages
export const SUCCESS_MESSAGES = {
    CONTENT_SHARED: '✅ Content shared successfully!',
    CONTENT_RETRIEVED: '✅ Content retrieved successfully!',
    FILE_UPLOADED: '✅ File uploaded successfully!',
    FILE_DOWNLOADED: '✅ File downloaded successfully!',
    CLIPBOARD_COPIED: '✅ Copied to clipboard!',
    OPERATION_SUCCESSFUL: '✅ Operation completed successfully!'
};

// Info Messages
export const INFO_MESSAGES = {
    PASSWORD_REQUIRED: '🔐 This clip requires a password. Please enter it below.',
    PASSWORD_REQUIRED_ABOVE: '🔒 This clip requires a password. Please enter it above.',
    FILE_PASSWORD_REQUIRED: '🔐 This file requires a password. Please enter it below.',
    LOADING: '⏳ Loading...',
    PROCESSING: '⚙️ Processing...',
    UPLOADING: '📤 Uploading...',
    DOWNLOADING: '📥 Downloading...'
};

// Toast Types
export const TOAST_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info',
    WARNING: 'warning'
};

// Helper functions for consistent message retrieval
export function getErrorMessage(key) {
    return ERROR_MESSAGES[key] || ERROR_MESSAGES.UNKNOWN_ERROR;
}

export function getSuccessMessage(key) {
    return SUCCESS_MESSAGES[key] || SUCCESS_MESSAGES.OPERATION_SUCCESSFUL;
}

export function getInfoMessage(key) {
    return INFO_MESSAGES[key] || 'ℹ️ Information';
}
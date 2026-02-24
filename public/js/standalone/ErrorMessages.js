/*
 * Copyright (C) 2025 Qopy App
 * Centralized error messages - standalone version for plain scripts
 */
(function (global) {
    'use strict';
    global.ERROR_MESSAGES = {
        ACCESS_DENIED: '❌ Access denied: Invalid credentials or clip not found',
        ACCESS_DENIED_FILE: '🔐 Access denied: Invalid file URL (missing secret)',
        ACCESS_DENIED_PASSWORD: '🔐 Access denied: Invalid URL secret or password',
        INVALID_CREDENTIALS: '❌ Invalid credentials',
        AUTHENTICATION_FAILED: '🔐 Authentication failed - please check your credentials',
        FILE_NOT_FOUND: '❌ File not found or expired',
        CLIP_NOT_FOUND: '❌ Clip not found or expired',
        FAILED_TO_LOAD_FILE: '❌ Failed to load file',
        FAILED_TO_ACCESS_FILE: '❌ Failed to access file',
        FAILED_TO_RETRIEVE: '❌ Failed to retrieve content',
        FAILED_TO_SHARE: '❌ Failed to share content',
        DECRYPTION_FAILED: '❌ Failed to decrypt content',
        ENCRYPTION_FAILED: '❌ Failed to encrypt content',
        INVALID_PASSWORD: '❌ Invalid password',
        UPLOAD_FAILED: '❌ Upload failed',
        DOWNLOAD_FAILED: '❌ Download failed',
        FILE_TOO_LARGE: '❌ File too large',
        INVALID_FILE_TYPE: '❌ Invalid file type',
        SERVER_ERROR: '❌ Server error occurred',
        NETWORK_ERROR: '❌ Network error occurred',
        TIMEOUT_ERROR: '❌ Request timed out',
        UNKNOWN_ERROR: '❌ An unknown error occurred',
        OPERATION_FAILED: '❌ Operation failed',
        VALIDATION_FAILED: '❌ Validation failed'
    };
    global.INFO_MESSAGES = {
        FILE_PASSWORD_REQUIRED: '🔐 This file requires a password. Please enter it below.',
        PASSWORD_REQUIRED: '🔐 This clip requires a password. Please enter it below.'
    };
    global.SUCCESS_MESSAGES = {
        CONTENT_SHARED: '✅ Content shared successfully!',
        CONTENT_RETRIEVED: '✅ Content retrieved successfully!',
        FILE_UPLOADED: '✅ File uploaded successfully!',
        FILE_DOWNLOADED: '✅ File downloaded successfully!',
        CLIPBOARD_COPIED: '✅ Copied to clipboard!',
        OPERATION_SUCCESSFUL: '✅ Operation completed successfully!'
    };
})(typeof window !== 'undefined' ? window : globalThis);

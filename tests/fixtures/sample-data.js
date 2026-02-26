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
 *    For proprietary/commercial use. Contact qopy.quiet156@passmail.net
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

/**
 * Sample data for testing purposes
 */

const sampleUploads = [
  {
    id: 'upload-text-001',
    original_name: 'sample.txt',
    file_size: 1024,
    mime_type: 'text/plain',
    chunk_count: 1,
    chunks_received: 1,
    is_complete: true,
    temp_path: '/temp/upload-text-001',
    final_path: '/storage/upload-text-001.txt'
  },
  {
    id: 'upload-image-002',
    original_name: 'photo.jpg',
    file_size: 2048576,
    mime_type: 'image/jpeg',
    chunk_count: 5,
    chunks_received: 5,
    is_complete: true,
    temp_path: '/temp/upload-image-002',
    final_path: '/storage/upload-image-002.jpg'
  },
  {
    id: 'upload-incomplete-003',
    original_name: 'large-file.zip',
    file_size: 10485760,
    mime_type: 'application/zip',
    chunk_count: 10,
    chunks_received: 7,
    is_complete: false,
    temp_path: '/temp/upload-incomplete-003',
    final_path: null
  }
];

const sampleClips = [
  {
    id: 'clip-public-001',
    content: 'This is a public text clip for testing',
    password_hash: null,
    salt: null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    max_views: null,
    file_path: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    quick_share: false
  },
  {
    id: 'clip-protected-002',
    content: 'This is a password-protected clip',
    password_hash: 'hashed-password-123',
    salt: 'random-salt-456',
    expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    max_views: 5,
    file_path: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    quick_share: false
  },
  {
    id: 'clip-file-003',
    content: null,
    password_hash: null,
    salt: null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    max_views: null,
    file_path: '/storage/document.pdf',
    file_name: 'Important Document.pdf',
    file_size: 1024768,
    mime_type: 'application/pdf',
    quick_share: false
  },
  {
    id: 'clip-quickshare-004',
    content: 'Quick share content - auto-delete after first view',
    password_hash: null,
    salt: null,
    expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    max_views: 1,
    file_path: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    quick_share: true
  }
];

const sampleRequestBodies = {
  textUploadNew: {
    accessCodeHash: 'client-side-hash-123',
    requiresAccessCode: true,
    textContent: 'Sample text content for new upload system',
    isTextUpload: true,
    contentType: 'text'
  },
  textUploadPublic: {
    requiresAccessCode: false,
    textContent: 'Public text content',
    isTextUpload: true,
    contentType: 'text'
  },
  fileUploadLegacy: {
    password: 'legacy-password',
    urlSecret: 'legacy-url-secret-789'
  },
  quickShare: {
    textContent: 'Quick share text content',
    isTextUpload: true,
    contentType: 'text'
  },
  malformed: {
    invalidField: 'should-not-cause-errors',
    emptyObject: {},
    nullValue: null,
    undefinedValue: undefined
  }
};

const sampleSessions = [
  {
    upload_id: 'session-complete-001',
    has_password: false,
    quick_share: false,
    original_name: 'test-file.txt',
    file_size: 1024,
    chunk_count: 1,
    is_complete: true
  },
  {
    upload_id: 'session-protected-002',
    has_password: true,
    quick_share: false,
    original_name: 'protected-file.pdf',
    file_size: 2048576,
    chunk_count: 5,
    is_complete: true
  },
  {
    upload_id: 'session-quickshare-003',
    has_password: false,
    quick_share: true,
    original_name: null,
    file_size: null,
    chunk_count: null,
    is_complete: true
  }
];

const sampleEncryptionConfigs = [
  {
    passwordHash: null,
    accessCodeHash: null,
    shouldRequireAccessCode: false,
    isQuickShare: false
  },
  {
    passwordHash: 'bcrypt-hash-example',
    accessCodeHash: 'client-hash-example',
    shouldRequireAccessCode: true,
    isQuickShare: false
  },
  {
    passwordHash: null,
    accessCodeHash: null,
    shouldRequireAccessCode: false,
    isQuickShare: true
  }
];

const sampleFileStats = [
  {
    path: '/storage/small-file.txt',
    size: 1024,
    isFile: true,
    isDirectory: false,
    mtime: new Date('2025-01-01T00:00:00Z')
  },
  {
    path: '/storage/large-file.bin',
    size: 10485760,
    isFile: true,
    isDirectory: false,
    mtime: new Date('2025-01-02T12:30:00Z')
  },
  {
    path: '/storage/empty-file.txt',
    size: 0,
    isFile: true,
    isDirectory: false,
    mtime: new Date('2025-01-03T08:15:30Z')
  }
];

const sampleErrors = {
  databaseConnection: new Error('Connection to database failed'),
  fileNotFound: new Error('ENOENT: no such file or directory'),
  permissionDenied: new Error('EACCES: permission denied'),
  diskFull: new Error('ENOSPC: no space left on device'),
  invalidInput: new Error('Invalid input parameters'),
  assemblyFailed: new Error('Failed to assemble file chunks'),
  encryptionError: new Error('Encryption processing failed')
};

module.exports = {
  sampleUploads,
  sampleClips,
  sampleRequestBodies,
  sampleSessions,
  sampleEncryptionConfigs,
  sampleFileStats,
  sampleErrors
};
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

// Global test setup
const fs = require('fs-extra');
const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/qopy_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

// Ensure test directories exist
const testStoragePath = path.join(__dirname, '../../tests/fixtures/uploads');
fs.ensureDirSync(testStoragePath);

// Global test helpers
global.createTestUpload = (options = {}) => {
  return {
    id: options.id || 'test-upload-123',
    originalName: options.originalName || 'test-file.txt',
    mimeType: options.mimeType || 'text/plain',
    size: options.size || 1024,
    chunks: options.chunks || 1,
    isComplete: options.isComplete || false,
    metadata: options.metadata || {}
  };
};

global.createTestClip = (options = {}) => {
  return {
    id: options.id || 'test-clip-456',
    content: options.content || 'Test content',
    hasPassword: options.hasPassword || false,
    expiresAt: options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
    isFile: options.isFile || false,
    fileName: options.fileName || null,
    fileSize: options.fileSize || null,
    mimeType: options.mimeType || null
  };
};

// Clean up test files after each test
afterEach(async () => {
  // Clean up test upload files
  const testUploadsPath = path.join(__dirname, '../../tests/fixtures/uploads');
  if (await fs.pathExists(testUploadsPath)) {
    await fs.emptyDir(testUploadsPath);
  }
});

// Increase timeout for integration tests
jest.setTimeout(30000);
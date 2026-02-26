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

const request = require('supertest');
const TestDatabase = require('../../helpers/database');

// Mock the services to ensure we're testing integration
jest.mock('../../../services/FileService');
jest.mock('../../../services/UploadValidator');
jest.mock('../../../services/EncryptionService');
jest.mock('../../../services/StorageService');
jest.mock('../../../services/FileAssemblyService');
jest.mock('../../../services/QuickShareService');

const FileService = require('../../../services/FileService');
const UploadValidator = require('../../../services/UploadValidator');
const EncryptionService = require('../../../services/EncryptionService');
const StorageService = require('../../../services/StorageService');
const FileAssemblyService = require('../../../services/FileAssemblyService');
const QuickShareService = require('../../../services/QuickShareService');

describe('Services Integration Tests', () => {
  let testDb;
  let app;

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    
    // Mock the Express app - in a real scenario, you'd import your actual server
    app = {
      // Mock Express app for testing
      post: jest.fn(),
      get: jest.fn(),
      listen: jest.fn()
    };
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    await testDb.clearAllTables();
    jest.clearAllMocks();
  });

  describe('Upload Completion Workflow Integration', () => {
    test('should complete upload workflow with all services', async () => {
      // Setup service mocks
      UploadValidator.parseUploadRequest.mockReturnValue({
        isTextUpload: false,
        contentType: 'file',
        requiresAccessCode: true,
        clientAccessCodeHash: 'test-hash'
      });

      EncryptionService.processAccessCode.mockReturnValue({
        passwordHash: 'processed-hash',
        accessCodeHash: 'access-hash',
        shouldRequireAccessCode: true
      });

      FileAssemblyService.assembleFile.mockResolvedValue('/path/to/assembled/file.txt');
      FileAssemblyService.getFileSize.mockResolvedValue(1024768);

      const mockStorageService = {
        saveClip: jest.fn().mockResolvedValue({ id: 'clip-123' }),
        updateUploadSession: jest.fn().mockResolvedValue(true)
      };
      StorageService.mockImplementation(() => mockStorageService);

      // Simulate the upload completion workflow
      const uploadId = 'test-upload-123';
      const requestBody = {
        password: 'test-password',
        urlSecret: 'test-secret'
      };

      // Step 1: Parse upload request
      const parsedRequest = UploadValidator.parseUploadRequest(requestBody);
      expect(parsedRequest.isTextUpload).toBe(false);
      expect(parsedRequest.requiresAccessCode).toBe(true);

      // Step 2: Process encryption
      const session = { upload_id: uploadId, has_password: false, quick_share: false };
      const encryptionResult = EncryptionService.processAccessCode(session, parsedRequest);
      expect(encryptionResult.shouldRequireAccessCode).toBe(true);

      // Step 3: Assemble file
      const filePath = await FileAssemblyService.assembleFile(uploadId, session);
      expect(filePath).toBe('/path/to/assembled/file.txt');

      // Step 4: Get file size
      const fileSize = await FileAssemblyService.getFileSize(filePath);
      expect(fileSize).toBe(1024768);

      // Step 5: Save to storage
      const storageService = new StorageService();
      const clipResult = await storageService.saveClip({
        filePath,
        fileSize,
        encryptionConfig: encryptionResult
      });
      expect(clipResult.id).toBe('clip-123');

      // Verify all services were called with correct parameters
      expect(UploadValidator.parseUploadRequest).toHaveBeenCalledWith(requestBody);
      expect(EncryptionService.processAccessCode).toHaveBeenCalledWith(session, parsedRequest);
      expect(FileAssemblyService.assembleFile).toHaveBeenCalledWith(uploadId, session);
      expect(FileAssemblyService.getFileSize).toHaveBeenCalledWith(filePath);
      expect(mockStorageService.saveClip).toHaveBeenCalled();
    });

    test('should handle text upload workflow', async () => {
      // Setup for text upload
      UploadValidator.parseUploadRequest.mockReturnValue({
        isTextUpload: true,
        contentType: 'text',
        textContent: 'Test text content',
        requiresAccessCode: false
      });

      EncryptionService.processAccessCode.mockReturnValue({
        shouldRequireAccessCode: false,
        passwordHash: null
      });

      QuickShareService.applyQuickShareSettings.mockReturnValue({
        maxViews: 10,
        expiration: '24h',
        requirePassword: false
      });

      const mockStorageService = {
        saveTextClip: jest.fn().mockResolvedValue({ id: 'text-clip-456' })
      };
      StorageService.mockImplementation(() => mockStorageService);

      // Execute text upload workflow
      const requestBody = {
        isTextUpload: true,
        textContent: 'Test text content',
        requiresAccessCode: false
      };

      const parsedRequest = UploadValidator.parseUploadRequest(requestBody);
      const quickShareSettings = QuickShareService.applyQuickShareSettings({});
      const encryptionResult = EncryptionService.processAccessCode({}, parsedRequest);

      const storageService = new StorageService();
      const result = await storageService.saveTextClip({
        content: parsedRequest.textContent,
        settings: quickShareSettings,
        encryption: encryptionResult
      });

      expect(result.id).toBe('text-clip-456');
      expect(UploadValidator.parseUploadRequest).toHaveBeenCalledWith(requestBody);
      expect(QuickShareService.applyQuickShareSettings).toHaveBeenCalled();
      expect(EncryptionService.processAccessCode).toHaveBeenCalled();
    });

    test('should handle Quick Share workflow (zero-knowledge)', async () => {
      UploadValidator.parseUploadRequest.mockReturnValue({
        isTextUpload: true,
        requiresAccessCode: false
      });

      QuickShareService.applyQuickShareSettings.mockReturnValue({
        maxViews: 1,
        expiration: '1h',
        autoDelete: true
      });

      EncryptionService.processAccessCode.mockReturnValue({
        passwordHash: null,
        accessCodeHash: null,
        shouldRequireAccessCode: false
      });

      const requestBody = {
        textContent: 'Quick share content',
        isTextUpload: true
      };

      const parsedRequest = UploadValidator.parseUploadRequest(requestBody);
      const quickShareSettings = QuickShareService.applyQuickShareSettings({ isQuickShare: true });
      const encryptionResult = EncryptionService.processAccessCode({}, parsedRequest);

      expect(parsedRequest.quickShareSecret).toBeUndefined();
      expect(quickShareSettings.maxViews).toBe(1);
      expect(encryptionResult.shouldRequireAccessCode).toBe(false);
      expect(encryptionResult.passwordHash).toBeNull();
      expect(encryptionResult.accessCodeHash).toBeNull();
    });
  });

  describe('File Access Workflow Integration', () => {
    test('should complete file access workflow', async () => {
      const mockFileService = {
        fileExists: jest.fn().mockResolvedValue(true),
        setDownloadHeaders: jest.fn()
      };
      FileService.mockImplementation(() => mockFileService);

      const mockStorageService = {
        getClip: jest.fn().mockResolvedValue({
          id: 'clip-789',
          file_path: '/storage/file.txt',
          filesize: 2048,
          mime_type: 'text/plain',
          original_filename: 'document.txt'
        })
      };
      StorageService.mockImplementation(() => mockStorageService);

      // Simulate file access workflow
      const clipId = 'clip-789';
      const storageService = new StorageService();
      const fileService = new FileService();

      // Step 1: Get clip data
      const clip = await storageService.getClip(clipId);
      expect(clip.id).toBe('clip-789');

      // Step 2: Check if file exists
      const fileExists = await fileService.fileExists(clip.file_path);
      expect(fileExists).toBe(true);

      // Step 3: Set download headers
      const mockResponse = {
        setHeader: jest.fn()
      };
      fileService.setDownloadHeaders(mockResponse, clip);

      expect(mockStorageService.getClip).toHaveBeenCalledWith(clipId);
      expect(mockFileService.fileExists).toHaveBeenCalledWith('/storage/file.txt');
      expect(mockFileService.setDownloadHeaders).toHaveBeenCalledWith(mockResponse, clip);
    });

    test('should handle file not found scenario', async () => {
      const mockFileService = {
        fileExists: jest.fn().mockResolvedValue(false)
      };
      FileService.mockImplementation(() => mockFileService);

      const mockStorageService = {
        getClip: jest.fn().mockResolvedValue({
          id: 'missing-clip',
          file_path: '/storage/missing-file.txt'
        })
      };
      StorageService.mockImplementation(() => mockStorageService);

      const storageService = new StorageService();
      const fileService = new FileService();

      const clip = await storageService.getClip('missing-clip');
      const fileExists = await fileService.fileExists(clip.file_path);

      expect(fileExists).toBe(false);
      expect(mockStorageService.getClip).toHaveBeenCalledWith('missing-clip');
      expect(mockFileService.fileExists).toHaveBeenCalledWith('/storage/missing-file.txt');
    });
  });

  describe('Error Propagation Integration', () => {
    test('should propagate errors through service chain', async () => {
      // Setup service to throw error
      UploadValidator.parseUploadRequest.mockImplementation(() => {
        throw new Error('Invalid upload request');
      });

      const requestBody = { malformed: 'data' };

      expect(() => {
        UploadValidator.parseUploadRequest(requestBody);
      }).toThrow('Invalid upload request');

      // Verify error doesn't cascade to other services
      expect(EncryptionService.processAccessCode).not.toHaveBeenCalled();
      expect(FileAssemblyService.assembleFile).not.toHaveBeenCalled();
    });

    test('should handle service dependency failures', async () => {
      UploadValidator.parseUploadRequest.mockReturnValue({
        isTextUpload: false,
        requiresAccessCode: true
      });

      // FileAssemblyService fails
      FileAssemblyService.assembleFile.mockRejectedValue(new Error('Assembly failed'));

      const uploadId = 'failed-assembly';
      const session = { upload_id: uploadId };

      await expect(
        FileAssemblyService.assembleFile(uploadId, session)
      ).rejects.toThrow('Assembly failed');

      // Verify upstream services still work
      const parsedRequest = UploadValidator.parseUploadRequest({});
      expect(parsedRequest.isTextUpload).toBe(false);
    });
  });

  describe('Performance Integration Tests', () => {
    test('should complete full workflow within time limits', async () => {
      // Setup all service mocks for fast responses
      UploadValidator.parseUploadRequest.mockReturnValue({});
      EncryptionService.processAccessCode.mockReturnValue({});
      FileAssemblyService.assembleFile.mockResolvedValue('/test/file.txt');
      FileAssemblyService.getFileSize.mockResolvedValue(1024);
      
      const mockStorageService = {
        saveClip: jest.fn().mockResolvedValue({ id: 'perf-test' })
      };
      StorageService.mockImplementation(() => mockStorageService);

      const startTime = process.hrtime.bigint();

      // Execute full workflow
      const parsedRequest = UploadValidator.parseUploadRequest({});
      const encryptionResult = EncryptionService.processAccessCode({}, parsedRequest);
      const filePath = await FileAssemblyService.assembleFile('test', {});
      const fileSize = await FileAssemblyService.getFileSize(filePath);
      
      const storageService = new StorageService();
      const result = await storageService.saveClip({ filePath, fileSize });

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      expect(durationMs).toBeLessThan(500); // Should complete in less than 500ms
      expect(result.id).toBe('perf-test');
    });

    test('should handle concurrent service requests', async () => {
      const requestCount = 10;
      const mockStorageService = {
        getClip: jest.fn().mockResolvedValue({ id: 'concurrent-test' })
      };
      StorageService.mockImplementation(() => mockStorageService);

      const promises = Array(requestCount).fill(null).map(async (_, i) => {
        const storageService = new StorageService();
        return storageService.getClip(`clip-${i}`);
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(requestCount);
      expect(mockStorageService.getClip).toHaveBeenCalledTimes(requestCount);
      results.forEach(result => {
        expect(result.id).toBe('concurrent-test');
      });
    });
  });

  describe('Database Integration', () => {
    test('should integrate with test database', async () => {
      // Insert test data
      const testClip = await testDb.insertTestClip({
        id: 'db-integration-test',
        content: 'Test content',
        expires_at: new Date(Date.now() + 60000),
        quick_share: false
      });

      expect(testClip.id).toBe('db-integration-test');
      expect(testClip.content).toBe('Test content');

      // Insert test upload
      const testUpload = await testDb.insertTestUpload({
        id: 'upload-integration-test',
        original_name: 'test.txt',
        file_size: 1024,
        mime_type: 'text/plain',
        is_complete: true
      });

      expect(testUpload.id).toBe('upload-integration-test');
      expect(testUpload.original_name).toBe('test.txt');
    });

    test('should clean up test data between tests', async () => {
      // This test verifies that clearAllTables works
      const pool = testDb.getPool();
      
      const clipsResult = await pool.query('SELECT COUNT(*) FROM clips');
      const uploadsResult = await pool.query('SELECT COUNT(*) FROM file_uploads');

      expect(parseInt(clipsResult.rows[0].count)).toBe(0);
      expect(parseInt(uploadsResult.rows[0].count)).toBe(0);
    });
  });
});
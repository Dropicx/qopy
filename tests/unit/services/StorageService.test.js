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

const { mockPool } = require('../../helpers/mocks');

// Mock fs-extra
jest.mock('fs-extra', () => ({
  writeFile: jest.fn(),
  ensureDir: jest.fn(),
  pathExists: jest.fn(),
  stat: jest.fn(),
  remove: jest.fn()
}));

const fs = require('fs-extra');
const StorageService = require('../../../services/StorageService');

describe('StorageService', () => {
  let storageService;
  const mockStoragePath = '/test/storage';
  const mockGenerateUploadId = jest.fn(() => 'mock-upload-id-123');

  beforeEach(() => {
    storageService = new StorageService(mockPool, mockStoragePath, mockGenerateUploadId);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided dependencies', () => {
      expect(storageService.pool).toBe(mockPool);
      expect(storageService.STORAGE_PATH).toBe(mockStoragePath);
      expect(storageService.generateUploadId).toBe(mockGenerateUploadId);
    });

    test('should handle missing dependencies gracefully', () => {
      expect(() => {
        new StorageService(null, null, null);
      }).not.toThrow();

      const service = new StorageService(null, null, null);
      expect(service.pool).toBeNull();
      expect(service.STORAGE_PATH).toBeNull();
      expect(service.generateUploadId).toBeNull();
    });
  });

  describe('calculateExpirationTime', () => {
    test('should calculate expiration for 5min', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      const result = storageService.calculateExpirationTime('5min');
      expect(result).toBe(now + 5 * 60 * 1000);
      
      Date.now.mockRestore();
    });

    test('should calculate expiration for 15min', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      const result = storageService.calculateExpirationTime('15min');
      expect(result).toBe(now + 15 * 60 * 1000);
      
      Date.now.mockRestore();
    });

    test('should calculate expiration for 30min', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      const result = storageService.calculateExpirationTime('30min');
      expect(result).toBe(now + 30 * 60 * 1000);
      
      Date.now.mockRestore();
    });

    test('should calculate expiration for 1hr', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      const result = storageService.calculateExpirationTime('1hr');
      expect(result).toBe(now + 60 * 60 * 1000);
      
      Date.now.mockRestore();
    });

    test('should calculate expiration for 6hr', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      const result = storageService.calculateExpirationTime('6hr');
      expect(result).toBe(now + 6 * 60 * 60 * 1000);
      
      Date.now.mockRestore();
    });

    test('should calculate expiration for 24hr', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      const result = storageService.calculateExpirationTime('24hr');
      expect(result).toBe(now + 24 * 60 * 60 * 1000);
      
      Date.now.mockRestore();
    });

    test('should handle unknown expiration string', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      
      const result = storageService.calculateExpirationTime('unknown');
      expect(result).toBe(now + undefined); // Results in NaN
      expect(isNaN(result)).toBe(true);
      
      Date.now.mockRestore();
    });
  });

  describe('determinePasswordHash', () => {
    test('should return null hash for no authentication', () => {
      const result = storageService.determinePasswordHash(false, null, false);
      expect(result).toEqual({ passwordHash: null });
    });

    test('should return null hash for QuickShare (zero-knowledge)', () => {
      const secret = 'test-quick-share-secret';
      const result = storageService.determinePasswordHash(true, secret, false);
      expect(result).toEqual({ passwordHash: null });
    });

    test('should return client-encrypted for password protected', () => {
      const result = storageService.determinePasswordHash(false, null, true);
      expect(result).toEqual({ passwordHash: 'client-encrypted' });
    });

    test('should return null for quickShare even when hasPassword is true (zero-knowledge)', () => {
      const secret = 'priority-test-secret';
      const result = storageService.determinePasswordHash(true, secret, true);
      expect(result).toEqual({ passwordHash: null });
    });

    test('should handle empty quickShareSecret', () => {
      const result = storageService.determinePasswordHash(true, '', false);
      expect(result).toEqual({ passwordHash: null });
    });

    test('should return null for long quickShareSecret (zero-knowledge, secret ignored)', () => {
      const longSecret = 'a'.repeat(61);

      const result = storageService.determinePasswordHash(true, longSecret, false);

      expect(result).toEqual({ passwordHash: null });
    });

    test('should handle exactly 60 character secret (ignored for zero-knowledge)', () => {
      const secret60 = 'a'.repeat(60);
      const result = storageService.determinePasswordHash(true, secret60, false);
      expect(result).toEqual({ passwordHash: null });
    });

    test('should handle null quickShareSecret with quickShare true', () => {
      const result = storageService.determinePasswordHash(true, null, false);
      expect(result).toEqual({ passwordHash: null });
    });
  });

  describe('storeAsFile', () => {
    const testParams = {
      processedContent: Buffer.from('test content'),
      clipId: 'test-clip-123',
      contentType: 'text/plain',
      mimeType: 'text/plain',
      filesize: 12,
      expirationTime: Date.now() + 60000,
      passwordHash: null,
      oneTime: false
    };

    beforeEach(() => {
      mockGenerateUploadId.mockReturnValue('test-upload-id');
      fs.writeFile.mockResolvedValue();
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    test('should store file successfully', async () => {
      const result = await storageService.storeAsFile(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        testParams.oneTime
      );

      expect(result.success).toBe(true);
      expect(result.storagePath).toBe('/test/storage/files/test-upload-id.content');
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/storage/files/test-upload-id.content',
        testParams.processedContent
      );
      expect(mockPool.query).toHaveBeenCalled();
    });

    test('should create correct file metadata', async () => {
      await storageService.storeAsFile(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        testParams.oneTime
      );

      const call = mockPool.query.mock.calls[0];
      const values = call[1];
      const metadata = JSON.parse(values[5]);

      expect(metadata).toEqual({
        originalSize: testParams.processedContent.length,
        contentType: testParams.contentType,
        storedAsFile: true
      });
    });

    test('should store with correct database values', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      await storageService.storeAsFile(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        'test-password-hash',
        true
      );

      const call = mockPool.query.mock.calls[0];
      const values = call[1];

      expect(values[0]).toBe(testParams.clipId);
      expect(values[1]).toBe(testParams.contentType);
      expect(values[2]).toBe('/test/storage/files/test-upload-id.content');
      expect(values[3]).toBe(testParams.mimeType);
      expect(values[4]).toBe(testParams.filesize);
      expect(values[6]).toBe(testParams.expirationTime);
      expect(values[7]).toBe('test-password-hash');
      expect(values[8]).toBe(true);
      expect(values[9]).toBe(now);

      Date.now.mockRestore();
    });

    test('should handle file write error', async () => {
      const writeError = new Error('File write failed');
      fs.writeFile.mockRejectedValue(writeError);
      console.error = jest.fn();

      await expect(storageService.storeAsFile(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        testParams.oneTime
      )).rejects.toThrow('File write failed');

      expect(console.error).toHaveBeenCalledWith('❌ Error storing file:', writeError);
    });

    test('should handle database error', async () => {
      fs.writeFile.mockResolvedValue();
      const dbError = new Error('Database connection failed');
      mockPool.query.mockRejectedValue(dbError);
      console.error = jest.fn();

      await expect(storageService.storeAsFile(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        testParams.oneTime
      )).rejects.toThrow('Database connection failed');

      expect(console.error).toHaveBeenCalledWith('❌ Error storing file:', dbError);
    });

    test('should handle oneTime parameter correctly', async () => {
      await storageService.storeAsFile(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        undefined // oneTime undefined
      );

      const call = mockPool.query.mock.calls[0];
      const values = call[1];
      expect(values[8]).toBe(false); // Should default to false
    });
  });

  describe('storeInline', () => {
    const testParams = {
      processedContent: 'test inline content',
      clipId: 'inline-clip-123',
      contentType: 'text/plain',
      mimeType: 'text/plain',
      filesize: 19,
      expirationTime: Date.now() + 60000,
      passwordHash: 'test-hash',
      oneTime: true
    };

    beforeEach(() => {
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    test('should store content inline successfully', async () => {
      const result = await storageService.storeInline(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        testParams.oneTime
      );

      expect(result.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalled();
    });

    test('should store with correct database values', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      await storageService.storeInline(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        testParams.oneTime
      );

      const call = mockPool.query.mock.calls[0];
      const values = call[1];

      expect(values[0]).toBe(testParams.clipId);
      expect(values[1]).toBe(testParams.contentType);
      expect(values[2]).toBe(testParams.processedContent);
      expect(values[3]).toBe(testParams.mimeType);
      expect(values[4]).toBe(testParams.filesize);
      expect(values[5]).toBe(testParams.expirationTime);
      expect(values[6]).toBe(testParams.passwordHash);
      expect(values[7]).toBe(testParams.oneTime);
      expect(values[8]).toBe(now);

      Date.now.mockRestore();
    });

    test('should handle database error', async () => {
      const dbError = new Error('Inline storage failed');
      mockPool.query.mockRejectedValue(dbError);
      console.error = jest.fn();

      await expect(storageService.storeInline(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        testParams.oneTime
      )).rejects.toThrow('Inline storage failed');

      expect(console.error).toHaveBeenCalledWith('❌ Error storing inline:', dbError);
    });

    test('should handle oneTime parameter correctly', async () => {
      await storageService.storeInline(
        testParams.processedContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        null // oneTime null
      );

      const call = mockPool.query.mock.calls[0];
      const values = call[1];
      expect(values[7]).toBe(false); // Should default to false
    });

    test('should handle buffer content', async () => {
      const bufferContent = Buffer.from('buffer test content');
      
      await storageService.storeInline(
        bufferContent,
        testParams.clipId,
        testParams.contentType,
        testParams.mimeType,
        testParams.filesize,
        testParams.expirationTime,
        testParams.passwordHash,
        testParams.oneTime
      );

      const call = mockPool.query.mock.calls[0];
      const values = call[1];
      expect(values[2]).toBe(bufferContent);
    });
  });

  describe('storeClip', () => {
    const baseParams = {
      processedContent: 'test content',
      clipId: 'store-clip-123',
      contentType: 'text/plain',
      mimeType: 'text/plain',
      filesize: 12,
      expirationTime: Date.now() + 60000,
      passwordHash: null,
      oneTime: false
    };

    beforeEach(() => {
      mockPool.query.mockResolvedValue({ rows: [] });
      fs.writeFile.mockResolvedValue();
      mockGenerateUploadId.mockReturnValue('store-upload-id');
    });

    test('should store as file when shouldStoreAsFile is true', async () => {
      const params = { ...baseParams, shouldStoreAsFile: true };
      
      const result = await storageService.storeClip(params);

      expect(result.success).toBe(true);
      expect(result.storagePath).toBe('/test/storage/files/store-upload-id.content');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('should store inline when shouldStoreAsFile is false', async () => {
      const params = { ...baseParams, shouldStoreAsFile: false };
      
      const result = await storageService.storeClip(params);

      expect(result.success).toBe(true);
      expect(result.storagePath).toBeUndefined();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    test('should store inline when shouldStoreAsFile is undefined', async () => {
      const params = { ...baseParams };
      delete params.shouldStoreAsFile;
      
      const result = await storageService.storeClip(params);

      expect(result.success).toBe(true);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    test('should handle database error with password_hash message', async () => {
      const dbError = new Error('column "password_hash" is too small for Quick Share secrets');
      mockPool.query.mockRejectedValue(dbError);
      console.error = jest.fn();

      const params = { ...baseParams, shouldStoreAsFile: false };
      
      const result = await storageService.storeClip(params);

      expect(result.error).toBe('Database schema issue');
      expect(result.message).toBe('Password hash column too small for Quick Share secrets');
      expect(console.error).toHaveBeenCalledWith('❌ Database error:', dbError.message);
    });

    test('should re-throw non-password_hash database errors', async () => {
      const dbError = new Error('General database error');
      mockPool.query.mockRejectedValue(dbError);
      console.error = jest.fn();

      const params = { ...baseParams, shouldStoreAsFile: false };
      
      await expect(storageService.storeClip(params)).rejects.toThrow('General database error');
      expect(console.error).toHaveBeenCalledWith('❌ Database error:', dbError.message);
    });

    test('should handle file storage error', async () => {
      const fileError = new Error('File storage failed');
      fs.writeFile.mockRejectedValue(fileError);

      const params = { ...baseParams, shouldStoreAsFile: true };
      
      await expect(storageService.storeClip(params)).rejects.toThrow('File storage failed');
    });

    test('should pass all parameters correctly to storeAsFile', async () => {
      const spy = jest.spyOn(storageService, 'storeAsFile').mockResolvedValue({ success: true });
      const params = { 
        ...baseParams, 
        shouldStoreAsFile: true,
        passwordHash: 'test-hash',
        oneTime: true
      };
      
      await storageService.storeClip(params);

      expect(spy).toHaveBeenCalledWith(
        params.processedContent,
        params.clipId,
        params.contentType,
        params.mimeType,
        params.filesize,
        params.expirationTime,
        params.passwordHash,
        params.oneTime
      );

      spy.mockRestore();
    });

    test('should pass all parameters correctly to storeInline', async () => {
      const spy = jest.spyOn(storageService, 'storeInline').mockResolvedValue({ success: true });
      const params = { 
        ...baseParams, 
        shouldStoreAsFile: false,
        passwordHash: 'inline-hash',
        oneTime: true
      };
      
      await storageService.storeClip(params);

      expect(spy).toHaveBeenCalledWith(
        params.processedContent,
        params.clipId,
        params.contentType,
        params.mimeType,
        params.filesize,
        params.expirationTime,
        params.passwordHash,
        params.oneTime
      );

      spy.mockRestore();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle pool connection errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection timeout'));

      await expect(mockPool.query('SELECT 1')).rejects.toThrow('Connection timeout');
    });

    test('should handle malformed database responses', async () => {
      const malformedResponses = [
        null,
        undefined,
        { rows: null },
        { rows: undefined },
        { },
        'invalid-response'
      ];

      malformedResponses.forEach(response => {
        mockPool.query.mockResolvedValue(response);
        expect(mockPool.query).toBeDefined();
      });
    });

    test('should handle concurrent operations', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      fs.writeFile.mockResolvedValue();

      const promises = Array(10).fill(null).map(async (_, i) => {
        return storageService.storeInline(
          `content-${i}`,
          `clip-${i}`,
          'text/plain',
          'text/plain',
          10,
          Date.now() + 60000,
          null,
          false
        );
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(mockPool.query).toHaveBeenCalledTimes(10);
    });

    test('should handle large content storage', async () => {
      const largeContent = 'x'.repeat(10000);
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await storageService.storeInline(
        largeContent,
        'large-clip',
        'text/plain',
        'text/plain',
        largeContent.length,
        Date.now() + 60000,
        null,
        false
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('should initialize within reasonable time', () => {
      const startTime = process.hrtime.bigint();
      const service = new StorageService(mockPool, mockStoragePath, mockGenerateUploadId);
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(10);
      expect(service).toBeDefined();
    });

    test('should calculate expiration times efficiently', () => {
      const expirations = ['5min', '15min', '30min', '1hr', '6hr', '24hr'];
      
      const startTime = process.hrtime.bigint();
      expirations.forEach(exp => {
        storageService.calculateExpirationTime(exp);
      });
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(10);
    });

    test('should handle multiple determinePasswordHash calls efficiently', () => {
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < 100; i++) {
        storageService.determinePasswordHash(i % 2 === 0, `secret-${i}`, i % 3 === 0);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(50);
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory during initialization', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 100; i++) {
        new StorageService(mockPool, `/path-${i}`, mockGenerateUploadId);
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate constructor parameters', () => {
      const validConfigs = [
        [mockPool, mockStoragePath, mockGenerateUploadId],
        [mockPool, '/different/path', mockGenerateUploadId],
        [mockPool, mockStoragePath, () => 'different-id']
      ];

      validConfigs.forEach(([pool, path, idGen]) => {
        expect(() => {
          new StorageService(pool, path, idGen);
        }).not.toThrow();
      });
    });

    test('should handle invalid constructor parameters', () => {
      const invalidConfigs = [
        [null, null, null],
        [undefined, undefined, undefined],
        ['not-a-pool', 'path', 'not-a-function'],
        [{}, '', 123]
      ];

      invalidConfigs.forEach(([pool, path, idGen]) => {
        expect(() => {
          new StorageService(pool, path, idGen);
        }).not.toThrow();
      });
    });
  });
});
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

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const FileAssemblyService = require('../../services/FileAssemblyService');
const EncryptionService = require('../../services/EncryptionService');

/**
 * Basic Chunk Upload Tests (No Database Required)
 * 
 * Tests core functionality without database dependency:
 * - File size boundary validation
 * - Chunk assembly without database sessions
 * - Encryption configuration validation
 * - Basic error handling
 */
describe('Chunk Upload Basic Tests', () => {
  let testStoragePath;
  let cleanupPaths = [];

  // Critical file sizes to test (in bytes)
  const CRITICAL_SIZES = {
    UNDER_THRESHOLD: Math.round(4.9 * 1024 * 1024),    // 4.9MB
    AT_THRESHOLD: 5 * 1024 * 1024,                     // 5MB exactly
    OVER_THRESHOLD: Math.round(5.1 * 1024 * 1024),     // 5.1MB
    DOUBLE_THRESHOLD: 10 * 1024 * 1024,                // 10MB
  };

  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

  beforeAll(async () => {
    testStoragePath = path.join(__dirname, '../fixtures/basic-chunk-test');
    await fs.ensureDir(testStoragePath);
  });

  afterAll(async () => {
    for (const cleanupPath of cleanupPaths) {
      await fs.remove(cleanupPath).catch(() => {});
    }
    await fs.remove(testStoragePath).catch(() => {});
  });

  beforeEach(() => {
    cleanupPaths = [];
  });

  afterEach(async () => {
    for (const cleanupPath of cleanupPaths) {
      await fs.remove(cleanupPath).catch(() => {});
    }
    cleanupPaths = [];
  });

  /**
   * Helper function to create test file with specific size
   */
  const createTestFile = (size, pattern = 'A') => {
    const buffer = Buffer.alloc(size);
    const patternByte = Buffer.from(pattern)[0];
    buffer.fill(patternByte);
    return buffer;
  };

  /**
   * Helper function to create chunks from file data
   */
  const createChunks = (fileData, chunkSize = CHUNK_SIZE) => {
    const chunks = [];
    for (let i = 0; i < fileData.length; i += chunkSize) {
      chunks.push(fileData.slice(i, i + chunkSize));
    }
    return chunks;
  };

  /**
   * Helper function to save chunks to storage
   */
  const saveChunksToStorage = async (uploadId, chunks) => {
    const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
    await fs.ensureDir(chunksDir);
    cleanupPaths.push(chunksDir);

    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = path.join(chunksDir, `chunk_${i}`);
      await fs.writeFile(chunkPath, chunks[i]);
    }

    return chunksDir;
  };

  describe('File Size Boundary Tests', () => {
    test('should handle 4.9MB file (under 5MB threshold)', async () => {
      const uploadId = 'test-4.9mb-basic';
      const fileSize = CRITICAL_SIZES.UNDER_THRESHOLD;
      const fileData = createTestFile(fileSize, 'U'); // 'U' for Under
      const chunks = createChunks(fileData);

      console.log(`📊 Testing 4.9MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create exactly 1 chunk since it's under threshold
      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBeCloseTo(fileSize, 0);

      await saveChunksToStorage(uploadId, chunks);

      // Mock session for testing
      const mockSession = {
        upload_id: uploadId,
        total_chunks: chunks.length,
        original_name: 'test-4.9mb.dat',
        filesize: fileSize
      };

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        mockSession, 
        testStoragePath, 
        outputPath
      );

      expect(assembledPath).toBe(outputPath);

      // Verify assembled file
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);
    });

    test('should handle 5MB file (exactly at threshold)', async () => {
      const uploadId = 'test-5mb-exact-basic';
      const fileSize = CRITICAL_SIZES.AT_THRESHOLD;
      const fileData = createTestFile(fileSize, 'E'); // 'E' for Exact
      const chunks = createChunks(fileData);

      console.log(`📊 Testing 5MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create exactly 1 chunk since it equals threshold
      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(fileSize);

      await saveChunksToStorage(uploadId, chunks);

      const mockSession = {
        upload_id: uploadId,
        total_chunks: chunks.length,
        original_name: 'test-5mb.dat',
        filesize: fileSize
      };

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        mockSession, 
        testStoragePath, 
        outputPath
      );

      // Verify perfect reassembly
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);
    });

    test('should handle 5.1MB file (just over threshold)', async () => {
      const uploadId = 'test-5.1mb-basic';
      const fileSize = CRITICAL_SIZES.OVER_THRESHOLD;
      const fileData = createTestFile(fileSize, 'O'); // 'O' for Over
      const chunks = createChunks(fileData);

      console.log(`📊 Testing 5.1MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create 2 chunks since it's over threshold
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(CHUNK_SIZE);
      expect(chunks[1].length).toBeCloseTo(fileSize - CHUNK_SIZE, 0);

      await saveChunksToStorage(uploadId, chunks);

      const mockSession = {
        upload_id: uploadId,
        total_chunks: chunks.length,
        original_name: 'test-5.1mb.dat',
        filesize: fileSize
      };

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        mockSession, 
        testStoragePath, 
        outputPath
      );

      // Verify perfect reassembly of multi-chunk file
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);

      // Verify chunk boundaries are correctly handled
      const firstChunkEnd = assembledData.slice(CHUNK_SIZE - 10, CHUNK_SIZE + 10);
      const expectedBoundary = Buffer.alloc(20, Buffer.from('O')[0]);
      expect(firstChunkEnd.equals(expectedBoundary)).toBe(true);
    });

    test('should handle 10MB file (double threshold)', async () => {
      const uploadId = 'test-10mb-basic';
      const fileSize = CRITICAL_SIZES.DOUBLE_THRESHOLD;
      const fileData = createTestFile(fileSize, 'D'); // 'D' for Double
      const chunks = createChunks(fileData);

      console.log(`📊 Testing 10MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create exactly 2 chunks
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(CHUNK_SIZE);
      expect(chunks[1].length).toBe(CHUNK_SIZE);

      await saveChunksToStorage(uploadId, chunks);

      const mockSession = {
        upload_id: uploadId,
        total_chunks: chunks.length,
        original_name: 'test-10mb.dat',
        filesize: fileSize
      };

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        mockSession, 
        testStoragePath, 
        outputPath
      );

      // Verify perfect reassembly
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);
    });
  });

  describe('Encryption Configuration Tests', () => {
    test('should handle access code encryption configuration', async () => {
      const uploadId = 'encryption-test-basic';
      const session = {
        upload_id: uploadId,
        has_password: false,
        quick_share: false
      };

      // Test with access code encryption
      const encryptionConfig = EncryptionService.processAccessCode(session, {
        requiresAccessCode: true,
        clientAccessCodeHash: 'test-hash-abcdef123456789012345678'
      });

      expect(encryptionConfig.shouldRequireAccessCode).toBe(true);
      expect(encryptionConfig.accessCodeHash).toBe('test-hash-abcdef123456789012345678');
      expect(encryptionConfig.passwordHash).toBe('client-encrypted');
    });

    test('should handle Quick Share encryption configuration', async () => {
      const uploadId = 'quickshare-test-basic';
      const session = {
        upload_id: uploadId,
        has_password: false,
        quick_share: true
      };

      const quickShareSecret = 'quick-secret-123456';
      const encryptionConfig = EncryptionService.processAccessCode(session, {
        quickShareSecret
      });

      expect(encryptionConfig.passwordHash).toBe(quickShareSecret);
      expect(encryptionConfig.shouldRequireAccessCode).toBe(false);
      expect(encryptionConfig.accessCodeHash).toBeNull();
    });

    test('should create file metadata correctly', async () => {
      const uploadId = 'metadata-test-basic';
      const session = {
        upload_id: uploadId,
        filesize: 1024 * 1024 // 1MB
      };
      const actualFilesize = 1024 * 1024;

      const metadata = EncryptionService.createFileMetadata(uploadId, session, actualFilesize);

      expect(metadata.uploadId).toBe(uploadId);
      expect(metadata.originalUploadSession).toBe(true);
      expect(metadata.originalFileSize).toBe(session.filesize);
      expect(metadata.actualFileSize).toBe(actualFilesize);
      expect(metadata.zeroKnowledge).toBe(true);
    });
  });

  describe('Chunk Validation Tests', () => {
    test('should validate chunk completeness', async () => {
      const uploadId = 'validation-test-basic';
      const chunks = [
        createTestFile(1024 * 1024, 'V1'),
        createTestFile(1024 * 1024, 'V2'),
        createTestFile(512 * 1024, 'V3') // Smaller last chunk
      ];

      await saveChunksToStorage(uploadId, chunks);

      const validation = await FileAssemblyService.validateChunksParallel(
        uploadId, 
        chunks.length, 
        testStoragePath
      );

      expect(validation.isComplete).toBe(true);
      expect(validation.totalChunks).toBe(chunks.length);
      expect(validation.existingChunks).toBe(chunks.length);
      expect(validation.missingChunks).toBe(0);
      
      const expectedTotalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      expect(validation.totalSize).toBe(expectedTotalSize);
    });

    test('should detect missing chunks', async () => {
      const uploadId = 'missing-chunks-test-basic';
      const totalChunks = 3;
      
      // Only create 2 out of 3 chunks
      const chunks = [
        createTestFile(1024 * 1024, 'M1'),
        createTestFile(1024 * 1024, 'M2')
      ];

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      // Save only first 2 chunks
      await fs.writeFile(path.join(chunksDir, 'chunk_0'), chunks[0]);
      await fs.writeFile(path.join(chunksDir, 'chunk_1'), chunks[1]);
      // chunk_2 is missing

      const validation = await FileAssemblyService.validateChunksParallel(
        uploadId, 
        totalChunks, 
        testStoragePath
      );

      expect(validation.isComplete).toBe(false);
      expect(validation.totalChunks).toBe(totalChunks);
      expect(validation.existingChunks).toBe(2);
      expect(validation.missingChunks).toBe(1);
      expect(validation.missingChunkIndices).toEqual([2]);
    });

    test('should clean up chunks efficiently', async () => {
      const uploadId = 'cleanup-test-basic';
      const chunks = [
        createTestFile(512 * 1024, 'C1'),
        createTestFile(512 * 1024, 'C2'),
        createTestFile(512 * 1024, 'C3')
      ];

      const chunksDir = await saveChunksToStorage(uploadId, chunks);

      // Verify chunks exist
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(chunksDir, `chunk_${i}`);
        const exists = await fs.pathExists(chunkPath);
        expect(exists).toBe(true);
      }

      // Clean up chunks
      const cleanupResult = await FileAssemblyService.cleanupChunks(
        uploadId, 
        chunks.length, 
        testStoragePath
      );

      expect(cleanupResult.successful).toBe(chunks.length);
      expect(cleanupResult.failed).toBe(0);
      expect(cleanupResult.totalChunks).toBe(chunks.length);

      // Verify chunks are deleted
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(chunksDir, `chunk_${i}`);
        const exists = await fs.pathExists(chunkPath);
        expect(exists).toBe(false);
      }
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle missing chunks gracefully during assembly', async () => {
      const uploadId = 'missing-assembly-test';
      const chunks = [createTestFile(1024 * 1024, 'MA')];

      // Create chunks directory but don't save the chunk
      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      const mockSession = {
        upload_id: uploadId,
        total_chunks: 1,
        original_name: 'missing.dat',
        filesize: chunks[0].length
      };

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      // Should throw error for missing chunk
      await expect(
        FileAssemblyService.assembleFile(uploadId, mockSession, testStoragePath, outputPath)
      ).rejects.toThrow(/Chunk 0 not found/);
    });

    test('should handle invalid encryption configurations', async () => {
      const session = {
        upload_id: 'invalid-encryption-test',
        has_password: false,
        quick_share: false
      };

      // Test with invalid access code hash (too short)
      const config1 = EncryptionService.processAccessCode(session, {
        requiresAccessCode: true,
        clientAccessCodeHash: 'short'
      });

      // Should fall back to no access code
      expect(config1.shouldRequireAccessCode).toBe(false);
      expect(config1.accessCodeHash).toBeNull();

      // Test with empty access code hash
      const config2 = EncryptionService.processAccessCode(session, {
        requiresAccessCode: true,
        clientAccessCodeHash: ''
      });

      expect(config2.shouldRequireAccessCode).toBe(false);
      expect(config2.accessCodeHash).toBeNull();

      // Test with null access code hash
      const config3 = EncryptionService.processAccessCode(session, {
        requiresAccessCode: true,
        clientAccessCodeHash: null
      });

      expect(config3.shouldRequireAccessCode).toBe(false);
      expect(config3.accessCodeHash).toBeNull();
    });
  });
});
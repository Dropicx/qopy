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

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const TestDatabase = require('../helpers/database');
const FileAssemblyService = require('../../services/FileAssemblyService');
const EncryptionService = require('../../services/EncryptionService');
const StorageService = require('../../services/StorageService');

/**
 * Integration Tests for Chunk Upload Feature
 * 
 * Tests critical file sizes and edge cases:
 * - 4.9MB (just under 5MB threshold)
 * - 5MB (exactly at threshold)  
 * - 5.1MB (just over threshold)
 * - 10MB (double threshold)
 * - 50MB (large file)
 * 
 * Verifies:
 * - Chunking behavior at size boundaries
 * - Encryption preservation through process
 * - File reassembly accuracy
 * - Error handling and recovery
 */
describe('Chunk Upload Integration Tests', () => {
  let testDb;
  let testStoragePath;
  let cleanupPaths = [];

  // Critical file sizes to test (in bytes) - use integers to avoid floating-point/BIGINT issues
  const CRITICAL_SIZES = {
    UNDER_THRESHOLD: Math.round(4.9 * 1024 * 1024),    // 4.9MB
    AT_THRESHOLD: 5 * 1024 * 1024,                     // 5MB exactly
    OVER_THRESHOLD: Math.round(5.1 * 1024 * 1024),     // 5.1MB
    DOUBLE_THRESHOLD: 10 * 1024 * 1024,                // 10MB
    LARGE_FILE: 50 * 1024 * 1024                       // 50MB
  };

  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    testStoragePath = path.join(__dirname, '../fixtures/chunk-test-storage');
    await fs.ensureDir(testStoragePath);
  });

  afterAll(async () => {
    await testDb.teardown();
    // Clean up all test storage paths
    for (const cleanupPath of cleanupPaths) {
      await fs.remove(cleanupPath).catch(() => {}); // Ignore errors
    }
    await fs.remove(testStoragePath).catch(() => {});
  });

  beforeEach(async () => {
    await testDb.clearAllTables();
    cleanupPaths = [];
  });

  afterEach(async () => {
    // Clean up paths created during this test
    for (const cleanupPath of cleanupPaths) {
      await fs.remove(cleanupPath).catch(() => {}); // Ignore errors
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
   * Helper function to simulate chunk upload storage
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

  /**
   * Helper function to create upload session
   */
  const createUploadSession = async (uploadId, totalChunks, originalSize) => {
    return await testDb.insertTestUpload({
      id: uploadId,
      original_name: `test-${originalSize}-bytes.dat`,
      file_size: originalSize,
      mime_type: 'application/octet-stream',
      total_chunks: totalChunks,
      is_complete: true
    });
  };

  describe('Critical File Size Boundaries', () => {
    test('should handle 4.9MB file (under 5MB threshold)', async () => {
      const uploadId = 'test-4.9mb';
      const fileSize = CRITICAL_SIZES.UNDER_THRESHOLD;
      const fileData = createTestFile(fileSize, 'U'); // 'U' for Under
      const chunks = createChunks(fileData);

      console.log(`📊 Testing 4.9MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create exactly 1 chunk since it's under threshold
      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(fileSize);

      // Save chunks to storage
      await saveChunksToStorage(uploadId, chunks);

      // Create upload session
      const session = await createUploadSession(uploadId, chunks.length, fileSize);

      // Test file assembly
      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );

      expect(assembledPath).toBe(outputPath);

      // Verify assembled file
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);

      // Verify encryption metadata can be created
      const metadata = EncryptionService.createFileMetadata(uploadId, session, fileSize);
      expect(metadata.actualFileSize).toBe(fileSize);
      expect(metadata.originalFileSize).toBe(fileSize);
    });

    test('should handle 5MB file (exactly at threshold)', async () => {
      const uploadId = 'test-5mb-exact';
      const fileSize = CRITICAL_SIZES.AT_THRESHOLD;
      const fileData = createTestFile(fileSize, 'E'); // 'E' for Exact
      const chunks = createChunks(fileData);

      console.log(`📊 Testing 5MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create exactly 1 chunk since it equals threshold
      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(fileSize);

      await saveChunksToStorage(uploadId, chunks);
      const session = await createUploadSession(uploadId, chunks.length, fileSize);

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );

      // Verify perfect reassembly
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);

      // Test with encryption
      const encryptionConfig = EncryptionService.processAccessCode(
        { upload_id: uploadId, has_password: false, quick_share: false },
        { requiresAccessCode: true, clientAccessCodeHash: 'test-hash-12345' }
      );

      expect(encryptionConfig.shouldRequireAccessCode).toBe(true);
      expect(encryptionConfig.accessCodeHash).toBe('test-hash-12345');
    });

    test('should handle 5.1MB file (just over threshold)', async () => {
      const uploadId = 'test-5.1mb';
      const fileSize = CRITICAL_SIZES.OVER_THRESHOLD;
      const fileData = createTestFile(fileSize, 'O'); // 'O' for Over
      const chunks = createChunks(fileData);

      console.log(`📊 Testing 5.1MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create 2 chunks since it's over threshold
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(CHUNK_SIZE);
      expect(chunks[1].length).toBe(fileSize - CHUNK_SIZE);

      await saveChunksToStorage(uploadId, chunks);
      const session = await createUploadSession(uploadId, chunks.length, fileSize);

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
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
      const uploadId = 'test-10mb';
      const fileSize = CRITICAL_SIZES.DOUBLE_THRESHOLD;
      const fileData = createTestFile(fileSize, 'D'); // 'D' for Double
      const chunks = createChunks(fileData);

      console.log(`📊 Testing 10MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create exactly 2 chunks
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(CHUNK_SIZE);
      expect(chunks[1].length).toBe(CHUNK_SIZE);

      await saveChunksToStorage(uploadId, chunks);
      const session = await createUploadSession(uploadId, chunks.length, fileSize);

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );

      // Verify perfect reassembly
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);
    });

    test('should handle 50MB file (large multi-chunk)', async () => {
      const uploadId = 'test-50mb';
      const fileSize = CRITICAL_SIZES.LARGE_FILE;
      
      // Create file with repeating pattern for better validation
      const patternSize = 1024; // 1KB pattern
      const pattern = Buffer.alloc(patternSize);
      for (let i = 0; i < patternSize; i++) {
        pattern[i] = i % 256;
      }
      
      const fileData = Buffer.alloc(fileSize);
      for (let i = 0; i < fileSize; i += patternSize) {
        pattern.copy(fileData, i, 0, Math.min(patternSize, fileSize - i));
      }

      const chunks = createChunks(fileData);

      console.log(`📊 Testing 50MB file: ${fileSize} bytes, ${chunks.length} chunk(s)`);

      // Should create 10 chunks (50MB / 5MB = 10)
      expect(chunks.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(chunks[i].length).toBe(CHUNK_SIZE);
      }

      await saveChunksToStorage(uploadId, chunks);
      const session = await createUploadSession(uploadId, chunks.length, fileSize);

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const startTime = Date.now();
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );
      const assemblyTime = Date.now() - startTime;

      console.log(`⚡ 50MB assembly completed in ${assemblyTime}ms`);

      // Verify perfect reassembly
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);

      // Performance check - should complete within reasonable time
      expect(assemblyTime).toBeLessThan(5000); // Less than 5 seconds

      // Verify pattern integrity at chunk boundaries
      for (let chunkIdx = 1; chunkIdx < chunks.length; chunkIdx++) {
        const boundaryStart = chunkIdx * CHUNK_SIZE - 512;
        const boundaryEnd = chunkIdx * CHUNK_SIZE + 512;
        const boundaryData = assembledData.slice(boundaryStart, boundaryEnd);
        
        // Verify pattern continues across chunk boundary
        for (let i = 0; i < boundaryData.length - 1; i++) {
          const expectedNext = (boundaryData[i] + 1) % 256;
          const actualNext = boundaryData[i + 1];
          if (actualNext !== expectedNext && actualNext !== 0) {
            // Allow pattern reset at 1KB boundaries
            expect((boundaryStart + i + 1) % patternSize).toBe(0);
          }
        }
      }
    });
  });

  describe('Encryption Integration with Chunking', () => {
    test('should preserve encryption settings through chunk assembly', async () => {
      const uploadId = 'test-encryption-chunks';
      const fileSize = CRITICAL_SIZES.OVER_THRESHOLD; // Use multi-chunk file
      const fileData = createTestFile(fileSize, 'S'); // 'S' for Secure
      const chunks = createChunks(fileData);

      await saveChunksToStorage(uploadId, chunks);
      const session = await createUploadSession(uploadId, chunks.length, fileSize);

      // Test with access code encryption
      const encryptionConfig = EncryptionService.processAccessCode(
        { upload_id: uploadId, has_password: false, quick_share: false },
        { 
          requiresAccessCode: true, 
          clientAccessCodeHash: 'secure-hash-abcdef123456' 
        }
      );

      expect(encryptionConfig.shouldRequireAccessCode).toBe(true);
      expect(encryptionConfig.accessCodeHash).toBe('secure-hash-abcdef123456');
      expect(encryptionConfig.passwordHash).toBe('client-encrypted');

      // Assemble file
      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );

      // Verify file integrity
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.equals(fileData)).toBe(true);

      // Create and verify metadata
      const metadata = EncryptionService.createFileMetadata(uploadId, session, fileSize);
      expect(metadata.zeroKnowledge).toBe(true);
      expect(metadata.actualFileSize).toBe(fileSize);
    });

    test('should handle Quick Share with chunked files', async () => {
      const uploadId = 'test-quickshare-chunks';
      const fileSize = CRITICAL_SIZES.DOUBLE_THRESHOLD;
      const fileData = createTestFile(fileSize, 'Q'); // 'Q' for Quick
      const chunks = createChunks(fileData);

      await saveChunksToStorage(uploadId, chunks);
      const session = await createUploadSession(uploadId, chunks.length, fileSize);
      session.quick_share = true; // Mark as quick share

      // Test Quick Share encryption
      const quickShareSecret = 'quick-secret-789';
      const encryptionConfig = EncryptionService.processAccessCode(
        session,
        { quickShareSecret }
      );

      expect(encryptionConfig.passwordHash).toBe(quickShareSecret);
      expect(encryptionConfig.shouldRequireAccessCode).toBe(false);

      // Assemble file
      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );

      // Verify file integrity maintained through Quick Share
      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.equals(fileData)).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle missing chunks gracefully', async () => {
      const uploadId = 'test-missing-chunks';
      const fileSize = CRITICAL_SIZES.OVER_THRESHOLD;
      const fileData = createTestFile(fileSize, 'M'); // 'M' for Missing
      const chunks = createChunks(fileData);

      // Save only first chunk, leave second missing
      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);
      
      await fs.writeFile(path.join(chunksDir, 'chunk_0'), chunks[0]);
      // Intentionally don't save chunk_1

      const session = await createUploadSession(uploadId, chunks.length, fileSize);
      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      // Should throw error for missing chunk
      await expect(
        FileAssemblyService.assembleFile(uploadId, session, testStoragePath, outputPath)
      ).rejects.toThrow(/Chunk 1 not found/);
    });

    test('should validate chunk completeness before assembly', async () => {
      const uploadId = 'test-validation';
      const fileSize = CRITICAL_SIZES.DOUBLE_THRESHOLD;
      const fileData = createTestFile(fileSize, 'V'); // 'V' for Validation
      const chunks = createChunks(fileData);

      await saveChunksToStorage(uploadId, chunks);

      // Test validation
      const validation = await FileAssemblyService.validateChunksParallel(
        uploadId, 
        chunks.length, 
        testStoragePath
      );

      expect(validation.isComplete).toBe(true);
      expect(validation.totalChunks).toBe(chunks.length);
      expect(validation.existingChunks).toBe(chunks.length);
      expect(validation.missingChunks).toBe(0);
      expect(validation.totalSize).toBe(fileSize);
    });

    test('should handle corrupted chunks', async () => {
      const uploadId = 'test-corrupted';
      const fileSize = CRITICAL_SIZES.OVER_THRESHOLD;
      const fileData = createTestFile(fileSize, 'C'); // 'C' for Corrupted
      const chunks = createChunks(fileData);

      // Save chunks but corrupt the second one
      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      await fs.writeFile(path.join(chunksDir, 'chunk_0'), chunks[0]);
      await fs.writeFile(path.join(chunksDir, 'chunk_1'), Buffer.from('corrupted'));

      const session = await createUploadSession(uploadId, chunks.length, fileSize);
      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      // Should assemble but result will be corrupted
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );

      const assembledData = await fs.readFile(assembledPath);
      
      // File size should be wrong due to corruption
      expect(assembledData.length).not.toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(false);
    });

    test('should handle concurrent chunk assembly operations', async () => {
      const concurrentUploads = 3;
      const promises = [];

      for (let i = 0; i < concurrentUploads; i++) {
        const uploadId = `concurrent-${i}`;
        const fileSize = CRITICAL_SIZES.AT_THRESHOLD;
        const fileData = createTestFile(fileSize, String.fromCharCode(65 + i)); // A, B, C
        const chunks = createChunks(fileData);

        const promise = (async () => {
          await saveChunksToStorage(uploadId, chunks);
          const session = await createUploadSession(uploadId, chunks.length, fileSize);
          const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
          cleanupPaths.push(outputPath);

          const assembledPath = await FileAssemblyService.assembleFile(
            uploadId, 
            session, 
            testStoragePath, 
            outputPath
          );

          const assembledData = await fs.readFile(assembledPath);
          expect(assembledData.equals(fileData)).toBe(true);
          
          return { uploadId, success: true };
        })();

        promises.push(promise);
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(concurrentUploads);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Performance and Memory Tests', () => {
    test('should handle large file assembly within memory limits', async () => {
      const uploadId = 'test-memory';
      const fileSize = CRITICAL_SIZES.LARGE_FILE; // 50MB
      
      // Monitor memory usage
      const initialMemory = process.memoryUsage();
      
      // Create file in chunks to avoid memory spike
      const chunks = [];
      const chunkCount = Math.ceil(fileSize / CHUNK_SIZE);
      
      for (let i = 0; i < chunkCount; i++) {
        const chunkSize = Math.min(CHUNK_SIZE, fileSize - (i * CHUNK_SIZE));
        chunks.push(createTestFile(chunkSize, 'L')); // 'L' for Large
      }

      await saveChunksToStorage(uploadId, chunks);
      const session = await createUploadSession(uploadId, chunks.length, fileSize);

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const startTime = Date.now();
      await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );
      const assemblyTime = Date.now() - startTime;

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`📊 Memory usage: +${Math.round(memoryIncrease / 1024 / 1024)}MB in ${assemblyTime}ms`);

      // Memory increase should be reasonable (less than 2x file size)
      expect(memoryIncrease).toBeLessThan(fileSize * 2);
      
      // Should complete in reasonable time
      expect(assemblyTime).toBeLessThan(10000); // Less than 10 seconds
    });

    test('should clean up chunks efficiently after assembly', async () => {
      const uploadId = 'test-cleanup';
      const fileSize = CRITICAL_SIZES.OVER_THRESHOLD;
      const fileData = createTestFile(fileSize, 'X'); // 'X' for cleanup
      const chunks = createChunks(fileData);

      await saveChunksToStorage(uploadId, chunks);
      const session = await createUploadSession(uploadId, chunks.length, fileSize);

      // Assemble file
      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      await FileAssemblyService.assembleFile(
        uploadId, 
        session, 
        testStoragePath, 
        outputPath
      );

      // Test cleanup
      const cleanupResult = await FileAssemblyService.cleanupChunks(
        uploadId, 
        chunks.length, 
        testStoragePath
      );

      expect(cleanupResult.successful).toBe(chunks.length);
      expect(cleanupResult.failed).toBe(0);
      expect(cleanupResult.totalChunks).toBe(chunks.length);

      // Verify chunks are actually deleted
      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(chunksDir, `chunk_${i}`);
        const exists = await fs.pathExists(chunkPath);
        expect(exists).toBe(false);
      }
    });
  });
});
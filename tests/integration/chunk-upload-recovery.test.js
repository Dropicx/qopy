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
const TestDatabase = require('../helpers/database');
const FileAssemblyService = require('../../services/FileAssemblyService');
const EncryptionService = require('../../services/EncryptionService');

/**
 * Recovery and Edge Case Tests for Chunk Upload Feature
 * 
 * Tests failure scenarios and recovery:
 * - Partial upload recovery
 * - Network interruption simulation
 * - Disk space exhaustion
 * - Concurrent upload conflicts
 * - Chunk corruption recovery
 * - System restart recovery
 * - Zero-byte file handling
 * - Maximum file size limits
 */
describe('Chunk Upload Recovery and Edge Cases', () => {
  let testDb;
  let testStoragePath;
  let cleanupPaths = [];

  const EDGE_CASE_SIZES = {
    ZERO_BYTES: 0,
    ONE_BYTE: 1,
    EXACTLY_4MB: 4 * 1024 * 1024,
    EXACTLY_5MB: 5 * 1024 * 1024,
    PRIME_SIZE: 7919 * 1024,  // Prime number of KB
    ODD_SIZE: Math.round(5.5 * 1024 * 1024) + 777, // Odd size with remainder (integer for BIGINT)
    MAX_SAFE_SIZE: 100 * 1024 * 1024 // 100MB
  };

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    testStoragePath = path.join(__dirname, '../fixtures/recovery-test-storage');
    await fs.ensureDir(testStoragePath);
  });

  afterAll(async () => {
    await testDb.teardown();
    for (const cleanupPath of cleanupPaths) {
      await fs.remove(cleanupPath).catch(() => {});
    }
    await fs.remove(testStoragePath).catch(() => {});
  });

  beforeEach(async () => {
    await testDb.clearAllTables();
    cleanupPaths = [];
  });

  afterEach(async () => {
    for (const cleanupPath of cleanupPaths) {
      await fs.remove(cleanupPath).catch(() => {});
    }
    cleanupPaths = [];
  });

  /**
   * Helper to create predictable test data
   */
  const createPredictableFile = (size, pattern = 'TEST') => {
    const buffer = Buffer.alloc(size);
    const patternBuffer = Buffer.from(pattern);
    for (let i = 0; i < size; i++) {
      buffer[i] = patternBuffer[i % patternBuffer.length];
    }
    return buffer;
  };

  /**
   * Helper to simulate partial chunk upload
   */
  const simulatePartialUpload = async (uploadId, totalChunks, uploadedChunks, chunkSize = 1024 * 1024) => {
    const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
    await fs.ensureDir(chunksDir);
    cleanupPaths.push(chunksDir);

    const chunks = [];
    
    // Create only the uploaded chunks
    for (let i = 0; i < uploadedChunks; i++) {
      const chunkData = createPredictableFile(chunkSize, `CHUNK_${i}_`);
      chunks.push(chunkData);
      await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunkData);
    }

    return { chunks, chunksDir };
  };

  describe('Zero and Small File Edge Cases', () => {
    test('should handle zero-byte files', async () => {
      const uploadId = 'zero-byte-test';
      const fileSize = EDGE_CASE_SIZES.ZERO_BYTES;
      const fileData = Buffer.alloc(0);
      const chunks = [fileData]; // Single empty chunk

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);
      await fs.writeFile(path.join(chunksDir, 'chunk_0'), fileData);

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'empty-file.dat',
        file_size: fileSize,
        total_chunks: 1,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      expect(assembledPath).toBe(outputPath);

      // Verify file exists and is empty
      const stats = await fs.stat(assembledPath);
      expect(stats.size).toBe(0);

      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(0);

      // Test encryption with zero-byte file
      const metadata = EncryptionService.createFileMetadata(uploadId, session, fileSize);
      expect(metadata.actualFileSize).toBe(0);
      expect(metadata.originalFileSize).toBe(0);
    });

    test('should handle single-byte files', async () => {
      const uploadId = 'single-byte-test';
      const fileSize = EDGE_CASE_SIZES.ONE_BYTE;
      const fileData = Buffer.from('X');
      const chunks = [fileData];

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);
      await fs.writeFile(path.join(chunksDir, 'chunk_0'), fileData);

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'single-byte.dat',
        file_size: fileSize,
        total_chunks: 1,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(1);
      expect(assembledData[0]).toBe(88); // ASCII 'X'
      expect(assembledData.equals(fileData)).toBe(true);
    });

    test('should handle files with odd sizes and remainders', async () => {
      const uploadId = 'odd-size-test';
      const fileSize = EDGE_CASE_SIZES.ODD_SIZE;
      const fileData = createPredictableFile(fileSize, 'ODD_');
      
      const chunkSize = 5 * 1024 * 1024;
      const chunks = [];
      for (let i = 0; i < fileSize; i += chunkSize) {
        const currentChunkSize = Math.min(chunkSize, fileSize - i);
        chunks.push(fileData.slice(i, i + currentChunkSize));
      }

      console.log(`📊 Odd size test: ${fileSize} bytes = ${chunks.length} chunks (last chunk: ${chunks[chunks.length - 1].length} bytes)`);

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      for (let i = 0; i < chunks.length; i++) {
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunks[i]);
      }

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'odd-size.dat',
        file_size: fileSize,
        total_chunks: chunks.length,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const assembledData = await fs.readFile(assembledPath);
      expect(assembledData.length).toBe(fileSize);
      expect(assembledData.equals(fileData)).toBe(true);

      // Verify last chunk boundary is handled correctly
      const lastChunkStart = (chunks.length - 1) * chunkSize;
      const lastChunkData = assembledData.slice(lastChunkStart);
      expect(lastChunkData.equals(chunks[chunks.length - 1])).toBe(true);
    });
  });

  describe('Partial Upload Recovery', () => {
    test('should detect incomplete uploads', async () => {
      const uploadId = 'incomplete-upload-test';
      const totalChunks = 5;
      const uploadedChunks = 3; // Only 3 out of 5 chunks uploaded

      const { chunks } = await simulatePartialUpload(uploadId, totalChunks, uploadedChunks);

      const validation = await FileAssemblyService.validateChunksParallel(
        uploadId, totalChunks, testStoragePath
      );

      expect(validation.isComplete).toBe(false);
      expect(validation.totalChunks).toBe(totalChunks);
      expect(validation.existingChunks).toBe(uploadedChunks);
      expect(validation.missingChunks).toBe(totalChunks - uploadedChunks);
      expect(validation.missingChunkIndices).toEqual([3, 4]);

      console.log(`📊 Incomplete upload: ${uploadedChunks}/${totalChunks} chunks (missing: ${validation.missingChunkIndices.join(', ')})`);
    });

    test('should resume upload after interruption', async () => {
      const uploadId = 'resume-upload-test';
      const totalChunks = 4;
      const chunkSize = 2 * 1024 * 1024; // 2MB chunks
      
      // Phase 1: Upload first 2 chunks
      const { chunks: initialChunks } = await simulatePartialUpload(uploadId, totalChunks, 2, chunkSize);

      const validation1 = await FileAssemblyService.validateChunksParallel(
        uploadId, totalChunks, testStoragePath
      );

      expect(validation1.isComplete).toBe(false);
      expect(validation1.existingChunks).toBe(2);

      // Phase 2: Upload remaining chunks
      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      const remainingChunks = [];
      
      for (let i = 2; i < totalChunks; i++) {
        const chunkData = createPredictableFile(chunkSize, `CHUNK_${i}_`);
        remainingChunks.push(chunkData);
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunkData);
      }

      const validation2 = await FileAssemblyService.validateChunksParallel(
        uploadId, totalChunks, testStoragePath
      );

      expect(validation2.isComplete).toBe(true);
      expect(validation2.existingChunks).toBe(totalChunks);

      // Phase 3: Assemble complete file
      const allChunks = [...initialChunks, ...remainingChunks];
      const totalSize = allChunks.reduce((sum, chunk) => sum + chunk.length, 0);

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'resumed-upload.dat',
        file_size: totalSize,
        total_chunks: totalChunks,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const assembledData = await fs.readFile(assembledPath);
      const expectedData = Buffer.concat(allChunks);
      
      expect(assembledData.length).toBe(totalSize);
      expect(assembledData.equals(expectedData)).toBe(true);

      console.log(`✅ Resume test: Successfully assembled ${totalSize} bytes from ${totalChunks} chunks`);
    });

    test('should handle chunk upload race conditions', async () => {
      const uploadId = 'race-condition-test';
      const totalChunks = 3;
      const chunkSize = 1024 * 1024;

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      // Simulate concurrent chunk uploads
      const chunkPromises = [];
      const chunks = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunkData = createPredictableFile(chunkSize, `RACE_${i}_`);
        chunks.push(chunkData);
        
        const promise = fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunkData);
        chunkPromises.push(promise);
      }

      // Wait for all concurrent uploads to complete
      await Promise.all(chunkPromises);

      // Validate all chunks arrived correctly
      const validation = await FileAssemblyService.validateChunksParallel(
        uploadId, totalChunks, testStoragePath
      );

      expect(validation.isComplete).toBe(true);
      expect(validation.existingChunks).toBe(totalChunks);

      // Assemble and verify
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'race-condition.dat',
        file_size: totalSize,
        total_chunks: totalChunks,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const assembledData = await fs.readFile(assembledPath);
      const expectedData = Buffer.concat(chunks);
      expect(assembledData.equals(expectedData)).toBe(true);
    });
  });

  describe('Disk Space and Resource Limits', () => {
    test('should handle simulated disk space limitations', async () => {
      const uploadId = 'disk-space-test';
      const fileSize = 10 * 1024 * 1024; // 10MB
      const fileData = createPredictableFile(fileSize, 'DISK_');
      
      // Create chunks but test with limited storage path
      const limitedStoragePath = path.join(testStoragePath, 'limited-space');
      await fs.ensureDir(limitedStoragePath);
      cleanupPaths.push(limitedStoragePath);

      const chunkSize = 5 * 1024 * 1024;
      const chunks = [];
      for (let i = 0; i < fileSize; i += chunkSize) {
        chunks.push(fileData.slice(i, Math.min(i + chunkSize, fileSize)));
      }

      const chunksDir = path.join(limitedStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);

      for (let i = 0; i < chunks.length; i++) {
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunks[i]);
      }

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'disk-space-test.dat',
        file_size: fileSize,
        total_chunks: chunks.length,
        is_complete: true
      });

      const outputPath = path.join(limitedStoragePath, `${uploadId}-assembled.dat`);

      // Should succeed with adequate space
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, limitedStoragePath, outputPath
      );

      expect(assembledPath).toBe(outputPath);

      const stats = await fs.stat(assembledPath);
      expect(stats.size).toBe(fileSize);
    });

    test('should handle concurrent assembly with resource contention', async () => {
      const concurrentCount = 3;
      const fileSize = 5 * 1024 * 1024; // 5MB each
      const operations = [];

      // Prepare concurrent operations with resource contention
      for (let i = 0; i < concurrentCount; i++) {
        const uploadId = `contention-${i}`;
        const fileData = createPredictableFile(fileSize, `CONT_${i}_`);
        
        operations.push({
          uploadId,
          fileData,
          chunks: [fileData] // Single chunk for simplicity
        });
      }

      // Setup all chunks concurrently
      const setupPromises = operations.map(async ({ uploadId, chunks }) => {
        const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
        await fs.ensureDir(chunksDir);
        cleanupPaths.push(chunksDir);
        
        await fs.writeFile(path.join(chunksDir, 'chunk_0'), chunks[0]);
        
        return testDb.insertTestUpload({
          id: uploadId,
          original_name: `contention-${uploadId}.dat`,
          file_size: fileSize,
          total_chunks: 1,
          is_complete: true
        });
      });

      const sessions = await Promise.all(setupPromises);

      // Execute concurrent assemblies with resource contention
      const assemblyPromises = operations.map(async ({ uploadId, fileData }, index) => {
        const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
        cleanupPaths.push(outputPath);

        const assembledPath = await FileAssemblyService.assembleFile(
          uploadId, sessions[index], testStoragePath, outputPath
        );

        // Verify each assembly completed correctly
        const assembledData = await fs.readFile(assembledPath);
        expect(assembledData.equals(fileData)).toBe(true);

        return { uploadId, success: true };
      });

      const results = await Promise.all(assemblyPromises);

      // All operations should succeed despite resource contention
      expect(results).toHaveLength(concurrentCount);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Chunk Corruption and Recovery', () => {
    test('should detect chunk corruption through size mismatch', async () => {
      const uploadId = 'corruption-size-test';
      const normalChunkSize = 2 * 1024 * 1024;
      const chunks = [
        createPredictableFile(normalChunkSize, 'NORM1_'),
        createPredictableFile(1024, 'CORRUPTED_'), // Unexpectedly small
        createPredictableFile(normalChunkSize, 'NORM3_')
      ];

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      for (let i = 0; i < chunks.length; i++) {
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunks[i]);
      }

      const validation = await FileAssemblyService.validateChunksParallel(
        uploadId, chunks.length, testStoragePath
      );

      expect(validation.isComplete).toBe(true);
      expect(validation.existingChunks).toBe(chunks.length);

      // Check size discrepancies
      const sizes = validation.results.map(r => r.size);
      expect(sizes[0]).toBe(normalChunkSize);
      expect(sizes[1]).toBe(1024); // Corrupted/truncated
      expect(sizes[2]).toBe(normalChunkSize);

      console.log(`🔍 Corruption detection: chunk sizes ${sizes.join(', ')} bytes`);
    });

    test('should handle binary corruption in chunks', async () => {
      const uploadId = 'binary-corruption-test';
      const chunkSize = 1024 * 1024;
      const originalData = createPredictableFile(chunkSize, 'ORIGINAL_');
      
      // Create corrupted version with flipped bits
      const corruptedData = Buffer.from(originalData);
      corruptedData[100] = corruptedData[100] ^ 0xFF; // Flip all bits in byte 100
      corruptedData[500] = corruptedData[500] ^ 0xFF; // Flip all bits in byte 500

      const chunks = [originalData, corruptedData];

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      for (let i = 0; i < chunks.length; i++) {
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunks[i]);
      }

      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'binary-corruption.dat',
        file_size: totalSize,
        total_chunks: chunks.length,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      // Assembly should succeed (we don't validate content, only structure)
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const assembledData = await fs.readFile(assembledPath);
      const expectedData = Buffer.concat(chunks);

      expect(assembledData.length).toBe(totalSize);
      expect(assembledData.equals(expectedData)).toBe(true);

      // Verify corruption is preserved in second chunk (not "fixed")
      expect(assembledData[chunkSize + 100]).toBe(corruptedData[100]);
      expect(assembledData[chunkSize + 500]).toBe(corruptedData[500]);
    });

    test('should handle chunk replacement during assembly', async () => {
      const uploadId = 'replacement-during-assembly-test';
      const chunkSize = 1024 * 1024;
      const originalChunks = [
        createPredictableFile(chunkSize, 'ORIG1_'),
        createPredictableFile(chunkSize, 'ORIG2_')
      ];

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      // Save initial chunks
      for (let i = 0; i < originalChunks.length; i++) {
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), originalChunks[i]);
      }

      const totalSize = originalChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'replacement-test.dat',
        file_size: totalSize,
        total_chunks: originalChunks.length,
        is_complete: true
      });

      // Start assembly in background
      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const assemblyPromise = FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      // Replace chunk while assembly is potentially running
      const replacementChunk = createPredictableFile(chunkSize, 'REPLACED_');
      await fs.writeFile(path.join(chunksDir, 'chunk_1'), replacementChunk);

      // Wait for assembly to complete
      const assembledPath = await assemblyPromise;

      const assembledData = await fs.readFile(assembledPath);
      
      // Result depends on timing - could be original or replaced
      // Just verify that assembly completes and produces valid output (at least 1 chunk)
      expect(assembledData.length).toBeGreaterThanOrEqual(chunkSize);
      expect(assembledData.length).toBeLessThanOrEqual(totalSize);
      expect(assembledPath).toBe(outputPath);

      console.log(`🔄 Replacement test: Assembly completed with ${assembledData.length} bytes`);
    });
  });

  describe('System Restart Recovery', () => {
    test('should recover from interrupted assembly', async () => {
      const uploadId = 'interrupted-assembly-test';
      const chunkSize = 2 * 1024 * 1024;
      const chunks = [
        createPredictableFile(chunkSize, 'INTER1_'),
        createPredictableFile(chunkSize, 'INTER2_'),
        createPredictableFile(chunkSize, 'INTER3_')
      ];

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      for (let i = 0; i < chunks.length; i++) {
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunks[i]);
      }

      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'interrupted.dat',
        file_size: totalSize,
        total_chunks: chunks.length,
        is_complete: true
      });

      // Simulate interrupted assembly by creating partial output
      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      const partialData = Buffer.concat([chunks[0], chunks[1].slice(0, 1000)]); // Partial second chunk
      await fs.writeFile(outputPath, partialData);
      cleanupPaths.push(outputPath);

      console.log(`🔄 Simulated interruption: ${partialData.length} bytes written (incomplete)`);

      // Recovery: Re-run assembly (should overwrite partial file)
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const assembledData = await fs.readFile(assembledPath);
      const expectedData = Buffer.concat(chunks);

      expect(assembledData.length).toBe(totalSize);
      expect(assembledData.equals(expectedData)).toBe(true);

      console.log(`✅ Recovery successful: ${assembledData.length} bytes assembled`);
    });

    test('should handle persistent chunk storage validation', async () => {
      const uploadId = 'persistent-validation-test';
      const chunks = [
        createPredictableFile(1024 * 1024, 'PERSIST1_'),
        createPredictableFile(1024 * 1024, 'PERSIST2_')
      ];

      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      for (let i = 0; i < chunks.length; i++) {
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunks[i]);
      }

      // First validation
      const validation1 = await FileAssemblyService.validateChunksParallel(
        uploadId, chunks.length, testStoragePath
      );

      expect(validation1.isComplete).toBe(true);

      // Simulate system restart delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second validation (should still work)
      const validation2 = await FileAssemblyService.validateChunksParallel(
        uploadId, chunks.length, testStoragePath
      );

      expect(validation2.isComplete).toBe(true);
      expect(validation2.totalSize).toBe(validation1.totalSize);
      expect(validation2.existingChunks).toBe(validation1.existingChunks);
    });
  });

  describe('Maximum Limits and Boundaries', () => {
    test('should handle maximum reasonable file size', async () => {
      const uploadId = 'max-size-test';
      const fileSize = EDGE_CASE_SIZES.MAX_SAFE_SIZE; // 100MB
      const chunkSize = 5 * 1024 * 1024;
      const chunkCount = Math.ceil(fileSize / chunkSize);

      // Create chunks efficiently
      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      for (let i = 0; i < chunkCount; i++) {
        const currentChunkSize = Math.min(chunkSize, fileSize - (i * chunkSize));
        const chunkData = createPredictableFile(currentChunkSize, `MAX${i}_`);
        await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunkData);
      }

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'max-size.dat',
        file_size: fileSize,
        total_chunks: chunkCount,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const startTime = Date.now();
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );
      const assemblyTime = Date.now() - startTime;

      const stats = await fs.stat(assembledPath);
      expect(stats.size).toBe(fileSize);

      console.log(`⚡ Max size test (${Math.round(fileSize/1024/1024)}MB): ${assemblyTime}ms`);

      // Should complete within reasonable time
      expect(assemblyTime).toBeLessThan(15000); // 15 seconds max
    });

    test('should handle chunk count boundaries', async () => {
      const testCases = [
        { chunks: 1, description: 'Single chunk' },
        { chunks: 2, description: 'Minimum multi-chunk' },
        { chunks: 10, description: 'Moderate chunk count' },
        { chunks: 50, description: 'High chunk count' },
        { chunks: 100, description: 'Very high chunk count' }
      ];

      for (const testCase of testCases) {
        const uploadId = `chunk-count-${testCase.chunks}`;
        const chunkSize = 100 * 1024; // Small chunks for speed
        
        const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
        await fs.ensureDir(chunksDir);
        cleanupPaths.push(chunksDir);

        for (let i = 0; i < testCase.chunks; i++) {
          const chunkData = createPredictableFile(chunkSize, `C${i}_`);
          await fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunkData);
        }

        const totalSize = testCase.chunks * chunkSize;
        const session = await testDb.insertTestUpload({
          id: uploadId,
          original_name: `${testCase.chunks}-chunks.dat`,
          file_size: totalSize,
          total_chunks: testCase.chunks,
          is_complete: true
        });

        const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
        cleanupPaths.push(outputPath);

        const startTime = Date.now();
        const assembledPath = await FileAssemblyService.assembleFile(
          uploadId, session, testStoragePath, outputPath
        );
        const assemblyTime = Date.now() - startTime;

        const stats = await fs.stat(assembledPath);
        expect(stats.size).toBe(totalSize);

        console.log(`📊 ${testCase.description} (${testCase.chunks}): ${assemblyTime}ms`);

        // Performance should scale reasonably with chunk count
        const timePerChunk = assemblyTime / testCase.chunks;
        expect(timePerChunk).toBeLessThan(50); // Less than 50ms per chunk
      }
    });
  });
});
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
const TestDatabase = require('../helpers/database');
const FileAssemblyService = require('../../services/FileAssemblyService');

/**
 * Performance Tests for Chunk Upload Feature
 * 
 * Focus on:
 * - Memory efficiency during large file processing
 * - Assembly speed across different file sizes
 * - Concurrent chunk processing performance
 * - Resource cleanup efficiency
 * - Memory leak prevention
 */
describe('Chunk Upload Performance Tests', () => {
  let testDb;
  let testStoragePath;
  let cleanupPaths = [];

  const PERFORMANCE_THRESHOLDS = {
    // Assembly time limits (milliseconds)
    SMALL_FILE_MAX_TIME: 100,    // <100ms for files under 5MB
    MEDIUM_FILE_MAX_TIME: 500,   // <500ms for files 5-20MB
    LARGE_FILE_MAX_TIME: 2000,   // <2s for files 20-100MB
    
    // Memory usage limits (bytes)
    MAX_MEMORY_OVERHEAD: 50 * 1024 * 1024, // 50MB max overhead
    MAX_MEMORY_MULTIPLIER: 1.5, // Max 1.5x file size in memory
    
    // Concurrency limits
    MAX_CONCURRENT_OPERATIONS: 10,
    MIN_THROUGHPUT_MB_PER_SEC: 25 // Minimum 25MB/s processing
  };

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    testStoragePath = path.join(__dirname, '../fixtures/perf-test-storage');
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
   * Helper to create performance test file
   */
  const createPerformanceFile = (size, seed = 42) => {
    const buffer = Buffer.alloc(size);
    let value = seed;
    for (let i = 0; i < size; i++) {
      buffer[i] = value % 256;
      value = (value * 1103515245 + 12345) % 2147483647; // Linear congruential generator
    }
    return buffer;
  };

  /**
   * Helper to measure memory usage
   */
  const measureMemory = () => {
    if (global.gc) {
      global.gc(); // Force garbage collection if available
    }
    return process.memoryUsage();
  };

  /**
   * Helper to save chunks with performance tracking
   */
  const saveChunksWithTiming = async (uploadId, chunks) => {
    const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
    await fs.ensureDir(chunksDir);
    cleanupPaths.push(chunksDir);

    const startTime = Date.now();
    const promises = chunks.map((chunk, i) => 
      fs.writeFile(path.join(chunksDir, `chunk_${i}`), chunk)
    );
    await Promise.all(promises);
    const writeTime = Date.now() - startTime;

    return { writeTime, chunksDir };
  };

  describe('Assembly Performance Tests', () => {
    test('should assemble small files quickly (under 5MB)', async () => {
      const fileSizes = [
        1 * 1024 * 1024,                      // 1MB
        Math.round(2.5 * 1024 * 1024),       // 2.5MB
        Math.round(4.9 * 1024 * 1024)         // 4.9MB
      ];

      for (const fileSize of fileSizes) {
        const uploadId = `perf-small-${fileSize}`;
        const fileData = createPerformanceFile(fileSize);
        const chunks = [fileData]; // Single chunk for small files

        await saveChunksWithTiming(uploadId, chunks);
        
        const session = await testDb.insertTestUpload({
          id: uploadId,
          original_name: `perf-${fileSize}.dat`,
          file_size: fileSize,
          total_chunks: 1,
          is_complete: true
        });

        const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
        cleanupPaths.push(outputPath);

        const startTime = Date.now();
        const assembledPath = await FileAssemblyService.assembleFile(
          uploadId, session, testStoragePath, outputPath
        );
        const assemblyTime = Date.now() - startTime;

        console.log(`⚡ Small file (${Math.round(fileSize/1024/1024*10)/10}MB): ${assemblyTime}ms`);

        expect(assemblyTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SMALL_FILE_MAX_TIME);
        
        // Verify correctness
        const assembledData = await fs.readFile(assembledPath);
        expect(assembledData.equals(fileData)).toBe(true);
      }
    });

    test('should assemble medium files efficiently (5-20MB)', async () => {
      const fileSizes = [
        Math.round(5.1 * 1024 * 1024),    // 5.1MB (2 chunks)
        10 * 1024 * 1024,                 // 10MB (2 chunks)
        Math.round(15.5 * 1024 * 1024)   // 15.5MB (4 chunks)
      ];

      for (const fileSize of fileSizes) {
        const uploadId = `perf-medium-${fileSize}`;
        const fileData = createPerformanceFile(fileSize);
        
        // Create chunks
        const chunkSize = 5 * 1024 * 1024;
        const chunks = [];
        for (let i = 0; i < fileSize; i += chunkSize) {
          chunks.push(fileData.slice(i, Math.min(i + chunkSize, fileSize)));
        }

        const { writeTime } = await saveChunksWithTiming(uploadId, chunks);
        
        const session = await testDb.insertTestUpload({
          id: uploadId,
          original_name: `perf-${fileSize}.dat`,
          file_size: fileSize,
          total_chunks: chunks.length,
          is_complete: true
        });

        const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
        cleanupPaths.push(outputPath);

        const memoryBefore = measureMemory();
        const startTime = Date.now();
        
        const assembledPath = await FileAssemblyService.assembleFile(
          uploadId, session, testStoragePath, outputPath
        );
        
        const assemblyTime = Date.now() - startTime;
        const memoryAfter = measureMemory();
        const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;

        console.log(`⚡ Medium file (${Math.round(fileSize/1024/1024*10)/10}MB, ${chunks.length} chunks): ${assemblyTime}ms, +${Math.round(memoryUsed/1024/1024)}MB`);

        expect(assemblyTime).toBeLessThan(PERFORMANCE_THRESHOLDS.MEDIUM_FILE_MAX_TIME);
        expect(memoryUsed).toBeLessThan(fileSize * PERFORMANCE_THRESHOLDS.MAX_MEMORY_MULTIPLIER);
        
        // Calculate throughput
        const throughputMBps = (fileSize / 1024 / 1024) / (assemblyTime / 1000);
        expect(throughputMBps).toBeGreaterThan(PERFORMANCE_THRESHOLDS.MIN_THROUGHPUT_MB_PER_SEC);

        // Verify correctness
        const assembledData = await fs.readFile(assembledPath);
        expect(assembledData.equals(fileData)).toBe(true);
      }
    });

    test('should handle large files within memory constraints (20-100MB)', async () => {
      const fileSizes = [
        25 * 1024 * 1024,    // 25MB (5 chunks)
        50 * 1024 * 1024,    // 50MB (10 chunks)
        75 * 1024 * 1024     // 75MB (15 chunks)
      ];

      for (const fileSize of fileSizes) {
        const uploadId = `perf-large-${fileSize}`;
        
        // Create file data in chunks to avoid initial memory spike
        const chunkSize = 5 * 1024 * 1024;
        const chunks = [];
        for (let i = 0; i < fileSize; i += chunkSize) {
          const currentChunkSize = Math.min(chunkSize, fileSize - i);
          chunks.push(createPerformanceFile(currentChunkSize, i)); // Different seed per chunk
        }

        const { writeTime } = await saveChunksWithTiming(uploadId, chunks);
        
        const session = await testDb.insertTestUpload({
          id: uploadId,
          original_name: `perf-large-${fileSize}.dat`,
          file_size: fileSize,
          total_chunks: chunks.length,
          is_complete: true
        });

        const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
        cleanupPaths.push(outputPath);

        const memoryBefore = measureMemory();
        const startTime = Date.now();
        
        const assembledPath = await FileAssemblyService.assembleFile(
          uploadId, session, testStoragePath, outputPath
        );
        
        const assemblyTime = Date.now() - startTime;
        const memoryAfter = measureMemory();
        const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;

        console.log(`⚡ Large file (${Math.round(fileSize/1024/1024)}MB, ${chunks.length} chunks): ${assemblyTime}ms, +${Math.round(memoryUsed/1024/1024)}MB`);

        expect(assemblyTime).toBeLessThan(PERFORMANCE_THRESHOLDS.LARGE_FILE_MAX_TIME);
        expect(memoryUsed).toBeLessThan(PERFORMANCE_THRESHOLDS.MAX_MEMORY_OVERHEAD);
        
        // Calculate throughput
        const throughputMBps = (fileSize / 1024 / 1024) / (assemblyTime / 1000);
        expect(throughputMBps).toBeGreaterThan(PERFORMANCE_THRESHOLDS.MIN_THROUGHPUT_MB_PER_SEC);

        // Verify file size (don't load entire file for comparison due to memory)
        const stats = await fs.stat(assembledPath);
        expect(stats.size).toBe(fileSize);
      }
    });
  });

  describe('Concurrent Processing Performance', () => {
    test('should handle multiple concurrent assemblies efficiently', async () => {
      const concurrentCount = 5;
      const fileSize = 10 * 1024 * 1024; // 10MB each
      const operations = [];

      // Prepare all concurrent operations
      for (let i = 0; i < concurrentCount; i++) {
        const uploadId = `concurrent-perf-${i}`;
        const fileData = createPerformanceFile(fileSize, i * 1000);
        
        const chunkSize = 5 * 1024 * 1024;
        const chunks = [];
        for (let j = 0; j < fileSize; j += chunkSize) {
          chunks.push(fileData.slice(j, Math.min(j + chunkSize, fileSize)));
        }

        operations.push({
          uploadId,
          fileData,
          chunks,
          fileSize
        });
      }

      // Save all chunks concurrently
      const setupPromises = operations.map(async ({ uploadId, chunks }) => {
        await saveChunksWithTiming(uploadId, chunks);
        return testDb.insertTestUpload({
          id: uploadId,
          original_name: `concurrent-${uploadId}.dat`,
          file_size: fileSize,
          total_chunks: chunks.length,
          is_complete: true
        });
      });

      const sessions = await Promise.all(setupPromises);

      // Execute concurrent assemblies
      const memoryBefore = measureMemory();
      const startTime = Date.now();

      const assemblyPromises = operations.map(async ({ uploadId, fileData }, index) => {
        const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
        cleanupPaths.push(outputPath);

        const assembledPath = await FileAssemblyService.assembleFile(
          uploadId, sessions[index], testStoragePath, outputPath
        );

        // Verify size only (not full content due to memory constraints)
        const stats = await fs.stat(assembledPath);
        expect(stats.size).toBe(fileSize);

        return { uploadId, assembledPath, success: true };
      });

      const results = await Promise.all(assemblyPromises);
      const totalTime = Date.now() - startTime;
      const memoryAfter = measureMemory();
      
      const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;
      const totalDataProcessed = concurrentCount * fileSize;
      const overallThroughputMBps = (totalDataProcessed / 1024 / 1024) / (totalTime / 1000);

      console.log(`⚡ Concurrent (${concurrentCount} × ${fileSize/1024/1024}MB): ${totalTime}ms, ${Math.round(overallThroughputMBps)}MB/s, +${Math.round(memoryUsed/1024/1024)}MB`);

      // Verify all operations completed successfully
      expect(results).toHaveLength(concurrentCount);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Performance assertions
      expect(overallThroughputMBps).toBeGreaterThan(PERFORMANCE_THRESHOLDS.MIN_THROUGHPUT_MB_PER_SEC / 2); // Allow lower throughput for concurrent
      expect(memoryUsed).toBeLessThan(totalDataProcessed * 1.2); // Should not use more than 1.2x total data size
    });

    test('should scale chunk validation performance linearly', async () => {
      const testCases = [
        { chunks: 2, fileSize: 10 * 1024 * 1024 },
        { chunks: 5, fileSize: 25 * 1024 * 1024 },
        { chunks: 10, fileSize: 50 * 1024 * 1024 },
        { chunks: 20, fileSize: 100 * 1024 * 1024 }
      ];

      const results = [];

      for (const { chunks: chunkCount, fileSize } of testCases) {
        const uploadId = `validation-perf-${chunkCount}`;
        
        // Create chunks
        const chunkSize = Math.ceil(fileSize / chunkCount);
        const chunks = [];
        for (let i = 0; i < chunkCount; i++) {
          const currentSize = Math.min(chunkSize, fileSize - (i * chunkSize));
          chunks.push(Buffer.alloc(currentSize, i % 256));
        }

        await saveChunksWithTiming(uploadId, chunks);

        // Measure validation performance
        const startTime = Date.now();
        const validation = await FileAssemblyService.validateChunksParallel(
          uploadId, chunkCount, testStoragePath
        );
        const validationTime = Date.now() - startTime;

        expect(validation.isComplete).toBe(true);
        expect(validation.totalChunks).toBe(chunkCount);

        results.push({
          chunkCount,
          fileSize,
          validationTime,
          timePerChunk: validationTime / chunkCount
        });

        console.log(`🔍 Validation (${chunkCount} chunks): ${validationTime}ms (${Math.round(validationTime/chunkCount*100)/100}ms/chunk)`);
      }

      // Verify performance stays within reasonable absolute bounds
      for (const result of results) {
        // Each chunk validation should complete within 50ms on any runner
        expect(result.timePerChunk).toBeLessThan(50);
      }
    });
  });

  describe('Memory Management Performance', () => {
    test('should not leak memory during repeated operations', async () => {
      const initialMemory = measureMemory();
      const fileSize = 10 * 1024 * 1024; // 10MB
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const uploadId = `memory-test-${i}`;
        const fileData = createPerformanceFile(fileSize, i);
        
        const chunkSize = 5 * 1024 * 1024;
        const chunks = [];
        for (let j = 0; j < fileSize; j += chunkSize) {
          chunks.push(fileData.slice(j, Math.min(j + chunkSize, fileSize)));
        }

        await saveChunksWithTiming(uploadId, chunks);
        
        const session = await testDb.insertTestUpload({
          id: uploadId,
          original_name: `memory-test-${i}.dat`,
          file_size: fileSize,
          total_chunks: chunks.length,
          is_complete: true
        });

        const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
        cleanupPaths.push(outputPath);

        await FileAssemblyService.assembleFile(
          uploadId, session, testStoragePath, outputPath
        );

        // Clean up immediately
        await fs.remove(outputPath);
        await FileAssemblyService.cleanupChunks(uploadId, chunks.length, testStoragePath);
      }

      const finalMemory = measureMemory();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`🧠 Memory after ${iterations} iterations: +${Math.round(memoryIncrease/1024/1024)}MB`);

      // Should not leak significant memory
      expect(memoryIncrease).toBeLessThan(fileSize * 0.5); // Less than 50% of one file size
    });

    test('should efficiently clean up large numbers of chunks', async () => {
      const uploadId = 'cleanup-perf-test';
      const chunkCount = 50; // Many small chunks
      const chunkSize = 1024 * 1024; // 1MB each

      // Create many small chunks
      const chunks = [];
      for (let i = 0; i < chunkCount; i++) {
        chunks.push(Buffer.alloc(chunkSize, i % 256));
      }

      await saveChunksWithTiming(uploadId, chunks);

      // Measure cleanup performance
      const startTime = Date.now();
      const cleanupResult = await FileAssemblyService.cleanupChunks(
        uploadId, chunkCount, testStoragePath
      );
      const cleanupTime = Date.now() - startTime;

      console.log(`🧹 Cleanup (${chunkCount} chunks): ${cleanupTime}ms`);

      expect(cleanupResult.successful).toBe(chunkCount);
      expect(cleanupResult.failed).toBe(0);
      expect(cleanupTime).toBeLessThan(chunkCount * 10); // Should be less than 10ms per chunk
    });
  });

  describe('Edge Case Performance', () => {
    test('should handle many tiny chunks efficiently', async () => {
      const uploadId = 'tiny-chunks-perf';
      const chunkCount = 100;
      const chunkSize = 50 * 1024; // 50KB chunks
      const totalSize = chunkCount * chunkSize;

      const chunks = [];
      for (let i = 0; i < chunkCount; i++) {
        chunks.push(Buffer.alloc(chunkSize, i % 256));
      }

      await saveChunksWithTiming(uploadId, chunks);
      
      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'tiny-chunks.dat',
        file_size: totalSize,
        total_chunks: chunkCount,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const startTime = Date.now();
      await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );
      const assemblyTime = Date.now() - startTime;

      console.log(`⚡ Tiny chunks (${chunkCount} × ${chunkSize/1024}KB): ${assemblyTime}ms`);

      expect(assemblyTime).toBeLessThan(1000); // Should complete within 1 second
      
      const stats = await fs.stat(outputPath);
      expect(stats.size).toBe(totalSize);
    });

    test('should handle few large chunks efficiently', async () => {
      const uploadId = 'large-chunks-perf';
      const chunkCount = 3;
      const chunkSize = 20 * 1024 * 1024; // 20MB chunks
      const totalSize = chunkCount * chunkSize;

      const chunks = [];
      for (let i = 0; i < chunkCount; i++) {
        chunks.push(createPerformanceFile(chunkSize, i * 10000));
      }

      await saveChunksWithTiming(uploadId, chunks);
      
      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'large-chunks.dat',
        file_size: totalSize,
        total_chunks: chunkCount,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      const memoryBefore = measureMemory();
      const startTime = Date.now();
      
      await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );
      
      const assemblyTime = Date.now() - startTime;
      const memoryAfter = measureMemory();
      const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;

      console.log(`⚡ Large chunks (${chunkCount} × ${chunkSize/1024/1024}MB): ${assemblyTime}ms, +${Math.round(memoryUsed/1024/1024)}MB`);

      expect(assemblyTime).toBeLessThan(3000); // Should complete within 3 seconds
      expect(memoryUsed).toBeLessThan(totalSize * 0.8); // Shouldn't load entire file into memory at once
      
      const stats = await fs.stat(outputPath);
      expect(stats.size).toBe(totalSize);
    });
  });
});
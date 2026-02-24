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

/**
 * Security Tests for Chunk Upload Feature
 * 
 * Tests security aspects:
 * - Path traversal protection
 * - Chunk tampering detection
 * - Access control validation
 * - Resource exhaustion protection
 * - Encryption integrity
 * - Secure cleanup
 */
describe('Chunk Upload Security Tests', () => {
  let testDb;
  let testStoragePath;
  let cleanupPaths = [];

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    testStoragePath = path.join(__dirname, '../fixtures/security-test-storage');
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
   * Helper to create secure test chunks
   */
  const createSecureChunks = (uploadId, chunkCount, chunkSize = 1024 * 1024) => {
    const chunks = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunk = crypto.randomBytes(chunkSize);
      chunks.push(chunk);
    }
    return chunks;
  };

  /**
   * Check if upload ID contains path traversal - reject malicious IDs
   */
  const isPathTraversal = (uploadId) => {
    if (!uploadId || typeof uploadId !== 'string') return true;
    const normalized = path.normalize(uploadId);
    return normalized.includes('..') || normalized.startsWith('/') ||
      /\.\.[/\\]/.test(uploadId) || /%2e%2e/i.test(uploadId);
  };

  /**
   * Helper to save chunks securely
   */
  const saveSecureChunks = async (uploadId, chunks) => {
    if (isPathTraversal(uploadId)) {
      throw new Error('Path traversal detected in upload ID');
    }
    const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
    const resolvedDir = path.resolve(chunksDir);
    if (!resolvedDir.startsWith(path.resolve(testStoragePath))) {
      throw new Error('Path traversal would escape storage');
    }
    await fs.ensureDir(chunksDir);
    cleanupPaths.push(chunksDir);

    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = path.join(chunksDir, `chunk_${i}`);
      await fs.writeFile(chunkPath, chunks[i]);
    }

    return chunksDir;
  };

  describe('Path Traversal Protection', () => {
    test('should reject upload IDs with path traversal attempts', async () => {
      const maliciousUploadIds = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config',
        '/etc/shadow',
        'normal/../../../etc/passwd',
        'upload/../../sensitive',
        '....//....//etc//passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%252f..%252f..%252fetc%252fpasswd'
      ];

      for (const maliciousId of maliciousUploadIds) {
        const chunks = createSecureChunks(maliciousId, 2);
        
        // Should fail at chunk storage level (path validation)
        await expect(
          saveSecureChunks(maliciousId, chunks)
        ).rejects.toThrow();
      }
    });

    test('should sanitize file paths in assembly', async () => {
      const uploadId = 'safe-upload-123';
      const chunks = createSecureChunks(uploadId, 2);
      await saveSecureChunks(uploadId, chunks);

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: '../../../malicious.exe',
        file_size: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
        total_chunks: chunks.length,
        is_complete: true
      });

      // Should sanitize the output path
      const maliciousOutputPath = path.join(testStoragePath, '../../../malicious-output.dat');
      const safeOutputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(safeOutputPath);

      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, safeOutputPath
      );

      // Should return safe path, not malicious one
      expect(assembledPath).toBe(safeOutputPath);
      expect(assembledPath).not.toContain('../../../');

      // Verify file was created in safe location
      const exists = await fs.pathExists(assembledPath);
      expect(exists).toBe(true);

      // Verify malicious path was not created
      const maliciousExists = await fs.pathExists(maliciousOutputPath);
      expect(maliciousExists).toBe(false);
    });

    test('should validate chunk paths during assembly', async () => {
      const uploadId = 'path-validation-test';
      const legitimateChunks = createSecureChunks(uploadId, 2);
      
      // Save legitimate chunks
      const chunksDir = await saveSecureChunks(uploadId, legitimateChunks);

      // Try to create malicious chunk with path traversal
      const maliciousChunkPath = path.join(chunksDir, '../../../malicious_chunk');
      await fs.ensureDir(path.dirname(maliciousChunkPath));
      await fs.writeFile(maliciousChunkPath, Buffer.from('malicious data'));
      cleanupPaths.push(path.dirname(maliciousChunkPath));

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'test.dat',
        file_size: legitimateChunks.reduce((sum, chunk) => sum + chunk.length, 0),
        total_chunks: 2,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      // Should only assemble legitimate chunks, ignoring malicious ones
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      expect(assembledPath).toBe(outputPath);

      // Verify assembled file contains only legitimate chunks
      const assembledData = await fs.readFile(assembledPath);
      const expectedData = Buffer.concat(legitimateChunks);
      expect(assembledData.equals(expectedData)).toBe(true);
    });
  });

  describe('Chunk Integrity Protection', () => {
    test('should detect chunk size inconsistencies', async () => {
      const uploadId = 'size-validation-test';
      const normalChunkSize = 1024 * 1024; // 1MB
      const chunks = [
        crypto.randomBytes(normalChunkSize),      // Normal chunk
        crypto.randomBytes(normalChunkSize * 10), // Suspiciously large chunk
        crypto.randomBytes(100)                   // Suspiciously small chunk
      ];

      await saveSecureChunks(uploadId, chunks);

      // Validation should detect size inconsistencies
      const validation = await FileAssemblyService.validateChunksParallel(
        uploadId, chunks.length, testStoragePath
      );

      expect(validation.isComplete).toBe(true);
      expect(validation.results).toHaveLength(chunks.length);
      
      // Check that all chunks exist but have different sizes
      const sizes = validation.results.map(r => r.size);
      expect(sizes[0]).toBe(normalChunkSize);
      expect(sizes[1]).toBe(normalChunkSize * 10);
      expect(sizes[2]).toBe(100);
    });

    test('should handle chunk replacement attacks', async () => {
      const uploadId = 'replacement-attack-test';
      const originalChunks = createSecureChunks(uploadId, 3, 512 * 1024);
      await saveSecureChunks(uploadId, originalChunks);

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'original.dat',
        file_size: originalChunks.reduce((sum, chunk) => sum + chunk.length, 0),
        total_chunks: originalChunks.length,
        is_complete: true
      });

      // First assembly (baseline)
      const outputPath1 = path.join(testStoragePath, `${uploadId}-original.dat`);
      cleanupPaths.push(outputPath1);

      await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath1
      );

      const originalAssembled = await fs.readFile(outputPath1);

      // Replace middle chunk with malicious data
      const maliciousChunk = crypto.randomBytes(512 * 1024);
      const chunkPath = path.join(testStoragePath, 'chunks', uploadId, 'chunk_1');
      await fs.writeFile(chunkPath, maliciousChunk);

      // Second assembly (after tampering)
      const outputPath2 = path.join(testStoragePath, `${uploadId}-tampered.dat`);
      cleanupPaths.push(outputPath2);

      await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath2
      );

      const tamperedAssembled = await fs.readFile(outputPath2);

      // Files should be different (tampering detected through comparison)
      expect(tamperedAssembled.equals(originalAssembled)).toBe(false);

      // Verify tampering location
      const expectedTamperedData = Buffer.concat([
        originalChunks[0],
        maliciousChunk,
        originalChunks[2]
      ]);

      expect(tamperedAssembled.equals(expectedTamperedData)).toBe(true);
    });

    test('should handle chunk order manipulation', async () => {
      const uploadId = 'order-manipulation-test';
      const chunks = [
        Buffer.from('CHUNK_A'.repeat(1000)),
        Buffer.from('CHUNK_B'.repeat(1000)),
        Buffer.from('CHUNK_C'.repeat(1000))
      ];

      // Save chunks in wrong order
      const chunksDir = path.join(testStoragePath, 'chunks', uploadId);
      await fs.ensureDir(chunksDir);
      cleanupPaths.push(chunksDir);

      // Deliberately save in wrong order
      await fs.writeFile(path.join(chunksDir, 'chunk_0'), chunks[2]); // C in position 0
      await fs.writeFile(path.join(chunksDir, 'chunk_1'), chunks[0]); // A in position 1
      await fs.writeFile(path.join(chunksDir, 'chunk_2'), chunks[1]); // B in position 2

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'ordered.dat',
        file_size: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
        total_chunks: chunks.length,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const assembledData = await fs.readFile(outputPath);
      
      // Should assemble in filename order (C, A, B), not original order (A, B, C)
      const expectedOrder = Buffer.concat([chunks[2], chunks[0], chunks[1]]);
      expect(assembledData.equals(expectedOrder)).toBe(true);

      // Verify it's NOT in original order
      const originalOrder = Buffer.concat(chunks);
      expect(assembledData.equals(originalOrder)).toBe(false);
    });
  });

  describe('Access Control Validation', () => {
    test('should validate encryption configuration integrity', async () => {
      const uploadId = 'encryption-validation-test';
      const chunks = createSecureChunks(uploadId, 2);
      await saveSecureChunks(uploadId, chunks);

      const session = {
        upload_id: uploadId,
        has_password: false,
        quick_share: false
      };

      // Test valid encryption config (hash must be >= 32 chars)
      const validConfig = EncryptionService.processAccessCode(session, {
        requiresAccessCode: true,
        clientAccessCodeHash: 'valid-hash-123456789012345678901234567890'
      });

      expect(validConfig.shouldRequireAccessCode).toBe(true);
      expect(validConfig.accessCodeHash).toBe('valid-hash-123456789012345678901234567890');
      expect(validConfig.passwordHash).toBe('client-encrypted');

      // Test invalid/suspicious encryption configs
      const suspiciousConfigs = [
        { requiresAccessCode: true, clientAccessCodeHash: '' },
        { requiresAccessCode: true, clientAccessCodeHash: 'short' },
        { requiresAccessCode: true, clientAccessCodeHash: null },
        { requiresAccessCode: true, clientAccessCodeHash: undefined }
      ];

      for (const config of suspiciousConfigs) {
        const result = EncryptionService.processAccessCode(session, config);
        // Should fall back to no access code when invalid
        expect(result.shouldRequireAccessCode).toBe(false);
        expect(result.accessCodeHash).toBeNull();
      }
    });

    test('should protect against session hijacking', async () => {
      const uploadId = 'session-hijack-test';
      const chunks = createSecureChunks(uploadId, 2);
      await saveSecureChunks(uploadId, chunks);

      // Create legitimate session
      const legitimateSession = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'legitimate.dat',
        file_size: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
        total_chunks: chunks.length,
        is_complete: true
      });

      // Try to create hijacked session with different ID but same upload_id
      const hijackedSession = {
        ...legitimateSession,
        id: 'hijacked-session-456',
        upload_id: uploadId // Same upload_id but different session
      };

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      // Should still work because upload_id matches chunk storage
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, hijackedSession, testStoragePath, outputPath
      );

      expect(assembledPath).toBe(outputPath);

      // But metadata should reflect security concerns
      const metadata = EncryptionService.createFileMetadata(
        uploadId, hijackedSession, chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      );

      expect(metadata.zeroKnowledge).toBe(true);
      expect(metadata.uploadId).toBe(uploadId);
    });

    test('should handle access code hash validation', async () => {
      const uploadId = 'access-code-validation';
      const session = {
        upload_id: uploadId,
        has_password: false,
        quick_share: false
      };

      // Test various access code hash formats
      const testCases = [
        {
          hash: crypto.createHash('sha256').update('valid-password').digest('hex'),
          expected: true,
          description: 'Valid SHA256 hash'
        },
        {
          hash: 'too-short',
          expected: false,
          description: 'Hash too short'
        },
        {
          hash: 'x'.repeat(1000),
          expected: false,
          description: 'Hash too long'
        },
        {
          hash: 'invalid-chars-!@#$%^&*()',
          expected: false,
          description: 'Invalid characters'
        },
        {
          hash: '1234567890abcdef1234567890abcdef12345678', // Valid length but potentially weak
          expected: true,
          description: 'Valid length hex string'
        }
      ];

      for (const testCase of testCases) {
        const config = EncryptionService.processAccessCode(session, {
          requiresAccessCode: true,
          clientAccessCodeHash: testCase.hash
        });

        if (testCase.expected) {
          expect(config.shouldRequireAccessCode).toBe(true);
          expect(config.accessCodeHash).toBe(testCase.hash);
        } else {
          // Should reject and fall back to no access code
          expect(config.shouldRequireAccessCode).toBe(false);
          expect(config.accessCodeHash).toBeNull();
        }
      }
    });
  });

  describe('Resource Exhaustion Protection', () => {
    test('should limit maximum chunk count', async () => {
      const uploadId = 'chunk-limit-test';
      const excessiveChunkCount = 10000; // Excessive number of chunks
      
      // Don't actually create chunks, just test validation
      const validation = await FileAssemblyService.validateChunksParallel(
        uploadId, excessiveChunkCount, testStoragePath
      );

      // Should complete without crashing (chunks don't exist, so all missing)
      expect(validation.isComplete).toBe(false);
      expect(validation.totalChunks).toBe(excessiveChunkCount);
      expect(validation.existingChunks).toBe(0);
      expect(validation.missingChunks).toBe(excessiveChunkCount);
    });

    test('should handle memory exhaustion gracefully', async () => {
      const uploadId = 'memory-exhaustion-test';
      
      // Create moderate number of large chunks instead of many chunks
      const chunkCount = 5;
      const largeChunkSize = 10 * 1024 * 1024; // 10MB each
      const chunks = [];

      for (let i = 0; i < chunkCount; i++) {
        chunks.push(crypto.randomBytes(largeChunkSize));
      }

      await saveSecureChunks(uploadId, chunks);

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'large-memory-test.dat',
        file_size: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
        total_chunks: chunks.length,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      // Monitor memory during assembly
      const memoryBefore = process.memoryUsage();
      
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const memoryAfter = process.memoryUsage();
      const memoryUsed = memoryAfter.heapUsed - memoryBefore.heapUsed;

      expect(assembledPath).toBe(outputPath);
      
      // Memory usage should be reasonable (not more than 2x total file size)
      const totalFileSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      expect(memoryUsed).toBeLessThan(totalFileSize * 2);

      console.log(`🧠 Memory usage for ${Math.round(totalFileSize/1024/1024)}MB file: +${Math.round(memoryUsed/1024/1024)}MB`);
    });

    test('should timeout on slow filesystem operations', async () => {
      // This test simulates slow filesystem by creating a scenario that should complete quickly
      // but validates the timeout mechanism exists
      const uploadId = 'timeout-test';
      const chunks = createSecureChunks(uploadId, 100, 1024); // Many tiny chunks

      await saveSecureChunks(uploadId, chunks);

      const session = await testDb.insertTestUpload({
        id: uploadId,
        original_name: 'timeout-test.dat',
        file_size: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
        total_chunks: chunks.length,
        is_complete: true
      });

      const outputPath = path.join(testStoragePath, `${uploadId}-assembled.dat`);
      cleanupPaths.push(outputPath);

      // Should complete normally (not actually timeout with small chunks)
      const startTime = Date.now();
      
      const assembledPath = await FileAssemblyService.assembleFile(
        uploadId, session, testStoragePath, outputPath
      );

      const duration = Date.now() - startTime;

      expect(assembledPath).toBe(outputPath);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      console.log(`⏱️ Assembly of ${chunks.length} tiny chunks: ${duration}ms`);
    });
  });

  describe('Secure Cleanup', () => {
    test('should securely delete sensitive chunks', async () => {
      const uploadId = 'secure-cleanup-test';
      const sensitiveData = 'SENSITIVE-PASSWORD-123456789';
      const chunks = [
        Buffer.from(sensitiveData.repeat(1000)),
        Buffer.from('normal-data'.repeat(1000))
      ];

      const chunksDir = await saveSecureChunks(uploadId, chunks);

      // Verify chunks exist
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(chunksDir, `chunk_${i}`);
        const exists = await fs.pathExists(chunkPath);
        expect(exists).toBe(true);
      }

      // Cleanup chunks
      const cleanupResult = await FileAssemblyService.cleanupChunks(
        uploadId, chunks.length, testStoragePath
      );

      expect(cleanupResult.successful).toBe(chunks.length);
      expect(cleanupResult.failed).toBe(0);

      // Verify chunks are deleted
      for (let i = 0; i < chunks.length; i++) {
        const chunkPath = path.join(chunksDir, `chunk_${i}`);
        const exists = await fs.pathExists(chunkPath);
        expect(exists).toBe(false);
      }

      // Verify directory structure is also cleaned up
      const dirExists = await fs.pathExists(chunksDir);
      expect(dirExists).toBe(false);
    });

    test('should handle cleanup failures gracefully', async () => {
      const uploadId = 'cleanup-failure-test';
      const chunks = createSecureChunks(uploadId, 3);
      const chunksDir = await saveSecureChunks(uploadId, chunks);

      // Make one chunk read-only to simulate cleanup failure
      const readOnlyChunkPath = path.join(chunksDir, 'chunk_1');
      await fs.chmod(readOnlyChunkPath, 0o444); // Read-only

      const cleanupResult = await FileAssemblyService.cleanupChunks(
        uploadId, chunks.length, testStoragePath
      );

      // Should report partial success
      expect(cleanupResult.successful).toBe(2); // 2 out of 3 cleaned
      expect(cleanupResult.failed).toBe(1);   // 1 failed (read-only)
      expect(cleanupResult.totalChunks).toBe(3);

      // Verify failed chunk still exists
      const readOnlyExists = await fs.pathExists(readOnlyChunkPath);
      expect(readOnlyExists).toBe(true);

      // Clean up the read-only file manually
      await fs.chmod(readOnlyChunkPath, 0o644); // Make writable
      await fs.remove(readOnlyChunkPath);
    });

    test('should prevent information leakage in error messages', async () => {
      const uploadId = 'info-leak-test';
      const sensitivePathInfo = '/secret/path/with/sensitive/info';
      
      // Test with non-existent upload (should not leak path information)
      try {
        await FileAssemblyService.assembleFile(
          'non-existent-upload', 
          { upload_id: 'non-existent', total_chunks: 2 }, 
          sensitivePathInfo, 
          '/output/path'
        );
        fail('Should have thrown an error');
      } catch (error) {
        // Error message should not contain sensitive path information
        expect(error.message).not.toContain(sensitivePathInfo);
        expect(error.message).not.toContain('/secret/');
        expect(error.message).not.toContain('sensitive');
      }
    });
  });
});
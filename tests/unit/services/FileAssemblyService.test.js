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

// Mock fs promises
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn()
  }
}));

const fs = require('fs').promises;
const FileAssemblyService = require('../../../services/FileAssemblyService');

// Mock console methods to avoid spam during tests
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

beforeAll(() => {
  global.console = mockConsole;
});

afterAll(() => {
  global.console = require('console');
});

describe('FileAssemblyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('assembleFileWithDelegate', () => {
    test('should assemble file successfully via delegate', async () => {
      const uploadId = 'test-upload-123';
      const session = {
        upload_id: uploadId,
        original_name: 'test-file.txt',
        file_size: 1024,
        chunk_count: 3
      };
      const expectedFilePath = '/path/to/assembled/file.txt';
      const mockAssembleFileFn = jest.fn().mockResolvedValue(expectedFilePath);

      const result = await FileAssemblyService.assembleFileWithDelegate(uploadId, session, mockAssembleFileFn);

      expect(result).toBe(expectedFilePath);
      expect(mockAssembleFileFn).toHaveBeenCalledWith(uploadId, session);
    });

    test('should handle assembly errors gracefully', async () => {
      const uploadId = 'error-upload-456';
      const session = { upload_id: uploadId };
      const assemblyError = new Error('Failed to assemble file chunks');
      const mockAssembleFileFn = jest.fn().mockRejectedValue(assemblyError);

      await expect(
        FileAssemblyService.assembleFileWithDelegate(uploadId, session, mockAssembleFileFn)
      ).rejects.toThrow('Failed to assemble file chunks');

      expect(mockAssembleFileFn).toHaveBeenCalledWith(uploadId, session);
    });

    test('should handle various upload ID formats', async () => {
      const uploadIds = [
        'simple-id',
        'uuid-12345678-1234-1234-1234-123456789012',
        'id_with_underscores',
        'id-with-dashes',
        '123456789',
        'MixedCaseId123'
      ];

      for (const uploadId of uploadIds) {
        const session = { upload_id: uploadId };
        const expectedPath = `/path/to/${uploadId}.assembled`;
        const mockAssembleFileFn = jest.fn().mockResolvedValue(expectedPath);

        const result = await FileAssemblyService.assembleFileWithDelegate(uploadId, session, mockAssembleFileFn);

        expect(result).toBe(expectedPath);
        expect(mockAssembleFileFn).toHaveBeenCalledWith(uploadId, session);
      }
    });

    test('should handle various session objects', async () => {
      const uploadId = 'session-test';
      const sessionVariations = [
        { upload_id: uploadId, original_name: 'file.txt' },
        { upload_id: uploadId, chunk_count: 5, file_size: 2048 },
        { upload_id: uploadId, temp_path: '/tmp/chunks' },
        { upload_id: uploadId }, // Minimal session
        {} // Empty session
      ];

      for (const session of sessionVariations) {
        const expectedPath = `/assembled/${uploadId}`;
        const mockAssembleFileFn = jest.fn().mockResolvedValue(expectedPath);

        const result = await FileAssemblyService.assembleFileWithDelegate(uploadId, session, mockAssembleFileFn);

        expect(result).toBe(expectedPath);
        expect(mockAssembleFileFn).toHaveBeenCalledWith(uploadId, session);
      }
    });

    test('should throw if assembleFile function not provided', async () => {
      await expect(
        FileAssemblyService.assembleFileWithDelegate('upload-123', {}, null)
      ).rejects.toThrow('assembleFile function not provided');

      await expect(
        FileAssemblyService.assembleFileWithDelegate('upload-123', {}, undefined)
      ).rejects.toThrow('assembleFile function not provided');
    });
  });

  describe('assembleFile', () => {
    test('should reject invalid parameters', async () => {
      await expect(
        FileAssemblyService.assembleFile(null, {}, '/storage', '/output')
      ).rejects.toThrow('Invalid parameters for file assembly');

      await expect(
        FileAssemblyService.assembleFile('id', null, '/storage', '/output')
      ).rejects.toThrow('Invalid parameters for file assembly');

      await expect(
        FileAssemblyService.assembleFile('id', {}, '/storage', '/output')
      ).rejects.toThrow('Invalid parameters for file assembly');
    });

    test('should assemble single chunk file', async () => {
      const chunkData = Buffer.from('hello world');
      fs.access.mockResolvedValue();
      fs.readFile.mockResolvedValue(chunkData);
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      const result = await FileAssemblyService.assembleFile(
        'upload-1',
        { total_chunks: 1 },
        '/storage',
        '/output/file.txt'
      );

      expect(result).toBe('/output/file.txt');
      expect(fs.writeFile).toHaveBeenCalledWith('/output/file.txt', expect.any(Buffer));
    });

    test('should assemble multi-chunk file in order', async () => {
      const chunk0 = Buffer.from('aaa');
      const chunk1 = Buffer.from('bbb');
      const chunk2 = Buffer.from('ccc');

      fs.access.mockResolvedValue();
      fs.readFile
        .mockResolvedValueOnce(chunk0)
        .mockResolvedValueOnce(chunk1)
        .mockResolvedValueOnce(chunk2);
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      const result = await FileAssemblyService.assembleFile(
        'upload-multi',
        { total_chunks: 3 },
        '/storage',
        '/output/multi.bin'
      );

      expect(result).toBe('/output/multi.bin');
      expect(fs.readFile).toHaveBeenCalledTimes(3);
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/output/multi.bin',
        Buffer.concat([chunk0, chunk1, chunk2])
      );
    });

    test('should throw when chunk is missing', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT'));

      await expect(
        FileAssemblyService.assembleFile(
          'upload-missing',
          { total_chunks: 2 },
          '/storage',
          '/output/file.txt'
        )
      ).rejects.toThrow('Failed to assemble file chunks');
    });

    test('should accept chunk_count as alternative to total_chunks', async () => {
      const chunkData = Buffer.from('data');
      fs.access.mockResolvedValue();
      fs.readFile.mockResolvedValue(chunkData);
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();

      const result = await FileAssemblyService.assembleFile(
        'upload-alt',
        { chunk_count: 1 },
        '/storage',
        '/output/alt.txt'
      );

      expect(result).toBe('/output/alt.txt');
    });
  });

  describe('getFileSize', () => {
    test('should get file size successfully', async () => {
      const filePath = '/path/to/test-file.txt';
      const mockStats = {
        size: 1024768,
        isFile: () => true,
        isDirectory: () => false
      };

      fs.stat.mockResolvedValue(mockStats);

      const size = await FileAssemblyService.getFileSize(filePath);

      expect(size).toBe(1024768);
      expect(fs.stat).toHaveBeenCalledWith(filePath);
    });

    test('should handle file stat errors', async () => {
      const filePath = '/path/to/nonexistent-file.txt';
      const statError = new Error('ENOENT: no such file or directory');

      fs.stat.mockRejectedValue(statError);

      await expect(
        FileAssemblyService.getFileSize(filePath)
      ).rejects.toThrow('ENOENT: no such file or directory');

      expect(fs.stat).toHaveBeenCalledWith(filePath);
    });

    test('should handle various file sizes', async () => {
      const testCases = [
        { path: '/empty-file.txt', size: 0 },
        { path: '/small-file.txt', size: 1 },
        { path: '/medium-file.txt', size: 1024 },
        { path: '/large-file.txt', size: 1048576 },
        { path: '/huge-file.txt', size: Number.MAX_SAFE_INTEGER }
      ];

      for (const { path, size } of testCases) {
        const mockStats = { size, isFile: () => true };
        fs.stat.mockResolvedValue(mockStats);

        const result = await FileAssemblyService.getFileSize(path);

        expect(result).toBe(size);
        expect(fs.stat).toHaveBeenCalledWith(path);
      }

      expect(fs.stat).toHaveBeenCalledTimes(testCases.length);
    });

    test('should handle different file types', async () => {
      const fileTypes = [
        { path: '/document.pdf', size: 1024, isFile: true },
        { path: '/image.jpg', size: 2048, isFile: true },
        { path: '/video.mp4', size: 10485760, isFile: true },
        { path: '/archive.zip', size: 5242880, isFile: true }
      ];

      for (const { path, size, isFile } of fileTypes) {
        const mockStats = { size, isFile: () => isFile };
        fs.stat.mockResolvedValue(mockStats);

        const result = await FileAssemblyService.getFileSize(path);

        expect(result).toBe(size);
        expect(fs.stat).toHaveBeenCalledWith(path);
      }
    });

    test('should handle invalid file paths', async () => {
      const invalidPaths = [
        '',
        null,
        undefined,
        '/path/with spaces',
        '/path/with/../../traversal',
        '/path/with\0null-byte'
      ];

      for (const path of invalidPaths) {
        fs.stat.mockRejectedValue(new Error('Invalid path'));

        await expect(
          FileAssemblyService.getFileSize(path)
        ).rejects.toThrow('Invalid path');

        expect(fs.stat).toHaveBeenCalledWith(path);
      }
    });
  });

  describe('validateChunkCompleteness', () => {
    test('should return true when all chunks uploaded', () => {
      expect(FileAssemblyService.validateChunkCompleteness(5, 5)).toBe(true);
    });

    test('should return true when over-uploaded', () => {
      expect(FileAssemblyService.validateChunkCompleteness(7, 5)).toBe(true);
    });

    test('should return false when incomplete', () => {
      expect(FileAssemblyService.validateChunkCompleteness(3, 5)).toBe(false);
    });

    test('should return false for zero uploads', () => {
      expect(FileAssemblyService.validateChunkCompleteness(0, 5)).toBe(false);
    });
  });

  describe('Performance Tests', () => {
    test('should assemble files within reasonable time via delegate', async () => {
      const mockAssembleFileFn = jest.fn().mockResolvedValue('/assembled/file.txt');

      const startTime = process.hrtime.bigint();
      const result = await FileAssemblyService.assembleFileWithDelegate(
        'performance-test', { upload_id: 'performance-test' }, mockAssembleFileFn
      );
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(100);
      expect(result).toBe('/assembled/file.txt');
    });

    test('should get file size within reasonable time', async () => {
      const filePath = '/performance/test-file.txt';
      const mockStats = { size: 1024, isFile: () => true };

      fs.stat.mockResolvedValue(mockStats);

      const startTime = process.hrtime.bigint();
      const size = await FileAssemblyService.getFileSize(filePath);
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(50);
      expect(size).toBe(1024);
    });

    test('should handle concurrent assembly operations via delegate', async () => {
      const concurrentOperations = Array(5).fill(null).map((_, i) => ({
        uploadId: `concurrent-${i}`,
        session: { upload_id: `concurrent-${i}`, chunk_count: i + 1 },
        expectedPath: `/assembled/concurrent-${i}.txt`
      }));

      const promises = concurrentOperations.map(({ uploadId, session, expectedPath }) => {
        const fn = jest.fn().mockResolvedValue(expectedPath);
        return FileAssemblyService.assembleFileWithDelegate(uploadId, session, fn);
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result).toBe(concurrentOperations[i].expectedPath);
      });
    });

    test('should handle concurrent file size operations', async () => {
      const concurrentFiles = Array(5).fill(null).map((_, i) => ({
        path: `/concurrent/file-${i}.txt`,
        size: (i + 1) * 1024
      }));

      concurrentFiles.forEach(({ size }) => {
        fs.stat.mockResolvedValueOnce({ size, isFile: () => true });
      });

      const promises = concurrentFiles.map(({ path }) =>
        FileAssemblyService.getFileSize(path)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result).toBe(concurrentFiles[i].size);
      });

      expect(fs.stat).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error Recovery', () => {
    test('should handle temporary assembly failures via delegate', async () => {
      const uploadId = 'retry-test';
      const session = { upload_id: uploadId };

      const mockAssembleFileFn = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('/assembled/retry-file.txt');

      // First attempt should fail
      await expect(
        FileAssemblyService.assembleFileWithDelegate(uploadId, session, mockAssembleFileFn)
      ).rejects.toThrow('Temporary failure');

      // Second attempt should succeed
      const result = await FileAssemblyService.assembleFileWithDelegate(uploadId, session, mockAssembleFileFn);
      expect(result).toBe('/assembled/retry-file.txt');

      expect(mockAssembleFileFn).toHaveBeenCalledTimes(2);
    });

    test('should handle filesystem permission errors', async () => {
      const filePath = '/restricted/file.txt';
      fs.stat.mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(
        FileAssemblyService.getFileSize(filePath)
      ).rejects.toThrow('EACCES: permission denied');

      expect(fs.stat).toHaveBeenCalledWith(filePath);
    });
  });

  describe('Edge Cases', () => {
    test('should handle extremely long file paths via delegate', async () => {
      const longPath = '/very/long/path/'.repeat(100) + 'file.txt';
      const session = { upload_id: 'long-path-test' };
      const mockAssembleFileFn = jest.fn().mockResolvedValue(longPath);

      const result = await FileAssemblyService.assembleFileWithDelegate('long-path-test', session, mockAssembleFileFn);

      expect(result).toBe(longPath);
      expect(mockAssembleFileFn).toHaveBeenCalledWith('long-path-test', session);
    });

    test('should handle special characters in upload IDs via delegate', async () => {
      const specialIds = [
        'id-with-spaces test',
        'id.with.dots',
        'id_with_underscores',
        'id@with#special$chars',
        'üñíçødé-id'
      ];

      for (const uploadId of specialIds) {
        const session = { upload_id: uploadId };
        const expectedPath = `/special/${uploadId}`;
        const mockAssembleFileFn = jest.fn().mockResolvedValue(expectedPath);

        const result = await FileAssemblyService.assembleFileWithDelegate(uploadId, session, mockAssembleFileFn);

        expect(result).toBe(expectedPath);
        expect(mockAssembleFileFn).toHaveBeenCalledWith(uploadId, session);
      }
    });

    test('should handle circular references in session objects via delegate', async () => {
      const uploadId = 'circular-test';
      const circularSession = { upload_id: uploadId };
      circularSession.self = circularSession;
      const mockAssembleFileFn = jest.fn().mockResolvedValue('/circular/file.txt');

      const result = await FileAssemblyService.assembleFileWithDelegate(uploadId, circularSession, mockAssembleFileFn);

      expect(result).toBe('/circular/file.txt');
      expect(mockAssembleFileFn).toHaveBeenCalledWith(uploadId, circularSession);
    });
  });

  describe('cleanupChunks', () => {
    test('should cleanup all chunks successfully', async () => {
      fs.unlink.mockResolvedValue();
      fs.rm.mockResolvedValue();

      const result = await FileAssemblyService.cleanupChunks('upload-1', 3, '/storage');

      expect(result.totalChunks).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(fs.unlink).toHaveBeenCalledTimes(3);
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('upload-1'),
        { recursive: true, force: true }
      );
    });

    test('should handle partial cleanup failures gracefully', async () => {
      fs.unlink
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce();
      fs.rm.mockResolvedValue();

      const result = await FileAssemblyService.cleanupChunks('upload-2', 3, '/storage');

      expect(result.totalChunks).toBe(3);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results[1].success).toBe(false);
    });

    test('should handle all chunks failing to delete', async () => {
      fs.unlink.mockRejectedValue(new Error('EACCES'));
      fs.rm.mockResolvedValue();

      const result = await FileAssemblyService.cleanupChunks('upload-3', 2, '/storage');

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(2);
      // Should not try to remove directory when no chunks deleted
      expect(fs.rm).not.toHaveBeenCalled();
    });

    test('should handle zero chunks', async () => {
      const result = await FileAssemblyService.cleanupChunks('upload-empty', 0, '/storage');

      expect(result.totalChunks).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    test('should handle directory removal failure', async () => {
      fs.unlink.mockResolvedValue();
      fs.rm.mockRejectedValue(new Error('ENOENT'));

      const result = await FileAssemblyService.cleanupChunks('upload-4', 1, '/storage');

      // Should still succeed — directory removal failure is non-critical
      expect(result.successful).toBe(1);
    });

    test('should return results with correct chunk paths', async () => {
      fs.unlink.mockResolvedValue();
      fs.rm.mockResolvedValue();

      const result = await FileAssemblyService.cleanupChunks('upload-5', 2, '/storage');

      expect(result.results[0].path).toContain('chunk_0');
      expect(result.results[1].path).toContain('chunk_1');
      expect(result.results[0].success).toBe(true);
    });

    test('should include duration in result', async () => {
      fs.unlink.mockResolvedValue();
      fs.rm.mockResolvedValue();

      const result = await FileAssemblyService.cleanupChunks('upload-6', 1, '/storage');

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateChunksParallel', () => {
    test('should validate all chunks exist', async () => {
      fs.stat
        .mockResolvedValueOnce({ size: 100 })
        .mockResolvedValueOnce({ size: 200 })
        .mockResolvedValueOnce({ size: 150 });

      const result = await FileAssemblyService.validateChunksParallel('upload-1', 3, '/storage');

      expect(result.isComplete).toBe(true);
      expect(result.totalChunks).toBe(3);
      expect(result.existingChunks).toBe(3);
      expect(result.missingChunks).toBe(0);
      expect(result.totalSize).toBe(450);
      expect(result.missingChunkIndices).toEqual([]);
    });

    test('should detect missing chunks', async () => {
      fs.stat
        .mockResolvedValueOnce({ size: 100 })
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce({ size: 150 });

      const result = await FileAssemblyService.validateChunksParallel('upload-2', 3, '/storage');

      expect(result.isComplete).toBe(false);
      expect(result.existingChunks).toBe(2);
      expect(result.missingChunks).toBe(1);
      expect(result.missingChunkIndices).toEqual([1]);
      expect(result.totalSize).toBe(250);
    });

    test('should handle all chunks missing', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await FileAssemblyService.validateChunksParallel('upload-3', 3, '/storage');

      expect(result.isComplete).toBe(false);
      expect(result.existingChunks).toBe(0);
      expect(result.missingChunks).toBe(3);
      expect(result.totalSize).toBe(0);
      expect(result.missingChunkIndices).toEqual([0, 1, 2]);
    });

    test('should handle zero total chunks', async () => {
      const result = await FileAssemblyService.validateChunksParallel('upload-4', 0, '/storage');

      expect(result.isComplete).toBe(true);
      expect(result.totalChunks).toBe(0);
      expect(result.existingChunks).toBe(0);
      expect(result.missingChunks).toBe(0);
    });

    test('should include correct paths in results', async () => {
      fs.stat.mockResolvedValue({ size: 100 });

      const result = await FileAssemblyService.validateChunksParallel('upload-5', 2, '/storage');

      expect(result.results[0].path).toContain('chunk_0');
      expect(result.results[1].path).toContain('chunk_1');
    });

    test('should include duration in result', async () => {
      fs.stat.mockResolvedValue({ size: 50 });

      const result = await FileAssemblyService.validateChunksParallel('upload-6', 1, '/storage');

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test('should include error message for missing chunks', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await FileAssemblyService.validateChunksParallel('upload-7', 1, '/storage');

      expect(result.results[0].exists).toBe(false);
      expect(result.results[0].error).toContain('ENOENT');
    });

    test('should report correct size for single chunk', async () => {
      fs.stat.mockResolvedValue({ size: 5242880 }); // 5MB

      const result = await FileAssemblyService.validateChunksParallel('upload-8', 1, '/storage');

      expect(result.totalSize).toBe(5242880);
      expect(result.existingChunks).toBe(1);
    });
  });
});

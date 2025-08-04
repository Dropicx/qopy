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

// Mock fs promises
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn()
  }
}));

// Mock the server.js module
jest.mock('../../../server.js', () => ({
  assembleFile: jest.fn()
}));

const fs = require('fs').promises;
const { assembleFile: mockAssembleFile } = require('../../../server.js');
const FileAssemblyService = require('../../../services/FileAssemblyService');

// Mock console methods to avoid spam during tests
const mockConsole = {
  log: jest.fn(),
  error: jest.fn()
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

  describe('assembleFile', () => {
    test('should assemble file successfully', async () => {
      const uploadId = 'test-upload-123';
      const session = {
        upload_id: uploadId,
        original_name: 'test-file.txt',
        file_size: 1024,
        chunk_count: 3
      };
      const expectedFilePath = '/path/to/assembled/file.txt';

      mockAssembleFile.mockResolvedValue(expectedFilePath);

      const result = await FileAssemblyService.assembleFile(uploadId, session);

      expect(result).toBe(expectedFilePath);
      expect(mockAssembleFile).toHaveBeenCalledWith(uploadId, session);
      expect(mockConsole.log).toHaveBeenCalledWith('📝 About to assemble file:', uploadId);
      expect(mockConsole.log).toHaveBeenCalledWith('📝 File assembled successfully:', expectedFilePath);
    });

    test('should handle assembly errors gracefully', async () => {
      const uploadId = 'error-upload-456';
      const session = { upload_id: uploadId };
      const assemblyError = new Error('Failed to assemble file chunks');

      mockAssembleFile.mockRejectedValue(assemblyError);

      await expect(
        FileAssemblyService.assembleFile(uploadId, session)
      ).rejects.toThrow('Failed to assemble file chunks');

      expect(mockAssembleFile).toHaveBeenCalledWith(uploadId, session);
      expect(mockConsole.log).toHaveBeenCalledWith('📝 About to assemble file:', uploadId);
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

        mockAssembleFile.mockResolvedValue(expectedPath);

        const result = await FileAssemblyService.assembleFile(uploadId, session);

        expect(result).toBe(expectedPath);
        expect(mockAssembleFile).toHaveBeenCalledWith(uploadId, session);
      }

      expect(mockAssembleFile).toHaveBeenCalledTimes(uploadIds.length);
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
        mockAssembleFile.mockResolvedValue(expectedPath);

        const result = await FileAssemblyService.assembleFile(uploadId, session);

        expect(result).toBe(expectedPath);
        expect(mockAssembleFile).toHaveBeenCalledWith(uploadId, session);
      }

      expect(mockAssembleFile).toHaveBeenCalledTimes(sessionVariations.length);
    });

    test('should handle null or undefined parameters', async () => {
      const testCases = [
        { uploadId: null, session: {} },
        { uploadId: undefined, session: {} },
        { uploadId: 'valid-id', session: null },
        { uploadId: 'valid-id', session: undefined },
        { uploadId: null, session: null }
      ];

      for (const { uploadId, session } of testCases) {
        mockAssembleFile.mockResolvedValue('/default/path');

        const result = await FileAssemblyService.assembleFile(uploadId, session);

        expect(result).toBe('/default/path');
        expect(mockAssembleFile).toHaveBeenCalledWith(uploadId, session);
      }

      expect(mockAssembleFile).toHaveBeenCalledTimes(testCases.length);
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

  describe('Performance Tests', () => {
    test('should assemble files within reasonable time', async () => {
      const uploadId = 'performance-test';
      const session = { upload_id: uploadId };

      mockAssembleFile.mockResolvedValue('/assembled/file.txt');

      const startTime = process.hrtime.bigint();
      const result = await FileAssemblyService.assembleFile(uploadId, session);
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(100); // Should complete in less than 100ms
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
      expect(durationMs).toBeLessThan(50); // Should complete in less than 50ms
      expect(size).toBe(1024);
    });

    test('should handle concurrent assembly operations', async () => {
      const concurrentOperations = Array(5).fill(null).map((_, i) => ({
        uploadId: `concurrent-${i}`,
        session: { upload_id: `concurrent-${i}`, chunk_count: i + 1 },
        expectedPath: `/assembled/concurrent-${i}.txt`
      }));

      concurrentOperations.forEach(({ expectedPath }) => {
        mockAssembleFile.mockResolvedValueOnce(expectedPath);
      });

      const promises = concurrentOperations.map(({ uploadId, session }) =>
        FileAssemblyService.assembleFile(uploadId, session)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, i) => {
        expect(result).toBe(concurrentOperations[i].expectedPath);
      });

      expect(mockAssembleFile).toHaveBeenCalledTimes(5);
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
    test('should handle temporary assembly failures', async () => {
      const uploadId = 'retry-test';
      const session = { upload_id: uploadId };

      // First call fails, second succeeds
      mockAssembleFile
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('/assembled/retry-file.txt');

      // First attempt should fail
      await expect(
        FileAssemblyService.assembleFile(uploadId, session)
      ).rejects.toThrow('Temporary failure');

      // Second attempt should succeed
      const result = await FileAssemblyService.assembleFile(uploadId, session);
      expect(result).toBe('/assembled/retry-file.txt');

      expect(mockAssembleFile).toHaveBeenCalledTimes(2);
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
    test('should handle extremely long file paths', async () => {
      const longPath = '/very/long/path/'.repeat(100) + 'file.txt';
      const session = { upload_id: 'long-path-test' };

      mockAssembleFile.mockResolvedValue(longPath);

      const result = await FileAssemblyService.assembleFile('long-path-test', session);

      expect(result).toBe(longPath);
      expect(mockAssembleFile).toHaveBeenCalledWith('long-path-test', session);
    });

    test('should handle special characters in upload IDs', async () => {
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

        mockAssembleFile.mockResolvedValue(expectedPath);

        const result = await FileAssemblyService.assembleFile(uploadId, session);

        expect(result).toBe(expectedPath);
        expect(mockAssembleFile).toHaveBeenCalledWith(uploadId, session);
      }
    });

    test('should handle circular references in session objects', async () => {
      const uploadId = 'circular-test';
      const circularSession = { upload_id: uploadId };
      circularSession.self = circularSession;

      mockAssembleFile.mockResolvedValue('/circular/file.txt');

      const result = await FileAssemblyService.assembleFile(uploadId, circularSession);

      expect(result).toBe('/circular/file.txt');
      expect(mockAssembleFile).toHaveBeenCalledWith(uploadId, circularSession);
    });
  });
});
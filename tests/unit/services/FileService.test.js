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

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { mockResponse } = require('../../helpers/mocks');

// Mock the fs modules
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    unlink: jest.fn()
  },
  createReadStream: jest.fn()
}));

const FileService = require('../../../services/FileService');

describe('FileService', () => {
  let fileService;

  beforeEach(() => {
    fileService = new FileService();
    jest.clearAllMocks();
    // Mock console methods to avoid spam during tests
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  describe('fileExists', () => {
    test('should return true when file exists', async () => {
      fs.access.mockResolvedValue();
      
      const result = await fileService.fileExists('/path/to/existing/file.txt');
      
      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/path/to/existing/file.txt');
    });

    test('should return false when file does not exist', async () => {
      fs.access.mockRejectedValue(new Error('File not found'));
      
      const result = await fileService.fileExists('/path/to/nonexistent/file.txt');
      
      expect(result).toBe(false);
      expect(fs.access).toHaveBeenCalledWith('/path/to/nonexistent/file.txt');
    });

    test('should handle various file path formats', async () => {
      const testPaths = [
        '/absolute/path/file.txt',
        './relative/path/file.txt',
        '../parent/file.txt',
        'simple-filename.txt',
        '/path/with spaces/file.txt',
        '/path-with-dashes/file.txt',
        '/path_with_underscores/file.txt'
      ];

      fs.access.mockResolvedValue();

      for (const testPath of testPaths) {
        const result = await fileService.fileExists(testPath);
        expect(result).toBe(true);
      }

      expect(fs.access).toHaveBeenCalledTimes(testPaths.length);
    });

    test('should handle empty or null paths gracefully', async () => {
      fs.access.mockRejectedValue(new Error('Invalid path'));

      const result1 = await fileService.fileExists('');
      const result2 = await fileService.fileExists(null);
      const result3 = await fileService.fileExists(undefined);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
    });

    test('should handle filesystem errors gracefully', async () => {
      const errorTypes = [
        new Error('ENOENT: no such file or directory'),
        new Error('EACCES: permission denied'),
        new Error('EMFILE: too many open files'),
        new Error('ENOTDIR: not a directory'),
        new Error('EISDIR: illegal operation on a directory'),
        new Error('ENAMETOOLONG: name too long')
      ];

      for (const error of errorTypes) {
        fs.access.mockRejectedValue(error);
        const result = await fileService.fileExists('/test/path');
        expect(result).toBe(false);
      }
    });

    test('should handle concurrent file existence checks', async () => {
      fs.access.mockResolvedValue();
      
      const promises = Array(10).fill(null).map((_, i) => 
        fileService.fileExists(`/test/file${i}.txt`)
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      expect(results.every(result => result === true)).toBe(true);
      expect(fs.access).toHaveBeenCalledTimes(10);
    });
  });

  describe('setDownloadHeaders', () => {
    let res;

    beforeEach(() => {
      res = mockResponse();
    });

    test('should set correct headers for a typical file', () => {
      const clip = {
        mime_type: 'application/pdf',
        filesize: 1024768,
        original_filename: 'document.pdf'
      };

      fileService.setDownloadHeaders(res, clip);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 1024768);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="document.pdf"');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
    });

    test('should use default mime type when not provided', () => {
      const clip = {
        filesize: 512,
        original_filename: 'unknown-file'
      };

      fileService.setDownloadHeaders(res, clip);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 512);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="unknown-file"');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
    });

    test('should handle various mime types correctly', () => {
      const testCases = [
        { mime_type: 'text/plain', expected: 'text/plain' },
        { mime_type: 'image/jpeg', expected: 'image/jpeg' },
        { mime_type: 'image/png', expected: 'image/png' },
        { mime_type: 'application/json', expected: 'application/json' },
        { mime_type: 'video/mp4', expected: 'video/mp4' },
        { mime_type: 'audio/mpeg', expected: 'audio/mpeg' },
        { mime_type: 'application/zip', expected: 'application/zip' },
        { mime_type: null, expected: 'application/octet-stream' },
        { mime_type: undefined, expected: 'application/octet-stream' },
        { mime_type: '', expected: 'application/octet-stream' }
      ];

      testCases.forEach(({ mime_type, expected }, index) => {
        const clip = {
          mime_type,
          filesize: 1000 + index,
          original_filename: `file${index}.ext`
        };

        const mockRes = mockResponse();
        fileService.setDownloadHeaders(mockRes, clip);

        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', expected);
      });
    });

    test('should handle special characters in filenames', () => {
      const specialFilenames = [
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
        'file.with.dots.txt',
        'file(with)parentheses.txt',
        'file[with]brackets.txt',
        'file{with}braces.txt',
        'file+with+plus.txt',
        'file=with=equals.txt',
        'file&with&ampersand.txt'
      ];

      specialFilenames.forEach(filename => {
        const clip = {
          mime_type: 'text/plain',
          filesize: 1024,
          original_filename: filename
        };

        const mockRes = mockResponse();
        fileService.setDownloadHeaders(mockRes, clip);

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Content-Disposition', 
          `attachment; filename="${filename}"`
        );
        expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
      });
    });

    test('should handle edge cases for file sizes', () => {
      const testSizes = [0, 1, 1023, 1024, 1048576, 1073741824, Number.MAX_SAFE_INTEGER];

      testSizes.forEach(size => {
        const clip = {
          mime_type: 'application/octet-stream',
          filesize: size,
          original_filename: 'test.bin'
        };

        const mockRes = mockResponse();
        fileService.setDownloadHeaders(mockRes, clip);

        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', size);
      });
    });

    test('should handle missing filename', () => {
      const clip = {
        mime_type: 'text/plain',
        filesize: 1024
        // original_filename is missing
      };

      const mockRes = mockResponse();
      fileService.setDownloadHeaders(mockRes, clip);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition', 
        'attachment; filename="undefined"'
      );
    });

    test('should handle unicode filenames', () => {
      const unicodeFilenames = [
        'файл.txt',         // Cyrillic
        'ファイル.txt',        // Japanese
        '文件.txt',          // Chinese
        'archivo_español.txt', // Spanish with accents
        'tëst_fïlé.txt',     // Accented characters
        '🔥📁🚀.txt'         // Emoji
      ];

      unicodeFilenames.forEach(filename => {
        const clip = {
          mime_type: 'text/plain',
          filesize: 1024,
          original_filename: filename
        };

        const mockRes = mockResponse();
        fileService.setDownloadHeaders(mockRes, clip);

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Content-Disposition', 
          `attachment; filename="${filename}"`
        );
      });
    });
  });

  describe('streamFile', () => {
    let mockFileStream;
    let res;

    beforeEach(() => {
      res = mockResponse();
      mockFileStream = {
        pipe: jest.fn(),
        on: jest.fn(),
        destroy: jest.fn()
      };
      fsSync.createReadStream = jest.fn().mockReturnValue(mockFileStream);
    });

    test('should stream file successfully', async () => {
      const filePath = '/test/file.txt';
      
      // Simulate successful streaming
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(callback, 10);
        }
        return mockFileStream;
      });

      const streamPromise = fileService.streamFile(filePath, res);
      
      expect(fsSync.createReadStream).toHaveBeenCalledWith(filePath);
      expect(mockFileStream.pipe).toHaveBeenCalledWith(res);
      expect(mockFileStream.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockFileStream.on).toHaveBeenCalledWith('end', expect.any(Function));

      await streamPromise;
      expect(console.log).toHaveBeenCalledWith('✅ File streaming completed');
    });

    test('should handle streaming errors', async () => {
      const filePath = '/test/error-file.txt';
      const streamError = new Error('File read error');
      
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(streamError), 10);
        }
        return mockFileStream;
      });

      await expect(fileService.streamFile(filePath, res)).rejects.toThrow('File read error');
      
      expect(console.error).toHaveBeenCalledWith('❌ Error streaming file:', 'File read error');
    });

    test('should handle streaming errors with headers not sent', async () => {
      const filePath = '/test/error-file.txt';
      const streamError = new Error('File read error');
      
      res.headersSent = false;
      
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(streamError), 10);
        }
        return mockFileStream;
      });

      await expect(fileService.streamFile(filePath, res)).rejects.toThrow('File read error');
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'File stream error',
        message: 'Failed to stream file'
      });
    });

    test('should handle streaming errors with headers already sent', async () => {
      const filePath = '/test/error-file.txt';
      const streamError = new Error('File read error');
      
      res.headersSent = true;
      
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(streamError), 10);
        }
        return mockFileStream;
      });

      await expect(fileService.streamFile(filePath, res)).rejects.toThrow('File read error');
      
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('should delete file after streaming when deleteAfterSend is true', async () => {
      const filePath = '/test/one-time-file.txt';
      fs.unlink.mockResolvedValue();
      
      let endCallback;
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          endCallback = callback;
          // Call it twice to simulate both the resolve and delete callbacks
          setTimeout(() => {
            callback(); // First call for resolve
            callback(); // Second call for delete
          }, 10);
        }
        return mockFileStream;
      });

      const streamPromise = fileService.streamFile(filePath, res, { deleteAfterSend: true });
      
      await streamPromise;
      
      expect(fs.unlink).toHaveBeenCalledWith(filePath);
      expect(console.log).toHaveBeenCalledWith('🧹 Deleted one-time file after streaming:', filePath);
    });

    test('should handle deletion error for one-time files', async () => {
      const filePath = '/test/one-time-file.txt';
      const deleteError = new Error('Permission denied');
      fs.unlink.mockRejectedValue(deleteError);
      
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => {
            callback(); // First call for resolve
            callback(); // Second call for delete
          }, 10);
        }
        return mockFileStream;
      });

      const streamPromise = fileService.streamFile(filePath, res, { deleteAfterSend: true });
      
      await streamPromise;
      
      expect(fs.unlink).toHaveBeenCalledWith(filePath);
      expect(console.warn).toHaveBeenCalledWith('⚠️ Could not delete one-time file:', 'Permission denied');
    });

    test('should not delete file when deleteAfterSend is false', async () => {
      const filePath = '/test/regular-file.txt';
      
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(callback, 10);
        }
        return mockFileStream;
      });

      await fileService.streamFile(filePath, res, { deleteAfterSend: false });
      
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    test('should not delete file when no options provided', async () => {
      const filePath = '/test/regular-file.txt';
      
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(callback, 10);
        }
        return mockFileStream;
      });

      await fileService.streamFile(filePath, res);
      
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    test('should handle custom options', async () => {
      const filePath = '/test/custom-file.txt';
      const customOptions = {
        deleteAfterSend: false,
        customOption: 'test-value'
      };
      
      mockFileStream.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(callback, 10);
        }
        return mockFileStream;
      });

      await fileService.streamFile(filePath, res, customOptions);
      
      expect(fsSync.createReadStream).toHaveBeenCalledWith(filePath);
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    test('should delete file successfully', async () => {
      const filePath = '/test/file-to-delete.txt';
      fs.unlink.mockResolvedValue();

      const result = await fileService.deleteFile(filePath);

      expect(result).toBe(true);
      expect(fs.unlink).toHaveBeenCalledWith(filePath);
      expect(console.log).toHaveBeenCalledWith('🧹 File deleted:', filePath);
    });

    test('should handle deletion errors gracefully', async () => {
      const filePath = '/test/protected-file.txt';
      const deleteError = new Error('Permission denied');
      fs.unlink.mockRejectedValue(deleteError);

      const result = await fileService.deleteFile(filePath);

      expect(result).toBe(false);
      expect(fs.unlink).toHaveBeenCalledWith(filePath);
      expect(console.warn).toHaveBeenCalledWith('⚠️ Could not delete file:', 'Permission denied');
    });

    test('should handle various deletion error types', async () => {
      const errorTypes = [
        new Error('ENOENT: no such file or directory'),
        new Error('EACCES: permission denied'),
        new Error('EBUSY: resource busy or locked'),
        new Error('EPERM: operation not permitted'),
        new Error('EISDIR: illegal operation on a directory')
      ];

      for (const error of errorTypes) {
        fs.unlink.mockRejectedValue(error);
        
        const result = await fileService.deleteFile('/test/file.txt');
        
        expect(result).toBe(false);
        expect(console.warn).toHaveBeenCalledWith('⚠️ Could not delete file:', error.message);
      }
    });

    test('should handle multiple concurrent deletions', async () => {
      fs.unlink.mockResolvedValue();

      const promises = Array(5).fill(null).map((_, i) => 
        fileService.deleteFile(`/test/file${i}.txt`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every(result => result === true)).toBe(true);
      expect(fs.unlink).toHaveBeenCalledTimes(5);
    });

    test('should handle empty or invalid file paths', async () => {
      const invalidPaths = ['', null, undefined];

      for (const path of invalidPaths) {
        fs.unlink.mockRejectedValue(new Error('Invalid path'));
        
        const result = await fileService.deleteFile(path);
        
        expect(result).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle filesystem errors gracefully', async () => {
      const errorTypes = [
        new Error('ENOENT: no such file or directory'),
        new Error('EACCES: permission denied'),
        new Error('EMFILE: too many open files'),
        new Error('ENOTDIR: not a directory')
      ];

      for (const error of errorTypes) {
        fs.access.mockRejectedValue(error);
        const result = await fileService.fileExists('/test/path');
        expect(result).toBe(false);
      }
    });

    test('should handle response object with missing methods gracefully', () => {
      const invalidRes = {};
      const clip = {
        mime_type: 'text/plain',
        filesize: 1024,
        original_filename: 'test.txt'
      };

      expect(() => {
        fileService.setDownloadHeaders(invalidRes, clip);
      }).toThrow();
    });

    test('should handle invalid clip objects', () => {
      const res = mockResponse();
      const invalidClips = [
        null,
        undefined,
        {},
        { mime_type: null, filesize: null, original_filename: null },
        'invalid-clip'
      ];

      invalidClips.forEach(clip => {
        expect(() => {
          fileService.setDownloadHeaders(res, clip);
        }).not.toThrow();
      });
    });
  });

  describe('Performance Tests', () => {
    test('should check file exists within reasonable time', async () => {
      fs.access.mockResolvedValue();
      
      const startTime = process.hrtime.bigint();
      await fileService.fileExists('/test/file.txt');
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(100);
    });

    test('should handle multiple concurrent file existence checks', async () => {
      fs.access.mockResolvedValue();
      
      const promises = Array(10).fill(null).map((_, i) => 
        fileService.fileExists(`/test/file${i}.txt`)
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      expect(results.every(result => result === true)).toBe(true);
      expect(fs.access).toHaveBeenCalledTimes(10);
    });

    test('should set headers efficiently for multiple files', () => {
      const res = mockResponse();
      const startTime = process.hrtime.bigint();

      for (let i = 0; i < 100; i++) {
        const clip = {
          mime_type: 'text/plain',
          filesize: 1024 + i,
          original_filename: `file${i}.txt`
        };
        fileService.setDownloadHeaders(res, clip);
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(100);
    });

    test('should handle large file operations efficiently', async () => {
      const largeFilePath = '/test/large-file-10gb.bin';
      fs.access.mockResolvedValue();
      fs.unlink.mockResolvedValue();

      const startTime = process.hrtime.bigint();
      
      const exists = await fileService.fileExists(largeFilePath);
      const deleted = await fileService.deleteFile(largeFilePath);
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      expect(exists).toBe(true);
      expect(deleted).toBe(true);
      expect(durationMs).toBeLessThan(200);
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory during file operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      fs.access.mockResolvedValue();
      fs.unlink.mockResolvedValue();

      for (let i = 0; i < 100; i++) {
        await fileService.fileExists(`/test/file${i}.txt`);
        await fileService.deleteFile(`/test/file${i}.txt`);
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024); // Less than 5MB increase
    });

    test('should handle header setting without memory leaks', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 1000; i++) {
        const res = mockResponse();
        const clip = {
          mime_type: 'application/octet-stream',
          filesize: 1024 * i,
          original_filename: `memory-test-${i}.bin`
        };
        fileService.setDownloadHeaders(res, clip);
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB increase
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete file lifecycle', async () => {
      const filePath = '/test/lifecycle-file.txt';
      
      // File doesn't exist initially
      fs.access.mockRejectedValue(new Error('File not found'));
      let exists = await fileService.fileExists(filePath);
      expect(exists).toBe(false);

      // File exists after creation
      fs.access.mockResolvedValue();
      exists = await fileService.fileExists(filePath);
      expect(exists).toBe(true);

      // Delete file successfully
      fs.unlink.mockResolvedValue();
      const deleted = await fileService.deleteFile(filePath);
      expect(deleted).toBe(true);
    });

    test('should handle streaming with proper cleanup', async () => {
      const filePath = '/test/stream-and-delete.txt';
      const res = mockResponse();
      
      fs.unlink.mockResolvedValue();
      
      const mockFileStream = {
        pipe: jest.fn(),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'end') {
            setTimeout(() => {
              callback(); // Streaming complete
              callback(); // Deletion callback
            }, 10);
          }
          return mockFileStream;
        }),
        destroy: jest.fn()
      };
      
      fsSync.createReadStream.mockReturnValue(mockFileStream);

      await fileService.streamFile(filePath, res, { deleteAfterSend: true });

      expect(mockFileStream.pipe).toHaveBeenCalledWith(res);
      expect(fs.unlink).toHaveBeenCalledWith(filePath);
      expect(console.log).toHaveBeenCalledWith('✅ File streaming completed');
      expect(console.log).toHaveBeenCalledWith('🧹 Deleted one-time file after streaming:', filePath);
    });
  });
});
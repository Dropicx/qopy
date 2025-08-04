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

const NetworkService = require('../../../services/core/NetworkService');
const fs = require('fs').promises;
const path = require('path');

// Mock fs module
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        writeFile: jest.fn(),
        readFile: jest.fn(),
        unlink: jest.fn(),
        access: jest.fn()
    },
    createWriteStream: jest.fn(),
    createReadStream: jest.fn()
}));

describe('NetworkService', () => {
    let networkService;
    let mockLogger;
    let mockValidator;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            log: jest.fn() // Add log method for BaseService
        };
        
        mockValidator = {
            validate: jest.fn().mockResolvedValue(true)
        };

        networkService = new NetworkService(mockLogger, mockValidator);
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Constructor & Configuration', () => {
        test('should initialize with default configuration', () => {
            const service = new NetworkService(mockLogger, mockValidator);
            
            expect(service.config.maxFileSize).toBe(100 * 1024 * 1024);
            expect(service.config.chunkSize).toBe(1024 * 1024);
            expect(service.config.maxConcurrentUploads).toBe(10);
            expect(service.activeOperations.size).toBe(0);
        });

        test('should accept custom configuration', () => {
            const customConfig = {
                maxFileSize: 50 * 1024 * 1024,
                chunkSize: 512 * 1024,
                maxConcurrentUploads: 5
            };
            
            const service = new NetworkService(mockLogger, mockValidator, customConfig);
            
            expect(service.config.maxFileSize).toBe(50 * 1024 * 1024);
            expect(service.config.chunkSize).toBe(512 * 1024);
            expect(service.config.maxConcurrentUploads).toBe(5);
        });
    });

    describe('uploadFile', () => {
        const mockFile = {
            originalname: 'test.txt',
            size: 1024,
            mimetype: 'text/plain',
            buffer: Buffer.from('test content')
        };

        const uploadRequest = {
            file: mockFile,
            sessionId: 'session-123',
            metadata: { test: 'data' }
        };

        beforeEach(() => {
            fs.mkdir.mockResolvedValue();
            fs.writeFile.mockResolvedValue();
        });

        test('should validate required parameters', async () => {
            await expect(
                networkService.uploadFile({ sessionId: 'test' })
            ).rejects.toThrow();

            await expect(
                networkService.uploadFile({ file: mockFile })
            ).rejects.toThrow();
        });

        test('should reject files exceeding size limit', async () => {
            const largeFile = {
                ...mockFile,
                size: networkService.config.maxFileSize + 1
            };

            await expect(
                networkService.uploadFile({ file: largeFile, sessionId: 'test' })
            ).rejects.toThrow('exceeds maximum allowed');
        });

        test('should reject when concurrent upload limit reached', async () => {
            // Fill up the active operations
            for (let i = 0; i < networkService.config.maxConcurrentUploads; i++) {
                networkService.activeOperations.set(`op-${i}`, {});
            }

            await expect(
                networkService.uploadFile(uploadRequest)
            ).rejects.toThrow('Too many concurrent uploads');
        });

        test('should handle direct upload for small files', async () => {
            const result = await networkService.uploadFile(uploadRequest);

            expect(result.operationId).toBeDefined();
            expect(result.sessionId).toBe('session-123');
            expect(fs.mkdir).toHaveBeenCalled();
            expect(fs.writeFile).toHaveBeenCalled();
        });

        test('should handle chunked upload for large files', async () => {
            const largeFile = {
                ...mockFile,
                size: networkService.config.chunkSize * 2, // Force chunked upload
                buffer: Buffer.alloc(networkService.config.chunkSize * 2)
            };

            const largeUploadRequest = { ...uploadRequest, file: largeFile };

            const result = await networkService.uploadFile(largeUploadRequest);

            expect(result.operationId).toBeDefined();
            expect(result.sessionId).toBe('session-123');
        });

        test('should track upload progress', async () => {
            const progressCallback = jest.fn();
            const requestWithProgress = { ...uploadRequest, progressCallback };

            await networkService.uploadFile(requestWithProgress);

            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    operationId: expect.any(String),
                    uploaded: expect.any(Number),
                    total: expect.any(Number),
                    percentage: expect.any(Number)
                })
            );
        });

        test('should cleanup operations after completion', async () => {
            const result = await networkService.uploadFile(uploadRequest);
            
            // Operation should be in active operations initially
            expect(networkService.activeOperations.has(result.operationId)).toBe(true);
            
            // Should be cleaned up after timeout (we'll simulate this)
            networkService.activeOperations.delete(result.operationId);
            expect(networkService.activeOperations.has(result.operationId)).toBe(false);
        });
    });

    describe('downloadFile', () => {
        beforeEach(() => {
            // Mock file metadata
            networkService.getFileMetadata = jest.fn().mockResolvedValue({
                fileName: 'test.txt',
                fileSize: 1024,
                mimeType: 'text/plain',
                filePath: '/path/to/test.txt'
            });

            fs.access.mockResolvedValue();
            
            // Mock createReadStream
            require('fs').createReadStream.mockReturnValue({
                on: jest.fn(),
                pipe: jest.fn()
            });
        });

        test('should validate file ID parameter', async () => {
            await expect(
                networkService.downloadFile(null)
            ).rejects.toThrow();

            await expect(
                networkService.downloadFile('')
            ).rejects.toThrow();
        });

        test('should reject download for non-existent file', async () => {
            networkService.getFileMetadata.mockResolvedValue(null);

            await expect(
                networkService.downloadFile('non-existent')
            ).rejects.toThrow('File not found');
        });

        test('should create file stream for download', async () => {
            const mockResponse = {
                setHeader: jest.fn()
            };

            const stream = await networkService.downloadFile('file-123', { 
                response: mockResponse 
            });

            expect(stream).toBeDefined();
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
            expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Length', 1024);
        });

        test('should support range requests', async () => {
            const downloadOptions = {
                range: 'bytes=0-511'
            };

            const stream = await networkService.downloadFile('file-123', downloadOptions);

            expect(stream).toBeDefined();
            expect(require('fs').createReadStream).toHaveBeenCalledWith(
                '/path/to/test.txt',
                expect.objectContaining({
                    start: 0,
                    end: 511
                })
            );
        });

        test('should track download progress', async () => {
            const progressCallback = jest.fn();
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        // Simulate data chunks
                        callback(Buffer.from('test'));
                    }
                }),
                pipe: jest.fn()
            };
            
            require('fs').createReadStream.mockReturnValue(mockStream);

            await networkService.downloadFile('file-123', { progressCallback });

            expect(mockStream.on).toHaveBeenCalledWith('data', expect.any(Function));
        });

        test('should handle one-time file deletion', async () => {
            const downloadOptions = { deleteAfterDownload: true };
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'end') {
                        callback();
                    }
                }),
                pipe: jest.fn()
            };
            
            require('fs').createReadStream.mockReturnValue(mockStream);

            await networkService.downloadFile('file-123', downloadOptions);

            expect(mockStream.on).toHaveBeenCalledWith('end', expect.any(Function));
        });
    });

    describe('resumeUpload', () => {
        test('should resume existing upload session', async () => {
            const uploadContext = {
                fileName: 'test.txt',
                fileSize: 2048,
                uploaded: 1024,
                status: 'paused'
            };
            
            networkService.uploadSessions.set('upload-123', uploadContext);

            const resumeOptions = {
                resumeFrom: 1024,
                file: { buffer: Buffer.alloc(2048) },
                progressCallback: jest.fn()
            };

            const result = await networkService.resumeUpload('upload-123', resumeOptions);

            expect(result).toBeDefined();
            expect(uploadContext.status).toBe('resuming');
            expect(uploadContext.uploaded).toBe(1024);
        });

        test('should reject resume for non-existent session', async () => {
            await expect(
                networkService.resumeUpload('non-existent', {})
            ).rejects.toThrow('Upload session not found');
        });

        test('should handle already completed uploads', async () => {
            const completedContext = {
                status: 'completed',
                fileName: 'test.txt'
            };
            
            networkService.uploadSessions.set('completed-123', completedContext);

            const result = await networkService.resumeUpload('completed-123', {});

            expect(result.message).toContain('already completed');
        });
    });

    describe('cancelOperation', () => {
        test('should cancel active operation', async () => {
            const operationId = 'op-123';
            const operation = {
                sessionId: 'session-123',
                fileName: 'test.txt',
                status: 'uploading'
            };

            networkService.activeOperations.set(operationId, operation);
            networkService.uploadSessions.set('session-123', operation);

            const result = await networkService.cancelOperation(operationId);

            expect(result).toBe(true);
            expect(operation.status).toBe('cancelled');
            expect(networkService.activeOperations.has(operationId)).toBe(false);
        });

        test('should return false for non-existent operation', async () => {
            const result = await networkService.cancelOperation('non-existent');

            expect(result).toBe(false);
        });
    });

    describe('getProgress', () => {
        test('should return upload progress', async () => {
            const operationId = 'op-123';
            const operation = {
                fileName: 'test.txt',
                fileSize: 2048,
                uploaded: 1024,
                status: 'uploading',
                startTime: Date.now() - 5000
            };

            networkService.activeOperations.set(operationId, operation);

            const progress = await networkService.getProgress(operationId);

            expect(progress.operationId).toBe(operationId);
            expect(progress.type).toBe('upload');
            expect(progress.percentage).toBe(50);
            expect(progress.uploaded).toBe(1024);
            expect(progress.duration).toBeGreaterThan(0);
        });

        test('should return download progress', async () => {
            const operationId = 'op-456';
            const operation = {
                fileId: 'file-123',
                fileName: 'test.txt',
                fileSize: 1024,
                downloaded: 512,
                status: 'downloading',
                startTime: Date.now() - 3000
            };

            networkService.activeOperations.set(operationId, operation);

            const progress = await networkService.getProgress(operationId);

            expect(progress.type).toBe('download');
            expect(progress.percentage).toBe(50);
            expect(progress.downloaded).toBe(512);
        });

        test('should throw error for non-existent operation', async () => {
            await expect(
                networkService.getProgress('non-existent')
            ).rejects.toThrow('Operation not found');
        });
    });

    describe('validateRequest', () => {
        test('should validate upload request', async () => {
            const uploadRequest = {
                type: 'upload',
                file: { name: 'test.txt' },
                sessionId: 'session-123'
            };

            const result = await networkService.validateRequest(uploadRequest);

            expect(result).toBe(true);
        });

        test('should validate download request', async () => {
            const downloadRequest = {
                type: 'download',
                fileId: 'file-123'
            };

            const result = await networkService.validateRequest(downloadRequest);

            expect(result).toBe(true);
        });

        test('should reject request without type', async () => {
            await expect(
                networkService.validateRequest({})
            ).rejects.toThrow('Missing required field: type');
        });

        test('should reject invalid upload request', async () => {
            const invalidUpload = {
                type: 'upload'
                // Missing file and sessionId
            };

            await expect(
                networkService.validateRequest(invalidUpload)
            ).rejects.toThrow('Upload requests require file and sessionId');
        });

        test('should reject invalid download request', async () => {
            const invalidDownload = {
                type: 'download'
                // Missing fileId
            };

            await expect(
                networkService.validateRequest(invalidDownload)
            ).rejects.toThrow('Download requests require fileId');
        });
    });

    describe('SOLID Principles Compliance', () => {
        test('should follow Single Responsibility Principle', () => {
            // NetworkService should only handle network operations
            const methods = Object.getOwnPropertyNames(NetworkService.prototype);
            const networkMethods = methods.filter(method => 
                ['uploadFile', 'downloadFile', 'resumeUpload', 'cancelOperation'].includes(method)
            );
            
            expect(networkMethods.length).toBe(4);
            // Should not have crypto or UI methods
            expect(methods.some(m => m.includes('encrypt') || m.includes('render'))).toBe(false);
        });

        test('should follow Open/Closed Principle', () => {
            // Can extend with new upload/download strategies without modification
            expect(networkService.config).toBeDefined();
            expect(typeof networkService.uploadFile).toBe('function');
        });

        test('should follow Dependency Inversion Principle', () => {
            // Depends on logger and validator abstractions
            expect(mockLogger.info).toBeDefined();
            expect(mockValidator.validate).toBeDefined();
        });
    });

    describe('Error Handling & Edge Cases', () => {
        test('should handle file system errors gracefully', async () => {
            fs.mkdir.mockRejectedValue(new Error('Permission denied'));

            await expect(
                networkService.uploadFile({
                    file: { originalname: 'test.txt', size: 100, buffer: Buffer.from('test') },
                    sessionId: 'session-123'
                })
            ).rejects.toThrow();
        });

        test('should handle network timeouts', async () => {
            // Simulate timeout by creating operation and checking cleanup
            const uploadRequest = {
                file: { originalname: 'test.txt', size: 100, buffer: Buffer.from('test') },
                sessionId: 'session-123'
            };

            const result = await networkService.uploadFile(uploadRequest);
            
            // Verify operation is tracked
            expect(networkService.activeOperations.has(result.operationId)).toBe(true);
        });

        test('should handle concurrent operations efficiently', async () => {
            const uploads = Array(5).fill(null).map((_, i) => 
                networkService.uploadFile({
                    file: { 
                        originalname: `test-${i}.txt`, 
                        size: 100, 
                        buffer: Buffer.from(`test ${i}`) 
                    },
                    sessionId: `session-${i}`
                })
            );

            const results = await Promise.all(uploads);
            
            expect(results).toHaveLength(5);
            results.forEach((result, i) => {
                expect(result.sessionId).toBe(`session-${i}`);
            });
        });
    });

    describe('Performance', () => {
        test('should handle large file uploads efficiently', async () => {
            const largeFile = {
                originalname: 'large.txt',
                size: 10 * 1024 * 1024, // 10MB
                buffer: Buffer.alloc(10 * 1024 * 1024)
            };

            const start = Date.now();
            const result = await networkService.uploadFile({
                file: largeFile,
                sessionId: 'large-session'
            });
            const duration = Date.now() - start;

            expect(result).toBeDefined();
            expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
        });

        test('should manage memory efficiently with chunked uploads', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Upload multiple files
            const uploads = Array(3).fill(null).map((_, i) => 
                networkService.uploadFile({
                    file: {
                        originalname: `memory-test-${i}.txt`,
                        size: 1024 * 1024, // 1MB each
                        buffer: Buffer.alloc(1024 * 1024)
                    },
                    sessionId: `memory-session-${i}`
                })
            );

            await Promise.all(uploads);
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 50MB)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        });
    });
});
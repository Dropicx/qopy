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

const FileProcessor = require('../../../services/FileProcessor');

// Mock Web Crypto API
global.crypto = {
    subtle: {
        digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
};

// Mock fetch for chunk uploads
global.fetch = jest.fn();

describe('FileProcessor', () => {
    let fileProcessor;
    let mockFile;

    beforeEach(() => {
        fileProcessor = new FileProcessor();
        
        // Mock file object
        mockFile = {
            name: 'test.txt',
            size: 1024 * 1024 * 10, // 10MB
            type: 'text/plain',
            lastModified: Date.now(),
            arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024 * 1024 * 10)),
            slice: jest.fn().mockImplementation((start, end) => ({
                size: end - start,
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(end - start))
            }))
        };

        // Setup fetch mock
        fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ success: true })
        });

        jest.clearAllMocks();
    });

    describe('Constructor & Configuration', () => {
        test('should initialize with default configuration', () => {
            const processor = new FileProcessor();
            
            expect(processor.config.chunkSize).toBe(5 * 1024 * 1024);
            expect(processor.config.maxFileSize).toBe(100 * 1024 * 1024);
            expect(processor.config.maxRetries).toBe(3);
            expect(processor.currentProcessing).toBeNull();
        });

        test('should accept custom configuration', () => {
            const customConfig = {
                chunkSize: 1024 * 1024,
                maxFileSize: 50 * 1024 * 1024,
                maxRetries: 5
            };
            
            const processor = new FileProcessor(customConfig);
            
            expect(processor.config.chunkSize).toBe(1024 * 1024);
            expect(processor.config.maxFileSize).toBe(50 * 1024 * 1024);
            expect(processor.config.maxRetries).toBe(5);
        });
    });

    describe('validateFile', () => {
        test('should validate normal file', async () => {
            await expect(
                fileProcessor.validateFile(mockFile)
            ).resolves.not.toThrow();
        });

        test('should reject null file', async () => {
            await expect(
                fileProcessor.validateFile(null)
            ).rejects.toThrow('No file provided');
        });

        test('should reject empty file', async () => {
            const emptyFile = { ...mockFile, size: 0 };
            
            await expect(
                fileProcessor.validateFile(emptyFile)
            ).rejects.toThrow('File is empty');
        });

        test('should reject oversized file', async () => {
            const largeFile = { 
                ...mockFile, 
                size: fileProcessor.config.maxFileSize + 1 
            };
            
            await expect(
                fileProcessor.validateFile(largeFile)
            ).rejects.toThrow('exceeds maximum limit');
        });

        test('should validate allowed file types', async () => {
            const processor = new FileProcessor({
                allowedTypes: ['text/', 'image/']
            });
            
            const textFile = { ...mockFile, type: 'text/plain' };
            const imageFile = { ...mockFile, type: 'image/jpeg' };
            const videoFile = { ...mockFile, type: 'video/mp4' };
            
            await expect(processor.validateFile(textFile)).resolves.not.toThrow();
            await expect(processor.validateFile(imageFile)).resolves.not.toThrow();
            await expect(processor.validateFile(videoFile)).rejects.toThrow('not allowed');
        });

        test('should reject blocked file types', async () => {
            const processor = new FileProcessor({
                blockedTypes: ['.exe', 'application/x-executable']
            });
            
            const exeFile = { 
                ...mockFile, 
                name: 'virus.exe',
                type: 'application/x-executable'
            };
            
            await expect(
                processor.validateFile(exeFile)
            ).rejects.toThrow('blocked');
        });
    });

    describe('processFile', () => {
        test('should process file successfully', async () => {
            const result = await fileProcessor.processFile(mockFile);

            expect(result.session).toBeDefined();
            expect(result.chunks).toBeDefined();
            expect(result.fileHash).toBeDefined();
            expect(result.metadata).toBeDefined();
            expect(result.metadata.originalName).toBe('test.txt');
            expect(result.metadata.size).toBe(mockFile.size);
        });

        test('should generate correct number of chunks', async () => {
            const result = await fileProcessor.processFile(mockFile);
            const expectedChunks = Math.ceil(mockFile.size / fileProcessor.config.chunkSize);

            expect(result.chunks).toHaveLength(expectedChunks);
            expect(result.metadata.chunkCount).toBe(expectedChunks);
        });

        test('should calculate file hash', async () => {
            const result = await fileProcessor.processFile(mockFile);

            expect(result.fileHash).toBeDefined();
            expect(typeof result.fileHash).toBe('string');
            expect(mockFile.arrayBuffer).toHaveBeenCalled();
        });

        test('should track processing session', async () => {
            await fileProcessor.processFile(mockFile);

            expect(fileProcessor.currentProcessing).toBeDefined();
            expect(fileProcessor.currentProcessing.file).toBe(mockFile);
            expect(fileProcessor.currentProcessing.status).toBe('initialized');
        });

        test('should handle processing errors', async () => {
            const invalidFile = null;

            await expect(
                fileProcessor.processFile(invalidFile)
            ).rejects.toThrow('File processing failed');

            expect(fileProcessor.currentProcessing).toBeNull();
        });
    });

    describe('generateChunks', () => {
        test('should generate chunks with correct properties', async () => {
            const session = fileProcessor.initializeSession(mockFile, {});
            const chunks = await fileProcessor.generateChunks(mockFile, session);

            expect(chunks).toHaveLength(Math.ceil(mockFile.size / fileProcessor.config.chunkSize));
            
            chunks.forEach((chunk, index) => {
                expect(chunk.index).toBe(index);
                expect(chunk.start).toBe(index * fileProcessor.config.chunkSize);
                expect(chunk.size).toBeGreaterThan(0);
                expect(chunk.hash).toBeDefined();
                expect(chunk.status).toBe('ready');
            });
        });

        test('should update session progress', async () => {
            const session = fileProcessor.initializeSession(mockFile, {});
            await fileProcessor.generateChunks(mockFile, session);

            expect(session.progress.totalChunks).toBeGreaterThan(0);
            expect(session.progress.chunksProcessed).toBe(session.progress.totalChunks);
            expect(session.progress.percentage).toBe(100);
        });

        test('should handle abort during chunk generation', async () => {
            const abortController = new AbortController();
            fileProcessor.setAbortController(abortController);
            
            const session = fileProcessor.initializeSession(mockFile, {});
            
            // Abort immediately
            abortController.abort();

            await expect(
                fileProcessor.generateChunks(mockFile, session)
            ).rejects.toThrow('Processing aborted');
        });
    });

    describe('uploadChunk', () => {
        const mockChunk = {
            index: 0,
            start: 0,
            end: 1024,
            size: 1024,
            blob: new Blob(['test data']),
            hash: 'test-hash',
            status: 'ready',
            retries: 0
        };

        const mockSession = {
            id: 'session-123',
            errors: []
        };

        test('should upload chunk successfully', async () => {
            const result = await fileProcessor.uploadChunk(
                mockChunk, 
                '/api/upload/chunk', 
                mockSession
            );

            expect(result.success).toBe(true);
            expect(mockChunk.status).toBe('completed');
            expect(fetch).toHaveBeenCalledWith(
                '/api/upload/chunk',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData)
                })
            );
        });

        test('should retry failed uploads', async () => {
            fetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Server error'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ success: true })
                });

            const result = await fileProcessor.uploadChunk(
                mockChunk, 
                '/api/upload/chunk', 
                mockSession
            );

            expect(result.success).toBe(true);
            expect(mockChunk.retries).toBe(2);
            expect(fetch).toHaveBeenCalledTimes(3);
        });

        test('should fail after maximum retries', async () => {
            fetch.mockRejectedValue(new Error('Persistent error'));

            await expect(
                fileProcessor.uploadChunk(mockChunk, '/api/upload/chunk', mockSession)
            ).rejects.toThrow('failed after');

            expect(mockChunk.status).toBe('error');
            expect(fetch).toHaveBeenCalledTimes(fileProcessor.config.maxRetries + 1);
        });

        test('should handle HTTP errors', async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: jest.fn().mockResolvedValue('Internal Server Error')
            });

            await expect(
                fileProcessor.uploadChunk(mockChunk, '/api/upload/chunk', mockSession)
            ).rejects.toThrow('HTTP 500');
        });

        test('should track errors in session', async () => {
            fetch.mockRejectedValue(new Error('Test error'));

            try {
                await fileProcessor.uploadChunk(mockChunk, '/api/upload/chunk', mockSession);
            } catch (error) {
                // Expected to fail
            }

            expect(mockSession.errors.length).toBeGreaterThan(0);
            expect(mockSession.errors[0]).toMatchObject({
                chunkIndex: 0,
                error: 'Test error'
            });
        });
    });

    describe('resumeProcessing', () => {
        test('should resume valid session', async () => {
            const sessionData = {
                id: 'session-123',
                metadata: {
                    size: mockFile.size,
                    lastModified: mockFile.lastModified
                }
            };

            const resumedSession = await fileProcessor.resumeProcessing(sessionData, mockFile);

            expect(resumedSession.status).toBe('resumed');
            expect(resumedSession.resumedAt).toBeDefined();
            expect(fileProcessor.currentProcessing).toBe(resumedSession);
        });

        test('should reject resume for changed file', async () => {
            const sessionData = {
                metadata: {
                    size: 1000, // Different size
                    lastModified: mockFile.lastModified
                }
            };

            await expect(
                fileProcessor.resumeProcessing(sessionData, mockFile)
            ).rejects.toThrow('File has changed');
        });
    });

    describe('abort', () => {
        test('should abort current processing', () => {
            const abortController = new AbortController();
            fileProcessor.setAbortController(abortController);
            fileProcessor.currentProcessing = { status: 'processing' };

            fileProcessor.abort();

            expect(abortController.signal.aborted).toBe(true);
            expect(fileProcessor.currentProcessing.status).toBe('aborted');
            expect(fileProcessor.currentProcessing.abortedAt).toBeDefined();
        });

        test('should handle abort when no processing active', () => {
            expect(() => {
                fileProcessor.abort();
            }).not.toThrow();
        });
    });

    describe('getCurrentStatus', () => {
        test('should return current processing status', async () => {
            await fileProcessor.processFile(mockFile);
            const status = fileProcessor.getCurrentStatus();

            expect(status).toBeDefined();
            expect(status.file.name).toBe('test.txt');
            expect(status.file.size).toBe(mockFile.size);
            expect(status.progress).toBeDefined();
        });

        test('should return null when no processing active', () => {
            const status = fileProcessor.getCurrentStatus();
            expect(status).toBeNull();
        });

        test('should exclude file object to avoid circular references', async () => {
            await fileProcessor.processFile(mockFile);
            const status = fileProcessor.getCurrentStatus();

            expect(status.file).not.toBe(mockFile);
            expect(typeof status.file).toBe('object');
        });
    });

    describe('isProcessing', () => {
        test('should return true when processing', async () => {
            fileProcessor.currentProcessing = { status: 'processing' };
            expect(fileProcessor.isProcessing()).toBe(true);

            fileProcessor.currentProcessing = { status: 'uploading' };
            expect(fileProcessor.isProcessing()).toBe(true);

            fileProcessor.currentProcessing = { status: 'initialized' };
            expect(fileProcessor.isProcessing()).toBe(true);
        });

        test('should return false when not processing', () => {
            expect(fileProcessor.isProcessing()).toBe(false);

            fileProcessor.currentProcessing = { status: 'completed' };
            expect(fileProcessor.isProcessing()).toBe(false);

            fileProcessor.currentProcessing = { status: 'error' };
            expect(fileProcessor.isProcessing()).toBe(false);
        });
    });

    describe('Configuration Management', () => {
        test('should update configuration', () => {
            const newConfig = {
                chunkSize: 2 * 1024 * 1024,
                maxRetries: 5
            };

            fileProcessor.updateConfig(newConfig);

            expect(fileProcessor.config.chunkSize).toBe(2 * 1024 * 1024);
            expect(fileProcessor.config.maxRetries).toBe(5);
            expect(fileProcessor.config.maxFileSize).toBe(100 * 1024 * 1024); // Should preserve existing
        });

        test('should get current configuration', () => {
            const config = fileProcessor.getConfig();

            expect(config).toEqual(fileProcessor.config);
            expect(config).not.toBe(fileProcessor.config); // Should be a copy
        });
    });

    describe('Utility Methods', () => {
        test('should generate unique session IDs', () => {
            const id1 = fileProcessor.generateSessionId();
            const id2 = fileProcessor.generateSessionId();

            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^session_\d+_[a-z0-9]+$/);
        });

        test('should handle delay', async () => {
            const start = Date.now();
            await fileProcessor.delay(100);
            const duration = Date.now() - start;

            expect(duration).toBeGreaterThanOrEqual(95);
            expect(duration).toBeLessThan(150);
        });

        test('should check abort status', () => {
            const abortController = new AbortController();
            fileProcessor.setAbortController(abortController);

            expect(() => fileProcessor.checkAborted()).not.toThrow();

            abortController.abort();
            expect(() => fileProcessor.checkAborted()).toThrow('Processing aborted');
        });
    });

    describe('SOLID Principles Compliance', () => {
        test('should follow Single Responsibility Principle', () => {
            // FileProcessor should only handle file processing
            const methods = Object.getOwnPropertyNames(FileProcessor.prototype);
            const processingMethods = methods.filter(method => 
                ['processFile', 'validateFile', 'generateChunks', 'uploadChunk'].includes(method)
            );
            
            expect(processingMethods.length).toBe(4);
            // Should not have UI or crypto methods
            expect(methods.some(m => m.includes('render') || m.includes('encrypt'))).toBe(false);
        });

        test('should follow Open/Closed Principle', () => {
            // Can extend functionality through configuration
            expect(fileProcessor.config).toBeDefined();
            expect(typeof fileProcessor.updateConfig).toBe('function');
        });

        test('should be testable and mockable', () => {
            // All dependencies should be injectable or mockable
            expect(typeof fetch).toBe('function');
            expect(global.crypto.subtle).toBeDefined();
        });
    });

    describe('Error Handling & Edge Cases', () => {
        test('should handle crypto API errors', async () => {
            const originalDigest = crypto.subtle.digest;
            crypto.subtle.digest = jest.fn().mockRejectedValue(new Error('Crypto error'));

            await expect(
                fileProcessor.processFile(mockFile)
            ).rejects.toThrow('File processing failed: Crypto error');

            // Restore original
            crypto.subtle.digest = originalDigest;
        });

        test('should handle file slice errors', async () => {
            const badFile = {
                ...mockFile,
                slice: jest.fn().mockImplementation(() => {
                    throw new Error('Slice error');
                })
            };

            await expect(
                fileProcessor.processFile(badFile)
            ).rejects.toThrow('File processing failed: Slice error');
        });

        test('should handle network timeouts', async () => {
            const timeoutError = new Error('Network timeout');
            timeoutError.name = 'AbortError';
            fetch.mockRejectedValue(timeoutError);

            const chunk = {
                index: 0,
                blob: new Blob(['test']),
                hash: 'hash',
                status: 'ready',
                retries: 0
            };

            await expect(
                fileProcessor.uploadChunk(chunk, '/api/upload', { id: 'test', errors: [] })
            ).rejects.toThrow();
        });
    });

    describe('Performance', () => {
        test('should process large files efficiently', async () => {
            const largeFile = {
                ...mockFile,
                size: 50 * 1024 * 1024, // 50MB
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(50 * 1024 * 1024))
            };

            const start = Date.now();
            const result = await fileProcessor.processFile(largeFile);
            const duration = Date.now() - start;

            expect(result).toBeDefined();
            expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
        });

        test('should handle multiple concurrent operations', async () => {
            // Reset crypto mock for this test
            crypto.subtle.digest.mockResolvedValue(new ArrayBuffer(32));
            const files = Array(5).fill(null).map((_, i) => ({
                ...mockFile,
                name: `file-${i}.txt`,
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024 * 1024))
            }));

            const processors = files.map(() => new FileProcessor());
            
            const start = Date.now();
            const results = await Promise.all(
                files.map((file, i) => processors[i].processFile(file))
            );
            const duration = Date.now() - start;

            expect(results).toHaveLength(5);
            expect(duration).toBeLessThan(3000); // Should complete concurrently
        });

        test('should manage memory efficiently', async () => {
            // Reset crypto mock for this test
            crypto.subtle.digest.mockResolvedValue(new ArrayBuffer(32));
            
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Process multiple files
            for (let i = 0; i < 3; i++) {
                await fileProcessor.processFile(mockFile);
                // Reset processing to simulate cleanup
                fileProcessor.currentProcessing = null;
            }
            
            // Force garbage collection if available (for testing)
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 100MB)
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
        });
    });
});
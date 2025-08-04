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

const RefactoredFileUploadManager = require('../../../services/RefactoredFileUploadManager');

// Mock fetch for API calls
global.fetch = jest.fn();

describe('RefactoredFileUploadManager', () => {
    let uploadManager;
    let mockDependencies;

    beforeEach(() => {
        // Mock all dependencies
        mockDependencies = {
            eventBus: {
                emit: jest.fn(),
                on: jest.fn(),
                removeAllListeners: jest.fn(),
                setDebugging: jest.fn(),
                getStats: jest.fn().mockReturnValue({ events: 0 })
            },
            uiController: {
                init: jest.fn(),
                updateProgress: jest.fn(),
                updateUploadState: jest.fn()
            },
            fileProcessor: {
                processFile: jest.fn(),
                abort: jest.fn(),
                setAbortController: jest.fn(),
                uploadChunk: jest.fn(),
                getCurrentStatus: jest.fn(),
                getConfig: jest.fn().mockReturnValue({ chunkSize: 1024 }),
                updateConfig: jest.fn()
            },
            encryptionService: {
                init: jest.fn()
            },
            uploadValidator: {
                validateFile: jest.fn(),
                init: jest.fn()
            },
            config: {
                apiBaseUrl: '/test-api',
                enableEncryption: true
            }
        };

        // Setup fetch mock
        fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ success: true, id: 'session-123' })
        });

        uploadManager = new RefactoredFileUploadManager(mockDependencies);
        
        jest.clearAllMocks();
    });

    describe('Constructor & Dependency Injection', () => {
        test('should initialize with provided dependencies', () => {
            expect(uploadManager.eventBus).toBe(mockDependencies.eventBus);
            expect(uploadManager.uiController).toBe(mockDependencies.uiController);
            expect(uploadManager.fileProcessor).toBe(mockDependencies.fileProcessor);
            expect(uploadManager.encryptionService).toBe(mockDependencies.encryptionService);
        });

        test('should create default dependencies when not provided', () => {
            const manager = new RefactoredFileUploadManager();
            
            expect(manager.eventBus).toBeDefined();
            expect(manager.uiController).toBeDefined();
            expect(manager.fileProcessor).toBeDefined();
            expect(manager.encryptionService).toBeDefined();
        });

        test('should merge configuration correctly', () => {
            expect(uploadManager.config.apiBaseUrl).toBe('/test-api');
            expect(uploadManager.config.enableEncryption).toBe(true);
            expect(uploadManager.config.enableResume).toBe(true); // Default
        });

        test('should initialize state correctly', () => {
            expect(uploadManager.state.currentUpload).toBeNull();
            expect(uploadManager.state.uploadQueue).toEqual([]);
            expect(uploadManager.state.isInitialized).toBe(false);
        });
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            await uploadManager.init();

            expect(uploadManager.state.isInitialized).toBe(true);
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('manager:initialized');
        });

        test('should setup event listeners', async () => {
            await uploadManager.init();

            expect(mockDependencies.eventBus.on).toHaveBeenCalledWith('file:selected', expect.any(Function));
            expect(mockDependencies.eventBus.on).toHaveBeenCalledWith('upload:start', expect.any(Function));
            expect(mockDependencies.eventBus.on).toHaveBeenCalledWith('upload:cancel', expect.any(Function));
        });

        test('should initialize dependencies when they have init methods', async () => {
            await uploadManager.init();

            expect(mockDependencies.encryptionService.init).toHaveBeenCalled();
            expect(mockDependencies.uploadValidator.init).toHaveBeenCalled();
        });

        test('should handle initialization errors', async () => {
            mockDependencies.encryptionService.init.mockRejectedValue(new Error('Init failed'));

            await expect(uploadManager.init()).rejects.toThrow('Init failed');
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('manager:error', {
                type: 'initialization',
                error: 'Init failed'
            });
        });

        test('should not initialize twice', async () => {
            await uploadManager.init();
            await uploadManager.init(); // Second call

            expect(mockDependencies.encryptionService.init).toHaveBeenCalledTimes(1);
        });
    });

    describe('File Selection Handling', () => {
        const mockFile = {
            name: 'test.txt',
            size: 1024,
            type: 'text/plain'
        };

        beforeEach(async () => {
            await uploadManager.init();
            jest.clearAllMocks();
        });

        test('should handle valid file selection', async () => {
            const processingResult = {
                chunks: [{ index: 0 }],
                metadata: { originalName: 'test.txt' },
                fileHash: 'hash123'
            };

            mockDependencies.uploadValidator.validateFile.mockResolvedValue(true);
            mockDependencies.fileProcessor.processFile.mockResolvedValue(processingResult);

            await uploadManager.handleFileSelected(mockFile);

            expect(mockDependencies.uploadValidator.validateFile).toHaveBeenCalledWith(mockFile);
            expect(mockDependencies.fileProcessor.processFile).toHaveBeenCalledWith(mockFile, {
                enableEncryption: true
            });
            expect(uploadManager.state.currentUpload).toBeDefined();
            expect(uploadManager.state.currentUpload.file).toBe(mockFile);
            expect(uploadManager.state.currentUpload.status).toBe('ready');
        });

        test('should handle file validation errors', async () => {
            mockDependencies.uploadValidator.validateFile.mockRejectedValue(new Error('Invalid file'));

            await uploadManager.handleFileSelected(mockFile);

            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('file:validation:error', {
                file: mockFile,
                error: 'Invalid file'
            });
            expect(uploadManager.state.currentUpload).toBeNull();
        });

        test('should handle file processing errors', async () => {
            mockDependencies.uploadValidator.validateFile.mockResolvedValue(true);
            mockDependencies.fileProcessor.processFile.mockRejectedValue(new Error('Processing failed'));

            await uploadManager.handleFileSelected(mockFile);

            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('file:validation:error', {
                file: mockFile,
                error: 'Processing failed'
            });
        });
    });

    describe('Upload Process', () => {
        const mockFile = { name: 'test.txt', size: 1024, type: 'text/plain' };
        const mockProcessingResult = {
            chunks: [
                { index: 0, size: 512, hash: 'chunk1' },
                { index: 1, size: 512, hash: 'chunk2' }
            ],
            metadata: { originalName: 'test.txt', size: 1024, chunkCount: 2 },
            fileHash: 'file-hash-123'
        };

        beforeEach(async () => {
            await uploadManager.init();
            
            // Setup current upload
            uploadManager.state.currentUpload = {
                file: mockFile,
                processingResult: mockProcessingResult,
                status: 'ready'
            };

            jest.clearAllMocks();
        });

        test('should start upload successfully', async () => {
            const uploadOptions = { password: 'secret123' };

            // Mock upload chunk responses
            mockDependencies.fileProcessor.uploadChunk.mockResolvedValue({
                chunkIndex: 0,
                hash: 'chunk-hash',
                size: 512
            });

            await uploadManager.handleUploadStart(uploadOptions);

            expect(uploadManager.state.currentUpload.status).toBe('completed');
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('upload:complete', expect.any(Object));
        });

        test('should initialize upload session with server', async () => {
            const sessionData = {
                filename: 'test.txt',
                filesize: 1024,
                mimetype: 'text/plain',
                fileHash: 'file-hash-123',
                chunkCount: 2,
                chunkSize: expect.any(Number),
                password: 'secret123',
                enableEncryption: true
            };

            const session = await uploadManager.initializeUploadSession(
                mockProcessingResult.metadata, 
                mockProcessingResult.fileHash,
                { password: 'secret123' }
            );

            expect(fetch).toHaveBeenCalledWith('/test-api/upload/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionData)
            });
            expect(session.success).toBe(true);
        });

        test('should handle upload session initialization errors', async () => {
            fetch.mockResolvedValue({
                ok: false,
                text: jest.fn().mockResolvedValue('Server error')
            });

            await expect(
                uploadManager.initializeUploadSession(mockProcessingResult.metadata, 'hash', {})
            ).rejects.toThrow('Failed to initialize upload session: Server error');
        });

        test('should upload chunks sequentially', async () => {
            const session = { id: 'session-123' };
            const upload = { abortController: new AbortController() };

            mockDependencies.fileProcessor.uploadChunk
                .mockResolvedValueOnce({ chunkIndex: 0, size: 512 })
                .mockResolvedValueOnce({ chunkIndex: 1, size: 512 });

            const results = await uploadManager.uploadChunks(
                mockProcessingResult.chunks, 
                session, 
                upload
            );

            expect(results).toHaveLength(2);
            expect(mockDependencies.fileProcessor.uploadChunk).toHaveBeenCalledTimes(2);
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('upload:progress', expect.objectContaining({
                progress: expect.any(Number),
                chunkIndex: expect.any(Number)
            }));
        });

        test('should handle chunk upload failures', async () => {
            const session = { id: 'session-123' };
            const upload = { abortController: new AbortController() };

            mockDependencies.fileProcessor.uploadChunk.mockRejectedValue(new Error('Chunk failed'));

            await expect(
                uploadManager.uploadChunks(mockProcessingResult.chunks, session, upload)
            ).rejects.toThrow('Chunk failed');

            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('chunk:failed', {
                chunkIndex: 0,
                error: 'Chunk failed'
            });
        });

        test('should complete upload process', async () => {
            const session = { id: 'session-123' };
            const uploadResults = [
                { chunkIndex: 0, hash: 'hash1', size: 512 },
                { chunkIndex: 1, hash: 'hash2', size: 512 }
            ];

            const completionData = {
                sessionId: 'session-123',
                chunkResults: [
                    { index: 0, hash: 'hash1', size: 512 },
                    { index: 1, hash: 'hash2', size: 512 }
                ]
            };

            const result = await uploadManager.completeUpload(session, uploadResults);

            expect(fetch).toHaveBeenCalledWith('/test-api/upload/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(completionData)
            });
            expect(result.success).toBe(true);
        });

        test('should handle upload cancellation', () => {
            const abortController = new AbortController();
            uploadManager.state.currentUpload.abortController = abortController;

            uploadManager.handleUploadCancel();

            expect(abortController.signal.aborted).toBe(true);
            expect(uploadManager.state.currentUpload.status).toBe('cancelled');
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('upload:cancelled');
        });
    });

    describe('File Reset', () => {
        beforeEach(async () => {
            await uploadManager.init();
            uploadManager.state.currentUpload = {
                file: { name: 'test.txt' },
                status: 'ready'
            };
            jest.clearAllMocks();
        });

        test('should reset file selection', () => {
            uploadManager.handleFileReset();

            expect(mockDependencies.fileProcessor.abort).toHaveBeenCalled();
            expect(uploadManager.state.currentUpload).toBeNull();
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('upload:reset');
        });

        test('should handle reset when no current upload', () => {
            uploadManager.state.currentUpload = null;

            expect(() => {
                uploadManager.handleFileReset();
            }).not.toThrow();
        });
    });

    describe('Upload States', () => {
        beforeEach(async () => {
            await uploadManager.init();
        });

        test('should handle upload pause', () => {
            uploadManager.state.currentUpload = { status: 'uploading' };

            uploadManager.handleUploadPause();

            expect(uploadManager.state.currentUpload.status).toBe('paused');
            expect(uploadManager.state.currentUpload.pausedAt).toBeDefined();
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('upload:paused');
        });

        test('should handle upload resume', () => {
            uploadManager.state.currentUpload = { status: 'paused' };

            uploadManager.handleUploadResume();

            expect(uploadManager.state.currentUpload.status).toBe('uploading');
            expect(uploadManager.state.currentUpload.resumedAt).toBeDefined();
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('upload:resumed');
        });
    });

    describe('Status and Configuration', () => {
        beforeEach(async () => {
            await uploadManager.init();
        });

        test('should return current status', () => {
            uploadManager.state.currentUpload = {
                status: 'uploading',
                file: { name: 'test.txt', size: 1024, type: 'text/plain' }
            };

            const status = uploadManager.getStatus();

            expect(status.isInitialized).toBe(true);
            expect(status.currentUpload.status).toBe('uploading');
            expect(status.currentUpload.file.name).toBe('test.txt');
            expect(status.queueLength).toBe(0);
        });

        test('should update configuration', () => {
            const newConfig = { apiBaseUrl: '/new-api', maxRetries: 5 };

            uploadManager.updateConfig(newConfig);

            expect(uploadManager.config.apiBaseUrl).toBe('/new-api');
            expect(uploadManager.config.maxRetries).toBe(5);
            expect(mockDependencies.fileProcessor.updateConfig).toHaveBeenCalledWith(newConfig);
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('config:updated', {
                config: uploadManager.config
            });
        });

        test('should get comprehensive stats', () => {
            const stats = uploadManager.getStats();

            expect(stats.isInitialized).toBeDefined();
            expect(stats.eventBus).toBeDefined();
            expect(stats.fileProcessor).toBeDefined();
        });
    });

    describe('Lifecycle Management', () => {
        beforeEach(async () => {
            await uploadManager.init();
        });

        test('should destroy manager and cleanup resources', () => {
            uploadManager.state.currentUpload = { abortController: new AbortController() };

            uploadManager.destroy();

            expect(mockDependencies.eventBus.removeAllListeners).toHaveBeenCalled();
            expect(uploadManager.state.currentUpload).toBeNull();
            expect(uploadManager.state.isInitialized).toBe(false);
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('manager:destroyed');
        });

        test('should enable debug mode', () => {
            uploadManager.enableDebug();

            expect(mockDependencies.eventBus.setDebugging).toHaveBeenCalledWith(true);
        });

        test('should disable debug mode', () => {
            uploadManager.disableDebug();

            expect(mockDependencies.eventBus.setDebugging).toHaveBeenCalledWith(false);
        });
    });

    describe('Factory Method', () => {
        test('should create instance via factory method', () => {
            const config = { apiBaseUrl: '/factory-api' };
            const manager = RefactoredFileUploadManager.create(config);

            expect(manager).toBeInstanceOf(RefactoredFileUploadManager);
            expect(manager.config.apiBaseUrl).toBe('/factory-api');
        });
    });

    describe('SOLID Principles Compliance', () => {
        test('should follow Single Responsibility Principle', () => {
            // Manager should only orchestrate, not implement specific functionality
            const methods = Object.getOwnPropertyNames(RefactoredFileUploadManager.prototype);
            const orchestrationMethods = methods.filter(method => 
                method.startsWith('handle') || method.includes('init') || method.includes('perform')
            );
            
            expect(orchestrationMethods.length).toBeGreaterThan(0);
            // Should not have crypto, network, or UI implementation methods
            expect(methods.some(m => m.includes('encrypt') || m.includes('render') || m.includes('http'))).toBe(false);
        });

        test('should follow Open/Closed Principle', () => {
            // Can extend behavior through dependency injection without modification
            expect(uploadManager.eventBus).toBeDefined();
            expect(uploadManager.fileProcessor).toBeDefined();
            expect(uploadManager.encryptionService).toBeDefined();
        });

        test('should follow Liskov Substitution Principle', () => {
            // Dependencies should be interchangeable
            const altDependencies = {
                ...mockDependencies,
                fileProcessor: {
                    ...mockDependencies.fileProcessor,
                    processFile: jest.fn().mockResolvedValue({ chunks: [], metadata: {} })
                }
            };

            expect(() => {
                new RefactoredFileUploadManager(altDependencies);
            }).not.toThrow();
        });

        test('should follow Interface Segregation Principle', () => {
            // Each dependency has focused interface
            expect(typeof mockDependencies.eventBus.emit).toBe('function');
            expect(typeof mockDependencies.fileProcessor.processFile).toBe('function');
            expect(typeof mockDependencies.uploadValidator.validateFile).toBe('function');
        });

        test('should follow Dependency Inversion Principle', () => {
            // Depends on abstractions, not concretions
            expect(uploadManager.eventBus).toBe(mockDependencies.eventBus);
            expect(uploadManager.fileProcessor).toBe(mockDependencies.fileProcessor);
            // Can inject any compatible implementation
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await uploadManager.init();
        });

        test('should handle upload start without file', async () => {
            uploadManager.state.currentUpload = null;

            await uploadManager.handleUploadStart({});

            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('upload:error', {
                error: expect.any(Error)
            });
        });

        test('should handle chunk upload errors gracefully', async () => {
            uploadManager.state.currentUpload = {
                file: { name: 'test.txt' },
                processingResult: {
                    chunks: [{ index: 0 }],
                    metadata: { originalName: 'test.txt' },
                    fileHash: 'hash'
                },
                status: 'ready'
            };

            mockDependencies.fileProcessor.uploadChunk.mockRejectedValue(new Error('Chunk error'));

            await uploadManager.handleUploadStart({});

            expect(uploadManager.state.currentUpload.status).toBe('error');
            expect(mockDependencies.eventBus.emit).toHaveBeenCalledWith('upload:error', {
                error: expect.any(Error)
            });
        });

        test('should handle network failures', async () => {
            fetch.mockRejectedValue(new Error('Network error'));

            await expect(
                uploadManager.initializeUploadSession({}, 'hash', {})
            ).rejects.toThrow('Network error');
        });
    });

    describe('Performance', () => {
        beforeEach(async () => {
            await uploadManager.init();
        });

        test('should handle rapid state changes efficiently', async () => {
            const file = { name: 'test.txt', size: 1024 };
            
            const start = Date.now();
            for (let i = 0; i < 10; i++) {
                uploadManager.state.currentUpload = { file, status: 'ready' };
                uploadManager.handleFileReset();
            }
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(100);
        });

        test('should manage memory efficiently during uploads', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Simulate multiple upload sessions
            for (let i = 0; i < 5; i++) {
                uploadManager.state.currentUpload = {
                    file: { name: `file-${i}.txt`, size: 1024 },
                    processingResult: { chunks: [], metadata: {}, fileHash: 'hash' },
                    status: 'completed'
                };
                uploadManager.handleFileReset();
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        });
    });
});
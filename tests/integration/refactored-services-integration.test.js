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

const RefactoredFileUploadManager = require('../../services/RefactoredFileUploadManager');
const CryptoService = require('../../services/core/CryptoService');
const NetworkService = require('../../services/core/NetworkService');
const UIController = require('../../services/UIController');
const FileProcessor = require('../../services/FileProcessor');
const EventBus = require('../../services/EventBus');

// Mock DOM for UIController
global.document = {
    getElementById: jest.fn().mockReturnValue({
        addEventListener: jest.fn(),
        style: { display: 'block' },
        value: '',
        checked: false,
        textContent: '',
        innerHTML: '',
        classList: { add: jest.fn(), remove: jest.fn() }
    }),
    body: { addEventListener: jest.fn() }
};

// Mock Web APIs
global.crypto = {
    subtle: {
        digest: jest.fn().mockResolvedValue(new ArrayBuffer(32))
    }
};

global.fetch = jest.fn();

describe('Refactored Services Integration Tests', () => {
    let uploadManager;
    let eventBus;
    let cryptoService;
    let networkService;
    let fileProcessor;
    let uiController;

    beforeEach(() => {
        // Create real instances for integration testing
        eventBus = new EventBus();
        
        // Mock logger and validator for services that need them
        const mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            log: jest.fn() // Add log method for BaseService
        };
        
        const mockValidator = {
            validate: jest.fn().mockResolvedValue(true)
        };

        cryptoService = new CryptoService(mockLogger, mockValidator);
        networkService = new NetworkService(mockLogger, mockValidator);
        fileProcessor = new FileProcessor();
        uiController = new UIController(eventBus);

        // Create upload manager with real dependencies
        uploadManager = new RefactoredFileUploadManager({
            eventBus,
            uiController,
            fileProcessor,
            encryptionService: cryptoService,
            uploadValidator: {
                validateFile: jest.fn().mockResolvedValue(true),
                init: jest.fn()
            },
            config: {
                apiBaseUrl: '/api'
            }
        });

        // Setup fetch mock
        fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ 
                success: true, 
                id: 'session-123',
                shareUrl: 'https://example.com/share/123'
            }),
            text: jest.fn().mockResolvedValue('OK')
        });

        jest.clearAllMocks();
    });

    describe('Complete Upload Workflow Integration', () => {
        const mockFile = {
            name: 'integration-test.txt',
            size: 1024 * 1024 * 2, // 2MB
            type: 'text/plain',
            lastModified: Date.now(),
            arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024 * 1024 * 2)),
            slice: jest.fn().mockImplementation((start, end) => ({
                size: end - start,
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(end - start))
            }))
        };

        test('should complete full upload workflow', async () => {
            await uploadManager.init();

            // Simulate file selection through event bus
            eventBus.emit('file:selected', { file: mockFile });
            
            // Wait for file processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(uploadManager.state.currentUpload).toBeDefined();
            expect(uploadManager.state.currentUpload.status).toBe('ready');

            // Start upload
            eventBus.emit('upload:start', { password: 'test123' });
            
            // Wait for upload completion
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify API calls were made
            expect(fetch).toHaveBeenCalledWith('/api/upload/init', expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }));
        });

        test('should handle file validation errors in workflow', async () => {
            await uploadManager.init();

            // Mock validation failure
            uploadManager.uploadValidator.validateFile.mockRejectedValue(new Error('File too large'));

            const errorHandler = jest.fn();
            eventBus.on('file:validation:error', errorHandler);

            eventBus.emit('file:selected', { file: mockFile });
            
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(errorHandler).toHaveBeenCalledWith({
                file: mockFile,
                error: 'File too large'
            });
            expect(uploadManager.state.currentUpload).toBeNull();
        });

        test('should handle upload cancellation workflow', async () => {
            await uploadManager.init();

            // Setup current upload
            uploadManager.state.currentUpload = {
                file: mockFile,
                status: 'uploading',
                abortController: new AbortController()
            };

            const cancelHandler = jest.fn();
            eventBus.on('upload:cancelled', cancelHandler);

            eventBus.emit('upload:cancel');

            expect(cancelHandler).toHaveBeenCalled();
            expect(uploadManager.state.currentUpload.status).toBe('cancelled');
        });
    });

    describe('Service Coordination', () => {
        test('should coordinate between FileProcessor and CryptoService', async () => {
            const testFile = {
                name: 'crypto-test.txt',
                size: 1024,
                type: 'text/plain',
                lastModified: Date.now(),
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024)),
                slice: jest.fn().mockImplementation((start, end) => ({
                    size: end - start,
                    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(end - start))
                }))
            };

            // Process file
            const processingResult = await fileProcessor.processFile(testFile);
            
            // Use crypto service for encryption setup
            const session = { upload_id: 'test', quick_share: false };
            const requestData = { requiresAccessCode: true, clientAccessCodeHash: 'hash123' };
            
            const cryptoConfig = await cryptoService.processAccessCode(session, requestData);

            expect(processingResult.fileHash).toBeDefined();
            expect(cryptoConfig.strategy).toBe('PasswordProtectedStrategy');
            expect(cryptoConfig.shouldRequireAccessCode).toBe(true);
        });

        test('should coordinate between UIController and EventBus', async () => {
            const progressHandler = jest.fn();
            const stateHandler = jest.fn();

            eventBus.on('upload:progress', progressHandler);
            eventBus.on('ui:state:changed', stateHandler);

            // Simulate UI interactions
            uiController.updateProgress(50, 'Uploading...');
            uiController.updateUploadState('uploading');

            expect(progressHandler).toHaveBeenCalledWith({
                progress: 50,
                message: 'Uploading...'
            });

            expect(stateHandler).toHaveBeenCalledWith({
                newState: 'uploading',
                previousState: 'idle',
                progress: 50
            });
        });

        test('should coordinate NetworkService with upload workflow', async () => {
            const uploadRequest = {
                file: {
                    originalname: 'network-test.txt',
                    size: 2048,
                    mimetype: 'text/plain',
                    buffer: Buffer.from('test content')
                },
                sessionId: 'network-session-123'
            };

            const progressCallback = jest.fn();
            
            const result = await networkService.uploadFile(uploadRequest, progressCallback);

            expect(result.operationId).toBeDefined();
            expect(result.sessionId).toBe('network-session-123');
            expect(progressCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    operationId: expect.any(String),
                    uploaded: expect.any(Number),
                    total: 2048,
                    percentage: 100
                })
            );
        });
    });

    describe('Event-Driven Architecture', () => {
        test('should handle event propagation across services', async () => {
            await uploadManager.init();

            const events = [];
            const eventTypes = [
                'file:selected',
                'file:validated',
                'upload:start',
                'upload:progress',
                'upload:complete',
                'ui:state:changed'
            ];

            // Setup event listeners
            eventTypes.forEach(eventType => {
                eventBus.on(eventType, (data) => {
                    events.push({ type: eventType, data });
                });
            });

            // Trigger file selection
            const testFile = {
                name: 'event-test.txt',
                size: 1024,
                type: 'text/plain',
                lastModified: Date.now(),
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024)),
                slice: jest.fn().mockReturnValue({
                    size: 1024,
                    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
                })
            };

            eventBus.emit('file:selected', { file: testFile });
            
            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify events were triggered in sequence
            expect(events.some(e => e.type === 'file:selected')).toBe(true);
            expect(events.some(e => e.type === 'file:validated')).toBe(true);
        });

        test('should handle error propagation through event system', async () => {
            await uploadManager.init();

            const errorEvents = [];
            eventBus.on('file:validation:error', (error) => {
                errorEvents.push(error);
            });

            // Mock validation failure
            uploadManager.uploadValidator.validateFile.mockRejectedValue(new Error('Validation failed'));

            eventBus.emit('file:selected', { file: { name: 'test.txt' } });
            
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(errorEvents.length).toBeGreaterThan(0);
            expect(errorEvents[0].error).toBe('Validation failed');
        });
    });

    describe('SOLID Principles Integration', () => {
        test('should demonstrate Single Responsibility separation', () => {
            // Each service has distinct responsibilities
            expect(typeof cryptoService.processAccessCode).toBe('function');
            expect(typeof cryptoService.encrypt).toBe('function');
            expect(typeof networkService.uploadFile).toBe('function');
            expect(typeof fileProcessor.processFile).toBe('function');
            expect(typeof uiController.updateProgress).toBe('function');

            // Services don't have overlapping responsibilities
            expect(cryptoService.uploadFile).toBeUndefined();
            expect(networkService.processAccessCode).toBeUndefined();
            expect(fileProcessor.updateProgress).toBeUndefined();
        });

        test('should demonstrate Dependency Inversion through injection', () => {
            // Upload manager accepts injected dependencies
            const customEventBus = new EventBus();
            const customFileProcessor = new FileProcessor({ chunkSize: 2048 });

            const customManager = new RefactoredFileUploadManager({
                eventBus: customEventBus,
                fileProcessor: customFileProcessor
            });

            expect(customManager.eventBus).toBe(customEventBus);
            expect(customManager.fileProcessor).toBe(customFileProcessor);
            expect(customManager.fileProcessor.config.chunkSize).toBe(2048);
        });

        test('should demonstrate Open/Closed through extensibility', () => {
            // Can extend crypto service with new strategies
            expect(cryptoService.strategies.size).toBe(4);
            expect(cryptoService.strategies.has('zero-knowledge')).toBe(true);
            
            // Can configure file processor behavior
            const customProcessor = new FileProcessor({
                chunkSize: 1024,
                maxRetries: 5
            });
            
            expect(customProcessor.config.chunkSize).toBe(1024);
            expect(customProcessor.config.maxRetries).toBe(5);
        });
    });

    describe('Error Handling Integration', () => {
        test('should handle cascading errors gracefully', async () => {
            await uploadManager.init();

            // Mock file processing error
            fileProcessor.processFile = jest.fn().mockRejectedValue(new Error('Processing failed'));

            const errorHandler = jest.fn();
            eventBus.on('file:validation:error', errorHandler);

            eventBus.emit('file:selected', { file: { name: 'error-test.txt' } });
            
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(errorHandler).toHaveBeenCalledWith({
                file: { name: 'error-test.txt' },
                error: 'Processing failed'
            });
        });

        test('should handle network errors in upload workflow', async () => {
            await uploadManager.init();

            // Setup upload
            uploadManager.state.currentUpload = {
                file: { name: 'network-error-test.txt' },
                processingResult: {
                    chunks: [{ index: 0, size: 1024 }],
                    metadata: { originalName: 'test.txt' },
                    fileHash: 'hash123'
                },
                status: 'ready'
            };

            // Mock network failure
            fetch.mockRejectedValue(new Error('Network error'));

            const errorHandler = jest.fn();
            eventBus.on('upload:error', errorHandler);

            eventBus.emit('upload:start', {});
            
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(errorHandler).toHaveBeenCalledWith({
                error: expect.any(Error)
            });
        });
    });

    describe('Performance Integration', () => {
        test('should handle concurrent operations efficiently', async () => {
            const operations = [];
            const testFiles = Array(5).fill(null).map((_, i) => ({
                name: `concurrent-${i}.txt`,
                size: 1024,
                type: 'text/plain',
                lastModified: Date.now(),
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024)),
                slice: jest.fn().mockReturnValue({
                    size: 1024,
                    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
                })
            }));

            const start = Date.now();

            // Process multiple files concurrently
            for (const file of testFiles) {
                operations.push(fileProcessor.processFile(file));
            }

            const results = await Promise.all(operations);
            const duration = Date.now() - start;

            expect(results).toHaveLength(5);
            expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
            
            results.forEach((result, i) => {
                expect(result.metadata.originalName).toBe(`concurrent-${i}.txt`);
            });
        });

        test('should manage memory efficiently during integration', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            await uploadManager.init();

            // Simulate multiple upload cycles
            for (let i = 0; i < 3; i++) {
                const testFile = {
                    name: `memory-test-${i}.txt`,
                    size: 1024 * 1024, // 1MB
                    type: 'text/plain',
                    lastModified: Date.now(),
                    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024 * 1024)),
                    slice: jest.fn().mockReturnValue({
                        size: 1024 * 1024,
                        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024 * 1024))
                    })
                };

                await fileProcessor.processFile(testFile);
                
                // Simulate cleanup
                fileProcessor.currentProcessing = null;
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 100MB)
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
        });
    });

    describe('Data Flow Integration', () => {
        test('should maintain data integrity across services', async () => {
            const testFile = {
                name: 'data-flow-test.txt',
                size: 2048,
                type: 'text/plain',
                lastModified: 1640995200000, // Fixed timestamp
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(2048)),
                slice: jest.fn().mockImplementation((start, end) => ({
                    size: end - start,
                    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(end - start))
                }))
            };

            // Process through file processor
            const processingResult = await fileProcessor.processFile(testFile);
            
            // Create file metadata through crypto service
            const metadata = await cryptoService.createFileMetadata(
                'upload-123',
                { filesize: testFile.size },
                testFile.size
            );

            // Verify data consistency
            expect(processingResult.metadata.originalName).toBe('data-flow-test.txt');
            expect(processingResult.metadata.size).toBe(2048);
            expect(metadata.originalFileSize).toBe(2048);
            expect(metadata.actualFileSize).toBe(2048);
            expect(metadata.uploadId).toBe('upload-123');
        });

        test('should handle state transitions correctly', async () => {
            await uploadManager.init();

            const stateChanges = [];
            eventBus.on('ui:state:changed', (data) => {
                stateChanges.push(data.newState);
            });

            // Simulate state transitions
            uiController.updateUploadState('ready');
            uiController.updateUploadState('uploading');
            uiController.updateUploadState('completed');

            expect(stateChanges).toEqual(['ready', 'uploading', 'completed']);
        });
    });
});
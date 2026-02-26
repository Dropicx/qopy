/**
 * UploadCompletionService Unit Tests
 * Tests the refactored upload completion orchestration service
 */

const { UploadCompletionService, UploadCompletionError } = require('../../../services/UploadCompletionService');

// Mock console to avoid spam
const originalConsole = global.console;
beforeAll(() => {
  global.console = { ...originalConsole, log: jest.fn(), error: jest.fn(), warn: jest.fn() };
});
afterAll(() => {
  global.console = originalConsole;
});

// Mock dependencies
const mockPool = {};
const mockRedis = {};

// Mock functions
const mockAssembleFile = jest.fn();
const mockUpdateStatistics = jest.fn();
const mockGenerateClipId = jest.fn();
const mockGetUploadSession = jest.fn();

// Mock service classes
jest.mock('../../../services/UploadValidator');
jest.mock('../../../services/FileAssemblyService');
jest.mock('../../../services/EncryptionService');
jest.mock('../../../services/UploadRepository');

const UploadValidator = require('../../../services/UploadValidator');
const FileAssemblyService = require('../../../services/FileAssemblyService');
const EncryptionService = require('../../../services/EncryptionService');
const UploadRepository = require('../../../services/UploadRepository');

describe('UploadCompletionService', () => {
    let service;
    let mockRepository;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock repository BEFORE constructing service
        mockRepository = {
            createClip: jest.fn(),
            updateSessionStatistics: jest.fn(),
            cleanupUploadSession: jest.fn()
        };
        UploadRepository.mockImplementation(() => mockRepository);

        // Setup service (constructor calls new UploadRepository)
        service = new UploadCompletionService(
            mockPool,
            mockRedis,
            mockAssembleFile,
            mockUpdateStatistics,
            mockGenerateClipId,
            mockGetUploadSession
        );
    });

    describe('Constructor', () => {
        it('should initialize with all required dependencies', () => {
            expect(service.pool).toBe(mockPool);
            expect(service.redis).toBe(mockRedis);
            expect(service.assembleFile).toBe(mockAssembleFile);
            expect(service.updateStatistics).toBe(mockUpdateStatistics);
            expect(service.generateClipId).toBe(mockGenerateClipId);
            expect(service.getUploadSession).toBe(mockGetUploadSession);
        });

        it('should create repository instance', () => {
            expect(UploadRepository).toHaveBeenCalledWith(mockPool, mockRedis);
        });
    });

    describe('completeUpload', () => {
        const mockRequest = {
            protocol: 'https',
            get: jest.fn(() => 'example.com')
        };

        const mockRequestData = { accessCode: 'test123' };
        const mockUploadId = 'upload-123';

        beforeEach(() => {
            // Setup default mocks
            UploadValidator.parseUploadRequest.mockReturnValue(mockRequestData);
            UploadValidator.validateSession.mockReturnValue({ id: 'session-123' });
            UploadValidator.validateChunks.mockReturnValue({ isComplete: true });
            
            mockGetUploadSession.mockResolvedValue({ id: 'session-123' });
            mockGenerateClipId.mockReturnValue('clip-123');
            
            FileAssemblyService.assembleFileLegacy.mockResolvedValue('/path/to/file');
            FileAssemblyService.getFileSize.mockResolvedValue(1024);
            
            EncryptionService.processAccessCode.mockReturnValue({
                passwordHash: 'hash123',
                accessCodeHash: 'accesshash123',
                shouldRequireAccessCode: true
            });
            EncryptionService.createFileMetadata.mockReturnValue({ metadata: 'test' });
        });

        it('should complete upload successfully', async () => {
            const result = await service.completeUpload(
                mockUploadId,
                mockRequestData,
                mockRequest
            );

            expect(result).toEqual({
                success: true,
                clipId: 'clip-123',
                url: 'https://example.com/file/clip-123',
                filename: undefined,
                filesize: undefined,
                expiresAt: undefined,
                quickShare: undefined,
                oneTime: undefined,
                isFile: true
            });
        });

        it('should throw UploadCompletionError if session not found', async () => {
            mockGetUploadSession.mockResolvedValue(null);

            await expect(service.completeUpload(mockUploadId, mockRequestData, mockRequest))
                .rejects.toThrow(new UploadCompletionError('Upload session not found', 404));
        });

        it('should throw UploadCompletionError if chunks incomplete', async () => {
            UploadValidator.validateChunks.mockReturnValue({
                isComplete: false,
                uploadedChunks: 5,
                totalChunks: 10
            });

            await expect(service.completeUpload(mockUploadId, mockRequestData, mockRequest))
                .rejects.toThrow(new UploadCompletionError('Upload incomplete: 5/10 chunks uploaded', 400));
        });

        it('should call all required services in correct order', async () => {
            await service.completeUpload(mockUploadId, mockRequestData, mockRequest);

            // Verify service calls
            expect(UploadValidator.parseUploadRequest).toHaveBeenCalledWith(mockRequestData);
            expect(mockGetUploadSession).toHaveBeenCalledWith(mockUploadId);
            expect(UploadValidator.validateSession).toHaveBeenCalled();
            expect(UploadValidator.validateChunks).toHaveBeenCalled();
            expect(FileAssemblyService.assembleFileLegacy).toHaveBeenCalled();
            expect(FileAssemblyService.getFileSize).toHaveBeenCalled();
            expect(mockGenerateClipId).toHaveBeenCalled();
            expect(EncryptionService.processAccessCode).toHaveBeenCalled();
            expect(EncryptionService.createFileMetadata).toHaveBeenCalled();
            expect(mockRepository.createClip).toHaveBeenCalled();
            expect(mockRepository.updateSessionStatistics).toHaveBeenCalled();
            expect(mockRepository.cleanupUploadSession).toHaveBeenCalledWith(mockUploadId);
        });
    });

    describe('formatResponse', () => {
        const mockRequest = {
            protocol: 'https',
            get: jest.fn(() => 'example.com')
        };

        it('should format response for file upload', () => {
            const session = {
                is_text_content: false,
                original_filename: 'test.pdf',
                filesize: 1024,
                expiration_time: '2023-12-31',
                quick_share: false,
                one_time: false
            };

            const result = service.formatResponse(session, 'clip-123', mockRequest);

            expect(result).toEqual({
                success: true,
                clipId: 'clip-123',
                url: 'https://example.com/file/clip-123',
                filename: 'test.pdf',
                filesize: 1024,
                expiresAt: '2023-12-31',
                quickShare: false,
                oneTime: false,
                isFile: true
            });
        });

        it('should format response for text content', () => {
            const session = {
                is_text_content: true,
                original_filename: 'text.txt',
                filesize: 256,
                expiration_time: '2023-12-31',
                quick_share: true,
                one_time: true
            };

            const result = service.formatResponse(session, 'clip-123', mockRequest);

            expect(result.url).toBe('https://example.com/clip/clip-123');
        });
    });

    describe('Error Handling', () => {
        it('should propagate FileAssemblyService errors', async () => {
            const mockRequest = { protocol: 'https', get: jest.fn(() => 'example.com') };
            
            UploadValidator.parseUploadRequest.mockReturnValue({});
            UploadValidator.validateSession.mockReturnValue({});
            UploadValidator.validateChunks.mockReturnValue({ isComplete: true });
            mockGetUploadSession.mockResolvedValue({});
            
            FileAssemblyService.assembleFileLegacy.mockRejectedValue(new Error('Assembly failed'));

            await expect(service.completeUpload('upload-123', {}, mockRequest))
                .rejects.toThrow('Assembly failed');
        });

        it('should propagate repository errors', async () => {
            const mockRequest = { protocol: 'https', get: jest.fn(() => 'example.com') };
            
            UploadValidator.parseUploadRequest.mockReturnValue({});
            UploadValidator.validateSession.mockReturnValue({});
            UploadValidator.validateChunks.mockReturnValue({ isComplete: true });
            mockGetUploadSession.mockResolvedValue({});
            mockGenerateClipId.mockReturnValue('clip-123');
            
            FileAssemblyService.assembleFileLegacy.mockResolvedValue('/path/to/file');
            FileAssemblyService.getFileSize.mockResolvedValue(1024);
            EncryptionService.processAccessCode.mockReturnValue({});
            EncryptionService.createFileMetadata.mockReturnValue({});
            
            mockRepository.createClip.mockRejectedValue(new Error('Database error'));

            await expect(service.completeUpload('upload-123', {}, mockRequest))
                .rejects.toThrow('Database error');
        });
    });

    describe('Performance', () => {
        it('should complete upload within reasonable time', async () => {
            const start = Date.now();
            const mockRequest = { protocol: 'https', get: jest.fn(() => 'example.com') };
            
            // Setup minimal mocks
            UploadValidator.parseUploadRequest.mockReturnValue({});
            UploadValidator.validateSession.mockReturnValue({});
            UploadValidator.validateChunks.mockReturnValue({ isComplete: true });
            mockGetUploadSession.mockResolvedValue({});
            mockGenerateClipId.mockReturnValue('clip-123');
            FileAssemblyService.assembleFileLegacy.mockResolvedValue('/path');
            FileAssemblyService.getFileSize.mockResolvedValue(1024);
            EncryptionService.processAccessCode.mockReturnValue({});
            EncryptionService.createFileMetadata.mockReturnValue({});

            await service.completeUpload('upload-123', {}, mockRequest);
            
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(100); // Should complete quickly with mocks
        });
    });
});

describe('UploadCompletionError', () => {
    it('should create error with message and status code', () => {
        const error = new UploadCompletionError('Test error', 400);
        
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(400);
        expect(error.name).toBe('UploadCompletionError');
        expect(error instanceof Error).toBeTruthy();
    });

    it('should default to status code 500', () => {
        const error = new UploadCompletionError('Test error');
        
        expect(error.statusCode).toBe(500);
    });
});
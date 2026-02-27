/*
 * Copyright (C) 2025 Qopy App
 * Upload routes unit tests
 */

const express = require('express');
const request = require('supertest');

// Mock UploadCompletionService before requiring the module
jest.mock('../../../services/UploadCompletionService', () => {
  class UploadCompletionError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.name = 'UploadCompletionError';
      this.statusCode = statusCode;
    }
  }
  return {
    UploadCompletionService: jest.fn().mockImplementation(() => ({
      completeUpload: jest.fn().mockResolvedValue({ success: true, clipId: 'ABCDEF1234' })
    })),
    UploadCompletionError
  };
});

// Mock concurrency limiter
jest.mock('../../../services/utils/concurrencyLimiter', () => ({
  createLimiter: jest.fn().mockReturnValue((fn) => fn())
}));

// Mock fs-extra
jest.mock('fs-extra', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.alloc(1024)),
  writeFile: jest.fn().mockResolvedValue(),
  mkdir: jest.fn().mockResolvedValue(),
  unlink: jest.fn().mockResolvedValue()
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('aaaa-bbbb-cccc-dddd-eeee')
}));

const { registerUploadRoutes } = require('../../../routes/uploads');
const { UploadCompletionService, UploadCompletionError } = require('../../../services/UploadCompletionService');

// Mock console methods to avoid spam during tests
const originalConsole = global.console;
beforeAll(() => {
  global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  };
});
afterAll(() => {
  global.console = originalConsole;
});

function createApp(depsOverrides = {}) {
  const app = express();
  app.use(express.json());

  const mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...(depsOverrides.pool || {})
  };

  const mockRedisManager = {
    isConnected: jest.fn().mockReturnValue(false),
    del: jest.fn().mockResolvedValue(),
    ...(depsOverrides.redisManager || {})
  };

  // Multer mock - pass through as no-op for most tests
  const mockUpload = {
    single: jest.fn().mockReturnValue((req, res, next) => {
      // By default, simulate no file uploaded
      next();
    }),
    ...(depsOverrides.upload || {})
  };

  const deps = {
    pool: mockPool,
    upload: mockUpload,
    redisManager: mockRedisManager,
    getRedis: jest.fn().mockReturnValue(null),
    STORAGE_PATH: '/tmp/test-storage',
    CHUNK_SIZE: 5 * 1024 * 1024,
    MAX_FILE_SIZE: 100 * 1024 * 1024,
    generateClipId: jest.fn().mockReturnValue('ABCDEF1234'),
    updateStatistics: jest.fn().mockResolvedValue(),
    safeDeleteFile: jest.fn().mockResolvedValue({ success: true }),
    assembleFile: jest.fn().mockResolvedValue('/assembled/file.enc'),
    getUploadSession: jest.fn().mockResolvedValue(null),
    getClientIP: jest.fn().mockReturnValue('127.0.0.1'),
    ...depsOverrides
  };

  registerUploadRoutes(app, deps);

  return { app, mockPool, deps };
}

describe('Upload Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // POST /api/upload/initiate
  // ==========================================
  describe('POST /api/upload/initiate', () => {
    test('should initiate upload successfully with required fields', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/upload/initiate')
        .send({ filename: 'test-file.pdf', totalChunks: 3 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.uploadId).toBeDefined();
      expect(res.body.totalChunks).toBe(3);
      expect(res.body.uploadUrl).toContain('/api/upload/chunk/');
    });

    test('should return 400 when filename is missing', async () => {
      const { app } = createApp();

      const res = await request(app)
        .post('/api/upload/initiate')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should calculate totalChunks from filesize when totalChunks not provided', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });
      const filesize = 12 * 1024 * 1024; // 12 MB -> 3 chunks at 5MB each

      const res = await request(app)
        .post('/api/upload/initiate')
        .send({ filename: 'big-file.bin', filesize });

      expect(res.status).toBe(200);
      expect(res.body.totalChunks).toBe(3);
    });

    test('should reject totalChunks greater than 20', async () => {
      const { app } = createApp();

      const res = await request(app)
        .post('/api/upload/initiate')
        .send({ filename: 'file.bin', totalChunks: 21 });

      expect(res.status).toBe(400);
    });

    test('should accept optional expiration values', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/upload/initiate')
        .send({ filename: 'file.txt', totalChunks: 1, expiration: '5min' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should reject invalid expiration values', async () => {
      const { app } = createApp();

      const res = await request(app)
        .post('/api/upload/initiate')
        .send({ filename: 'file.txt', totalChunks: 1, expiration: '2days' });

      expect(res.status).toBe(400);
    });

    test('should set text MIME type for text content', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/upload/initiate')
        .send({ filename: 'note.txt', totalChunks: 1, contentType: 'text', isTextContent: true });

      expect(res.status).toBe(200);
      // Verify pool.query was called with text/plain mime type
      const insertCall = mockPool.query.mock.calls[0];
      expect(insertCall[1]).toContain('text/plain; charset=utf-8');
    });

    test('should return 500 when database insert fails', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/api/upload/initiate')
        .send({ filename: 'file.pdf', totalChunks: 1 });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to initiate upload');
    });
  });

  // ==========================================
  // POST /api/upload/chunk/:uploadId/:chunkNumber
  // ==========================================
  describe('POST /api/upload/chunk/:uploadId/:chunkNumber', () => {
    test('should return 400 for invalid upload ID length', async () => {
      const { app } = createApp();

      const res = await request(app)
        .post('/api/upload/chunk/SHORT/0')
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should return 404 when upload session not found', async () => {
      const uploadId = 'A'.repeat(16);
      const { app, mockPool } = createApp({
        upload: {
          single: jest.fn().mockReturnValue((req, res, next) => {
            req.file = { buffer: Buffer.alloc(1024), size: 1024 };
            next();
          })
        }
      });
      mockPool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post(`/api/upload/chunk/${uploadId}/0`)
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Upload session not found');
    });

    test('should return 400 when chunk number exceeds total', async () => {
      const uploadId = 'A'.repeat(16);
      const session = {
        upload_id: uploadId,
        total_chunks: 3,
        uploaded_chunks: 0,
        chunk_size: 5 * 1024 * 1024,
        status: 'uploading',
        is_text_content: false
      };
      const { app, mockPool } = createApp({
        upload: {
          single: jest.fn().mockReturnValue((req, res, next) => {
            req.file = { buffer: Buffer.alloc(1024), size: 1024 };
            next();
          })
        }
      });
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...session, chunk_exists: false }] });   // combined session + chunk check

      const res = await request(app)
        .post(`/api/upload/chunk/${uploadId}/5`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid chunk number');
    });

    test('should return 409 when chunk already uploaded', async () => {
      const uploadId = 'A'.repeat(16);
      const session = {
        upload_id: uploadId,
        total_chunks: 3,
        uploaded_chunks: 1,
        chunk_size: 5 * 1024 * 1024,
        status: 'uploading',
        is_text_content: false
      };
      const { app, mockPool } = createApp({
        upload: {
          single: jest.fn().mockReturnValue((req, res, next) => {
            req.file = { buffer: Buffer.alloc(1024), size: 1024 };
            next();
          })
        }
      });
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...session, chunk_exists: true }] });    // combined query: chunk exists

      const res = await request(app)
        .post(`/api/upload/chunk/${uploadId}/0`)
        .send();

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Chunk already uploaded');
    });

    test('should return 400 when no file is provided', async () => {
      const uploadId = 'A'.repeat(16);
      const session = {
        upload_id: uploadId,
        total_chunks: 3,
        uploaded_chunks: 0,
        chunk_size: 5 * 1024 * 1024,
        status: 'uploading',
        is_text_content: false
      };
      const { app, mockPool } = createApp();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ ...session, chunk_exists: false }] });   // combined session + chunk check

      const res = await request(app)
        .post(`/api/upload/chunk/${uploadId}/0`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No chunk file provided');
    });
  });

  // ==========================================
  // POST /api/upload/complete/:uploadId
  // ==========================================
  describe('POST /api/upload/complete/:uploadId', () => {
    test('should complete upload successfully', async () => {
      const completeMock = jest.fn().mockResolvedValue({ success: true, clipId: 'XYZ789ABCD' });
      UploadCompletionService.mockImplementation(() => ({
        completeUpload: completeMock
      }));

      const { app } = createApp();

      const res = await request(app)
        .post('/api/upload/complete/TESTUPLOADID1234')
        .send({ accessCodeHash: 'abc123' });

      expect(res.status).toBe(200);
    });

    test('should return 404 for UploadCompletionError with not found', async () => {
      const completeMock = jest.fn().mockRejectedValue(
        new UploadCompletionError('Upload session not found', 404)
      );
      UploadCompletionService.mockImplementation(() => ({
        completeUpload: completeMock
      }));

      const { app } = createApp();

      const res = await request(app)
        .post('/api/upload/complete/TESTUPLOADID1234')
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Upload session not found');
    });

    test('should return 500 for unexpected errors', async () => {
      const completeMock = jest.fn().mockRejectedValue(new Error('Unexpected failure'));
      UploadCompletionService.mockImplementation(() => ({
        completeUpload: completeMock
      }));

      const { app } = createApp();

      const res = await request(app)
        .post('/api/upload/complete/TESTUPLOADID1234')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to complete upload');
    });
  });

  // ==========================================
  // GET /api/upload/:uploadId/status
  // ==========================================
  describe('GET /api/upload/:uploadId/status', () => {
    test('should return upload status for active session', async () => {
      const session = {
        status: 'uploading',
        uploaded_chunks: 2,
        total_chunks: 5
      };
      const { app } = createApp({
        getUploadSession: jest.fn().mockResolvedValue(session)
      });

      const res = await request(app).get('/api/upload/TESTUPLOADID1234/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.uploadedChunks).toBe(2);
      expect(res.body.totalChunks).toBe(5);
      expect(res.body.progress).toBe(40);
    });

    test('should return 404 for non-existent session', async () => {
      const { app } = createApp({
        getUploadSession: jest.fn().mockResolvedValue(null)
      });

      const res = await request(app).get('/api/upload/TESTUPLOADID1234/status');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Upload session not found');
    });

    test('should return 500 on error', async () => {
      const { app } = createApp({
        getUploadSession: jest.fn().mockRejectedValue(new Error('Redis down'))
      });

      const res = await request(app).get('/api/upload/TESTUPLOADID1234/status');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to get upload status');
    });
  });

  // ==========================================
  // DELETE /api/upload/:uploadId
  // ==========================================
  describe('DELETE /api/upload/:uploadId', () => {
    test('should cancel upload and clean up', async () => {
      const uploadId = 'A'.repeat(16);
      const session = { upload_id: uploadId, status: 'uploading' };
      const chunks = [
        { storage_path: '/tmp/chunks/chunk_0' },
        { storage_path: '/tmp/chunks/chunk_1' }
      ];

      const { app, mockPool, deps } = createApp();
      mockPool.query
        .mockResolvedValueOnce({ rows: [session] })   // SELECT session
        .mockResolvedValueOnce({ rows: chunks })       // SELECT chunks
        .mockResolvedValueOnce({ rowCount: 2 })        // DELETE chunks
        .mockResolvedValueOnce({ rowCount: 1 });       // DELETE session

      const res = await request(app).delete(`/api/upload/${uploadId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Upload cancelled successfully');
      expect(deps.safeDeleteFile).toHaveBeenCalledTimes(2);
    });

    test('should return 404 for non-existent session', async () => {
      const uploadId = 'A'.repeat(16);
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).delete(`/api/upload/${uploadId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Upload session not found');
    });

    test('should return 400 for invalid upload ID', async () => {
      const { app } = createApp();

      const res = await request(app).delete('/api/upload/SHORT');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should return 500 on database error during cancellation', async () => {
      const uploadId = 'A'.repeat(16);
      const { app, mockPool } = createApp();
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const res = await request(app).delete(`/api/upload/${uploadId}`);

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to cancel upload');
    });
  });
});

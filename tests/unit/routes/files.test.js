/*
 * Copyright (C) 2025 Qopy App
 * File routes unit tests
 */

const express = require('express');
const request = require('supertest');
const { registerFileRoutes } = require('../../../routes/files');

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

function createApp(overrides = {}) {
  const app = express();
  app.use(express.json());

  const mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...(overrides.pool || {})
  };

  const mockFileService = {
    fileExists: jest.fn().mockResolvedValue(true),
    setDownloadHeaders: jest.fn(),
    streamFile: jest.fn().mockImplementation((filePath, res) => {
      res.status(200).end();
      return Promise.resolve();
    }),
    ...(overrides.fileService || {})
  };

  const mockFileDownloadLimiter = (req, res, next) => next();
  const mockAccessValidationMiddleware = (req, res, next) => next();
  const mockUpdateStatistics = jest.fn().mockResolvedValue();
  const storagePath = overrides.storagePath !== undefined ? overrides.storagePath : '/storage';

  registerFileRoutes(app, {
    pool: mockPool,
    fileService: mockFileService,
    fileDownloadLimiter: overrides.fileDownloadLimiter || mockFileDownloadLimiter,
    accessValidationMiddleware: overrides.accessValidationMiddleware || mockAccessValidationMiddleware,
    updateStatistics: overrides.updateStatistics || mockUpdateStatistics,
    storagePath
  });

  return { app, mockPool, mockFileService, mockUpdateStatistics };
}

function makeFileClipRow(overrides = {}) {
  return {
    clip_id: 'ABCDEF1234',
    content_type: 'file',
    file_path: '/storage/files/ABCDEF1234.enc',
    original_filename: 'document.pdf',
    filesize: 2048,
    mime_type: 'application/pdf',
    expiration_time: Date.now() + 3600000,
    one_time: false,
    password_hash: null,
    is_expired: false,
    access_count: 0,
    ...overrides
  };
}

describe('File Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /api/file/:clipId/info
  // ==========================================
  describe('GET /api/file/:clipId/info', () => {
    test('should return file info for existing file clip', async () => {
      const clip = makeFileClipRow();
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/file/ABCDEF1234/info');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.clipId).toBe('ABCDEF1234');
      expect(res.body.filename).toBe('document.pdf');
      expect(res.body.filesize).toBe(2048);
      expect(res.body.mimeType).toBe('application/pdf');
      expect(res.body.hasPassword).toBe(false);
    });

    test('should return 404 for non-existent file', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/api/file/ABCDEF1234/info');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('File not found');
    });

    test('should indicate hasPassword when password_hash is client-encrypted', async () => {
      const clip = makeFileClipRow({ password_hash: 'client-encrypted' });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/file/ABCDEF1234/info');

      expect(res.status).toBe(200);
      expect(res.body.hasPassword).toBe(true);
    });

    test('should return 400 for invalid clip ID', async () => {
      const { app } = createApp();

      const res = await request(app).get('/api/file/bad/info');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should return 500 on database error', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/file/ABCDEF1234/info');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to get file info');
    });
  });

  // ==========================================
  // POST /api/file/:clipId
  // ==========================================
  describe('POST /api/file/:clipId', () => {
    test('should stream file for valid authenticated request', async () => {
      const clip = makeFileClipRow();
      const { app, mockPool, mockFileService } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app)
        .post('/api/file/ABCDEF1234')
        .send({});

      expect(res.status).toBe(200);
      expect(mockFileService.fileExists).toHaveBeenCalledWith(clip.file_path);
      expect(mockFileService.setDownloadHeaders).toHaveBeenCalled();
      expect(mockFileService.streamFile).toHaveBeenCalled();
    });

    test('should return 404 when clip not found', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/api/file/ABCDEF1234')
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('File not found');
    });

    test('should return 404 when file does not exist on storage', async () => {
      const clip = makeFileClipRow();
      const { app, mockPool } = createApp({
        fileService: {
          fileExists: jest.fn().mockResolvedValue(false),
          setDownloadHeaders: jest.fn(),
          streamFile: jest.fn()
        }
      });
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app)
        .post('/api/file/ABCDEF1234')
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('File not found on storage');
    });

    test('should return 404 when file_path is outside storage (path canonicalization)', async () => {
      const clip = makeFileClipRow({ file_path: '/etc/passwd' });
      const { app, mockPool, mockFileService } = createApp({ storagePath: '/storage' });
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app)
        .post('/api/file/ABCDEF1234')
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('File not found');
      expect(mockFileService.fileExists).not.toHaveBeenCalled();
      expect(mockFileService.streamFile).not.toHaveBeenCalled();
    });

    test('should handle one-time file access and delete clip', async () => {
      const clip = makeFileClipRow({ one_time: true });
      const { app, mockPool, mockFileService } = createApp();
      mockPool.query
        .mockResolvedValueOnce({ rows: [clip] })            // SELECT clip
        .mockResolvedValueOnce({ rows: [] })                 // UPDATE access count
        .mockResolvedValueOnce({ rows: [{ clip_id: 'ABCDEF1234' }], rowCount: 1 }); // DELETE

      const res = await request(app)
        .post('/api/file/ABCDEF1234')
        .send({});

      expect(res.status).toBe(200);
      expect(mockFileService.streamFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.anything(),
        { deleteAfterSend: true }
      );
    });

    test('should return 410 when one-time file already accessed', async () => {
      const clip = makeFileClipRow({ one_time: true });
      const { app, mockPool } = createApp();
      mockPool.query
        .mockResolvedValueOnce({ rows: [clip] })     // SELECT clip
        .mockResolvedValueOnce({ rows: [] })          // UPDATE access count
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // DELETE returns 0

      const res = await request(app)
        .post('/api/file/ABCDEF1234')
        .send({});

      expect(res.status).toBe(410);
      expect(res.body.error).toBe('File no longer available');
    });

    test('should update access statistics on successful download', async () => {
      const clip = makeFileClipRow();
      const { app, mockPool, mockUpdateStatistics } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      await request(app)
        .post('/api/file/ABCDEF1234')
        .send({});

      expect(mockUpdateStatistics).toHaveBeenCalledWith('file_accessed');
    });
  });

  // ==========================================
  // GET /api/file/:clipId (legacy 410)
  // ==========================================
  describe('GET /api/file/:clipId (legacy)', () => {
    test('should return 410 Gone for unauthenticated download', async () => {
      const { app } = createApp();

      const res = await request(app).get('/api/file/ABCDEF1234');

      expect(res.status).toBe(410);
      expect(res.body.error).toBe('Unauthenticated downloads disabled');
    });

    test('should return 410 even for valid clip IDs', async () => {
      const { app } = createApp();

      const res = await request(app).get('/api/file/ABC123');

      expect(res.status).toBe(410);
      expect(res.body.hint).toContain('security measure');
    });
  });
});

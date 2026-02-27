/*
 * Copyright (C) 2025 Qopy App
 * Clip routes unit tests
 */

const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const { registerClipRoutes } = require('../../../routes/clips');

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

function createApp(poolOverrides = {}, depsOverrides = {}) {
  const app = express();
  app.use(express.json());

  const mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...poolOverrides
  };

  const mockUpdateStatistics = jest.fn().mockResolvedValue();

  registerClipRoutes(app, {
    pool: mockPool,
    updateStatistics: mockUpdateStatistics,
    ...depsOverrides
  });

  return { app, mockPool, mockUpdateStatistics };
}

// Helper to build a valid clip row
function makeClipRow(overrides = {}) {
  return {
    clip_id: 'ABCDEF1234',
    content: Buffer.from('encrypted-content'),
    content_type: 'text',
    expiration_time: Date.now() + 3600000,
    one_time: false,
    password_hash: null,
    requires_access_code: false,
    access_code_hash: null,
    file_path: null,
    original_filename: null,
    filesize: null,
    mime_type: null,
    file_metadata: null,
    access_count: 0,
    ...overrides
  };
}

describe('Clip Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // clipIdValidator
  // ==========================================
  describe('clipIdValidator', () => {
    test('should reject clip IDs that are not 6 or 10 characters', async () => {
      const { app } = createApp();

      const res = await request(app).get('/api/clip/ABC/info');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should reject clip IDs with lowercase letters', async () => {
      const { app } = createApp();

      const res = await request(app).get('/api/clip/abcdef/info');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should reject clip IDs with special characters', async () => {
      const { app } = createApp();

      const res = await request(app).get('/api/clip/ABC@EF/info');
      expect(res.status).toBe(400);
    });

    test('should accept valid 6-character clip IDs', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app).get('/api/clip/ABC123/info');
      // 404 because clip not found, but validation passed
      expect(res.status).toBe(404);
    });

    test('should accept valid 10-character clip IDs', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app).get('/api/clip/ABCDEF1234/info');
      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // GET /api/clip/:clipId/info
  // ==========================================
  describe('GET /api/clip/:clipId/info', () => {
    test('should return clip info for existing clip', async () => {
      const clip = makeClipRow({ clip_id: 'ABCDEF1234', content_type: 'text' });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/clip/ABCDEF1234/info');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.clipId).toBe('ABCDEF1234');
      expect(res.body.contentType).toBe('text');
      expect(res.body.hasPassword).toBe(false);
    });

    test('should return 404 for non-existent clip', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/api/clip/ABCDEF1234/info');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Clip not found');
    });

    test('should indicate hasPassword for 10-char clip with requires_access_code', async () => {
      const clip = makeClipRow({
        clip_id: 'ABCDEF1234',
        requires_access_code: true,
        password_hash: 'client-encrypted'
      });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/clip/ABCDEF1234/info');

      expect(res.status).toBe(200);
      expect(res.body.hasPassword).toBe(true);
    });

    test('should never indicate hasPassword for 6-char quick share clip', async () => {
      const clip = makeClipRow({
        clip_id: 'ABC123',
        requires_access_code: true  // Even if set, quick share ignores this
      });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/clip/ABC123/info');

      expect(res.status).toBe(200);
      expect(res.body.hasPassword).toBe(false);
    });

    test('should return 500 on database error', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockRejectedValue(new Error('DB connection lost'));

      const res = await request(app).get('/api/clip/ABCDEF1234/info');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to get clip info');
    });
  });

  // ==========================================
  // GET /api/clip/:clipId
  // ==========================================
  describe('GET /api/clip/:clipId', () => {
    test('should return inline text content for clip without access code', async () => {
      const clip = makeClipRow({
        clip_id: 'ABCDEF1234',
        content: 'encrypted-text-data',
        content_type: 'text'
      });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/clip/ABCDEF1234');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.content).toBe('encrypted-text-data');
      expect(res.body.contentType).toBe('text');
    });

    test('should return 404 for non-existent clip', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/api/clip/ABCDEF1234');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Clip not found');
    });

    test('should return 401 when clip requires access code', async () => {
      const clip = makeClipRow({ requires_access_code: true });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/clip/ABCDEF1234');

      expect(res.status).toBe(401);
      expect(res.body.requiresAccessCode).toBe(true);
    });

    test('should redirect to file endpoint for file content type', async () => {
      const clip = makeClipRow({
        content_type: 'file',
        original_filename: 'doc.pdf',
        filesize: 1024,
        mime_type: 'application/pdf'
      });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/clip/ABCDEF1234');

      expect(res.status).toBe(200);
      expect(res.body.contentType).toBe('file');
      expect(res.body.redirectTo).toBe('/api/file/ABCDEF1234');
    });

    test('should handle one-time clip deletion', async () => {
      const clip = makeClipRow({
        content: 'one-time-secret',
        content_type: 'text',
        one_time: true
      });
      const { app, mockPool } = createApp();
      // First query: find clip, second: update access, third: updateStatistics internally, fourth: delete
      mockPool.query
        .mockResolvedValueOnce({ rows: [clip] })          // SELECT clip
        .mockResolvedValueOnce({ rows: [] })               // UPDATE access count
        .mockResolvedValueOnce({ rows: [{ clip_id: 'ABCDEF1234' }], rowCount: 1 }); // DELETE for one_time

      const res = await request(app).get('/api/clip/ABCDEF1234');

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('one-time-secret');
    });

    test('should return binary content as array', async () => {
      const binaryContent = Buffer.from([0x01, 0x02, 0x03, 0xFF]);
      const clip = makeClipRow({
        content: binaryContent,
        content_type: 'binary'
      });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/clip/ABCDEF1234');

      expect(res.status).toBe(200);
      expect(res.body.contentType).toBe('binary');
      expect(Array.isArray(res.body.content)).toBe(true);
    });

    test('should return 500 on database error', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/clip/ABCDEF1234');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to retrieve clip');
    });

    test('should handle clip with file_path and text content_type', async () => {
      const clip = makeClipRow({
        content: null,
        content_type: 'text',
        file_path: '/storage/files/abc.enc',
        original_filename: 'notes.txt',
        filesize: 512,
        mime_type: 'text/plain'
      });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app).get('/api/clip/ABCDEF1234');

      expect(res.status).toBe(200);
      expect(res.body.contentType).toBe('text');
      expect(res.body.redirectTo).toBe('/api/file/ABCDEF1234');
      expect(res.body.isTextFile).toBe(true);
    });
  });

  // ==========================================
  // POST /api/clip/:clipId (access code flow)
  // ==========================================
  describe('POST /api/clip/:clipId', () => {
    test('should return clip content without access code when not required', async () => {
      const clip = makeClipRow({
        content: 'public-data',
        content_type: 'text',
        requires_access_code: false
      });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app)
        .post('/api/clip/ABCDEF1234')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should return 401 when access code required but not provided', async () => {
      const clip = makeClipRow({ requires_access_code: true, access_code_hash: 'somehash' });
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [clip] });

      const res = await request(app)
        .post('/api/clip/ABCDEF1234')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Access code required');
    });

    test('should accept pre-hashed access code and grant access', async () => {
      // Generate a known hash
      const hash = crypto.pbkdf2Sync('test-code', 'qopy-access-salt-v1', 100000, 64, 'sha512').toString('hex');

      const clip = makeClipRow({
        content: 'secret-data',
        content_type: 'text',
        requires_access_code: true,
        access_code_hash: hash
      });
      const { app, mockPool } = createApp();
      // Single query fetches the clip with access_code_hash — no redundant second query
      mockPool.query
        .mockResolvedValueOnce({ rows: [clip] })    // SELECT for POST
        .mockResolvedValueOnce({ rows: [] })         // UPDATE access count
        .mockResolvedValueOnce({ rows: [] });        // any follow-up

      const res = await request(app)
        .post('/api/clip/ABCDEF1234')
        .send({ accessCode: hash });  // Send pre-hashed

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should reject wrong access code', async () => {
      const correctHash = 'a'.repeat(128);
      const clip = makeClipRow({
        requires_access_code: true,
        access_code_hash: correctHash
      });
      const { app, mockPool } = createApp();
      // Single query — access_code_hash is already on the clip object
      mockPool.query
        .mockResolvedValueOnce({ rows: [clip] });

      const res = await request(app)
        .post('/api/clip/ABCDEF1234')
        .send({ accessCode: 'b'.repeat(128) });  // Wrong hash

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Access denied');
    });

    test('should return 401 when access_code_hash is missing from DB', async () => {
      const clip = makeClipRow({
        requires_access_code: true,
        access_code_hash: null
      });
      const { app, mockPool } = createApp();
      // Single query — clip already has access_code_hash: null
      mockPool.query
        .mockResolvedValueOnce({ rows: [clip] });

      const res = await request(app)
        .post('/api/clip/ABCDEF1234')
        .send({ accessCode: 'some-code' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Access denied');
      expect(res.body.message).toBe('Invalid access code configuration');
    });

    test('should return 404 for non-existent clip', async () => {
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/api/clip/ABCDEF1234')
        .send({ accessCode: 'test' });

      expect(res.status).toBe(404);
    });

    test('should return 500 when access code PBKDF2 hashing fails', async () => {
      const clip = makeClipRow({
        requires_access_code: true,
        access_code_hash: 'somehash'
      });
      const { app, mockPool } = createApp();
      mockPool.query
        .mockResolvedValueOnce({ rows: [clip] });

      // Mock crypto.pbkdf2 to fail
      const originalPbkdf2 = crypto.pbkdf2;
      crypto.pbkdf2 = (password, salt, iterations, keylen, digest, callback) => {
        callback(new Error('PBKDF2 error'));
      };

      const res = await request(app)
        .post('/api/clip/ABCDEF1234')
        .send({ accessCode: 'test-code' });

      crypto.pbkdf2 = originalPbkdf2;

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to validate access code');
    });
  });
});

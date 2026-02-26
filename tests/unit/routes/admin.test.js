/*
 * Copyright (C) 2025 Qopy App
 * Admin routes unit tests
 */

const express = require('express');
const request = require('supertest');
const { registerAdminRoutes, requireAdminAuth } = require('../../../routes/admin');

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

function createApp(poolOverrides = {}) {
  const app = express();
  app.use(express.json());

  const mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...poolOverrides
  };

  registerAdminRoutes(app, { pool: mockPool });

  return { app, mockPool };
}

describe('Admin Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADMIN_TOKEN;
  });

  // ==========================================
  // requireAdminAuth middleware
  // ==========================================
  describe('requireAdminAuth middleware', () => {
    test('should return 500 when ADMIN_TOKEN is not configured', async () => {
      const app = express();
      app.get('/api/admin/test', requireAdminAuth, (req, res) => res.json({ ok: true }));

      const res = await request(app).get('/api/admin/test');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Admin authentication not configured');
    });

    test('should return 401 when no authorization header is provided', async () => {
      process.env.ADMIN_TOKEN = 'test-token-123';
      const app = express();
      app.get('/api/admin/test', requireAdminAuth, (req, res) => res.json({ ok: true }));

      const res = await request(app).get('/api/admin/test');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    test('should return 401 when authorization header has wrong token', async () => {
      process.env.ADMIN_TOKEN = 'test-token-123';
      const app = express();
      app.get('/api/admin/test', requireAdminAuth, (req, res) => res.json({ ok: true }));

      // Use same-length token so timingSafeEqual doesn't throw on length mismatch
      const res = await request(app)
        .get('/api/admin/test')
        .set('Authorization', 'Bearer wrong-token-xxx');

      expect(res.status).toBe(401);
    });

    test('should pass when authorization header has correct token', async () => {
      process.env.ADMIN_TOKEN = 'test-token-123';
      const app = express();
      app.get('/api/admin/test', requireAdminAuth, (req, res) => res.json({ ok: true }));

      const res = await request(app)
        .get('/api/admin/test')
        .set('Authorization', 'Bearer test-token-123');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('should allow non-API admin paths without bearer token', async () => {
      process.env.ADMIN_TOKEN = 'test-token-123';
      const app = express();
      app.get('/admin/dashboard', requireAdminAuth, (req, res) => res.json({ ok: true }));

      const res = await request(app).get('/admin/dashboard');

      expect(res.status).toBe(200);
    });
  });

  // ==========================================
  // POST /api/admin/auth
  // ==========================================
  describe('POST /api/admin/auth', () => {
    test('should authenticate with correct password', async () => {
      process.env.ADMIN_TOKEN = 'my-admin-token';
      const { app } = createApp();

      const res = await request(app)
        .post('/api/admin/auth')
        .send({ password: 'my-admin-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Authentication successful');
    });

    test('should reject incorrect password', async () => {
      process.env.ADMIN_TOKEN = 'my-admin-token';
      const { app } = createApp();

      const res = await request(app)
        .post('/api/admin/auth')
        .send({ password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication failed');
    });

    test('should return 400 when password is missing', async () => {
      process.env.ADMIN_TOKEN = 'my-admin-token';
      const { app } = createApp();

      const res = await request(app)
        .post('/api/admin/auth')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('should return 500 when ADMIN_TOKEN not configured', async () => {
      const { app } = createApp();

      const res = await request(app)
        .post('/api/admin/auth')
        .send({ password: 'anything' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Admin authentication not configured');
    });
  });

  // ==========================================
  // GET /admin
  // ==========================================
  describe('GET /admin', () => {
    test('should return 500 HTML when ADMIN_TOKEN is not configured', async () => {
      const { app } = createApp();

      const res = await request(app).get('/admin');

      expect(res.status).toBe(500);
      expect(res.text).toContain('Admin Dashboard Not Configured');
    });

    test('should serve admin.html when ADMIN_TOKEN is configured', async () => {
      process.env.ADMIN_TOKEN = 'my-token';
      const { app } = createApp();

      // sendFile will attempt to send the file; in test environment the file may not exist
      // but we verify the route is hit and not returning the 500 error page
      const res = await request(app).get('/admin');

      // Either serves the file or returns an error from sendFile (not the 500 config error)
      expect(res.text).not.toContain('Admin Dashboard Not Configured');
    });
  });

  // ==========================================
  // GET /api/admin/stats
  // ==========================================
  describe('GET /api/admin/stats', () => {
    test('should return statistics for authenticated admin', async () => {
      process.env.ADMIN_TOKEN = 'admin-token';
      const statsRow = {
        total_clips: '100',
        total_accesses: '500',
        password_protected_clips: '20',
        quick_share_clips: '30',
        one_time_clips: '10',
        normal_clips: '40',
        last_updated: Date.now()
      };

      const { app, mockPool } = createApp();
      mockPool.query
        .mockResolvedValueOnce({ rows: [statsRow] })  // statistics query
        .mockResolvedValueOnce({ rows: [{ count: '75' }] });  // active clips query

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.totalClips).toBe(100);
      expect(res.body.activeClips).toBe(75);
      expect(res.body.totalAccesses).toBe(500);
      expect(res.body.passwordPercentage).toBe(20);
    });

    test('should return 401 without valid token', async () => {
      process.env.ADMIN_TOKEN = 'admin-token';
      const { app } = createApp();

      const res = await request(app).get('/api/admin/stats');

      expect(res.status).toBe(401);
    });

    test('should return 500 when database query fails', async () => {
      process.env.ADMIN_TOKEN = 'admin-token';
      const { app, mockPool } = createApp();
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to get statistics');
    });
  });

  // ==========================================
  // GET /api/admin/clips
  // ==========================================
  describe('GET /api/admin/clips', () => {
    test('should return recent clips for authenticated admin', async () => {
      process.env.ADMIN_TOKEN = 'admin-token';
      const clipsRows = [
        { clip_id: 'ABCDEF1234', created_at: Date.now(), has_password: false, one_time: false },
        { clip_id: 'XYZ123', created_at: Date.now(), has_password: true, one_time: true }
      ];

      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: clipsRows });

      const res = await request(app)
        .get('/api/admin/clips')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].clip_id).toBe('ABCDEF1234');
    });

    test('should return 500 when database query fails', async () => {
      process.env.ADMIN_TOKEN = 'admin-token';
      const { app, mockPool } = createApp();
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .get('/api/admin/clips')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to get clips');
    });
  });

  // ==========================================
  // GET /api/admin/system
  // ==========================================
  describe('GET /api/admin/system', () => {
    test('should return system info for authenticated admin', async () => {
      process.env.ADMIN_TOKEN = 'admin-token';
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [{ current_time: new Date().toISOString() }] });

      const res = await request(app)
        .get('/api/admin/system')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(res.body.version).toBe('minimal-1.0.0');
      expect(res.body.database).toBe('Connected');
    });

    test('should return 500 when database check fails', async () => {
      process.env.ADMIN_TOKEN = 'admin-token';
      const { app, mockPool } = createApp();
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const res = await request(app)
        .get('/api/admin/system')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to get system information');
    });

    test('should include environment in response', async () => {
      process.env.ADMIN_TOKEN = 'admin-token';
      process.env.NODE_ENV = 'test';
      const { app, mockPool } = createApp();
      mockPool.query.mockResolvedValue({ rows: [{ current_time: new Date().toISOString() }] });

      const res = await request(app)
        .get('/api/admin/system')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.environment).toBe('test');
    });
  });
});

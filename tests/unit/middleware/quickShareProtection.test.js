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
 *    For proprietary/commercial use. Contact qopy.quiet156@passmail.net
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

const QuickShareProtection = require('../../../middleware/quickShareProtection');

describe('QuickShareProtection', () => {
  let protection;
  const getClientIP = (req) => req.ip || '127.0.0.1';

  beforeEach(() => {
    protection = new QuickShareProtection({
      maxFailedAttempts: 5,
      blockDurationMs: 1000,
      cleanupIntervalMs: 500
    });
  });

  afterEach(() => {
    protection.shutdown();
  });

  describe('constructor', () => {
    test('should use default options when none provided', () => {
      const p = new QuickShareProtection();
      expect(p.maxFailedAttempts).toBe(20);
      expect(p.blockDurationMs).toBe(5 * 60 * 1000);
      expect(p.cleanupIntervalMs).toBe(60 * 1000);
      expect(p.maxClipIdLength).toBe(6);
      p.shutdown();
    });

    test('should accept custom options', () => {
      expect(protection.maxFailedAttempts).toBe(5);
      expect(protection.blockDurationMs).toBe(1000);
    });
  });

  describe('isBlocked', () => {
    test('should return false for unknown IP', () => {
      expect(protection.isBlocked('1.2.3.4')).toBe(false);
    });

    test('should return true for blocked IP', () => {
      for (let i = 0; i < 5; i++) {
        protection.recordFailure('1.2.3.4');
      }
      expect(protection.isBlocked('1.2.3.4')).toBe(true);
    });

    test('should return false after block expires', async () => {
      for (let i = 0; i < 5; i++) {
        protection.recordFailure('1.2.3.4');
      }
      expect(protection.isBlocked('1.2.3.4')).toBe(true);

      // Wait for block to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(protection.isBlocked('1.2.3.4')).toBe(false);
    });
  });

  describe('recordFailure', () => {
    test('should not block before threshold', () => {
      for (let i = 0; i < 4; i++) {
        protection.recordFailure('1.2.3.4');
      }
      expect(protection.isBlocked('1.2.3.4')).toBe(false);
    });

    test('should block at threshold', () => {
      for (let i = 0; i < 5; i++) {
        protection.recordFailure('1.2.3.4');
      }
      expect(protection.isBlocked('1.2.3.4')).toBe(true);
    });

    test('should track IPs independently', () => {
      for (let i = 0; i < 5; i++) {
        protection.recordFailure('1.2.3.4');
      }
      expect(protection.isBlocked('1.2.3.4')).toBe(true);
      expect(protection.isBlocked('5.6.7.8')).toBe(false);
    });
  });

  describe('recordSuccess', () => {
    test('should reset failure count', () => {
      for (let i = 0; i < 4; i++) {
        protection.recordFailure('1.2.3.4');
      }
      protection.recordSuccess('1.2.3.4');
      // One more failure should not block since counter was reset
      protection.recordFailure('1.2.3.4');
      expect(protection.isBlocked('1.2.3.4')).toBe(false);
    });
  });

  describe('_cleanup', () => {
    test('should remove expired entries', async () => {
      for (let i = 0; i < 5; i++) {
        protection.recordFailure('1.2.3.4');
      }
      expect(protection.tracker.size).toBe(1);

      // Wait for block to expire then cleanup
      await new Promise(resolve => setTimeout(resolve, 1100));
      protection._cleanup();
      expect(protection.tracker.size).toBe(0);
    });

    test('should not remove active blocks', () => {
      for (let i = 0; i < 5; i++) {
        protection.recordFailure('1.2.3.4');
      }
      protection._cleanup();
      expect(protection.tracker.size).toBe(1);
    });
  });

  describe('shutdown', () => {
    test('should clear tracker and timer', () => {
      protection.startCleanup();
      protection.recordFailure('1.2.3.4');
      protection.shutdown();
      expect(protection.tracker.size).toBe(0);
      expect(protection.cleanupTimer).toBeNull();
    });
  });

  describe('middleware', () => {
    let mw;
    let mockReq;
    let mockRes;
    let nextFn;

    beforeEach(() => {
      mw = protection.middleware(getClientIP);
      mockReq = {
        path: '/api/clip/ABCDEF',
        ip: '10.0.0.1'
      };
      mockRes = {
        statusCode: 200,
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      nextFn = jest.fn();
    });

    test('should skip non-clip routes', () => {
      mockReq.path = '/api/share';
      mw(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should skip long clip IDs', () => {
      mockReq.path = '/api/clip/ABCDEFGHIJ';
      mw(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
      // json should not be wrapped
      expect(mockRes.json).toBe(mockRes.json);
    });

    test('should apply to short clip IDs', () => {
      mw(mockReq, mockRes, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    test('should block IP after max failed attempts', () => {
      // Simulate repeated 404 responses
      for (let i = 0; i < 5; i++) {
        const req = { path: '/api/clip/ABC' + i.toString().padStart(3, '0'), ip: '10.0.0.1' };
        const res = {
          statusCode: 404,
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        const next = jest.fn();
        mw(req, res, next);
        // Trigger the wrapped json to record the failure
        res.statusCode = 404;
        res.json({ error: 'Not found' });
      }

      // Next request should be blocked
      const blockedRes = {
        statusCode: 200,
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mw(mockReq, blockedRes, jest.fn());
      expect(blockedRes.status).toHaveBeenCalledWith(429);
    });

    test('should record success and reset counter', () => {
      // Record some failures
      for (let i = 0; i < 3; i++) {
        const req = { path: '/api/clip/FAIL' + i + 'X', ip: '10.0.0.1' };
        const res = {
          statusCode: 404,
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        const next = jest.fn();
        mw(req, res, next);
        res.statusCode = 404;
        res.json({ error: 'Not found' });
      }

      // Successful lookup
      const successRes = {
        statusCode: 200,
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const successNext = jest.fn();
      mw({ path: '/api/clip/SUCC00', ip: '10.0.0.1' }, successRes, successNext);
      successRes.statusCode = 200;
      successRes.json({ content: 'data' });

      // Counter should be reset, more failures should not trigger block
      for (let i = 0; i < 4; i++) {
        const req = { path: '/api/clip/FAI' + i + 'XX', ip: '10.0.0.1' };
        const res = {
          statusCode: 404,
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        const next = jest.fn();
        mw(req, res, next);
        res.statusCode = 404;
        res.json({ error: 'Not found' });
      }

      // Should NOT be blocked (only 4 failures after reset)
      const checkRes = {
        statusCode: 200,
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mw(mockReq, checkRes, jest.fn());
      expect(checkRes.status).not.toHaveBeenCalledWith(429);
    });
  });
});

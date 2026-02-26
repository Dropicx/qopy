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

// Mock TokenService before requiring AccessValidator
jest.mock('../../../services/TokenService', () => {
  return jest.fn().mockImplementation(() => ({
    validateAccessCode: jest.fn()
  }));
});

const AccessValidator = require('../../../services/AccessValidator');
const TokenService = require('../../../services/TokenService');

// Mock console methods to avoid spam during tests
const mockConsole = {
  log: jest.fn(),
  error: jest.fn()
};

beforeAll(() => {
  global.console = mockConsole;
});

afterAll(() => {
  global.console = require('console');
});

describe('AccessValidator', () => {
  let accessValidator;
  let mockPool;
  let mockTokenService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      query: jest.fn()
    };

    accessValidator = new AccessValidator(mockPool);
    // Grab the mocked tokenService instance created in the constructor
    mockTokenService = accessValidator.tokenService;
  });

  describe('Constructor and Dependency Injection', () => {
    test('should initialize with pool dependency', () => {
      expect(accessValidator.pool).toBe(mockPool);
    });

    test('should create a TokenService instance', () => {
      expect(TokenService).toHaveBeenCalled();
      expect(accessValidator.tokenService).toBeDefined();
    });

    test('should extend BaseService', () => {
      expect(accessValidator.name).toBe('AccessValidator');
      expect(typeof accessValidator.log).toBe('function');
      expect(typeof accessValidator.logError).toBe('function');
      expect(typeof accessValidator.logSuccess).toBe('function');
    });

    test('should accept different pool instances', () => {
      const pool1 = { query: jest.fn() };
      const pool2 = { query: jest.fn() };
      const validator1 = new AccessValidator(pool1);
      const validator2 = new AccessValidator(pool2);

      expect(validator1.pool).toBe(pool1);
      expect(validator2.pool).toBe(pool2);
      expect(validator1.pool).not.toBe(validator2.pool);
    });
  });

  describe('checkAccessRequirement', () => {
    test('should return exists=true and requiresAccess=true when clip requires access code', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ requires_access_code: true }]
      });

      const result = await accessValidator.checkAccessRequirement('abc1234567');

      expect(result).toEqual({
        exists: true,
        requiresAccess: true
      });
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT requires_access_code FROM clips WHERE clip_id = $1 AND is_expired = false',
        ['abc1234567']
      );
    });

    test('should return exists=true and requiresAccess=false when clip does not require access code', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ requires_access_code: false }]
      });

      const result = await accessValidator.checkAccessRequirement('abc1234567');

      expect(result).toEqual({
        exists: true,
        requiresAccess: false
      });
    });

    test('should return exists=false when clip is not found', async () => {
      mockPool.query.mockResolvedValue({
        rows: []
      });

      const result = await accessValidator.checkAccessRequirement('nonexistent');

      expect(result).toEqual({
        exists: false,
        requiresAccess: false
      });
    });

    test('should return requiresAccess as null when requires_access_code is null', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ requires_access_code: null }]
      });

      const result = await accessValidator.checkAccessRequirement('abc1234567');

      expect(result.exists).toBe(true);
      // requiresAccess is falsy (null) - callers should treat as no access required
      expect(result.requiresAccess).toBeFalsy();
    });

    test('should return requiresAccess as falsy when requires_access_code is undefined', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{}]
      });

      const result = await accessValidator.checkAccessRequirement('abc1234567');

      expect(result.exists).toBe(true);
      // requiresAccess is falsy (undefined) - callers should treat as no access required
      expect(result.requiresAccess).toBeFalsy();
    });

    test('should throw wrapped error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      await expect(accessValidator.checkAccessRequirement('abc1234567'))
        .rejects.toThrow('Failed to check access requirement');
    });

    test('should log error on database failure', async () => {
      const dbError = new Error('Connection timeout');
      mockPool.query.mockRejectedValue(dbError);

      try {
        await accessValidator.checkAccessRequirement('abc1234567');
      } catch (e) {
        // expected
      }

      expect(mockConsole.error).toHaveBeenCalled();
    });

    test('should query with correct SQL and parameters', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await accessValidator.checkAccessRequirement('test-id');

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('is_expired = false');
      expect(params).toEqual(['test-id']);
    });
  });

  describe('validateAccess', () => {
    describe('Quick Share Clips (clipId length <= 6)', () => {
      test('should allow access to valid quick share without authentication', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ quick_share: true }]
        });

        const result = await accessValidator.validateAccess('abc123', null);

        expect(result).toEqual({ valid: true, isQuickShare: true });
      });

      test('should return 404 when short clip ID is not found', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await accessValidator.validateAccess('xyz789', null);

        expect(result).toEqual({
          valid: false,
          error: 'Clip not found',
          statusCode: 404
        });
      });

      test('should fall through to normal validation for short non-quick-share clip', async () => {
        // First query: quick share check returns non-quick-share
        mockPool.query.mockResolvedValueOnce({
          rows: [{ quick_share: false }]
        });
        // Second query: checkAccessRequirement
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: false }]
        });

        const result = await accessValidator.validateAccess('abc123', null);

        expect(result).toEqual({ valid: true, isQuickShare: false });
        expect(mockPool.query).toHaveBeenCalledTimes(2);
      });

      test('should check expiration for quick share clips', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ quick_share: true }]
        });

        await accessValidator.validateAccess('abc123', null);

        const [sql, params] = mockPool.query.mock.calls[0];
        expect(sql).toContain('expiration_time > $2');
        expect(sql).toContain('is_expired = false');
        expect(params[0]).toBe('abc123');
        expect(typeof params[1]).toBe('number');
      });

      test('should handle exactly 6 character clip IDs as quick share candidates', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ quick_share: true }]
        });

        const result = await accessValidator.validateAccess('abcdef', null);

        expect(result).toEqual({ valid: true, isQuickShare: true });
      });

      test('should handle single character clip IDs', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ quick_share: true }]
        });

        const result = await accessValidator.validateAccess('a', null);

        expect(result).toEqual({ valid: true, isQuickShare: true });
      });

      test('should return 404 for expired quick share clips', async () => {
        // The query filters by expiration_time, so expired clips return no rows
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await accessValidator.validateAccess('abc123', null);

        expect(result).toEqual({
          valid: false,
          error: 'Clip not found',
          statusCode: 404
        });
      });
    });

    describe('Normal Clips (clipId length > 6)', () => {
      test('should allow access when clip exists and does not require access code', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: false }]
        });

        const result = await accessValidator.validateAccess('abc1234567', null);

        expect(result).toEqual({ valid: true, isQuickShare: false });
      });

      test('should return 404 when normal clip is not found', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await accessValidator.validateAccess('nonexist10', null);

        expect(result).toEqual({
          valid: false,
          error: 'Clip not found',
          statusCode: 404
        });
      });

      test('should return 401 when access code is required but not provided', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: true }]
        });

        const result = await accessValidator.validateAccess('abc1234567', null);

        expect(result).toEqual({
          valid: false,
          error: 'Access code required',
          message: 'This file requires an access code',
          statusCode: 401
        });
      });

      test('should return 401 when access code is required but empty string provided', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: true }]
        });

        const result = await accessValidator.validateAccess('abc1234567', '');

        expect(result).toEqual({
          valid: false,
          error: 'Access code required',
          message: 'This file requires an access code',
          statusCode: 401
        });
      });

      test('should return 401 when access code is required but undefined provided', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: true }]
        });

        const result = await accessValidator.validateAccess('abc1234567', undefined);

        expect(result).toEqual({
          valid: false,
          error: 'Access code required',
          message: 'This file requires an access code',
          statusCode: 401
        });
      });

      test('should skip quick share check for 7+ character clip IDs', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: false }]
        });

        await accessValidator.validateAccess('abcdefg', null);

        // Should only query checkAccessRequirement, not quick share check
        expect(mockPool.query).toHaveBeenCalledTimes(1);
        const [sql] = mockPool.query.mock.calls[0];
        expect(sql).toContain('requires_access_code');
        expect(sql).not.toContain('quick_share');
      });

      test('should handle exactly 7 character clip IDs as normal clips', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: false }]
        });

        const result = await accessValidator.validateAccess('abcdefg', null);

        expect(result).toEqual({ valid: true, isQuickShare: false });
        // Should NOT do quick share lookup
        const [sql] = mockPool.query.mock.calls[0];
        expect(sql).not.toContain('quick_share');
      });
    });

    describe('Access Code Validation', () => {
      beforeEach(() => {
        // First call: checkAccessRequirement
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
      });

      test('should validate correct access code and return valid=true', async () => {
        // Second call: fetch access_code_hash
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'stored-hash-abc', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(true);

        const result = await accessValidator.validateAccess('abc1234567', 'my-secret-code');

        expect(result).toEqual({ valid: true, isQuickShare: false });
        expect(mockTokenService.validateAccessCode).toHaveBeenCalledWith('my-secret-code', 'stored-hash-abc');
      });

      test('should reject invalid access code with 401', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'stored-hash-abc', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(false);

        const result = await accessValidator.validateAccess('abc1234567', 'wrong-code');

        expect(result).toEqual({
          valid: false,
          error: 'Access denied',
          message: 'Invalid access code',
          statusCode: 401
        });
      });

      test('should return 404 when clip disappears between checks', async () => {
        // Second query returns no rows (clip was deleted between queries)
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const result = await accessValidator.validateAccess('abc1234567', 'my-code');

        expect(result).toEqual({
          valid: false,
          error: 'Clip not found',
          message: 'The requested clip does not exist',
          statusCode: 404
        });
      });

      test('should return 401 when access code hash is missing from database', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: null, requires_access_code: true }]
        });

        const result = await accessValidator.validateAccess('abc1234567', 'my-code');

        expect(result).toEqual({
          valid: false,
          error: 'Access denied',
          message: 'Invalid access code configuration',
          statusCode: 401
        });
      });

      test('should return 401 when access code hash is empty string', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: '', requires_access_code: true }]
        });

        const result = await accessValidator.validateAccess('abc1234567', 'my-code');

        expect(result).toEqual({
          valid: false,
          error: 'Access denied',
          message: 'Invalid access code configuration',
          statusCode: 401
        });
      });

      test('should return 401 when access code hash is undefined', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });

        const result = await accessValidator.validateAccess('abc1234567', 'my-code');

        expect(result).toEqual({
          valid: false,
          error: 'Access denied',
          message: 'Invalid access code configuration',
          statusCode: 401
        });
      });

      test('should pass correct arguments to tokenService.validateAccessCode', async () => {
        const storedHash = 'a'.repeat(128);
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: storedHash, requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(true);

        await accessValidator.validateAccess('abc1234567', 'user-provided-code');

        expect(mockTokenService.validateAccessCode).toHaveBeenCalledTimes(1);
        expect(mockTokenService.validateAccessCode).toHaveBeenCalledWith('user-provided-code', storedHash);
      });

      test('should not call tokenService when access code hash is missing', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: null, requires_access_code: true }]
        });

        await accessValidator.validateAccess('abc1234567', 'my-code');

        expect(mockTokenService.validateAccessCode).not.toHaveBeenCalled();
      });
    });

    describe('Quick Share Fallthrough to Normal Validation with Access Code', () => {
      test('should validate access code for short non-quick-share clip that requires it', async () => {
        // First query: quick share check - not a quick share
        mockPool.query.mockResolvedValueOnce({
          rows: [{ quick_share: false }]
        });
        // Second query: checkAccessRequirement
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
        // Third query: fetch access_code_hash
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'hash123', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(true);

        const result = await accessValidator.validateAccess('abc123', 'secret');

        expect(result).toEqual({ valid: true, isQuickShare: false });
        expect(mockPool.query).toHaveBeenCalledTimes(3);
      });
    });

    describe('Error Handling', () => {
      test('should return 500 on database error during validateAccess', async () => {
        mockPool.query.mockRejectedValue(new Error('Database connection lost'));

        const result = await accessValidator.validateAccess('abc1234567', 'code');

        expect(result).toEqual({
          valid: false,
          error: 'Internal server error',
          message: 'Failed to validate access code',
          statusCode: 500
        });
      });

      test('should return 500 on database error during quick share check', async () => {
        mockPool.query.mockRejectedValue(new Error('Query timeout'));

        const result = await accessValidator.validateAccess('abc123', null);

        expect(result).toEqual({
          valid: false,
          error: 'Internal server error',
          message: 'Failed to validate access code',
          statusCode: 500
        });
      });

      test('should return 500 when tokenService throws during validation', async () => {
        // checkAccessRequirement
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
        // fetch access_code_hash
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'valid-hash', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockRejectedValue(new Error('Crypto failure'));

        const result = await accessValidator.validateAccess('abc1234567', 'code');

        expect(result).toEqual({
          valid: false,
          error: 'Internal server error',
          message: 'Failed to validate access code',
          statusCode: 500
        });
      });

      test('should log error on internal failure', async () => {
        mockPool.query.mockRejectedValue(new Error('Pool exhausted'));

        await accessValidator.validateAccess('abc1234567', 'code');

        expect(mockConsole.error).toHaveBeenCalled();
      });

      test('should never expose internal error details in response', async () => {
        const sensitiveError = new Error('Connection to 192.168.1.100:5432 refused, password=secret123');
        mockPool.query.mockRejectedValue(sensitiveError);

        const result = await accessValidator.validateAccess('abc1234567', 'code');

        expect(result.error).toBe('Internal server error');
        expect(result.message).toBe('Failed to validate access code');
        expect(JSON.stringify(result)).not.toContain('192.168.1.100');
        expect(JSON.stringify(result)).not.toContain('secret123');
      });
    });

    describe('Edge Cases', () => {
      test('should handle null clipId gracefully', async () => {
        // clipId.length will throw on null, should be caught by try/catch
        const result = await accessValidator.validateAccess(null, null);

        expect(result.valid).toBe(false);
        expect(result.statusCode).toBe(500);
      });

      test('should handle undefined clipId gracefully', async () => {
        const result = await accessValidator.validateAccess(undefined, null);

        expect(result.valid).toBe(false);
        expect(result.statusCode).toBe(500);
      });

      test('should handle empty string clipId', async () => {
        // Empty string has length 0, so it enters the quick share path
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await accessValidator.validateAccess('', null);

        expect(result.valid).toBe(false);
        expect(result.statusCode).toBe(404);
      });

      test('should handle very long clip IDs', async () => {
        const longId = 'a'.repeat(1000);
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await accessValidator.validateAccess(longId, null);

        expect(result).toEqual({
          valid: false,
          error: 'Clip not found',
          statusCode: 404
        });
      });

      test('should handle special characters in clip ID', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: false }]
        });

        const result = await accessValidator.validateAccess('abc-def_123', null);

        expect(result).toEqual({ valid: true, isQuickShare: false });
      });

      test('should handle concurrent access validations', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: false }]
        });

        const promises = Array(10).fill(null).map((_, i) =>
          accessValidator.validateAccess(`clip${i}abcd`, null)
        );

        const results = await Promise.all(promises);

        results.forEach(result => {
          expect(result).toEqual({ valid: true, isQuickShare: false });
        });
      });
    });

    describe('Security-Critical Behavior', () => {
      test('should not leak clip existence through timing on access code failure', async () => {
        // When a clip requires access code and wrong code is given,
        // it should return 401, not 404
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'stored-hash', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(false);

        const result = await accessValidator.validateAccess('abc1234567', 'wrong-code');

        expect(result.statusCode).toBe(401);
        expect(result.error).toBe('Access denied');
      });

      test('should not reveal whether access code is required in 404 responses', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await accessValidator.validateAccess('nonexist10', 'any-code');

        // Should only say "Clip not found", not reveal anything about access codes
        expect(result.statusCode).toBe(404);
        expect(result.error).toBe('Clip not found');
      });

      test('should never include access code or hash in response', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'super-secret-hash', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(false);

        const result = await accessValidator.validateAccess('abc1234567', 'my-secret-code');

        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('super-secret-hash');
        expect(serialized).not.toContain('my-secret-code');
      });

      test('should use parameterized queries to prevent SQL injection', async () => {
        const maliciousId = "'; DROP TABLE clips; --";
        mockPool.query.mockResolvedValue({ rows: [] });

        await accessValidator.validateAccess(maliciousId, null);

        // Verify parameterized query was used (value passed as parameter, not inline)
        const [sql, params] = mockPool.query.mock.calls[0];
        expect(params).toContain(maliciousId);
        expect(sql).not.toContain(maliciousId);
      });

      test('should properly differentiate 401 vs 404 status codes', async () => {
        // 404 for non-existent clip
        mockPool.query.mockResolvedValue({ rows: [] });
        const notFound = await accessValidator.validateAccess('abc1234567', null);
        expect(notFound.statusCode).toBe(404);

        jest.clearAllMocks();

        // 401 for existing clip with missing access code
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: true }]
        });
        const unauthorized = await accessValidator.validateAccess('abc1234567', null);
        expect(unauthorized.statusCode).toBe(401);
      });
    });

    describe('Logging Behavior', () => {
      test('should log quick share download access', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ quick_share: true }]
        });

        await accessValidator.validateAccess('abc123', null);

        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Quick Share download'),
          expect.any(Object)
        );
      });

      test('should log normal clip access check', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: false }]
        });

        await accessValidator.validateAccess('abc1234567', null);

        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Normal clip download'),
          expect.any(Object)
        );
      });

      test('should log when access code is required but not provided', async () => {
        mockPool.query.mockResolvedValue({
          rows: [{ requires_access_code: true }]
        });

        await accessValidator.validateAccess('abc1234567', null);

        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Access code required but not provided'),
          expect.any(Object)
        );
      });

      test('should log successful access code validation', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'hash', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(true);

        await accessValidator.validateAccess('abc1234567', 'valid-code');

        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Access code validated'),
          expect.any(Object)
        );
      });

      test('should log invalid access code attempt', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'hash', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(false);

        await accessValidator.validateAccess('abc1234567', 'bad-code');

        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Invalid access code'),
          expect.any(Object)
        );
      });

      test('should not log plaintext access codes', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'hash', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(false);

        await accessValidator.validateAccess('abc1234567', 'super-secret-password');

        // Check that no log call contains the plaintext access code
        const allLogCalls = [...mockConsole.log.mock.calls, ...mockConsole.error.mock.calls];
        allLogCalls.forEach(call => {
          const serialized = JSON.stringify(call);
          expect(serialized).not.toContain('super-secret-password');
        });
      });
    });

    describe('BaseService Integration', () => {
      test('should track error metrics on failures', async () => {
        mockPool.query.mockRejectedValue(new Error('DB error'));

        await accessValidator.validateAccess('abc1234567', null);

        expect(accessValidator.metrics.errors).toBeGreaterThan(0);
      });

      test('should track success metrics on successful validation', async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [{ requires_access_code: true }]
        });
        mockPool.query.mockResolvedValueOnce({
          rows: [{ access_code_hash: 'hash', requires_access_code: true }]
        });
        mockTokenService.validateAccessCode.mockResolvedValue(true);

        await accessValidator.validateAccess('abc1234567', 'valid-code');

        expect(accessValidator.metrics.successes).toBeGreaterThan(0);
      });

      test('should have getMetrics available', () => {
        const metrics = accessValidator.getMetrics();

        expect(metrics.service).toBe('AccessValidator');
        expect(typeof metrics.uptime).toBe('number');
        expect(typeof metrics.operations).toBe('number');
        expect(typeof metrics.errors).toBe('number');
        expect(typeof metrics.successes).toBe('number');
      });
    });
  });
});

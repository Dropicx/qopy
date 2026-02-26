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

// Mock console methods to avoid spam during tests
const mockConsole = {
  log: jest.fn(),
  error: jest.fn()
};

beforeAll(() => {
  process.env.PBKDF2_SALT = 'test-salt';
  global.console = mockConsole;
});

afterAll(() => {
  delete process.env.PBKDF2_SALT;
  global.console = require('console');
});

const TokenService = require('../../../services/TokenService');

describe('TokenService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PBKDF2_SALT = 'test-salt';
    service = new TokenService();
  });

  describe('Constructor', () => {
    test('should initialize with PBKDF2_SALT from environment', () => {
      expect(service.salt).toBe('test-salt');
      expect(service.iterations).toBe(100000);
      expect(service.keyLength).toBe(64);
      expect(service.algorithm).toBe('sha512');
    });

    test('should throw if PBKDF2_SALT environment variable is not set', () => {
      const originalSalt = process.env.PBKDF2_SALT;
      delete process.env.PBKDF2_SALT;

      expect(() => new TokenService()).toThrow('PBKDF2_SALT environment variable is required');

      process.env.PBKDF2_SALT = originalSalt;
    });

    test('should inherit from BaseService', () => {
      const BaseService = require('../../../services/core/BaseService');
      expect(service).toBeInstanceOf(BaseService);
    });

    test('should have service name set to TokenService', () => {
      expect(service.name).toBe('TokenService');
    });
  });

  describe('generateHash', () => {
    test('should return a hex string of 128 characters (64 bytes)', async () => {
      const hash = await service.generateHash('my-access-code');

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(128);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    test('should produce consistent hashes for the same input', async () => {
      const hash1 = await service.generateHash('same-input');
      const hash2 = await service.generateHash('same-input');

      expect(hash1).toBe(hash2);
    });

    test('should produce different hashes for different inputs', async () => {
      const hash1 = await service.generateHash('input-one');
      const hash2 = await service.generateHash('input-two');

      expect(hash1).not.toBe(hash2);
    });

    test('should produce different hashes with different salts', async () => {
      const hash1 = await service.generateHash('same-input');

      process.env.PBKDF2_SALT = 'different-salt';
      const service2 = new TokenService();
      const hash2 = await service2.generateHash('same-input');

      expect(hash1).not.toBe(hash2);

      // Restore original salt
      process.env.PBKDF2_SALT = 'test-salt';
    });

    test('should handle empty string input', async () => {
      const hash = await service.generateHash('');

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(128);
    });

    test('should handle very long input strings', async () => {
      const longInput = 'a'.repeat(10000);
      const hash = await service.generateHash(longInput);

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(128);
    });

    test('should handle special characters in input', async () => {
      const specialInput = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      const hash = await service.generateHash(specialInput);

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(128);
    });

    test('should handle unicode characters in input', async () => {
      const unicodeInput = '\u00e9\u00e8\u00ea\u00eb\u00f1\u00fc\u00e4\u00f6';
      const hash = await service.generateHash(unicodeInput);

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(128);
    });
  });

  describe('isAlreadyHashed', () => {
    test('should return true for a valid 128-char lowercase hex string', () => {
      const validHash = 'a'.repeat(128);
      expect(service.isAlreadyHashed(validHash)).toBe(true);
    });

    test('should return true for a valid 128-char uppercase hex string', () => {
      const validHash = 'A'.repeat(128);
      expect(service.isAlreadyHashed(validHash)).toBe(true);
    });

    test('should return true for a valid 128-char mixed-case hex string', () => {
      const validHash = 'aAbBcCdDeEfF0123456789'.repeat(6).substring(0, 128);
      expect(service.isAlreadyHashed(validHash)).toBe(true);
    });

    test('should return true for output of generateHash', async () => {
      const hash = await service.generateHash('test-code');
      expect(service.isAlreadyHashed(hash)).toBe(true);
    });

    test('should return false for strings shorter than 128 characters', () => {
      expect(service.isAlreadyHashed('a'.repeat(127))).toBe(false);
      expect(service.isAlreadyHashed('abc123')).toBe(false);
      expect(service.isAlreadyHashed('')).toBe(false);
    });

    test('should return false for strings longer than 128 characters', () => {
      expect(service.isAlreadyHashed('a'.repeat(129))).toBe(false);
      expect(service.isAlreadyHashed('a'.repeat(256))).toBe(false);
    });

    test('should return false for 128-char strings with non-hex characters', () => {
      const invalidHash = 'g'.repeat(128);
      expect(service.isAlreadyHashed(invalidHash)).toBe(false);
    });

    test('should return false for 128-char strings with spaces', () => {
      const withSpaces = 'a'.repeat(127) + ' ';
      expect(service.isAlreadyHashed(withSpaces)).toBe(false);
    });

    test('should return false for plaintext access codes', () => {
      expect(service.isAlreadyHashed('my-secret-password')).toBe(false);
      expect(service.isAlreadyHashed('simple123')).toBe(false);
    });
  });

  describe('validateAccessCode', () => {
    let storedHash;

    beforeEach(async () => {
      storedHash = await service.generateHash('correct-code');
    });

    test('should return true for a correct plaintext access code', async () => {
      const result = await service.validateAccessCode('correct-code', storedHash);
      expect(result).toBe(true);
    });

    test('should return false for an incorrect plaintext access code', async () => {
      const result = await service.validateAccessCode('wrong-code', storedHash);
      expect(result).toBe(false);
    });

    test('should return true for a pre-hashed access code matching stored hash', async () => {
      // The stored hash itself is already a valid 128-char hex string
      const result = await service.validateAccessCode(storedHash, storedHash);
      expect(result).toBe(true);
    });

    test('should return false for a pre-hashed code that does not match', async () => {
      const differentHash = await service.generateHash('different-code');
      const result = await service.validateAccessCode(differentHash, storedHash);
      expect(result).toBe(false);
    });

    test('should use timing-safe comparison', async () => {
      const crypto = require('crypto');
      const timingSafeEqualSpy = jest.spyOn(crypto, 'timingSafeEqual');

      await service.validateAccessCode('correct-code', storedHash);

      expect(timingSafeEqualSpy).toHaveBeenCalled();
      timingSafeEqualSpy.mockRestore();
    });

    test('should log client-side hash usage in non-production', async () => {
      process.env.NODE_ENV = 'development';
      await service.validateAccessCode(storedHash, storedHash);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Using client-side hashed access code'),
        expect.any(Object)
      );
      delete process.env.NODE_ENV;
    });

    test('should log server-side hash generation in non-production', async () => {
      process.env.NODE_ENV = 'development';
      await service.validateAccessCode('plaintext-code', storedHash);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Generating server-side access code hash'),
        expect.any(Object)
      );
      delete process.env.NODE_ENV;
    });

    test('should not log in production mode', async () => {
      process.env.NODE_ENV = 'production';
      jest.clearAllMocks();

      await service.validateAccessCode('correct-code', storedHash);

      expect(mockConsole.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Generating server-side access code hash'),
        expect.any(Object)
      );
      expect(mockConsole.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Using client-side hashed access code'),
        expect.any(Object)
      );
      delete process.env.NODE_ENV;
    });

    test('should return false when an error occurs', async () => {
      // Force an error by passing mismatched buffer lengths indirectly
      // timingSafeEqual throws if buffers differ in length
      const shortHash = 'abc';
      const result = await service.validateAccessCode('test', shortHash);
      expect(result).toBe(false);
    });

    test('should log error when validation fails with exception', async () => {
      // Force generateHash to reject so the catch block is triggered
      const originalGenerateHash = service.generateHash.bind(service);
      service.generateHash = jest.fn().mockRejectedValue(new Error('hash failure'));

      const result = await service.validateAccessCode('plaintext', storedHash);

      expect(result).toBe(false);
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error validating access code'),
        expect.any(Object)
      );

      service.generateHash = originalGenerateHash;
    });

    test('should handle empty string access code', async () => {
      const emptyHash = await service.generateHash('');
      const result = await service.validateAccessCode('', emptyHash);
      expect(result).toBe(true);
    });

    test('should handle concurrent validations', async () => {
      const codes = ['code-1', 'code-2', 'code-3', 'code-4', 'code-5'];
      const hashes = await Promise.all(codes.map(c => service.generateHash(c)));

      const results = await Promise.all(
        codes.map((code, i) => service.validateAccessCode(code, hashes[i]))
      );

      results.forEach(result => {
        expect(result).toBe(true);
      });
    });

    test('should reject cross-matched codes and hashes', async () => {
      const hash1 = await service.generateHash('code-1');
      const hash2 = await service.generateHash('code-2');

      const result1 = await service.validateAccessCode('code-1', hash2);
      const result2 = await service.validateAccessCode('code-2', hash1);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe('Performance', () => {
    test('should generate a hash within reasonable time', async () => {
      const startTime = process.hrtime.bigint();
      await service.generateHash('performance-test');
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1_000_000;
      // PBKDF2 with 100k iterations should be under 2 seconds
      expect(durationMs).toBeLessThan(2000);
    });

    test('should handle multiple sequential hash operations', async () => {
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(await service.generateHash(`input-${i}`));
      }

      // All results should be unique
      const unique = new Set(results);
      expect(unique.size).toBe(5);
    });
  });
});

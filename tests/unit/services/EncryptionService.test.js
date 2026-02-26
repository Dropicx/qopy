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

const EncryptionService = require('../../../services/EncryptionService');

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

describe('EncryptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processAccessCode', () => {
    describe('Quick Share Scenarios', () => {
      test('should handle Quick Share with access code', () => {
        const session = {
          upload_id: 'upload-123',
          has_password: false,
          quick_share: true
        };

        const requestData = {
          quickShareSecret: 'quick-secret-123',
          clientAccessCodeHash: 'client-hash-456',
          requiresAccessCode: true
        };

        const result = EncryptionService.processAccessCode(session, requestData);

        expect(result).toBeDefined();
        expect(typeof result).toBe('object');

        // Verify simplified logging occurred (no sensitive data)
        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Processing access code for upload:'),
          'upload-123'
        );
      });

      test('should handle Quick Share without access code', () => {
        const session = {
          upload_id: 'upload-456',
          has_password: false,
          quick_share: true
        };

        const requestData = {
          quickShareSecret: 'quick-secret-456',
          requiresAccessCode: false
        };

        const result = EncryptionService.processAccessCode(session, requestData);

        expect(result).toBeDefined();
        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Processing access code for upload:'),
          'upload-456'
        );
      });

      test('should handle Quick Share with empty secret', () => {
        const session = {
          upload_id: 'upload-789',
          has_password: false,
          quick_share: true
        };

        const requestData = {
          quickShareSecret: '',
          requiresAccessCode: false
        };

        const result = EncryptionService.processAccessCode(session, requestData);

        expect(result).toBeDefined();
        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Processing access code for upload:'),
          'upload-789'
        );
      });
    });

    describe('Regular Upload Scenarios', () => {
      test('should handle regular upload with password', () => {
        const session = {
          upload_id: 'regular-123',
          has_password: true,
          quick_share: false
        };

        const requestData = {
          clientAccessCodeHash: 'regular-hash-123',
          requiresAccessCode: true
        };

        const result = EncryptionService.processAccessCode(session, requestData);

        expect(result).toBeDefined();
        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Processing access code for upload:'),
          'regular-123'
        );
      });

      test('should handle regular upload without password', () => {
        const session = {
          upload_id: 'regular-456',
          has_password: false,
          quick_share: false
        };

        const requestData = {
          requiresAccessCode: false
        };

        const result = EncryptionService.processAccessCode(session, requestData);

        expect(result).toBeDefined();
        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Processing access code for upload:'),
          'regular-456'
        );
      });
    });

    describe('Access Code Hash Analysis', () => {
      test('should not log access code hash details (security)', () => {
        const session = {
          upload_id: 'hash-test-123',
          has_password: false,
          quick_share: false
        };

        const requestData = {
          clientAccessCodeHash: 'a-very-long-hash-string-for-testing',
          requiresAccessCode: true
        };

        const result = EncryptionService.processAccessCode(session, requestData);

        // Should NOT log sensitive hash details
        expect(mockConsole.log).not.toHaveBeenCalledWith(
          expect.stringContaining('Zero-Knowledge Access Code Analysis'),
          expect.any(Object)
        );
        // Should log simplified message instead
        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Processing access code for upload:'),
          'hash-test-123'
        );
      });

      test('should handle various hash lengths', () => {
        const hashLengths = [
          '',          // Empty
          'short',     // Short hash
          'a'.repeat(32), // MD5 length
          'a'.repeat(64), // SHA256 length
          'a'.repeat(128) // Longer hash
        ];

        hashLengths.forEach((hash, index) => {
          const session = {
            upload_id: `hash-length-test-${index}`,
            has_password: false,
            quick_share: false
          };

          const requestData = {
            clientAccessCodeHash: hash,
            requiresAccessCode: hash.length > 0
          };

          const result = EncryptionService.processAccessCode(session, requestData);

          expect(result).toBeDefined();
        });
      });
    });

    describe('requiresAccessCode Type Analysis', () => {
      test('should log correct upload id for boolean true', () => {
        const session = { upload_id: 'type-test-1', has_password: false, quick_share: false };
        const requestData = { requiresAccessCode: true };

        const result = EncryptionService.processAccessCode(session, requestData);

        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Processing access code for upload:'),
          'type-test-1'
        );
      });

      test('should log correct upload id for boolean false', () => {
        const session = { upload_id: 'type-test-2', has_password: false, quick_share: false };
        const requestData = { requiresAccessCode: false };

        const result = EncryptionService.processAccessCode(session, requestData);

        expect(mockConsole.log).toHaveBeenCalledWith(
          expect.stringContaining('Processing access code for upload:'),
          'type-test-2'
        );
      });

      test('should handle non-boolean types for requiresAccessCode', () => {
        const testCases = [
          { value: 'true', type: 'string' },
          { value: 1, type: 'number' },
          { value: null, type: 'object' },
          { value: undefined, type: 'undefined' },
          { value: [], type: 'object' },
          { value: {}, type: 'object' }
        ];

        testCases.forEach(({ value, type }, index) => {
          const session = {
            upload_id: `type-test-${index + 3}`,
            has_password: false,
            quick_share: false
          };
          const requestData = { requiresAccessCode: value };

          const result = EncryptionService.processAccessCode(session, requestData);

          expect(result).toBeDefined();
        });
      });
    });

    describe('Error Handling', () => {
      test('should handle missing session properties', () => {
        const incompleteSessions = [
          {},
          { upload_id: 'test' },
          { has_password: true },
          { quick_share: false },
          null,
          undefined
        ];

        incompleteSessions.forEach((session, index) => {
          const requestData = {
            quickShareSecret: 'test-secret',
            requiresAccessCode: false
          };

          expect(() => {
            const result = EncryptionService.processAccessCode(session, requestData);
            expect(result).toBeDefined();
          }).not.toThrow();
        });
      });

      test('should handle missing request data properties', () => {
        const session = {
          upload_id: 'error-test',
          has_password: false,
          quick_share: false
        };

        const incompleteRequestData = [
          {},
          { quickShareSecret: 'test' },
          { requiresAccessCode: true },
          null,
          undefined
        ];

        incompleteRequestData.forEach(requestData => {
          expect(() => {
            const result = EncryptionService.processAccessCode(session, requestData);
            expect(result).toBeDefined();
          }).not.toThrow();
        });
      });

      test('should catch and log errors during analysis', () => {
        // Create a scenario that might cause an error in logging
        const session = {
          upload_id: 'error-scenario',
          has_password: true,
          quick_share: true
        };

        // Mock console.log to throw an error
        mockConsole.log.mockImplementationOnce(() => {
          throw new Error('Logging error');
        });

        const requestData = {
          quickShareSecret: 'test-secret',
          clientAccessCodeHash: 'test-hash',
          requiresAccessCode: true
        };

        // Should not throw despite logging error
        expect(() => {
          const result = EncryptionService.processAccessCode(session, requestData);
          expect(result).toBeDefined();
        }).not.toThrow();

        // Verify error was caught and logged
        expect(mockConsole.error).toHaveBeenCalledWith(
          expect.stringContaining('Error in Zero-Knowledge Access Code Analysis'),
          expect.any(Error)
        );
      });

      test('should handle circular references in session or requestData', () => {
        const circularSession = {
          upload_id: 'circular-test',
          has_password: false,
          quick_share: false
        };
        circularSession.self = circularSession;

        const circularRequestData = {
          requiresAccessCode: true
        };
        circularRequestData.self = circularRequestData;

        expect(() => {
          const result = EncryptionService.processAccessCode(circularSession, circularRequestData);
          expect(result).toBeDefined();
        }).not.toThrow();
      });
    });

    describe('Performance Tests', () => {
      test('should process access code within reasonable time', () => {
        const session = {
          upload_id: 'perf-test',
          has_password: true,
          quick_share: false
        };

        const requestData = {
          clientAccessCodeHash: 'performance-hash',
          requiresAccessCode: true
        };

        const startTime = process.hrtime.bigint();
        const result = EncryptionService.processAccessCode(session, requestData);
        const endTime = process.hrtime.bigint();

        const durationMs = Number(endTime - startTime) / 1000000;
        expect(durationMs).toBeLessThan(50); // Should complete in less than 50ms
        expect(result).toBeDefined();
      });

      test('should handle concurrent access code processing', async () => {
        const sessions = Array(10).fill(null).map((_, i) => ({
          upload_id: `concurrent-${i}`,
          has_password: i % 2 === 0,
          quick_share: i % 3 === 0
        }));

        const requestDataArray = sessions.map((_, i) => ({
          quickShareSecret: `secret-${i}`,
          clientAccessCodeHash: `hash-${i}`,
          requiresAccessCode: i % 2 === 0
        }));

        const promises = sessions.map((session, i) =>
          Promise.resolve(EncryptionService.processAccessCode(session, requestDataArray[i]))
        );

        const results = await Promise.all(promises);

        expect(results).toHaveLength(10);
        results.forEach(result => {
          expect(result).toBeDefined();
        });
      });
    });
  });
});

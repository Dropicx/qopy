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

const UploadValidator = require('../../../services/UploadValidator');

// Mock console methods to avoid spam during tests
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

beforeAll(() => {
  global.console = mockConsole;
});

afterAll(() => {
  global.console = require('console');
});

describe('UploadValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseUploadRequest', () => {
    describe('New Text Upload System', () => {
      test('should parse new text upload system with accessCodeHash', () => {
        const requestBody = {
          accessCodeHash: 'hash123',
          requiresAccessCode: true,
          textContent: 'Sample text content',
          isTextUpload: true,
          contentType: 'text'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result).toMatchObject({
          quickShareSecret: undefined,
          clientAccessCodeHash: 'hash123',
          requiresAccessCode: true,
          textContent: 'Sample text content',
          isTextUpload: true,
          contentType: 'text'
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });

      test('should parse new text upload system with quickShareSecret', () => {
        const requestBody = {
          quickShareSecret: 'secret123',
          textContent: 'Quick share content',
          isTextUpload: true,
          contentType: 'text'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result).toMatchObject({
          quickShareSecret: 'secret123',
          textContent: 'Quick share content',
          isTextUpload: true,
          contentType: 'text'
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });

      test('should detect new system when requiresAccessCode is defined as false', () => {
        const requestBody = {
          requiresAccessCode: false,
          textContent: 'Public content',
          isTextUpload: true,
          contentType: 'text'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result).toMatchObject({
          requiresAccessCode: false,
          textContent: 'Public content',
          isTextUpload: true,
          contentType: 'text'
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });

      test('should handle new system with minimal data', () => {
        const requestBody = {
          isTextUpload: true
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result).toMatchObject({
          isTextUpload: true
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });

      test('should handle new system with all fields', () => {
        const requestBody = {
          accessCodeHash: 'complete-hash',
          requiresAccessCode: true,
          textContent: 'Complete text content',
          isTextUpload: true,
          contentType: 'text',
          quickShareSecret: 'complete-secret',
          customField: 'custom-value'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result.quickShareSecret).toBe('complete-secret');
        expect(result.clientAccessCodeHash).toBe('complete-hash');
        expect(result.requiresAccessCode).toBe(true);
        expect(result.textContent).toBe('Complete text content');
        expect(result.isTextUpload).toBe(true);
        expect(result.contentType).toBe('text');
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });
    });

    describe('Legacy File Upload System', () => {
      test('should parse legacy file upload system', () => {
        const requestBody = {
          password: 'legacy-password',
          urlSecret: 'url-secret-123'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result).toMatchObject({
          password: 'legacy-password',
          urlSecret: 'url-secret-123',
          isTextUpload: false,
          contentType: 'file',
          requiresAccessCode: true,
          clientAccessCodeHash: 'legacy-password'
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });

      test('should handle legacy system without password', () => {
        const requestBody = {
          urlSecret: 'url-secret-only'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result).toMatchObject({
          password: undefined,
          urlSecret: 'url-secret-only',
          isTextUpload: false,
          contentType: 'file',
          requiresAccessCode: false,
          clientAccessCodeHash: undefined
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });

      test('should convert legacy system to new system format', () => {
        const requestBody = {
          password: 'test-password',
          urlSecret: 'test-secret'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result.isTextUpload).toBe(false);
        expect(result.contentType).toBe('file');
        expect(result.requiresAccessCode).toBe(true);
        expect(result.clientAccessCodeHash).toBe('test-password');
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });

      test('should handle legacy system with empty password', () => {
        const requestBody = {
          password: '',
          urlSecret: 'test-secret'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result.requiresAccessCode).toBe(false);
        expect(result.clientAccessCodeHash).toBe('');
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });

      test('should handle legacy system with null password', () => {
        const requestBody = {
          password: null,
          urlSecret: 'test-secret'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result.requiresAccessCode).toBe(false);
        expect(result.clientAccessCodeHash).toBe(null);
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });
    });

    describe('Edge Cases and Error Handling', () => {
      test('should handle empty request body', () => {
        const requestBody = {};

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result).toMatchObject({
          isTextUpload: false,
          contentType: 'file',
          requiresAccessCode: false,
          clientAccessCodeHash: undefined
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });

      test('should handle null request body', () => {
        const result = UploadValidator.parseUploadRequest(null);

        expect(result).toMatchObject({
          quickShareSecret: undefined,
          clientAccessCodeHash: undefined,
          requiresAccessCode: undefined,
          textContent: undefined,
          isTextUpload: undefined,
          contentType: undefined,
          password: undefined,
          urlSecret: undefined
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });

      test('should handle undefined request body', () => {
        const result = UploadValidator.parseUploadRequest(undefined);

        expect(result).toMatchObject({
          quickShareSecret: undefined,
          clientAccessCodeHash: undefined,
          requiresAccessCode: undefined,
          textContent: undefined,
          isTextUpload: undefined,
          contentType: undefined,
          password: undefined,
          urlSecret: undefined
        });
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });

      test('should handle malformed request body', () => {
        const malformedBodies = [
          'string-instead-of-object',
          42,
          true,
          [],
          function() {}
        ];

        malformedBodies.forEach(body => {
          expect(() => {
            const result = UploadValidator.parseUploadRequest(body);
            expect(result).toBeDefined();
          }).not.toThrow();
        });
      });

      test('should handle request body with circular references', () => {
        const circularBody = { prop: 'value' };
        circularBody.self = circularBody;

        expect(() => {
          const result = UploadValidator.parseUploadRequest(circularBody);
          expect(result).toBeDefined();
        }).not.toThrow();
      });

      test('should handle destructuring errors gracefully', () => {
        const requestBody = {
          // This should trigger the catch block in parseUploadRequest
          get accessCodeHash() {
            throw new Error('Getter error');
          }
        };

        expect(() => {
          UploadValidator.parseUploadRequest(requestBody);
        }).toThrow('Getter error');

        expect(mockConsole.error).toHaveBeenCalledWith('❌ Error destructuring request body:', expect.any(Error));
      });
    });

    describe('System Detection Logic', () => {
      test('accessCodeHash should trigger new system', () => {
        const requestBody = { accessCodeHash: 'test' };
        const result = UploadValidator.parseUploadRequest(requestBody);
        
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });

      test('requiresAccessCode defined should trigger new system', () => {
        const requestBody = { requiresAccessCode: true };
        const result = UploadValidator.parseUploadRequest(requestBody);
        
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });

      test('isTextUpload should trigger new system', () => {
        const requestBody = { isTextUpload: false };
        const result = UploadValidator.parseUploadRequest(requestBody);
        
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });

      test('quickShareSecret should trigger new system', () => {
        const requestBody = { quickShareSecret: 'secret' };
        const result = UploadValidator.parseUploadRequest(requestBody);
        
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });

      test('absence of new system indicators should use legacy system', () => {
        const requestBody = { 
          someOtherField: 'value',
          password: 'test'
        };
        const result = UploadValidator.parseUploadRequest(requestBody);
        
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using OLD file upload system');
      });

      test('multiple new system indicators should all trigger new system', () => {
        const indicators = [
          { accessCodeHash: 'hash' },
          { requiresAccessCode: true },
          { requiresAccessCode: false },
          { isTextUpload: true },
          { isTextUpload: false },
          { quickShareSecret: 'secret' }
        ];

        indicators.forEach(indicator => {
          mockConsole.log.mockClear();
          UploadValidator.parseUploadRequest(indicator);
          expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
        });
      });
    });

    describe('Mixed System Scenarios', () => {
      test('should prioritize new system when both systems have indicators', () => {
        const requestBody = {
          // New system indicators
          accessCodeHash: 'new-hash',
          isTextUpload: true,
          // Legacy system indicators
          password: 'legacy-password',
          urlSecret: 'legacy-secret'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
        expect(result.clientAccessCodeHash).toBe('new-hash');
        expect(result.isTextUpload).toBe(true);
        expect(result.password).toBe('legacy-password');
        expect(result.urlSecret).toBe('legacy-secret');
      });

      test('should handle partial new system data gracefully', () => {
        const requestBody = {
          accessCodeHash: 'hash',
          // Missing other new system fields
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result.clientAccessCodeHash).toBe('hash');
        expect(result.isTextUpload).toBeUndefined();
        expect(result.contentType).toBeUndefined();
      });
    });

    describe('Data Integrity', () => {
      test('should preserve all fields from new system', () => {
        const requestBody = {
          quickShareSecret: 'secret',
          accessCodeHash: 'hash',
          requiresAccessCode: true,
          textContent: 'content',
          isTextUpload: true,
          contentType: 'text',
          customField: 'custom-value'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result.quickShareSecret).toBe('secret');
        expect(result.clientAccessCodeHash).toBe('hash');
        expect(result.requiresAccessCode).toBe(true);
        expect(result.textContent).toBe('content');
        expect(result.isTextUpload).toBe(true);
        expect(result.contentType).toBe('text');
      });

      test('should preserve all fields from legacy system', () => {
        const requestBody = {
          password: 'legacy-pwd',
          urlSecret: 'legacy-secret',
          customLegacyField: 'legacy-value'
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result.password).toBe('legacy-pwd');
        expect(result.urlSecret).toBe('legacy-secret');
        expect(result.isTextUpload).toBe(false);
        expect(result.contentType).toBe('file');
        expect(result.requiresAccessCode).toBe(true);
        expect(result.clientAccessCodeHash).toBe('legacy-pwd');
      });

      test('should handle complex nested objects', () => {
        const requestBody = {
          accessCodeHash: 'hash',
          nestedObject: {
            level1: {
              level2: 'deep-value'
            }
          },
          arrayField: [1, 2, 3]
        };

        const result = UploadValidator.parseUploadRequest(requestBody);

        expect(result.clientAccessCodeHash).toBe('hash');
        expect(mockConsole.log).toHaveBeenCalledWith('🔍 Using NEW text upload system');
      });
    });

    describe('Performance Tests', () => {
      test('should parse request within reasonable time', () => {
        const requestBody = {
          accessCodeHash: 'test-hash',
          requiresAccessCode: true,
          textContent: 'Test content',
          isTextUpload: true,
          contentType: 'text'
        };

        const startTime = process.hrtime.bigint();
        const result = UploadValidator.parseUploadRequest(requestBody);
        const endTime = process.hrtime.bigint();

        const durationMs = Number(endTime - startTime) / 1000000;
        expect(durationMs).toBeLessThan(10);
      });

      test('should handle large request bodies efficiently', () => {
        const largeContent = 'x'.repeat(10000);
        const requestBody = {
          textContent: largeContent,
          isTextUpload: true,
          accessCodeHash: 'hash-for-large-content'
        };

        const startTime = process.hrtime.bigint();
        const result = UploadValidator.parseUploadRequest(requestBody);
        const endTime = process.hrtime.bigint();

        const durationMs = Number(endTime - startTime) / 1000000;
        expect(durationMs).toBeLessThan(50);
        expect(result.textContent).toBe(largeContent);
      });

      test('should handle multiple concurrent parsing operations', () => {
        const requests = Array(100).fill(null).map((_, i) => ({
          accessCodeHash: `hash-${i}`,
          textContent: `content-${i}`,
          isTextUpload: true
        }));

        const startTime = process.hrtime.bigint();
        const results = requests.map(req => UploadValidator.parseUploadRequest(req));
        const endTime = process.hrtime.bigint();

        const durationMs = Number(endTime - startTime) / 1000000;
        expect(durationMs).toBeLessThan(100);
        expect(results).toHaveLength(100);
      });
    });
  });

  describe('validateSession', () => {
    test('should validate a complete session', () => {
      const session = {
        upload_id: 'test-upload-123',
        quick_share: true,
        has_password: false,
        one_time: true,
        is_text_content: true,
        uploaded_chunks: 1,
        total_chunks: 1,
        expiration_time: Date.now() + 60000
      };

      const result = UploadValidator.validateSession(session);

      expect(result).toBe(session);
      expect(mockConsole.log).toHaveBeenCalledWith('🔑 Upload session details:', expect.any(Object));
    });

    test('should throw error for null session', () => {
      expect(() => {
        UploadValidator.validateSession(null);
      }).toThrow('Upload session not found');
    });

    test('should throw error for undefined session', () => {
      expect(() => {
        UploadValidator.validateSession(undefined);
      }).toThrow('Upload session not found');
    });

    test('should force session structure when logging fails', () => {
      const brokenSession = {
        // Missing required fields to trigger error handling
        id: 'fallback-id'
      };

      const result = UploadValidator.validateSession(brokenSession);

      expect(result.upload_id).toBe('fallback-id');
      expect(result.quick_share).toBe(false);
      expect(result.has_password).toBe(false);
      expect(result.one_time).toBe(false);
      expect(result.is_text_content).toBe(false);
      expect(result.uploaded_chunks).toBe(0);
      expect(result.total_chunks).toBe(1);
      expect(mockConsole.error).toHaveBeenCalledWith('❌ Error logging session details:', expect.any(Error));
    });

    test('should set default expiration time when missing', () => {
      const session = {
        upload_id: 'test-upload-no-expiry'
      };

      const result = UploadValidator.validateSession(session);

      expect(result.expiration_time).toBeGreaterThan(Date.now());
      expect(result.expiration_time).toBeLessThanOrEqual(Date.now() + (24 * 60 * 60 * 1000));
      expect(mockConsole.warn).toHaveBeenCalledWith(
        '⚠️ Missing expiration_time for session test-upload-no-expiry, using 24 hours as fallback'
      );
    });

    test('should preserve existing expiration time when present', () => {
      const customExpiration = Date.now() + 120000; // 2 minutes
      const session = {
        upload_id: 'test-upload-custom-expiry',
        expiration_time: customExpiration
      };

      const result = UploadValidator.validateSession(session);

      expect(result.expiration_time).toBe(customExpiration);
      expect(mockConsole.warn).not.toHaveBeenCalled();
    });

    test('should handle session with partial data', () => {
      const session = {
        upload_id: 'partial-session',
        quick_share: true
        // Missing other fields
      };

      const result = UploadValidator.validateSession(session);

      expect(result.upload_id).toBe('partial-session');
      expect(result.quick_share).toBe(true);
      expect(result.has_password).toBe(false);
      expect(result.one_time).toBe(false);
      expect(result.is_text_content).toBe(false);
      expect(result.uploaded_chunks).toBe(0);
      expect(result.total_chunks).toBe(1);
    });

    test('should handle session with invalid data types', () => {
      const session = {
        upload_id: 123, // Should be string
        quick_share: 'true', // Should be boolean
        has_password: 1, // Should be boolean
        uploaded_chunks: '5', // Should be number
        total_chunks: '10' // Should be number
      };

      const result = UploadValidator.validateSession(session);

      expect(result.upload_id).toBe(123);
      expect(result.quick_share).toBe('true');
      expect(result.has_password).toBe(1);
      expect(result.uploaded_chunks).toBe('5');
      expect(result.total_chunks).toBe('10');
    });

    test('should handle session with circular references', () => {
      const session = {
        upload_id: 'circular-session'
      };
      session.self = session;

      expect(() => {
        const result = UploadValidator.validateSession(session);
        expect(result.upload_id).toBe('circular-session');
      }).not.toThrow();
    });

    test('should handle very large sessions', () => {
      const session = {
        upload_id: 'large-session'
      };
      
      // Add many properties
      for (let i = 0; i < 1000; i++) {
        session[`prop${i}`] = `value${i}`;
      }

      const startTime = process.hrtime.bigint();
      const result = UploadValidator.validateSession(session);
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(100);
      expect(result.upload_id).toBe('large-session');
    });
  });

  describe('validateChunks', () => {
    test('should validate complete upload', () => {
      const session = {
        uploaded_chunks: 5,
        total_chunks: 5
      };

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: 5,
        totalChunks: 5,
        isComplete: true
      });
      expect(mockConsole.log).toHaveBeenCalledWith('📝 Chunk check:', { uploadedChunks: 5, totalChunks: 5 });
    });

    test('should validate incomplete upload', () => {
      const session = {
        uploaded_chunks: 3,
        total_chunks: 5
      };

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: 3,
        totalChunks: 5,
        isComplete: false
      });
    });

    test('should handle missing uploaded_chunks', () => {
      const session = {
        total_chunks: 5
      };

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: 0,
        totalChunks: 5,
        isComplete: false
      });
    });

    test('should handle missing total_chunks', () => {
      const session = {
        uploaded_chunks: 1
      };

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: 1,
        totalChunks: 1,
        isComplete: true
      });
    });

    test('should handle missing both chunk fields', () => {
      const session = {};

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: 0,
        totalChunks: 1,
        isComplete: false
      });
    });

    test('should handle null session', () => {
      const result = UploadValidator.validateChunks(null);

      expect(result).toEqual({
        uploadedChunks: 0,
        totalChunks: 1,
        isComplete: false
      });
    });

    test('should handle undefined session', () => {
      const result = UploadValidator.validateChunks(undefined);

      expect(result).toEqual({
        uploadedChunks: 0,
        totalChunks: 1,
        isComplete: false
      });
    });

    test('should handle over-completed uploads', () => {
      const session = {
        uploaded_chunks: 7,
        total_chunks: 5
      };

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: 7,
        totalChunks: 5,
        isComplete: true
      });
    });

    test('should handle zero chunks', () => {
      const session = {
        uploaded_chunks: 0,
        total_chunks: 0
      };

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: 0,
        totalChunks: 0,
        isComplete: true
      });
    });

    test('should handle negative values', () => {
      const session = {
        uploaded_chunks: -1,
        total_chunks: -5
      };

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: -1,
        totalChunks: -5,
        isComplete: true
      });
    });

    test('should handle non-numeric values', () => {
      const session = {
        uploaded_chunks: 'five',
        total_chunks: 'ten'
      };

      const result = UploadValidator.validateChunks(session);

      expect(result.uploadedChunks).toBe('five');
      expect(result.totalChunks).toBe('ten');
      expect(result.isComplete).toBe(false); // 'five' >= 'ten' is false
    });

    test('should handle large chunk numbers', () => {
      const session = {
        uploaded_chunks: 1000000,
        total_chunks: 1000000
      };

      const result = UploadValidator.validateChunks(session);

      expect(result).toEqual({
        uploadedChunks: 1000000,
        totalChunks: 1000000,
        isComplete: true
      });
    });

    test('should perform chunk validation efficiently', () => {
      const session = {
        uploaded_chunks: 50,
        total_chunks: 100
      };

      const startTime = process.hrtime.bigint();
      for (let i = 0; i < 1000; i++) {
        UploadValidator.validateChunks(session);
      }
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(100);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle deeply nested request objects', () => {
      const deepRequest = {
        level1: {
          level2: {
            level3: {
              level4: {
                accessCodeHash: 'deep-hash'
              }
            }
          }
        },
        accessCodeHash: 'top-level-hash'
      };

      const result = UploadValidator.parseUploadRequest(deepRequest);
      expect(result.clientAccessCodeHash).toBe('top-level-hash');
    });

    test('should handle session validation with getters that throw', () => {
      const problematicSession = {
        upload_id: 'problem-session',
        get quick_share() {
          throw new Error('Getter error');
        }
      };

      // Should handle the error in session validation
      const result = UploadValidator.validateSession(problematicSession);
      expect(result.upload_id).toBe('problem-session');
      expect(mockConsole.error).toHaveBeenCalled();
    });

    test('should handle concurrent validation operations', async () => {
      const sessions = Array(50).fill(null).map((_, i) => ({
        upload_id: `concurrent-${i}`,
        uploaded_chunks: i,
        total_chunks: 50
      }));

      const startTime = process.hrtime.bigint();
      const results = sessions.map(session => {
        const validated = UploadValidator.validateSession(session);
        const chunks = UploadValidator.validateChunks(session);
        return { validated, chunks };
      });
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(200);
      expect(results).toHaveLength(50);
    });

    test('should handle memory pressure during validation', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 1000; i++) {
        const session = {
          upload_id: `memory-test-${i}`,
          uploaded_chunks: i,
          total_chunks: 1000,
          largeData: 'x'.repeat(1000)
        };

        UploadValidator.validateSession(session);
        UploadValidator.validateChunks(session);
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete upload workflow validation', () => {
      // Parse request
      const requestBody = {
        accessCodeHash: 'workflow-hash',
        requiresAccessCode: true,
        textContent: 'Workflow test content',
        isTextUpload: true,
        contentType: 'text'
      };

      const parsed = UploadValidator.parseUploadRequest(requestBody);
      expect(parsed.clientAccessCodeHash).toBe('workflow-hash');

      // Validate session
      const session = {
        upload_id: 'workflow-upload',
        quick_share: false,
        has_password: true,
        one_time: false,
        is_text_content: true,
        uploaded_chunks: 1,
        total_chunks: 1,
        expiration_time: Date.now() + 60000
      };

      const validatedSession = UploadValidator.validateSession(session);
      expect(validatedSession.upload_id).toBe('workflow-upload');

      // Validate chunks
      const chunkValidation = UploadValidator.validateChunks(validatedSession);
      expect(chunkValidation.isComplete).toBe(true);
    });

    test('should handle edge case workflow with incomplete data', () => {
      // Parse minimal request
      const requestBody = {};
      const parsed = UploadValidator.parseUploadRequest(requestBody);
      expect(parsed.contentType).toBe('file');

      // Validate minimal session
      const session = { id: 'minimal-upload' };
      const validatedSession = UploadValidator.validateSession(session);
      expect(validatedSession.upload_id).toBe('minimal-upload');

      // Validate chunks with defaults
      const chunkValidation = UploadValidator.validateChunks(validatedSession);
      expect(chunkValidation.isComplete).toBe(false);
    });
  });
});
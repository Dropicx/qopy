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

const ContentProcessor = require('../../../services/ContentProcessor');

// Mock console methods to avoid spam during tests
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
};

beforeAll(() => {
  global.console = mockConsole;
});

afterAll(() => {
  global.console = require('console');
});

describe('ContentProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateContent', () => {
    describe('Binary array content', () => {
      test('should accept valid binary array', () => {
        const result = ContentProcessor.validateContent([72, 101, 108, 108, 111]);
        expect(result).toEqual({ valid: true });
      });

      test('should reject empty array', () => {
        const result = ContentProcessor.validateContent([]);
        expect(result).toEqual({ valid: false, error: 'Content cannot be empty' });
      });

      test('should reject array exceeding 400000 elements', () => {
        const largeArray = new Array(400001).fill(0);
        const result = ContentProcessor.validateContent(largeArray);
        expect(result).toEqual({ valid: false, error: 'Content too large (max 400KB)' });
      });

      test('should accept array at exactly 400000 elements', () => {
        const maxArray = new Array(400000).fill(0);
        const result = ContentProcessor.validateContent(maxArray);
        expect(result).toEqual({ valid: true });
      });

      test('should reject array with non-number elements', () => {
        const result = ContentProcessor.validateContent([72, 'a', 108]);
        expect(result).toEqual({ valid: false, error: 'Invalid binary data format' });
      });

      test('should reject array with negative numbers', () => {
        const result = ContentProcessor.validateContent([72, -1, 108]);
        expect(result).toEqual({ valid: false, error: 'Invalid binary data format' });
      });

      test('should reject array with numbers > 255', () => {
        const result = ContentProcessor.validateContent([72, 256, 108]);
        expect(result).toEqual({ valid: false, error: 'Invalid binary data format' });
      });

      test('should accept array with floating point numbers in valid range', () => {
        // The validator only checks typeof number, >= 0, and <= 255
        // Floating point numbers like 1.5 pass these checks
        const result = ContentProcessor.validateContent([72, 1.5, 108]);
        expect(result).toEqual({ valid: true });
      });

      test('should accept array with boundary values 0 and 255', () => {
        const result = ContentProcessor.validateContent([0, 255, 128]);
        expect(result).toEqual({ valid: true });
      });

      test('should reject array with null elements', () => {
        const result = ContentProcessor.validateContent([72, null, 108]);
        expect(result).toEqual({ valid: false, error: 'Invalid binary data format' });
      });

      test('should reject array with undefined elements', () => {
        const result = ContentProcessor.validateContent([72, undefined, 108]);
        expect(result).toEqual({ valid: false, error: 'Invalid binary data format' });
      });

      test('should reject array with NaN', () => {
        const result = ContentProcessor.validateContent([72, NaN, 108]);
        expect(result).toEqual({ valid: false, error: 'Invalid binary data format' });
      });

      test('should reject array with Infinity', () => {
        const result = ContentProcessor.validateContent([72, Infinity, 108]);
        expect(result).toEqual({ valid: false, error: 'Invalid binary data format' });
      });

      test('should accept single-element array', () => {
        const result = ContentProcessor.validateContent([42]);
        expect(result).toEqual({ valid: true });
      });
    });

    describe('String content', () => {
      test('should accept valid string', () => {
        const result = ContentProcessor.validateContent('Hello, World!');
        expect(result).toEqual({ valid: true });
      });

      test('should reject empty string', () => {
        const result = ContentProcessor.validateContent('');
        expect(result).toEqual({ valid: false, error: 'Content cannot be empty' });
      });

      test('should reject string exceeding 400000 characters', () => {
        const largeString = 'a'.repeat(400001);
        const result = ContentProcessor.validateContent(largeString);
        expect(result).toEqual({ valid: false, error: 'Content too large (max 400KB)' });
      });

      test('should accept string at exactly 400000 characters', () => {
        const maxString = 'a'.repeat(400000);
        const result = ContentProcessor.validateContent(maxString);
        expect(result).toEqual({ valid: true });
      });

      test('should accept unicode string', () => {
        const result = ContentProcessor.validateContent('Hello \u4e16\u754c');
        expect(result).toEqual({ valid: true });
      });

      test('should accept base64 encoded string', () => {
        const base64 = Buffer.from('test data').toString('base64');
        const result = ContentProcessor.validateContent(base64);
        expect(result).toEqual({ valid: true });
      });

      test('should accept single character string', () => {
        const result = ContentProcessor.validateContent('a');
        expect(result).toEqual({ valid: true });
      });
    });

    describe('Invalid content types', () => {
      test('should reject number', () => {
        const result = ContentProcessor.validateContent(42);
        expect(result).toEqual({ valid: false, error: 'Content must be an array or string' });
      });

      test('should reject null', () => {
        const result = ContentProcessor.validateContent(null);
        expect(result).toEqual({ valid: false, error: 'Content must be an array or string' });
      });

      test('should reject undefined', () => {
        const result = ContentProcessor.validateContent(undefined);
        expect(result).toEqual({ valid: false, error: 'Content must be an array or string' });
      });

      test('should reject plain object', () => {
        const result = ContentProcessor.validateContent({ data: 'test' });
        expect(result).toEqual({ valid: false, error: 'Content must be an array or string' });
      });

      test('should reject boolean true', () => {
        const result = ContentProcessor.validateContent(true);
        expect(result).toEqual({ valid: false, error: 'Content must be an array or string' });
      });

      test('should reject boolean false', () => {
        const result = ContentProcessor.validateContent(false);
        expect(result).toEqual({ valid: false, error: 'Content must be an array or string' });
      });
    });
  });

  describe('processContent', () => {
    describe('Text content with contentType text', () => {
      test('should process plain text as base64-decodable content', () => {
        // Most strings are "valid" base64 in Node.js (Buffer.from doesn't throw)
        const result = ContentProcessor.processContent('Hello, World!', 'text');

        expect(result.success).toBe(true);
        expect(result.processedContent).toBeDefined();
        expect(result.filesize).toBeGreaterThan(0);
      });

      test('should process valid base64 string as binary', () => {
        const base64Content = Buffer.from('Hello, World!').toString('base64');
        const result = ContentProcessor.processContent(base64Content, 'text');

        expect(result.success).toBe(true);
        expect(result.processedContent).toBeInstanceOf(Buffer);
        expect(result.mimeType).toBe('application/octet-stream');
        expect(result.contentType).toBe('binary');
      });

      test('should handle empty base64 decode as plain text', () => {
        // An empty string decoded from base64 gives empty buffer
        // The method checks decoded.length > 0
        const result = ContentProcessor.processContent('', 'text');

        // Empty base64 decodes to empty buffer, so length is 0
        // Falls through to plain text
        expect(result.success).toBe(true);
      });
    });

    describe('Binary array content', () => {
      test('should process binary array into Buffer', () => {
        const result = ContentProcessor.processContent([72, 101, 108, 108, 111]);

        expect(result.success).toBe(true);
        expect(result.processedContent).toBeInstanceOf(Buffer);
        expect(result.processedContent.length).toBe(5);
        expect(result.mimeType).toBe('application/octet-stream');
        expect(result.filesize).toBe(5);
      });

      test('should handle single byte array', () => {
        const result = ContentProcessor.processContent([42]);

        expect(result.success).toBe(true);
        expect(result.processedContent).toBeInstanceOf(Buffer);
        expect(result.processedContent.length).toBe(1);
        expect(result.filesize).toBe(1);
      });

      test('should handle array with all zeros', () => {
        const result = ContentProcessor.processContent([0, 0, 0, 0]);

        expect(result.success).toBe(true);
        expect(result.processedContent).toBeInstanceOf(Buffer);
        expect(result.filesize).toBe(4);
      });

      test('should handle array with all 255s', () => {
        const result = ContentProcessor.processContent([255, 255, 255]);

        expect(result.success).toBe(true);
        expect(result.processedContent).toBeInstanceOf(Buffer);
        expect(result.filesize).toBe(3);
      });
    });

    describe('String content with non-text contentType', () => {
      test('should process ASCII string as plain text when binary contentType', () => {
        // ASCII string decoded as base64 then re-encoded matches ASCII pattern
        const result = ContentProcessor.processContent('Hello', 'binary');

        expect(result.success).toBe(true);
        expect(result.processedContent).toBeDefined();
      });

      test('should handle base64 binary data with binary contentType', () => {
        // Create genuine binary data that won't match ASCII
        const binaryData = Buffer.from([0x80, 0x90, 0xA0, 0xB0, 0xC0]);
        const base64 = binaryData.toString('base64');
        const result = ContentProcessor.processContent(base64, 'binary');

        expect(result.success).toBe(true);
        expect(result.processedContent).toBeInstanceOf(Buffer);
        expect(result.mimeType).toBe('application/octet-stream');
      });
    });

    describe('Default contentType parameter', () => {
      test('should default to text contentType', () => {
        const result = ContentProcessor.processContent('Hello');

        expect(result.success).toBe(true);
        // Default is 'text', so it will try base64 decode first
      });
    });

    describe('Text content edge cases', () => {
      test('should handle non-base64 text as plain text with text contentType', () => {
        // Text that cannot be meaningfully decoded as base64
        // but Buffer.from with 'base64' encoding won't throw - it just returns empty or partial
        // We need a string that decodes to empty buffer
        const result = ContentProcessor.processContent('!@#$%', 'text');

        expect(result.success).toBe(true);
      });
    });

    describe('String with non-text contentType edge cases', () => {
      test('should handle plain ASCII text with binary contentType as plain text', () => {
        // ASCII text decoded from base64 matches ASCII pattern, so treated as text
        const result = ContentProcessor.processContent('SGVsbG8=', 'binary');

        expect(result.success).toBe(true);
        // "SGVsbG8=" decodes to "Hello" which is ASCII
        expect(result.contentType).toBe('text');
        expect(result.mimeType).toBe('text/plain; charset=utf-8');
      });

      test('should handle non-base64 string with binary contentType', () => {
        // A string that cannot be decoded as base64 meaningfully
        const result = ContentProcessor.processContent('!!!', 'binary');

        expect(result.success).toBe(true);
        // Falls through to plain text
        expect(result.contentType).toBe('text');
        expect(result.mimeType).toBe('text/plain; charset=utf-8');
      });
    });

    describe('Invalid content', () => {
      test('should return error for invalid content type', () => {
        const result = ContentProcessor.processContent(12345);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid content format');
        expect(result.message).toBe('Content must be valid text or binary data.');
      });

      test('should return error for null content', () => {
        const result = ContentProcessor.processContent(null);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid content format');
      });

      test('should return error for undefined content', () => {
        const result = ContentProcessor.processContent(undefined);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid content format');
      });

      test('should return error for object content', () => {
        const result = ContentProcessor.processContent({ key: 'value' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid content format');
      });

      test('should return error for boolean content', () => {
        const result = ContentProcessor.processContent(true);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid content format');
      });

      test('should log error when processing fails', () => {
        ContentProcessor.processContent(42);

        expect(mockConsole.error).toHaveBeenCalled();
      });
    });

    describe('Return value structure', () => {
      test('should include all expected fields on success', () => {
        const result = ContentProcessor.processContent([1, 2, 3]);

        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('processedContent');
        expect(result).toHaveProperty('mimeType');
        expect(result).toHaveProperty('filesize');
        expect(result).toHaveProperty('contentType');
      });

      test('should include error fields on failure', () => {
        const result = ContentProcessor.processContent(42);

        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('error');
        expect(result).toHaveProperty('message');
      });
    });
  });

  describe('shouldStoreAsFile', () => {
    test('should return true for content over 1MB', () => {
      const largeBuffer = Buffer.alloc(1024 * 1024 + 1);
      const result = ContentProcessor.shouldStoreAsFile(largeBuffer);
      expect(result).toBe(true);
    });

    test('should return false for content under 1MB', () => {
      const smallBuffer = Buffer.alloc(1024 * 1024 - 1);
      const result = ContentProcessor.shouldStoreAsFile(smallBuffer);
      expect(result).toBe(false);
    });

    test('should return false for content at exactly 1MB', () => {
      const exactBuffer = Buffer.alloc(1024 * 1024);
      const result = ContentProcessor.shouldStoreAsFile(exactBuffer);
      expect(result).toBe(false);
    });

    test('should work with string content (using length property)', () => {
      const shortString = 'Hello';
      const result = ContentProcessor.shouldStoreAsFile(shortString);
      expect(result).toBe(false);
    });

    test('should return true for very large string', () => {
      const largeString = 'a'.repeat(1024 * 1024 + 1);
      const result = ContentProcessor.shouldStoreAsFile(largeString);
      expect(result).toBe(true);
    });

    test('should return false for empty buffer', () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = ContentProcessor.shouldStoreAsFile(emptyBuffer);
      expect(result).toBe(false);
    });

    test('should return false for empty string', () => {
      const result = ContentProcessor.shouldStoreAsFile('');
      expect(result).toBe(false);
    });

    test('should handle array-like input with length property', () => {
      const arr = new Array(1024 * 1024 + 1).fill(0);
      const result = ContentProcessor.shouldStoreAsFile(arr);
      expect(result).toBe(true);
    });
  });

  describe('validateContentExists', () => {
    test('should return valid for non-empty string', () => {
      const result = ContentProcessor.validateContentExists('Hello');
      expect(result).toEqual({ valid: true });
    });

    test('should return invalid for null', () => {
      const result = ContentProcessor.validateContentExists(null);
      expect(result).toEqual({
        valid: false,
        error: 'Invalid content',
        message: 'Content is required.',
      });
    });

    test('should return invalid for undefined', () => {
      const result = ContentProcessor.validateContentExists(undefined);
      expect(result).toEqual({
        valid: false,
        error: 'Invalid content',
        message: 'Content is required.',
      });
    });

    test('should return invalid for empty string', () => {
      const result = ContentProcessor.validateContentExists('');
      expect(result).toEqual({
        valid: false,
        error: 'Invalid content',
        message: 'Content is required.',
      });
    });

    test('should return invalid for whitespace-only string', () => {
      const result = ContentProcessor.validateContentExists('   ');
      expect(result).toEqual({
        valid: false,
        error: 'Invalid content',
        message: 'Content is required.',
      });
    });

    test('should return invalid for tab and newline only string', () => {
      const result = ContentProcessor.validateContentExists('\t\n\r');
      expect(result).toEqual({
        valid: false,
        error: 'Invalid content',
        message: 'Content is required.',
      });
    });

    test('should return valid for non-empty array', () => {
      const result = ContentProcessor.validateContentExists([1, 2, 3]);
      expect(result).toEqual({ valid: true });
    });

    test('should return valid for number (truthy)', () => {
      const result = ContentProcessor.validateContentExists(42);
      expect(result).toEqual({ valid: true });
    });

    test('should return invalid for zero (falsy)', () => {
      const result = ContentProcessor.validateContentExists(0);
      expect(result).toEqual({
        valid: false,
        error: 'Invalid content',
        message: 'Content is required.',
      });
    });

    test('should return invalid for false (falsy)', () => {
      const result = ContentProcessor.validateContentExists(false);
      expect(result).toEqual({
        valid: false,
        error: 'Invalid content',
        message: 'Content is required.',
      });
    });

    test('should return valid for Buffer content', () => {
      const result = ContentProcessor.validateContentExists(Buffer.from('test'));
      expect(result).toEqual({ valid: true });
    });

    test('should return valid for string with leading/trailing spaces', () => {
      const result = ContentProcessor.validateContentExists('  hello  ');
      expect(result).toEqual({ valid: true });
    });

    test('should return valid for empty array (truthy)', () => {
      // Empty array is truthy and not a string, so passes
      const result = ContentProcessor.validateContentExists([]);
      expect(result).toEqual({ valid: true });
    });
  });

  describe('Performance', () => {
    test('should validate content within reasonable time', () => {
      const content = new Array(400000).fill(128);

      const start = process.hrtime.bigint();
      ContentProcessor.validateContent(content);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1000000;
      expect(durationMs).toBeLessThan(500);
    });

    test('should process content within reasonable time', () => {
      const content = new Array(10000).fill(128);

      const start = process.hrtime.bigint();
      ContentProcessor.processContent(content);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1000000;
      expect(durationMs).toBeLessThan(100);
    });
  });
});

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

const ShareValidationMiddleware = require('../../../services/ShareValidationMiddleware');

// Mock express-validator - capture custom validators
let mockCapturedValidators = {};

jest.mock('express-validator', () => {
  const chainable = {
    isIn: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    optional: jest.fn().mockReturnThis(),
    isBoolean: jest.fn().mockReturnThis(),
    custom: jest.fn(function (fn) {
      // Store the custom validator for the current field
      if (mockCapturedValidators.__currentField) {
        mockCapturedValidators[mockCapturedValidators.__currentField] = fn;
      }
      return chainable;
    }),
  };

  return {
    body: jest.fn((field) => {
      mockCapturedValidators.__currentField = field;
      return chainable;
    }),
    validationResult: jest.fn(),
    __chainable: chainable,
  };
});

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

describe('ShareValidationMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getValidationRules', () => {
    test('should return an array of validation rules', () => {
      const rules = ShareValidationMiddleware.getValidationRules();

      expect(Array.isArray(rules)).toBe(true);
    });

    test('should call body() for content field', () => {
      const { body } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      expect(body).toHaveBeenCalledWith('content');
    });

    test('should call body() for expiration field', () => {
      const { body } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      expect(body).toHaveBeenCalledWith('expiration');
    });

    test('should call body() for hasPassword field', () => {
      const { body } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      expect(body).toHaveBeenCalledWith('hasPassword');
    });

    test('should call body() for oneTime field', () => {
      const { body } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      expect(body).toHaveBeenCalledWith('oneTime');
    });

    test('should call body() for quickShare field', () => {
      const { body } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      expect(body).toHaveBeenCalledWith('quickShare');
    });

    test('should call body() for contentType field', () => {
      const { body } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      expect(body).toHaveBeenCalledWith('contentType');
    });

    test('should validate all 6 fields', () => {
      const { body } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      // content, expiration, hasPassword, oneTime, quickShare, contentType
      expect(body).toHaveBeenCalledTimes(6);
    });
  });

  describe('Content custom validator (via captured validator)', () => {
    let contentValidator;

    beforeAll(() => {
      // Trigger getValidationRules to capture the custom validator
      mockCapturedValidators = {};
      ShareValidationMiddleware.getValidationRules();
      contentValidator = mockCapturedValidators['content'];
    });

    describe('Binary array content', () => {
      test('should accept valid binary array', () => {
        expect(contentValidator([72, 101, 108, 108, 111])).toBe(true);
      });

      test('should reject empty array', () => {
        expect(() => contentValidator([])).toThrow('Content cannot be empty');
      });

      test('should reject oversized array (> 400000 elements)', () => {
        const largeArray = new Array(400001).fill(0);
        expect(() => contentValidator(largeArray)).toThrow('Content too large (max 400KB)');
      });

      test('should accept array at exactly 400000 elements', () => {
        const maxArray = new Array(400000).fill(0);
        expect(contentValidator(maxArray)).toBe(true);
      });

      test('should reject array with non-number elements', () => {
        expect(() => contentValidator([72, 'a', 108])).toThrow('Invalid binary data format');
      });

      test('should reject array with negative numbers', () => {
        expect(() => contentValidator([72, -1, 108])).toThrow('Invalid binary data format');
      });

      test('should reject array with numbers > 255', () => {
        expect(() => contentValidator([72, 256, 108])).toThrow('Invalid binary data format');
      });

      test('should accept array with floating point numbers in valid range', () => {
        // The validator only checks typeof number, >= 0, and <= 255
        expect(contentValidator([72, 1.5, 108])).toBe(true);
      });

      test('should accept array with 0 and 255 boundary values', () => {
        expect(contentValidator([0, 255, 128])).toBe(true);
      });

      test('should reject array with null elements', () => {
        expect(() => contentValidator([72, null, 108])).toThrow('Invalid binary data format');
      });

      test('should reject array with undefined elements', () => {
        expect(() => contentValidator([72, undefined, 108])).toThrow('Invalid binary data format');
      });

      test('should reject array with NaN elements', () => {
        expect(() => contentValidator([72, NaN, 108])).toThrow('Invalid binary data format');
      });

      test('should reject array with Infinity', () => {
        expect(() => contentValidator([72, Infinity, 108])).toThrow('Invalid binary data format');
      });
    });

    describe('String content', () => {
      test('should accept valid string content', () => {
        expect(contentValidator('Hello, World!')).toBe(true);
      });

      test('should reject empty string', () => {
        expect(() => contentValidator('')).toThrow('Content cannot be empty');
      });

      test('should reject oversized string (> 400000 chars)', () => {
        const largeString = 'a'.repeat(400001);
        expect(() => contentValidator(largeString)).toThrow('Content too large (max 400KB)');
      });

      test('should accept string at exactly 400000 characters', () => {
        const maxString = 'a'.repeat(400000);
        expect(contentValidator(maxString)).toBe(true);
      });

      test('should accept base64 encoded string', () => {
        const base64 = Buffer.from('Hello, World!').toString('base64');
        expect(contentValidator(base64)).toBe(true);
      });

      test('should accept unicode string content', () => {
        expect(contentValidator('Hello \u4e16\u754c')).toBe(true);
      });
    });

    describe('Invalid content types', () => {
      test('should reject number content', () => {
        expect(() => contentValidator(42)).toThrow('Content must be an array or string');
      });

      test('should reject null content', () => {
        expect(() => contentValidator(null)).toThrow('Content must be an array or string');
      });

      test('should reject undefined content', () => {
        expect(() => contentValidator(undefined)).toThrow('Content must be an array or string');
      });

      test('should reject object content', () => {
        expect(() => contentValidator({ data: 'test' })).toThrow('Content must be an array or string');
      });

      test('should reject boolean content', () => {
        expect(() => contentValidator(true)).toThrow('Content must be an array or string');
      });
    });
  });

  describe('handleValidationErrors', () => {
    test('should call next() when no validation errors', () => {
      const { validationResult } = require('express-validator');
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      ShareValidationMiddleware.handleValidationErrors(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 400 with errors when validation fails', () => {
      const { validationResult } = require('express-validator');
      const errors = [
        { msg: 'Content cannot be empty', param: 'content' },
      ];
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => errors,
      });

      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      ShareValidationMiddleware.handleValidationErrors(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: errors,
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return all validation errors in details array', () => {
      const { validationResult } = require('express-validator');
      const errors = [
        { msg: 'Content cannot be empty', param: 'content' },
        { msg: 'Invalid expiration time', param: 'expiration' },
        { msg: 'hasPassword must be a boolean', param: 'hasPassword' },
      ];
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => errors,
      });

      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      ShareValidationMiddleware.handleValidationErrors(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: errors,
      });
      expect(res.json.mock.calls[0][0].details).toHaveLength(3);
    });

    test('should pass req object to validationResult', () => {
      const { validationResult } = require('express-validator');
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      const req = { body: { content: 'test' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      ShareValidationMiddleware.handleValidationErrors(req, res, next);

      expect(validationResult).toHaveBeenCalledWith(req);
    });
  });

  describe('getMiddleware', () => {
    test('should return an array', () => {
      const middleware = ShareValidationMiddleware.getMiddleware();

      expect(Array.isArray(middleware)).toBe(true);
    });

    test('should include validation rules and error handler', () => {
      const middleware = ShareValidationMiddleware.getMiddleware();
      const rules = ShareValidationMiddleware.getValidationRules();

      // Middleware should have rules + handleValidationErrors
      expect(middleware.length).toBe(rules.length + 1);
    });

    test('should have handleValidationErrors as the last middleware', () => {
      const middleware = ShareValidationMiddleware.getMiddleware();
      const lastMiddleware = middleware[middleware.length - 1];

      // The last item should be the handleValidationErrors function
      expect(typeof lastMiddleware).toBe('function');
      expect(lastMiddleware).toBe(ShareValidationMiddleware.handleValidationErrors);
    });

    test('should spread validation rules at the beginning', () => {
      const middleware = ShareValidationMiddleware.getMiddleware();
      const rules = ShareValidationMiddleware.getValidationRules();

      // All rules except the last should match
      for (let i = 0; i < rules.length; i++) {
        expect(middleware[i]).toBe(rules[i]);
      }
    });
  });

  describe('Expiration validation values', () => {
    test('should validate accepted expiration values via body call', () => {
      const { __chainable } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      // isIn should be called with valid expiration values
      expect(__chainable.isIn).toHaveBeenCalledWith([
        '5min', '15min', '30min', '1hr', '6hr', '24hr',
      ]);
    });

    test('should validate contentType accepted values', () => {
      const { __chainable } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      expect(__chainable.isIn).toHaveBeenCalledWith(['text', 'binary']);
    });
  });

  describe('Optional field validation', () => {
    test('should mark hasPassword, oneTime, quickShare, and contentType as optional', () => {
      const { __chainable } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      // optional() should be called for hasPassword, oneTime, quickShare, contentType
      expect(__chainable.optional).toHaveBeenCalledTimes(4);
    });

    test('should validate boolean fields with isBoolean', () => {
      const { __chainable } = require('express-validator');

      ShareValidationMiddleware.getValidationRules();

      // isBoolean should be called for hasPassword, oneTime, quickShare
      expect(__chainable.isBoolean).toHaveBeenCalledTimes(3);
    });
  });
});


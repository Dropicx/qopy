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

const QuickShareService = require('../../../services/QuickShareService');

describe('QuickShareService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('applyQuickShareSettings', () => {
    test('should return settings unchanged if quickShare is false', () => {
      const settings = {
        expiration: '1hr',
        hasPassword: true,
        oneTime: false,
        quickShare: false
      };

      const result = QuickShareService.applyQuickShareSettings(settings);

      expect(result).toEqual(settings);
    });

    test('should return settings unchanged if quickShare is not present', () => {
      const settings = {
        expiration: '1hr',
        hasPassword: true,
        oneTime: false
      };

      const result = QuickShareService.applyQuickShareSettings(settings);

      expect(result).toEqual(settings);
    });

    test('should apply QuickShare overrides when quickShare is true', () => {
      const settings = {
        expiration: '1hr',
        hasPassword: true,
        oneTime: true,
        quickShare: true,
        customField: 'preserved'
      };

      const result = QuickShareService.applyQuickShareSettings(settings);

      expect(result).toEqual({
        expiration: '5min',  // Overridden
        hasPassword: false,  // Overridden
        oneTime: true,       // Preserved (not overridden)
        quickShare: true,
        customField: 'preserved'
      });
    });

    test('should handle null settings', () => {
      const result = QuickShareService.applyQuickShareSettings(null);
      expect(result).toBeNull();
    });

    test('should handle undefined settings', () => {
      const result = QuickShareService.applyQuickShareSettings(undefined);
      expect(result).toBeUndefined();
    });

    test('should handle empty settings object', () => {
      const settings = {};
      const result = QuickShareService.applyQuickShareSettings(settings);
      expect(result).toEqual({});
    });

    test('should preserve all other settings when applying QuickShare', () => {
      const settings = {
        expiration: '24hr',
        hasPassword: true,
        oneTime: false,
        quickShare: true,
        customField1: 'value1',
        customField2: 42,
        customField3: { nested: 'object' }
      };

      const result = QuickShareService.applyQuickShareSettings(settings);

      expect(result.customField1).toBe('value1');
      expect(result.customField2).toBe(42);
      expect(result.customField3).toEqual({ nested: 'object' });
      expect(result.expiration).toBe('5min');
      expect(result.hasPassword).toBe(false);
    });
  });

  describe('updateQuickShareStatistics', () => {
    let mockUpdateStatistics;

    beforeEach(() => {
      mockUpdateStatistics = jest.fn().mockResolvedValue();
    });

    test('should update quick_share_created when quickShare is true', async () => {
      const settings = {
        quickShare: true,
        hasPassword: false,
        oneTime: false
      };

      await QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings);

      expect(mockUpdateStatistics).toHaveBeenCalledWith('quick_share_created');
      expect(mockUpdateStatistics).toHaveBeenCalledTimes(1);
    });

    test('should update password_protected_created when hasPassword is true', async () => {
      const settings = {
        quickShare: false,
        hasPassword: true,
        oneTime: false
      };

      await QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings);

      expect(mockUpdateStatistics).toHaveBeenCalledWith('password_protected_created');
      expect(mockUpdateStatistics).toHaveBeenCalledTimes(1);
    });

    test('should update normal_created when neither quickShare nor hasPassword', async () => {
      const settings = {
        quickShare: false,
        hasPassword: false,
        oneTime: false
      };

      await QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings);

      expect(mockUpdateStatistics).toHaveBeenCalledWith('normal_created');
      expect(mockUpdateStatistics).toHaveBeenCalledTimes(1);
    });

    test('should update one_time_created when oneTime is true', async () => {
      const settings = {
        quickShare: false,
        hasPassword: false,
        oneTime: true
      };

      await QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings);

      expect(mockUpdateStatistics).toHaveBeenCalledWith('normal_created');
      expect(mockUpdateStatistics).toHaveBeenCalledWith('one_time_created');
      expect(mockUpdateStatistics).toHaveBeenCalledTimes(2);
    });

    test('should update both quick_share_created and one_time_created', async () => {
      const settings = {
        quickShare: true,
        hasPassword: false,
        oneTime: true
      };

      await QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings);

      expect(mockUpdateStatistics).toHaveBeenCalledWith('quick_share_created');
      expect(mockUpdateStatistics).toHaveBeenCalledWith('one_time_created');
      expect(mockUpdateStatistics).toHaveBeenCalledTimes(2);
    });

    test('should prioritize quickShare over hasPassword', async () => {
      const settings = {
        quickShare: true,
        hasPassword: true,
        oneTime: false
      };

      await QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings);

      expect(mockUpdateStatistics).toHaveBeenCalledWith('quick_share_created');
      expect(mockUpdateStatistics).not.toHaveBeenCalledWith('password_protected_created');
      expect(mockUpdateStatistics).toHaveBeenCalledTimes(1);
    });

    test('should handle updateStatistics function failures', async () => {
      mockUpdateStatistics.mockRejectedValue(new Error('Statistics update failed'));
      
      const settings = {
        quickShare: true,
        oneTime: true
      };

      await expect(QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings))
        .rejects.toThrow('Statistics update failed');
    });

    test('should handle empty settings object', async () => {
      const settings = {};

      await QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings);

      expect(mockUpdateStatistics).toHaveBeenCalledWith('normal_created');
      expect(mockUpdateStatistics).toHaveBeenCalledTimes(1);
    });

    test('should handle null settings', async () => {
      await expect(QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, null))
        .rejects.toThrow();
    });
  });

  describe('prepareQuickShareResponse', () => {
    const mockReq = {
      protocol: 'https',
      get: jest.fn().mockReturnValue('example.com')
    };

    beforeEach(() => {
      mockReq.get.mockClear();
    });

    test('should prepare basic QuickShare response', () => {
      const params = {
        clipId: 'test-clip-123',
        req: mockReq,
        expirationTime: 1640995200000,
        oneTime: false,
        quickShare: true
      };

      const result = QuickShareService.prepareQuickShareResponse(params);

      expect(result).toEqual({
        success: true,
        clipId: 'test-clip-123',
        url: 'https://example.com/clip/test-clip-123',
        expiresAt: 1640995200000,
        oneTime: false,
        quickShare: true
      });
    });

    test('should handle one-time QuickShare', () => {
      const params = {
        clipId: 'one-time-clip',
        req: mockReq,
        expirationTime: 1640995200000,
        oneTime: true,
        quickShare: true
      };

      const result = QuickShareService.prepareQuickShareResponse(params);

      expect(result.oneTime).toBe(true);
      expect(result.quickShare).toBe(true);
    });

    test('should handle regular share (not QuickShare)', () => {
      const params = {
        clipId: 'regular-clip',
        req: mockReq,
        expirationTime: 1640995200000,
        oneTime: false,
        quickShare: false
      };

      const result = QuickShareService.prepareQuickShareResponse(params);

      expect(result.oneTime).toBe(false);
      expect(result.quickShare).toBe(false);
    });

    test('should handle missing optional parameters', () => {
      const params = {
        clipId: 'minimal-clip',
        req: mockReq,
        expirationTime: 1640995200000
      };

      const result = QuickShareService.prepareQuickShareResponse(params);

      expect(result.oneTime).toBe(false);
      expect(result.quickShare).toBe(false);
    });

    test('should handle different protocols', () => {
      const httpReq = {
        protocol: 'http',
        get: jest.fn().mockReturnValue('localhost:3000')
      };

      const params = {
        clipId: 'http-clip',
        req: httpReq,
        expirationTime: 1640995200000,
        oneTime: false,
        quickShare: false
      };

      const result = QuickShareService.prepareQuickShareResponse(params);

      expect(result.url).toBe('http://localhost:3000/clip/http-clip');
    });

    test('should handle different host formats', () => {
      const customReq = {
        protocol: 'https',
        get: jest.fn().mockReturnValue('custom.domain.com:8080')
      };

      const params = {
        clipId: 'custom-clip',
        req: customReq,
        expirationTime: 1640995200000,
        oneTime: true,
        quickShare: true
      };

      const result = QuickShareService.prepareQuickShareResponse(params);

      expect(result.url).toBe('https://custom.domain.com:8080/clip/custom-clip');
      expect(customReq.get).toHaveBeenCalledWith('host');
    });

    test('should handle special characters in clipId', () => {
      const params = {
        clipId: 'clip-with-special_chars.123',
        req: mockReq,
        expirationTime: 1640995200000,
        oneTime: false,
        quickShare: false
      };

      const result = QuickShareService.prepareQuickShareResponse(params);

      expect(result.clipId).toBe('clip-with-special_chars.123');
      expect(result.url).toBe('https://example.com/clip/clip-with-special_chars.123');
    });
  });

  describe('isQuickShare', () => {
    test('should return true when quickShare is true', () => {
      const settings = { quickShare: true };
      const result = QuickShareService.isQuickShare(settings);
      expect(result).toBe(true);
    });

    test('should return false when quickShare is false', () => {
      const settings = { quickShare: false };
      const result = QuickShareService.isQuickShare(settings);
      expect(result).toBe(false);
    });

    test('should return false when quickShare is not present', () => {
      const settings = { hasPassword: true, oneTime: false };
      const result = QuickShareService.isQuickShare(settings);
      expect(result).toBe(false);
    });

    test('should return false when quickShare is null', () => {
      const settings = { quickShare: null };
      const result = QuickShareService.isQuickShare(settings);
      expect(result).toBe(false);
    });

    test('should return false when quickShare is undefined', () => {
      const settings = { quickShare: undefined };
      const result = QuickShareService.isQuickShare(settings);
      expect(result).toBe(false);
    });

    test('should return true for truthy values', () => {
      const truthyValues = [1, 'true', 'yes', [], {}];
      
      truthyValues.forEach(value => {
        const settings = { quickShare: value };
        const result = QuickShareService.isQuickShare(settings);
        expect(result).toBe(true);
      });
    });

    test('should return false for falsy values', () => {
      const falsyValues = [0, '', null, undefined, false];
      
      falsyValues.forEach(value => {
        const settings = { quickShare: value };
        const result = QuickShareService.isQuickShare(settings);
        expect(result).toBe(false);
      });
    });

    test('should handle empty settings object', () => {
      const result = QuickShareService.isQuickShare({});
      expect(result).toBe(false);
    });

    test('should handle null settings', () => {
      const result = QuickShareService.isQuickShare(null);
      expect(result).toBe(false);
    });

    test('should handle undefined settings', () => {
      const result = QuickShareService.isQuickShare(undefined);
      expect(result).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle circular references in settings', () => {
      const circularSettings = { quickShare: true };
      circularSettings.self = circularSettings;

      expect(() => {
        QuickShareService.applyQuickShareSettings(circularSettings);
      }).not.toThrow();

      expect(() => {
        QuickShareService.isQuickShare(circularSettings);
      }).not.toThrow();
    });

    test('should handle very large settings objects', () => {
      const largeSettings = { quickShare: true };
      for (let i = 0; i < 1000; i++) {
        largeSettings[`field${i}`] = `value${i}`;
      }

      const startTime = process.hrtime.bigint();
      const result = QuickShareService.applyQuickShareSettings(largeSettings);
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1000000;
      expect(durationMs).toBeLessThan(100);
      expect(result.quickShare).toBe(true);
      expect(result.expiration).toBe('5min');
    });

    test('should handle concurrent operations', async () => {
      const mockUpdateStatistics = jest.fn().mockResolvedValue();
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const settings = {
          quickShare: i % 2 === 0,
          oneTime: i % 3 === 0,
          hasPassword: i % 4 === 0
        };
        promises.push(QuickShareService.updateQuickShareStatistics(mockUpdateStatistics, settings));
      }

      await Promise.all(promises);
      expect(mockUpdateStatistics).toHaveBeenCalled();
    });
  });
});
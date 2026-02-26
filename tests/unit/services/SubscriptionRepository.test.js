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

const SubscriptionRepository = require('../../../services/SubscriptionRepository');

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

describe('SubscriptionRepository', () => {
  let repo;
  let mockPool;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue()
    };

    repo = new SubscriptionRepository(mockPool);
  });

  describe('constructor', () => {
    test('should throw when no database pool provided', () => {
      expect(() => new SubscriptionRepository(null)).toThrow('SubscriptionRepository requires a database pool');
      expect(() => new SubscriptionRepository(undefined)).toThrow('SubscriptionRepository requires a database pool');
    });

    test('should accept a valid pool', () => {
      const instance = new SubscriptionRepository(mockPool);
      expect(instance.pool).toBe(mockPool);
    });
  });

  describe('createAnonymousUser', () => {
    test('should create user with default options', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, anonymous_id: 'K7MN-WXYZ-3HJR-QPST', created_at: new Date(), status: 'active' }]
      });

      const result = await repo.createAnonymousUser('K7MN-WXYZ-3HJR-QPST');

      expect(result.anonymous_id).toBe('K7MN-WXYZ-3HJR-QPST');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO anonymous_users'),
        ['K7MN-WXYZ-3HJR-QPST', null, null, null]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should create user with custom options', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, anonymous_id: 'K7MN-WXYZ-3HJR-QPST', created_at: new Date(), status: 'active' }]
      });

      await repo.createAnonymousUser('K7MN-WXYZ-3HJR-QPST', {
        timezone: 'UTC',
        preferredLanguage: 'en',
        accountNotes: 'test'
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        ['K7MN-WXYZ-3HJR-QPST', 'UTC', 'en', 'test']
      );
    });

    test('should release client on error', async () => {
      mockClient.query.mockRejectedValue(new Error('DB error'));

      await expect(repo.createAnonymousUser('K7MN-WXYZ-3HJR-QPST'))
        .rejects.toThrow('DB error');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getAnonymousUser', () => {
    test('should return user when found', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, anonymous_id: 'K7MN-WXYZ-3HJR-QPST', status: 'active' }]
      });

      const result = await repo.getAnonymousUser('K7MN-WXYZ-3HJR-QPST');

      expect(result.anonymous_id).toBe('K7MN-WXYZ-3HJR-QPST');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM anonymous_users'),
        ['K7MN-WXYZ-3HJR-QPST']
      );
    });

    test('should return null when user not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await repo.getAnonymousUser('XXXX-XXXX-XXXX-XXXX');

      expect(result).toBeNull();
    });

    test('should always release client', async () => {
      mockClient.query.mockRejectedValue(new Error('fail'));

      await expect(repo.getAnonymousUser('K7MN-WXYZ-3HJR-QPST')).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('createSubscription', () => {
    test('should create subscription within a transaction', async () => {
      // Mock getAnonymousUser (returns existing user)
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, anonymous_id: 'K7MN-WXYZ-3HJR-QPST' }] }) // getAnonymousUser inner query
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // plan query
        .mockResolvedValueOnce({ rows: [{ id: 100, created_at: new Date() }] }) // subscription insert
        .mockResolvedValueOnce({}) // quota insert 1
        .mockResolvedValueOnce({}) // quota insert 2
        .mockResolvedValueOnce({}) // quota insert 3
        .mockResolvedValueOnce({}); // COMMIT

      // We need to also mock the getAnonymousUser pool.connect call
      // Since createSubscription calls getAnonymousUser which also calls pool.connect,
      // we need separate clients
      const innerClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1, anonymous_id: 'K7MN-WXYZ-3HJR-QPST' }] }),
        release: jest.fn()
      };
      mockPool.connect
        .mockResolvedValueOnce(mockClient) // createSubscription client
        .mockResolvedValueOnce(innerClient); // getAnonymousUser client

      const subscriptionData = {
        anonymousId: 'K7MN-WXYZ-3HJR-QPST',
        planType: 'basic',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date()
      };

      const result = await repo.createSubscription(subscriptionData);

      expect(result).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('insert failed')); // query fails

      // getAnonymousUser also calls pool.connect
      const innerClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      mockPool.connect
        .mockResolvedValueOnce(mockClient)
        .mockResolvedValueOnce(innerClient);

      await expect(repo.createSubscription({
        anonymousId: 'K7MN-WXYZ-3HJR-QPST',
        planType: 'basic',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date()
      })).rejects.toThrow();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('updateSubscriptionStatus', () => {
    test('should update and return result', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, anonymous_user_id: 5 }]
      });

      const result = await repo.updateSubscriptionStatus('sub_123', {
        status: 'canceled',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
        cancellationReason: 'user_requested'
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should return null when subscription not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await repo.updateSubscriptionStatus('sub_nonexistent', {
        status: 'canceled'
      });

      expect(result).toBeNull();
    });
  });

  describe('recordPaymentEvent', () => {
    test('should record event and return ID', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, anonymous_user_id: 5 }] }) // subscription lookup
        .mockResolvedValueOnce({ rows: [{ id: 42 }] }); // insert

      const result = await repo.recordPaymentEvent({
        stripeSubscriptionId: 'sub_123',
        eventType: 'invoice.payment_succeeded',
        stripeEventId: 'evt_123',
        amountCents: 500,
        currency: 'USD',
        processed: true
      });

      expect(result).toBe(42);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should return null for duplicate event (conflict)', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // no subscription found
        .mockResolvedValueOnce({ rows: [] }); // conflict, no rows returned

      const result = await repo.recordPaymentEvent({
        eventType: 'test',
        stripeEventId: 'evt_dup'
      });

      expect(result).toBeNull();
    });

    test('should handle missing subscription gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // no subscription
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }); // insert succeeds with null user/sub

      const result = await repo.recordPaymentEvent({
        stripeSubscriptionId: 'sub_unknown',
        eventType: 'test',
        stripeEventId: 'evt_new'
      });

      expect(result).toBe(10);
    });
  });

  describe('getUsageQuotas', () => {
    test('should return usage quota rows', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          { quota_type: 'storage_mb', current_usage: 50, quota_limit: 100, usage_percentage: 50 },
          { quota_type: 'uploads_per_day', current_usage: 3, quota_limit: 10, usage_percentage: 30 }
        ]
      });

      const result = await repo.getUsageQuotas('K7MN-WXYZ-3HJR-QPST');

      expect(result).toHaveLength(2);
      expect(result[0].quota_type).toBe('storage_mb');
    });

    test('should return empty array when no quotas', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await repo.getUsageQuotas('K7MN-WXYZ-3HJR-QPST');

      expect(result).toEqual([]);
    });
  });

  describe('updateUsageQuota', () => {
    test('should update and return usage data', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // reset query
        .mockResolvedValueOnce({ rows: [{ current_usage: 51, quota_limit: 100 }] }) // update query
        .mockResolvedValueOnce({}); // COMMIT

      const result = await repo.updateUsageQuota('K7MN-WXYZ-3HJR-QPST', 'storage_mb', 1);

      expect(result.quotaType).toBe('storage_mb');
      expect(result.currentUsage).toBe(51);
      expect(result.remainingUsage).toBe(49);
      expect(result.usagePercentage).toBe(51);
    });

    test('should return null when quota not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // reset
        .mockResolvedValueOnce({ rows: [] }) // no match
        .mockResolvedValueOnce({}); // COMMIT

      const result = await repo.updateUsageQuota('K7MN-WXYZ-3HJR-QPST', 'nonexistent');

      expect(result).toBeNull();
    });

    test('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('update failed'));

      await expect(repo.updateUsageQuota('K7MN-WXYZ-3HJR-QPST', 'storage_mb'))
        .rejects.toThrow('update failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('createSession', () => {
    test('should create a session for existing user', async () => {
      // getAnonymousUser pool.connect
      const innerClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1, anonymous_id: 'K7MN-WXYZ-3HJR-QPST' }] }),
        release: jest.fn()
      };
      mockPool.connect
        .mockResolvedValueOnce(mockClient) // createSession client
        .mockResolvedValueOnce(innerClient); // getAnonymousUser client

      mockClient.query.mockResolvedValue({
        rows: [{ id: 99, created_at: new Date() }]
      });

      const result = await repo.createSession(
        'K7MN-WXYZ-3HJR-QPST', 'token123', new Date(Date.now() + 86400000),
        { ipAddress: '1.2.3.4' }
      );

      expect(result.sessionId).toBe(99);
      expect(result.anonymousId).toBe('K7MN-WXYZ-3HJR-QPST');
    });

    test('should throw when user not found', async () => {
      const innerClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      mockPool.connect
        .mockResolvedValueOnce(mockClient)
        .mockResolvedValueOnce(innerClient);

      await expect(repo.createSession('XXXX-XXXX-XXXX-XXXX', 'token', new Date()))
        .rejects.toThrow('Anonymous user not found');
    });
  });

  describe('validateSession', () => {
    test('should return session data and update last_used_at', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ session_id: 1, anonymous_id: 'K7MN-WXYZ-3HJR-QPST', user_id: 5 }] })
        .mockResolvedValueOnce({}); // update last_used_at

      const result = await repo.validateSession('valid_token');

      expect(result.session_id).toBe(1);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    test('should return null for invalid/expired session', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await repo.validateSession('invalid_token');

      expect(result).toBeNull();
    });
  });

  describe('calculateNextReset', () => {
    test('should calculate next hour reset', () => {
      const result = repo.calculateNextReset('hour');
      expect(result.getTime()).toBeGreaterThan(Date.now());
      expect(result.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000 + 100);
    });

    test('should calculate next day reset', () => {
      const result = repo.calculateNextReset('day');
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    test('should calculate next month reset', () => {
      const result = repo.calculateNextReset('month');
      expect(result.getDate()).toBe(1);
    });

    test('should return null for never reset period', () => {
      const result = repo.calculateNextReset('never');
      expect(result).toBeNull();
    });
  });

  describe('close', () => {
    test('should close the database pool', async () => {
      await repo.close();
      expect(mockPool.end).toHaveBeenCalled();
    });

    test('should handle close errors gracefully', async () => {
      mockPool.end.mockRejectedValue(new Error('close error'));
      await expect(repo.close()).resolves.not.toThrow();
    });
  });
});

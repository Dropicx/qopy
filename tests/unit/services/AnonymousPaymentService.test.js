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

// Mock stripe as a virtual module (not installed in dev dependencies)
const mockStripe = {
  customers: {
    create: jest.fn(),
    search: jest.fn()
  },
  checkout: {
    sessions: {
      create: jest.fn(),
      retrieve: jest.fn()
    }
  },
  subscriptions: {
    list: jest.fn(),
    cancel: jest.fn(),
    update: jest.fn()
  },
  setupIntents: {
    create: jest.fn(),
    retrieve: jest.fn()
  },
  webhooks: {
    constructEvent: jest.fn()
  }
};

jest.mock('stripe', () => jest.fn(() => mockStripe), { virtual: true });

const AnonymousPaymentService = require('../../../services/AnonymousPaymentService');

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

describe('AnonymousPaymentService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnonymousPaymentService();
  });

  describe('generateAnonymousId', () => {
    test('should generate an ID in XXXX-XXXX-XXXX-XXXX format', () => {
      const id = service.generateAnonymousId();
      expect(id).toMatch(/^[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[123456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    });

    test('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(service.generateAnonymousId());
      }
      expect(ids.size).toBe(100);
    });

    test('should generate ID of correct length (19 chars with dashes)', () => {
      const id = service.generateAnonymousId();
      expect(id.length).toBe(19);
      expect(id.replace(/-/g, '').length).toBe(16);
    });

    test('should only use allowed characters', () => {
      const charset = '123456789ABCDEFGHJKMNPQRSTUVWXYZ';
      const id = service.generateAnonymousId().replace(/-/g, '');
      for (const char of id) {
        expect(charset).toContain(char);
      }
    });
  });

  describe('validateAnonymousId', () => {
    test('should accept valid ID', () => {
      expect(service.validateAnonymousId('K7MN-WXYZ-3HJR-QPST')).toBe(true);
    });

    test('should reject null', () => {
      expect(service.validateAnonymousId(null)).toBe(false);
    });

    test('should reject invalid format', () => {
      expect(service.validateAnonymousId('invalid')).toBe(false);
    });

    test('should reject ID with excluded characters (0, O, I, L)', () => {
      expect(service.validateAnonymousId('OOOO-IIII-LLLL-0000')).toBe(false);
    });
  });

  describe('createStripeCustomer', () => {
    test('should create customer with anonymous metadata', async () => {
      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_test123',
        created: 1700000000
      });

      const result = await service.createStripeCustomer('K7MN-WXYZ-3HJR-QPST', 'basic');

      expect(result.customerId).toBe('cus_test123');
      expect(result.anonymousId).toBe('K7MN-WXYZ-3HJR-QPST');
      expect(result.planType).toBe('basic');
      expect(mockStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Qopy Anonymous User',
          metadata: expect.objectContaining({
            anonymous_id: 'K7MN-WXYZ-3HJR-QPST',
            account_type: 'anonymous'
          })
        })
      );
    });

    test('should reject invalid anonymous ID', async () => {
      await expect(service.createStripeCustomer('invalid', 'basic'))
        .rejects.toThrow('Invalid anonymous ID format');
    });

    test('should reject unsupported plan type', async () => {
      await expect(service.createStripeCustomer('K7MN-WXYZ-3HJR-QPST', 'gold'))
        .rejects.toThrow('Unsupported plan type: gold');
    });

    test('should propagate Stripe API errors', async () => {
      mockStripe.customers.create.mockRejectedValue(new Error('Stripe API error'));

      await expect(service.createStripeCustomer('K7MN-WXYZ-3HJR-QPST', 'basic'))
        .rejects.toThrow('Stripe API error');
    });
  });

  describe('createPaymentSession', () => {
    test('should create a checkout session', async () => {
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_123', created: 1700000000 });
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/session/123'
      });

      const result = await service.createPaymentSession(
        'K7MN-WXYZ-3HJR-QPST', 'pro',
        'https://qopy.app/success', 'https://qopy.app/cancel'
      );

      expect(result.sessionId).toBe('cs_test_123');
      expect(result.sessionUrl).toBe('https://checkout.stripe.com/session/123');
      expect(result.planType).toBe('pro');
    });

    test('should reject invalid anonymous ID', async () => {
      await expect(service.createPaymentSession('bad', 'basic', 'url1', 'url2'))
        .rejects.toThrow('Invalid anonymous ID format');
    });

    test('should reject invalid plan type', async () => {
      await expect(service.createPaymentSession('K7MN-WXYZ-3HJR-QPST', 'invalid', 'url1', 'url2'))
        .rejects.toThrow('Unsupported plan type: invalid');
    });
  });

  describe('handlePaymentSuccess', () => {
    test('should process successful payment', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValue({
        metadata: { anonymous_id: 'K7MN-WXYZ-3HJR-QPST', plan_type: 'basic' },
        subscription: {
          id: 'sub_123',
          status: 'active',
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          cancel_at_period_end: false
        },
        customer: { id: 'cus_123' }
      });

      const result = await service.handlePaymentSuccess('cs_123', 'K7MN-WXYZ-3HJR-QPST');

      expect(result.anonymousId).toBe('K7MN-WXYZ-3HJR-QPST');
      expect(result.status).toBe('active');
      expect(result.stripeSubscriptionId).toBe('sub_123');
    });

    test('should reject anonymous ID mismatch', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValue({
        metadata: { anonymous_id: 'DIFFERENT-ID11-ABCD-EFGH' },
        subscription: {},
        customer: {}
      });

      await expect(service.handlePaymentSuccess('cs_123', 'K7MN-WXYZ-3HJR-QPST'))
        .rejects.toThrow('Anonymous ID mismatch');
    });
  });

  describe('getSubscriptionStatus', () => {
    test('should return no subscription when customer not found', async () => {
      mockStripe.customers.search.mockResolvedValue({ data: [] });

      const result = await service.getSubscriptionStatus('K7MN-WXYZ-3HJR-QPST');

      expect(result.exists).toBe(false);
      expect(result.message).toBe('No subscription found');
    });

    test('should return active subscription details', async () => {
      mockStripe.customers.search.mockResolvedValue({
        data: [{ id: 'cus_123', metadata: { plan_type: 'pro' } }]
      });
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [{
          id: 'sub_123',
          status: 'active',
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          cancel_at_period_end: false,
          trial_end: null
        }]
      });

      const result = await service.getSubscriptionStatus('K7MN-WXYZ-3HJR-QPST');

      expect(result.exists).toBe(true);
      expect(result.status).toBe('active');
      expect(result.planType).toBe('pro');
    });

    test('should reject invalid anonymous ID', async () => {
      await expect(service.getSubscriptionStatus('bad'))
        .rejects.toThrow('Invalid anonymous ID format');
    });
  });

  describe('cancelSubscription', () => {
    test('should cancel at period end by default', async () => {
      mockStripe.customers.search.mockResolvedValue({
        data: [{ id: 'cus_123', metadata: { plan_type: 'basic' } }]
      });
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [{ id: 'sub_123', status: 'active', current_period_start: 1700000000, current_period_end: 1702592000, cancel_at_period_end: false, trial_end: null }]
      });
      mockStripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123', status: 'active', cancel_at_period_end: true, current_period_end: 1702592000
      });

      const result = await service.cancelSubscription('K7MN-WXYZ-3HJR-QPST');

      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(mockStripe.subscriptions.update).toHaveBeenCalled();
    });

    test('should cancel immediately when requested', async () => {
      mockStripe.customers.search.mockResolvedValue({
        data: [{ id: 'cus_123', metadata: { plan_type: 'basic' } }]
      });
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [{ id: 'sub_123', status: 'active', current_period_start: 1700000000, current_period_end: 1702592000, cancel_at_period_end: false, trial_end: null }]
      });
      mockStripe.subscriptions.cancel.mockResolvedValue({
        id: 'sub_123', status: 'canceled', cancel_at_period_end: false, current_period_end: 1702592000
      });

      const result = await service.cancelSubscription('K7MN-WXYZ-3HJR-QPST', true);

      expect(result.canceledAt).toBeDefined();
      expect(mockStripe.subscriptions.cancel).toHaveBeenCalled();
    });
  });

  describe('getSupportedPlans', () => {
    test('should return all supported plans', () => {
      const plans = service.getSupportedPlans();
      expect(plans).toHaveLength(3);
      expect(plans.map(p => p.id)).toEqual(['basic', 'pro', 'enterprise']);
    });

    test('should include formatted prices', () => {
      const plans = service.getSupportedPlans();
      expect(plans[0].priceFormatted).toBe('$5.00');
      expect(plans[1].priceFormatted).toBe('$15.00');
      expect(plans[2].priceFormatted).toBe('$50.00');
    });
  });

  describe('validateWebhookSignature', () => {
    test('should throw when webhook secret not configured', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      expect(() => service.validateWebhookSignature('payload', 'sig'))
        .toThrow('Webhook secret not configured');
    });

    test('should call stripe constructEvent with correct params', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
      mockStripe.webhooks.constructEvent.mockReturnValue({ type: 'test', id: 'evt_1' });

      const result = service.validateWebhookSignature('payload', 'sig_header');

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith('payload', 'sig_header', 'whsec_test');
      expect(result.type).toBe('test');

      delete process.env.STRIPE_WEBHOOK_SECRET;
    });
  });
});

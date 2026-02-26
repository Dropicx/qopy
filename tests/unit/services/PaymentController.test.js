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
jest.mock('stripe', () => jest.fn(() => ({
  customers: { create: jest.fn(), search: jest.fn() },
  checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
  subscriptions: { list: jest.fn(), cancel: jest.fn(), update: jest.fn() },
  setupIntents: { create: jest.fn(), retrieve: jest.fn() },
  webhooks: { constructEvent: jest.fn() }
})), { virtual: true });

// Mock express-rate-limit
jest.mock('express-rate-limit', () => {
  return jest.fn(() => jest.fn((req, res, next) => next && next()));
});

const PaymentController = require('../../../services/PaymentController');

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

describe('PaymentController', () => {
  let controller;
  let mockDbPool;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDbPool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      }),
      end: jest.fn()
    };

    controller = new PaymentController(mockDbPool);

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('generateAnonymousId', () => {
    test('should return a generated anonymous ID', async () => {
      const mockReq = {};

      await controller.generateAnonymousId(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          anonymousId: expect.any(String),
          message: 'Anonymous ID generated successfully'
        })
      );
    });

    test('should return 500 on generation failure', async () => {
      controller.paymentService.generateAnonymousId = jest.fn(() => { throw new Error('generation failed'); });

      await controller.generateAnonymousId({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'ID generation failed' })
      );
    });
  });

  describe('getPlans', () => {
    test('should return supported plans', async () => {
      await controller.getPlans({}, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          plans: expect.any(Array)
        })
      );
    });

    test('should return 500 on failure', async () => {
      controller.paymentService.getSupportedPlans = jest.fn(() => { throw new Error('fail'); });

      await controller.getPlans({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createPaymentSession', () => {
    test('should return 400 when missing required fields', async () => {
      const mockReq = { body: { anonymousId: 'K7MN-WXYZ-3HJR-QPST' } }; // missing planType, urls

      await controller.createPaymentSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Missing required fields' })
      );
    });

    test('should return 400 for invalid anonymous ID format', async () => {
      const mockReq = {
        body: {
          anonymousId: 'invalid',
          planType: 'basic',
          successUrl: 'https://qopy.app/success',
          cancelUrl: 'https://qopy.app/cancel'
        }
      };

      await controller.createPaymentSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid anonymous ID format' })
      );
    });

    test('should create session with valid inputs', async () => {
      controller.paymentService.createPaymentSession = jest.fn().mockResolvedValue({
        sessionId: 'cs_123',
        sessionUrl: 'https://checkout.stripe.com/123',
        anonymousId: 'K7MN-WXYZ-3HJR-QPST',
        planType: 'basic',
        amount: 500
      });

      const mockReq = {
        body: {
          anonymousId: 'K7MN-WXYZ-3HJR-QPST',
          planType: 'basic',
          successUrl: 'https://qopy.app/success',
          cancelUrl: 'https://qopy.app/cancel'
        }
      };

      await controller.createPaymentSession(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, sessionId: 'cs_123' })
      );
    });
  });

  describe('verifyPaymentSuccess', () => {
    test('should return 400 when missing sessionId or anonymousId', async () => {
      await controller.verifyPaymentSuccess({ body: {} }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Missing session ID or anonymous ID' })
      );
    });

    test('should verify and store subscription on success', async () => {
      controller.paymentService.handlePaymentSuccess = jest.fn().mockResolvedValue({
        anonymousId: 'K7MN-WXYZ-3HJR-QPST',
        planType: 'basic',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date()
      });
      controller.subscriptionRepo.createSubscription = jest.fn().mockResolvedValue({});

      await controller.verifyPaymentSuccess({
        body: { sessionId: 'cs_123', anonymousId: 'K7MN-WXYZ-3HJR-QPST' }
      }, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, status: 'active' })
      );
      expect(controller.subscriptionRepo.createSubscription).toHaveBeenCalled();
    });
  });

  describe('cancelSubscription', () => {
    test('should return 400 when anonymousId is missing', async () => {
      await controller.cancelSubscription({ body: {} }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Anonymous ID is required' })
      );
    });

    test('should return 400 for invalid anonymousId format', async () => {
      await controller.cancelSubscription({ body: { anonymousId: 'bad' } }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid anonymous ID format' })
      );
    });
  });

  describe('handleStripeWebhook', () => {
    test('should return 400 when stripe-signature header is missing', async () => {
      await controller.handleStripeWebhook({ headers: {}, body: '{}' }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Missing Stripe signature' })
      );
    });

    test('should process valid webhook event', async () => {
      const mockEvent = { type: 'invoice.payment_succeeded', id: 'evt_1', data: { object: { amount_paid: 500, currency: 'usd', subscription: 'sub_1' } } };
      controller.paymentService.validateWebhookSignature = jest.fn().mockReturnValue(mockEvent);
      controller.processWebhookEvent = jest.fn().mockResolvedValue();

      await controller.handleStripeWebhook({
        headers: { 'stripe-signature': 't=123,v1=abc' },
        body: '{}'
      }, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, received: true })
      );
    });
  });

  describe('getUsage', () => {
    test('should return 400 for invalid anonymous ID', async () => {
      await controller.getUsage({ params: { anonymousId: 'bad' } }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('should return usage data for valid ID', async () => {
      controller.subscriptionRepo.getUsageQuotas = jest.fn().mockResolvedValue([
        { quota_type: 'storage_mb', current_usage: 50, quota_limit: 100 }
      ]);

      await controller.getUsage({ params: { anonymousId: 'K7MN-WXYZ-3HJR-QPST' } }, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, usage: expect.any(Array) })
      );
    });
  });

  describe('updateUsage', () => {
    test('should return 400 when required fields missing', async () => {
      await controller.updateUsage({ body: {} }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Anonymous ID and quota type are required' })
      );
    });

    test('should return 404 when quota not found', async () => {
      controller.subscriptionRepo.updateUsageQuota = jest.fn().mockResolvedValue(null);

      await controller.updateUsage({
        body: { anonymousId: 'K7MN-WXYZ-3HJR-QPST', quotaType: 'storage_mb' }
      }, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('should update usage successfully', async () => {
      controller.subscriptionRepo.updateUsageQuota = jest.fn().mockResolvedValue({
        quotaType: 'storage_mb', currentUsage: 51, quotaLimit: 100
      });

      await controller.updateUsage({
        body: { anonymousId: 'K7MN-WXYZ-3HJR-QPST', quotaType: 'storage_mb', increment: 1 }
      }, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('isValidStripeWebhook', () => {
    test('should return true for valid signature format', () => {
      const req = { headers: { 'stripe-signature': 't=123456,v1=abcdef123' } };
      expect(controller.isValidStripeWebhook(req)).toBe(true);
    });

    test('should return false when no signature header', () => {
      expect(controller.isValidStripeWebhook({ headers: {} })).toBe(false);
    });

    test('should return false for invalid signature format', () => {
      const req = { headers: { 'stripe-signature': 'invalid' } };
      expect(controller.isValidStripeWebhook(req)).toBe(false);
    });
  });

  describe('getRoutes', () => {
    test('should return route configuration object', () => {
      const routes = controller.getRoutes();
      expect(routes).toBeDefined();
      expect(routes['GET /api/payment/plans']).toBeDefined();
      expect(routes['POST /api/payment/generate-id/handler']).toBeDefined();
      expect(routes['POST /api/payment/webhook/handler']).toBeDefined();
    });
  });
});

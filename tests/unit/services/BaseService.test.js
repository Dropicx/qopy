const BaseService = require('../../../services/core/BaseService');

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

describe('BaseService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BaseService(mockConsole);
  });

  describe('constructor', () => {
    test('should use console as default logger when none provided', () => {
      const defaultService = new BaseService();
      expect(defaultService.logger).toBeDefined();
      expect(defaultService.name).toBe('BaseService');
    });

    test('should accept a custom logger', () => {
      const customLogger = { log: jest.fn(), error: jest.fn() };
      const svc = new BaseService(customLogger);
      expect(svc.logger).toBe(customLogger);
    });

    test('should accept a validator parameter', () => {
      const validator = { validate: jest.fn() };
      const svc = new BaseService(mockConsole, validator);
      expect(svc.validator).toBe(validator);
    });

    test('should default validator to null', () => {
      expect(service.validator).toBeNull();
    });

    test('should set name to constructor name', () => {
      expect(service.name).toBe('BaseService');
    });

    test('should initialize startTime to current timestamp', () => {
      const before = Date.now();
      const svc = new BaseService(mockConsole);
      const after = Date.now();
      expect(svc.startTime).toBeGreaterThanOrEqual(before);
      expect(svc.startTime).toBeLessThanOrEqual(after);
    });

    test('should initialize metrics to zero counts', () => {
      expect(service.metrics).toEqual({
        operations: 0,
        errors: 0,
        successes: 0
      });
    });
  });

  describe('log()', () => {
    test('should format message with service name', () => {
      service.log('test message');
      expect(mockConsole.log).toHaveBeenCalledWith(
        '[BaseService] test message',
        expect.objectContaining({ service: 'BaseService' })
      );
    });

    test('should include timestamp in context', () => {
      service.log('test');
      const context = mockConsole.log.mock.calls[0][1];
      expect(context.timestamp).toBeDefined();
      expect(typeof context.timestamp).toBe('string');
    });

    test('should merge additional context', () => {
      service.log('test', { key: 'value' });
      const context = mockConsole.log.mock.calls[0][1];
      expect(context.key).toBe('value');
      expect(context.service).toBe('BaseService');
    });

    test('should use empty object as default context', () => {
      service.log('test');
      expect(mockConsole.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('logInfo()', () => {
    test('should format message with INFO prefix', () => {
      service.logInfo('info message');
      expect(mockConsole.log).toHaveBeenCalledWith(
        '[BaseService] INFO: info message',
        expect.objectContaining({ service: 'BaseService' })
      );
    });

    test('should include timestamp in context', () => {
      service.logInfo('info');
      const context = mockConsole.log.mock.calls[0][1];
      expect(context.timestamp).toBeDefined();
    });

    test('should merge additional context', () => {
      service.logInfo('info', { extra: 42 });
      const context = mockConsole.log.mock.calls[0][1];
      expect(context.extra).toBe(42);
    });
  });

  describe('logWarning()', () => {
    test('should use warn if available on logger', () => {
      service.logWarning('warning message');
      expect(mockConsole.warn).toHaveBeenCalledWith(
        '[BaseService] WARNING: warning message',
        expect.objectContaining({ service: 'BaseService' })
      );
    });

    test('should fall back to log if warn is not available', () => {
      const logOnlyLogger = { log: jest.fn() };
      const svc = new BaseService(logOnlyLogger);
      svc.logWarning('fallback warning');
      expect(logOnlyLogger.log).toHaveBeenCalledWith(
        '[BaseService] WARNING: fallback warning',
        expect.objectContaining({ service: 'BaseService' })
      );
    });

    test('should include timestamp in context', () => {
      service.logWarning('warn');
      const context = mockConsole.warn.mock.calls[0][1];
      expect(context.timestamp).toBeDefined();
    });
  });

  describe('logError()', () => {
    test('should increment error counter', () => {
      service.logError('error occurred');
      expect(service.metrics.errors).toBe(1);
    });

    test('should increment error counter on multiple calls', () => {
      service.logError('err1');
      service.logError('err2');
      service.logError('err3');
      expect(service.metrics.errors).toBe(3);
    });

    test('should format message with service name', () => {
      service.logError('something broke');
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('[BaseService]'),
        expect.objectContaining({ service: 'BaseService' })
      );
    });

    test('should extract error message from Error object', () => {
      const err = new Error('bad things');
      service.logError('failed', err);
      const context = mockConsole.error.mock.calls[0][1];
      expect(context.error).toBe('bad things');
      expect(context.stack).toBeDefined();
    });

    test('should handle plain object as error parameter', () => {
      service.logError('failed', { detail: 'info' });
      const context = mockConsole.error.mock.calls[0][1];
      expect(context.error).toEqual({ detail: 'info' });
    });
  });

  describe('logSuccess()', () => {
    test('should increment success counter', () => {
      service.logSuccess('done');
      expect(service.metrics.successes).toBe(1);
    });

    test('should increment success counter on multiple calls', () => {
      service.logSuccess('a');
      service.logSuccess('b');
      expect(service.metrics.successes).toBe(2);
    });

    test('should format message with service name', () => {
      service.logSuccess('completed');
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('[BaseService]'),
        expect.objectContaining({ service: 'BaseService' })
      );
    });
  });

  describe('executeOperation()', () => {
    test('should call the operation and return its result', async () => {
      const operation = jest.fn().mockResolvedValue('result-value');
      const result = await service.executeOperation('testOp', operation);
      expect(result).toBe('result-value');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should increment operations counter', async () => {
      const operation = jest.fn().mockResolvedValue(null);
      await service.executeOperation('op', operation);
      expect(service.metrics.operations).toBe(1);
    });

    test('should track success via logSuccess', async () => {
      const operation = jest.fn().mockResolvedValue('ok');
      await service.executeOperation('op', operation);
      expect(service.metrics.successes).toBe(1);
    });

    test('should log start and completion messages', async () => {
      const operation = jest.fn().mockResolvedValue('ok');
      await service.executeOperation('myOp', operation);
      const allLogCalls = mockConsole.log.mock.calls.map(c => c[0]);
      expect(allLogCalls.some(msg => msg.includes('Starting myOp'))).toBe(true);
      expect(allLogCalls.some(msg => msg.includes('Completed myOp'))).toBe(true);
    });

    test('should handle operation failure and track error', async () => {
      const error = new Error('op failed');
      const operation = jest.fn().mockRejectedValue(error);
      await expect(service.executeOperation('failOp', operation)).rejects.toThrow('op failed');
      expect(service.metrics.errors).toBe(1);
    });

    test('should increment operations counter even on failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(service.executeOperation('failOp', operation)).rejects.toThrow();
      expect(service.metrics.operations).toBe(1);
    });

    test('should pass context to log calls', async () => {
      const operation = jest.fn().mockResolvedValue('ok');
      await service.executeOperation('op', operation, { requestId: '123' });
      const context = mockConsole.log.mock.calls[0][1];
      expect(context.requestId).toBe('123');
    });

    test('should measure timing (duration present in log)', async () => {
      const operation = jest.fn().mockResolvedValue('ok');
      await service.executeOperation('op', operation);
      const successCall = mockConsole.log.mock.calls.find(c => c[0].includes('Completed'));
      expect(successCall[0]).toMatch(/\d+ms/);
    });
  });

  describe('validateParams()', () => {
    test('should return true when no validator is configured', async () => {
      const result = await service.validateParams({ a: 1 }, {});
      expect(result).toBe(true);
    });

    test('should call validator.validate when available', async () => {
      const validator = { validate: jest.fn().mockResolvedValue(true) };
      const svc = new BaseService(mockConsole, validator);
      const params = { key: 'val' };
      const schema = { type: 'object' };
      await svc.validateParams(params, schema);
      expect(validator.validate).toHaveBeenCalledWith(params, schema);
    });

    test('should return validator result', async () => {
      const validator = { validate: jest.fn().mockResolvedValue(true) };
      const svc = new BaseService(mockConsole, validator);
      const result = await svc.validateParams({}, {});
      expect(result).toBe(true);
    });

    test('should throw on validation failure with wrapped message', async () => {
      const validator = {
        validate: jest.fn().mockRejectedValue(new Error('field required'))
      };
      const svc = new BaseService(mockConsole, validator);
      await expect(svc.validateParams({}, {})).rejects.toThrow('Invalid parameters: field required');
    });

    test('should increment error counter on validation failure', async () => {
      const validator = {
        validate: jest.fn().mockRejectedValue(new Error('bad'))
      };
      const svc = new BaseService(mockConsole, validator);
      await expect(svc.validateParams({}, {})).rejects.toThrow();
      expect(svc.metrics.errors).toBe(1);
    });
  });

  describe('getMetrics()', () => {
    test('should return correct service name', () => {
      const metrics = service.getMetrics();
      expect(metrics.service).toBe('BaseService');
    });

    test('should return uptime as positive number', () => {
      const metrics = service.getMetrics();
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });

    test('should return correct operation counts', () => {
      service.metrics.operations = 10;
      service.metrics.successes = 8;
      service.metrics.errors = 2;
      const metrics = service.getMetrics();
      expect(metrics.operations).toBe(10);
      expect(metrics.successes).toBe(8);
      expect(metrics.errors).toBe(2);
    });

    test('should calculate correct success rate', () => {
      service.metrics.operations = 10;
      service.metrics.successes = 7;
      const metrics = service.getMetrics();
      expect(metrics.successRate).toBe(70);
    });

    test('should handle zero operations without division by zero', () => {
      const metrics = service.getMetrics();
      expect(metrics.successRate).toBe(0);
      expect(metrics.operations).toBe(0);
    });

    test('should include timestamp', () => {
      const metrics = service.getMetrics();
      expect(metrics.timestamp).toBeDefined();
      expect(typeof metrics.timestamp).toBe('string');
    });

    test('should round success rate to two decimal places', () => {
      service.metrics.operations = 3;
      service.metrics.successes = 1;
      const metrics = service.getMetrics();
      // 1/3 * 100 = 33.333... => rounded to 33.33
      expect(metrics.successRate).toBe(33.33);
    });
  });

  describe('createError()', () => {
    test('should return an Error instance', () => {
      const err = service.createError('something wrong');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('something wrong');
    });

    test('should set code on error', () => {
      const err = service.createError('msg', 'NOT_FOUND');
      expect(err.code).toBe('NOT_FOUND');
    });

    test('should use INTERNAL_ERROR as default code', () => {
      const err = service.createError('msg');
      expect(err.code).toBe('INTERNAL_ERROR');
    });

    test('should set service name on error', () => {
      const err = service.createError('msg');
      expect(err.service).toBe('BaseService');
    });

    test('should set details on error', () => {
      const err = service.createError('msg', 'CODE', { field: 'value' });
      expect(err.details).toEqual({ field: 'value' });
    });

    test('should set timestamp on error', () => {
      const err = service.createError('msg');
      expect(err.timestamp).toBeDefined();
      expect(typeof err.timestamp).toBe('string');
    });

    test('should default details to empty object', () => {
      const err = service.createError('msg', 'CODE');
      expect(err.details).toEqual({});
    });
  });

  describe('createResponse()', () => {
    test('should return standardized success response', () => {
      const resp = service.createResponse({ id: 1 });
      expect(resp.success).toBe(true);
      expect(resp.data).toEqual({ id: 1 });
      expect(resp.message).toBe('Operation successful');
    });

    test('should accept custom message', () => {
      const resp = service.createResponse(null, 'Custom done');
      expect(resp.message).toBe('Custom done');
    });

    test('should include service name in metadata', () => {
      const resp = service.createResponse('data');
      expect(resp.metadata.service).toBe('BaseService');
    });

    test('should include timestamp in metadata', () => {
      const resp = service.createResponse('data');
      expect(resp.metadata.timestamp).toBeDefined();
    });

    test('should merge additional metadata', () => {
      const resp = service.createResponse('data', 'ok', { extra: true });
      expect(resp.metadata.extra).toBe(true);
    });
  });

  describe('shutdown()', () => {
    test('should log shutdown with metrics', async () => {
      await service.shutdown();
      const allLogCalls = mockConsole.log.mock.calls.map(c => c[0]);
      expect(allLogCalls.some(msg => msg.includes('Shutting down service'))).toBe(true);
    });

    test('should include metrics in shutdown log context', async () => {
      service.metrics.operations = 5;
      service.metrics.successes = 3;
      service.metrics.errors = 2;
      await service.shutdown();
      const shutdownCall = mockConsole.log.mock.calls.find(c => c[0].includes('Shutting down'));
      const context = shutdownCall[1];
      expect(context.operations).toBe(5);
    });

    test('should resolve without errors', async () => {
      await expect(service.shutdown()).resolves.toBeUndefined();
    });
  });
});

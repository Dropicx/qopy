const UploadRepository = require('../../../services/UploadRepository');

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

describe('UploadRepository', () => {
  let repo;
  let mockPool;
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    };
    mockRedis = {
      isConnected: jest.fn().mockReturnValue(true),
      del: jest.fn().mockResolvedValue(1)
    };
    repo = new UploadRepository(mockPool, mockRedis);
  });

  describe('constructor', () => {
    test('should set pool', () => {
      expect(repo.pool).toBe(mockPool);
    });

    test('should set redis', () => {
      expect(repo.redis).toBe(mockRedis);
    });

    test('should accept null redis', () => {
      const r = new UploadRepository(mockPool, null);
      expect(r.redis).toBeNull();
    });

    test('should accept undefined redis', () => {
      const r = new UploadRepository(mockPool, undefined);
      expect(r.redis).toBeUndefined();
    });
  });

  describe('createClip()', () => {
    test('should insert text clip correctly', async () => {
      const clipData = {
        clipId: 'abc123',
        session: {
          is_text_content: true,
          expiration_time: 1700000000,
          one_time: false,
          quick_share: false,
          original_filename: null,
          mime_type: 'text/plain'
        },
        filePath: null,
        actualFilesize: 256,
        isFile: false,
        passwordHash: null,
        accessCodeHash: null,
        shouldRequireAccessCode: false,
        fileMetadata: {}
      };

      await repo.createClip(clipData);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO clips');
      expect(params[0]).toBe('abc123');
      expect(params[1]).toBe('text');
      expect(params[7]).toBeNull(); // file_path null for text when isFile=false
      expect(params[11]).toBe(false); // is_file
    });

    test('should insert file clip correctly', async () => {
      const clipData = {
        clipId: 'file123',
        session: {
          is_text_content: false,
          expiration_time: 1700000000,
          one_time: false,
          quick_share: false,
          original_filename: 'photo.jpg',
          mime_type: 'image/jpeg'
        },
        filePath: '/uploads/files/file123.enc',
        actualFilesize: 1048576,
        isFile: true,
        passwordHash: 'client-encrypted',
        accessCodeHash: null,
        shouldRequireAccessCode: false,
        fileMetadata: { chunks: 3 }
      };

      await repo.createClip(clipData);

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[1]).toBe('file');
      expect(params[7]).toBe('/uploads/files/file123.enc');
      expect(params[8]).toBe('photo.jpg');
      expect(params[9]).toBe('image/jpeg');
      expect(params[10]).toBe(1048576);
      expect(params[11]).toBe(true);
      expect(params[12]).toBe(JSON.stringify({ chunks: 3 }));
    });

    test('should handle null optional fields', async () => {
      const clipData = {
        clipId: 'min123',
        session: {
          is_text_content: true,
          expiration_time: 1700000000,
          one_time: false,
          quick_share: false,
          original_filename: null,
          mime_type: null
        },
        filePath: null,
        actualFilesize: 0,
        isFile: false,
        passwordHash: null,
        accessCodeHash: null,
        shouldRequireAccessCode: false,
        fileMetadata: null
      };

      await repo.createClip(clipData);

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[3]).toBeNull(); // passwordHash
      expect(params[8]).toBeNull(); // original_filename
      expect(params[9]).toBeNull(); // mime_type
      expect(params[13]).toBeNull(); // accessCodeHash
      expect(params[14]).toBe(false); // shouldRequireAccessCode
    });

    test('should handle password-protected clip', async () => {
      const clipData = {
        clipId: 'pass123',
        session: {
          is_text_content: true,
          expiration_time: 1700000000,
          one_time: false,
          quick_share: false,
          original_filename: null,
          mime_type: 'text/plain'
        },
        filePath: null,
        actualFilesize: 100,
        isFile: false,
        passwordHash: 'client-encrypted',
        accessCodeHash: '$2b$10$abcdefghijklmnop',
        shouldRequireAccessCode: true,
        fileMetadata: {}
      };

      await repo.createClip(clipData);

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[3]).toBe('client-encrypted');
      expect(params[13]).toBe('$2b$10$abcdefghijklmnop');
      expect(params[14]).toBe(true);
    });

    test('should handle quick share clip', async () => {
      const clipData = {
        clipId: 'qk1234',
        session: {
          is_text_content: true,
          expiration_time: 1700000300,
          one_time: false,
          quick_share: true,
          original_filename: null,
          mime_type: 'text/plain'
        },
        filePath: null,
        actualFilesize: 50,
        isFile: false,
        passwordHash: 'quick-share-hash',
        accessCodeHash: null,
        shouldRequireAccessCode: false,
        fileMetadata: {}
      };

      await repo.createClip(clipData);

      const [, params] = mockPool.query.mock.calls[0];
      expect(params[5]).toBe(true); // quick_share
    });

    test('should handle database error', async () => {
      mockPool.query.mockRejectedValue(new Error('connection refused'));
      const clipData = {
        clipId: 'err123',
        session: {
          is_text_content: true,
          expiration_time: 1700000000,
          one_time: false,
          quick_share: false,
          original_filename: null,
          mime_type: null
        },
        filePath: null,
        actualFilesize: 0,
        isFile: false,
        passwordHash: null,
        accessCodeHash: null,
        shouldRequireAccessCode: false,
        fileMetadata: {}
      };

      await expect(repo.createClip(clipData)).rejects.toThrow('connection refused');
    });
  });

  describe('updateStatistics()', () => {
    test('should call updateStatisticsFn with stat type', async () => {
      const fn = jest.fn().mockResolvedValue();
      await repo.updateStatistics('clip_created', fn);
      expect(fn).toHaveBeenCalledWith('clip_created');
    });

    test('should throw when fn not provided', async () => {
      await expect(repo.updateStatistics('clip_created', null)).rejects.toThrow(
        'updateStatistics function not provided'
      );
    });

    test('should throw when fn is undefined', async () => {
      await expect(repo.updateStatistics('clip_created', undefined)).rejects.toThrow(
        'updateStatistics function not provided'
      );
    });

    test('should propagate errors from updateStatisticsFn', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('db error'));
      await expect(repo.updateStatistics('clip_created', fn)).rejects.toThrow('db error');
    });
  });

  describe('updateSessionStatistics()', () => {
    test('should always call clip_created', async () => {
      const fn = jest.fn().mockResolvedValue();
      const session = { quick_share: false, has_password: false, one_time: false };
      await repo.updateSessionStatistics(session, fn);
      expect(fn).toHaveBeenCalledWith('clip_created');
    });

    test('should call quick_share_created for quick share', async () => {
      const fn = jest.fn().mockResolvedValue();
      const session = { quick_share: true, has_password: false, one_time: false };
      await repo.updateSessionStatistics(session, fn);
      expect(fn).toHaveBeenCalledWith('quick_share_created');
      expect(fn).not.toHaveBeenCalledWith('normal_created');
      expect(fn).not.toHaveBeenCalledWith('password_protected_created');
    });

    test('should call password_protected_created for password-protected clip', async () => {
      const fn = jest.fn().mockResolvedValue();
      const session = { quick_share: false, has_password: true, one_time: false };
      await repo.updateSessionStatistics(session, fn);
      expect(fn).toHaveBeenCalledWith('password_protected_created');
      expect(fn).not.toHaveBeenCalledWith('normal_created');
    });

    test('should call normal_created for regular clip', async () => {
      const fn = jest.fn().mockResolvedValue();
      const session = { quick_share: false, has_password: false, one_time: false };
      await repo.updateSessionStatistics(session, fn);
      expect(fn).toHaveBeenCalledWith('normal_created');
    });

    test('should call one_time_created when one_time is true', async () => {
      const fn = jest.fn().mockResolvedValue();
      const session = { quick_share: false, has_password: false, one_time: true };
      await repo.updateSessionStatistics(session, fn);
      expect(fn).toHaveBeenCalledWith('one_time_created');
      expect(fn).toHaveBeenCalledWith('normal_created');
    });

    test('should not call one_time_created when one_time is false', async () => {
      const fn = jest.fn().mockResolvedValue();
      const session = { quick_share: false, has_password: false, one_time: false };
      await repo.updateSessionStatistics(session, fn);
      expect(fn).not.toHaveBeenCalledWith('one_time_created');
    });

    test('should handle quick_share + one_time combination', async () => {
      const fn = jest.fn().mockResolvedValue();
      const session = { quick_share: true, has_password: false, one_time: true };
      await repo.updateSessionStatistics(session, fn);
      expect(fn).toHaveBeenCalledWith('clip_created');
      expect(fn).toHaveBeenCalledWith('quick_share_created');
      expect(fn).toHaveBeenCalledWith('one_time_created');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should prioritize quick_share over has_password', async () => {
      const fn = jest.fn().mockResolvedValue();
      const session = { quick_share: true, has_password: true, one_time: false };
      await repo.updateSessionStatistics(session, fn);
      expect(fn).toHaveBeenCalledWith('quick_share_created');
      expect(fn).not.toHaveBeenCalledWith('password_protected_created');
    });
  });

  describe('cleanupUploadSession()', () => {
    test('should delete chunks and sessions from database', async () => {
      await repo.cleanupUploadSession('upload-123');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM file_chunks WHERE upload_id = $1',
        ['upload-123']
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM upload_sessions WHERE upload_id = $1',
        ['upload-123']
      );
    });

    test('should delete chunks before sessions (foreign key order)', async () => {
      await repo.cleanupUploadSession('upload-456');
      const calls = mockPool.query.mock.calls;
      expect(calls[0][0]).toContain('file_chunks');
      expect(calls[1][0]).toContain('upload_sessions');
    });

    test('should delete Redis cache when connected', async () => {
      await repo.cleanupUploadSession('upload-789');
      expect(mockRedis.del).toHaveBeenCalledWith('upload:upload-789');
    });

    test('should handle no Redis (null)', async () => {
      const repoNoRedis = new UploadRepository(mockPool, null);
      await repoNoRedis.cleanupUploadSession('upload-abc');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      // Should not throw
    });

    test('should handle Redis not connected', async () => {
      mockRedis.isConnected.mockReturnValue(false);
      await repo.cleanupUploadSession('upload-def');
      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    test('should handle undefined redis', async () => {
      const repoUndef = new UploadRepository(mockPool, undefined);
      await expect(repoUndef.cleanupUploadSession('upload-xyz')).resolves.toBeUndefined();
    });

    test('should propagate database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('db gone'));
      await expect(repo.cleanupUploadSession('upload-err')).rejects.toThrow('db gone');
    });

    test('should handle Redis without isConnected method', async () => {
      const redisNoMethod = { del: jest.fn() };
      const repoWeird = new UploadRepository(mockPool, redisNoMethod);
      await repoWeird.cleanupUploadSession('upload-no-method');
      // isConnected is falsy so del should not be called
      expect(redisNoMethod.del).not.toHaveBeenCalled();
    });
  });
});

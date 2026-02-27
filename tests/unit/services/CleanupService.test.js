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

// Mock fs-extra
jest.mock('fs-extra', () => ({
  pathExists: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn()
}));

// Mock fileOperations
jest.mock('../../../services/utils/fileOperations', () => ({
  safeDeleteFile: jest.fn()
}));

// Mock concurrencyLimiter - createLimiter returns a function that just executes the fn immediately
jest.mock('../../../services/utils/concurrencyLimiter', () => ({
  createLimiter: jest.fn(() => (fn) => fn())
}));

// Mock BaseService
jest.mock('../../../services/core/BaseService', () => {
  return class BaseService {
    constructor() {
      this.logger = console;
      this.name = this.constructor.name;
      this.startTime = Date.now();
      this.metrics = { operations: 0, errors: 0, successes: 0 };
    }
    log() {}
    logInfo() {}
    logWarning() {}
    logError() {}
    logSuccess() {}
    getMetrics() { return {}; }
    async shutdown() {}
  };
});

const CleanupService = require('../../../services/CleanupService');
const { safeDeleteFile } = require('../../../services/utils/fileOperations');
const { createLimiter } = require('../../../services/utils/concurrencyLimiter');
const fs = require('fs-extra');

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

describe('CleanupService', () => {
  let service;
  let mockPool;
  let mockRedis;
  let mockGetRedis;
  const storagePath = '/tmp/test-storage';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockPool = {
      query: jest.fn()
    };

    mockRedis = {
      del: jest.fn().mockResolvedValue(1)
    };

    mockGetRedis = jest.fn(() => mockRedis);

    service = new CleanupService(mockPool, storagePath, mockGetRedis);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Constructor ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    test('should set pool property', () => {
      expect(service.pool).toBe(mockPool);
    });

    test('should set storagePath property', () => {
      expect(service.storagePath).toBe(storagePath);
    });

    test('should set getRedis property', () => {
      expect(service.getRedis).toBe(mockGetRedis);
    });

    test('should initialize _cleanupInterval to null', () => {
      expect(service._cleanupInterval).toBeNull();
    });

    test('should extend BaseService', () => {
      const BaseService = require('../../../services/core/BaseService');
      expect(service).toBeInstanceOf(BaseService);
    });
  });

  // ─── cleanupExpiredClips ───────────────────────────────────────────────────

  describe('cleanupExpiredClips', () => {
    const nowTimestamp = 1700000000000;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(nowTimestamp);
    });

    afterEach(() => {
      Date.now.mockRestore();
    });

    // Step 1: Delete files for expired clips
    test('should delete files for expired clips with file_path', async () => {
      const expiredRows = [
        { clip_id: 'abc123', file_path: '/storage/files/abc123.enc' },
        { clip_id: 'def456', file_path: '/storage/files/def456.enc' }
      ];
      mockPool.query
        .mockResolvedValueOnce({ rows: expiredRows }) // step 1: fetch expired clips with files
        .mockResolvedValueOnce({ rowCount: 1 })       // step 2: mark expired
        .mockResolvedValueOnce({ rowCount: 0 })       // step 3: delete old expired
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] }); // step 4: sequence check

      safeDeleteFile.mockResolvedValue({ success: true });

      await service.cleanupExpiredClips();

      expect(safeDeleteFile).toHaveBeenCalledTimes(2);
      expect(safeDeleteFile).toHaveBeenCalledWith('/storage/files/abc123.enc');
      expect(safeDeleteFile).toHaveBeenCalledWith('/storage/files/def456.enc');
    });

    test('should handle clips without file_path (null file_path in row)', async () => {
      const expiredRows = [
        { clip_id: 'abc123', file_path: null },
        { clip_id: 'def456', file_path: '' }
      ];
      mockPool.query
        .mockResolvedValueOnce({ rows: expiredRows })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] });

      await service.cleanupExpiredClips();

      expect(safeDeleteFile).not.toHaveBeenCalled();
    });

    test('should handle no expired clips with files', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })           // no expired clips with files
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '50' }] });

      await service.cleanupExpiredClips();

      expect(safeDeleteFile).not.toHaveBeenCalled();
    });

    test('should handle safeDeleteFile returning failure (non-critical)', async () => {
      const expiredRows = [
        { clip_id: 'abc123', file_path: '/storage/files/abc123.enc' }
      ];
      mockPool.query
        .mockResolvedValueOnce({ rows: expiredRows })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] });

      safeDeleteFile.mockResolvedValue({ success: false, error: 'File not found' });

      await service.cleanupExpiredClips();

      // Should not throw, continues execution
      expect(safeDeleteFile).toHaveBeenCalledTimes(1);
      // Step 2 still runs
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });

    test('should handle safeDeleteFile throwing error (non-critical)', async () => {
      const expiredRows = [
        { clip_id: 'abc123', file_path: '/storage/files/abc123.enc' },
        { clip_id: 'def456', file_path: '/storage/files/def456.enc' }
      ];
      mockPool.query
        .mockResolvedValueOnce({ rows: expiredRows })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] });

      safeDeleteFile
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce({ success: true });

      await service.cleanupExpiredClips();

      // Both files attempted, error caught, execution continues
      expect(safeDeleteFile).toHaveBeenCalledTimes(2);
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error deleting file for clip abc123'),
        expect.any(String)
      );
    });

    test('should handle query error in step 1 (fetch expired clips with files)', async () => {
      mockPool.query
        .mockRejectedValueOnce(new Error('Connection refused')) // step 1 fails
        .mockResolvedValueOnce({ rowCount: 0 })                // step 2 continues
        .mockResolvedValueOnce({ rowCount: 0 })                // step 3 continues
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] }); // step 4

      await service.cleanupExpiredClips();

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching expired clips with files'),
        expect.any(String)
      );
      // Subsequent steps still execute
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });

    // Step 2: Mark clips as expired
    test('should mark clips as expired (step 2)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 5 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] });

      await service.cleanupExpiredClips();

      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE clips SET is_expired = true WHERE expiration_time < $1 AND is_expired = false',
        [nowTimestamp]
      );
    });

    test('should handle error marking clips as expired (step 2)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('DB write error'))
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] });

      await service.cleanupExpiredClips();

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error marking clips as expired'),
        expect.any(String)
      );
      // Step 3 and 4 still execute
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });

    // Step 3: Delete old expired clips
    test('should delete old expired clips (step 3)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 3 })
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] });

      await service.cleanupExpiredClips();

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM clips WHERE is_expired = true AND expiration_time < $1',
        [nowTimestamp - (5 * 60 * 1000)]
      );
    });

    test('should handle error deleting old expired clips (step 3)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] });

      await service.cleanupExpiredClips();

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error deleting old expired clips'),
        expect.any(String)
      );
      // Step 4 still executes
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });

    // Step 4: Sequence check/reset
    test('should reset sequence when current value > 2 billion', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '2500000000' }] })  // > 2 billion
        .mockResolvedValueOnce({ rows: [{ max_id: '500' }] })             // max id
        .mockResolvedValueOnce({ rowCount: 0 });                           // alter sequence

      await service.cleanupExpiredClips();

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT COALESCE(MAX(id), 0) as max_id FROM clips'
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        'ALTER SEQUENCE clips_id_seq RESTART WITH $1',
        [1500] // max(1, 500 + 1000)
      );
    });

    test('should not reset sequence when current value < 2 billion', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '1000000' }] });

      await service.cleanupExpiredClips();

      // Only 4 queries: steps 1-4, no additional queries for max_id/alter
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });

    test('should use max(1, maxId + 1000) for new start value when maxId is 0', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '3000000000' }] })
        .mockResolvedValueOnce({ rows: [{ max_id: '0' }] })
        .mockResolvedValueOnce({ rowCount: 0 });

      await service.cleanupExpiredClips();

      expect(mockPool.query).toHaveBeenCalledWith(
        'ALTER SEQUENCE clips_id_seq RESTART WITH $1',
        [1000] // max(1, 0 + 1000)
      );
    });

    test('should handle sequence check error (step 4)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockRejectedValueOnce(new Error('Sequence query failed'));

      await service.cleanupExpiredClips();

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking/resetting sequence'),
        expect.any(String)
      );
    });

    test('should pass current timestamp to step 1 query', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] });

      await service.cleanupExpiredClips();

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT clip_id, file_path FROM clips WHERE expiration_time < $1 AND is_expired = false AND file_path IS NOT NULL',
        [nowTimestamp]
      );
    });
  });

  // ─── cleanupExpiredUploads ─────────────────────────────────────────────────

  describe('cleanupExpiredUploads', () => {
    const nowTimestamp = 1700000000000;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(nowTimestamp);
    });

    afterEach(() => {
      Date.now.mockRestore();
    });

    test('should get expired sessions and batch delete chunks', async () => {
      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }, { upload_id: 'upload-2' }]
      };
      const allChunks = {
        rows: [
          { storage_path: '/chunks/upload-1/0' },
          { storage_path: '/chunks/upload-1/1' },
          { storage_path: '/chunks/upload-2/0' }
        ]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)           // expired sessions
        .mockResolvedValueOnce(allChunks)                  // chunk paths
        .mockResolvedValueOnce({ rowCount: 3 })            // delete chunks from DB
        .mockResolvedValueOnce({ rowCount: 2 })            // delete sessions from DB
        .mockResolvedValueOnce({ rows: [] });              // orphaned files

      safeDeleteFile.mockResolvedValue({ success: true });

      await service.cleanupExpiredUploads();

      expect(safeDeleteFile).toHaveBeenCalledTimes(3);
      expect(safeDeleteFile).toHaveBeenCalledWith('/chunks/upload-1/0');
      expect(safeDeleteFile).toHaveBeenCalledWith('/chunks/upload-1/1');
      expect(safeDeleteFile).toHaveBeenCalledWith('/chunks/upload-2/0');
    });

    test('should handle no expired sessions (early return)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })   // no expired sessions
        .mockResolvedValueOnce({ rows: [] });  // orphaned files

      await service.cleanupExpiredUploads();

      // Should skip chunk deletion and session cleanup
      expect(safeDeleteFile).not.toHaveBeenCalled();
      // Only 2 queries: expired sessions + orphaned files
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    test('should handle expired sessions with no chunks', async () => {
      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)
        .mockResolvedValueOnce({ rows: [] })              // no chunks
        .mockResolvedValueOnce({ rowCount: 0 })           // delete chunks from DB
        .mockResolvedValueOnce({ rowCount: 1 })           // delete sessions from DB
        .mockResolvedValueOnce({ rows: [] });             // orphaned files

      await service.cleanupExpiredUploads();

      expect(safeDeleteFile).not.toHaveBeenCalled();
      expect(createLimiter).not.toHaveBeenCalled();
    });

    test('should handle file deletion failures (non-critical)', async () => {
      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }]
      };
      const allChunks = {
        rows: [{ storage_path: '/chunks/upload-1/0' }]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)
        .mockResolvedValueOnce(allChunks)
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      safeDeleteFile.mockResolvedValue({ success: false, error: 'ENOENT' });

      // Should not throw
      await service.cleanupExpiredUploads();

      expect(safeDeleteFile).toHaveBeenCalledTimes(1);
      // DB cleanup still proceeds
      expect(mockPool.query).toHaveBeenCalledTimes(5);
    });

    test('should batch delete DB records for expired sessions', async () => {
      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }, { upload_id: 'upload-2' }]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)
        .mockResolvedValueOnce({ rows: [] })              // no chunks
        .mockResolvedValueOnce({ rowCount: 0 })           // delete file_chunks
        .mockResolvedValueOnce({ rowCount: 2 })           // delete upload_sessions
        .mockResolvedValueOnce({ rows: [] });             // orphaned files

      await service.cleanupExpiredUploads();

      const expiredIds = ['upload-1', 'upload-2'];
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM file_chunks WHERE upload_id = ANY($1)',
        [expiredIds]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM upload_sessions WHERE upload_id = ANY($1)',
        [expiredIds]
      );
    });

    test('should clean Redis cache for expired sessions', async () => {
      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }, { upload_id: 'upload-2' }]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 2 })
        .mockResolvedValueOnce({ rows: [] });

      await service.cleanupExpiredUploads();

      expect(mockGetRedis).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith('upload:upload-1');
      expect(mockRedis.del).toHaveBeenCalledWith('upload:upload-2');
    });

    test('should handle no Redis (getRedis returns null)', async () => {
      mockGetRedis.mockReturnValue(null);

      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      // Should not throw when redis is null
      await service.cleanupExpiredUploads();

      expect(mockGetRedis).toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    test('should handle Redis del failure gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis connection lost'));

      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      // Should not throw - the .catch(() => {}) in the code handles it
      await service.cleanupExpiredUploads();

      expect(mockRedis.del).toHaveBeenCalledWith('upload:upload-1');
    });

    test('should handle orphaned files cleanup', async () => {
      const orphanedFiles = {
        rows: [
          { file_path: '/storage/files/orphan1.enc' },
          { file_path: '/storage/files/orphan2.enc' }
        ]
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })  // no expired sessions
        .mockResolvedValueOnce(orphanedFiles); // orphaned files

      safeDeleteFile.mockResolvedValue({ success: true });

      await service.cleanupExpiredUploads();

      expect(createLimiter).toHaveBeenCalledWith(10);
      expect(safeDeleteFile).toHaveBeenCalledTimes(2);
      expect(safeDeleteFile).toHaveBeenCalledWith('/storage/files/orphan1.enc');
      expect(safeDeleteFile).toHaveBeenCalledWith('/storage/files/orphan2.enc');
    });

    test('should handle no orphaned files', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })   // no expired sessions
        .mockResolvedValueOnce({ rows: [] });  // no orphaned files

      await service.cleanupExpiredUploads();

      expect(safeDeleteFile).not.toHaveBeenCalled();
    });

    test('should handle overall error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database unavailable'));

      await service.cleanupExpiredUploads();

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error cleaning up expired uploads'),
        expect.any(String)
      );
    });

    test('should pass correct parameters to expired sessions query', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.cleanupExpiredUploads();

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT upload_id FROM upload_sessions WHERE expiration_time < $1 OR (status = $2 AND last_activity < $3)',
        [nowTimestamp, 'uploading', nowTimestamp - (24 * 60 * 60 * 1000)]
      );
    });

    test('should pass correct timestamp to orphaned files query', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.cleanupExpiredUploads();

      const orphanedQuery = mockPool.query.mock.calls[1];
      expect(orphanedQuery[0]).toContain('SELECT file_path FROM clips');
      expect(orphanedQuery[1]).toEqual([nowTimestamp]);
    });

    test('should use concurrency limiter with limit of 10 for chunk deletion', async () => {
      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }]
      };
      const allChunks = {
        rows: [{ storage_path: '/chunks/0' }, { storage_path: '/chunks/1' }]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)
        .mockResolvedValueOnce(allChunks)
        .mockResolvedValueOnce({ rowCount: 2 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      safeDeleteFile.mockResolvedValue({ success: true });

      await service.cleanupExpiredUploads();

      expect(createLimiter).toHaveBeenCalledWith(10);
    });

    test('should handle mixed successful and failed file deletions', async () => {
      const expiredSessions = {
        rows: [{ upload_id: 'upload-1' }]
      };
      const allChunks = {
        rows: [
          { storage_path: '/chunks/0' },
          { storage_path: '/chunks/1' },
          { storage_path: '/chunks/2' }
        ]
      };

      mockPool.query
        .mockResolvedValueOnce(expiredSessions)
        .mockResolvedValueOnce(allChunks)
        .mockResolvedValueOnce({ rowCount: 3 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      safeDeleteFile
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'ENOENT' })
        .mockResolvedValueOnce({ success: true });

      await service.cleanupExpiredUploads();

      expect(safeDeleteFile).toHaveBeenCalledTimes(3);
      // DB cleanup still proceeds
      expect(mockPool.query).toHaveBeenCalledTimes(5);
    });
  });

  // ─── cleanupUploadStatistics ──────────────────────────────────────────────

  describe('cleanupUploadStatistics', () => {
    test('should delete rows older than 90 days by default', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 5 });

      await service.cleanupUploadStatistics();

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM upload_statistics WHERE date < $1',
        [expect.any(String)]
      );
      // Verify the cutoff date is roughly 90 days ago
      const cutoffDate = mockPool.query.mock.calls[0][1][0];
      const daysDiff = (Date.now() - new Date(cutoffDate).getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThanOrEqual(89);
      expect(daysDiff).toBeLessThanOrEqual(91);
    });

    test('should accept custom retention period', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 2 });

      await service.cleanupUploadStatistics(30);

      const cutoffDate = mockPool.query.mock.calls[0][1][0];
      const daysDiff = (Date.now() - new Date(cutoffDate).getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    test('should log when rows are deleted', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 10 });

      await service.cleanupUploadStatistics();

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 10 old upload_statistics rows')
      );
    });

    test('should not log when no rows are deleted', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      await service.cleanupUploadStatistics();

      expect(mockConsole.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up')
      );
    });

    test('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      await service.cleanupUploadStatistics();

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Error cleaning up upload statistics'),
        'DB error'
      );
    });
  });

  // ─── start ─────────────────────────────────────────────────────────────────

  describe('start', () => {
    test('should set interval with default interval', () => {
      service.start();

      expect(service._cleanupInterval).not.toBeNull();
    });

    test('should set interval with custom interval', () => {
      service.start(30000);

      expect(service._cleanupInterval).not.toBeNull();
    });

    test('should call cleanupExpiredClips, cleanupExpiredUploads, and cleanupUploadStatistics on interval tick', async () => {
      const cleanupClipsSpy = jest.spyOn(service, 'cleanupExpiredClips').mockResolvedValue();
      const cleanupUploadsSpy = jest.spyOn(service, 'cleanupExpiredUploads').mockResolvedValue();
      const cleanupStatsSpy = jest.spyOn(service, 'cleanupUploadStatistics').mockResolvedValue();

      service.start(1000);

      // Advance timers by one interval
      jest.advanceTimersByTime(1000);

      // Allow the async callback to resolve
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(cleanupClipsSpy).toHaveBeenCalledTimes(1);
      expect(cleanupUploadsSpy).toHaveBeenCalledTimes(1);
      expect(cleanupStatsSpy).toHaveBeenCalledTimes(1);

      cleanupClipsSpy.mockRestore();
      cleanupUploadsSpy.mockRestore();
      cleanupStatsSpy.mockRestore();
    });

    test('should use default interval of 60000ms', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      service.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);

      setIntervalSpy.mockRestore();
    });
  });

  // ─── stop ──────────────────────────────────────────────────────────────────

  describe('stop', () => {
    test('should clear interval and set to null', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.start();
      expect(service._cleanupInterval).not.toBeNull();

      service.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(service._cleanupInterval).toBeNull();

      clearIntervalSpy.mockRestore();
    });

    test('should handle no interval (already stopped)', () => {
      expect(service._cleanupInterval).toBeNull();

      // Should not throw
      service.stop();

      expect(service._cleanupInterval).toBeNull();
    });

    test('should not call clearInterval when no interval exists', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.stop();

      expect(clearIntervalSpy).not.toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  // ─── shutdown ──────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    test('should call stop and super.shutdown', async () => {
      const stopSpy = jest.spyOn(service, 'stop');

      service.start();

      await service.shutdown();

      expect(stopSpy).toHaveBeenCalled();
      expect(service._cleanupInterval).toBeNull();

      stopSpy.mockRestore();
    });

    test('should work when no interval is active', async () => {
      // Should not throw even when _cleanupInterval is null
      await service.shutdown();

      expect(service._cleanupInterval).toBeNull();
    });
  });

  // ─── Integration-style scenarios ──────────────────────────────────────────

  describe('Full cleanup cycle', () => {
    const nowTimestamp = 1700000000000;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(nowTimestamp);
    });

    afterEach(() => {
      Date.now.mockRestore();
    });

    test('should run both clip and upload cleanup in sequence', async () => {
      // Setup for cleanupExpiredClips
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })                         // step 1
        .mockResolvedValueOnce({ rowCount: 0 })                     // step 2
        .mockResolvedValueOnce({ rowCount: 0 })                     // step 3
        .mockResolvedValueOnce({ rows: [{ last_value: '100' }] })   // step 4
        // Setup for cleanupExpiredUploads
        .mockResolvedValueOnce({ rows: [] })                         // expired sessions
        .mockResolvedValueOnce({ rows: [] });                        // orphaned files

      await service.cleanupExpiredClips();
      await service.cleanupExpiredUploads();

      expect(mockPool.query).toHaveBeenCalledTimes(6);
    });

    test('should handle errors in clip cleanup without affecting upload cleanup', async () => {
      // All clip cleanup steps fail
      mockPool.query
        .mockRejectedValueOnce(new Error('Step 1 fail'))
        .mockRejectedValueOnce(new Error('Step 2 fail'))
        .mockRejectedValueOnce(new Error('Step 3 fail'))
        .mockRejectedValueOnce(new Error('Step 4 fail'))
        // Upload cleanup succeeds
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.cleanupExpiredClips();
      await service.cleanupExpiredUploads();

      // All 6 queries attempted
      expect(mockPool.query).toHaveBeenCalledTimes(6);
    });
  });
});

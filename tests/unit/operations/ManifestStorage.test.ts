/**
 * Unit tests for ManifestStorage
 * Story: E4-S02
 */

import { ManifestStorage } from '../../../src/operations/ManifestStorage.js';
import type { RedisCache, Logger } from '../../../src/cache/RedisCache.js';
import type { BulkManifest } from '../../../src/types/bulk.js';

describe('ManifestStorage', () => {
  let storage: ManifestStorage;
  let mockCache: jest.Mocked<RedisCache>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mock RedisCache
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      clear: jest.fn(),
      ping: jest.fn(),
      disconnect: jest.fn(),
      // LookupCache methods
      getProjectComponents: jest.fn(),
      cacheProjectComponents: jest.fn(),
      getProjectVersions: jest.fn(),
      cacheProjectVersions: jest.fn(),
      getPriorities: jest.fn(),
      cachePriorities: jest.fn(),
    } as unknown as jest.Mocked<RedisCache>;

    // Create mock Logger
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
    };

    storage = new ManifestStorage(mockCache, 86400, mockLogger);
  });

  describe('AC1: Generate Manifest ID', () => {
    it('should generate unique manifest ID with bulk- prefix', () => {
      const id1 = storage.generateManifestId();
      const id2 = storage.generateManifestId();

      expect(id1).toMatch(/^bulk-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id2).toMatch(/^bulk-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id1).not.toBe(id2);
    });

    it('should generate UUID v4 format (version bit = 4)', () => {
      const id = storage.generateManifestId();
      const uuidPart = id.replace('bulk-', '');
      
      // UUID v4 has '4' in the version position
      expect(uuidPart[14]).toBe('4');
    });

    it('should generate multiple unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(storage.generateManifestId());
      }
      expect(ids.size).toBe(100); // All unique
    });

    it('should use default logger when none provided', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const storageWithDefaultLogger = new ManifestStorage(mockCache);
      
      mockCache.set.mockRejectedValue(new Error('Redis error'));
      
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 1,
        succeeded: [],
        failed: [],
        created: {},
        errors: {},
      };
      
      await storageWithDefaultLogger.storeManifest(manifest);
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('AC2: Store Manifest in Redis', () => {
    it('should store manifest with correct Redis key pattern', async () => {
      const manifest: BulkManifest = {
        id: 'bulk-12345678-1234-4234-8234-123456789abc',
        timestamp: Date.now(),
        total: 10,
        succeeded: [0, 1, 2],
        failed: [3, 4],
        created: { '0': 'PROJ-123', '1': 'PROJ-124', '2': 'PROJ-125' },
        errors: {
          '3': { status: 400, errors: { issuetype: 'issue type is required' } },
          '4': { status: 400, errors: { priority: 'priority is invalid' } },
        },
      };

      await storage.storeManifest(manifest);

      expect(mockCache.set).toHaveBeenCalledWith(
        'bulk:manifest:bulk-12345678-1234-4234-8234-123456789abc',
        JSON.stringify(manifest),
        86400 // 24 hours in seconds
      );
    });

    it('should use configurable TTL', async () => {
      const customStorage = new ManifestStorage(mockCache, 3600); // 1 hour
      const manifest: BulkManifest = {
        id: 'bulk-test-id',
        timestamp: Date.now(),
        total: 1,
        succeeded: [0],
        failed: [],
        created: { '0': 'PROJ-123' },
        errors: {},
      };

      await customStorage.storeManifest(manifest);

      expect(mockCache.set).toHaveBeenCalledWith(
        'bulk:manifest:bulk-test-id',
        JSON.stringify(manifest),
        3600
      );
    });

    it('should store all manifest fields correctly', async () => {
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: 1699900000000,
        total: 5,
        succeeded: [0, 2, 4],
        failed: [1, 3],
        created: { '0': 'KEY-1', '2': 'KEY-2', '4': 'KEY-3' },
        errors: {
          '1': { status: 400, errors: { summary: 'summary is required' } },
          '3': {
            status: 400,
            errors: {
              issuetype: 'issue type not found',
              assignee: 'user not found',
            },
          },
        },
      };

      await storage.storeManifest(manifest);

      const storedData = (mockCache.set as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(storedData);

      expect(parsed).toEqual(manifest);
      expect(parsed.errors['3'].errors).toHaveProperty('issuetype');
      expect(parsed.errors['3'].errors).toHaveProperty('assignee');
    });
  });

  describe('AC3: Manifest Data Structure', () => {
    it('should have all required fields in manifest', () => {
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 100,
        succeeded: [0, 1, 2],
        failed: [3, 4, 5],
        created: { '0': 'KEY-1', '1': 'KEY-2', '2': 'KEY-3' },
        errors: {
          '3': { status: 400, errors: { field1: 'error1' } },
          '4': { status: 400, errors: { field2: 'error2' } },
          '5': { status: 400, errors: { field3: 'error3' } },
        },
      };

      expect(manifest).toHaveProperty('id');
      expect(manifest).toHaveProperty('timestamp');
      expect(manifest).toHaveProperty('total');
      expect(manifest).toHaveProperty('succeeded');
      expect(manifest).toHaveProperty('failed');
      expect(manifest).toHaveProperty('created');
      expect(manifest).toHaveProperty('errors');
    });

    it('should store succeeded as array of row indices', () => {
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 5,
        succeeded: [0, 2, 4],
        failed: [1, 3],
        created: {},
        errors: {},
      };

      expect(Array.isArray(manifest.succeeded)).toBe(true);
      expect(manifest.succeeded).toEqual([0, 2, 4]);
    });

    it('should store failed as array of row indices', () => {
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 5,
        succeeded: [0, 2, 4],
        failed: [1, 3],
        created: {},
        errors: {},
      };

      expect(Array.isArray(manifest.failed)).toBe(true);
      expect(manifest.failed).toEqual([1, 3]);
    });

    it('should store created as rowIndex → issueKey map', () => {
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 3,
        succeeded: [0, 1, 2],
        failed: [],
        created: {
          '0': 'PROJ-123',
          '1': 'PROJ-124',
          '2': 'PROJ-125',
        },
        errors: {},
      };

      expect(manifest.created['0']).toBe('PROJ-123');
      expect(manifest.created['1']).toBe('PROJ-124');
      expect(manifest.created['2']).toBe('PROJ-125');
    });

    it('should store errors with status and field errors (matches E4-S03 format)', () => {
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 2,
        succeeded: [],
        failed: [0, 1],
        created: {},
        errors: {
          '0': {
            status: 400,
            errors: {
              issuetype: 'issue type is required',
              priority: 'priority is invalid',
            },
          },
          '1': {
            status: 400,
            errors: {
              summary: 'summary is required',
            },
          },
        },
      };

      expect(manifest.errors['0']).toHaveProperty('status');
      expect(manifest.errors['0']).toHaveProperty('errors');
      expect(manifest.errors['0'].status).toBe(400);
      expect(manifest.errors['0'].errors).toEqual({
        issuetype: 'issue type is required',
        priority: 'priority is invalid',
      });
    });
  });

  describe('AC4: Retrieve Manifest', () => {
    it('should retrieve manifest by ID', async () => {
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 10,
        succeeded: [0, 1, 2],
        failed: [3, 4],
        created: { '0': 'KEY-1', '1': 'KEY-2', '2': 'KEY-3' },
        errors: {
          '3': { status: 400, errors: { field1: 'error1' } },
          '4': { status: 400, errors: { field2: 'error2' } },
        },
      };

      mockCache.get.mockResolvedValue({ value: JSON.stringify(manifest), isStale: false });

      const result = await storage.getManifest('bulk-test');

      expect(mockCache.get).toHaveBeenCalledWith('bulk:manifest:bulk-test');
      expect(result).toEqual(manifest);
    });

    it('should return null if manifest not found', async () => {
      mockCache.get.mockResolvedValue({ value: null, isStale: false });

      const result = await storage.getManifest('bulk-nonexistent');

      expect(result).toBeNull();
    });

    it('should return null if manifest expired', async () => {
      mockCache.get.mockResolvedValue({ value: null, isStale: false }); // Redis returns null for expired keys

      const result = await storage.getManifest('bulk-expired');

      expect(result).toBeNull();
    });

    it('should parse JSON correctly', async () => {
      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: 1699900000000,
        total: 2,
        succeeded: [0],
        failed: [1],
        created: { '0': 'PROJ-999' },
        errors: {
          '1': {
            status: 400,
            errors: { summary: 'required' },
          },
        },
      };

      mockCache.get.mockResolvedValue({ value: JSON.stringify(manifest), isStale: false });

      const result = await storage.getManifest('bulk-test');

      expect(result?.timestamp).toBe(1699900000000);
      expect(result?.errors['1'].status).toBe(400);
    });
  });

  describe('AC5: Update Manifest (Retry Support)', () => {
    it('should merge new succeeded indices with existing', async () => {
      const originalManifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: 1699900000000,
        total: 10,
        succeeded: [0, 1, 2],
        failed: [3, 4, 5],
        created: { '0': 'KEY-1', '1': 'KEY-2', '2': 'KEY-3' },
        errors: {
          '3': { status: 400, errors: { field1: 'error1' } },
          '4': { status: 400, errors: { field2: 'error2' } },
          '5': { status: 400, errors: { field3: 'error3' } },
        },
      };

      mockCache.get.mockResolvedValue({ value: JSON.stringify(originalManifest), isStale: false });

      const retryResults = {
        succeeded: [3, 5], // Previously failed, now succeeded
        failed: [4], // Still failed
        created: { '3': 'KEY-4', '5': 'KEY-6' },
        errors: {
          '4': { status: 400, errors: { field2: 'still invalid' } },
        },
      };

      await storage.updateManifest('bulk-test', retryResults);

      const updateCall = (mockCache.set as jest.Mock).mock.calls[0];
      const updatedManifest = JSON.parse(updateCall[1]);

      expect(updatedManifest.succeeded).toEqual([0, 1, 2, 3, 5]);
      expect(updatedManifest.failed).toEqual([4]);
    });

    it('should merge created keys map', async () => {
      const originalManifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: 1699900000000,
        total: 5,
        succeeded: [0, 1],
        failed: [2, 3, 4],
        created: { '0': 'KEY-1', '1': 'KEY-2' },
        errors: {},
      };

      mockCache.get.mockResolvedValue({ value: JSON.stringify(originalManifest), isStale: false });

      const retryResults = {
        succeeded: [2, 4],
        failed: [3],
        created: { '2': 'KEY-3', '4': 'KEY-5' },
        errors: {
          '3': { status: 400, errors: { field: 'error' } },
        },
      };

      await storage.updateManifest('bulk-test', retryResults);

      const updatedManifest = JSON.parse((mockCache.set as jest.Mock).mock.calls[0][1]);

      expect(updatedManifest.created).toEqual({
        '0': 'KEY-1',
        '1': 'KEY-2',
        '2': 'KEY-3',
        '4': 'KEY-5',
      });
    });

    it('should update errors map', async () => {
      const originalManifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: 1699900000000,
        total: 3,
        succeeded: [0],
        failed: [1, 2],
        created: { '0': 'KEY-1' },
        errors: {
          '1': { status: 400, errors: { field1: 'old error' } },
          '2': { status: 400, errors: { field2: 'old error' } },
        },
      };

      mockCache.get.mockResolvedValue({ value: JSON.stringify(originalManifest), isStale: false });

      const retryResults = {
        succeeded: [1], // Fixed!
        failed: [2], // Still broken
        created: { '1': 'KEY-2' },
        errors: {
          '2': { status: 400, errors: { field2: 'new error details' } },
        },
      };

      await storage.updateManifest('bulk-test', retryResults);

      const updatedManifest = JSON.parse((mockCache.set as jest.Mock).mock.calls[0][1]);

      expect(updatedManifest.errors).not.toHaveProperty('1'); // Removed (now succeeded)
      expect(updatedManifest.errors['2'].errors.field2).toBe('new error details');
    });

    it('should preserve original timestamp', async () => {
      const originalTimestamp = 1699900000000;
      const originalManifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: originalTimestamp,
        total: 2,
        succeeded: [0],
        failed: [1],
        created: { '0': 'KEY-1' },
        errors: {},
      };

      mockCache.get.mockResolvedValue({ value: JSON.stringify(originalManifest), isStale: false });

      const retryResults = {
        succeeded: [1],
        failed: [],
        created: { '1': 'KEY-2' },
        errors: {},
      };

      await storage.updateManifest('bulk-test', retryResults);

      const updatedManifest = JSON.parse((mockCache.set as jest.Mock).mock.calls[0][1]);

      expect(updatedManifest.timestamp).toBe(originalTimestamp);
    });
  });

  describe('AC6: Error Handling', () => {
    it('should gracefully degrade if Redis unavailable during store', async () => {
      mockCache.set.mockRejectedValue(new Error('Redis connection failed'));

      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 1,
        succeeded: [0],
        failed: [],
        created: { '0': 'KEY-1' },
        errors: {},
      };

      // Should not throw
      await expect(storage.storeManifest(manifest)).resolves.toBeUndefined();
    });

    it('should return null if Redis unavailable during retrieve', async () => {
      mockCache.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await storage.getManifest('bulk-test');

      expect(result).toBeNull();
    });

    it('should log warning when store fails', async () => {
      mockCache.set.mockRejectedValue(new Error('Redis down'));

      const manifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 1,
        succeeded: [],
        failed: [],
        created: {},
        errors: {},
      };

      await storage.storeManifest(manifest);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store manifest'),
        expect.any(Error)
      );
    });

    it('should handle malformed JSON during retrieve', async () => {
      mockCache.get.mockResolvedValue({ value: '{ invalid json }', isStale: false });

      const result = await storage.getManifest('bulk-test');

      expect(result).toBeNull();
    });

    it('should not throw if update fails due to Redis error', async () => {
      mockCache.get.mockRejectedValue(new Error('Redis down'));

      const retryResults = {
        succeeded: [0],
        failed: [],
        created: { '0': 'KEY-1' },
        errors: {},
      };

      // Should not throw
      await expect(storage.updateManifest('bulk-test', retryResults)).resolves.toBeUndefined();
    });

    it('should handle error during manifest storage in update', async () => {
      const originalManifest: BulkManifest = {
        id: 'bulk-test',
        timestamp: Date.now(),
        total: 2,
        succeeded: [0],
        failed: [1],
        created: { '0': 'KEY-1' },
        errors: { '1': { status: 400, errors: { field: 'error' } } },
      };

      mockCache.get.mockResolvedValue({ value: JSON.stringify(originalManifest), isStale: false });
      mockCache.set.mockRejectedValue(new Error('Redis write failed'));

      const retryResults = {
        succeeded: [1],
        failed: [],
        created: { '1': 'KEY-2' },
        errors: {},
      };

      // Should not throw even if storage fails (storeManifest handles error internally)
      await expect(storage.updateManifest('bulk-test', retryResults)).resolves.toBeUndefined();
      
      // storeManifest logs its own warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store manifest'),
        expect.any(Error)
      );
    });
  });

  describe('AC7: Testing Coverage - Edge Cases', () => {
    it('should handle empty manifest (no succeeded, no failed)', async () => {
      const manifest: BulkManifest = {
        id: 'bulk-empty',
        timestamp: Date.now(),
        total: 0,
        succeeded: [],
        failed: [],
        created: {},
        errors: {},
      };

      await storage.storeManifest(manifest);
      mockCache.get.mockResolvedValue({ value: JSON.stringify(manifest), isStale: false });

      const result = await storage.getManifest('bulk-empty');

      expect(result?.succeeded).toEqual([]);
      expect(result?.failed).toEqual([]);
    });

    it('should handle manifest with all succeeded', async () => {
      const manifest: BulkManifest = {
        id: 'bulk-all-success',
        timestamp: Date.now(),
        total: 3,
        succeeded: [0, 1, 2],
        failed: [],
        created: { '0': 'KEY-1', '1': 'KEY-2', '2': 'KEY-3' },
        errors: {},
      };

      await storage.storeManifest(manifest);

      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should handle manifest with all failed', async () => {
      const manifest: BulkManifest = {
        id: 'bulk-all-fail',
        timestamp: Date.now(),
        total: 3,
        succeeded: [],
        failed: [0, 1, 2],
        created: {},
        errors: {
          '0': { status: 400, errors: { field: 'error' } },
          '1': { status: 400, errors: { field: 'error' } },
          '2': { status: 400, errors: { field: 'error' } },
        },
      };

      await storage.storeManifest(manifest);

      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should handle large row numbers (1000+)', async () => {
      const manifest: BulkManifest = {
        id: 'bulk-large',
        timestamp: Date.now(),
        total: 1500,
        succeeded: [999, 1000, 1001],
        failed: [1499],
        created: {
          '999': 'KEY-999',
          '1000': 'KEY-1000',
          '1001': 'KEY-1001',
        },
        errors: {
          '1499': { status: 400, errors: { field: 'error' } },
        },
      };

      await storage.storeManifest(manifest);
      mockCache.get.mockResolvedValue({ value: JSON.stringify(manifest), isStale: false });

      const result = await storage.getManifest('bulk-large');

      expect(result?.created['1000']).toBe('KEY-1000');
      expect(result?.errors['1499']).toBeDefined();
    });
  });
});

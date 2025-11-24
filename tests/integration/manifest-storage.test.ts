/**
 * Integration tests for ManifestStorage with real Redis
 * Story: E4-S02
 */

import { RedisCache } from '../../src/cache/RedisCache.js';
import { ManifestStorage } from '../../src/operations/ManifestStorage.js';
import type { BulkManifest } from '../../src/types/bulk.js';

describe('Integration: ManifestStorage with Real Redis', () => {
  let redisCache: RedisCache;
  let storage: ManifestStorage;

  beforeAll(async () => {
    // Create real Redis connection
    redisCache = new RedisCache({
      host: 'localhost',
      port: 6379,
    });

    // Wait for connection
    await redisCache.ping();
    
    storage = new ManifestStorage(redisCache);
  });

  afterAll(async () => {
    // Clean up test keys
    await redisCache.clear();
    await redisCache.disconnect();
  });

  beforeEach(async () => {
    // Clear test keys before each test
    await redisCache.clear();
  });

  describe('Store and Retrieve Manifest', () => {
    it('should store and retrieve manifest from real Redis', async () => {
      const manifestId = storage.generateManifestId();
      const manifest: BulkManifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 10,
        succeeded: [0, 1, 2, 3, 4],
        failed: [5, 6, 7],
        created: {
          '0': 'ZUL-100',
          '1': 'ZUL-101',
          '2': 'ZUL-102',
          '3': 'ZUL-103',
          '4': 'ZUL-104',
        },
        errors: {
          '5': {
            status: 400,
            errors: {
              issuetype: 'issue type is required',
              priority: 'priority value is invalid',
            },
          },
          '6': {
            status: 400,
            errors: {
              summary: 'summary is required',
            },
          },
          '7': {
            status: 400,
            errors: {
              assignee: 'user not found',
            },
          },
        },
      };

      // Store
      await storage.storeManifest(manifest);

      // Retrieve
      const retrieved = await storage.getManifest(manifestId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(manifestId);
      expect(retrieved?.succeeded).toEqual([0, 1, 2, 3, 4]);
      expect(retrieved?.failed).toEqual([5, 6, 7]);
      expect(retrieved?.created['0']).toBe('ZUL-100');
      expect(retrieved?.errors['5'].errors.issuetype).toBe('issue type is required');
    });

    it('should return null for non-existent manifest', async () => {
      const result = await storage.getManifest('bulk-nonexistent-id');
      expect(result).toBeNull();
    });

    it('should handle multiple manifests independently', async () => {
      const id1 = storage.generateManifestId();
      const id2 = storage.generateManifestId();

      const manifest1: BulkManifest = {
        id: id1,
        timestamp: Date.now(),
        total: 5,
        succeeded: [0, 1],
        failed: [2],
        created: { '0': 'KEY-1', '1': 'KEY-2' },
        errors: { '2': { status: 400, errors: { field: 'error1' } } },
      };

      const manifest2: BulkManifest = {
        id: id2,
        timestamp: Date.now(),
        total: 3,
        succeeded: [0],
        failed: [1],
        created: { '0': 'KEY-10' },
        errors: { '1': { status: 400, errors: { field: 'error2' } } },
      };

      await storage.storeManifest(manifest1);
      await storage.storeManifest(manifest2);

      const retrieved1 = await storage.getManifest(id1);
      const retrieved2 = await storage.getManifest(id2);

      expect(retrieved1?.created['0']).toBe('KEY-1');
      expect(retrieved2?.created['0']).toBe('KEY-10');
    });
  });

  describe('Update Manifest (Retry)', () => {
    it('should update manifest with retry results', async () => {
      const manifestId = storage.generateManifestId();
      const originalManifest: BulkManifest = {
        id: manifestId,
        timestamp: 1699900000000,
        total: 10,
        succeeded: [0, 1, 2],
        failed: [3, 4, 5, 6, 7],
        created: {
          '0': 'ZUL-100',
          '1': 'ZUL-101',
          '2': 'ZUL-102',
        },
        errors: {
          '3': { status: 400, errors: { field1: 'error1' } },
          '4': { status: 400, errors: { field2: 'error2' } },
          '5': { status: 400, errors: { field3: 'error3' } },
          '6': { status: 400, errors: { field4: 'error4' } },
          '7': { status: 400, errors: { field5: 'error5' } },
        },
      };

      // Store original
      await storage.storeManifest(originalManifest);

      // Retry: 3 and 5 succeed, 4/6/7 still fail
      await storage.updateManifest(manifestId, {
        succeeded: [3, 5],
        failed: [4, 6, 7],
        created: {
          '3': 'ZUL-103',
          '5': 'ZUL-105',
        },
        errors: {
          '4': { status: 400, errors: { field2: 'updated error' } },
          '6': { status: 400, errors: { field4: 'updated error' } },
          '7': { status: 400, errors: { field5: 'updated error' } },
        },
      });

      // Verify update
      const updated = await storage.getManifest(manifestId);

      expect(updated).not.toBeNull();
      expect(updated?.succeeded).toEqual([0, 1, 2, 3, 5]);
      expect(updated?.failed).toEqual([4, 6, 7]);
      expect(updated?.created['3']).toBe('ZUL-103');
      expect(updated?.created['5']).toBe('ZUL-105');
      expect(updated?.errors).not.toHaveProperty('3'); // Removed (now succeeded)
      expect(updated?.errors).not.toHaveProperty('5'); // Removed (now succeeded)
      expect(updated?.errors['4'].errors.field2).toBe('updated error');
      expect(updated?.timestamp).toBe(1699900000000); // Preserved
    });

    it('should handle multiple retries in sequence', async () => {
      const manifestId = storage.generateManifestId();
      const original: BulkManifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 5,
        succeeded: [],
        failed: [0, 1, 2, 3, 4],
        created: {},
        errors: {
          '0': { status: 400, errors: { f: 'e' } },
          '1': { status: 400, errors: { f: 'e' } },
          '2': { status: 400, errors: { f: 'e' } },
          '3': { status: 400, errors: { f: 'e' } },
          '4': { status: 400, errors: { f: 'e' } },
        },
      };

      await storage.storeManifest(original);

      // First retry: 0, 1 succeed
      await storage.updateManifest(manifestId, {
        succeeded: [0, 1],
        failed: [2, 3, 4],
        created: { '0': 'K-0', '1': 'K-1' },
        errors: {
          '2': { status: 400, errors: { f: 'e' } },
          '3': { status: 400, errors: { f: 'e' } },
          '4': { status: 400, errors: { f: 'e' } },
        },
      });

      // Second retry: 2, 3 succeed
      await storage.updateManifest(manifestId, {
        succeeded: [2, 3],
        failed: [4],
        created: { '2': 'K-2', '3': 'K-3' },
        errors: {
          '4': { status: 400, errors: { f: 'e' } },
        },
      });

      // Third retry: 4 succeeds
      await storage.updateManifest(manifestId, {
        succeeded: [4],
        failed: [],
        created: { '4': 'K-4' },
        errors: {},
      });

      // All should be succeeded now
      const final = await storage.getManifest(manifestId);
      expect(final?.succeeded).toEqual([0, 1, 2, 3, 4]);
      expect(final?.failed).toEqual([]);
      expect(Object.keys(final?.errors || {})).toHaveLength(0);
    });
  });

  describe('TTL Behavior', () => {
    it('should store manifest with configurable TTL', async () => {
      // Use short TTL for testing (2 seconds)
      const shortTtlStorage = new ManifestStorage(redisCache, 2);
      const manifestId = shortTtlStorage.generateManifestId();

      const manifest: BulkManifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 1,
        succeeded: [0],
        failed: [],
        created: { '0': 'KEY-1' },
        errors: {},
      };

      await shortTtlStorage.storeManifest(manifest);

      // Should exist immediately
      const immediate = await shortTtlStorage.getManifest(manifestId);
      expect(immediate).not.toBeNull();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 2100));

      // Should be expired
      const expired = await shortTtlStorage.getManifest(manifestId);
      expect(expired).toBeNull();
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle Redis disconnection gracefully', async () => {
      const manifestId = storage.generateManifestId();
      const manifest: BulkManifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 1,
        succeeded: [0],
        failed: [],
        created: { '0': 'KEY-1' },
        errors: {},
      };

      // Store while connected
      await storage.storeManifest(manifest);

      // Disconnect Redis
      await redisCache.disconnect();

      // Should not throw, returns null gracefully
      const result = await storage.getManifest(manifestId);
      expect(result).toBeNull();

      // Reconnect for cleanup
      redisCache = new RedisCache({ host: 'localhost', port: 6379 });
      await redisCache.ping();
      storage = new ManifestStorage(redisCache);
    });
  });
});

/**
 * Unit tests for InMemoryCache
 * Tests TTL, staleness, refreshOnce deduplication.
 */

import { InMemoryCache } from '../../../src/cache/InMemoryCache.js';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('get/set', () => {
    it('should return null for missing keys', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toEqual({ value: null, isStale: false });
    });

    it('should store and retrieve a value', async () => {
      await cache.set('key1', 'value1', 60);
      const result = await cache.get('key1');
      expect(result).toEqual({ value: 'value1', isStale: false });
    });

    it('should overwrite existing values', async () => {
      await cache.set('key1', 'original', 60);
      await cache.set('key1', 'updated', 60);
      const result = await cache.get('key1');
      expect(result).toEqual({ value: 'updated', isStale: false });
    });
  });

  describe('TTL and staleness', () => {
    it('should mark entries as stale after soft TTL', async () => {
      // Use a very short TTL
      jest.useFakeTimers();
      
      await cache.set('key1', 'value1', 1); // 1 second TTL
      
      // Before TTL: fresh
      const fresh = await cache.get('key1');
      expect(fresh).toEqual({ value: 'value1', isStale: false });
      
      // After soft TTL but before hard TTL: stale
      jest.advanceTimersByTime(1500); // 1.5 seconds
      const stale = await cache.get('key1');
      expect(stale).toEqual({ value: 'value1', isStale: true });
      
      jest.useRealTimers();
    });

    it('should evict entries after hard TTL', async () => {
      jest.useFakeTimers();
      
      // Default hardTtlMultiplier is 4, so hard TTL = 4 * softTTL
      await cache.set('key1', 'value1', 1); // 1 second soft TTL, 4 second hard TTL
      
      // After hard TTL: evicted
      jest.advanceTimersByTime(5000); // 5 seconds (past 4s hard TTL)
      const result = await cache.get('key1');
      expect(result).toEqual({ value: null, isStale: false });
      
      jest.useRealTimers();
    });

    it('should respect custom hardTtlMultiplier', async () => {
      jest.useFakeTimers();
      
      const shortCache = new InMemoryCache(2); // hardTTL = 2 * softTTL
      await shortCache.set('key1', 'value1', 1); // 1s soft, 2s hard
      
      // At 1.5s: stale but available
      jest.advanceTimersByTime(1500);
      const stale = await shortCache.get('key1');
      expect(stale).toEqual({ value: 'value1', isStale: true });
      
      // At 2.5s: evicted
      jest.advanceTimersByTime(1000);
      const evicted = await shortCache.get('key1');
      expect(evicted).toEqual({ value: null, isStale: false });
      
      jest.useRealTimers();
    });
  });

  describe('delete', () => {
    it('should delete an existing key', async () => {
      await cache.set('key1', 'value1', 60);
      await cache.delete('key1');
      const result = await cache.get('key1');
      expect(result).toEqual({ value: null, isStale: false });
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(cache.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should clear all entries', async () => {
      await cache.set('key1', 'value1', 60);
      await cache.set('key2', 'value2', 60);
      expect(cache.size).toBe(2);
      
      await cache.disconnect();
      expect(cache.size).toBe(0);
    });
  });

  describe('refreshOnce', () => {
    it('should execute the refresh function', async () => {
      const refreshFn = jest.fn().mockResolvedValue(undefined);
      
      await cache.refreshOnce('key1', refreshFn);
      
      expect(refreshFn).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate concurrent refresh calls', async () => {
      let resolveRefresh: () => void;
      const refreshPromise = new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      });
      const refreshFn = jest.fn().mockReturnValue(refreshPromise);

      // Start two concurrent refreshes
      const p1 = cache.refreshOnce('key1', refreshFn);
      const p2 = cache.refreshOnce('key1', refreshFn);

      // Resolve the refresh
      resolveRefresh!();
      await Promise.all([p1, p2]);

      // Only one call should have been made
      expect(refreshFn).toHaveBeenCalledTimes(1);
    });

    it('should allow new refresh after previous completes', async () => {
      const refreshFn = jest.fn().mockResolvedValue(undefined);

      await cache.refreshOnce('key1', refreshFn);
      await cache.refreshOnce('key1', refreshFn);

      expect(refreshFn).toHaveBeenCalledTimes(2);
    });

    it('should clean up tracking on error', async () => {
      const refreshFn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(cache.refreshOnce('key1', refreshFn)).rejects.toThrow('fail');

      // Should allow new refresh after failure
      const successFn = jest.fn().mockResolvedValue(undefined);
      await cache.refreshOnce('key1', successFn);
      expect(successFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('size', () => {
    it('should report correct size', async () => {
      expect(cache.size).toBe(0);
      await cache.set('a', '1', 60);
      expect(cache.size).toBe(1);
      await cache.set('b', '2', 60);
      expect(cache.size).toBe(2);
      await cache.delete('a');
      expect(cache.size).toBe(1);
    });
  });
});

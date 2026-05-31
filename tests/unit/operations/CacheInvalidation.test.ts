/**
 * Tests for CacheInvalidation
 */

import { CacheInvalidation } from '../../../src/operations/CacheInvalidation.js';
import type { CacheAdapter } from '../../../src/cache/CacheAdapter.js';

function createMockCache(): jest.Mocked<CacheAdapter> {
  return {
    get: jest.fn().mockResolvedValue({ value: null, isStale: false }),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    refreshOnce: jest.fn().mockImplementation((_key, fn) => fn()),
  };
}

describe('CacheInvalidation', () => {
  let cache: jest.Mocked<CacheAdapter>;
  let invalidation: CacheInvalidation;

  beforeEach(() => {
    cache = createMockCache();
    invalidation = new CacheInvalidation(cache);
  });

  describe('trackKey()', () => {
    it('tracks keys for later invalidation', async () => {
      invalidation.trackKey('jml:schema:TEST:Bug');
      invalidation.trackKey('jml:user:john');

      const stats = await invalidation.stats();
      expect(stats.keys).toBe(2);
    });

    it('deduplicates tracked keys', async () => {
      invalidation.trackKey('jml:schema:TEST:Bug');
      invalidation.trackKey('jml:schema:TEST:Bug');

      const stats = await invalidation.stats();
      expect(stats.keys).toBe(1);
    });
  });

  describe('trackKeys()', () => {
    it('tracks multiple keys at once', async () => {
      invalidation.trackKeys(['jml:schema:TEST:Bug', 'jml:user:john', 'jml:field:priority']);

      const stats = await invalidation.stats();
      expect(stats.keys).toBe(3);
    });
  });

  describe('invalidate()', () => {
    it('invalidates all keys when all=true', async () => {
      invalidation.trackKeys([
        'jml:schema:TEST:Bug',
        'jml:user:john',
        'jml:field:priority',
      ]);

      const result = await invalidation.invalidate({ all: true });

      expect(result.keysInvalidated).toBe(3);
      expect(cache.delete).toHaveBeenCalledTimes(3);
      expect(cache.delete).toHaveBeenCalledWith('jml:schema:TEST:Bug');
      expect(cache.delete).toHaveBeenCalledWith('jml:user:john');
      expect(cache.delete).toHaveBeenCalledWith('jml:field:priority');

      // Keys should be cleared
      const stats = await invalidation.stats();
      expect(stats.keys).toBe(0);
    });

    it('invalidates project-related keys', async () => {
      invalidation.trackKeys([
        'jml:schema:TEST:Bug',
        'jml:schema:OTHER:Task',
        'jml:user:john',
        'jml:project:TEST',
      ]);

      const result = await invalidation.invalidate({ project: 'TEST' });

      // Should delete keys containing 'TEST' or starting with schema/project/discovery prefixes
      expect(result.keysInvalidated).toBeGreaterThan(0);
      expect(cache.delete).toHaveBeenCalledWith('jml:schema:TEST:Bug');
      expect(cache.delete).toHaveBeenCalledWith('jml:project:TEST');
    });

    it('invalidates user-related keys', async () => {
      invalidation.trackKeys([
        'jml:user:john',
        'jml:user:jane',
        'jml:entity:priority:high',
        'jml:schema:TEST:Bug',
      ]);

      const result = await invalidation.invalidate({ users: true });

      expect(result.keysInvalidated).toBe(3); // 2 user + 1 entity
      expect(cache.delete).toHaveBeenCalledWith('jml:user:john');
      expect(cache.delete).toHaveBeenCalledWith('jml:user:jane');
      expect(cache.delete).toHaveBeenCalledWith('jml:entity:priority:high');
      // Schema key should NOT be deleted
      expect(cache.delete).not.toHaveBeenCalledWith('jml:schema:TEST:Bug');
    });

    it('invalidates field-related keys', async () => {
      invalidation.trackKeys([
        'jml:field:summary',
        'jml:field:customfield_10001',
        'jml:schema:TEST:Bug',
        'jml:issuetype:TEST:Bug',
        'jml:user:john',
      ]);

      const result = await invalidation.invalidate({ fields: true });

      expect(result.keysInvalidated).toBe(4); // 2 field + 1 schema + 1 issuetype
      expect(cache.delete).toHaveBeenCalledWith('jml:field:summary');
      expect(cache.delete).toHaveBeenCalledWith('jml:field:customfield_10001');
      expect(cache.delete).toHaveBeenCalledWith('jml:schema:TEST:Bug');
      expect(cache.delete).toHaveBeenCalledWith('jml:issuetype:TEST:Bug');
      // User key should NOT be deleted
      expect(cache.delete).not.toHaveBeenCalledWith('jml:user:john');
    });

    it('returns 0 when no keys match', async () => {
      invalidation.trackKeys(['jml:user:john']);

      const result = await invalidation.invalidate({ fields: true });

      expect(result.keysInvalidated).toBe(0);
      expect(cache.delete).not.toHaveBeenCalled();
    });

    it('handles combined options (users + fields)', async () => {
      invalidation.trackKeys([
        'jml:user:john',
        'jml:field:summary',
        'jml:schema:TEST:Bug',
        'jml:entity:status:open',
      ]);

      const result = await invalidation.invalidate({ users: true, fields: true });

      // users: jml:user:john, jml:entity:status:open
      // fields: jml:field:summary, jml:schema:TEST:Bug
      expect(result.keysInvalidated).toBe(4);
    });
  });

  describe('stats()', () => {
    it('returns key count', async () => {
      const stats = await invalidation.stats();
      expect(stats.keys).toBe(0);

      invalidation.trackKeys(['a', 'b', 'c']);
      const stats2 = await invalidation.stats();
      expect(stats2.keys).toBe(3);
    });
  });
});

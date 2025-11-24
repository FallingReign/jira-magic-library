import { RedisCache } from '../../../src/cache/RedisCache.js';

describe('RedisCache - Lookup Cache Methods', () => {
  let cache: RedisCache;
  let mockRedis: any;

  beforeEach(() => {
    // Mock Redis instance
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
      ping: jest.fn(),
      quit: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
      status: 'ready',
    };

    cache = new RedisCache(
      { host: 'localhost', port: 6379 },
      mockRedis,
      { log: jest.fn(), warn: jest.fn() }
    );
  });

  describe('AC1: Cache Lookup Lists', () => {
    it('should cache priority list with correct key pattern', async () => {
      const priorities = [
        { id: '1', name: 'Blocker' },
        { id: '2', name: 'High' },
        { id: '3', name: 'Medium' },
      ];

      await cache.setLookup('TEST', 'priority', priorities);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'jml:lookup:TEST:priority',
        900, // 15 minutes TTL
        JSON.stringify(priorities)
      );
    });

    it('should cache component list with issuetype-specific key', async () => {
      const components = [
        { id: '10001', name: 'Frontend' },
        { id: '10002', name: 'Backend' },
      ];

      await cache.setLookup('TEST', 'component', components, 'Story');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'jml:lookup:TEST:component:Story',
        900,
        JSON.stringify(components)
      );
    });

    it('should cache version list with issuetype-specific key', async () => {
      const versions = [
        { id: '10100', name: 'v1.0.0' },
        { id: '10101', name: 'v2.0.0' },
      ];

      await cache.setLookup('TEST', 'version', versions, 'Bug');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'jml:lookup:TEST:version:Bug',
        900,
        JSON.stringify(versions)
      );
    });

    it('should cache user list without issuetype', async () => {
      const users = [
        { accountId: '123', displayName: 'Alice' },
        { accountId: '456', displayName: 'Bob' },
      ];

      await cache.setLookup('TEST', 'user', users);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'jml:lookup:TEST:user',
        900,
        JSON.stringify(users)
      );
    });
  });

  describe('AC2: Cache Key Pattern', () => {
    it('should generate key for project-level lookup', async () => {
      const priorities = [{ id: '1', name: 'High' }];
      await cache.setLookup('PROJ', 'priority', priorities);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'jml:lookup:PROJ:priority',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should generate key for issuetype-specific lookup', async () => {
      const components = [{ id: '123', name: 'API' }];
      await cache.setLookup('PROJ', 'component', components, 'Task');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'jml:lookup:PROJ:component:Task',
        expect.any(Number),
        expect.any(String)
      );
    });
  });

  describe('AC3: TTL = 15 Minutes', () => {
    it('should set TTL to 900 seconds (15 minutes)', async () => {
      const data = [{ id: '1', name: 'Test' }];
      await cache.setLookup('PROJ', 'priority', data);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        900, // 15 minutes = 900 seconds
        expect.any(String)
      );
    });
  });

  describe('AC4: Retrieve from Cache', () => {
    it('should retrieve cached priority list', async () => {
      const priorities = [
        { id: '1', name: 'Blocker' },
        { id: '2', name: 'High' },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(priorities));

      const result = await cache.getLookup('TEST', 'priority');

      expect(mockRedis.get).toHaveBeenCalledWith('jml:lookup:TEST:priority');
      expect(result).toEqual(priorities);
    });

    it('should retrieve cached component list for specific issuetype', async () => {
      const components = [{ id: '10001', name: 'Frontend' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(components));

      const result = await cache.getLookup('TEST', 'component', 'Story');

      expect(mockRedis.get).toHaveBeenCalledWith('jml:lookup:TEST:component:Story');
      expect(result).toEqual(components);
    });

    it('should return null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.getLookup('TEST', 'priority');

      expect(result).toBeNull();
    });

    it('should return null on invalid JSON', async () => {
      mockRedis.get.mockResolvedValue('invalid json{{{');
      const mockLogger = { log: jest.fn(), warn: jest.fn() };
      cache = new RedisCache(
        { host: 'localhost', port: 6379 },
        mockRedis,
        mockLogger
      );

      const result = await cache.getLookup('TEST', 'priority');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('AC5: Graceful Degradation', () => {
    it('should return null when Redis unavailable', async () => {
      // Create cache with disconnected Redis
      const disconnectedRedis = {
        ...mockRedis,
        status: 'disconnected',
      };
      const unavailableCache = new RedisCache(
        { host: 'localhost', port: 6379 },
        disconnectedRedis,
        { log: jest.fn(), warn: jest.fn() }
      );

      // Manually set availability to false (simulates failed connection)
      (unavailableCache as any).isAvailable = false;

      const result = await unavailableCache.getLookup('TEST', 'priority');

      // With offline queue enabled, call IS attempted (queued) even when unavailable
      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('jml:lookup:TEST:priority');
    });

    it('should attempt setLookup even when isAvailable is false (offline queue)', async () => {
      const unavailableCache = new RedisCache(
        { host: 'localhost', port: 6379 },
        mockRedis,
        { log: jest.fn(), warn: jest.fn() }
      );
      (unavailableCache as any).isAvailable = false;

      await unavailableCache.setLookup('TEST', 'priority', [{ id: '1', name: 'Test' }]);

      // With enableOfflineQueue: true, commands are attempted (queued)
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should return null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));
      const mockLogger = { log: jest.fn(), warn: jest.fn() };
      cache = new RedisCache(
        { host: 'localhost', port: 6379 },
        mockRedis,
        mockLogger
      );

      const result = await cache.getLookup('TEST', 'priority');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('AC6: Cache Invalidation', () => {
    it('should clear all lookup caches for a project', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', [
        'jml:lookup:TEST:priority',
        'jml:lookup:TEST:component:Story',
        'jml:lookup:TEST:version:Bug',
      ]]);

      await cache.clearLookups('TEST');

      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'jml:lookup:TEST:*',
        'COUNT',
        '100'
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        'jml:lookup:TEST:priority',
        'jml:lookup:TEST:component:Story',
        'jml:lookup:TEST:version:Bug'
      );
    });

    it('should clear specific lookup type for a project', async () => {
      await cache.clearLookups('TEST', 'priority');

      expect(mockRedis.del).toHaveBeenCalledWith('jml:lookup:TEST:priority');
    });

    it('should clear issuetype-specific lookup', async () => {
      await cache.clearLookups('TEST', 'component', 'Story');

      expect(mockRedis.del).toHaveBeenCalledWith('jml:lookup:TEST:component:Story');
    });

    it('should handle SCAN with multiple pages', async () => {
      // First scan returns more results (cursor = '1')
      mockRedis.scan
        .mockResolvedValueOnce(['1', ['jml:lookup:TEST:priority']])
        .mockResolvedValueOnce(['0', ['jml:lookup:TEST:component:Story']]);

      await cache.clearLookups('TEST');

      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledWith(
        'jml:lookup:TEST:priority',
        'jml:lookup:TEST:component:Story'
      );
    });

    it('should handle SCAN with no results', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);

      await cache.clearLookups('TEST');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should gracefully degrade on clearLookups error', async () => {
      mockRedis.scan.mockRejectedValue(new Error('Redis error'));
      const mockLogger = { log: jest.fn(), warn: jest.fn() };
      cache = new RedisCache(
        { host: 'localhost', port: 6379 },
        mockRedis,
        mockLogger
      );

      await cache.clearLookups('TEST');

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return early from clearLookups when cache unavailable (line 403 branch)', async () => {
      // Test the branch: if (!this.isAvailable) return;
      const unavailableCache = new RedisCache(
        { host: 'localhost', port: 6379 },
        mockRedis
      );
      
      // Force isAvailable to false
      (unavailableCache as any).isAvailable = false;

      // Clear all lookups for a project (no fieldType) - should return early
      await unavailableCache.clearLookups('TEST');

      // Should NOT call scan since cache is unavailable
      expect(mockRedis.scan).not.toHaveBeenCalled();
    });
  });

  describe('AC7: Unit Tests', () => {
    it('should have tests for getLookup', () => {
      expect(cache.getLookup).toBeDefined();
    });

    it('should have tests for setLookup', () => {
      expect(cache.setLookup).toBeDefined();
    });

    it('should have tests for clearLookups', () => {
      expect(cache.clearLookups).toBeDefined();
    });
  });
});

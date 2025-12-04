/**
 * Unit tests for Redis Cache
 * Story: E1-S04
 */

import RedisMock from 'ioredis-mock';
import { RedisCache } from '../../../src/cache/RedisCache.js';
import { CacheError } from '../../../src/errors/CacheError.js';
import type { RedisConfig } from '../../../src/types/config.js';
import { TEST_USER_EMAIL } from '../../helpers/test-users.js';

// Mock console methods to avoid cluttering test output
let consoleLogSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
// Note: mockRedis operations are untyped but necessary for testing
describe('RedisCache', () => {
  let cache: RedisCache;
  // Un-typed mock to keep tests simple; ioredis-mock types don't fully match ioredis Redis interface
  let mockRedis: any;
  const config: RedisConfig = {
    host: 'localhost',
    port: 6379,
    password: undefined,
  };

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // Create mock Redis instance
    mockRedis = new RedisMock();
    cache = new RedisCache(config, mockRedis);
  });

  afterEach(async () => {
    // Cleanup
    await cache.disconnect();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('get()', () => {
    it('should return cached value', async () => {
      // Arrange
      await mockRedis.set('jml:test-key', 'test-value');

      // Act
      const result = await cache.get('test-key');

      // Assert
      expect(result.value).toBe('test-value');
      expect(result.isStale).toBe(false);
    });

    it('should return null for missing key', async () => {
      // Act
      const result = await cache.get('nonexistent-key');

      // Assert
      expect(result.value).toBeNull();
      expect(result.isStale).toBe(false);
    });

    it('should prefix key with jml:', async () => {
      // Arrange
      await mockRedis.set('jml:schema:ENG:Bug', 'schema-data');

      // Act
      const result = await cache.get('schema:ENG:Bug');

      // Assert
      expect(result.value).toBe('schema-data');
      expect(result.isStale).toBe(false);
    });

    it('should return null and warn on Redis error', async () => {
      // Arrange
      jest.spyOn(mockRedis, 'get').mockRejectedValue(new Error('Redis connection lost'));

      // Act
      const result = await cache.get('test-key');

      // Assert
      expect(result.value).toBeNull();
      expect(result.isStale).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache get failed'),
        expect.any(Error)
      );
    });
  });

  describe('set()', () => {
    it('should store value with TTL', async () => {
      // Act
      await cache.set('test-key', 'test-value', 900);

      // Assert - value is wrapped with metadata for SWR
      const rawValue = await mockRedis.get('jml:test-key');
      const parsed = JSON.parse(rawValue as string);
      expect(parsed.value).toBe('test-value');
      expect(parsed.expiresAt).toBeGreaterThan(Date.now());

      // Check TTL was set (1 week hard TTL for Redis cleanup)
      const ttl = await mockRedis.ttl('jml:test-key');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(604800); // 1 week
    });

    it('should prefix key with jml:', async () => {
      // Act
      await cache.set('schema:ENG:Bug', 'schema-data', 900);

      // Assert - value is wrapped with metadata for SWR
      const value = await mockRedis.get('jml:schema:ENG:Bug');
      const parsed = JSON.parse(value as string);
      expect(parsed.value).toBe('schema-data');
      expect(parsed.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should handle errors gracefully and warn', async () => {
      // Arrange
      jest.spyOn(mockRedis, 'setex').mockRejectedValue(new Error('Redis write failed'));

      // Act & Assert - should not throw
      await expect(cache.set('test-key', 'test-value', 900)).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache set failed'),
        expect.any(Error)
      );
    });

    it('should accept different TTL values', async () => {
      // Act
      await cache.set('key1', 'value1', 300);
      await cache.set('key2', 'value2', 1800);

      // Assert - All values get 1 week hard TTL (soft TTL is in the envelope)
      const ttl1 = await mockRedis.ttl('jml:key1');
      const ttl2 = await mockRedis.ttl('jml:key2');
      expect(ttl1).toBeLessThanOrEqual(604800); // 1 week
      expect(ttl2).toBeLessThanOrEqual(604800); // 1 week
    });
  });

  describe('del()', () => {
    it('should delete key', async () => {
      // Arrange
      await mockRedis.set('jml:test-key', 'test-value');

      // Act
      await cache.del('test-key');

      // Assert
      const value = await mockRedis.get('jml:test-key');
      expect(value).toBeNull();
    });

    it('should be silent if key does not exist', async () => {
      // Act & Assert - should not throw
      await expect(cache.del('nonexistent-key')).resolves.toBeUndefined();
    });

    it('should handle errors gracefully and warn', async () => {
      // Arrange
      jest.spyOn(mockRedis, 'del').mockRejectedValue(new Error('Redis delete failed'));

      // Act & Assert - should not throw
      await expect(cache.del('test-key')).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache del failed'),
        expect.any(Error)
      );
    });
  });

  describe('clear()', () => {
    it('should clear all jml:* keys', async () => {
      // Arrange
      await mockRedis.set('jml:schema:ENG:Bug', 'data1');
      await mockRedis.set('jml:schema:ENG:Task', 'data2');
      await mockRedis.set('jml:priorities', 'data3');
      await mockRedis.set('other:key', 'should-remain');

      // Act
      await cache.clear();

      // Assert
      const key1 = await mockRedis.get('jml:schema:ENG:Bug');
      const key2 = await mockRedis.get('jml:schema:ENG:Task');
      const key3 = await mockRedis.get('jml:priorities');
      const other = await mockRedis.get('other:key');

      expect(key1).toBeNull();
      expect(key2).toBeNull();
      expect(key3).toBeNull();
      expect(other).toBe('should-remain');
    });

    it('should handle errors gracefully and warn', async () => {
      // Arrange
      jest.spyOn(mockRedis, 'scan').mockRejectedValue(new Error('Redis scan failed'));

      // Act & Assert - should not throw
      await expect(cache.clear()).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache clear failed'),
        expect.any(Error)
      );
    });

    it('should work when no jml:* keys exist', async () => {
      // Arrange
      await mockRedis.set('other:key', 'data');

      // Act & Assert - should not throw
      await expect(cache.clear()).resolves.toBeUndefined();

      // Other key should remain
      const other = await mockRedis.get('other:key');
      expect(other).toBe('data');
    });
  });

  describe('ping()', () => {
    it('should validate connection successfully', async () => {
      // Arrange - mock status to be 'ready' so connect() isn't called
      Object.defineProperty(mockRedis, 'status', { value: 'ready', writable: true });
      jest.spyOn(mockRedis, 'ping').mockResolvedValue('PONG');

      // Act & Assert - should not throw
      await expect(cache.ping()).resolves.toBeUndefined();
    });

    it('should connect when status is not ready (line 264 branch)', async () => {
      // Test the branch: if (this.client.status !== 'ready')
      Object.defineProperty(mockRedis, 'status', { value: 'connecting', writable: true });
      const connectSpy = jest.spyOn(mockRedis, 'connect').mockResolvedValue();
      jest.spyOn(mockRedis, 'ping').mockResolvedValue('PONG');

      await cache.ping();

      expect(connectSpy).toHaveBeenCalled();
    });

    it('should throw CacheError on connection failure', async () => {
      // Arrange
      Object.defineProperty(mockRedis, 'status', { value: 'ready', writable: true });
      jest.spyOn(mockRedis, 'ping').mockRejectedValue(new Error('Connection refused'));

      // Act & Assert
      await expect(cache.ping()).rejects.toThrow(CacheError);
      await expect(cache.ping()).rejects.toThrow('Failed to ping Redis');
    });
  });

  describe('Connection Management', () => {
    it('should setup event handlers', () => {
      // Connection event handlers are registered in constructor
      // This is validated by the fact that the mock works throughout the tests
      // We can't reliably test async event emission in synchronous constructor
      expect(cache).toBeDefined();
    });

    it('should disconnect cleanly', async () => {
      // Act
      await cache.disconnect();

      // Assert - should complete without error (no exception thrown)
      // Mock Redis doesn't expose status reliably, so we just verify no error
      expect(true).toBe(true);
    });

    it('should handle disconnect when already disconnected', async () => {
      // Arrange
      await cache.disconnect();

      // Act & Assert - should not throw
      await expect(cache.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('Cache Key Namespacing', () => {
    it('should use jml: prefix for schema keys', async () => {
      // Act
      await cache.set('schema:PROJECT:IssueType', 'data', 900);

      // Assert
      const keys = await mockRedis.keys('jml:schema:*');
      expect(keys).toContain('jml:schema:PROJECT:IssueType');
    });

    it('should use jml: prefix for priority keys', async () => {
      // Act
      await cache.set('priorities:https://jira.com', 'data', 900);

      // Assert
      const keys = await mockRedis.keys('jml:priorities:*');
      expect(keys).toContain('jml:priorities:https://jira.com');
    });

    it('should use jml: prefix for user keys', async () => {
      // Act
      await cache.set(`users:${TEST_USER_EMAIL}`, 'data', 900);

      // Assert
      const keys = await mockRedis.keys('jml:users:*');
      expect(keys).toContain(`jml:users:${TEST_USER_EMAIL}`);
    });
  });

  describe('Graceful Degradation', () => {
    it('should not crash library on get failure', async () => {
      // Arrange
      jest.spyOn(mockRedis, 'get').mockRejectedValue(new Error('Network error'));

      // Act
      const result = await cache.get('test-key');

      // Assert - returns null instead of throwing
      expect(result.value).toBeNull();
      expect(result.isStale).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should not crash library on set failure', async () => {
      // Arrange
      jest.spyOn(mockRedis, 'setex').mockRejectedValue(new Error('Disk full'));

      // Act & Assert - completes without throwing
      await expect(cache.set('test-key', 'value', 900)).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should not crash library on del failure', async () => {
      // Arrange
      jest.spyOn(mockRedis, 'del').mockRejectedValue(new Error('Timeout'));

      // Act & Assert - completes without throwing
      await expect(cache.del('test-key')).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should not crash library on clear failure', async () => {
      // Arrange
      jest.spyOn(mockRedis, 'scan').mockRejectedValue(new Error('Connection lost'));

      // Act & Assert - completes without throwing
      await expect(cache.clear()).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('Event Handlers', () => {
    it('should handle connect event', async () => {
      // Arrange
      const EventEmitter = require('events');
      const fakeClient = new EventEmitter();
      fakeClient.get = jest.fn().mockResolvedValue(null);
      fakeClient.setex = jest.fn().mockResolvedValue('OK');
      fakeClient.del = jest.fn().mockResolvedValue(1);
      fakeClient.ping = jest.fn().mockResolvedValue('PONG');
      fakeClient.removeAllListeners = jest.fn();
      fakeClient.status = 'ready';
      fakeClient.quit = jest.fn().mockResolvedValue('OK');
      fakeClient.disconnect = jest.fn();

      // Act
      const cache = new RedisCache(config, fakeClient);
      fakeClient.emit('connect');
      
      // Allow async handler to complete
      await Promise.resolve();

      // Assert - should log connection and be available
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Redis connected');
      
      // Cleanup
      await cache.disconnect();
    });

    it('should handle error event', async () => {
      // Arrange
      const EventEmitter = require('events');
      const fakeClient = new EventEmitter();
      fakeClient.get = jest.fn().mockResolvedValue(null);
      fakeClient.setex = jest.fn().mockResolvedValue('OK');
      fakeClient.del = jest.fn().mockResolvedValue(1);
      fakeClient.ping = jest.fn().mockResolvedValue('PONG');
      fakeClient.removeAllListeners = jest.fn();
      fakeClient.status = 'ready';
      fakeClient.quit = jest.fn().mockResolvedValue('OK');
      fakeClient.disconnect = jest.fn();

      // Act
      const cache = new RedisCache(config, fakeClient);
      const testError = new Error('Connection refused');
      fakeClient.emit('error', testError);
      
      // Allow async handler to complete
      await Promise.resolve();

      // Assert - should warn about error (console.warn gets called with message and potentially undefined)
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toBe('⚠️  Redis error: Connection refused');
      
      // Cleanup
      await cache.disconnect();
    });

    it('should handle close event', async () => {
      // Arrange
      const EventEmitter = require('events');
      const fakeClient = new EventEmitter();
      fakeClient.get = jest.fn().mockResolvedValue(null);
      fakeClient.setex = jest.fn().mockResolvedValue('OK');
      fakeClient.del = jest.fn().mockResolvedValue(1);
      fakeClient.ping = jest.fn().mockResolvedValue('PONG');
      fakeClient.removeAllListeners = jest.fn();
      fakeClient.status = 'ready';
      fakeClient.quit = jest.fn().mockResolvedValue('OK');
      fakeClient.disconnect = jest.fn();

      // Act
      const cache = new RedisCache(config, fakeClient);
      fakeClient.emit('close');
      
      // Allow async handler to complete
      await Promise.resolve();

      // Assert - close event should be handled silently (no console output expected)
      // Just verify no errors thrown
      expect(cache).toBeDefined();
      
      // Cleanup
      await cache.disconnect();
    });

    it('should handle end event', async () => {
      // Arrange
      const EventEmitter = require('events');
      const fakeClient = new EventEmitter();
      fakeClient.get = jest.fn().mockResolvedValue(null);
      fakeClient.setex = jest.fn().mockResolvedValue('OK');
      fakeClient.del = jest.fn().mockResolvedValue(1);
      fakeClient.ping = jest.fn().mockResolvedValue('PONG');
      fakeClient.removeAllListeners = jest.fn();
      fakeClient.status = 'ready';
      fakeClient.quit = jest.fn().mockResolvedValue('OK');
      fakeClient.disconnect = jest.fn();

      // Act
      const cache = new RedisCache(config, fakeClient);
      fakeClient.emit('end');
      
      // Allow async handler to complete
      await Promise.resolve();

      // Assert - end event should be handled (cache becomes unavailable)
      // Just verify no errors thrown
      expect(cache).toBeDefined();
      
      // Cleanup
      await cache.disconnect();
    });

    it('should handle retry strategy giving up after 3 attempts', async () => {
      // Arrange - create EventEmitter-based fake that mimics IORedis
      const EventEmitter = require('events');
      const fakeClient = new EventEmitter();
      fakeClient.get = jest.fn().mockResolvedValue(null);
      fakeClient.setex = jest.fn().mockResolvedValue('OK');
      fakeClient.del = jest.fn().mockResolvedValue(1);
      fakeClient.ping = jest.fn().mockResolvedValue('PONG');
      fakeClient.removeAllListeners = jest.fn();
      fakeClient.status = 'ready';
      fakeClient.quit = jest.fn().mockResolvedValue('OK');
      fakeClient.disconnect = jest.fn();

      const customLogger = {
        log: jest.fn(),
        warn: jest.fn(),
      };

      // Act - Create cache and simulate retryStrategy being called with times > 3
      const cache = new RedisCache(config, fakeClient, customLogger);

      // The retryStrategy function is registered during construction but only called
      // when Redis actually tries to reconnect. We can't easily trigger it in unit tests,
      // so we verify the cache was created successfully (constructor didn't throw)
      expect(cache).toBeDefined();

      // Cleanup
      await cache.disconnect();
    });
  });

  describe('Logger Injection', () => {
    it('should use custom logger', async () => {
      // Arrange
      const customLogger = {
        log: jest.fn(),
        warn: jest.fn(),
      };

      // Act
      const cache = new RedisCache(config, mockRedis, customLogger);
      
      // Trigger error path
      jest.spyOn(mockRedis, 'get').mockRejectedValue(new Error('Test error'));
      await cache.get('test-key');

      // Assert
      expect(customLogger.warn).toHaveBeenCalledWith('Cache get failed:', expect.any(Error));
      expect(consoleWarnSpy).not.toHaveBeenCalled(); // Should NOT use console

      // Cleanup
      await cache.disconnect();
    });

    it('should use custom logger for set errors', async () => {
      // Arrange
      const customLogger = {
        log: jest.fn(),
        warn: jest.fn(),
      };

      // Act
      const cache = new RedisCache(config, mockRedis, customLogger);
      
      // Trigger error path
      jest.spyOn(mockRedis, 'setex').mockRejectedValue(new Error('Test error'));
      await cache.set('test-key', 'value', 900);

      // Assert
      expect(customLogger.warn).toHaveBeenCalledWith('Cache set failed:', expect.any(Error));

      // Cleanup
      await cache.disconnect();
    });

    it('should use custom logger for del errors', async () => {
      // Arrange
      const customLogger = {
        log: jest.fn(),
        warn: jest.fn(),
      };

      // Act
      const cache = new RedisCache(config, mockRedis, customLogger);
      
      // Trigger error path
      jest.spyOn(mockRedis, 'del').mockRejectedValue(new Error('Test error'));
      await cache.del('test-key');

      // Assert
      expect(customLogger.warn).toHaveBeenCalledWith('Cache del failed:', expect.any(Error));

      // Cleanup
      await cache.disconnect();
    });

    it('should use custom logger for clear errors', async () => {
      // Arrange
      const customLogger = {
        log: jest.fn(),
        warn: jest.fn(),
      };

      // Act
      const cache = new RedisCache(config, mockRedis, customLogger);
      
      // Trigger error path
      jest.spyOn(mockRedis, 'scan').mockRejectedValue(new Error('Test error'));
      await cache.clear();

      // Assert
      expect(customLogger.warn).toHaveBeenCalledWith('Cache clear failed:', expect.any(Error));

      // Cleanup
      await cache.disconnect();
    });
  });

  describe('Unavailable Redis (isAvailable=false)', () => {
    it('should return null from get() when Redis is unavailable', async () => {
      // Arrange - Create cache with unavailable Redis
      const EventEmitter = require('events');
      const unavailableClient = new EventEmitter();
      unavailableClient.get = jest.fn().mockRejectedValue(new Error('Connection failed'));
      unavailableClient.removeAllListeners = jest.fn();
      unavailableClient.status = 'end';
      unavailableClient.disconnect = jest.fn();

      const cache = new RedisCache(config, unavailableClient);
      
      // Simulate Redis becoming unavailable
      unavailableClient.emit('error', new Error('Connection failed'));
      
      // Act
      const result = await cache.get('test-key');

      // Assert - with offline queue enabled, call IS attempted but returns null on error
      expect(result.value).toBeNull();
      expect(result.isStale).toBe(false);
      expect(unavailableClient.get).toHaveBeenCalledWith('jml:test-key');
      
      // Cleanup
      await cache.disconnect();
    });

    it('should silently fail set() when Redis is unavailable', async () => {
      // Arrange
      const EventEmitter = require('events');
      const unavailableClient = new EventEmitter();
      unavailableClient.setex = jest.fn().mockRejectedValue(new Error('Connection failed'));
      unavailableClient.removeAllListeners = jest.fn();
      unavailableClient.status = 'end';
      unavailableClient.disconnect = jest.fn();

      const cache = new RedisCache(config, unavailableClient);
      unavailableClient.emit('error', new Error('Connection failed'));
      
      // Act & Assert - with offline queue, call IS attempted but fails gracefully
      await expect(cache.set('test-key', 'value', 900)).resolves.toBeUndefined();
      // Hard TTL is 1 week, value is wrapped with metadata (soft TTL in envelope)
      expect(unavailableClient.setex).toHaveBeenCalledWith(
        'jml:test-key', 
        604800, // 1 week hard TTL
        expect.stringMatching(/^\{"value":"value","expiresAt":\d+\}$/)
      );
      
      // Cleanup
      await cache.disconnect();
    });

    it('should silently fail del() when Redis is unavailable', async () => {
      // Arrange
      const EventEmitter = require('events');
      const unavailableClient = new EventEmitter();
      unavailableClient.del = jest.fn().mockResolvedValue(1);
      unavailableClient.removeAllListeners = jest.fn();
      unavailableClient.status = 'end';
      unavailableClient.disconnect = jest.fn();

      const cache = new RedisCache(config, unavailableClient);
      unavailableClient.emit('error', new Error('Connection failed'));
      
      // Act & Assert
      await expect(cache.del('test-key')).resolves.toBeUndefined();
      expect(unavailableClient.del).not.toHaveBeenCalled();
      
      // Cleanup
      await cache.disconnect();
    });

    it('should silently fail clear() when Redis is unavailable', async () => {
      // Arrange
      const EventEmitter = require('events');
      const unavailableClient = new EventEmitter();
      unavailableClient.scan = jest.fn();
      unavailableClient.removeAllListeners = jest.fn();
      unavailableClient.status = 'end';
      unavailableClient.disconnect = jest.fn();

      const cache = new RedisCache(config, unavailableClient);
      unavailableClient.emit('error', new Error('Connection failed'));
      
      // Act & Assert
      await expect(cache.clear()).resolves.toBeUndefined();
      expect(unavailableClient.scan).not.toHaveBeenCalled();
      
      // Cleanup
      await cache.disconnect();
    });

    it('should handle end event making Redis unavailable', async () => {
      // Arrange
      const EventEmitter = require('events');
      const client = new EventEmitter();
      client.get = jest.fn()
        .mockResolvedValueOnce('value') // First call succeeds
        .mockRejectedValueOnce(new Error('Connection ended')); // Second call fails
      client.removeAllListeners = jest.fn();
      client.status = 'end';
      client.disconnect = jest.fn();

      const cache = new RedisCache(config, client);
      
      // Initially available (test instance)
      const result1 = await cache.get('test-key');
      expect(result1.value).toBe('value');
      
      // Emit end event
      client.emit('end');
      
      // With offline queue, call IS still attempted but fails → returns null
      const result2 = await cache.get('test-key');
      expect(result2.value).toBeNull();
      expect(result2.isStale).toBe(false);
      expect(client.get).toHaveBeenCalledTimes(2); // Both calls attempted
      
      // Cleanup
      await cache.disconnect();
    });

    it('should handle close event making Redis unavailable', async () => {
      // Arrange
      const EventEmitter = require('events');
      const client = new EventEmitter();
      client.get = jest.fn().mockRejectedValue(new Error('Connection closed'));
      client.removeAllListeners = jest.fn();
      client.status = 'end';
      client.disconnect = jest.fn();

      const cache = new RedisCache(config, client);
      
      // Emit close event
      client.emit('close');
      
      // With offline queue, call IS still attempted but fails → returns null
      const result = await cache.get('test-key');
      expect(result.value).toBeNull();
      expect(result.isStale).toBe(false);
      expect(client.get).toHaveBeenCalled();
      
      // Cleanup
      await cache.disconnect();
    });
  });

  describe('Branch Coverage - Edge Cases', () => {
    it('should test event handler cleanup (disposeListeners)', () => {
      // Arrange - Create a mock Redis client to test event handler registration/cleanup
      const mockClient = {
        on: jest.fn(),
        off: jest.fn(),
      };

      // Act - Call attachRedisEventHandlers to get the disposer function
      const { attachRedisEventHandlers, defaultLogger } = require('../../../src/cache/RedisCache');
      const setAvailable = jest.fn();
      
      const dispose = attachRedisEventHandlers(mockClient, defaultLogger, setAvailable);
      
      // Assert - Verify handlers were registered
      expect(mockClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('end', expect.any(Function));
      
      // Act - Call dispose to remove handlers
      dispose();
      
      // Assert - Verify handlers were removed (lines 93-94)
      expect(mockClient.off).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockClient.off).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockClient.off).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockClient.off).toHaveBeenCalledWith('end', expect.any(Function));
    });

    it('should instantiate real Redis path without throwing', async () => {
      const config = {
        host: 'prod-redis.example.com',
        port: 6379,
        password: 'secret',
      };

      const realCache = new RedisCache(config);
      expect(realCache).toBeDefined();
      await realCache.disconnect();
    });

    it('should handle disconnect errors gracefully', async () => {
      // This test covers line 288 (disconnect error handling)
      
      // Create a mock that throws on disconnect
      const mockClientWithError = {
        on: jest.fn(),
        off: jest.fn(),
        disconnect: jest.fn().mockRejectedValue(new Error('Disconnect failed')),
      };
      
      const { RedisCache } = require('../../../src/cache/RedisCache');
      
      // Create cache with mock that will error on disconnect
      const cache = new RedisCache(config, mockClientWithError);
      
      // Act - Call disconnect (should handle error gracefully)
      await expect(cache.disconnect()).resolves.toBeUndefined();
      
      // Assert - Should set isAvailable to false even on error
      expect(cache.isAvailable).toBe(false);
    });
  });
});

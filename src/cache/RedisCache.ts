/**
 * Redis Cache Implementation
 * Story: E1-S04, E1-S13 (coverage improvements)
 */

import { Redis } from 'ioredis';
import type { RedisConfig } from '../types/config.js';
import type { CacheClient } from '../types/cache.js';
import type { LookupCache } from '../types/converter.js';
import { CacheError } from '../errors/CacheError.js';
type RedisClientInstance = InstanceType<typeof Redis>;

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  log: (message: string) => void;
  warn: (message: string, error?: unknown) => void;
}

/**
 * Default console-based logger
 */
export const defaultLogger: Logger = {
  log: (message: string) => console.log(message), // eslint-disable-line no-console
  warn: (message: string, error?: unknown) => console.warn(message, error),
};

/**
 * Event handler: Redis connection established
 */
export function onConnect(logger: Logger, setAvailable: (available: boolean) => void) {
  return () => {
    setAvailable(true);
    logger.log('✓ Redis connected');
  };
}

/**
 * Event handler: Redis error occurred
 */
export function onError(logger: Logger, setAvailable: (available: boolean) => void) {
  return (err: Error) => {
    setAvailable(false);
    logger.warn(`⚠️  Redis error: ${err.message}`);
  };
}

/**
 * Event handler: Redis connection closed
 */
export function onClose(setAvailable: (available: boolean) => void) {
  return () => {
    setAvailable(false);
    // Silent on close (expected when unavailable)
  };
}

/**
 * Event handler: Redis connection ended
 */
export function onEnd(setAvailable: (available: boolean) => void) {
  return () => {
    setAvailable(false);
  };
}

/**
 * Attach all Redis event handlers
 * 
 * @param client Redis client instance
 * @param logger Logger for warnings and info
 * @param setAvailable Callback to update availability state
 * @returns Disposer function to remove all event handlers
 */
export function attachRedisEventHandlers(
  client: RedisClientInstance,
  logger: Logger,
  setAvailable: (available: boolean) => void
): () => void {
  const handlers = [
    ['connect', onConnect(logger, setAvailable)] as const,
    ['error', onError(logger, setAvailable)] as const,
    ['close', onClose(setAvailable)] as const,
    ['end', onEnd(setAvailable)] as const,
  ];

  // Attach all handlers
  handlers.forEach(([event, handler]) => {
    client.on(event, handler);
  });

  // Return disposer function
  return () => {
    handlers.forEach(([event, handler]) => {
      client.off(event, handler);
    });
  };
}

/**
 * Redis-based cache implementation with graceful degradation
 * 
 * Implements both CacheClient (generic key-value) and LookupCache (converter-specific).
 * 
 * All cache keys are prefixed with `jml:` to avoid conflicts.
 * Cache operations fail gracefully - errors are logged but don't crash the library.
 * Only the `ping()` method throws errors.
 */
export class RedisCache implements CacheClient, LookupCache {
  private client: RedisClientInstance;
  private readonly keyPrefix = 'jml:';
  private isAvailable = false;
  private readonly logger: Logger;

  /**
   * Creates a new Redis cache instance
   * 
   * @param config Redis connection configuration
   * @param redisInstance Optional Redis instance for testing (uses ioredis if not provided)
   * @param logger Optional logger for dependency injection (defaults to console)
   */
  constructor(config: RedisConfig, redisInstance?: RedisClientInstance, logger: Logger = defaultLogger) {
    this.logger = logger;
    
    if (redisInstance) {
      // Use provided instance (for testing)
      this.client = redisInstance;
      this.isAvailable = true; // Assume test instance is always available
    } else {
      // Create real Redis instance with controlled retry behavior
      this.client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        lazyConnect: true, // Connect on first operation to avoid race conditions
        retryStrategy: (times: number) => {
          // Give up after 3 attempts
          if (times > 3) {
            this.logger.warn(`⚠️  Redis unavailable after ${times} attempts - disabling cache`);
            return null; // Stop retrying
          }
          // Exponential backoff: 200ms, 400ms, 800ms
          return Math.min(times * 200, 1000);
        },
        maxRetriesPerRequest: 1,
        enableOfflineQueue: true, // Queue commands during connection (required for lazyConnect)
      });
    }

    // Setup event handlers
    attachRedisEventHandlers(this.client, this.logger, (available) => {
      this.isAvailable = available;
    });
  }

  /**
   * Get a value from the cache
   * 
   * @param key Cache key (will be prefixed with jml:)
   * @returns Cached value or null if not found or on error
   */
  async get(key: string): Promise<string | null> {
    try {
      // With lazyConnect + enableOfflineQueue, first command triggers connection
      // and queues until connected
      const result = await this.client.get(this.keyPrefix + key);
      // Mark as available after successful operation
      if (!this.isAvailable) {
        this.isAvailable = true;
      }
      return result;
    } catch (err) {
      this.logger.warn('Cache get failed:', err);
      // Mark as unavailable on failure
      this.isAvailable = false;
      return null;
    }
  }

  /**
   * Set a value in the cache with TTL
   * 
   * @param key Cache key (will be prefixed with jml:)
   * @param value Value to store
   * @param ttlSeconds Time to live in seconds
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      // With lazyConnect + enableOfflineQueue, first command triggers connection
      // and queues until connected
      await this.client.setex(this.keyPrefix + key, ttlSeconds, value);
      // Mark as available after successful operation
      if (!this.isAvailable) {
        this.isAvailable = true;
      }
    } catch (err) {
      this.logger.warn('Cache set failed:', err);
      // Mark as unavailable on failure
      this.isAvailable = false;
    }
  }

  /**
   * Delete a key from the cache
   * 
   * @param key Cache key (will be prefixed with jml:)
   */
  async del(key: string): Promise<void> {
    if (!this.isAvailable) {
      return; // Graceful degradation: silently fail when Redis never connected
    }

    try {
      await this.client.del(this.keyPrefix + key);
    } catch (err) {
      this.logger.warn('Cache del failed:', err);
    }
  }

  /**
   * Clear all keys matching the jml: prefix
   * 
   * Uses SCAN command to avoid blocking Redis with large datasets
   */
  async clear(): Promise<void> {
    if (!this.isAvailable) {
      return; // Graceful degradation: silently fail when Redis never connected
    }

    try {
      let cursor = '0';
      const keysToDelete: string[] = [];

      // Use SCAN to iterate through keys without blocking
      do {
        const result = await this.client.scan(
          cursor,
          'MATCH',
          `${this.keyPrefix}*`,
          'COUNT',
          '100'
        );
        cursor = result[0];
        const keys = result[1];
        
        if (keys.length > 0) {
          keysToDelete.push(...keys);
        }
      } while (cursor !== '0');

      // Delete all found keys
      if (keysToDelete.length > 0) {
        await this.client.del(...keysToDelete);
      }
    } catch (err) {
      this.logger.warn('Cache clear failed:', err);
    }
  }

  /**
   * Test connection to Redis
   * 
   * @throws {CacheError} if connection fails
   */
  async ping(): Promise<void> {
    try {
      // Ensure connection is established when lazyConnect is true
      if (this.client.status !== 'ready') {
        await this.client.connect();
      }

      await this.client.ping();
      // Mark cache as available after successful ping
      this.isAvailable = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Mark cache as unavailable on failure
      this.isAvailable = false;
      throw new CacheError(`Failed to ping Redis: ${message}`, { error: message });
    }
  }

  /**
   * Disconnect from Redis and clean up event listeners
   */
  async disconnect(): Promise<void> {
    try {
      // Remove all event listeners to prevent late event firing after tests
      this.client.removeAllListeners('connect');
      this.client.removeAllListeners('error');
      this.client.removeAllListeners('close');
      this.client.removeAllListeners('end');
      
      // Only disconnect if we're actually connected
      if (this.client.status === 'ready' || this.client.status === 'connect') {
        await this.client.quit();
      } else {
        // Not connected, just close without sending QUIT command
        this.client.disconnect();
      }
      this.isAvailable = false;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      // Ignore errors on disconnect
      this.isAvailable = false;
    }
  }

  /**
   * Cache lookup values (priorities, components, versions, etc.)
   * 
   * Uses CacheClient.set() for consistent error handling and key prefixing.
   * Cache key pattern: `lookup:{projectKey}:{fieldType}:{issueType?}`
   * 
   * @param projectKey JIRA project key (e.g., "TEST")
   * @param fieldType Type of lookup field (e.g., "priority", "component", "version")
   * @param data Array of lookup values to cache
   * @param issueType Optional issue type for issuetype-specific lookups
   * 
   * @example
   * // Cache priority list (project-level)
   * await cache.setLookup('TEST', 'priority', [
   *   { id: '1', name: 'Blocker' },
   *   { id: '2', name: 'High' }
   * ]);
   * 
   * // Cache components (issuetype-specific)
   * await cache.setLookup('TEST', 'component', [...], 'Story');
   */
  async setLookup(
    projectKey: string,
    fieldType: string,
    data: unknown[],
    issueType?: string
  ): Promise<void> {
    const key = this.buildLookupKey(projectKey, fieldType, issueType);
    const ttl = 900; // 15 minutes (same as schema cache)
    // Use CacheClient.set() for consistent error handling and graceful degradation
    await this.set(key, JSON.stringify(data), ttl);
  }

  /**
   * Retrieve cached lookup values
   * 
   * Uses CacheClient.get() for consistent error handling and key prefixing.
   * 
   * @param projectKey JIRA project key
   * @param fieldType Type of lookup field
   * @param issueType Optional issue type for issuetype-specific lookups
   * @returns Cached lookup array or null if not found/on error
   * 
   * @example
   * const priorities = await cache.getLookup('TEST', 'priority');
   * const components = await cache.getLookup('TEST', 'component', 'Story');
   */
  async getLookup(
    projectKey: string,
    fieldType: string,
    issueType?: string
  ): Promise<unknown[] | null> {
    const key = this.buildLookupKey(projectKey, fieldType, issueType);
    // Use CacheClient.get() for consistent error handling and graceful degradation
    const result = await this.get(key);
    
    if (!result) {
      return null; // Cache miss
    }

    // Parse JSON (errors caught by get() method)
    try {
      return JSON.parse(result) as unknown[];
    } catch (err) {
      this.logger.warn('Cache getLookup JSON parse failed:', err);
      return null;
    }
  }

  /**
   * Clear lookup caches
   * 
   * @param projectKey JIRA project key
   * @param fieldType Optional field type (clears all if omitted)
   * @param issueType Optional issue type
   * 
   * @example
   * // Clear all lookups for project
   * await cache.clearLookups('TEST');
   * 
   * // Clear specific lookup type
   * await cache.clearLookups('TEST', 'priority');
   * 
   * // Clear issuetype-specific lookup
   * await cache.clearLookups('TEST', 'component', 'Story');
   */
  async clearLookups(
    projectKey: string,
    fieldType?: string,
    issueType?: string
  ): Promise<void> {
    if (fieldType) {
      // Clear specific lookup using CacheClient.del()
      const key = this.buildLookupKey(projectKey, fieldType, issueType);
      await this.del(key);
    } else {
      // Clear all lookups for project (use SCAN + bulk delete)
      // Note: This is the one case where we need direct client access for SCAN
      if (!this.isAvailable) {
        return; // Graceful degradation
      }

      try {
        const pattern = `${this.keyPrefix}lookup:${projectKey}:*`;
        let cursor = '0';
        const keysToDelete: string[] = [];

        do {
          const result = await this.client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            '100'
          );
          cursor = result[0];
          const keys = result[1];
          
          if (keys.length > 0) {
            keysToDelete.push(...keys);
          }
        } while (cursor !== '0');

        // Delete all found keys (direct client call needed for bulk delete)
        if (keysToDelete.length > 0) {
          await this.client.del(...keysToDelete);
        }
      } catch (err) {
        this.logger.warn('Cache clearLookups failed:', err);
      }
    }
  }

  /**
   * Build cache key for lookup values
   * 
   * Pattern: jml:lookup:{projectKey}:{fieldType}:{issueType?}
   * 
   * @private
   */
  /**
   * Build lookup cache key (without prefix)
   * 
   * The keyPrefix is added by get()/set() methods, not here.
   * This ensures consistent key prefixing across all cache operations.
   * 
   * @param projectKey JIRA project key
   * @param fieldType Type of lookup field
   * @param issueType Optional issue type
   * @returns Cache key without prefix (e.g., "lookup:TEST:priority")
   */
  private buildLookupKey(
    projectKey: string,
    fieldType: string,
    issueType?: string
  ): string {
    const parts = ['lookup', projectKey, fieldType];
    if (issueType) {
      parts.push(issueType);
    }
    return parts.join(':');
  }
}

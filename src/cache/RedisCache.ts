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
          // istanbul ignore next - integration test: Redis reconnection behavior
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
   * Hard TTL for Redis key expiration (1 week)
   * 
   * This is just to prevent infinite Redis growth for abandoned entries.
   * The soft TTL (expiresAt in envelope) determines staleness for background
   * refresh. Since we always return stale data and refresh in background,
   * this only matters for entries that are never accessed again.
   */
  private readonly HARD_TTL_SECONDS = 7 * 24 * 60 * 60; // 1 week

  /**
   * Get a value from the cache with stale-while-revalidate support
   * 
   * Returns both the value and whether it's stale. By default, stale values
   * are returned - callers should trigger background refresh when isStale=true.
   * 
   * @param key Cache key (will be prefixed with jml:)
   * @param options.rejectStale If true, returns null for stale values (bypasses SWR)
   * @returns CacheResult with value and isStale flag
   */
  async get(key: string, options?: { rejectStale?: boolean }): Promise<{ value: string | null; isStale: boolean }> {
    try {
      const raw = await this.client.get(this.keyPrefix + key);
      if (!this.isAvailable) {
        this.isAvailable = true;
      }
      
      if (!raw) {
        return { value: null, isStale: false };
      }

      // Try to parse as SWR envelope {value, expiresAt}
      // Fall back to treating as raw value for backward compatibility
      try {
        const envelope = JSON.parse(raw) as { value: string; expiresAt: number };
        if (envelope.value !== undefined && envelope.expiresAt !== undefined) {
          const isStale = Date.now() > envelope.expiresAt;
          
          // If rejectStale is true, treat stale as cache miss
          if (isStale && options?.rejectStale) {
            return { value: null, isStale: false };
          }
          
          return { value: envelope.value, isStale };
        }
      } catch {
        // Not JSON or not an envelope - treat as legacy raw value (always fresh)
      }
      
      // Legacy format: raw value without envelope (treat as fresh)
      return { value: raw, isStale: false };
    } catch (err) {
      this.logger.warn('Cache get failed:', err);
      this.isAvailable = false;
      return { value: null, isStale: false };
    }
  }

  /**
   * Set a value in the cache with soft TTL (supports stale-while-revalidate)
   * 
   * Stores value with soft expiry timestamp. After soft TTL, value is "stale"
   * but still returned - callers should trigger background refresh.
   * Hard TTL is 24 hours just to prevent infinite Redis growth.
   * 
   * @param key Cache key (will be prefixed with jml:)
   * @param value Value to store
   * @param ttlSeconds Soft TTL - value is "stale" after this but still usable
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      // Store as envelope with soft expiry timestamp
      const envelope = {
        value,
        expiresAt: Date.now() + (ttlSeconds * 1000),
      };
      // Hard TTL is 24h - just for Redis cleanup, not for staleness
      await this.client.setex(this.keyPrefix + key, this.HARD_TTL_SECONDS, JSON.stringify(envelope));
      if (!this.isAvailable) {
        this.isAvailable = true;
      }
    } catch (err) {
      this.logger.warn('Cache set failed:', err);
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
   * @returns Object with value (array or null) and isStale flag
   * 
   * @example
   * const { value, isStale } = await cache.getLookup('TEST', 'priority');
   * const { value, isStale } = await cache.getLookup('TEST', 'component', 'Story');
   */
  async getLookup(
    projectKey: string,
    fieldType: string,
    issueType?: string
  ): Promise<{ value: unknown[] | null; isStale: boolean }> {
    const key = this.buildLookupKey(projectKey, fieldType, issueType);
    const result = await this.get(key);
    
    if (!result.value) {
      return { value: null, isStale: false }; // Cache miss
    }

    // Parse JSON
    try {
      const parsed = JSON.parse(result.value) as unknown[];
      return { value: parsed, isStale: result.isStale };
    } catch (err) {
      this.logger.warn('Cache getLookup JSON parse failed:', err);
      return { value: null, isStale: false };
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

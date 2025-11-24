/**
 * Cache client interface
 * Story: E1-S04
 */

/**
 * Generic cache client interface for storing and retrieving data
 */
export interface CacheClient {
  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Cached value as string, or null if not found
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a value in the cache with TTL
   * @param key Cache key
   * @param value Value to store
   * @param ttlSeconds Time to live in seconds
   */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;

  /**
   * Delete a key from the cache
   * @param key Cache key
   */
  del(key: string): Promise<void>;

  /**
   * Clear all keys matching the namespace pattern
   */
  clear(): Promise<void>;

  /**
   * Test connection to cache
   * @throws {CacheError} if connection fails
   */
  ping(): Promise<void>;
}

/**
 * Cache client interface
 * Story: E1-S04
 */

/**
 * Result from cache get - includes staleness info for stale-while-revalidate
 */
export interface CacheResult {
  /** The cached value, or null if not found */
  value: string | null;
  /** True if the value exists but is past its soft expiry (stale) */
  isStale: boolean;
}

/**
 * Options for cache get operation
 */
export interface CacheGetOptions {
  /** If true, returns null for stale values (bypasses SWR) */
  rejectStale?: boolean;
}

/**
 * Generic cache client interface for storing and retrieving data
 * 
 * Uses stale-while-revalidate (SWR) pattern by default:
 * - get() always returns data if it exists (fresh or stale)
 * - Callers check isStale and trigger background refresh if needed
 * - Use { rejectStale: true } to bypass SWR and treat stale as cache miss
 */
export interface CacheClient {
  /**
   * Get a value from the cache with SWR support
   * @param key Cache key
   * @param options.rejectStale If true, returns null for stale values
   * @returns CacheResult with value and isStale flag
   */
  get(key: string, options?: CacheGetOptions): Promise<CacheResult>;

  /**
   * Set a value in the cache with TTL
   * @param key Cache key
   * @param value Value to store
   * @param ttlSeconds Time to live in seconds (soft expiry for SWR)
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

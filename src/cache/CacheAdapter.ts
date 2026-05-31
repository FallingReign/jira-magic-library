/**
 * Cache Adapter Interface
 *
 * Pluggable cache interface that supports multiple backends
 * (Redis, InMemory, custom implementations).
 */

/**
 * Result from a cache get operation
 */
export interface CacheAdapterResult {
  /** The cached value, or null if not found */
  value: string | null;
  /** True if the value exists but is past its soft expiry (stale) */
  isStale?: boolean;
}

/**
 * Pluggable cache interface for JML.
 *
 * Implementations must support:
 * - TTL-based expiration
 * - Stale-while-revalidate pattern (isStale flag)
 * - Deduplication of concurrent refresh operations
 */
export interface CacheAdapter {
  /**
   * Get a value from the cache.
   * @param key Cache key
   * @returns Result with value and optional staleness indicator
   */
  get(key: string): Promise<CacheAdapterResult>;

  /**
   * Set a value in the cache with a TTL.
   * @param key Cache key
   * @param value Value to store
   * @param ttlSeconds Soft TTL in seconds (value is "stale" after this)
   */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;

  /**
   * Delete a key from the cache.
   * @param key Cache key
   */
  delete(key: string): Promise<void>;

  /**
   * Disconnect and release resources.
   */
  disconnect(): Promise<void>;

  /**
   * Execute a refresh function with deduplication.
   * If a refresh is already in progress for this key, returns the existing
   * promise instead of starting a new one.
   *
   * @param key Unique key identifying this refresh operation
   * @param refreshFn Async function that fetches fresh data and updates cache
   */
  refreshOnce(key: string, refreshFn: () => Promise<void>): Promise<void>;
}

/**
 * In-Memory Cache Implementation
 *
 * Implements CacheAdapter using a Map with TTL-based eviction on access.
 * No external dependencies. Suitable for serverless/testing environments.
 */

import type { CacheAdapter, CacheAdapterResult } from './CacheAdapter.js';

/**
 * Internal entry stored in the cache map
 */
interface CacheEntry {
  value: string;
  /** Timestamp (ms) when the entry becomes stale */
  staleAt: number;
  /** Timestamp (ms) when the entry expires and should be evicted */
  expiresAt: number;
}

/**
 * In-memory cache with TTL-based expiration and stale-while-revalidate support.
 *
 * - `staleAt` = set time + ttlSeconds (soft TTL — value is returned but marked stale)
 * - `expiresAt` = staleAt + hardTtlMultiplier * ttlSeconds (hard TTL — entry evicted)
 *
 * Eviction happens lazily on access (no background timers).
 */
export class InMemoryCache implements CacheAdapter {
  private readonly store = new Map<string, CacheEntry>();
  private readonly refreshInFlight = new Map<string, Promise<void>>();

  /**
   * Hard TTL multiplier — entries are kept for this many times the soft TTL
   * to support stale-while-revalidate. After hard expiry, entries are deleted.
   */
  private readonly hardTtlMultiplier: number;

  /**
   * @param hardTtlMultiplier How many times the soft TTL to keep stale entries.
   *   Default is 4 (e.g., 15min soft TTL → 1h hard TTL).
   */
  constructor(hardTtlMultiplier = 4) {
    this.hardTtlMultiplier = hardTtlMultiplier;
  }

  async get(key: string): Promise<CacheAdapterResult> {
    const entry = this.store.get(key);

    if (!entry) {
      return { value: null, isStale: false };
    }

    const now = Date.now();

    // Hard-expired: evict and return miss
    if (now > entry.expiresAt) {
      this.store.delete(key);
      return { value: null, isStale: false };
    }

    // Stale but not expired: return with isStale flag
    const isStale = now > entry.staleAt;
    return { value: entry.value, isStale };
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const now = Date.now();
    const ttlMs = ttlSeconds * 1000;

    this.store.set(key, {
      value,
      staleAt: now + ttlMs,
      expiresAt: now + ttlMs * this.hardTtlMultiplier,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async disconnect(): Promise<void> {
    this.store.clear();
    this.refreshInFlight.clear();
  }

  async refreshOnce(key: string, refreshFn: () => Promise<void>): Promise<void> {
    const existing = this.refreshInFlight.get(key);
    if (existing) {
      return existing;
    }

    const refreshPromise = refreshFn()
      .finally(() => {
        this.refreshInFlight.delete(key);
      });

    this.refreshInFlight.set(key, refreshPromise);
    return refreshPromise;
  }

  /** Number of entries currently in the cache (for testing/debugging) */
  get size(): number {
    return this.store.size;
  }
}

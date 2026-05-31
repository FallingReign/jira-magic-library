/**
 * Cache Invalidation
 *
 * Provides targeted invalidation of cached metadata for Cloud configuration
 * changes. Tracks known cache key patterns and deletes them on demand.
 */

import type { CacheAdapter } from '../cache/CacheAdapter.js';

/**
 * Options for invalidating cached data.
 */
export interface InvalidationOptions {
  /** Invalidate all cached data for a project */
  project?: string;
  /** Invalidate user cache */
  users?: boolean;
  /** Invalidate field metadata */
  fields?: boolean;
  /** Invalidate all caches */
  all?: boolean;
}

/**
 * Well-known cache key prefixes used by JML components.
 */
const CACHE_PREFIXES = {
  schema: 'jml:schema:',
  project: 'jml:project:',
  user: 'jml:user:',
  field: 'jml:field:',
  issueType: 'jml:issuetype:',
  entity: 'jml:entity:',
  discovery: 'jml:discovery:',
} as const;

export class CacheInvalidation {
  /** Track observed cache keys so we can delete them on invalidation */
  private readonly knownKeys = new Set<string>();

  constructor(private readonly cache: CacheAdapter) {}

  /**
   * Register a cache key that was set, so we can invalidate it later.
   * Called by cache-writing code to track keys.
   */
  trackKey(key: string): void {
    this.knownKeys.add(key);
  }

  /**
   * Register multiple keys.
   */
  trackKeys(keys: string[]): void {
    for (const key of keys) {
      this.knownKeys.add(key);
    }
  }

  /**
   * Invalidate cached data based on options.
   */
  async invalidate(options: InvalidationOptions): Promise<{ keysInvalidated: number }> {
    let count = 0;

    if (options.all) {
      // Delete all known keys
      for (const key of this.knownKeys) {
        await this.cache.delete(key);
        count++;
      }
      this.knownKeys.clear();
      return { keysInvalidated: count };
    }

    const keysToDelete: string[] = [];

    if (options.project) {
      const projectLower = options.project.toLowerCase();
      for (const key of this.knownKeys) {
        if (
          key.includes(projectLower) ||
          key.includes(options.project) ||
          key.startsWith(CACHE_PREFIXES.schema) ||
          key.startsWith(CACHE_PREFIXES.project) ||
          key.startsWith(CACHE_PREFIXES.discovery)
        ) {
          keysToDelete.push(key);
        }
      }
    }

    if (options.users) {
      for (const key of this.knownKeys) {
        if (key.startsWith(CACHE_PREFIXES.user) || key.startsWith(CACHE_PREFIXES.entity)) {
          keysToDelete.push(key);
        }
      }
    }

    if (options.fields) {
      for (const key of this.knownKeys) {
        if (
          key.startsWith(CACHE_PREFIXES.field) ||
          key.startsWith(CACHE_PREFIXES.schema) ||
          key.startsWith(CACHE_PREFIXES.issueType)
        ) {
          keysToDelete.push(key);
        }
      }
    }

    // Deduplicate and delete
    const unique = [...new Set(keysToDelete)];
    for (const key of unique) {
      await this.cache.delete(key);
      this.knownKeys.delete(key);
      count++;
    }

    return { keysInvalidated: count };
  }

  /**
   * Get cache stats.
   */
  async stats(): Promise<{ keys: number; hitRate?: number }> {
    return { keys: this.knownKeys.size };
  }
}

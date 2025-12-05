/**
 * Manifest Storage for Bulk Operations
 * Story: E4-S02
 * 
 * Stores bulk operation results in Redis with 24-hour TTL for retry support.
 * Error format matches JIRA bulk API response (E4-S03) for zero-conversion storage.
 */

import { randomUUID } from 'crypto';
import type { RedisCache, Logger } from '../cache/RedisCache.js';
import { defaultLogger } from '../cache/RedisCache.js';
import type { BulkManifest, ManifestUpdateData } from '../types/bulk.js';

/**
 * Manages bulk operation manifest storage in Redis
 * 
 * @example
 * ```typescript
 * const storage = new ManifestStorage(redisCache);
 * 
 * // Generate unique ID
 * const manifestId = storage.generateManifestId();
 * 
 * // Create and store manifest
 * const manifest: BulkManifest = {
 *   id: manifestId,
 *   timestamp: Date.now(),
 *   total: 100,
 *   succeeded: [0, 1, 2],
 *   failed: [3, 4],
 *   created: { '0': 'PROJ-123', '1': 'PROJ-124' },
 *   errors: {
 *     '3': { status: 400, errors: { issuetype: 'required' } }
 *   }
 * };
 * 
 * await storage.storeManifest(manifest);
 * 
 * // Later: retrieve for retry
 * const retrieved = await storage.getManifest(manifestId);
 * ```
 */
export class ManifestStorage {
  private readonly ttlSeconds: number;
  private readonly logger: Logger;

  /**
   * Creates a new ManifestStorage instance
   * 
   * @param cache Redis cache instance
   * @param ttlSeconds Time-to-live in seconds (default: 86400 = 24 hours)
   * @param logger Optional logger for dependency injection (defaults to console)
   */
  constructor(
    private readonly cache: RedisCache,
    ttlSeconds: number = 86400,
    logger: Logger = defaultLogger
  ) {
    this.ttlSeconds = ttlSeconds;
    this.logger = logger;
  }

  /**
   * Generates a unique manifest ID
   * 
   * Format: `bulk-{uuid v4}`
   * 
   * @returns Unique manifest ID
   * 
   * @example
   * ```typescript
   * const id = storage.generateManifestId();
   * // → "bulk-12345678-1234-4234-8234-123456789abc"
   * ```
   */
  generateManifestId(): string {
    return `bulk-${randomUUID()}`;
  }

  /**
   * Stores a manifest in Redis
   * 
   * Key pattern: `bulk:manifest:{manifestId}`
   * 
   * Gracefully degrades if Redis is unavailable (logs warning, doesn't throw).
   * 
   * @param manifest Bulk manifest to store
   * 
   * @example
   * ```typescript
   * await storage.storeManifest({
   *   id: 'bulk-12345678-...',
   *   timestamp: Date.now(),
   *   total: 10,
   *   succeeded: [0, 1, 2],
   *   failed: [3],
   *   created: { '0': 'PROJ-123' },
   *   errors: { '3': { status: 400, errors: { field: 'error' } } }
   * });
   * ```
   */
  async storeManifest(manifest: BulkManifest): Promise<void> {
    try {
      const key = `bulk:manifest:${manifest.id}`;
      const value = JSON.stringify(manifest);
      await this.cache.set(key, value, this.ttlSeconds);
    } catch (error) {
      this.logger.warn('Failed to store manifest in Redis:', error);
      // Graceful degradation: don't throw, manifest still returned to user
    }
  }

  /**
   * Retrieves a manifest from Redis
   * 
   * @param manifestId Manifest ID to retrieve
   * @returns Manifest if found, null if not found/expired/error
   * 
   * @example
   * ```typescript
   * const manifest = await storage.getManifest('bulk-12345678-...');
   * if (manifest) {
   *   console.log(`Found ${manifest.succeeded.length} succeeded`);
   * }
   * ```
   */
  async getManifest(manifestId: string): Promise<BulkManifest | null> {
    try {
      const key = `bulk:manifest:${manifestId}`;
      const result = await this.cache.get(key);
      
      if (!result.value) {
        return null; // Not found or expired
      }

      return JSON.parse(result.value) as BulkManifest;
    } catch (error) {
      this.logger.warn('Failed to retrieve manifest from Redis:', error);
      return null; // Graceful degradation
    }
  }

  /**
   * Updates an existing manifest with retry results
   * 
   * Merges new results with existing manifest:
   * - Adds new succeeded indices
   * - Updates failed indices
   * - Merges created keys
   * - Updates error details
   * - Preserves original timestamp
   * 
   * @param manifestId Manifest ID to update
   * @param updates Retry results to merge
   * 
   * @example
   * ```typescript
   * // After retry, update manifest with new results
   * await storage.updateManifest('bulk-12345678-...', {
   *   succeeded: [3],  // Previously failed, now succeeded
   *   failed: [4],     // Still failed
   *   created: { '3': 'PROJ-124' },
   *   errors: { '4': { status: 400, errors: { field: 'error' } } }
   * });
   * ```
   */
  async updateManifest(
    manifestId: string,
    updates: ManifestUpdateData
  ): Promise<void> {
    // Retrieve existing manifest
    const existing = await this.getManifest(manifestId);
    if (!existing) {
      this.logger.warn(`Cannot update manifest ${manifestId}: not found`);
      return;
    }

    // Merge succeeded indices (add new successes, remove from failed)
    const succeededSet = new Set([...existing.succeeded, ...updates.succeeded]);
    const mergedSucceeded = Array.from(succeededSet).sort((a, b) => a - b);

    // Update failed indices (only keep rows that are still failing)
    const failedSet = new Set(updates.failed);
    const mergedFailed = Array.from(failedSet).sort((a, b) => a - b);

    // Merge created keys
    const mergedCreated = {
      ...existing.created,
      ...updates.created,
    };

    // Update errors (remove errors for succeeded rows, update for failed rows)
    const mergedErrors: BulkManifest['errors'] = {};
    
    // Keep existing errors for rows still failing
    for (const [rowIndex, error] of Object.entries(existing.errors)) {
      const index = Number(rowIndex);
      if (failedSet.has(index)) {
        mergedErrors[index] = error; // Will be overwritten if updated
      }
    }
    
    // Add/update errors from retry
    for (const [rowIndex, error] of Object.entries(updates.errors)) {
      mergedErrors[Number(rowIndex)] = error;
    }

    // Create updated manifest (preserve original timestamp)
    const updatedManifest: BulkManifest = {
      ...existing,
      succeeded: mergedSucceeded,
      failed: mergedFailed,
      created: mergedCreated,
      errors: mergedErrors,
    };

    // Store updated manifest (has internal error handling)
    await this.storeManifest(updatedManifest);
  }
}

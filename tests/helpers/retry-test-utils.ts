/**
 * Test Helpers: Retry Test Setup
 * Story: E4-S05
 * 
 * Shared setup utilities for retry unit tests.
 */

import { RedisCache } from '../../src/cache/RedisCache.js';
import { BulkManifest } from '../../src/types/bulk.js';

/**
 * Setup manifest in mock cache
 * Helper to reduce boilerplate in tests
 * 
 * Note: ManifestStorage uses key pattern `bulk:manifest:${id}`
 */
export function setupManifestInCache(
  mockCache: jest.Mocked<RedisCache>,
  manifest: BulkManifest
): void {
  // Mock to handle the `bulk:manifest:` prefix used by ManifestStorage
  // Returns { value, isStale } format matching new cache API
  mockCache.get = jest.fn().mockImplementation((key: string) => {
    if (key.startsWith('bulk:manifest:')) {
      return Promise.resolve({ value: JSON.stringify(manifest), isStale: false });
    }
    return Promise.resolve({ value: null, isStale: false });
  });
}

/**
 * Setup bulk API success response
 * Mocks client.post to return successful bulk creation
 */
export function setupBulkSuccess(
  mockClient: any,
  createdKeys: string[],
  startIndex = 0
): void {
  const issues = createdKeys.map((key, i) => ({
    index: startIndex + i,
    key,
    id: `1000${startIndex + i}`,
    self: `https://jira/rest/api/2/issue/1000${startIndex + i}`,
  }));

  mockClient.post = jest.fn().mockResolvedValue({
    issues,
    errors: [],
  });
}

/**
 * Setup bulk API partial failure response
 * Mocks JIRA's bulk creation endpoint with mixed success/failure
 * 
 * JIRA error format: { failedElementNumber, status, elementErrors: { errors } }
 */
export function setupBulkPartialFailure(
  mockClient: any,
  created: Array<{ index: number; key: string }>,
  failed: Array<{ index: number; status: number; errors: Record<string, string> }>
): void {
  const issues = created.map(c => ({
    ...c,
    id: `1000${c.index}`,
    self: `https://jira/rest/api/2/issue/1000${c.index}`,
  }));

  // Map to JIRA's actual error format
  const errors = failed.map(f => ({
    failedElementNumber: f.index,
    status: f.status,
    elementErrors: {
      errors: f.errors,
    },
  }));

  mockClient.post = jest.fn().mockResolvedValue({
    issues,
    errors,
  });
}

/**
 * Verify manifest was stored to cache
 */
export function expectManifestStored(
  mockCache: jest.Mocked<RedisCache>,
  expectedPartial: Partial<BulkManifest>
): void {
  expect(mockCache.set).toHaveBeenCalledWith(
    expect.any(String),
    expect.stringContaining(JSON.stringify(expectedPartial).slice(1, 20)), // Check partial match
    expect.any(Number)
  );
}

/**
 * Test Helper Utilities
 * 
 * Common test helpers to reduce duplication across unit tests.
 * Provides factory functions for mock objects used in converter tests.
 */

import type { ConversionContext, LookupCacheResult } from '../../src/types/converter.js';
import type { JiraClient } from '../../src/client/JiraClient.js';

/**
 * Creates a mock cache object with jest functions
 * Used by converters for lookup caching
 * 
 * Note: Both get and getLookup now return { value, isStale } format for SWR support
 */
export function createMockCache(): { 
  get: jest.Mock; 
  set: jest.Mock;
  getLookup: jest.Mock; 
  setLookup: jest.Mock;
  del: jest.Mock;
  clear: jest.Mock;
  ping: jest.Mock;
} {
  return {
    get: jest.fn().mockResolvedValue({ value: null, isStale: false }),
    set: jest.fn().mockResolvedValue(undefined),
    getLookup: jest.fn().mockResolvedValue({ value: null, isStale: false }),
    setLookup: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Helper to mock get() with the correct return format
 * @param mockCache - The mock cache object
 * @param value - The value to return (or null for cache miss)
 * @param isStale - Whether the cached value is stale (default: false)
 */
export function mockCacheGet(
  mockCache: { get: jest.Mock },
  value: string | null,
  isStale = false
): void {
  mockCache.get.mockResolvedValue({ value, isStale });
}

/**
 * Helper to mock getLookup with the correct return format
 * @param mockCache - The mock cache object
 * @param value - The value to return (or null for cache miss)
 * @param isStale - Whether the cached value is stale (default: false)
 */
export function mockLookupResult(
  mockCache: { getLookup: jest.Mock },
  value: unknown[] | null,
  isStale = false
): void {
  mockCache.getLookup.mockResolvedValue({ value, isStale });
}

/**
 * Creates a mock ConversionContext with sensible defaults
 * @param overrides - Optional properties to override defaults
 * @returns ConversionContext suitable for unit tests
 * 
 * @example
 * ```typescript
 * const context = createMockContext();
 * const contextWithClient = createMockContext({ client: mockClient });
 * ```
 */
export function createMockContext(overrides?: Partial<ConversionContext>): ConversionContext {
  return {
    projectKey: 'TEST',
    issueType: 'Bug',
    cache: createMockCache() as any,
    registry: {} as any,
    ...overrides,
  };
}

/**
 * Creates a mock JiraClient with jest functions
 * Used by converters that need to make API calls (e.g., UserConverter)
 */
export function createMockClient(): jest.Mocked<Partial<JiraClient>> {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

/**
 * Test Helper Utilities
 * 
 * Common test helpers to reduce duplication across unit tests.
 * Provides factory functions for mock objects used in converter tests.
 */

import type { ConversionContext } from '../../src/types/converter.js';
import type { JiraClient } from '../../src/client/JiraClient.js';

/**
 * Creates a mock cache object with jest functions
 * Used by converters for lookup caching
 */
export function createMockCache(): { getLookup: jest.Mock; setLookup: jest.Mock } {
  return {
    getLookup: jest.fn(),
    setLookup: jest.fn(),
  };
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

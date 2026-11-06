import type { JMLConfig } from '../types/config.js';
import { ConfigurationError } from '../errors/ConfigurationError.js';

/**
 * Largest bulk create group Jira Cloud accepts per request.
 * Source: Jira Cloud REST API v3 OpenAPI, POST /rest/api/3/issue/bulk
 * ("Creates upto 50 issues").
 */
export const MAX_BULK_GROUP_SIZE = 50;

/** Default number of issues sent per bulk create request. */
export const DEFAULT_BULK_GROUP_SIZE = 10;

/**
 * Read `bulk.groupSize` from config.
 *
 * @throws {ConfigurationError} When the value is not a whole number from 1 to 50.
 */
export function resolveBulkGroupSize(config?: Pick<JMLConfig, 'bulk'>): number {
  const value = config?.bulk?.groupSize;
  if (value === undefined) return DEFAULT_BULK_GROUP_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_BULK_GROUP_SIZE) {
    throw new ConfigurationError(
      `bulk.groupSize must be a whole number from 1 to ${MAX_BULK_GROUP_SIZE} ` +
      `(Jira Cloud accepts at most ${MAX_BULK_GROUP_SIZE} issues per bulk request); got ${String(value)}`,
      { field: 'bulk.groupSize', value }
    );
  }
  return value;
}

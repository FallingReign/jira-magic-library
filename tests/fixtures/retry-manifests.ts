/**
 * Test Fixtures: Retry Manifests
 * Story: E4-S05
 * 
 * Shared manifest fixtures for retry testing.
 * Reduces duplication across retry unit tests.
 */

import { BulkManifest } from '../../src/types/bulk.js';

/**
 * Creates a basic manifest with 1 success, 1 failure
 */
export function createBasicManifest(id = 'bulk-test-123'): BulkManifest {
  return {
    id,
    timestamp: Date.now(),
    total: 2,
    succeeded: [0],
    failed: [1],
    created: { '0': 'PROJ-1' },
    errors: { '1': { status: 400, errors: { field: 'error' } } },
  };
}

/**
 * Creates a manifest with multiple failures
 */
export function createMultiFailureManifest(id = 'bulk-test-456'): BulkManifest {
  return {
    id,
    timestamp: Date.now(),
    total: 5,
    succeeded: [0, 1, 3],
    failed: [2, 4],
    created: { '0': 'PROJ-1', '1': 'PROJ-2', '3': 'PROJ-4' },
    errors: {
      '2': { status: 400, errors: { field: 'error' } },
      '4': { status: 400, errors: { field: 'error' } },
    },
  };
}

/**
 * Creates an old manifest (>24 hours)
 */
export function createOldManifest(id = 'bulk-old'): BulkManifest {
  return {
    id,
    timestamp: Date.now() - 48 * 60 * 60 * 1000, // 48 hours ago
    total: 2,
    succeeded: [0],
    failed: [1],
    created: { '0': 'PROJ-123' },
    errors: { '1': { status: 400, errors: { field: 'error' } } },
  };
}

/**
 * Creates manifest after first retry (some failures resolved)
 */
export function createPartialRetryManifest(id = 'bulk-test-789'): BulkManifest {
  return {
    id,
    timestamp: Date.now(),
    total: 4,
    succeeded: [0, 1],
    failed: [2, 3],
    created: { '0': 'PROJ-1', '1': 'PROJ-2' },
    errors: {
      '2': { status: 400, errors: { field: 'error' } },
      '3': { status: 400, errors: { field: 'error' } },
    },
  };
}

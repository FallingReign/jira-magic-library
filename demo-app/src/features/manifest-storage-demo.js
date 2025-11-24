/**
 * Bulk Manifest Storage Demo (E4-S02)
 * 
 * Interactive demo showing how ManifestStorage tracks bulk operation results
 * in Redis for retry/rollback support
 */

import { RedisCache } from 'jira-magic-library';
import { showHeader, info, success, error, warning, showCode, pause, clear } from '../ui/display.js';

/**
 * Demo: Bulk Manifest Storage with Redis
 */
export async function runManifestStorageDemo(config) {
  await clear();
  showHeader('Bulk Manifest Storage Demo', 'E4-S02');

  info('This demo shows how JIRA Magic Library tracks bulk operation results');
  info('using Redis for retry and rollback capabilities.');
  info('');

  // Step 1: Connect to Redis
  info('📡 Step 1: Connect to Redis');
  showCode(`
const cache = new RedisCache({
  host: 'localhost',
  port: 6379
});
  `.trim());

  let cache;
  try {
    cache = new RedisCache({ host: 'localhost', port: 6379 });
    await cache.ping(); // Connect and verify Redis is available
    success('✓ Redis connected (localhost:6379)');
  } catch (err) {
    error('✗ Redis connection failed');
    warning('Make sure Redis is running: npm run redis:start');
    await pause();
    return;
  }

  await pause();

  // Step 2: Import ManifestStorage and Generate ID
  info('');
  info('🆔 Step 2: Generate Manifest ID');
  showCode(`
import { ManifestStorage } from 'jira-magic-library';

const storage = new ManifestStorage(cache);
const manifestId = storage.generateManifestId();

// Format: bulk-{uuid v4}
// Example: bulk-550e8400-e29b-41d4-a716-446655440000
  `.trim());

  // Actually import and run (dynamic import for demo purposes)
  const { ManifestStorage } = await import('jira-magic-library');
  const storage = new ManifestStorage(cache);
  const manifestId = storage.generateManifestId();

  success(`✓ Generated Manifest ID: ${manifestId}`);
  await pause();

  // Step 3: Create and Store Manifest
  info('');
  info('💾 Step 3: Store Manifest in Redis');
  info('Simulate a bulk operation with 10 rows: 7 succeeded, 3 failed');
  showCode(`
const manifest = {
  id: manifestId,
  timestamp: Date.now(),
  total: 10,
  succeeded: [0, 1, 2, 4, 5, 7, 9],  // Row indices
  failed: [3, 6, 8],                   // Row indices
  created: {
    0: 'DEMO-100',  // Row 0 → Issue DEMO-100
    1: 'DEMO-101',
    2: 'DEMO-102',
    4: 'DEMO-103',
    5: 'DEMO-104',
    7: 'DEMO-105',
    9: 'DEMO-106'
  },
  errors: {
    3: {
      status: 400,
      errors: {
        'summary': 'Summary is required',
        'issuetype': 'Issue type not found'
      }
    },
    6: {
      status: 403,
      errors: {
        'project': 'No permission to create in project'
      }
    },
    8: {
      status: 400,
      errors: {
        'priority': 'Invalid priority value',
        'customfield_10001': 'Field is required'
      }
    }
  }
};

// Store in Redis with 24-hour TTL
await storage.storeManifest(manifest);

// Stored as: bulk:manifest:{manifestId}
// TTL: 86400 seconds (24 hours)
  `.trim());

  const manifest = {
    id: manifestId,
    timestamp: Date.now(),
    total: 10,
    succeeded: [0, 1, 2, 4, 5, 7, 9],
    failed: [3, 6, 8],
    created: {
      '0': 'DEMO-100',
      '1': 'DEMO-101',
      '2': 'DEMO-102',
      '4': 'DEMO-103',
      '5': 'DEMO-104',
      '7': 'DEMO-105',
      '9': 'DEMO-106',
    },
    errors: {
      '3': {
        status: 400,
        errors: {
          'summary': 'Summary is required',
          'issuetype': 'Issue type not found',
        },
      },
      '6': {
        status: 403,
        errors: {
          'project': 'No permission to create in project',
        },
      },
      '8': {
        status: 400,
        errors: {
          'priority': 'Invalid priority value',
          'customfield_10001': 'Field is required',
        },
      },
    },
  };

  try {
    await storage.storeManifest(manifest);
    success(`✓ Manifest stored in Redis: bulk:manifest:${manifestId}`);
    success('✓ TTL: 24 hours (86400 seconds)');
  } catch (err) {
    error(`✗ Failed to store manifest: ${err.message}`);
  }

  await pause();

  // Step 4: Retrieve Manifest
  info('');
  info('🔍 Step 4: Retrieve Manifest');
  showCode(`
const retrieved = await storage.getManifest(manifestId);

// Returns BulkManifest object or null if:
// - Manifest not found
// - Manifest expired (TTL elapsed)
// - Redis error (graceful degradation)
  `.trim());

  try {
    const retrieved = await storage.getManifest(manifestId);
    if (retrieved) {
      success('✓ Manifest retrieved successfully');
      info(`   Total rows: ${retrieved.total}`);
      info(`   Succeeded: ${retrieved.succeeded.length}`);
      info(`   Failed: ${retrieved.failed.length}`);
      info(`   Created issues: ${Object.keys(retrieved.created).length}`);
    } else {
      warning('⚠ Manifest not found (null returned)');
    }
  } catch (err) {
    error(`✗ Failed to retrieve manifest: ${err.message}`);
  }

  await pause();

  // Step 5: Update Manifest (Retry Scenario)
  info('');
  info('🔄 Step 5: Update Manifest After Retry');
  info('Simulate retrying the 3 failed rows: 2 succeed, 1 still fails');
  showCode(`
const retryResults = {
  succeeded: [3, 8],    // Row 3 and 8 now succeeded
  failed: [6],          // Row 6 still failed
  created: {
    3: 'DEMO-107',      // Row 3 → Issue DEMO-107
    8: 'DEMO-108'       // Row 8 → Issue DEMO-108
  },
  errors: {
    6: {                // Row 6 error details (unchanged)
      status: 403,
      errors: { 'project': 'No permission' }
    }
  }
};

await storage.updateManifest(manifestId, retryResults);

// Merges results:
// - succeeded: [0,1,2,4,5,7,9] + [3,8] = [0,1,2,3,4,5,7,8,9]
// - failed: [3,6,8] - [3,8] + [6] = [6]
// - created: {...existing, ...new} = 9 total
// - errors: only row 6 remains
// - timestamp: PRESERVED (original creation time)
  `.trim());

  const retryResults = {
    succeeded: [3, 8],
    failed: [6],
    created: {
      '3': 'DEMO-107',
      '8': 'DEMO-108',
    },
    errors: {
      '6': {
        status: 403,
        errors: { 'project': 'No permission to create in project' },
      },
    },
  };

  try {
    await storage.updateManifest(manifestId, retryResults);
    success('✓ Manifest updated with retry results');

    const updated = await storage.getManifest(manifestId);
    if (updated) {
      info(`   Total rows: ${updated.total}`);
      info(`   Succeeded: ${updated.succeeded.length} (was 7, now 9)`);
      info(`   Failed: ${updated.failed.length} (was 3, now 1)`);
      info(`   Created issues: ${Object.keys(updated.created).length} (was 7, now 9)`);
      info(`   Timestamp: ${updated.timestamp} (preserved from original)`);
    }
  } catch (err) {
    error(`✗ Failed to update manifest: ${err.message}`);
  }

  await pause();

  // Step 6: Graceful Degradation
  info('');
  info('🛡️ Step 6: Graceful Degradation');
  info('ManifestStorage handles Redis failures gracefully');
  showCode(`
// If Redis is unavailable:
// - storeManifest() logs warning, doesn't throw
// - getManifest() returns null
// - updateManifest() logs warning, doesn't throw

// Benefit: Bulk operations continue even if Redis fails
// Trade-off: No retry/rollback tracking for that operation
  `.trim());

  warning('⚠ Redis failures are logged but don\'t throw errors');
  info('  Bulk operations continue without tracking');
  info('  Ideal for resilient production systems');

  await pause();

  // Step 7: TTL and Expiration
  info('');
  info('⏰ Step 7: TTL and Expiration');
  showCode(`
// Default TTL: 24 hours (86400 seconds)
const storage = new ManifestStorage(cache, 86400);

// Custom TTL: 1 hour
const shortStorage = new ManifestStorage(cache, 3600);

// After TTL expires:
// - Manifest is automatically deleted by Redis
// - getManifest() returns null
// - No manual cleanup needed
  `.trim());

  info('Manifests are automatically cleaned up after TTL expires');
  info('  Default: 24 hours (86400 seconds)');
  info('  Configurable via constructor parameter');
  info('  No manual cleanup needed');

  await pause();

  // Cleanup
  info('');
  info('🧹 Cleanup: Removing demo manifest from Redis');
  try {
    // Delete the demo manifest
    await cache.del(`bulk:manifest:${manifestId}`);
    success('✓ Demo manifest deleted');
  } catch (err) {
    warning('⚠ Could not delete demo manifest (may not exist)');
  }

  try {
    await cache.disconnect();
    success('✓ Redis connection closed');
  } catch (err) {
    warning('⚠ Could not close Redis connection');
  }

  info('');
  success('✅ Manifest Storage Demo Complete!');
  info('');
  info('Key Takeaways:');
  info('  • Manifest ID: bulk-{uuid v4} format');
  info('  • Redis Key: bulk:manifest:{manifestId}');
  info('  • TTL: 24 hours (configurable)');
  info('  • Update: Merges retry results, preserves timestamp');
  info('  • Error Format: Matches JIRA API (zero conversion)');
  info('  • Graceful: Redis failures logged, don\'t throw');

  await pause();
}

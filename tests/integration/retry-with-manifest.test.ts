/**
 * Integration Tests: Retry with Manifest Support
 * 
 * Story: E4-S05 - Retry with Manifest Support
 * 
 * Tests real retry scenarios:
 * - Create bulk → partial failure → retry with manifest ID → success
 * - Multiple sequential retries with same manifest ID
 * - Manifest accumulation across retries
 */

import './setup'; // Load test config
import { JML } from '../../src/jml.js';
import { loadConfig } from '../../src/config/loader.js';
import { isJiraConfigured, cleanupIssues } from './helpers.js';
import { BulkResult } from '../../src/types/bulk.js';
import { JiraClientImpl } from '../../src/client/JiraClient.js';

describe('Integration: Retry with Manifest Support (E4-S05)', () => {
  let jml: JML;
  let client: JiraClientImpl;
  const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'ZUL';
  const createdIssues: string[] = [];

  beforeAll(async () => {
    if (!isJiraConfigured()) {
      console.warn('⚠️  Skipping integration tests: JIRA not configured');
      return;
    }

    console.log('\n🔄 Retry with Manifest Integration Tests');
    console.log(`   JIRA: ${process.env.JIRA_BASE_URL}`);
    console.log(`   Project: ${PROJECT_KEY}\n`);

    const config = loadConfig();
    jml = new JML(config);
    client = new JiraClientImpl({
      baseUrl: config.baseUrl,
      auth: config.auth,
      redis: config.redis
    });
  }, 30000);

  afterEach(async () => {
    if (isJiraConfigured() && createdIssues.length > 0) {
      await cleanupIssues(client, createdIssues);
      createdIssues.length = 0;
    }
  }, 60000);

  afterAll(async () => {
    // Clean up Redis connections to allow Jest to exit
    if (jml && (jml.issues as any).cache) {
      const cache = (jml.issues as any).cache;
      if (cache.disconnect) {
        await cache.disconnect();
      }
    }
  }, 10000);

  // AC7: Integration test - create → partial fail → retry → success
  describe('AC7.1: Retry After Partial Failure', () => {
    it('should retry failed rows using manifest ID', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating bulk with intentional failure...');

      // Create bulk with one invalid issue type (will fail)
      const timestamp = new Date().toISOString();
      const payload = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `E4-S05 Retry Test 1 ${timestamp}` },
        { Project: PROJECT_KEY, 'Issue Type': 'InvalidType', Summary: `E4-S05 Retry Test 2 ${timestamp}` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `E4-S05 Retry Test 3 ${timestamp}` },
      ];

      const result1 = await jml.issues.create(payload) as BulkResult;

      console.log(`   Result 1: ${result1.succeeded}/${result1.total} succeeded`);
      console.log(`   Manifest ID: ${result1.manifest.id}`);

      // Verify partial success
      expect(result1.total).toBe(3);
      expect(result1.succeeded).toBe(2); // Tasks succeed
      expect(result1.failed).toBe(1); // InvalidType fails
      expect(result1.manifest.id).toBeTruthy();
      expect(result1.manifest.failed).toEqual([1]); // Row 1 failed (0-indexed)

      // Track succeeded issues for cleanup
      Object.values(result1.manifest.created).forEach(key => {
        if (typeof key === 'string') createdIssues.push(key);
      });

      console.log('   🔧 Fixing failed row and retrying...');

      // Fix the failed row (change InvalidType to Task)
      payload[1]['Issue Type'] = 'Task';

      // Retry with manifest ID
      const result2 = await jml.issues.create(payload, { 
        retry: result1.manifest.id 
      }) as BulkResult;

      console.log(`   Result 2: ${result2.succeeded}/${result2.total} succeeded`);
      console.log(`   Manifest ID: ${result2.manifest.id} (same: ${result2.manifest.id === result1.manifest.id})`);

      // Verify retry success
      expect(result2.manifest.id).toBe(result1.manifest.id); // Same manifest ID
      expect(result2.total).toBe(3); // All 3 original rows
      expect(result2.succeeded).toBe(3); // All succeeded now
      expect(result2.failed).toBe(0); // No failures
      expect(result2.manifest.succeeded).toHaveLength(3); // Indices [0, 1, 2]
      expect(result2.manifest.failed).toHaveLength(0); // No failures

      // Track new issue for cleanup
      const newKey = result2.manifest.created['1']; // Row 1 now created
      expect(newKey).toBeTruthy();
      createdIssues.push(newKey);

      console.log(`   ✓ Retry successful: all 3 issues created`);
    }, 60000);

    it('should preserve original manifest data during retry', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Testing manifest preservation...');

      const timestamp = new Date().toISOString();
      const payload = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `E4-S05 Preserve Test 1 ${timestamp}` },
        { Project: PROJECT_KEY, 'Issue Type': 'InvalidType', Summary: `E4-S05 Preserve Test 2 ${timestamp}` },
      ];

      const result1 = await jml.issues.create(payload) as BulkResult;
      const originalTimestamp = result1.manifest.timestamp;
      const originalCreated = { ...result1.manifest.created };

      // Track created issues
      Object.values(result1.manifest.created).forEach(key => {
        if (typeof key === 'string') createdIssues.push(key);
      });

      // Fix and retry
      payload[1]['Issue Type'] = 'Task';
      const result2 = await jml.issues.create(payload, { 
        retry: result1.manifest.id 
      }) as BulkResult;

      // Verify original data preserved
      expect(result2.manifest.id).toBe(result1.manifest.id);
      expect(result2.manifest.timestamp).toBe(originalTimestamp);
      expect(result2.manifest.created['0']).toBe(originalCreated['0']); // Original issue unchanged

      // Track new issue
      createdIssues.push(result2.manifest.created['1']);

      console.log('   ✓ Original manifest data preserved');
    }, 60000);
  });

  // AC7: Integration test - multiple retries in sequence
  describe('AC7.2: Multiple Sequential Retries', () => {
    it('should support multiple retry attempts with same manifest', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating bulk with multiple failures...');

      const timestamp = new Date().toISOString();
      const payload = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `E4-S05 Multi Retry 1 ${timestamp}` },
        { Project: PROJECT_KEY, 'Issue Type': 'InvalidType1', Summary: `E4-S05 Multi Retry 2 ${timestamp}` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `E4-S05 Multi Retry 3 ${timestamp}` },
        { Project: PROJECT_KEY, 'Issue Type': 'InvalidType2', Summary: `E4-S05 Multi Retry 4 ${timestamp}` },
      ];

      // Initial attempt: 2 succeed, 2 fail
      const result1 = await jml.issues.create(payload) as BulkResult;
      console.log(`   Attempt 1: ${result1.succeeded}/4 succeeded`);

      expect(result1.succeeded).toBe(2);
      expect(result1.failed).toBe(2);
      expect(result1.manifest.failed).toEqual([1, 3]); // Rows 1 and 3 failed

      // Track succeeded issues
      Object.values(result1.manifest.created).forEach(key => {
        if (typeof key === 'string') createdIssues.push(key);
      });

      console.log('   🔧 Fixing first failed row (row 1)...');

      // Fix only row 1, leave row 3 broken
      payload[1]['Issue Type'] = 'Task';

      // Retry 1: 1 more succeeds, 1 still fails
      const result2 = await jml.issues.create(payload, { 
        retry: result1.manifest.id 
      }) as BulkResult;
      console.log(`   Attempt 2: ${result2.succeeded}/4 succeeded`);

      expect(result2.manifest.id).toBe(result1.manifest.id);
      expect(result2.succeeded).toBe(3); // Original 2 + 1 new
      expect(result2.failed).toBe(1); // Row 3 still failed
      expect(result2.manifest.failed).toEqual([3]);

      // Track new issue
      createdIssues.push(result2.manifest.created['1']);

      console.log('   🔧 Fixing second failed row (row 3)...');

      // Fix row 3
      payload[3]['Issue Type'] = 'Task';

      // Retry 2: All succeed
      const result3 = await jml.issues.create(payload, { 
        retry: result2.manifest.id 
      }) as BulkResult;
      console.log(`   Attempt 3: ${result3.succeeded}/4 succeeded`);

      expect(result3.manifest.id).toBe(result1.manifest.id); // Same manifest throughout
      expect(result3.succeeded).toBe(4); // All succeeded
      expect(result3.failed).toBe(0);
      expect(result3.manifest.succeeded).toHaveLength(4); // [0, 1, 2, 3]
      expect(result3.manifest.failed).toHaveLength(0);

      // Track final issue
      createdIssues.push(result3.manifest.created['3']);

      console.log(`   ✓ Multiple retries successful: all 4 issues created`);
      console.log(`   ✓ Same manifest ID throughout: ${result3.manifest.id}`);
    }, 90000);

    it('should accumulate successes across multiple retries', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Testing success accumulation...');

      const timestamp = new Date().toISOString();
      const payload = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `E4-S05 Accumulate 1 ${timestamp}` },
        { Project: PROJECT_KEY, 'Issue Type': 'InvalidType', Summary: `E4-S05 Accumulate 2 ${timestamp}` },
        { Project: PROJECT_KEY, 'Issue Type': 'InvalidType', Summary: `E4-S05 Accumulate 3 ${timestamp}` },
      ];

      // Initial: 1 succeeds, 2 fail
      const result1 = await jml.issues.create(payload) as BulkResult;
      expect(result1.manifest.succeeded).toEqual([0]);
      createdIssues.push(result1.manifest.created['0']);

      // Retry 1: Fix row 1
      payload[1]['Issue Type'] = 'Task';
      const result2 = await jml.issues.create(payload, { retry: result1.manifest.id }) as BulkResult;
      
      expect(result2.manifest.succeeded).toContain(0); // Original success
      expect(result2.manifest.succeeded).toContain(1); // New success
      expect(result2.manifest.succeeded).toHaveLength(2);
      createdIssues.push(result2.manifest.created['1']);

      // Retry 2: Fix row 2
      payload[2]['Issue Type'] = 'Task';
      const result3 = await jml.issues.create(payload, { retry: result2.manifest.id }) as BulkResult;
      
      expect(result3.manifest.succeeded).toContain(0); // Original success
      expect(result3.manifest.succeeded).toContain(1); // First retry success
      expect(result3.manifest.succeeded).toContain(2); // Second retry success
      expect(result3.manifest.succeeded).toHaveLength(3);
      createdIssues.push(result3.manifest.created['2']);

      console.log('   ✓ Successes accumulated correctly across retries');
    }, 90000);
  });

  // AC7: Error handling
  describe('AC7.3: Error Handling', () => {
    it('should throw error if manifest not found', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Testing manifest not found error...');

      const payload = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: 'Test' }
      ];

      await expect(
        jml.issues.create(payload, { retry: 'nonexistent-manifest-id' })
      ).rejects.toThrow(/not found or expired/i);

      console.log('   ✓ Correctly throws error for missing manifest');
    }, 30000);

    it('should throw error if manifest expired', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Testing expired manifest handling...');

      // Create a manifest
      const timestamp = new Date().toISOString();
      const payload = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `E4-S05 Expire Test ${timestamp}` }
      ];

      const result = await jml.issues.create(payload) as BulkResult;
      createdIssues.push(result.manifest.created['0']);

      const manifestId = result.manifest.id;

      // Delete manifest from Redis to simulate expiration
      const cache = (jml.issues as any).cache;
      await cache.del(`bulk:manifest:${manifestId}`);

      // Try to retry with expired manifest
      await expect(
        jml.issues.create(payload, { retry: manifestId })
      ).rejects.toThrow(/not found or expired/i);

      console.log('   ✓ Correctly handles expired manifests');
    }, 30000);
  });
});

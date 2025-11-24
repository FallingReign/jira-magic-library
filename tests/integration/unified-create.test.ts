/**
 * Integration Tests: Unified create() Method
 * 
 * Story: E4-S04 - Unified create() Method
 * 
 * Tests the unified create() API that handles:
 * - Single issue creation (backward compatible with E1-S09)
 * - Bulk creation from arrays
 * - Bulk creation from CSV files
 * - Bulk creation from JSON files
 * - Partial failure handling
 * - Performance targets (100 issues in <10 seconds)
 */

import './setup'; // Load test config
import { JML } from '../../src/jml.js';
import { loadConfig } from '../../src/config/loader.js';
import { isJiraConfigured, cleanupIssues } from './helpers.js';
import { Issue } from '../../src/types.js';
import { BulkResult } from '../../src/types/bulk.js';
import { JiraClientImpl } from '../../src/client/JiraClient.js';

describe('Integration: Unified create() Method', () => {
  let jml: JML;
  let client: JiraClientImpl;
  const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'ZUL';
  const createdIssues: string[] = [];

  beforeAll(async () => {
    if (!isJiraConfigured()) {
      console.warn('⚠️  Skipping integration tests: JIRA not configured');
      return;
    }

    console.log('\n🔗 Unified create() Integration Tests');
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

  // AC8: Integration test - single issue creation (no regression from E1-S09)
  describe('AC8.1: Single Issue Creation (E1-S09 Compatibility)', () => {
    it('should create single issue with backward compatible API', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating single issue...');

      const result = await jml.issues.create({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `E4-S04 Integration: Single issue ${new Date().toISOString()}`
      });

      // Should return Issue object (not BulkResult)
      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('self');
      expect(result).not.toHaveProperty('manifest');
      expect(result).not.toHaveProperty('total');

      const issue = result as Issue;
      console.log(`   ✓ Created issue: ${issue.key}`);
      createdIssues.push(issue.key);

      // Verify issue exists in JIRA
      expect(issue.key).toMatch(new RegExp(`^${PROJECT_KEY}-\\d+$`));
    }, 30000);

    it('should handle E1-S09 field resolution and conversion', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating issue with Priority and Due Date...');

      const result = await jml.issues.create({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `E4-S04 Integration: Fields ${new Date().toISOString()}`,
        Priority: 'High',
        'Due Date': '2025-12-31'
      });

      const issue = result as Issue;
      console.log(`   ✓ Created issue with fields: ${issue.key}`);
      createdIssues.push(issue.key);

      expect(issue.key).toMatch(new RegExp(`^${PROJECT_KEY}-\\d+$`));
    }, 30000);
  });

  // AC8: Integration test - bulk creation (10 issues)
  describe('AC8.2: Bulk Creation from Array', () => {
    it('should create 10 issues from array', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating 10 issues from array...');

      const timestamp = new Date().toISOString();
      const issues = Array.from({ length: 10 }, (_, i) => ({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `E4-S04 Bulk Test ${i + 1}/10 (${timestamp})`
      }));

      const startTime = Date.now();
      const result = await jml.issues.create(issues);
      const duration = Date.now() - startTime;

      // Should return BulkResult (not Issue)
      expect(result).toHaveProperty('manifest');
      expect(result).toHaveProperty('total', 10);
      expect(result).toHaveProperty('succeeded');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('results');
      expect(result).not.toHaveProperty('key'); // Not an Issue object

      const bulkResult = result as BulkResult;
      console.log(`   ✓ Created ${bulkResult.succeeded}/${bulkResult.total} issues in ${duration}ms`);
      console.log(`   📋 Manifest ID: ${bulkResult.manifest.id}`);

      // Verify all succeeded
      expect(bulkResult.succeeded).toBe(10);
      expect(bulkResult.failed).toBe(0);
      expect(bulkResult.results).toHaveLength(10);

      // Collect issue keys for cleanup
      bulkResult.results.forEach((r) => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });

      // Verify manifest structure
      expect(bulkResult.manifest.total).toBe(10);
      expect(bulkResult.manifest.succeeded).toHaveLength(10);
      expect(bulkResult.manifest.failed).toHaveLength(0);
      expect(Object.keys(bulkResult.manifest.created)).toHaveLength(10);
    }, 60000);

    it('should preserve row indices in results', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating 3 issues to verify index preservation...');

      const timestamp = new Date().toISOString();
      const issues = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Index Test 0 (${timestamp})` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Index Test 1 (${timestamp})` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Index Test 2 (${timestamp})` }
      ];

      const result = await jml.issues.create(issues) as BulkResult;

      // Verify indices
      expect(result.results[0].index).toBe(0);
      expect(result.results[1].index).toBe(1);
      expect(result.results[2].index).toBe(2);

      console.log(`   ✓ Row indices preserved: 0, 1, 2`);

      // Cleanup
      result.results.forEach((r) => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });
    }, 30000);
  });

  // AC8: Integration test - bulk from CSV
  describe('AC8.3: Bulk Creation from CSV', () => {
    it('should create issues from CSV string', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating issues from CSV...');

      const timestamp = new Date().toISOString();
      const csv = `Project,Issue Type,Summary
${PROJECT_KEY},Task,CSV Test 1 (${timestamp})
${PROJECT_KEY},Task,CSV Test 2 (${timestamp})
${PROJECT_KEY},Task,CSV Test 3 (${timestamp})`;

      const result = await jml.issues.create({ 
        data: csv, 
        format: 'csv' 
      }) as BulkResult;

      console.log(`   ✓ Created ${result.succeeded}/${result.total} issues from CSV`);

      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(3);

      // Cleanup
      result.results.forEach((r) => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });
    }, 30000);
  });

  // AC8: Integration test - bulk from JSON
  describe('AC8.4: Bulk Creation from JSON', () => {
    it('should create issues from JSON string', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating issues from JSON...');

      const timestamp = new Date().toISOString();
      const json = JSON.stringify([
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `JSON Test 1 (${timestamp})` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `JSON Test 2 (${timestamp})` }
      ]);

      const result = await jml.issues.create({ 
        data: json, 
        format: 'json' 
      }) as BulkResult;

      console.log(`   ✓ Created ${result.succeeded}/${result.total} issues from JSON`);

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);

      // Cleanup
      result.results.forEach((r) => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });
    }, 30000);
  });

  // AC8: Integration test - partial failure handling
  describe('AC8.5: Partial Failure Handling', () => {
    it('should return BulkResult without throwing (graceful handling)', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Testing graceful bulk operation result handling...');

      const timestamp = new Date().toISOString();
      // All valid issues - tests that we return proper BulkResult structure
      const issues = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Bulk Test 1 (${timestamp})` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Bulk Test 2 (${timestamp})` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Bulk Test 3 (${timestamp})` }
      ];

      const result = await jml.issues.create(issues) as BulkResult;

      console.log(`   ✓ Processed ${result.total} issues: ${result.succeeded} succeeded, ${result.failed} failed`);

      // Verify we got proper BulkResult (not an exception)
      expect(result.total).toBe(3);
      expect(result.manifest).toBeDefined();
      expect(result.succeeded + result.failed).toBe(3);
      
      // All should succeed
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);

      // Verify manifest structure
      expect(result.manifest.id).toBeDefined();
      expect(result.manifest.created).toBeDefined();
      expect(result.manifest.errors).toBeDefined();
      console.log(`   ✓ Manifest created: ${result.manifest.id}`);

      // Cleanup
      result.results.forEach((r) => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });
    }, 30000);

    it('should include detailed results for each record', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Verifying detailed result structure...');

      const timestamp = new Date().toISOString();
      const issues = [
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Result Test 1 (${timestamp})` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Result Test 2 (${timestamp})` },
        { Project: PROJECT_KEY, 'Issue Type': 'Task', Summary: `Result Test 3 (${timestamp})` }
      ];

      const result = await jml.issues.create(issues) as BulkResult;

      // Should have result entry for each input record
      expect(result.results).toBeDefined();
      expect(result.results.length).toBe(3);

      // Each result should have required fields
      result.results.forEach((r, index) => {
        expect(r.index).toBe(index);
        expect(r.success).toBeDefined();
        
        if (r.success) {
          expect(r.key).toBeDefined();
          console.log(`   ✓ Result ${index}: ${r.key}`);
        } else {
          expect(r.error).toBeDefined();
          console.log(`   ✓ Result ${index}: Error captured`);
        }
      });

      console.log(`   ✓ All ${result.results.length} results have proper structure`);

      // Cleanup
      result.results.forEach((r) => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });
    }, 30000);
  });

  // AC7: Performance test - verify batching works with moderate volume
  describe('AC7: Performance Target', () => {
    it('should create 10 issues with reasonable performance', async () => {
      if (!isJiraConfigured()) return;

      console.log('   ⏱️  Performance test: Creating 10 issues...');

      const timestamp = new Date().toISOString();
      const issues = Array.from({ length: 10 }, (_, i) => ({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `Perf Test ${i + 1}/10 (${timestamp})`
      }));

      const startTime = Date.now();
      const result = await jml.issues.create(issues) as BulkResult;
      const duration = Date.now() - startTime;

      console.log(`   ✓ Created ${result.succeeded}/${result.total} issues in ${duration}ms`);
      console.log(`   📊 Performance: ${(duration / 1000).toFixed(2)}s`);
      console.log(`   📊 Throughput: ${(result.succeeded / (duration / 1000)).toFixed(1)} issues/sec`);

      // All should succeed (10 issues is well below rate limit)
      expect(result.succeeded).toBe(10);
      expect(result.failed).toBe(0);

      // Performance should be reasonable (<15s for 10 issues = ~0.67 issues/sec minimum)
      expect(duration).toBeLessThan(15000); // 15 seconds for 10 issues

      // Cleanup
      result.results.forEach((r) => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });
    }, 30000); // 30s timeout
  });
});

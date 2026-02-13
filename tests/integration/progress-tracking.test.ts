/**
 * Integration Tests: Progress Tracking & Search API
 *
 * Tests the progress tracking features and search API against real JIRA:
 * - Raw JQL search API
 * - Progress tracking during bulk operations
 * - Marker injection and cleanup
 * - Progress callbacks with accurate counts
 * - Timeout detection via progress tracking
 */

import './setup'; // Load test config
import { JML } from '../../src/jml.js';
import { loadConfig } from '../../src/config/loader.js';
import { isJiraConfigured, cleanupIssues } from './helpers.js';
import { BulkResult } from '../../src/types/bulk.js';
import { JiraClientImpl } from '../../src/client/JiraClient.js';
import { Issue } from '../../src/types/index.js';

describe('Integration: Progress Tracking & Search API', () => {
  let jml: JML;
  let client: JiraClientImpl;
  const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'PROJ';
  const createdIssues: string[] = [];

  beforeAll(async () => {
    if (!isJiraConfigured()) {
      console.warn('⚠️  Skipping integration tests: JIRA not configured');
      return;
    }

    console.log('\n🔗 Progress Tracking & Search API Integration Tests');
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

  describe('Search API: Raw JQL Mode', () => {
    it('should search issues using raw JQL query', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating test issue for search...');

      // Create a test issue first
      const timestamp = new Date().toISOString();
      const summary = `Search Test ${timestamp}`;
      const createdIssue = await jml.issues.create({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: summary,
        labels: ['integration-test-search']
      }) as Issue;

      console.log(`   ✓ Created test issue: ${createdIssue.key}`);
      createdIssues.push(createdIssue.key);

      // Wait a moment for JIRA to index the issue
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('   🔍 Searching with raw JQL...');

      // Search using raw JQL
      const results = await jml.issues.search({
        jql: `project = ${PROJECT_KEY} AND key = ${createdIssue.key}`
      });

      console.log(`   ✓ Found ${results.length} issue(s)`);

      // Verify results
      expect(results).toHaveLength(1);
      expect(results[0]?.key).toBe(createdIssue.key);
      expect(results[0]?.fields?.summary).toBe(summary);
    }, 60000);

    it('should support complex JQL with custom fields and operators', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating test issues with labels...');

      // Create multiple test issues
      const timestamp = new Date().toISOString();
      const testLabel = `test-${Date.now()}`;

      const issues = await jml.issues.create([
        {
          Project: PROJECT_KEY,
          'Issue Type': 'Task',
          Summary: `Complex JQL Test 1 ${timestamp}`,
          labels: [testLabel, 'priority-high']
        },
        {
          Project: PROJECT_KEY,
          'Issue Type': 'Task',
          Summary: `Complex JQL Test 2 ${timestamp}`,
          labels: [testLabel, 'priority-low']
        }
      ]) as BulkResult;

      console.log(`   ✓ Created ${issues.succeeded} test issues`);

      // Collect keys for cleanup
      issues.results.forEach(r => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('   🔍 Searching with complex JQL...');

      // Search with complex JQL (operators, AND/OR)
      const results = await jml.issues.search({
        jql: `project = ${PROJECT_KEY} AND labels = ${testLabel} AND (labels = priority-high OR labels = priority-low) ORDER BY created DESC`
      });

      console.log(`   ✓ Found ${results.length} issue(s) with complex query`);

      // Verify results
      expect(results.length).toBeGreaterThanOrEqual(2);
      const keys = results.map(r => r.key);
      issues.results.forEach(r => {
        if (r.success && r.key) {
          expect(keys).toContain(r.key);
        }
      });
    }, 60000);

    it('should apply createdSince filter to raw JQL', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating test issue...');

      const createdIssue = await jml.issues.create({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `Date Filter Test ${new Date().toISOString()}`
      }) as Issue;

      console.log(`   ✓ Created test issue: ${createdIssue.key}`);
      createdIssues.push(createdIssue.key);

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('   🔍 Searching with date filter...');

      // Search with createdSince (should append to raw JQL)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const results = await jml.issues.search({
        jql: `project = ${PROJECT_KEY} AND key = ${createdIssue.key}`,
        createdSince: fiveMinutesAgo
      });

      console.log(`   ✓ Found ${results.length} issue(s) with date filter`);

      // Should find the recently created issue
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.key === createdIssue.key)).toBe(true);
    }, 60000);

    it('should respect maxResults with raw JQL', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating 5 test issues...');

      const timestamp = new Date().toISOString();
      const testLabel = `limit-test-${Date.now()}`;

      const issues = await jml.issues.create(
        Array.from({ length: 5 }, (_, i) => ({
          Project: PROJECT_KEY,
          'Issue Type': 'Task',
          Summary: `Limit Test ${i + 1} ${timestamp}`,
          labels: [testLabel]
        }))
      ) as BulkResult;

      console.log(`   ✓ Created ${issues.succeeded} test issues`);

      // Collect keys
      issues.results.forEach(r => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('   🔍 Searching with maxResults=2...');

      // Search with limit
      const results = await jml.issues.search({
        jql: `project = ${PROJECT_KEY} AND labels = ${testLabel}`,
        maxResults: 2
      });

      console.log(`   ✓ Returned ${results.length} issue(s) (limited to 2)`);

      // Should respect maxResults
      expect(results.length).toBeLessThanOrEqual(2);
    }, 60000);
  });

  describe('Progress Tracking: Bulk Operations', () => {
    it('should track progress during bulk creation with onProgress callback', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating 10 issues with progress tracking...');

      const progressUpdates: Array<{
        completed: number;
        total: number;
        inProgress: number;
      }> = [];

      const timestamp = new Date().toISOString();
      const issues = Array.from({ length: 10 }, (_, i) => ({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `Progress Test ${i + 1}/10 ${timestamp}`
      }));

      const result = await jml.issues.create(issues, {
        onProgress: (status) => {
          console.log(`   📊 Progress: ${status.completed}/${status.total} completed`);
          progressUpdates.push({
            completed: status.completed,
            total: status.total,
            inProgress: status.inProgress
          });
        }
      }) as BulkResult;

      console.log(`   ✓ Created ${result.succeeded}/${result.total} issues`);
      console.log(`   ✓ Received ${progressUpdates.length} progress updates`);

      // Collect keys
      result.results.forEach(r => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });

      // Verify progress updates were received
      expect(progressUpdates.length).toBeGreaterThan(0);

      // All updates should have correct total
      progressUpdates.forEach(update => {
        expect(update.total).toBe(10);
        expect(update.completed).toBeGreaterThanOrEqual(0);
        expect(update.completed).toBeLessThanOrEqual(10);
      });

      // Final update should show progress was made
      // Note: May not be 10/10 if JIRA indexing is still in progress
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      if (lastUpdate) {
        expect(lastUpdate.completed).toBeGreaterThan(0);
        expect(lastUpdate.completed).toBeLessThanOrEqual(10);
        console.log(`   ✓ Final progress: ${lastUpdate.completed}/${lastUpdate.total} (JIRA indexing may still be in progress)`);
      }

      // All issues were actually created successfully
      expect(result.succeeded).toBe(10);
      expect(result.failed).toBe(0);
    }, 90000);

    it('should inject and cleanup marker labels', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating issues to verify marker cleanup...');

      const timestamp = new Date().toISOString();
      const issues = Array.from({ length: 3 }, (_, i) => ({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `Marker Test ${i + 1}/3 ${timestamp}`
      }));

      const result = await jml.issues.create(issues, {
        onProgress: (status) => {
          console.log(`   📊 Progress: ${status.completed}/${status.total}`);
        }
      }) as BulkResult;

      console.log(`   ✓ Created ${result.succeeded} issues`);

      // Collect keys
      result.results.forEach(r => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('   🔍 Verifying markers were cleaned up...');

      // Fetch one of the created issues directly
      if (createdIssues.length > 0) {
        const issueKey = createdIssues[0];
        const issue = await client.get<Issue>(`/rest/api/2/issue/${issueKey}`);

        // Verify no jml-job-* labels remain
        const labels = issue.fields?.labels || [];
        const hasMarkers = labels.some((label: string) => label.startsWith('jml-job-'));

        console.log(`   ✓ Issue ${issueKey} labels: ${labels.join(', ')}`);
        expect(hasMarkers).toBe(false);
      }
    }, 90000);

    it('should track accurate progress counts during hierarchical bulk', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating hierarchy with progress tracking...');

      const progressUpdates: Array<{
        completed: number;
        total: number;
      }> = [];

      const timestamp = new Date().toISOString();
      const issues = [
        {
          uid: 'epic-1',
          Project: PROJECT_KEY,
          'Issue Type': 'Epic',
          Summary: `Hierarchy Progress Epic ${timestamp}`
        },
        {
          uid: 'task-1',
          Project: PROJECT_KEY,
          'Issue Type': 'Task',
          Summary: `Hierarchy Progress Task 1 ${timestamp}`,
          Parent: 'epic-1'
        },
        {
          uid: 'task-2',
          Project: PROJECT_KEY,
          'Issue Type': 'Task',
          Summary: `Hierarchy Progress Task 2 ${timestamp}`,
          Parent: 'epic-1'
        }
      ];

      const result = await jml.issues.create(issues, {
        onProgress: (status) => {
          console.log(`   📊 Progress: ${status.completed}/${status.total} completed`);
          progressUpdates.push({
            completed: status.completed,
            total: status.total
          });
        }
      }) as BulkResult;

      console.log(`   ✓ Created ${result.succeeded}/${result.total} issues in hierarchy`);
      console.log(`   ✓ Received ${progressUpdates.length} progress updates`);

      // Collect keys
      result.results.forEach(r => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });

      // Verify progress tracking worked
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Final progress should match total
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      if (lastUpdate) {
        expect(lastUpdate.completed).toBe(3);
        expect(lastUpdate.total).toBe(3);
      }
    }, 90000);
  });

  describe('Progress Tracking: Time-Based Monitoring', () => {
    it('should report time since last progress', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating issues and monitoring time metrics...');

      let maxTimeSinceProgress = 0;

      const timestamp = new Date().toISOString();
      const issues = Array.from({ length: 5 }, (_, i) => ({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `Time Tracking Test ${i + 1}/5 ${timestamp}`
      }));

      const result = await jml.issues.create(issues, {
        onProgress: (status) => {
          console.log(`   📊 Progress: ${status.completed}/${status.total}, time since progress: ${status.timeSinceProgress}ms`);
          if (status.timeSinceProgress > maxTimeSinceProgress) {
            maxTimeSinceProgress = status.timeSinceProgress;
          }
        }
      }) as BulkResult;

      console.log(`   ✓ Created ${result.succeeded} issues`);
      console.log(`   ✓ Max time between progress: ${maxTimeSinceProgress}ms`);

      // Collect keys
      result.results.forEach(r => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });

      // Verify time metrics are reasonable (not negative, not absurdly large)
      expect(maxTimeSinceProgress).toBeGreaterThanOrEqual(0);
      expect(maxTimeSinceProgress).toBeLessThan(120000); // Less than 2 minutes between updates
    }, 90000);
  });

  describe('Search API: Integration with Progress Tracking', () => {
    it('should find issues created during bulk operation using search', async () => {
      if (!isJiraConfigured()) return;

      console.log('   📝 Creating bulk issues and searching for them...');

      const timestamp = Date.now();
      const testLabel = `bulk-search-${timestamp}`;

      const issues = Array.from({ length: 3 }, (_, i) => ({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: `Bulk Search Test ${i + 1} ${new Date().toISOString()}`,
        labels: [testLabel]
      }));

      const createStartTime = new Date();

      const result = await jml.issues.create(issues, {
        onProgress: (status) => {
          console.log(`   📊 Created: ${status.completed}/${status.total}`);
        }
      }) as BulkResult;

      console.log(`   ✓ Created ${result.succeeded} issues`);

      // Collect keys
      const createdKeys: string[] = [];
      result.results.forEach(r => {
        if (r.success && r.key) {
          createdKeys.push(r.key);
          createdIssues.push(r.key);
        }
      });

      // Wait for JIRA indexing
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('   🔍 Searching for created issues...');

      // Search for the issues we just created
      const searchResults = await jml.issues.search({
        jql: `project = ${PROJECT_KEY} AND labels = ${testLabel}`,
        createdSince: createStartTime
      });

      console.log(`   ✓ Found ${searchResults.length} issue(s) via search`);

      // Should find all created issues
      expect(searchResults.length).toBe(createdKeys.length);

      // Verify all created keys are in search results
      const foundKeys = searchResults.map(r => r.key);
      createdKeys.forEach(key => {
        expect(foundKeys).toContain(key);
      });
    }, 90000);
  });
});

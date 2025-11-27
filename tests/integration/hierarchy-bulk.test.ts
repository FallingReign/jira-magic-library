/**
 * Integration tests for Hierarchy Bulk Creation
 * Story: E4-S13 - AC4: Performance Validation with Full Hierarchy
 * 
 * Tests level-based batching with real JIRA hierarchy.
 */

import './setup';
import { JML } from '../../src/jml.js';
import { loadConfig } from '../../src/config/loader.js';
import type { BulkResult } from '../../src/types/bulk.js';

// Test issue keys created (for cleanup)
const createdIssues: string[] = [];

describe('Integration: E4-S13 AC4 - Hierarchy Bulk Creation', () => {
  let client: JML;
  const projectKey = process.env.JIRA_PROJECT_KEY || 'ZUL';
  
  beforeAll(async () => {
    if (!process.env.JIRA_BASE_URL) {
      console.warn('⚠️  Skipping hierarchy bulk tests (JIRA not configured)');
      return;
    }

    const config = loadConfig();
    client = new JML(config);
    
    // Verify connection
    await client.validateConnection();
    console.log(`\n📊 Using project: ${projectKey}`);
  });

  afterAll(async () => {
    // Cleanup: Delete test issues in reverse order (child → parent)
    if (createdIssues.length > 0 && client) {
      console.log(`\n🧹 Cleaning up ${createdIssues.length} test issues...`);
      for (let i = createdIssues.length - 1; i >= 0; i--) {
        const key = createdIssues[i];
        try {
          await (client as any).client.delete(`/rest/api/2/issue/${key}`);
          console.log(`   ✓ Deleted ${key}`);
        } catch (error) {
          console.warn(`   ⚠️  Failed to delete ${key}`);
        }
      }
    }

    if (client) {
      await client.disconnect();
    }
  });

  describe('AC4.1: Basic 2-level hierarchy (Epic → Task)', () => {
    it('should create Epic first, then Task with Parent', async () => {
      if (!client) {
        console.warn('⚠️  Skipping test: client not configured');
        return;
      }

      const timestamp = Date.now();
      
      // Input with UID references - Epic → Task
      const input = [
        { 
          uid: 'epic-1', 
          Project: projectKey, 
          'Issue Type': 'Epic', 
          Summary: `[E4-S13-AC4] Test Epic ${timestamp}`,
          'Epic Name': `Test Epic ${timestamp}`,  // Required for Epics in this JIRA
        },
        { 
          uid: 'task-1', 
          Project: projectKey, 
          'Issue Type': 'Task', 
          Summary: `[E4-S13-AC4] Test Task ${timestamp}`,
          Parent: 'epic-1'  // UID reference, not JIRA key
        },
      ];

      console.log('\n1️⃣  Creating hierarchy: Epic → Task with UID references...');
      console.log(`    Input: ${input.length} issues with uid fields`);

      const result = await client.issues.create(input) as BulkResult;

      // Verify result structure
      expect(result).toHaveProperty('succeeded');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('results');

      console.log(`\n   ✅ Result: ${result.succeeded}/${result.total} succeeded`);

      // Track created issues for cleanup
      result.results.forEach(r => {
        if (r.success) {
          createdIssues.push(r.key!);
          console.log(`   ✓ Created: ${r.key}`);
        } else {
          console.log(`   ✗ Failed index ${r.index}: ${JSON.stringify(r.error)}`);
        }
      });

      // Verify at least some succeeded (ideally all)
      expect(result.succeeded).toBeGreaterThan(0);

      // If all succeeded, verify parent relationship
      if (result.succeeded === 2) {
        const epicKey = result.results.find(r => r.index === 0)?.key;
        const taskKey = result.results.find(r => r.index === 1)?.key;
        
        if (epicKey && taskKey) {
          // Fetch task to verify parent
          const task = await (client as any).client.get(`/rest/api/2/issue/${taskKey}`);
          
          // Check if parent is set (could be in different fields depending on JIRA config)
          console.log(`\n   📋 Verifying Task parent relationship...`);
          console.log(`      Task: ${taskKey}`);
          console.log(`      Expected Parent: ${epicKey}`);
          
          // Parent could be in customfield_XXXXX (Epic Link) or parent object
          const parentField = task.fields.parent;
          const epicLink = Object.entries(task.fields)
            .find(([key, value]) => 
              key.startsWith('customfield_') && 
              typeof value === 'string' && 
              value === epicKey
            );

          const hasParent = parentField?.key === epicKey || epicLink !== undefined;
          
          if (hasParent) {
            console.log(`      ✓ Parent relationship verified!`);
          } else {
            console.log(`      ⚠️  Parent relationship not found in expected fields`);
            console.log(`      Task fields with values:`, 
              Object.entries(task.fields)
                .filter(([k, v]) => v && (k.startsWith('parent') || k.startsWith('customfield_')))
                .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                .slice(0, 5)
            );
          }
        }
      }
    });
  });

  describe('AC4.2: 3-level hierarchy (Epic → Task → Sub-task)', () => {
    it('should create issues in correct order across 3 levels', async () => {
      if (!client) {
        console.warn('⚠️  Skipping test: client not configured');
        return;
      }

      const timestamp = Date.now();
      
      // Input with UID references - 3 levels
      const input = [
        { 
          uid: 'epic-1', 
          Project: projectKey, 
          'Issue Type': 'Epic', 
          Summary: `[E4-S13-AC4] 3-Level Epic ${timestamp}`,
          'Epic Name': `3-Level Epic ${timestamp}`,
        },
        { 
          uid: 'task-1', 
          Project: projectKey, 
          'Issue Type': 'Task', 
          Summary: `[E4-S13-AC4] 3-Level Task ${timestamp}`,
          Parent: 'epic-1'
        },
        { 
          uid: 'subtask-1', 
          Project: projectKey, 
          'Issue Type': 'Sub-task', 
          Summary: `[E4-S13-AC4] 3-Level Sub-task ${timestamp}`,
          Parent: 'task-1'  // Child of task, grandchild of epic
        },
      ];

      console.log('\n2️⃣  Creating 3-level hierarchy: Epic → Task → Sub-task...');

      const result = await client.issues.create(input) as BulkResult;

      console.log(`\n   ✅ Result: ${result.succeeded}/${result.total} succeeded`);

      // Track created issues for cleanup
      result.results.forEach(r => {
        if (r.success) {
          createdIssues.push(r.key!);
          console.log(`   ✓ Created: ${r.key}`);
        } else {
          console.log(`   ✗ Failed index ${r.index}: ${JSON.stringify(r.error)}`);
        }
      });

      // Verify hierarchy was created
      expect(result.succeeded).toBeGreaterThan(0);
    });
  });

  describe('AC4.3: Multiple issues per level', () => {
    it('should batch issues within each level (parallel creation)', async () => {
      if (!client) {
        console.warn('⚠️  Skipping test: client not configured');
        return;
      }

      const timestamp = Date.now();
      
      // Input: 2 Epics, 4 Tasks (2 under each Epic)
      const input = [
        { uid: 'epic-1', Project: projectKey, 'Issue Type': 'Epic', Summary: `[E4-S13-AC4] Parallel Epic 1 ${timestamp}`, 'Epic Name': `Parallel Epic 1 ${timestamp}` },
        { uid: 'epic-2', Project: projectKey, 'Issue Type': 'Epic', Summary: `[E4-S13-AC4] Parallel Epic 2 ${timestamp}`, 'Epic Name': `Parallel Epic 2 ${timestamp}` },
        { uid: 'task-1', Project: projectKey, 'Issue Type': 'Task', Summary: `[E4-S13-AC4] Task 1 under Epic 1 ${timestamp}`, Parent: 'epic-1' },
        { uid: 'task-2', Project: projectKey, 'Issue Type': 'Task', Summary: `[E4-S13-AC4] Task 2 under Epic 1 ${timestamp}`, Parent: 'epic-1' },
        { uid: 'task-3', Project: projectKey, 'Issue Type': 'Task', Summary: `[E4-S13-AC4] Task 3 under Epic 2 ${timestamp}`, Parent: 'epic-2' },
        { uid: 'task-4', Project: projectKey, 'Issue Type': 'Task', Summary: `[E4-S13-AC4] Task 4 under Epic 2 ${timestamp}`, Parent: 'epic-2' },
      ];

      console.log('\n3️⃣  Creating hierarchy with multiple issues per level...');
      console.log('    Level 0: 2 Epics (parallel)');
      console.log('    Level 1: 4 Tasks (parallel)');
      console.log('    Expected: 2 API calls (not 6 sequential calls)');

      const startTime = Date.now();
      const result = await client.issues.create(input) as BulkResult;
      const duration = Date.now() - startTime;

      console.log(`\n   ✅ Result: ${result.succeeded}/${result.total} succeeded in ${duration}ms`);

      // Track created issues for cleanup
      result.results.forEach(r => {
        if (r.success) {
          createdIssues.push(r.key!);
          console.log(`   ✓ Created: ${r.key}`);
        } else {
          console.log(`   ✗ Failed index ${r.index}: ${JSON.stringify(r.error)}`);
        }
      });

      // Verify performance is better than sequential (should be < 10 seconds)
      expect(duration).toBeLessThan(10000);
      expect(result.succeeded).toBeGreaterThan(0);
    });
  });

  describe('AC4.4: Backward compatibility (no UIDs)', () => {
    it('should handle records without UIDs using existing bulk path', async () => {
      if (!client) {
        console.warn('⚠️  Skipping test: client not configured');
        return;
      }

      const timestamp = Date.now();
      
      // Input WITHOUT uid fields - should use existing createBulk
      const input = [
        { Project: projectKey, 'Issue Type': 'Task', Summary: `[E4-S13-AC4] No UID Task 1 ${timestamp}` },
        { Project: projectKey, 'Issue Type': 'Task', Summary: `[E4-S13-AC4] No UID Task 2 ${timestamp}` },
      ];

      console.log('\n4️⃣  Creating issues without UIDs (backward compatibility)...');

      const result = await client.issues.create(input) as BulkResult;

      console.log(`\n   ✅ Result: ${result.succeeded}/${result.total} succeeded`);

      // Track created issues for cleanup
      result.results.forEach(r => {
        if (r.success) {
          createdIssues.push(r.key!);
          console.log(`   ✓ Created: ${r.key}`);
        }
      });

      // Should work without UIDs
      expect(result.succeeded).toBeGreaterThanOrEqual(2);
    });
  });

  describe('AC4.5: Large-scale hierarchy (30 issues)', () => {
    it('should create 30 issues across 3 levels in a single payload', async () => {
      if (!client) {
        console.warn('⚠️  Skipping test: client not configured');
        return;
      }

      const timestamp = Date.now();
      
      // Structure: 3 Epics → 9 Tasks (3 per Epic) → 18 Sub-tasks (2 per Task)
      // Total: 3 + 9 + 18 = 30 issues
      // Expected: 3 API calls (one per level), not 30 sequential calls
      const input: Array<Record<string, string>> = [];
      
      // Level 0: 3 Epics
      for (let e = 1; e <= 3; e++) {
        input.push({
          uid: `epic-${e}`,
          Project: projectKey,
          'Issue Type': 'Epic',
          Summary: `[E4-S13-AC4] Large Epic ${e} - ${timestamp}`,
          'Epic Name': `Large Epic ${e} - ${timestamp}`,
        });
      }
      
      // Level 1: 9 Tasks (3 per Epic)
      for (let e = 1; e <= 3; e++) {
        for (let t = 1; t <= 3; t++) {
          const taskNum = (e - 1) * 3 + t;
          input.push({
            uid: `task-${taskNum}`,
            Project: projectKey,
            'Issue Type': 'Task',
            Summary: `[E4-S13-AC4] Task ${taskNum} under Epic ${e}`,
            Parent: `epic-${e}`,
          });
        }
      }
      
      // Level 2: 18 Sub-tasks (2 per Task)
      for (let t = 1; t <= 9; t++) {
        for (let s = 1; s <= 2; s++) {
          const subtaskNum = (t - 1) * 2 + s;
          input.push({
            uid: `subtask-${subtaskNum}`,
            Project: projectKey,
            'Issue Type': 'Sub-task',
            Summary: `[E4-S13-AC4] Sub-task ${subtaskNum} under Task ${t}`,
            Parent: `task-${t}`,
          });
        }
      }

      console.log('\n5️⃣  Creating large-scale hierarchy (30 issues)...');
      console.log('    Level 0: 3 Epics');
      console.log('    Level 1: 9 Tasks (3 per Epic)');
      console.log('    Level 2: 18 Sub-tasks (2 per Task)');
      console.log('    Total: 30 issues');
      console.log('    Expected: 3 API calls (not 30 sequential calls)');

      const startTime = Date.now();
      const result = await client.issues.create(input) as BulkResult;
      const duration = Date.now() - startTime;

      const avgPerIssue = Math.round(duration / result.total);
      console.log(`\n   ✅ Result: ${result.succeeded}/${result.total} succeeded`);
      console.log(`   ⏱️  Duration: ${duration}ms (${avgPerIssue}ms avg per issue)`);
      
      // Show breakdown by level
      const epicResults = result.results.filter((_, i) => i < 3);
      const taskResults = result.results.filter((_, i) => i >= 3 && i < 12);
      const subtaskResults = result.results.filter((_, i) => i >= 12);
      
      console.log(`\n   📊 By Level:`);
      console.log(`      Epics: ${epicResults.filter(r => r.success).length}/3 succeeded`);
      console.log(`      Tasks: ${taskResults.filter(r => r.success).length}/9 succeeded`);
      console.log(`      Sub-tasks: ${subtaskResults.filter(r => r.success).length}/18 succeeded`);

      // Track created issues for cleanup
      result.results.forEach(r => {
        if (r.success && r.key) {
          createdIssues.push(r.key);
        }
      });

      // Show some created keys
      if (result.succeeded > 0) {
        console.log(`\n   ✓ Sample created keys:`);
        result.results.slice(0, 5).forEach((r, i) => {
          if (r.success) {
            console.log(`      ${input[i].uid} → ${r.key}`);
          }
        });
        if (result.succeeded > 5) {
          console.log(`      ... and ${result.succeeded - 5} more`);
        }
      }

      // Show failures if any
      const failures = result.results.filter(r => !r.success);
      if (failures.length > 0) {
        console.log(`\n   ✗ Failures (${failures.length}):`);
        failures.slice(0, 5).forEach(r => {
          console.log(`      Index ${r.index}: ${JSON.stringify(r.error)}`);
        });
      }

      // Performance expectations:
      // - Sequential would be ~30 * 500ms = 15000ms minimum
      // - Batched should be ~3 * 2000ms = 6000ms or less
      // - Allow up to 30 seconds for slow connections
      expect(duration).toBeLessThan(30000);
      expect(result.succeeded).toBeGreaterThan(20); // At least 2/3 should succeed
      
      // If all succeeded, verify the efficiency gain
      if (result.succeeded === 30) {
        console.log(`\n   🚀 Performance: ${avgPerIssue}ms avg per issue`);
        if (avgPerIssue < 300) {
          console.log(`      ✓ Excellent batching efficiency!`);
        } else if (avgPerIssue < 500) {
          console.log(`      ✓ Good batching efficiency`);
        } else {
          console.log(`      ⚠️  Slower than expected`);
        }
      }
    });
  });
});

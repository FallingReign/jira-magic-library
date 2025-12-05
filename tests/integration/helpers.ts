/**
 * Integration Test Helpers
 * 
 * Utilities for skipping tests and cleaning up test data.
 */

import { JiraClientImpl } from '../../src/client/JiraClient.js';

/**
 * Checks if JIRA is configured for integration tests.
 * Returns true if JIRA_BASE_URL and JIRA_PAT are set.
 */
export function isJiraConfigured(): boolean {
  return !!(process.env.JIRA_BASE_URL && process.env.JIRA_PAT);
}

/**
 * Skips test suite if JIRA is not configured.
 * Call this in beforeAll() to gracefully skip integration tests.
 * 
 * @example
 * ```typescript
 * beforeAll(() => {
 *   if (!isJiraConfigured()) {
 *     console.warn('⚠️  Skipping integration tests: JIRA not configured');
 *     return;
 *   }
 *   // ... setup code
 * });
 * ```
 */
export function skipIfNoJira(): void {
  if (!isJiraConfigured()) {
    console.warn('⚠️  Skipping integration tests: JIRA not configured');
    console.warn('   Create .env.test with JIRA_BASE_URL and JIRA_PAT to enable');
  }
}

/**
 * Cleans up test issues by deleting them via JIRA API.
 * Logs warnings if deletion fails (e.g., issue already deleted, no permissions).
 * 
 * @param client - JIRA API client
 * @param issueKeys - Array of issue keys to delete (e.g., ['PROJ-123', 'PROJ-124'])
 * 
 * @example
 * ```typescript
 * afterEach(async () => {
 *   await cleanupIssues(client, createdIssues);
 *   createdIssues.length = 0;
 * });
 * ```
 */
export async function cleanupIssues(
  client: JiraClientImpl,
  issueKeys: string[]
): Promise<void> {
  if (issueKeys.length === 0) return;

  console.log(`\n🧹 Cleaning up ${issueKeys.length} test issue(s)...`);
  
  let deletedCount = 0;
  let failedCount = 0;
  
  for (const key of issueKeys) {
    try {
      await client.delete(`/rest/api/2/issue/${key}`);
      console.log(`   ✓ Deleted ${key}`);
      deletedCount++;
    } catch (err: any) {
      // Don't fail test if cleanup fails (issue might already be deleted or PAT lacks delete permissions)
      failedCount++;
      if (err.message?.includes('Forbidden') || err.message?.includes('permission')) {
        // Common case: PAT lacks delete permissions (tests still passed, just can't clean up)
        console.log(`   ℹ️  Skipped ${key} (no delete permission - manual cleanup needed)`);
      } else {
        console.warn(`   ⚠️  Failed to delete ${key}: ${err.message}`);
      }
    }
  }
  
  if (failedCount > 0) {
    console.log(`\n   📝 Cleanup summary: ${deletedCount} deleted, ${failedCount} skipped (permission denied)`);
    console.log(`   💡 Note: Test issues remain in JIRA. Ask admin to grant PAT delete permissions or clean up manually.\n`);
  }
}

/**
 * Creates a unique summary for test issues to avoid collisions.
 * Includes timestamp and optional test name.
 * 
 * @param testName - Optional test name to include in summary
 * @returns Summary string with timestamp
 * 
 * @example
 * ```typescript
 * const summary = createTestSummary('cache hit test');
 * // Returns: "Integration Test: cache hit test (2025-10-08T14:30:00.000Z)"
 * ```
 */
export function createTestSummary(testName?: string): string {
  const timestamp = new Date().toISOString();
  const name = testName ? `${testName} ` : '';
  return `Integration Test: ${name}(${timestamp})`;
}

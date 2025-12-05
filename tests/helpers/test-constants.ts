/**
 * Test Constants
 *
 * Centralized constants for test files to avoid hardcoding instance-specific values.
 * These should be used throughout unit and integration tests.
 */

/**
 * Default project key for tests.
 * - Integration tests: Uses JIRA_PROJECT_KEY env var if available
 * - Unit tests: Falls back to generic 'PROJ'
 */
export const TEST_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'PROJ';

/**
 * Alternative project key for tests that need multiple projects.
 */
export const TEST_PROJECT_KEY_ALT = process.env.JIRA_PROJECT_KEY_ALT || 'PROJ2';

/**
 * Generate a test issue key with the standard project prefix.
 * @param num - Issue number
 * @returns Issue key like 'PROJ-123'
 */
export function testIssueKey(num: number): string {
  return `${TEST_PROJECT_KEY}-${num}`;
}

/**
 * Generate a test issue key with alternative project prefix.
 * @param num - Issue number
 * @returns Issue key like 'PROJ2-123'
 */
export function testIssueKeyAlt(num: number): string {
  return `${TEST_PROJECT_KEY_ALT}-${num}`;
}

/**
 * Default fix version for tests.
 * For integration tests that need to resolve against real JIRA data,
 * use JIRA_FIX_VERSION env var.
 */
export const TEST_FIX_VERSION = process.env.JIRA_FIX_VERSION || 'PROJ_MS5_R1';

/**
 * Generate test fix version names for fuzzy matching tests.
 * @param suffix - Version suffix like 'MS1_2024'
 * @returns Version name like 'PROJ_MS1_2024'
 */
export function testFixVersion(suffix: string): string {
  return `PROJ_${suffix}`;
}

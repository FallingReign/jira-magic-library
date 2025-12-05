/**
 * Integration Test Fixtures
 * 
 * Test data for integration tests.
 * Uses environment variables to ensure tests work against any JIRA instance.
 */

import { createTestSummary } from './helpers.js';

/**
 * Valid issue data for basic creation test.
 * Uses project key from environment.
 */
export function createValidIssue(testName?: string): Record<string, string> {
  const issue: Record<string, string> = {
    Project: process.env.JIRA_PROJECT_KEY!,
    'Issue Type': 'Task',
    Summary: createTestSummary(testName),
    Description: 'Created by automated integration test',
  };

  // Add Reporter (required in project - use unique username from .env.test)
  const reporter = process.env.JIRA_REPORTER || process.env.JIRA_TEST_USER_NAME;
  if (reporter) {
    issue.Reporter = reporter;
  } else {
    console.warn('⚠️  Neither JIRA_REPORTER nor JIRA_TEST_USER_NAME is set!');
  }

  return issue;
}

/**
 * Issue data with invalid project key (should fail).
 */
export function createInvalidProjectIssue(): Record<string, string> {
  return {
    Project: 'NONEXISTENT',
    'Issue Type': 'Task',
    Summary: 'Should fail - invalid project',
    Description: 'This issue should not be created',
  };
}

/**
 * Issue data with invalid issue type (should fail).
 */
export function createInvalidIssueTypeIssue(): Record<string, string> {
  return {
    Project: process.env.JIRA_PROJECT_KEY!,
    'Issue Type': 'NonexistentType',
    Summary: 'Should fail - invalid issue type',
    Description: 'This issue should not be created',
  };
}

/**
 * Minimal issue data (only required fields).
 */
export function createMinimalIssue(): Record<string, string> {
  const issue: Record<string, string> = {
    Project: process.env.JIRA_PROJECT_KEY!,
    'Issue Type': 'Task',
    Summary: createTestSummary('minimal'),
  };

  // Add Reporter (required in project - use unique username from .env.test)
  const reporter = process.env.JIRA_REPORTER || process.env.JIRA_TEST_USER_NAME;
  if (reporter) {
    issue.Reporter = reporter;
  }

  return issue;
}

/**
 * Issue data with multiple text fields.
 */
export function createIssueWithMultipleFields(): Record<string, string> {
  const issue: Record<string, string> = {
    Project: process.env.JIRA_PROJECT_KEY!,
    'Issue Type': 'Task',
    Summary: createTestSummary('multiple fields'),
    Description: 'This issue has multiple fields for testing field resolution',
  };

  // Add Reporter (required in project - use unique username from .env.test)
  const reporter = process.env.JIRA_REPORTER || process.env.JIRA_TEST_USER_NAME;
  if (reporter) {
    issue.Reporter = reporter;
  }

  return issue;
}

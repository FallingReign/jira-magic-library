/**
 * Centralized test user values pulled from environment with safe fallbacks.
 * Keep all user/email/reporter references here to avoid hard-coded PII.
 */

const PRIMARY_EMAIL = process.env.JIRA_TEST_USER_EMAIL || 'user@example.com';
const PRIMARY_NAME = process.env.JIRA_TEST_USER_NAME || 'John Doe';
const PRIMARY_REPORTER = process.env.JIRA_REPORTER || PRIMARY_EMAIL;

// Secondary/fake users for test coverage (hardcoded to avoid pulling more env)
const SECONDARY_EMAIL = 'jane@example.com';
const SECONDARY_NAME = 'Jane Doe';
const NON_EXISTENT_EMAIL = 'nonexistent.user@example.com';

export const TEST_USER_EMAIL = PRIMARY_EMAIL;
export const TEST_USER_EMAIL_ALT = SECONDARY_EMAIL;
export const TEST_USER_NAME = PRIMARY_NAME;
export const TEST_USER_NAME_ALT = SECONDARY_NAME;
export const TEST_REPORTER = PRIMARY_REPORTER;
export const NONEXISTENT_USER = NON_EXISTENT_EMAIL;

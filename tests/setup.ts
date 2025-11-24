/**
 * Jest Test Setup
 *
 * Global configuration and setup for all test suites.
 * Runs before each test file.
 */

// Load .env.test for integration tests (must be BEFORE any imports that use config)
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test with override=true to replace any existing values
const envPath = path.join(__dirname, '..', '.env.test');
const result = dotenv.config({ path: envPath, override: true });

// Debug: Log if env file was loaded successfully
if (result.error) {
  console.error('❌ Failed to load .env.test:', result.error);
} else {
  console.log('📁 Loading test config from .env.test');
  console.log('   JIRA_TEST_USER_EMAIL:', process.env.JIRA_TEST_USER_EMAIL ? '✓ set' : '✗ missing');
}

// Set test environment variables
process.env.NODE_ENV = 'test';

// Extend Jest timeout for integration tests if needed
// jest.setTimeout(30000);

// Add custom matchers or global test utilities here
// Example: expect.extend({ ... });

// Global afterAll hook to ensure clean exit
afterAll(async () => {
  // Give ioredis-mock timers time to clear
  await new Promise((resolve) => setTimeout(resolve, 100));
});

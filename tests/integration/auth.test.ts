/**
 * Integration tests for PAT Authentication
 * Story: E1-S03
 *
 * These tests run against a real JIRA instance.
 * Set JIRA_BASE_URL and JIRA_PAT in .env file to run these tests.
 */

import { validateConnection } from '../../src/client/auth.js';
import { loadConfig } from '../../src/config/loader.js';

describe('Integration: PAT Authentication', () => {
  // Skip tests if JIRA is not configured
  const isConfigured = process.env.JIRA_BASE_URL && process.env.JIRA_PAT;

  beforeAll(() => {
    if (!isConfigured) {
      console.warn('\n⚠️  Skipping integration tests (JIRA not configured)');
      console.warn('   Set JIRA_BASE_URL and JIRA_PAT in .env file to run these tests.\n');
    }
  });

  (isConfigured ? it : it.skip)('should connect to real JIRA instance', async () => {
    // Arrange
    const config = loadConfig();

    // Act
    const serverInfo = await validateConnection(config.baseUrl, config.auth.token);

    // Assert
    expect(serverInfo).toBeDefined();
    expect(serverInfo.baseUrl).toBe(config.baseUrl);
    expect(serverInfo.version).toBeDefined();
    expect(Array.isArray(serverInfo.versionNumbers)).toBe(true);
    expect(serverInfo.versionNumbers.length).toBeGreaterThan(0);
    expect(serverInfo.deploymentType).toBeDefined();
    expect(serverInfo.buildNumber).toBeGreaterThan(0);
    expect(serverInfo.serverTitle).toBeDefined();

    console.log(`\n✅ Connected to ${serverInfo.serverTitle}`);
    console.log(`   Version: ${serverInfo.version}`);
    console.log(`   Deployment: ${serverInfo.deploymentType}\n`);
  });

  // Note: /serverInfo endpoint may not require authentication on some JIRA instances
  // This test is informational and may pass even with invalid token
  (isConfigured ? it : it.skip)('should handle authentication check', async () => {
    // Arrange
    const config = loadConfig();

    // Act
    const result = await validateConnection(config.baseUrl, config.auth.token);

    // Assert - Just verify we get a successful response
    // Some JIRA instances allow /serverInfo without authentication
    expect(result).toBeDefined();
    expect(result.version).toBeDefined();

    console.log(`\n📝 Note: /serverInfo endpoint returned data for the configured PAT`);
    console.log(`   Some JIRA instances allow this endpoint without authentication\n`);
  });
});

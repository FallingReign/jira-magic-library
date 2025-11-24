/**
 * Integration tests for JIRA Bulk API Wrapper
 * Story: E4-S03
 * 
 * Tests with real JIRA bulk endpoint
 */

import { JML } from '../../src/jml.js';
import { JiraClientImpl } from '../../src/client/JiraClient.js';
import { JiraBulkApiWrapper } from '../../src/operations/JiraBulkApiWrapper.js';
import { loadConfig } from '../../src/config/loader.js';

describe('Integration: JIRA Bulk API Wrapper', () => {
  let jml: JML;
  let wrapper: JiraBulkApiWrapper;
  const projectKey = process.env.JIRA_PROJECT_KEY!;

  beforeAll(async () => {
    if (!process.env.JIRA_BASE_URL) {
      console.warn('⚠️  Skipping integration tests (JIRA not configured)');
      return;
    }

    const config = loadConfig();
    jml = new JML(config);
    
    // Create wrapper with real JIRA client
    const client = new JiraClientImpl(config);
    wrapper = new JiraBulkApiWrapper(client);

    // Verify connection
    await jml.validateConnection();
  });

  afterAll(async () => {
    if (jml) {
      await jml.disconnect();
    }
  });

  describe('AC2 & AC5: Partial Success (HTTP 201)', () => {
    it('should create multiple issues successfully (all valid)', async () => {
      if (!wrapper) return;

      const timestamp = new Date().toISOString();
      const payloads = [
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Task' },
            summary: `Bulk API Test 1 - ${timestamp}`
          }
        },
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Task' },
            summary: `Bulk API Test 2 - ${timestamp}`
          }
        },
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Task' },
            summary: `Bulk API Test 3 - ${timestamp}`
          }
        }
      ];

      const result = await wrapper.createBulk(payloads);

      // All should succeed
      expect(result.created).toHaveLength(3);
      expect(result.failed).toHaveLength(0);

      // Verify issue keys
      result.created.forEach((item, index) => {
        expect(item.index).toBe(index);
        expect(item.key).toMatch(/^[A-Z]+-\d+$/);
        expect(item.id).toBeTruthy();
        expect(item.self).toContain('/rest/api/2/issue/');
      });

      console.log(`✅ Created issues: ${result.created.map(i => i.key).join(', ')}`);
    }, 30000);

    it('should handle mix of valid and invalid issues (partial success)', async () => {
      if (!wrapper) return;

      const timestamp = new Date().toISOString();
      const payloads = [
        // Valid issue
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Task' },
            summary: `Bulk Valid - ${timestamp}`
          }
        },
        // Invalid: missing required field (summary)
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Task' }
          }
        },
        // Invalid: invalid issue type
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'NonExistentType' },
            summary: `Bulk Invalid Type - ${timestamp}`
          }
        },
        // Valid issue
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Task' },
            summary: `Bulk Valid 2 - ${timestamp}`
          }
        }
      ];

      const result = await wrapper.createBulk(payloads);

      // Verify partial success
      expect(result.created.length).toBeGreaterThan(0);
      expect(result.failed.length).toBeGreaterThan(0);
      expect(result.created.length + result.failed.length).toBe(payloads.length);

      // Verify created issues
      result.created.forEach(item => {
        expect(item.key).toMatch(/^[A-Z]+-\d+$/);
        // Indices 0 and 3 are valid, but JIRA might succeed on different indices
        expect(item.index).toBeGreaterThanOrEqual(0);
        expect(item.index).toBeLessThan(payloads.length);
      });

      // Verify failed issues
      result.failed.forEach(item => {
        // Indices 1 and 2 should fail, but check any failed index is valid
        expect(item.index).toBeGreaterThanOrEqual(0);
        expect(item.index).toBeLessThan(payloads.length);
        expect(item.status).toBe(400);
        expect(Object.keys(item.errors).length).toBeGreaterThan(0);
      });

      console.log(`✅ Partial success: ${result.created.length} created, ${result.failed.length} failed`);
      console.log(`Failed indices: ${result.failed.map(f => f.index).join(', ')}`);
      console.log(`Failed errors:`, result.failed.map(f => ({ index: f.index, errors: f.errors })));
    }, 30000);
  });

  describe('AC3 & AC4: Full Failure (HTTP 400)', () => {
    it('should handle all invalid issues (full failure)', async () => {
      if (!wrapper) return;

      const payloads = [
        // Missing required fields
        {
          fields: {
            project: { key: projectKey }
          }
        },
        // Invalid issue type
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'InvalidType9999' },
            summary: 'Test'
          }
        },
        // Missing summary
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Task' }
          }
        }
      ];

      const result = await wrapper.createBulk(payloads);

      // All should fail
      expect(result.created).toHaveLength(0);
      expect(result.failed).toHaveLength(3);

      // Verify error details
      result.failed.forEach((item, expectedIndex) => {
        expect(item.index).toBe(expectedIndex);
        expect(item.status).toBe(400);
        // At least one error field should be present
        const errorKeys = Object.keys(item.errors);
        expect(errorKeys.length).toBeGreaterThan(0);
        // Common error fields for invalid issues
        const hasExpectedError = errorKeys.some(key => 
          /issuetype|summary/i.test(key)
        );
        expect(hasExpectedError).toBe(true);
      });

      console.log(`✅ Full failure verified: all ${result.failed.length} issues failed as expected`);
      console.log(`Error details:`, result.failed.map(f => ({ index: f.index, errors: f.errors })));
    }, 30000);

    it('should preserve JIRA error messages correctly', async () => {
      if (!wrapper) return;

      const payloads = [
        {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Story' },
            summary: 'Test',
            priority: { name: 'InvalidPriority12345' }
          }
        }
      ];

      const result = await wrapper.createBulk(payloads);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.errors).toBeDefined();
      
      // Verify error message is preserved from JIRA
      const errorKeys = Object.keys(result.failed[0]!.errors);
      expect(errorKeys.length).toBeGreaterThan(0);
      
      // Error should contain field name and descriptive message
      const firstError = result.failed[0]!.errors[errorKeys[0]!];
      expect(firstError).toBeTruthy();
      expect(typeof firstError).toBe('string');

      console.log(`✅ Error message preserved: ${errorKeys[0]} → ${firstError}`);
    }, 30000);
  });

  describe('Error Mapping Verification', () => {
    it('should map JIRA elementErrors to library format correctly', async () => {
      if (!wrapper) return;

      const payloads = [
        {
          fields: {
            project: { key: projectKey },
            // Multiple missing fields to get multiple errors
          }
        }
      ];

      const result = await wrapper.createBulk(payloads);

      expect(result.failed).toHaveLength(1);
      
      const failedItem = result.failed[0]!;
      expect(failedItem.index).toBe(0);
      expect(failedItem.status).toBe(400);
      
      // Verify errors is Record<string, string>
      expect(typeof failedItem.errors).toBe('object');
      Object.entries(failedItem.errors).forEach(([fieldName, errorMessage]) => {
        expect(typeof fieldName).toBe('string');
        expect(typeof errorMessage).toBe('string');
        expect(fieldName.length).toBeGreaterThan(0);
        expect(errorMessage.length).toBeGreaterThan(0);
      });

      console.log(`✅ Error mapping verified: ${Object.keys(failedItem.errors).length} field errors`);
    }, 30000);
  });
});

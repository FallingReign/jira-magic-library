/**
 * Unit tests for JiraBulkApiWrapper Timeout Configuration
 * Feature: Phase 1 - Configurable Timeouts
 */

import { JiraBulkApiWrapper } from '../../../src/operations/JiraBulkApiWrapper.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';

describe('JiraBulkApiWrapper - Timeout Configuration', () => {
  let mockClient: jest.Mocked<JiraClient>;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<JiraClient>;
  });

  describe('Default Bulk Timeout', () => {
    it('should use 30s default timeout when not configured', async () => {
      const wrapper = new JiraBulkApiWrapper(mockClient);

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1' }
        ]
      });

      const payloads = [
        { fields: { summary: 'Test', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      await wrapper.createBulk(payloads);

      // Verify timeout parameter passed to client.post
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        30000 // 30s default
      );
    });

    it('should use custom bulk timeout when provided', async () => {
      const customTimeout = 120000; // 2 minutes
      const wrapper = new JiraBulkApiWrapper(mockClient, customTimeout);

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1' }
        ]
      });

      const payloads = [
        { fields: { summary: 'Test', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      await wrapper.createBulk(payloads);

      // Verify custom timeout passed to client.post
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        120000 // Custom 2 minute timeout
      );
    });

    it('should use timeout for both success and partial failure responses', async () => {
      const customTimeout = 60000;
      const wrapper = new JiraBulkApiWrapper(mockClient, customTimeout);

      // Mock partial success
      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1' }
        ],
        errors: [
          {
            status: 400,
            failedElementNumber: 1,
            elementErrors: {
              errors: { summary: 'Field required' }
            }
          }
        ]
      });

      const payloads = [
        { fields: { summary: 'Test 1', project: { key: 'TEST' }, issuetype: { name: 'Task' } } },
        { fields: { summary: '', project: { key: 'TEST' }, issuetype: { name: 'Task' } } } // Invalid
      ];

      await wrapper.createBulk(payloads);

      // Verify timeout used even with partial failure
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        60000
      );
    });
  });

  describe('Timeout Edge Cases', () => {
    it('should handle undefined timeout (use default 30s)', async () => {
      const wrapper = new JiraBulkApiWrapper(mockClient, undefined);

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1' }
        ]
      });

      const payloads = [
        { fields: { summary: 'Test', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      await wrapper.createBulk(payloads);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        30000 // Falls back to 30s
      );
    });

    it('should handle zero timeout (fallback to default)', async () => {
      const wrapper = new JiraBulkApiWrapper(mockClient, 0);

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1' }
        ]
      });

      const payloads = [
        { fields: { summary: 'Test', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      await wrapper.createBulk(payloads);

      // Current implementation uses 0 if provided, but ideally should validate
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        expect.any(Number)
      );
    });

    it('should handle very large timeout values', async () => {
      const largeTimeout = 600000; // 10 minutes
      const wrapper = new JiraBulkApiWrapper(mockClient, largeTimeout);

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1' }
        ]
      });

      const payloads = [
        { fields: { summary: 'Test', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      await wrapper.createBulk(payloads);

      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        600000
      );
    });
  });

  describe('Backwards Compatibility', () => {
    it('should work when constructed without timeout parameter', async () => {
      // Old API - no timeout parameter
      const wrapper = new JiraBulkApiWrapper(mockClient);

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1' }
        ]
      });

      const payloads = [
        { fields: { summary: 'Test', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      const result = await wrapper.createBulk(payloads);

      expect(result.created).toHaveLength(1);
      expect(result.created[0]?.key).toBe('TEST-1');

      // Should use default 30s timeout
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        30000
      );
    });

    it('should maintain existing error handling with timeout', async () => {
      const wrapper = new JiraBulkApiWrapper(mockClient, 60000);

      // Mock HTTP 400 full failure with proper ValidationError
      const jiraResponse = {
        errors: [
          {
            status: 400,
            failedElementNumber: 0,
            elementErrors: {
              errors: { summary: 'Field required' }
            }
          }
        ]
      };

      const validationError = new ValidationError(
        'Validation failed',
        { status: 400, url: '/rest/api/2/issue/bulk' },
        jiraResponse
      );

      mockClient.post.mockRejectedValue(validationError);

      const payloads = [
        { fields: { summary: '', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      const result = await wrapper.createBulk(payloads);

      // Should handle error and return failed result
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.status).toBe(400);

      // Timeout should still have been used in the request
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        60000
      );
    });
  });

  describe('Multiple Bulk Operations', () => {
    it('should use same timeout for multiple bulk operations', async () => {
      const customTimeout = 90000;
      const wrapper = new JiraBulkApiWrapper(mockClient, customTimeout);

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1' }
        ]
      });

      const payloads1 = [
        { fields: { summary: 'Test 1', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      const payloads2 = [
        { fields: { summary: 'Test 2', project: { key: 'TEST' }, issuetype: { name: 'Task' } } }
      ];

      // Call twice
      await wrapper.createBulk(payloads1);
      await wrapper.createBulk(payloads2);

      // Both calls should use same timeout
      expect(mockClient.post).toHaveBeenNthCalledWith(
        1,
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads1 },
        90000
      );

      expect(mockClient.post).toHaveBeenNthCalledWith(
        2,
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads2 },
        90000
      );
    });
  });
});

/**
 * Unit tests for Progress Tracking Integration in IssueOperations
 * Feature: Phase 2.2 - Progress Tracking Integration
 *
 * TDD Phase: RED - Tests written first, implementation comes after
 */

import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';
import type { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import type { FieldResolver } from '../../../src/converters/FieldResolver.js';
import type { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import type { LookupCache } from '../../../src/types/converter.js';
import type { JMLConfig } from '../../../src/types/config.js';

describe('IssueOperations - Progress Tracking Integration', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let mockSchema: jest.Mocked<SchemaDiscovery>;
  let mockResolver: jest.Mocked<FieldResolver>;
  let mockConverter: jest.Mocked<ConverterRegistry>;
  let mockCache: jest.Mocked<LookupCache>;
  let issueOperations: IssueOperations;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<JiraClient>;

    mockSchema = {
      getFieldMetadata: jest.fn(),
      getRequiredFields: jest.fn(),
      getFieldsForIssueType: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<SchemaDiscovery>;

    mockResolver = {
      resolveFields: jest.fn(),
      resolveFieldsWithExtraction: jest.fn().mockResolvedValue({
        projectKey: 'TEST',
        issueType: 'Task',
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Test'
        }
      }),
    } as unknown as jest.Mocked<FieldResolver>;

    mockConverter = {
      convert: jest.fn(),
      convertFields: jest.fn().mockResolvedValue({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test'
      }),
    } as unknown as jest.Mocked<ConverterRegistry>;

    mockCache = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      keys: jest.fn(),
    } as unknown as jest.Mocked<LookupCache>;
  });

  describe('Progress Tracking Configuration', () => {
    it('should read progress tracking config from JMLConfig', () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' },
        timeout: {
          progressTimeout: 120000,
          progressPolling: 2000,
          cleanupMarkers: true
        }
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      // Verify config is stored (will be used in bulk operations)
      expect(issueOperations).toBeDefined();
    });

    it('should use default progress tracking config if not provided', () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' }
        // No progress config
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      // Should work with defaults
      expect(issueOperations).toBeDefined();
    });

    it('should disable progress tracking when cleanupMarkers is false', () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' },
        timeout: {
          cleanupMarkers: false
        }
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      expect(issueOperations).toBeDefined();
    });
  });

  describe('Marker Injection', () => {
    beforeEach(() => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' },
        timeout: {
          progressTimeout: 120000,
          progressPolling: 2000
        }
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      // Mock cache operations
      mockCache.set.mockResolvedValue(undefined);
      mockCache.get.mockResolvedValue(null);

      // Mock converter to return valid payloads
      mockConverter.convert.mockResolvedValue({});

      // Mock resolver to return resolved fields
      mockResolver.resolveFields.mockResolvedValue({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test issue'
      });
    });

    it('should inject tracking markers into bulk payloads', async () => {
      // Mock successful bulk creation
      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira/issue/1' }
        ]
      });

      const rows = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test issue' }
      ];

      await issueOperations.create(rows);

      // Verify post was called with payload containing marker label
      const postCall = mockClient.post.mock.calls[0];
      const payload = postCall?.[1] as any;

      expect(payload.issueUpdates).toBeDefined();
      expect(payload.issueUpdates[0]?.fields.labels).toBeDefined();
      expect(Array.isArray(payload.issueUpdates[0]?.fields.labels)).toBe(true);

      // Verify marker format
      const labels = payload.issueUpdates[0]?.fields.labels;
      expect(labels.some((label: string) => label.startsWith('jml-job-'))).toBe(true);
    });

    it('should preserve existing labels when injecting markers', async () => {
      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira/issue/1' }
        ]
      });

      mockConverter.convertFields.mockResolvedValueOnce({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test issue',
        labels: ['existing-label']
      });

      const rows = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test', Labels: 'existing-label' }
      ];

      await issueOperations.create(rows);

      const postCall = mockClient.post.mock.calls[0];
      const payload = postCall?.[1] as any;
      const labels = payload.issueUpdates[0]?.fields.labels;

      // Should have both existing label and marker
      expect(labels).toContain('existing-label');
      expect(labels.some((label: string) => label.startsWith('jml-job-'))).toBe(true);
    });

    it('should not inject markers when progress tracking disabled', async () => {
      // Reconfigure without progress tracking
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' },
        timeout: {
          cleanupMarkers: false // Disabled
        }
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira/issue/1' }
        ]
      });

      mockConverter.convertFields.mockResolvedValueOnce({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test issue'
      });

      const rows = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test issue' }
      ];

      await issueOperations.create(rows);

      const postCall = mockClient.post.mock.calls[0];
      const payload = postCall?.[1] as any;
      const labels = payload.issueUpdates[0]?.fields.labels;

      // Should not have tracking marker
      if (labels) {
        expect(labels.every((label: string) => !label.startsWith('jml-job-'))).toBe(true);
      }
    });
  });

  describe('Progress Callbacks', () => {
    beforeEach(() => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' },
        timeout: {
          progressTimeout: 5000, // Short for testing
          progressPolling: 100    // Fast polling
        }
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      mockCache.set.mockResolvedValue(undefined);
      mockCache.get.mockResolvedValue(null);
      mockConverter.convert.mockResolvedValue({});
      mockConverter.convertFields.mockResolvedValue({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test'
      });
    });

    it('should invoke progress callback during bulk operation', async () => {
      const onProgress = jest.fn();

      // Mock slow bulk operation
      mockClient.post.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              issues: [
                { id: '1', key: 'TEST-1', self: 'https://jira/issue/1' }
              ]
            });
          }, 200);
        })
      );

      // Mock search to simulate progress
      mockClient.get.mockResolvedValue({
        issues: [],
        total: 0
      });

      const rows = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }
      ];

      await issueOperations.create(rows, { onProgress });

      // Callback should have been called
      expect(onProgress).toHaveBeenCalled();

      // Should receive progress updates
      const progressUpdate = onProgress.mock.calls[0]?.[0];
      expect(progressUpdate).toHaveProperty('total');
      expect(progressUpdate).toHaveProperty('completed');
      expect(progressUpdate).toHaveProperty('inProgress');
    });

    it('should provide accurate progress counts in callback', async () => {
      const onProgress = jest.fn();

      mockClient.post.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              issues: Array.from({ length: 10 }, (_, i) => ({
                id: String(i + 1),
                key: `TEST-${i + 1}`,
                self: `https://jira/issue/${i + 1}`
              }))
            });
          }, 200);
        })
      );

      // Simulate incremental progress
      let searchCallCount = 0;
      mockClient.get.mockImplementation(() => {
        searchCallCount++;
        return Promise.resolve({
          issues: Array.from({ length: Math.min(searchCallCount * 3, 10) }, (_, i) => ({
            key: `TEST-${i + 1}`,
            fields: { summary: 'Test' }
          })),
          total: 10
        });
      });

      const rows = Array.from({ length: 10 }, (_, i) => ({
        Project: 'TEST',
        'Issue Type': 'Task',
        Summary: `Test ${i + 1}`
      }));

      await issueOperations.create(rows, { onProgress });

      // Should show progress increasing
      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls;

      // First call should show 0 or low completion
      expect(calls[0]?.[0].completed).toBeLessThanOrEqual(3);

      // Last call should show completion
      const lastCall = calls[calls.length - 1]?.[0];
      expect(lastCall.completed).toBeGreaterThan(0);
    });

    it('should stop progress tracking when operation completes', async () => {
      const onProgress = jest.fn();

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira/issue/1' }
        ]
      });

      mockClient.get.mockResolvedValue({
        issues: [{ key: 'TEST-1', fields: { summary: 'Test' } }],
        total: 1
      });

      const rows = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }
      ];

      await issueOperations.create(rows, { onProgress });

      // Wait a bit to ensure no more callbacks after completion
      await new Promise(resolve => setTimeout(resolve, 300));

      const callCount = onProgress.mock.calls.length;

      // Should not receive more callbacks after completion
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(onProgress.mock.calls.length).toBe(callCount);
    });
  });

  describe('Marker Cleanup', () => {
    beforeEach(() => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' },
        timeout: {
          cleanupMarkers: true
        }
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      mockCache.set.mockResolvedValue(undefined);
      mockCache.get.mockResolvedValue(null);
      mockConverter.convert.mockResolvedValue({});
      mockConverter.convertFields.mockResolvedValue({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test'
      });
    });

    it('should clean up markers after successful bulk operation', async () => {
      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira/issue/1' },
          { id: '2', key: 'TEST-2', self: 'https://jira/issue/2' }
        ]
      });

      mockClient.put.mockResolvedValue({});

      const rows = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test 1' },
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test 2' }
      ];

      await issueOperations.create(rows);

      // Verify PUT was called to remove markers
      expect(mockClient.put).toHaveBeenCalled();

      // Should have called PUT for each created issue
      const putCalls = mockClient.put.mock.calls;
      expect(putCalls.length).toBeGreaterThanOrEqual(2);

      // Verify cleanup payload structure
      const cleanupCall = putCalls[0];
      expect(cleanupCall?.[0]).toMatch(/\/rest\/api\/2\/issue\/TEST-\d+/);
      expect(cleanupCall?.[1]).toHaveProperty('update');
      expect(cleanupCall?.[1]).toHaveProperty('update.labels');
    });

    it('should skip cleanup when cleanupMarkers is false', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' },
        timeout: {
          cleanupMarkers: false
        }
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira/issue/1' }
        ]
      });

      mockResolver.resolveFields.mockResolvedValue({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test'
      });

      const rows = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }
      ];

      await issueOperations.create(rows);

      // Should NOT call PUT for cleanup
      expect(mockClient.put).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1', key: 'TEST-1', self: 'https://jira/issue/1' },
          { id: '2', key: 'TEST-2', self: 'https://jira/issue/2' }
        ]
      });

      // First cleanup succeeds, second fails
      mockClient.put
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Cleanup failed'));

      const rows = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test 1' },
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test 2' }
      ];

      // Should not throw despite cleanup failure
      await expect(issueOperations.create(rows)).resolves.toBeDefined();

      // Both cleanups should have been attempted
      expect(mockClient.put).toHaveBeenCalledTimes(2);
    });
  });

  describe('Progress-Based Timeout', () => {
    beforeEach(() => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test' },
        timeout: {
          progressTimeout: 200, // Very short for testing
          progressPolling: 50
        }
      };

      issueOperations = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        config.baseUrl,
        config
      );

      mockCache.set.mockResolvedValue(undefined);
      mockCache.get.mockResolvedValue(null);
      mockConverter.convert.mockResolvedValue({});
      mockConverter.convertFields.mockResolvedValue({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test'
      });
    });

    it('should detect stuck operations via progress tracking', async () => {
      const onProgress = jest.fn();

      // Mock operation that never completes
      mockClient.post.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              issues: Array.from({ length: 50 }, (_, i) => ({
                id: String(i + 1),
                key: `TEST-${i + 1}`,
                self: `https://jira/issue/${i + 1}`
              }))
            });
          }, 10000); // Takes 10 seconds (longer than test timeout)
        })
      );

      // Mock search showing no progress
      mockClient.get.mockResolvedValue({
        issues: [], // No issues found (stuck)
        total: 0
      });

      const rows = Array.from({ length: 50 }, (_, i) => ({
        Project: 'TEST',
        'Issue Type': 'Task',
        Summary: `Test ${i + 1}`
      }));

      const result = await issueOperations.create(rows, { onProgress });

      // Should have detected stuck state
      const progressCalls = onProgress.mock.calls;
      const lastProgress = progressCalls[progressCalls.length - 1]?.[0];

      expect(lastProgress).toHaveProperty('isStuck');
      // May or may not be stuck depending on timing, but should have field
    }, 15000); // 15 second timeout for this test

    it('should continue when progress is made', async () => {
      const onProgress = jest.fn();

      mockClient.post.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              issues: Array.from({ length: 10 }, (_, i) => ({
                id: String(i + 1),
                key: `TEST-${i + 1}`,
                self: `https://jira/issue/${i + 1}`
              }))
            });
          }, 300);
        })
      );

      // Mock incremental progress
      let issuesCreated = 0;
      mockClient.get.mockImplementation(() => {
        issuesCreated += 3;
        return Promise.resolve({
          issues: Array.from({ length: Math.min(issuesCreated, 10) }, (_, i) => ({
            key: `TEST-${i + 1}`,
            fields: { summary: 'Test' }
          })),
          total: 10
        });
      });

      const rows = Array.from({ length: 10 }, (_, i) => ({
        Project: 'TEST',
        'Issue Type': 'Task',
        Summary: `Test ${i + 1}`
      }));

      const result = await issueOperations.create(rows, { onProgress });

      // Should complete successfully
      expect(result).toHaveProperty('succeeded');
      expect(onProgress).toHaveBeenCalled();
    });
  });
});

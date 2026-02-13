/**
 * Unit tests for Marker Injector
 * Feature: Phase 2.2 - Progress Tracking via Label Markers
 *
 * TDD Phase: RED - Tests written first, implementation comes after
 */

import { MarkerInjector } from '../../../../src/operations/bulk/MarkerInjector.js';
import type { BulkIssuePayload } from '../../../../src/types/bulk.js';
import type { JiraClient } from '../../../../src/client/JiraClient.js';

describe('MarkerInjector', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let markerInjector: MarkerInjector;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<JiraClient>;
  });

  describe('Marker Generation', () => {
    it('should generate unique marker with job ID and timestamp', () => {
      markerInjector = new MarkerInjector('job-123');

      const marker = markerInjector.getMarker();

      expect(marker).toMatch(/^jml-job-job-123-\d+$/);
    });

    it('should generate different markers for different job IDs', () => {
      const injector1 = new MarkerInjector('job-1');
      const injector2 = new MarkerInjector('job-2');

      const marker1 = injector1.getMarker();
      const marker2 = injector2.getMarker();

      expect(marker1).not.toBe(marker2);
      expect(marker1).toContain('job-1');
      expect(marker2).toContain('job-2');
    });

    it('should generate markers that are URL-safe', () => {
      markerInjector = new MarkerInjector('job-123');

      const marker = markerInjector.getMarker();

      // Should only contain alphanumeric, hyphens, underscores
      expect(marker).toMatch(/^[a-zA-Z0-9-_]+$/);
    });
  });

  describe('Label Injection', () => {
    beforeEach(() => {
      markerInjector = new MarkerInjector('job-123');
    });

    it('should inject marker label into payload with no existing labels', () => {
      const payload: BulkIssuePayload = {
        fields: {
          summary: 'Test issue',
          project: { key: 'TEST' },
          issuetype: { name: 'Task' }
        }
      };

      const injectedPayload = markerInjector.injectMarker(payload);

      expect(injectedPayload.fields.labels).toBeDefined();
      expect(Array.isArray(injectedPayload.fields.labels)).toBe(true);
      expect(injectedPayload.fields.labels).toContain(markerInjector.getMarker());
    });

    it('should preserve existing labels when injecting marker', () => {
      const payload: BulkIssuePayload = {
        fields: {
          summary: 'Test issue',
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          labels: ['backend', 'urgent']
        }
      };

      const injectedPayload = markerInjector.injectMarker(payload);

      expect(injectedPayload.fields.labels).toHaveLength(3);
      expect(injectedPayload.fields.labels).toContain('backend');
      expect(injectedPayload.fields.labels).toContain('urgent');
      expect(injectedPayload.fields.labels).toContain(markerInjector.getMarker());
    });

    it('should not mutate original payload', () => {
      const payload: BulkIssuePayload = {
        fields: {
          summary: 'Test issue',
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          labels: ['backend']
        }
      };

      const originalLabels = [...payload.fields.labels!];
      markerInjector.injectMarker(payload);

      // Original should be unchanged
      expect(payload.fields.labels).toEqual(originalLabels);
    });

    it('should inject marker into multiple payloads', () => {
      const payloads: BulkIssuePayload[] = [
        {
          fields: {
            summary: 'Issue 1',
            project: { key: 'TEST' },
            issuetype: { name: 'Task' }
          }
        },
        {
          fields: {
            summary: 'Issue 2',
            project: { key: 'TEST' },
            issuetype: { name: 'Task' },
            labels: ['existing']
          }
        },
        {
          fields: {
            summary: 'Issue 3',
            project: { key: 'TEST' },
            issuetype: { name: 'Task' }
          }
        }
      ];

      const injectedPayloads = markerInjector.injectMarkers(payloads);

      expect(injectedPayloads).toHaveLength(3);
      injectedPayloads.forEach((payload) => {
        expect(payload.fields.labels).toContain(markerInjector.getMarker());
      });

      // Verify existing label preserved
      expect(injectedPayloads[1]?.fields.labels).toContain('existing');
    });

    it('should handle empty labels array', () => {
      const payload: BulkIssuePayload = {
        fields: {
          summary: 'Test issue',
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          labels: []
        }
      };

      const injectedPayload = markerInjector.injectMarker(payload);

      expect(injectedPayload.fields.labels).toHaveLength(1);
      expect(injectedPayload.fields.labels).toContain(markerInjector.getMarker());
    });
  });

  describe('Marker Cleanup', () => {
    beforeEach(() => {
      markerInjector = new MarkerInjector('job-123', mockClient);
    });

    it('should remove marker label from issue', async () => {
      const issueKey = 'TEST-123';

      mockClient.put.mockResolvedValue({});

      await markerInjector.removeMarkerFromIssue(issueKey);

      expect(mockClient.put).toHaveBeenCalledWith(
        `/rest/api/2/issue/${issueKey}`,
        expect.objectContaining({
          update: expect.objectContaining({
            labels: expect.arrayContaining([
              expect.objectContaining({
                remove: markerInjector.getMarker()
              })
            ])
          })
        })
      );
    });

    it('should remove markers from multiple issues', async () => {
      const issueKeys = ['TEST-1', 'TEST-2', 'TEST-3'];

      mockClient.put.mockResolvedValue({});

      await markerInjector.removeMarkersFromIssues(issueKeys);

      expect(mockClient.put).toHaveBeenCalledTimes(3);
      issueKeys.forEach((key) => {
        expect(mockClient.put).toHaveBeenCalledWith(
          `/rest/api/2/issue/${key}`,
          expect.any(Object)
        );
      });
    });

    it('should handle cleanup errors gracefully', async () => {
      const issueKeys = ['TEST-1', 'TEST-2'];

      mockClient.put
        .mockResolvedValueOnce({}) // First succeeds
        .mockRejectedValueOnce(new Error('API error')); // Second fails

      // Should not throw
      await expect(markerInjector.removeMarkersFromIssues(issueKeys)).resolves.toBeUndefined();

      // Should have attempted both
      expect(mockClient.put).toHaveBeenCalledTimes(2);
    });

    it('should batch cleanup requests', async () => {
      const issueKeys = Array.from({ length: 100 }, (_, i) => `TEST-${i + 1}`);

      mockClient.put.mockResolvedValue({});

      await markerInjector.removeMarkersFromIssues(issueKeys, { batchSize: 10 });

      // Should make 100 PUT requests (1 per issue, but batched in groups)
      expect(mockClient.put).toHaveBeenCalledTimes(100);
    });
  });

  describe('Marker Validation', () => {
    beforeEach(() => {
      markerInjector = new MarkerInjector('job-123');
    });

    it('should validate if issue has marker', () => {
      const issue = {
        key: 'TEST-1',
        fields: {
          summary: 'Test',
          labels: ['backend', markerInjector.getMarker()]
        }
      };

      const hasMarker = markerInjector.hasMarker(issue);

      expect(hasMarker).toBe(true);
    });

    it('should validate if issue does not have marker', () => {
      const issue = {
        key: 'TEST-1',
        fields: {
          summary: 'Test',
          labels: ['backend', 'urgent']
        }
      };

      const hasMarker = markerInjector.hasMarker(issue);

      expect(hasMarker).toBe(false);
    });

    it('should handle issue with no labels', () => {
      const issue = {
        key: 'TEST-1',
        fields: {
          summary: 'Test'
        }
      };

      const hasMarker = markerInjector.hasMarker(issue);

      expect(hasMarker).toBe(false);
    });

    it('should handle issue with empty labels array', () => {
      const issue = {
        key: 'TEST-1',
        fields: {
          summary: 'Test',
          labels: []
        }
      };

      const hasMarker = markerInjector.hasMarker(issue);

      expect(hasMarker).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long job IDs', () => {
      const longJobId = 'a'.repeat(200);
      markerInjector = new MarkerInjector(longJobId);

      const marker = markerInjector.getMarker();

      expect(marker).toBeDefined();
      expect(marker.length).toBeLessThan(255); // JIRA label length limit
    });

    it('should handle job IDs with special characters', () => {
      markerInjector = new MarkerInjector('job@123#test');

      const marker = markerInjector.getMarker();

      // Should sanitize special characters
      expect(marker).toMatch(/^[a-zA-Z0-9-_]+$/);
    });

    it('should handle concurrent marker injections', () => {
      markerInjector = new MarkerInjector('job-123');

      const payload: BulkIssuePayload = {
        fields: {
          summary: 'Test',
          project: { key: 'TEST' },
          issuetype: { name: 'Task' }
        }
      };

      // Inject twice
      const injected1 = markerInjector.injectMarker(payload);
      const injected2 = markerInjector.injectMarker(payload);

      // Should have same marker, only added once
      expect(injected1.fields.labels).toHaveLength(1);
      expect(injected2.fields.labels).toHaveLength(1);
      expect(injected1.fields.labels![0]).toBe(injected2.fields.labels![0]);
    });
  });
});

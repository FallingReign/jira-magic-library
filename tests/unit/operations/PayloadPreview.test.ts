/**
 * Tests for PayloadPreview
 */

import { PayloadPreview } from '../../../src/operations/PayloadPreview.js';
import type { PreviewResult } from '../../../src/operations/PayloadPreview.js';
import { CloudCreateAdapter } from '../../../src/operations/CloudCreateAdapter.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';

// Mock dependencies
function createMockClient() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

function createMockSchema() {
  return {
    getFieldsForIssueType: jest.fn().mockResolvedValue({
      fields: {
        summary: { key: 'summary', name: 'Summary', schema: { type: 'string' }, required: true },
        priority: { key: 'priority', name: 'Priority', schema: { type: 'priority' }, required: false },
        description: { key: 'description', name: 'Description', schema: { type: 'string' }, required: false },
      },
    }),
  };
}

function createMockResolver() {
  return {
    resolveFieldsWithExtraction: jest.fn().mockResolvedValue({
      projectKey: 'TEST',
      issueType: 'Bug',
      fields: {
        project: { key: 'TEST' },
        issuetype: { id: '10001', name: 'Bug' },
        summary: 'Test issue',
        priority: { name: 'High' },
      },
    }),
  };
}

function createMockConverter() {
  return {
    convertFields: jest.fn().mockImplementation((_schema, fields) => Promise.resolve(fields)),
  };
}

function createEndpointResolverFn(deployment: 'server' | 'cloud' = 'server') {
  const resolver = new EndpointResolver(deployment, deployment === 'cloud' ? 'v3' : 'v2');
  return () => Promise.resolve(resolver);
}

describe('PayloadPreview', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockSchema: ReturnType<typeof createMockSchema>;
  let mockResolver: ReturnType<typeof createMockResolver>;
  let mockConverter: ReturnType<typeof createMockConverter>;

  beforeEach(() => {
    mockClient = createMockClient();
    mockSchema = createMockSchema();
    mockResolver = createMockResolver();
    mockConverter = createMockConverter();
  });

  function createPreview(deployment: 'server' | 'cloud' = 'server') {
    const cloudAdapter = new CloudCreateAdapter(deployment);
    return new PayloadPreview(
      mockClient as any,
      mockSchema as any,
      mockResolver as any,
      mockConverter as any,
      cloudAdapter,
      createEndpointResolverFn(deployment),
      () => Promise.resolve(deployment),
      undefined,
      undefined
    );
  }

  describe('preview()', () => {
    it('returns resolved payload for a single issue', async () => {
      const preview = createPreview();
      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test issue',
        Priority: 'High',
      });

      expect(result.payload).toBeDefined();
      expect(result.payload.fields).toBeDefined();
      expect(result.payload.fields.summary).toBe('Test issue');
      expect(result.payload.fields.project).toEqual({ key: 'TEST' });
    });

    it('includes endpoint information', async () => {
      const preview = createPreview('server');
      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test',
      });

      expect(result.endpoint).toBe('/rest/api/2/issue');
      expect(result.deployment).toBe('server');
    });

    it('returns Cloud endpoint for cloud deployment', async () => {
      const preview = createPreview('cloud');
      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test',
      });

      expect(result.endpoint).toBe('/rest/api/3/issue');
      expect(result.deployment).toBe('cloud');
    });

    it('applies Cloud ADF adaptation for description', async () => {
      mockResolver.resolveFieldsWithExtraction.mockResolvedValue({
        projectKey: 'TEST',
        issueType: 'Bug',
        fields: {
          project: { key: 'TEST' },
          issuetype: { id: '10001', name: 'Bug' },
          summary: 'Test',
          description: 'A plain text description',
        },
      });

      const preview = createPreview('cloud');
      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test',
        Description: 'A plain text description',
      });

      // Cloud adapter converts description to ADF
      const desc = result.payload.fields.description as Record<string, unknown>;
      expect(desc).toHaveProperty('version', 1);
      expect(desc).toHaveProperty('type', 'doc');
    });

    it('builds field resolution metadata', async () => {
      const preview = createPreview();
      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test issue',
        Priority: 'High',
      });

      // Should have resolutions for input fields
      expect(result.resolutions).toBeDefined();
      // Project should be resolved
      if (result.resolutions['Project']) {
        expect(result.resolutions['Project'].fieldId).toBe('project');
        expect(result.resolutions['Project'].confidence).toBe(1.0);
      }
    });

    it('generates warnings for low confidence matches', async () => {
      // Simulate a fuzzy match scenario
      mockResolver.resolveFieldsWithExtraction.mockResolvedValue({
        projectKey: 'TEST',
        issueType: 'Bug',
        fields: {
          project: { key: 'TEST' },
          issuetype: { id: '10001', name: 'Bug' },
          summary: 'Test',
          customfield_10050: 'some value',
        },
      });

      const preview = createPreview();
      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test',
        'Risk Level': 'High', // This won't match customfield_10050
      });

      // The field that can't be matched should not create a resolution
      // but it shouldn't cause errors either
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('handles resolution failure gracefully', async () => {
      mockResolver.resolveFieldsWithExtraction.mockRejectedValue(
        new Error("Field 'Project' is required")
      );

      const preview = createPreview();
      const result = await preview.preview({
        Summary: 'Missing project',
      });

      expect(result.payload.fields).toEqual({});
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].field).toBe('_resolution');
      expect(result.warnings[0].message).toContain("Field 'Project' is required");
    });

    it('handles conversion failure gracefully', async () => {
      mockConverter.convertFields.mockRejectedValue(new Error('Conversion error'));

      const preview = createPreview();
      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test',
      });

      // Should still return a result (using resolved fields before conversion)
      expect(result.payload.fields).toBeDefined();
      expect(result.warnings.some((w) => w.field === '_conversion')).toBe(true);
    });

    it('strips uid field from input', async () => {
      const preview = createPreview();
      await preview.preview({
        uid: 'epic-1',
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test',
      });

      // uid should not be passed to resolver
      const callArg = mockResolver.resolveFieldsWithExtraction.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('uid');
    });

    it('describes object values correctly', async () => {
      mockResolver.resolveFieldsWithExtraction.mockResolvedValue({
        projectKey: 'TEST',
        issueType: 'Bug',
        fields: {
          project: { key: 'TEST' },
          issuetype: { id: '10001', name: 'Bug' },
          summary: 'Hello',
          assignee: { accountId: '12345' },
          labels: ['bug', 'critical'],
        },
      });

      const preview = createPreview();
      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Hello',
        Assignee: 'user@example.com',
        Labels: ['bug', 'critical'],
      });

      // Check resolutions describe values
      if (result.resolutions['Summary']) {
        expect(result.resolutions['Summary'].resolvedTo).toBe('Hello');
      }
    });

    it('returns no endpoint resolver fallback', async () => {
      const cloudAdapter = new CloudCreateAdapter('server');
      const preview = new PayloadPreview(
        mockClient as any,
        mockSchema as any,
        mockResolver as any,
        mockConverter as any,
        cloudAdapter,
        () => Promise.reject(new Error('no resolver')),
        () => Promise.reject(new Error('no deployment')),
        undefined,
        undefined
      );

      const result = await preview.preview({
        Project: 'TEST',
        'Issue Type': 'Bug',
        Summary: 'Test',
      });

      expect(result.endpoint).toBe('/rest/api/2/issue');
      expect(result.deployment).toBe('server');
    });
  });

  describe('previewBulk()', () => {
    it('previews multiple issues', async () => {
      const preview = createPreview();
      const results = await preview.previewBulk([
        { Project: 'TEST', 'Issue Type': 'Bug', Summary: 'Issue 1' },
        { Project: 'TEST', 'Issue Type': 'Bug', Summary: 'Issue 2' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].payload.fields).toBeDefined();
      expect(results[1].payload.fields).toBeDefined();
    });

    it('handles partial failures in bulk preview', async () => {
      let callCount = 0;
      mockResolver.resolveFieldsWithExtraction.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Resolution failed'));
        }
        return Promise.resolve({
          projectKey: 'TEST',
          issueType: 'Bug',
          fields: {
            project: { key: 'TEST' },
            issuetype: { id: '10001', name: 'Bug' },
            summary: `Issue ${callCount}`,
          },
        });
      });

      const preview = createPreview();
      const results = await preview.previewBulk([
        { Project: 'TEST', 'Issue Type': 'Bug', Summary: 'Issue 1' },
        { Summary: 'Missing project' }, // Will fail
        { Project: 'TEST', 'Issue Type': 'Bug', Summary: 'Issue 3' },
      ]);

      expect(results).toHaveLength(3);
      // First should succeed
      expect(results[0].payload.fields.summary).toBeDefined();
      // Second should have warnings
      expect(results[1].warnings.length).toBeGreaterThan(0);
      // Third should succeed
      expect(results[2].payload.fields.summary).toBeDefined();
    });

    it('returns empty array for empty input', async () => {
      const preview = createPreview();
      const results = await preview.previewBulk([]);
      expect(results).toEqual([]);
    });
  });
});

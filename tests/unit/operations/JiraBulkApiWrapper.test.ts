/**
 * Unit tests for JIRA Bulk API Wrapper
 * Story: E4-S03
 */

import { JiraBulkApiWrapper } from '../../../src/operations/JiraBulkApiWrapper.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';

describe('JiraBulkApiWrapper', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let wrapper: JiraBulkApiWrapper;

  beforeEach(() => {
    // Create mock JiraClient
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<JiraClient>;

    wrapper = new JiraBulkApiWrapper(mockClient);
  });

  describe('AC1: Call JIRA Bulk API', () => {
    it('should POST to /rest/api/2/issue/bulk with correct payload format', async () => {
      // Mock successful response
      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1001', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1001' }
        ],
        errors: []
      });

      const payloads = [
        { fields: { project: { key: 'TEST' }, issuetype: { name: 'Task' }, summary: 'Test 1' } }
      ];

      await wrapper.createBulk(payloads);

      // Verify correct endpoint and payload structure
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads }
      );
    });

    it('should use existing JiraClient from E1-S05', () => {
      // Verify wrapper accepts JiraClient interface
      expect(wrapper).toBeDefined();
      expect(mockClient.post).toBeDefined();
    });
  });

  describe('AC2: Handle Partial Success (HTTP 201)', () => {
    it('should parse response with both issues and errors arrays', async () => {
      // Mock partial success response
      mockClient.post.mockResolvedValue({
        issues: [
          { id: '1001', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1001' },
          { id: '1002', key: 'TEST-2', self: 'https://jira.example.com/rest/api/2/issue/1002' }
        ],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: {
                issuetype: 'issue type is required',
                summary: 'summary is required'
              }
            },
            failedElementNumber: 2
          },
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: {
                priority: 'invalid priority value'
              }
            },
            failedElementNumber: 3
          }
        ]
      });

      const payloads = [
        { fields: { summary: 'Test 1' } },
        { fields: { summary: 'Test 2' } },
        { fields: {} }, // Missing required fields
        { fields: { summary: 'Test 3', priority: 'InvalidPriority' } }
      ];

      const result = await wrapper.createBulk(payloads);

      // Verify created issues
      expect(result.created).toHaveLength(2);
      expect(result.created[0]).toEqual({
        index: 0,
        key: 'TEST-1',
        id: '1001',
        self: 'https://jira.example.com/rest/api/2/issue/1001'
      });
      expect(result.created[1]).toEqual({
        index: 1,
        key: 'TEST-2',
        id: '1002',
        self: 'https://jira.example.com/rest/api/2/issue/1002'
      });

      // Verify failed issues
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0]).toEqual({
        index: 2,
        status: 400,
        errors: {
          issuetype: 'issue type is required',
          summary: 'summary is required'
        }
      });
      expect(result.failed[1]).toEqual({
        index: 3,
        status: 400,
        errors: {
          priority: 'invalid priority value'
        }
      });
    });

    it('should map failedElementNumber to original row index', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: { issuetype: 'required' }
            },
            failedElementNumber: 5
          }
        ]
      });

      const result = await wrapper.createBulk([{}, {}, {}, {}, {}, {}]);

      expect(result.failed[0]?.index).toBe(5);
    });

    it('should extract issue keys from successful creations', async () => {
      mockClient.post.mockResolvedValue({
        issues: [
          { id: '100', key: 'PROJ-42', self: 'https://example.com/issue/100' }
        ],
        errors: []
      });

      const result = await wrapper.createBulk([{ fields: {} }]);

      expect(result.created[0]?.key).toBe('PROJ-42');
      expect(result.created[0]?.id).toBe('100');
      expect(result.created[0]?.self).toBe('https://example.com/issue/100');
    });
  });

  describe('AC3: Handle Full Failure (HTTP 400)', () => {
    it('should parse response with only errors array', async () => {
      // Mock full failure response
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: { project: 'project is required' }
            },
            failedElementNumber: 0
          },
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: { issuetype: 'issue type is required' }
            },
            failedElementNumber: 1
          }
        ]
      });

      const result = await wrapper.createBulk([{ fields: {} }, { fields: {} }]);

      // Verify no created issues
      expect(result.created).toHaveLength(0);

      // Verify all issues failed
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0]?.index).toBe(0);
      expect(result.failed[1]?.index).toBe(1);
    });

    it('should handle HTTP 400 ValidationError with jiraResponse', async () => {
      // Simulate JiraClient throwing ValidationError for HTTP 400
      const { ValidationError } = await import('../../../src/errors/ValidationError.js');
      const bulkErrorResponse = {
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: { project: 'project is required' }
            },
            failedElementNumber: 0
          }
        ]
      };
      const validationError = new ValidationError('Validation failed', undefined, bulkErrorResponse);
      mockClient.post.mockRejectedValue(validationError);

      const result = await wrapper.createBulk([{ fields: {} }]);

      // Should extract response from error and normalize
      expect(result.created).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.errors).toEqual({ project: 'project is required' });
    });

    it('should handle empty issues array correctly', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: ['Some general error'],
              errors: {}
            },
            failedElementNumber: 0
          }
        ]
      });

      const result = await wrapper.createBulk([{ fields: {} }]);

      expect(result.created).toEqual([]);
      expect(result.failed).toHaveLength(1);
    });

    it('should map all errors to row indices', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: { errorMessages: [], errors: { field1: 'error1' } },
            failedElementNumber: 0
          },
          {
            status: 400,
            elementErrors: { errorMessages: [], errors: { field2: 'error2' } },
            failedElementNumber: 1
          },
          {
            status: 400,
            elementErrors: { errorMessages: [], errors: { field3: 'error3' } },
            failedElementNumber: 2
          }
        ]
      });

      const result = await wrapper.createBulk([{}, {}, {}]);

      expect(result.failed.map((f: { index: number }) => f.index)).toEqual([0, 1, 2]);
    });

    it('should preserve JIRA error messages', async () => {
      const jiraErrorMessage = 'Field \'priority\' cannot be set. It is not on the appropriate screen, or unknown.';
      
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: { priority: jiraErrorMessage }
            },
            failedElementNumber: 0
          }
        ]
      });

      const result = await wrapper.createBulk([{}]);

      expect(result.failed[0]?.errors.priority).toBe(jiraErrorMessage);
    });
  });

  describe('AC4: Error Mapping', () => {
    it('should map JIRA elementErrors.errors to Record<string, string>', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: {
                issuetype: 'issue type is required',
                summary: 'summary is required',
                priority: 'invalid priority'
              }
            },
            failedElementNumber: 0
          }
        ]
      });

      const result = await wrapper.createBulk([{}]);

      // Verify error structure matches Record<string, string>
      expect(result.failed[0]?.errors).toEqual({
        issuetype: 'issue type is required',
        summary: 'summary is required',
        priority: 'invalid priority'
      });
    });

    it('should include field name from error object keys', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: {
                customfield_10030: 'Invalid value',
                assignee: 'User not found'
              }
            },
            failedElementNumber: 0
          }
        ]
      });

      const result = await wrapper.createBulk([{}]);

      expect(Object.keys(result.failed[0]!.errors)).toEqual(['customfield_10030', 'assignee']);
    });

    it('should include error message from error object values', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: {
                duedate: 'Date format is invalid'
              }
            },
            failedElementNumber: 0
          }
        ]
      });

      const result = await wrapper.createBulk([{}]);

      expect(result.failed[0]?.errors.duedate).toBe('Date format is invalid');
    });

    it('should preserve HTTP status code per error', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: { errorMessages: [], errors: { field1: 'error' } },
            failedElementNumber: 0
          },
          {
            status: 403,
            elementErrors: { errorMessages: [], errors: { field2: 'forbidden' } },
            failedElementNumber: 1
          }
        ]
      });

      const result = await wrapper.createBulk([{}, {}]);

      expect(result.failed[0]?.status).toBe(400);
      expect(result.failed[1]?.status).toBe(403);
    });
  });

  describe('AC5: Response Normalization', () => {
    it('should return consistent BulkApiResult regardless of success/failure', async () => {
      // Test with partial success
      mockClient.post.mockResolvedValue({
        issues: [{ id: '1', key: 'T-1', self: 'url' }],
        errors: [
          {
            status: 400,
            elementErrors: { errorMessages: [], errors: { f: 'e' } },
            failedElementNumber: 1
          }
        ]
      });

      const result1 = await wrapper.createBulk([{}, {}]);
      expect(result1).toHaveProperty('created');
      expect(result1).toHaveProperty('failed');

      // Test with full success
      mockClient.post.mockResolvedValue({
        issues: [{ id: '1', key: 'T-1', self: 'url' }],
        errors: []
      });

      const result2 = await wrapper.createBulk([{}]);
      expect(result2).toHaveProperty('created');
      expect(result2).toHaveProperty('failed');

      // Test with full failure
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: { errorMessages: [], errors: { f: 'e' } },
            failedElementNumber: 0
          }
        ]
      });

      const result3 = await wrapper.createBulk([{}]);
      expect(result3).toHaveProperty('created');
      expect(result3).toHaveProperty('failed');
    });

    it('should include created issues with keys, IDs, and self URLs', async () => {
      mockClient.post.mockResolvedValue({
        issues: [
          {
            id: '1001',
            key: 'PROJ-100',
            self: 'https://jira.example.com/rest/api/2/issue/1001'
          }
        ],
        errors: []
      });

      const result = await wrapper.createBulk([{}]);

      expect(result.created[0]).toEqual({
        index: 0,
        key: 'PROJ-100',
        id: '1001',
        self: 'https://jira.example.com/rest/api/2/issue/1001'
      });
    });

    it('should include failed issues with row indices and error details', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: [],
              errors: {
                issuetype: 'required',
                summary: 'required'
              }
            },
            failedElementNumber: 5
          }
        ]
      });

      const result = await wrapper.createBulk([{}, {}, {}, {}, {}, {}]);

      expect(result.failed[0]).toEqual({
        index: 5,
        status: 400,
        errors: {
          issuetype: 'required',
          summary: 'required'
        }
      });
    });

    it('should handle empty errors object with errorMessages array', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: {
              errorMessages: ['Generic error message'],
              errors: {}
            },
            failedElementNumber: 0
          }
        ]
      });

      const result = await wrapper.createBulk([{}]);

      expect(result.failed[0]?.errors).toEqual({});
      expect(result.failed[0]?.status).toBe(400);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty payload array', async () => {
      mockClient.post.mockResolvedValue({
        issues: [],
        errors: []
      });

      const result = await wrapper.createBulk([]);

      expect(result.created).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('should handle response with undefined issues/errors', async () => {
      mockClient.post.mockResolvedValue({});

      const result = await wrapper.createBulk([{}]);

      expect(result.created).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('should handle large batch (100+ issues)', async () => {
      const issues = Array.from({ length: 100 }, (_, i) => ({
        id: String(1000 + i),
        key: `TEST-${i}`,
        self: `url-${i}`
      }));

      mockClient.post.mockResolvedValue({
        issues,
        errors: []
      });

      const result = await wrapper.createBulk(Array(100).fill({ fields: {} }));

      expect(result.created).toHaveLength(100);
      expect(result.created[0]?.index).toBe(0);
      expect(result.created[99]?.index).toBe(99);
    });

    it('should re-throw non-ValidationError errors (network, auth)', async () => {
      const networkError = new Error('Network failure');
      mockClient.post.mockRejectedValue(networkError);

      await expect(wrapper.createBulk([{}])).rejects.toThrow('Network failure');
    });

    it('should handle ValidationError without jiraResponse', async () => {
      const { ValidationError } = await import('../../../src/errors/ValidationError.js');
      const validationError = new ValidationError('Some validation error');
      mockClient.post.mockRejectedValue(validationError);

      await expect(wrapper.createBulk([{}])).rejects.toThrow('Some validation error');
    });
  });
});

/**
 * Unit tests for Issue Search API
 * Feature: Phase 2.1 - Issue Search with Field Resolution
 *
 * TDD Phase: RED - Tests written first, implementation comes after
 */

import { IssueSearch } from '../../../src/operations/IssueSearch.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';
import type { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import type { FieldResolver } from '../../../src/converters/FieldResolver.js';
import type { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';

describe('IssueSearch', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let mockSchema: jest.Mocked<SchemaDiscovery>;
  let mockResolver: jest.Mocked<FieldResolver>;
  let mockConverter: jest.Mocked<ConverterRegistry>;
  let issueSearch: IssueSearch;

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
    } as unknown as jest.Mocked<SchemaDiscovery>;

    mockResolver = {
      resolveFieldName: jest.fn(),
    } as unknown as jest.Mocked<FieldResolver>;

    mockConverter = {
      convert: jest.fn(),
    } as unknown as jest.Mocked<ConverterRegistry>;

    issueSearch = new IssueSearch(mockClient, mockSchema, mockResolver, mockConverter);
  });

  describe('Basic Search', () => {
    it('should search with simple project criteria', async () => {
      // Arrange
      mockResolver.resolveFieldName.mockResolvedValue('project');
      mockConverter.convert.mockResolvedValue({ key: 'ENG' });

      mockClient.get.mockResolvedValue({
        issues: [
          { key: 'ENG-1', fields: { summary: 'Test issue' } },
          { key: 'ENG-2', fields: { summary: 'Another issue' } }
        ],
        total: 2
      });

      // Act
      const results = await issueSearch.search({ project: 'Engineering' });

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0]?.key).toBe('ENG-1');
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringContaining('project')
        })
      );
    });

    it('should search with multiple criteria', async () => {
      // Arrange
      mockResolver.resolveFieldName
        .mockResolvedValueOnce('project')
        .mockResolvedValueOnce('assignee')
        .mockResolvedValueOnce('status');

      mockConverter.convert
        .mockResolvedValueOnce({ key: 'ENG' })
        .mockResolvedValueOnce({ accountId: 'user123' })
        .mockResolvedValueOnce({ name: 'In Progress' });

      mockClient.get.mockResolvedValue({
        issues: [{ key: 'ENG-1', fields: { summary: 'Test' } }],
        total: 1
      });

      // Act
      await issueSearch.search({
        project: 'Engineering',
        assignee: 'John Smith',
        status: 'In Progress'
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringMatching(/project.*AND.*assignee.*AND.*status/)
        })
      );
    });

    it('should handle labels array', async () => {
      // Arrange
      mockResolver.resolveFieldName.mockResolvedValue('labels');
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        labels: ['backend', 'urgent']
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringContaining('labels')
        })
      );
    });
  });

  describe('Search Options', () => {
    it('should respect maxResults option', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        project: 'ENG',
        maxResults: 50
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          maxResults: 50
        })
      );
    });

    it('should apply orderBy clause', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        project: 'ENG',
        orderBy: 'created DESC'
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringContaining('ORDER BY created DESC')
        })
      );
    });

    it('should handle createdSince date filter', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });
      const testDate = new Date('2025-02-12T10:00:00Z');

      // Act
      await issueSearch.search({
        project: 'ENG',
        createdSince: testDate
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringMatching(/created >= "2025-02-12/)
        })
      );
    });

    it('should handle createdSince string filter', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        project: 'ENG',
        createdSince: '2025-02-12'
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringContaining('created >=')
        })
      );
    });
  });

  describe('Custom Fields', () => {
    // TODO: Phase 2.2 - Enable when custom field resolution is implemented
    it.skip('should resolve custom field names', async () => {
      // Arrange
      mockResolver.resolveFieldName
        .mockResolvedValueOnce('project')
        .mockResolvedValueOnce('customfield_12345'); // Risk Level

      mockConverter.convert
        .mockResolvedValueOnce({ key: 'ENG' })
        .mockResolvedValueOnce({ value: 'High' });

      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        project: 'Engineering',
        'Risk Level': 'High'
      });

      // Assert
      expect(mockResolver.resolveFieldName).toHaveBeenCalledWith('Risk Level', expect.any(Object));
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringContaining('customfield_12345')
        })
      );
    });
  });

  describe('JQL Generation', () => {
    it('should escape special characters in values', async () => {
      // Arrange
      mockResolver.resolveFieldName.mockResolvedValue('summary');
      mockConverter.convert.mockResolvedValue('Test "with quotes"');
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        summary: 'Test "with quotes"'
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringMatching(/summary ~ "Test \\"with quotes\\""/)
        })
      );
    });

    it('should handle empty criteria', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({});

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.not.stringContaining('AND')
        })
      );
    });

    it('should filter out undefined and null values', async () => {
      // Arrange
      mockResolver.resolveFieldName.mockResolvedValue('project');
      mockConverter.convert.mockResolvedValue({ key: 'ENG' });
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        project: 'Engineering',
        assignee: undefined,
        status: null
      });

      // Assert
      const jqlCall = (mockClient.get.mock.calls[0]?.[1] as any)?.jql;
      expect(jqlCall).not.toContain('assignee');
      expect(jqlCall).not.toContain('status');
    });
  });

  describe('Error Handling', () => {
    // TODO: Phase 2.2 - Enable when field resolution is implemented
    it.skip('should throw error if field resolution fails', async () => {
      // Arrange
      mockResolver.resolveFieldName.mockRejectedValue(
        new Error('Field "Invalid Field" not found')
      );

      // Act & Assert
      await expect(issueSearch.search({
        'Invalid Field': 'value'
      })).rejects.toThrow('Field "Invalid Field" not found');
    });

    // TODO: Phase 2.2 - Enable when value conversion is implemented
    it.skip('should throw error if conversion fails', async () => {
      // Arrange
      mockResolver.resolveFieldName.mockResolvedValue('project');
      mockConverter.convert.mockRejectedValue(
        new Error('Cannot convert project "Nonexistent"')
      );

      // Act & Assert
      await expect(issueSearch.search({
        project: 'Nonexistent'
      })).rejects.toThrow('Cannot convert project');
    });

    it('should throw error if JIRA search fails', async () => {
      // Arrange
      mockClient.get.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(issueSearch.search({
        project: 'ENG'
      })).rejects.toThrow('Network error');
    });
  });

  describe('Performance Optimization', () => {
    it('should limit fields returned from JQL', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({ project: 'ENG' });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          fields: expect.arrayContaining(['key', 'summary', 'status'])
        })
      );
    });

    it('should default maxResults to reasonable limit', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({ project: 'ENG' });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          maxResults: expect.any(Number)
        })
      );
    });
  });

  describe('Raw JQL Support', () => {
    it('should accept raw JQL query', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        issues: [
          { key: 'PROJ-1', fields: { summary: 'Test' } },
          { key: 'PROJ-2', fields: { summary: 'Another' } }
        ],
        total: 2
      });

      // Act
      const results = await issueSearch.search({
        jql: 'project = PROJ AND issuetype = Task AND cf[10306] = mp_proj_newsroom AND status = Done AND labels = mp-mode'
      });

      // Assert
      expect(results).toHaveLength(2);
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: 'project = PROJ AND issuetype = Task AND cf[10306] = mp_proj_newsroom AND status = Done AND labels = mp-mode'
        })
      );
    });

    it('should ignore object fields when raw JQL provided', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        jql: 'project = PROJ',
        project: 'Engineering', // Should be ignored
        status: 'Done'           // Should be ignored
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: 'project = PROJ'
        })
      );

      // Verify object fields were not processed
      expect(mockResolver.resolveFieldName).not.toHaveBeenCalled();
      expect(mockConverter.convert).not.toHaveBeenCalled();
    });

    it('should apply createdSince filter to raw JQL', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });
      const testDate = new Date('2025-02-12T10:00:00Z');

      // Act
      await issueSearch.search({
        jql: 'project = PROJ AND status = Done',
        createdSince: testDate
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringMatching(/\(project = PROJ AND status = Done\) AND created >= "2025-02-12/)
        })
      );
    });

    it('should apply orderBy to raw JQL', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        jql: 'project = PROJ',
        orderBy: 'created DESC'
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: 'project = PROJ ORDER BY created DESC'
        })
      );
    });

    it('should combine createdSince and orderBy with raw JQL', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        jql: 'project = PROJ',
        createdSince: '2025-02-12',
        orderBy: 'priority DESC'
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringMatching(/\(project = PROJ\) AND created >= "2025-02-12" ORDER BY priority DESC/)
        })
      );
    });

    it('should respect maxResults with raw JQL', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      // Act
      await issueSearch.search({
        jql: 'project = PROJ',
        maxResults: 25
      });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: 'project = PROJ',
          maxResults: 25
        })
      );
    });

    it('should handle complex raw JQL with custom fields and operators', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({ issues: [], total: 0 });

      const complexJql = 'project = PROJ AND (status = "In Progress" OR status = Done) ' +
                        'AND cf[10306] != empty AND priority >= High ' +
                        'AND assignee in (jsmith, jdoe) ' +
                        'AND labels in (backend, urgent)';

      // Act
      await issueSearch.search({ jql: complexJql });

      // Assert
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: complexJql
        })
      );
    });
  });
});

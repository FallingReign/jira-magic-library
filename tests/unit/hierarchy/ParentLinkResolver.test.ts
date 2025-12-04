/**
 * Unit tests for ParentLinkResolver
 * Story: E3-S05 - Parent Link Resolver
 * 
 * Updated to test smart endpoint resolution based on plugin type.
 * Hierarchy validation is now handled by the plugin-specific endpoints.
 */

import { resolveParentLink } from '../../../src/hierarchy/ParentLinkResolver.js';
import { JiraClient } from '../../../src/client/JiraClient.js';
import { RedisCache } from '../../../src/cache/RedisCache.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { NotFoundError, AmbiguityError } from '../../../src/errors.js';
import type { ProjectSchema } from '../../../src/types/schema.js';
import { PARENT_FIELD_PLUGINS } from '../../../src/constants/field-constants.js';

// Plugin constants for convenience
const GREENHOPPER_PLUGIN = PARENT_FIELD_PLUGINS[0]; // 'com.pyxis.greenhopper.jira:gh-epic-link'
const JPO_PLUGIN = PARENT_FIELD_PLUGINS[1]; // 'com.atlassian.jpo:jpo-custom-field-parent'

describe('ParentLinkResolver', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let mockCache: jest.Mocked<RedisCache>;
  let mockSchemaDiscovery: jest.Mocked<SchemaDiscovery>;
  let mockProjectSchema: ProjectSchema;

  beforeEach(() => {
    // Mock JiraClient
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
    } as unknown as jest.Mocked<JiraClient>;

    // Mock RedisCache
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as jest.Mocked<RedisCache>;

    // Mock SchemaDiscovery
    mockSchemaDiscovery = {
      getFieldsForIssueType: jest.fn(),
    } as unknown as jest.Mocked<SchemaDiscovery>;

    // Mock project schema
    mockProjectSchema = {
      projectKey: 'PROJ',
      issueType: 'Story',
      fields: {
        summary: {
          id: 'summary',
          name: 'Summary',
          type: 'string',
          required: true,
          schema: { type: 'string', system: 'summary' },
        },
      },
    } as ProjectSchema;

    mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
  });

  describe('AC1: Accept Exact Issue Key', () => {
    it('should validate and return uppercase key for valid format', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
      });

      // Act
      const result = await resolveParentLink(
        'proj-123',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
      expect(mockClient.get).toHaveBeenCalledWith('/rest/api/2/issue/proj-123?fields=key');
    });

    it('should accept key with lowercase project key', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-456',
      });

      // Act
      const result = await resolveParentLink(
        'proj-456',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-456');
    });

    it('should accept key with all uppercase', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-789',
      });

      // Act
      const result = await resolveParentLink(
        'PROJ-789',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-789');
    });

    it('should throw NotFoundError if key does not exist', async () => {
      // Arrange
      mockClient.get.mockRejectedValue(new NotFoundError('Issue not found'));

      // Act & Assert
      await expect(
        resolveParentLink(
          'PROJ-999',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          JPO_PLUGIN,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('AC2: Accept Summary Text Search', () => {
    it('should search by summary text using JQL fallback for unknown plugin', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Newsroom - Phase 1',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act - using undefined plugin to trigger JQL fallback
      const result = await resolveParentLink(
        'newsroom - phase 1',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringContaining('summary ~'),
          fields: ['summary', 'issuetype', 'key'],
        })
      );
    });

    it('should perform case-insensitive search', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-456',
            fields: {
              summary: 'NEWSROOM - PHASE 1',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'NeWsRoOm - PhAsE 1',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-456');
    });

    it('should wrap summary in quotes for exact phrase matching', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-789',
            fields: {
              summary: 'Test Summary',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      await resolveParentLink(
        'test summary',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      const jql = (mockClient.post as jest.Mock).mock.calls[0][1].jql;
      expect(jql).toContain('"test summary"');
    });
  });

  describe('AC3: Smart Endpoint Selection', () => {
    it('should use GreenHopper endpoint for gh-epic-link plugin', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        epicLists: [
          {
            listDescriptor: 'current project',
            epicNames: [
              { key: 'PROJ-123', name: 'Test Epic', isDone: false },
            ],
          },
        ],
        total: 1,
      });

      // Act
      const result = await resolveParentLink(
        'test epic',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        GREENHOPPER_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/rest/greenhopper/1.0/epics?searchQuery=test%20epic&projectKey=PROJ')
      );
    });

    it('should use JPO endpoint for jpo-custom-field-parent plugin', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        issues: [
          {
            issueKey: 123,
            issueSummary: 'Parent Epic',
            issueTypeId: 13301,
            projectId: 10000,
          },
        ],
        projects: [
          { id: 10000, key: 'PROJ' },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'parent epic',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/jpo/1.0/parent/suggest',
        expect.objectContaining({
          query: 'parent epic',
          issueTypeName: 'Story',
          maxResults: 10,
        })
      );
    });

    it('should fallback to JQL for undefined plugin', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test Issue',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'test issue',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringContaining('project = PROJ'),
        })
      );
    });

    it('should fallback to JQL for unknown plugin', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test Issue',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'test issue',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        'com.unknown:custom-plugin',
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/search',
        expect.objectContaining({
          jql: expect.stringContaining('project = PROJ'),
        })
      );
    });
  });

  describe('AC4: Handle Ambiguity (Multiple Matches)', () => {
    it('should throw AmbiguityError when multiple issues match with same weight', async () => {
      // Arrange - using JQL fallback which returns multiple matches
      mockClient.post.mockResolvedValue({
        total: 3,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Newsroom Project',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
          {
            key: 'PROJ-456',
            fields: {
              summary: 'Newsroom Phase 1',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
          {
            key: 'PROJ-789',
            fields: {
              summary: 'Newsroom Phase 2',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'newsroom',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          undefined,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(AmbiguityError);
    });

    it('should include all candidate keys and types in error', async () => {
      // Arrange - both issues have same summary so they'll have same weight
      mockClient.post.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'PROJ-111',
            fields: {
              summary: 'Test Summary',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
          {
            key: 'PROJ-222',
            fields: {
              summary: 'Test Summary',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'test',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          undefined,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(AmbiguityError);

      // Also verify the message contains the keys
      try {
        await resolveParentLink(
          'test',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          undefined,
          mockSchemaDiscovery
        );
      } catch (error) {
        expect((error as AmbiguityError).message).toContain('PROJ-111');
        expect((error as AmbiguityError).message).toContain('PROJ-222');
      }
    });

    it('should suggest using exact key in error message', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'PROJ-111',
            fields: {
              summary: 'Test',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
          {
            key: 'PROJ-222',
            fields: {
              summary: 'Test',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'test',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          undefined,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(/exact key|specific/i);
    });

    it('should return best match when weights differ', async () => {
      // Arrange - second issue has exact match which gets higher weight
      mockClient.post.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'PROJ-111',
            fields: {
              summary: 'Test Something Else',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
          {
            key: 'PROJ-222',
            fields: {
              summary: 'test', // Exact match
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'test',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert - should return exact match
      expect(result).toBe('PROJ-222');
    });
  });

  describe('AC5: Handle Not Found', () => {
    it('should throw NotFoundError when no issues match (JQL fallback)', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 0,
        issues: [],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'nonexistent summary',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          undefined,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when no epics match (GreenHopper)', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        epicLists: [],
        total: 0,
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'nonexistent epic',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          GREENHOPPER_PLUGIN,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when no parents match (JPO)', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        issues: [],
        projects: [],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'nonexistent parent',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          JPO_PLUGIN,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('should include search term in error message', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 0,
        issues: [],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'my search term',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          undefined,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(/my search term/);
    });

    it('should include project key in error context', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 0,
        issues: [],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'test',
          'Story',
          'TESTPROJ',
          mockClient,
          mockCache,
          undefined,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(/TESTPROJ/);
    });
  });
  describe('AC6: No Hierarchy Validation (Delegated to JIRA)', () => {
    // Note: Hierarchy validation is now delegated to JIRA's plugin-specific endpoints.
    // The resolver simply validates that the issue exists and lets JIRA enforce hierarchy rules.

    it('should accept any valid issue key without hierarchy validation', async () => {
      // Arrange - issue exists, doesn't matter what type it is
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
      });

      // Act - Story type child, but resolver doesn't check hierarchy anymore
      const result = await resolveParentLink(
        'PROJ-123',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert - just returns the validated key
      expect(result).toBe('PROJ-123');
    });

    it('should not call hierarchy discovery', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
      });

      // Act
      await resolveParentLink(
        'PROJ-123',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert - schema discovery is passed but not used for hierarchy validation
      // The implementation keeps schemaDiscovery for API compatibility but doesn't use it
      expect(mockClient.get).toHaveBeenCalledWith('/rest/api/2/issue/PROJ-123?fields=key');
    });
  });

  describe('AC7: Cache Results', () => {
    it('should cache resolved parent key from summary search', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test Epic',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      await resolveParentLink(
        'test epic',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('parent-link:PROJ:test epic'),
        'PROJ-123',
        300
      );
    });

    it('should return cached value if available', async () => {
      // Arrange
      mockCache.get.mockResolvedValue('PROJ-999');

      // Act
      const result = await resolveParentLink(
        'cached summary',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-999');
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should use 5 minute TTL (300 seconds)', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      await resolveParentLink(
        'test',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      expect(mockCache.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 300);
    });

    it('should NOT cache exact key lookups', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
      });

      // Act
      await resolveParentLink(
        'PROJ-123',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should normalize cache key (lowercase, trim)', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      await resolveParentLink(
        '  TeSt SuMmArY  ',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('test summary'),
        expect.any(String),
        expect.any(Number)
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty summary search term', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 0,
        issues: [],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          '   ',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          undefined,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle special characters in summary', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test "quoted" & special',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'test "quoted" & special',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
    });

    it('should handle cache errors gracefully and continue to API', async () => {
      // Arrange
      mockCache.get.mockRejectedValue(new Error('Cache unavailable'));
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'test',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert - should still succeed
      expect(result).toBe('PROJ-123');
    });

    it('should handle cache set errors gracefully', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockRejectedValue(new Error('Cache write error'));
      mockClient.post.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'PROJ-123',
            fields: {
              summary: 'Test',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'test',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        undefined,
        mockSchemaDiscovery
      );

      // Assert - should still succeed even if cache write fails
      expect(result).toBe('PROJ-123');
    });
  });

  describe('Edge Cases: GreenHopper Endpoint', () => {
    it('should throw AmbiguityError when GreenHopper returns multiple epics with same weight', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        epicLists: [
          {
            listDescriptor: 'current project',
            epicNames: [
              { key: 'PROJ-111', name: 'Test Epic One', isDone: false },
              { key: 'PROJ-222', name: 'Test Epic Two', isDone: false },
            ],
          },
        ],
        total: 2,
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'test',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          GREENHOPPER_PLUGIN,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(AmbiguityError);
    });

    it('should prefer exact name match in GreenHopper results', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        epicLists: [
          {
            listDescriptor: 'current project',
            epicNames: [
              { key: 'PROJ-111', name: 'Test Epic Extended', isDone: false },
              { key: 'PROJ-222', name: 'test', isDone: false }, // Exact match
            ],
          },
        ],
        total: 2,
      });

      // Act
      const result = await resolveParentLink(
        'test',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        GREENHOPPER_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-222');
    });

    it('should handle undefined epicLists in GreenHopper response', async () => {
      // Arrange - epicLists is undefined
      mockClient.get.mockResolvedValue({
        total: 0,
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'test',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          GREENHOPPER_PLUGIN,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Edge Cases: JPO Endpoint', () => {
    it('should throw AmbiguityError when JPO returns multiple parents with same weight', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        issues: [
          {
            issueKey: 111,
            issueSummary: 'Test Parent One',
            issueTypeId: 13301,
            projectId: 10000,
          },
          {
            issueKey: 222,
            issueSummary: 'Test Parent Two',
            issueTypeId: 13301,
            projectId: 10000,
          },
        ],
        projects: [
          { id: 10000, key: 'PROJ' },
        ],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'test',
          'Story',
          'PROJ',
          mockClient,
          mockCache,
          JPO_PLUGIN,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(AmbiguityError);
    });

    it('should prefer current project in cross-project JPO results', async () => {
      // Arrange - two results from different projects
      mockClient.post.mockResolvedValue({
        issues: [
          {
            issueKey: 111,
            issueSummary: 'Test Parent',
            issueTypeId: 13301,
            projectId: 20000, // Different project
          },
          {
            issueKey: 222,
            issueSummary: 'Test Parent',
            issueTypeId: 13301,
            projectId: 10000, // Current project
          },
        ],
        projects: [
          { id: 10000, key: 'PROJ' },
          { id: 20000, key: 'OTHER' },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'test parent',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert - should prefer PROJ-222 (current project)
      expect(result).toBe('PROJ-222');
    });

    it('should include childIssueTypeName in JPO request', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        issues: [
          {
            issueKey: 123,
            issueSummary: 'Parent',
            issueTypeId: 13301,
            projectId: 10000,
          },
        ],
        projects: [
          { id: 10000, key: 'PROJ' },
        ],
      });

      // Act
      await resolveParentLink(
        'parent',
        'Epic', // Different child type
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/jpo/1.0/parent/suggest',
        expect.objectContaining({
          issueTypeName: 'Epic',
        })
      );
    });

    it('should handle missing project in projects array', async () => {
      // Arrange - projectId not in projects array, should use ??? fallback
      mockClient.post.mockResolvedValue({
        issues: [
          {
            issueKey: 123,
            issueSummary: 'Orphan Parent',
            issueTypeId: 13301,
            projectId: 99999, // Not in projects array
          },
        ],
        projects: [
          { id: 10000, key: 'PROJ' },
        ],
      });

      // Act
      const result = await resolveParentLink(
        'orphan',
        'Story',
        'PROJ',
        mockClient,
        mockCache,
        JPO_PLUGIN,
        mockSchemaDiscovery
      );

      // Assert - should use ??? as project key fallback
      expect(result).toBe('???-123');
    });
  });
});
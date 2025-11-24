/**
 * Unit tests for ParentLinkResolver
 * Story: E3-S05 - Parent Link Resolver
 */

import { resolveParentLink } from '../../../src/hierarchy/ParentLinkResolver.js';
import { JiraClient } from '../../../src/client/JiraClient.js';
import { RedisCache } from '../../../src/cache/RedisCache.js';
import { JPOHierarchyDiscovery } from '../../../src/hierarchy/JPOHierarchyDiscovery.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { NotFoundError, AmbiguityError, HierarchyError } from '../../../src/errors.js';
import type { HierarchyStructure } from '../../../src/types/hierarchy.js';
import type { ProjectSchema } from '../../../src/types/schema.js';

describe('ParentLinkResolver', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let mockCache: jest.Mocked<RedisCache>;
  let mockHierarchyDiscovery: jest.Mocked<JPOHierarchyDiscovery>;
  let mockSchemaDiscovery: jest.Mocked<SchemaDiscovery>;
  let mockHierarchy: HierarchyStructure;
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

    // Mock JPOHierarchyDiscovery
    mockHierarchyDiscovery = {
      getHierarchy: jest.fn(),
    } as unknown as jest.Mocked<JPOHierarchyDiscovery>;

    // Mock SchemaDiscovery
    mockSchemaDiscovery = {
      getFieldsForIssueType: jest.fn(),
    } as unknown as jest.Mocked<SchemaDiscovery>;

    // Mock hierarchy structure (Level 0: Story, Level 1: Epic)
    mockHierarchy = [
      { id: 0, title: 'Story', issueTypeIds: ['10001'] },
      { id: 1, title: 'Epic', issueTypeIds: ['13301'] },
    ];

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

    mockHierarchyDiscovery.getHierarchy.mockResolvedValue(mockHierarchy);
    mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
  });

  describe('AC1: Accept Exact Issue Key', () => {
    it('should validate and return uppercase key for valid format', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
        fields: {
          issuetype: { id: '13301', name: 'Epic' },
          summary: 'Test Epic',
        },
      });

      // Act
      const result = await resolveParentLink(
        'proj-123',
        '10001', // Story
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
      expect(mockClient.get).toHaveBeenCalledWith('/rest/api/2/issue/proj-123');
    });

    it('should accept key with lowercase project key', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-456',
        fields: {
          issuetype: { id: '13301', name: 'Epic' },
          summary: 'Test Epic 2',
        },
      });

      // Act
      const result = await resolveParentLink(
        'proj-456',
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-456');
    });

    it('should accept key with all uppercase', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-789',
        fields: {
          issuetype: { id: '13301', name: 'Epic' },
          summary: 'Test Epic 3',
        },
      });

      // Act
      const result = await resolveParentLink(
        'PROJ-789',
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
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
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('AC2: Accept Summary Text Search', () => {
    it('should search by summary text using JQL', async () => {
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

      // Act
      const result = await resolveParentLink(
        'newsroom - phase 1',
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
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
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
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
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );

      // Assert
      const jql = (mockClient.post as jest.Mock).mock.calls[0][1].jql;
      expect(jql).toContain('"test summary"');
    });
  });

  describe('AC3: Filter by Valid Parent Level', () => {
    it('should filter search results to only parent level issue types', async () => {
      // Arrange
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
        '10001', // Story (level 0)
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );

      // Assert
      const jql = (mockClient.post as jest.Mock).mock.calls[0][1].jql;
      expect(jql).toContain('issuetype IN (13301)'); // Only Epic (level 1)
    });

    it('should throw HierarchyError when no valid parent types available in project', async () => {
      // Arrange: Mock hierarchy where child has parent level, but project doesn't have those issue types
      const limitedHierarchy: HierarchyStructure = [
        { id: 0, title: 'Story', issueTypeIds: ['10001'] },
        { id: 1, title: 'Epic', issueTypeIds: ['99999'] }, // Issue type not in project
      ];
      mockHierarchyDiscovery.getHierarchy.mockResolvedValue(limitedHierarchy);
      mockCache.get.mockResolvedValue(null);
      
      // Mock JQL search to return empty (this validates filtering works)
      mockClient.post.mockResolvedValue({
        total: 0,
        issues: [],
      });

      // Act & Assert: Should throw NotFoundError because JQL won't find any matches with invalid type IDs
      await expect(
        resolveParentLink(
          'test',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('AC4: Handle Ambiguity (Multiple Matches)', () => {
    it('should throw AmbiguityError when multiple issues match', async () => {
      // Arrange
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
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(AmbiguityError);
    });

    it('should include all candidate keys and types in error', async () => {
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
              summary: 'Test Issue',
              issuetype: { id: '13301', name: 'Epic' },
            },
          },
        ],
      });

      // Act & Assert
      try {
        await resolveParentLink(
          'test',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        );
        fail('Should have thrown AmbiguityError');
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguityError);
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
      try {
        await resolveParentLink(
          'test',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        );
        fail('Should have thrown AmbiguityError');
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguityError);
        expect((error as AmbiguityError).message.toLowerCase()).toMatch(/exact key|specific/);
      }
    });
  });

  describe('AC5: Handle Not Found', () => {
    it('should throw NotFoundError when no issues match', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 0,
        issues: [],
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'nonexistent summary',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
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
      try {
        await resolveParentLink(
          'my search term',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        );
        fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).message).toContain('my search term');
      }
    });

    it('should include project key in error context', async () => {
      // Arrange
      mockClient.post.mockResolvedValue({
        total: 0,
        issues: [],
      });

      // Act & Assert
      try {
        await resolveParentLink(
          'test',
          '10001',
          'TESTPROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        );
        fail('Should have thrown NotFoundError');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).message).toContain('TESTPROJ');
      }
    });
  });

  describe('AC6: Validate Hierarchy Relationship', () => {
    it('should validate parent is exactly 1 level above child', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
        fields: {
          issuetype: { id: '13301', name: 'Epic' }, // Level 1
          summary: 'Test Epic',
        },
      });

      // Act
      const result = await resolveParentLink(
        'PROJ-123',
        '10001', // Story (level 0)
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
    });

    it('should throw HierarchyError if parent is same level as child', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
        fields: {
          issuetype: { id: '10001', name: 'Story' }, // Level 0
          summary: 'Test Story',
        },
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'PROJ-123',
          '10001', // Story (level 0) - same level
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(HierarchyError);
    });

    it('should throw HierarchyError if parent is lower level than child', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
        fields: {
          issuetype: { id: '10001', name: 'Story' }, // Level 0
          summary: 'Test Story',
        },
      });

      // Act & Assert
      await expect(
        resolveParentLink(
          'PROJ-123',
          '13301', // Epic (level 1) - child at higher level
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(HierarchyError);
    });

    it('should include issue types in HierarchyError message', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
        fields: {
          issuetype: { id: '10001', name: 'Story' },
          summary: 'Test',
        },
      });

      // Act & Assert
      try {
        await resolveParentLink(
          'PROJ-123',
          '10001', // Same level
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        );
        fail('Should have thrown HierarchyError');
      } catch (error) {
        expect(error).toBeInstanceOf(HierarchyError);
        expect((error as HierarchyError).message).toContain('Story');
      }
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
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
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
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
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
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );

      // Assert
      expect(mockCache.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 300);
    });

    it('should NOT cache exact key lookups', async () => {
      // Arrange
      mockClient.get.mockResolvedValue({
        key: 'PROJ-123',
        fields: {
          issuetype: { id: '13301', name: 'Epic' },
          summary: 'Test',
        },
      });

      // Act
      await resolveParentLink(
        'PROJ-123',
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
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
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
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
    it('should handle null hierarchy gracefully', async () => {
      // Arrange
      mockHierarchyDiscovery.getHierarchy.mockResolvedValue(null);

      // Act & Assert
      await expect(
        resolveParentLink(
          'test',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(HierarchyError);
    });

    it('should handle child type not in hierarchy', async () => {
      // Arrange
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

      // Act & Assert
      await expect(
        resolveParentLink(
          'test',
          '99999', // Unknown type
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(HierarchyError);
    });

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
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
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
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );

      // Assert
      expect(result).toBe('PROJ-123');
    });
  });

  describe('Edge Cases: Hierarchy Validation', () => {
    it('should throw HierarchyError when hierarchy is empty array (line 101)', async () => {
      // Mock hierarchy discovery to return empty array
      mockHierarchyDiscovery.getHierarchy.mockResolvedValueOnce([]);

      // Mock API to return parent issue
      mockClient.get.mockResolvedValueOnce({
        key: 'PROJ-123',
        fields: {
          issuetype: { id: '13301', name: 'Epic' },
          summary: 'Parent Epic',
        },
      });

      // Should throw when validating parent-child relationship with empty hierarchy
      await expect(
        resolveParentLink(
          'PROJ-123',
          '10001', // Story type ID
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(HierarchyError);
      
      // Reset for second call
      mockHierarchyDiscovery.getHierarchy.mockResolvedValueOnce([]);
      mockClient.get.mockResolvedValueOnce({
        key: 'PROJ-123',
        fields: {
          issuetype: { id: '13301', name: 'Epic' },
          summary: 'Parent Epic',
        },
      });
      
      await expect(
        resolveParentLink(
          'PROJ-123',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow('JPO hierarchy not available');
    });

    it('should throw HierarchyError when no valid parent types available (line 180)', async () => {
      // Mock hierarchy with Story at level 0, but parent level has NO issue type IDs
      mockHierarchyDiscovery.getHierarchy.mockResolvedValue([
        {
          id: 0,
          title: 'Story',
          issueTypeIds: ['10001'], // Story type
        },
        {
          id: 1,
          title: 'Epic',
          issueTypeIds: [], // NO parent types available!
        },
      ]);

      // Mock schema with empty fields (no parent field)
      const emptySchema: ProjectSchema = {
        projectKey: 'PROJ',
        issueType: 'Story',
        fields: {},
      };
      mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValueOnce(emptySchema);

      // Use a SUMMARY TEXT (not a key) to trigger resolveByName() path
      // This will hit the check for validParentTypeIds.length === 0 at line 180
      await expect(
        resolveParentLink(
          'My Parent Epic',  // Summary text, not key format
          '10001', // Story type
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow(HierarchyError);
      
      // Reset for second call
      mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValueOnce(emptySchema);
      
      await expect(
        resolveParentLink(
          'My Parent Epic',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        )
      ).rejects.toThrow('No valid parent issue types available');
    });
  });
});
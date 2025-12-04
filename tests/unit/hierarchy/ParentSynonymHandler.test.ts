/**
 * Unit tests for Parent Synonym Handler (E3-S06)
 * Tests parent synonym detection and resolution in FieldResolver
 */

import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { ParentFieldDiscovery } from '../../../src/hierarchy/ParentFieldDiscovery.js';
import { JPOHierarchyDiscovery } from '../../../src/hierarchy/JPOHierarchyDiscovery.js';
import { JiraClient } from '../../../src/client/JiraClient.js';
import { RedisCache } from '../../../src/cache/RedisCache.js';
import { ConfigurationError } from '../../../src/errors/ConfigurationError.js';
import type { ProjectSchema } from '../../../src/types/schema.js';

// Mock dependencies
jest.mock('../../../src/schema/SchemaDiscovery');
jest.mock('../../../src/hierarchy/ParentFieldDiscovery');
jest.mock('../../../src/hierarchy/JPOHierarchyDiscovery');
jest.mock('../../../src/client/JiraClient');
jest.mock('../../../src/cache/RedisCache');
jest.mock('../../../src/hierarchy/ParentLinkResolver', () => ({
  resolveParentLink: jest.fn(),
}));

const { resolveParentLink } = require('../../../src/hierarchy/ParentLinkResolver');

describe('ParentSynonymHandler - FieldResolver Integration', () => {
  let resolver: FieldResolver;
  let mockSchemaDiscovery: jest.Mocked<SchemaDiscovery>;
  let mockParentFieldDiscovery: jest.Mocked<ParentFieldDiscovery>;
  let mockClient: jest.Mocked<JiraClient>;
  let mockCache: jest.Mocked<RedisCache>;
  let mockHierarchyDiscovery: jest.Mocked<JPOHierarchyDiscovery>;
  let mockSchema: ProjectSchema;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSchemaDiscovery = new SchemaDiscovery({} as any, {} as any, '') as jest.Mocked<SchemaDiscovery>;
    mockParentFieldDiscovery = {
      getParentFieldKey: jest.fn(),
      getParentFieldInfo: jest.fn().mockResolvedValue({ key: 'customfield_10014', name: 'Parent Link' }),
    } as any;
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
    } as any;
    mockCache = {} as any;
    mockHierarchyDiscovery = {} as any;

    resolver = new FieldResolver(
      mockSchemaDiscovery,
      mockParentFieldDiscovery,
      mockClient,
      mockCache,
      mockHierarchyDiscovery
    );

    // Mock schema with parent field
    mockSchema = {
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
        description: {
          id: 'description',
          name: 'Description',
          type: 'string',
          required: false,
          schema: { type: 'string', system: 'description' },
        },
        customfield_10014: {
          id: 'customfield_10014',
          name: 'Epic Link',
          type: 'any',
          required: false,
          schema: { type: 'any', custom: 'com.pyxis.greenhopper.jira:gh-epic-link', customId: 10014 },
        },
      },
    };

    mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValue(mockSchema);
    mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue('customfield_10014');
    resolveParentLink.mockResolvedValue('PROJ-123');
  });

  describe('AC1: Accept Parent Synonyms (Dynamic Discovery + Fallback)', () => {
    // With dynamic discovery, valid synonyms are:
    // 1. The discovered field name from getParentFieldInfo (e.g., "Parent Link")
    // 2. Case variations of the discovered name (e.g., "parent link", "PARENT LINK")  
    // 3. The universal "parent" keyword (always works)
    const synonyms = [
      'Parent',
      'parent',
      'PARENT',
      'Parent Link',    // Matches discovered field name
      'parent link',    // Case-insensitive match
      'PARENT LINK',    // Case-insensitive match
    ];

    synonyms.forEach((synonym) => {
      it(`should recognize "${synonym}" as parent synonym`, async () => {
        // Mock issue type lookup
        mockClient.get.mockResolvedValue({
          values: [{ id: '10001', name: 'Story' }],
        });

        const input = {
          Summary: 'Test story',
          [synonym]: 'PROJ-123',
        };

        const result = await resolver.resolveFields('PROJ', 'Story', input);

        expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenCalledWith('PROJ', 'Story');
        expect(mockClient.get).toHaveBeenCalledWith('/rest/api/2/issue/createmeta/PROJ/issuetypes');
        expect(resolveParentLink).toHaveBeenCalledWith(
          'PROJ-123',
          '10001', // issueTypeId
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        );
        expect(result).toEqual({
          summary: 'Test story',
          customfield_10014: 'PROJ-123',
        });
      });
    });

    it('should recognize typos via fuzzy matching', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });

      const input = {
        Summary: 'Test story',
        'Praent Link': 'PROJ-123', // Typo in "Parent Link"
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(result).toEqual({
        summary: 'Test story',
        customfield_10014: 'PROJ-123',
      });
    });
  });

  describe('AC2: Map to Discovered Parent Field', () => {
    it('should map valid synonyms to discovered field', async () => {
      // With dynamic discovery, valid synonyms are discovered field name + "parent" keyword
      const testCases = [
        { synonym: 'Parent', value: 'PROJ-100' },      // Universal keyword
        { synonym: 'Parent Link', value: 'PROJ-500' }, // Discovered field name
        { synonym: 'parent link', value: 'PROJ-600' }, // Case-insensitive
      ];

      for (const { synonym, value } of testCases) {
        jest.clearAllMocks();
        mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue({ key: 'customfield_10014', name: 'Parent Link' });
        mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue('customfield_10014');
        mockClient.get.mockResolvedValue({
          values: [{ id: '10001', name: 'Story' }],
        });
        resolveParentLink.mockResolvedValue(value);

        const input = { [synonym]: value };
        const result = await resolver.resolveFields('PROJ', 'Story', input);

        expect(result).toEqual({
          customfield_10014: value,
        });
        expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenCalledWith('PROJ', 'Story');
      }
    });

    it('should work regardless of actual field name in JIRA', async () => {
      // Different field name but same ID
      mockSchema.fields.customfield_10014.name = 'Parent Link';
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue('customfield_10014');
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('PROJ-123');

      const input = {
        Parent: 'PROJ-123', // User says "Parent"
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(result).toEqual({
        customfield_10014: 'PROJ-123', // Maps to discovered field
      });
    });

    it('should use parent field discovery when resolving parent synonym', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      // getParentFieldInfo is already mocked to return Parent Link
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue('customfield_10014');
      resolveParentLink.mockResolvedValue('PROJ-123');

      const input = {
        'Parent Link': 'PROJ-123', // Use the discovered field name
      };

      await resolver.resolveFields('PROJ', 'Story', input);

      expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenCalledWith('PROJ', 'Story');
      expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC3: Resolve Parent Value', () => {
    it('should resolve exact issue key', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('PROJ-1234');

      const input = {
        Parent: 'PROJ-1234',
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(resolveParentLink).toHaveBeenCalledWith(
        'PROJ-1234',
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );
      expect(result.customfield_10014).toBe('PROJ-1234');
    });

    it('should resolve summary search', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('PROJ-789');

      const input = {
        'Parent Link': 'newsroom - phase 1', // Use discovered field name
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(resolveParentLink).toHaveBeenCalledWith(
        'newsroom - phase 1',
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );
      expect(result.customfield_10014).toBe('PROJ-789');
    });

    it('should work with discovered field name and parent keyword', async () => {
      resolveParentLink.mockResolvedValue('PROJ-1234');

      // Now only the discovered field name ("Parent Link") and "parent" keyword work
      const synonyms = ['Parent', 'Parent Link', 'parent link'];

      for (const synonym of synonyms) {
        jest.clearAllMocks();
        mockClient.get.mockResolvedValue({
          values: [{ id: '10001', name: 'Story' }],
        });
        mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue({ key: 'customfield_10014', name: 'Parent Link' });
        resolveParentLink.mockResolvedValue('PROJ-1234');

        const input = { [synonym]: 'PROJ-1234' };
        const result = await resolver.resolveFields('PROJ', 'Story', input);

        expect(resolveParentLink).toHaveBeenCalledWith(
          'PROJ-1234',
          '10001',
          'PROJ',
          mockClient,
          mockCache,
          mockHierarchyDiscovery,
          mockSchemaDiscovery
        );
        expect(result.customfield_10014).toBe('PROJ-1234');
      }
    });
  });

  describe('AC4: Validate Hierarchy at Any Level', () => {
    it('should pass child issue type ID to resolveParentLink for validation', async () => {
      // Mock issue type lookup
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });

      const input = {
        Parent: 'EPIC-123',
      };

      await resolver.resolveFields('PROJ', 'Story', input);

      // resolveParentLink receives issueTypeId for hierarchy validation
      expect(resolveParentLink).toHaveBeenCalledWith(
        'EPIC-123',
        '10001', // Child issue type ID
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );
    });

    it('should work for Subtask → Story hierarchy', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '16101', name: 'Sub-task' }],
      });
      resolveParentLink.mockResolvedValue('STORY-789');

      const input = {
        Parent: 'STORY-789',
      };

      const result = await resolver.resolveFields('PROJ', 'Sub-task', input);

      expect(resolveParentLink).toHaveBeenCalledWith(
        'STORY-789',
        '16101',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );
      expect(result.customfield_10014).toBe('STORY-789');
    });

    it('should work for Story → Epic hierarchy', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('EPIC-456');

      const input = {
        'Parent Link': 'EPIC-456', // Use discovered field name
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(resolveParentLink).toHaveBeenCalledWith(
        'EPIC-456',
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );
      expect(result.customfield_10014).toBe('EPIC-456');
    });

    it('should work for Epic → Phase hierarchy', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '13301', name: 'Epic' }],
      });
      resolveParentLink.mockResolvedValue('PHASE-789');

      const input = {
        Parent: 'PHASE-789',
      };

      const result = await resolver.resolveFields('PROJ', 'Epic', input);

      expect(resolveParentLink).toHaveBeenCalledWith(
        'PHASE-789',
        '13301',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );
      expect(result.customfield_10014).toBe('PHASE-789');
    });

    it('should work for Phase → Container hierarchy', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '13401', name: 'Phase' }],
      });
      resolveParentLink.mockResolvedValue('CONTAINER-012');

      const input = {
        Parent: 'CONTAINER-012',
      };

      const result = await resolver.resolveFields('PROJ', 'Phase', input);

      expect(resolveParentLink).toHaveBeenCalledWith(
        'CONTAINER-012',
        '13401',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );
      expect(result.customfield_10014).toBe('CONTAINER-012');
    });
  });

  describe('AC5: Handle Missing Parent Field', () => {
    it('should throw ConfigurationError when parent field not found', async () => {
      mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue(null);
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue(null);

      const input = {
        Parent: 'PROJ-123',
      };

      await expect(resolver.resolveFields('PROJ', 'Story', input)).rejects.toThrow(ConfigurationError);
      await expect(resolver.resolveFields('PROJ', 'Story', input)).rejects.toThrow(
        'Project PROJ does not have a parent field configured'
      );
    });

    it('should include project key in error message', async () => {
      // When getParentFieldInfo returns null, only "parent" is a valid synonym
      mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue(null);
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue(null);

      const input = {
        'Parent': 'SIMPLE-123', // Changed from 'Epic Link' to 'Parent' which is always valid
      };

      try {
        await resolver.resolveFields('SIMPLE', 'Story', input);
        fail('Should have thrown ConfigurationError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(error.message).toContain('SIMPLE');
      }
    });

    it('should suggest checking JIRA configuration', async () => {
      mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue(null);
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue(null);

      const input = {
        Parent: 'PROJ-123',
      };

      try {
        await resolver.resolveFields('PROJ', 'Story', input);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConfigurationError);
        // Error should be actionable
        expect(error.message).toBeTruthy();
      }
    });

    it('should throw ConfigurationError when no parent field configured and using "parent" keyword', async () => {
      // When getParentFieldInfo returns null, only "parent" is recognized as a synonym
      // And when getParentFieldKey also returns null, it should throw ConfigurationError
      mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue(null);
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue(null);

      const input = { 'Parent': 'PROJ-123' };

      await expect(resolver.resolveFields('PROJ', 'Story', input)).rejects.toThrow(
        ConfigurationError
      );
    });

    it('should use discovered field name as synonym when available', async () => {
      // Mock returns "Epic Link" as the discovered field name
      mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue({ key: 'customfield_10014', name: 'Epic Link' });
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue('customfield_10014');
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('PROJ-123');

      // "Epic Link" should now work because it matches the discovered field name
      const input = { 'Epic Link': 'PROJ-123' };
      const result = await resolver.resolveFields('PROJ', 'Story', input);
      
      expect(result.customfield_10014).toBe('PROJ-123');
    });
  });

  describe('AC6: Integration with Field Resolver', () => {
    it('should work with standard field conversion flow', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('PROJ-123');

      const input = {
        Summary: 'New story',
        Description: 'Story description',
        Parent: 'PROJ-123',
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(result).toEqual({
        summary: 'New story',
        description: 'Story description',
        customfield_10014: 'PROJ-123',
      });
    });

    it('should not require special handling by end user', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('PROJ-456');

      // User provides natural field names
      const input = {
        Project: 'PROJ',
        'Issue Type': 'Story',
        Summary: 'Login feature',
        Parent: 'PROJ-456',
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(result).toEqual({
        project: { key: 'PROJ' },
        issuetype: { name: 'Story' },
        summary: 'Login feature',
        customfield_10014: 'PROJ-456',
      });
    });

    it('should work alongside other custom fields', async () => {
      mockSchema.fields.customfield_10024 = {
        id: 'customfield_10024',
        name: 'Story Points',
        type: 'number',
        required: false,
        schema: { type: 'number', custom: 'float', customId: 10024 },
      };
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('EPIC-789');

      const input = {
        Summary: 'Test story',
        'Story Points': 5,
        'Epic Link': 'EPIC-789',
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(result).toEqual({
        summary: 'Test story',
        customfield_10024: 5,
        customfield_10014: 'EPIC-789',
      });
    });

    it('should maintain backward compatibility with field ID usage', async () => {
      // User can still use field ID directly if they want
      const input = {
        Summary: 'Test',
        customfield_10014: 'PROJ-999',
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      // Direct field ID should pass through (not go through synonym handler)
      expect(result).toEqual({
        summary: 'Test',
        customfield_10014: 'PROJ-999',
      });
      expect(mockParentFieldDiscovery.getParentFieldKey).not.toHaveBeenCalled();
      expect(resolveParentLink).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace in synonym names', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });
      resolveParentLink.mockResolvedValue('PROJ-123');

      const input = {
        '  Parent  ': 'PROJ-123',
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(result.customfield_10014).toBe('PROJ-123');
    });

    it('should handle mixed case in parent synonyms', async () => {
      resolveParentLink.mockResolvedValue('PROJ-456');

      // Now only the discovered field name ("Parent Link") and "parent" keyword work
      // Mixed case variations of these should still match
      const testCases = ['pArEnT LiNk', 'PARENT LINK', 'parent'];

      for (const synonym of testCases) {
        jest.clearAllMocks();
        mockClient.get.mockResolvedValue({
          values: [{ id: '10001', name: 'Story' }],
        });
        mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue({ key: 'customfield_10014', name: 'Parent Link' });
        resolveParentLink.mockResolvedValue('PROJ-456');

        const input = { [synonym]: 'PROJ-456' };
        const result = await resolver.resolveFields('PROJ', 'Story', input);

        expect(result.customfield_10014).toBe('PROJ-456');
      }
    });

    it('should not match partial synonym names', async () => {
      // getParentFieldInfo returns Parent Link, so "Par" shouldn't match
      mockParentFieldDiscovery.getParentFieldInfo.mockResolvedValue({ key: 'customfield_10014', name: 'Parent Link' });
      
      const input = {
        Par: 'PROJ-123', // Not a valid synonym - too short for fuzzy match
        summary: 'Valid field', // Add valid field
      };

      // Should try normal field resolution, not synonym handling
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await resolver.resolveFields('PROJ', 'Story', input);
      
      // Should skip unknown field with warning
      expect(Object.values(result)).not.toContain('PROJ-123');
      // Should not call parent field resolution (getParentFieldKey is only called when isParentSynonym matches)
      expect(mockParentFieldDiscovery.getParentFieldKey).not.toHaveBeenCalled();
      // Should warn about unknown field
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Field 'Par' not found")
      );
      
      consoleSpy.mockRestore();
    });

    it('should pass dependencies to resolveParentLink', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });

      const input = {
        Parent: 'PROJ-123',
      };

      await resolver.resolveFields('PROJ', 'Story', input);

      expect(resolveParentLink).toHaveBeenCalledWith(
        'PROJ-123',
        '10001',
        'PROJ',
        mockClient,
        mockCache,
        mockHierarchyDiscovery,
        mockSchemaDiscovery
      );
    });

    it('should ignore blank or null parent values', async () => {
      mockClient.get.mockResolvedValue({
        values: [{ id: '10001', name: 'Story' }],
      });

      const input = {
        Summary: 'Child issue',
        Parent: '   ', // blank string
      };

      const result = await resolver.resolveFields('PROJ', 'Story', input);

      expect(result).toEqual({
        summary: 'Child issue',
      });
      expect(resolveParentLink).not.toHaveBeenCalled();

      const resultWithNull = await resolver.resolveFields('PROJ', 'Story', {
        Summary: 'Child issue 2',
        Parent: null,
      });

      expect(resultWithNull).toEqual({
        summary: 'Child issue 2',
      });
      expect(resolveParentLink).not.toHaveBeenCalled();
    });
  });
});

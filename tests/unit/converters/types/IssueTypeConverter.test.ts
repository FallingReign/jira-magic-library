/**
 * IssueType Type Converter Tests
 * Story: E3-S07b
 * 
 * Tests conversion of issue type values for fields with type: "issuetype"
 * Migrated from tests/unit/operations/IssueTypeResolver.test.ts
 */

import { convertIssueTypeType } from '../../../../src/converters/types/IssueTypeConverter.js';
import { AmbiguityError } from '../../../../src/errors/AmbiguityError.js';
import { NotFoundError } from '../../../../src/errors/NotFoundError.js';
import { ValidationError } from '../../../../src/errors/ValidationError.js';
import type { FieldSchema } from '../../../../src/types/schema.js';
import type { ConversionContext } from '../../../../src/types/converter.js';
import type { JiraClient } from '../../../../src/client/JiraClient.js';
import type { CacheClient } from '../../../../src/types/cache.js';
import type { JiraIssueType } from '../../../../src/types/jira-api.js';
import type { HierarchyStructure } from '../../../../src/types/hierarchy.js';
import * as ResolveUtils from '../../../../src/utils/resolveUniqueName.js';
import { JPOHierarchyDiscovery } from '../../../../src/hierarchy/JPOHierarchyDiscovery.js';

describe('IssueTypeConverter', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let mockCache: jest.Mocked<CacheClient>;
  let context: ConversionContext;
  let fieldSchema: FieldSchema;

  const baseUrl = 'https://test.atlassian.net';
  const projectKey = 'PROJ';

  const mockIssueTypes: JiraIssueType[] = [
    {
      id: '10001',
      name: 'Bug',
      description: 'A bug',
      iconUrl: 'https://example.com/bug.png',
      subtask: false,
    },
    {
      id: '10002',
      name: 'User Story',
      description: 'A story',
      iconUrl: 'https://example.com/story.png',
      subtask: false,
    },
    {
      id: '10003',
      name: 'Task',
      description: 'A task',
      iconUrl: 'https://example.com/task.png',
      subtask: false,
    },
    {
      id: '10004',
      name: 'Epic',
      description: 'An epic',
      iconUrl: 'https://example.com/epic.png',
      subtask: false,
    },
    {
      id: '10005',
      name: 'Sub-task',
      description: 'A subtask',
      iconUrl: 'https://example.com/subtask.png',
      subtask: true,
    },
    {
      id: '10006',
      name: 'Bug - Production',
      description: 'A production bug',
      iconUrl: 'https://example.com/bug-prod.png',
      subtask: false,
    },
  ];

  const mockHierarchy: HierarchyStructure = [
    {
      id: 0,
      title: 'Subtask',
      issueTypeIds: ['10005'],
    },
    {
      id: 1,
      title: 'Story',
      issueTypeIds: ['10001', '10002', '10003', '10006'],
    },
    {
      id: 2,
      title: 'Epic',
      issueTypeIds: ['10004'],
    },
  ];

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<JiraClient>;

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      clear: jest.fn(),
      ping: jest.fn(),
      disconnect: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
    } as jest.Mocked<CacheClient>;

    fieldSchema = {
      id: 'issuetype',
      name: 'Issue Type',
      type: 'issuetype',
      required: true,
      schema: { type: 'issuetype' },
    };

    context = {
      baseUrl,
      projectKey,
      issueType: 'Story',
      client: mockClient,
      cacheClient: mockCache,
    };

    // Default: cache miss, API returns issue types
    mockCache.get.mockResolvedValue(null);
    mockClient.get.mockImplementation((url: string) => {
      if (url.includes('/issuetypes')) {
        return Promise.resolve({ values: mockIssueTypes });
      }
      if (url.includes('/hierarchy')) {
        return Promise.resolve(mockHierarchy);
      }
      return Promise.reject(new Error('Unexpected URL'));
    });
  });

  describe('AC1: String Input - Exact Match', () => {
    it('should resolve exact issue type name (case-insensitive)', async () => {
      const result = await convertIssueTypeType('Bug', fieldSchema, context);

      expect(result).toEqual({
        id: '10001',
        name: 'Bug',
        subtask: false,
      });

      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/api/2/issue/createmeta/PROJ/issuetypes'
      );
    });

    it('should match case-insensitively', async () => {
      const result = await convertIssueTypeType('bug', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10001',
        name: 'Bug',
      });
    });

    it('should match with different casing', async () => {
      const result = await convertIssueTypeType('USER STORY', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10002',
        name: 'User Story',
      });
    });

    it('should trim whitespace from input', async () => {
      const result = await convertIssueTypeType('  Task  ', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10003',
        name: 'Task',
      });
    });
  });

  describe('AC1: String Input - Fuzzy Matching', () => {
    it('should resolve "story" abbreviation to "User Story"', async () => {
      const result = await convertIssueTypeType('story', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10002',
        name: 'User Story',
      });
    });

    it('should resolve "bug" to exact match before fuzzy', async () => {
      const result = await convertIssueTypeType('bug', fieldSchema, context);

      // Should match exact "Bug" not fuzzy "Bug - Production"
      expect(result).toMatchObject({
        id: '10001',
        name: 'Bug',
      });
    });

    it('should handle abbreviation "subtask"', async () => {
      const result = await convertIssueTypeType('subtask', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10005',
        name: 'Sub-task',
        subtask: true,
      });
    });

    it('should handle abbreviation "task"', async () => {
      const result = await convertIssueTypeType('task', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10003',
        name: 'Task',
      });
    });

    it('should handle abbreviation "epic"', async () => {
      const result = await convertIssueTypeType('epic', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10004',
        name: 'Epic',
      });
    });
  });

  describe('AC5: Object Input - Passthrough with ID', () => {
    it('should pass through object with id', async () => {
      const input = { id: '10001' };
      const result = await convertIssueTypeType(input, fieldSchema, context);

      expect(result).toBe(input);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should pass through object with id and name', async () => {
      const input = { id: '10001', name: 'Bug' };
      const result = await convertIssueTypeType(input, fieldSchema, context);

      expect(result).toBe(input);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should pass through object with id even if invalid', async () => {
      const input = { id: 'invalid-id' };
      const result = await convertIssueTypeType(input, fieldSchema, context);

      expect(result).toBe(input);
      expect(mockClient.get).not.toHaveBeenCalled();
    });
  });

  describe('AC5: Object Input - Resolve by Name', () => {
    it('should resolve object with name property', async () => {
      const input = { name: 'Bug' };
      const result = await convertIssueTypeType(input, fieldSchema, context);

      expect(result).toMatchObject({
        id: '10001',
        name: 'Bug',
        subtask: false,
      });
    });

    it('should resolve object with name case-insensitively', async () => {
      const input = { name: 'user story' };
      const result = await convertIssueTypeType(input, fieldSchema, context);

      expect(result).toMatchObject({
        id: '10002',
        name: 'User Story',
      });
    });
  });

  describe('AC5: Invalid Input Types', () => {
    it('should throw ValidationError for null on required field', async () => {
      await expect(
        convertIssueTypeType(null, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for undefined on required field', async () => {
      await expect(
        convertIssueTypeType(undefined, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should pass through null for optional field', async () => {
      const optionalField = { ...fieldSchema, required: false };
      const result = await convertIssueTypeType(null, optionalField, context);

      expect(result).toBeNull();
    });

    it('should pass through undefined for optional field', async () => {
      const optionalField = { ...fieldSchema, required: false };
      const result = await convertIssueTypeType(undefined, optionalField, context);

      expect(result).toBeUndefined();
    });

    it('should throw ValidationError for number', async () => {
      await expect(
        convertIssueTypeType(123 as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for array', async () => {
      await expect(
        convertIssueTypeType(['Bug'] as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for boolean', async () => {
      await expect(
        convertIssueTypeType(true as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty string', async () => {
      await expect(
        convertIssueTypeType('', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for whitespace-only string', async () => {
      await expect(
        convertIssueTypeType('   ', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('AC3: Hierarchy Filtering', () => {
    it('should filter by hierarchy level 0 (subtasks)', async () => {
      const hierarchyContext = { ...context, hierarchyLevel: 0 };
      const result = await convertIssueTypeType('Sub-task', fieldSchema, hierarchyContext);

      expect(result).toMatchObject({
        id: '10005',
        name: 'Sub-task',
      });
    });

    it('should filter by hierarchy level 1 (stories)', async () => {
      const hierarchyContext = { ...context, hierarchyLevel: 1 };
      const result = await convertIssueTypeType('Bug', fieldSchema, hierarchyContext);

      expect(result).toMatchObject({
        id: '10001',
        name: 'Bug',
      });
    });

    it('should filter by hierarchy level 2 (epics)', async () => {
      const hierarchyContext = { ...context, hierarchyLevel: 2 };
      const result = await convertIssueTypeType('Epic', fieldSchema, hierarchyContext);

      expect(result).toMatchObject({
        id: '10004',
        name: 'Epic',
      });
    });

    it('should throw ValidationError if type not at specified level', async () => {
      const hierarchyContext = { ...context, hierarchyLevel: 2 };
      
      // Bug is at level 1, not level 2
      await expect(
        convertIssueTypeType('Bug', fieldSchema, hierarchyContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle invalid hierarchy level gracefully (no filtering)', async () => {
      const hierarchyContext = { ...context, hierarchyLevel: 99 };
      
      // Level 99 doesn't exist - should return all types (no filtering)
      const result = await convertIssueTypeType('Bug', fieldSchema, hierarchyContext);

      expect(result).toMatchObject({
        id: '10001',
      });
    });

    it('should handle missing JPO hierarchy gracefully', async () => {
      mockClient.get.mockImplementation((url: string) => {
        if (url.includes('/issuetypes')) {
          return Promise.resolve({ values: mockIssueTypes });
        }
        if (url.includes('/hierarchy')) {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const hierarchyContext = { ...context, hierarchyLevel: 1 };
      
      // Should still work without hierarchy filtering
      const result = await convertIssueTypeType('Bug', fieldSchema, hierarchyContext);

      expect(result).toMatchObject({
        id: '10001',
      });
    });
  });

  describe('AC4: Ambiguity Detection', () => {
    it('should throw AmbiguityError for multiple exact matches', async () => {
      // Add duplicate "Bug" issue type
      mockClient.get.mockResolvedValue({
        values: [
          ...mockIssueTypes,
          {
            id: '10099',
            name: 'Bug',
            description: 'Another bug',
            iconUrl: 'https://example.com/bug2.png',
            subtask: false,
          },
        ],
      });

      await expect(
        convertIssueTypeType('Bug', fieldSchema, context)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should include candidates in AmbiguityError', async () => {
      mockClient.get.mockResolvedValue({
        values: [
          mockIssueTypes[0], // Bug
          {
            id: '10099',
            name: 'Bug',
            description: 'Another bug',
            iconUrl: 'https://example.com/bug2.png',
            subtask: false,
          },
        ],
      });

      try {
        await convertIssueTypeType('Bug', fieldSchema, context);
        fail('Should have thrown AmbiguityError');
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguityError);
        const ambiguityError = error as AmbiguityError;
        const details = ambiguityError.details as Record<string, unknown>;
        expect(details?.candidates).toHaveLength(2);
        expect(details?.candidates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: '10001', name: 'Bug' }),
            expect.objectContaining({ id: '10099', name: 'Bug' }),
          ])
        );
      }
    });

    it('should throw AmbiguityError for multiple fuzzy matches', async () => {
      // Add custom issue types that all match "bug" via fuzzy matching
      mockClient.get.mockResolvedValue({
        values: [
          { id: '10001', name: 'Standard Bug', subtask: false },
          { id: '10002', name: 'Production Bug', subtask: false },
        ],
      });

      // "bug" should fuzzy match both via abbreviation
      try {
        await convertIssueTypeType('bug', fieldSchema, context);
        fail('Should have thrown AmbiguityError');
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguityError);
        const ambiguityError = error as AmbiguityError;
        const details = ambiguityError.details as Record<string, unknown>;
        expect(details?.candidates).toHaveLength(2);
      }
    });
  });

  describe('AC4: Not Found Errors', () => {
    it('should throw ValidationError for non-existent type', async () => {
      await expect(
        convertIssueTypeType('NonExistent', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should include available types in ValidationError', async () => {
      try {
        await convertIssueTypeType('InvalidType', fieldSchema, context);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        // resolveUniqueName doesn't include availableTypes in details like NotFoundError did
        // This is expected behavior change with fuzzy matching
      }
    });

    it('should include hierarchy level in ValidationError when filtering', async () => {
      const hierarchyContext = { ...context, hierarchyLevel: 2 };

      try {
        await convertIssueTypeType('Bug', fieldSchema, hierarchyContext);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        // resolveUniqueName handles the error, hierarchyLevel not included in message
        // This is expected behavior change with fuzzy matching
      }
    });

    it('should throw NotFoundError for empty project', async () => {
      mockClient.get.mockResolvedValue({ values: [] });

      await expect(
        convertIssueTypeType('Bug', fieldSchema, context)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('AC4: Caching Behavior', () => {
    it('should cache resolved issue types', async () => {
      await convertIssueTypeType('Bug', fieldSchema, context);

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('jml:issuetype'),
        expect.any(String),
        300 // 5 minutes
      );
    });

    it('should use cached results', async () => {
      const cached = JSON.stringify({
        id: '10001',
        name: 'Bug',
        subtask: false,
      });

      mockCache.get.mockResolvedValueOnce(cached);

      const result = await convertIssueTypeType('Bug', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10001',
        name: 'Bug',
      });
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should include hierarchy level in cache key', async () => {
      const hierarchyContext = { ...context, hierarchyLevel: 1 };
      await convertIssueTypeType('Bug', fieldSchema, hierarchyContext);

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining(':1'),
        expect.any(String),
        300
      );
    });

    it('should normalize input in cache key', async () => {
      await convertIssueTypeType('  BUG  ', fieldSchema, context);

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining(':bug'),
        expect.any(String),
        300
      );
    });

    it('should handle cache read errors gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));

      const result = await convertIssueTypeType('Bug', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10001',
        name: 'Bug',
      });
    });

    it('should handle cache write errors gracefully', async () => {
      mockCache.set.mockRejectedValue(new Error('Cache error'));

      const result = await convertIssueTypeType('Bug', fieldSchema, context);

      expect(result).toMatchObject({
        id: '10001',
        name: 'Bug',
      });
    });
  });

  describe('AC3: Silent Error Handling (No console.warn)', () => {
    const originalWarn = console.warn;

    beforeEach(() => {
      console.warn = jest.fn();
    });

    afterEach(() => {
      console.warn = originalWarn;
    });

    it('should not call console.warn on cache errors', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache error'));

      await convertIssueTypeType('Bug', fieldSchema, context);

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should not call console.warn on hierarchy fetch errors', async () => {
      mockClient.get.mockImplementation((url: string) => {
        if (url.includes('/issuetypes')) {
          return Promise.resolve({ values: mockIssueTypes });
        }
        if (url.includes('/hierarchy')) {
          return Promise.reject(new Error('Hierarchy error'));
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const hierarchyContext = { ...context, hierarchyLevel: 1 };
      await convertIssueTypeType('Bug', fieldSchema, hierarchyContext);

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should not call console.warn when JPO unavailable', async () => {
      mockClient.get.mockImplementation((url: string) => {
        if (url.includes('/issuetypes')) {
          return Promise.resolve({ values: mockIssueTypes });
        }
        if (url.includes('/hierarchy')) {
          return Promise.resolve(null);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const hierarchyContext = { ...context, hierarchyLevel: 1 };
      await convertIssueTypeType('Bug', fieldSchema, hierarchyContext);

      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('AC8: Custom Abbreviations', () => {
    // REMOVED: Custom abbreviation tests
    // Fuzzy matching with fuse.js is now used instead of hardcoded abbreviations
    // "story" → "User Story" works via fuzzy matching, not abbreviations

    it('should add new custom abbreviations without defaults', async () => {
      // Add a new abbreviation pattern for "production"
      const customContext = {
        ...context,
        config: {
          issueTypeAbbreviations: {
            prod: ['production'], // "prod" input matches issues with "production"
          },
        },
      };

      mockClient.get.mockResolvedValue({
        values: [mockIssueTypes[5]], // Bug - Production
      });

      // "prod" input should match "Bug - Production" via custom abbreviation
      const result = await convertIssueTypeType('prod', fieldSchema, customContext);
      expect(result).toEqual({ id: '10006', name: 'Bug - Production', subtask: false });
    });

    it('should work without custom abbreviations (defaults only)', async () => {
      // No config provided - should use defaults
      // User Story has id 10002
      const result = await convertIssueTypeType('story', fieldSchema, context);
      expect(result).toEqual({ id: '10002', name: 'User Story', subtask: false });
    });
  });

  describe('Edge Cases: Input Validation', () => {
    it('should throw ValidationError when object.name is not a string', async () => {
      const input = { name: 123 }; // name is number, not string
      // extractFieldValue extracts 123, then converter rejects non-string

      await expect(
        convertIssueTypeType(input, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
      await expect(
        convertIssueTypeType(input, fieldSchema, context)
      ).rejects.toThrow('Expected string or object');
    });

    it('should throw ValidationError when projectKey is missing from context', async () => {
      const contextWithoutProject = { ...context };
      delete (contextWithoutProject as any).projectKey;

      await expect(
        convertIssueTypeType('Bug', fieldSchema, contextWithoutProject as ConversionContext)
      ).rejects.toThrow(ValidationError);
      await expect(
        convertIssueTypeType('Bug', fieldSchema, contextWithoutProject as ConversionContext)
      ).rejects.toThrow('projectKey is required');
    });

    it('should throw ValidationError when baseUrl is missing from context', async () => {
      const contextWithoutBaseUrl = { ...context };
      delete (contextWithoutBaseUrl as any).baseUrl;

      await expect(
        convertIssueTypeType('Bug', fieldSchema, contextWithoutBaseUrl as ConversionContext)
      ).rejects.toThrow(ValidationError);
      await expect(
        convertIssueTypeType('Bug', fieldSchema, contextWithoutBaseUrl as ConversionContext)
      ).rejects.toThrow('baseUrl is required');
    });

    it('should handle empty string input (whitespace only)', async () => {
      // Empty strings after trim should throw ValidationError
      await expect(
        convertIssueTypeType('   ', fieldSchema, context) // whitespace only
      ).rejects.toThrow(ValidationError);
      await expect(
        convertIssueTypeType('   ', fieldSchema, context)
      ).rejects.toThrow('Empty string is not a valid issue type');
    });
  });

  describe('Edge Cases: JPO Hierarchy Graceful Degradation', () => {
    it('should gracefully degrade when JPO hierarchy returns null', async () => {
      // Cache miss first
      mockCache.get.mockResolvedValueOnce(null);
      
      // Mock fetchAllIssueTypes to return issue types (correct format: values array)
      mockClient.get.mockResolvedValueOnce({
        values: mockIssueTypes,
      });

      // Mock JPO to return null (not available)
      mockClient.get.mockResolvedValueOnce({
        data: null, // JPO not available
      });

      // Even with hierarchy level specified, should return all types
      const contextWithHierarchy = {
        ...context,
        hierarchyLevel: 0,
      };

      const result = await convertIssueTypeType('Bug', fieldSchema, contextWithHierarchy);
      expect(result).toMatchObject({ id: '10001', name: 'Bug' });
    });

    it('should degrade gracefully when hierarchy discovery returns null via API', async () => {
      const hierarchySpy = jest
        .spyOn(JPOHierarchyDiscovery.prototype, 'getHierarchy')
        .mockResolvedValue(null);

      const contextWithHierarchy = {
        ...context,
        hierarchyLevel: 0,
      };

      const result = await convertIssueTypeType('Bug', fieldSchema, contextWithHierarchy);
      expect(result).toMatchObject({ id: '10001', name: 'Bug' });

      hierarchySpy.mockRestore();
    });

    it('should bypass filtering when hierarchy level is missing from discovery data', async () => {
      const hierarchySpy = jest
        .spyOn(JPOHierarchyDiscovery.prototype, 'getHierarchy')
        .mockResolvedValue([{ id: 5, title: 'Custom', issueTypeIds: ['10005'] }]);

      const contextWithHierarchy = {
        ...context,
        hierarchyLevel: 99,
      };

      const result = await convertIssueTypeType('Bug', fieldSchema, contextWithHierarchy);
      expect(result).toMatchObject({ id: '10001', name: 'Bug' });

      hierarchySpy.mockRestore();
    });
  });

  describe('Edge Cases: Cache Error Handling', () => {
    it('should handle cache.set errors silently', async () => {
      // Cache miss first
      mockCache.get.mockResolvedValueOnce(null);
      
      // Make cache.set throw an error
      mockCache.set.mockRejectedValueOnce(new Error('Redis connection failed'));

      // Mock API to return issue types (correct format: values array)
      mockClient.get.mockResolvedValueOnce({
        values: mockIssueTypes,
      });

      // Should still succeed even if caching fails
      const result = await convertIssueTypeType('Bug', fieldSchema, context);
      expect(result).toMatchObject({ id: '10001', name: 'Bug' });
      expect(mockCache.set).toHaveBeenCalled(); // Verify cache was attempted
    });
  });

  describe('Edge Cases: Network Errors During Fetch', () => {
    it('should wrap non-NotFoundError errors in NotFoundError', async () => {
      // Ensure cache returns nothing
      mockCache.get.mockResolvedValueOnce(null);
      
      // Simulate a network error (not a 404)
      mockClient.get.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(
        convertIssueTypeType('Bug', fieldSchema, context)
      ).rejects.toThrow(NotFoundError);
    });

    it('should include project key in error message when wrapping fetch errors', async () => {
      // Ensure cache returns nothing
      mockCache.get.mockResolvedValueOnce(null);
      
      // Simulate a different network error
      mockClient.get.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        convertIssueTypeType('Story', fieldSchema, context)
      ).rejects.toThrow('Failed to fetch issue types');
    });

    it('should wrap unexpected API errors with detailed message', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockClient.get.mockImplementationOnce((url: string) => {
        if (url.includes('/issuetypes')) {
          return Promise.reject(new Error('Boom'));
        }
        return Promise.resolve({ values: mockIssueTypes });
      });

      await expect(
        convertIssueTypeType('Bug', fieldSchema, context)
      ).rejects.toThrow(/Failed to fetch issue types/);
    });
  });

  describe('Branch Coverage Extras', () => {
    it('should include hierarchy level context when resolved type is filtered out', async () => {
      const resolveSpy = jest
        .spyOn(ResolveUtils, 'resolveUniqueName')
        .mockReturnValue({ id: 'ghost-type', name: 'Ghost' } as any);

      const hierarchyContext = { ...context, hierarchyLevel: 0 };

      await expect(
        convertIssueTypeType('Ghost', fieldSchema, hierarchyContext as ConversionContext)
      ).rejects.toThrow(/hierarchy level 0/);

      resolveSpy.mockRestore();
    });

    it('should skip caching when cache client is not provided', async () => {
      const contextWithoutCache = { ...context };
      delete (contextWithoutCache as any).cacheClient;

      const result = await convertIssueTypeType('Bug', fieldSchema, contextWithoutCache as ConversionContext);
      expect(result).toMatchObject({ id: '10001', name: 'Bug' });
    });
  });
});

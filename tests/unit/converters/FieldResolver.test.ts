import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { ConfigurationError } from '../../../src/errors/ConfigurationError.js';
import { ProjectSchema } from '../../../src/types/schema.js';

// Mock SchemaDiscovery
jest.mock('../../../src/schema/SchemaDiscovery');

describe('FieldResolver', () => {
  let resolver: FieldResolver;
  let mockSchemaDiscovery: jest.Mocked<SchemaDiscovery>;
  let mockSchema: ProjectSchema;

  beforeEach(() => {
    mockSchemaDiscovery = new SchemaDiscovery({} as any, {} as any, '') as jest.Mocked<SchemaDiscovery>;
    resolver = new FieldResolver(mockSchemaDiscovery);

    // Mock schema with common fields
    mockSchema = {
      projectKey: 'ENG',
      issueType: 'Bug',
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
        priority: {
          id: 'priority',
          name: 'Priority',
          type: 'priority',
          required: false,
          schema: { type: 'priority', system: 'priority' },
        },
        customfield_10024: {
          id: 'customfield_10024',
          name: 'Story Points',
          type: 'number',
          required: false,
          schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float', customId: 10024 },
        },
        customfield_10025: {
          id: 'customfield_10025',
          name: 'Epic Link',
          type: 'string',
          required: false,
          schema: { type: 'string', custom: 'com.pyxis.greenhopper.jira:gh-epic-link', customId: 10025 },
        },
      },
    };

    mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValue(mockSchema);
  });

  describe('resolveFields', () => {
    it('should resolve field names to IDs', async () => {
      const input = {
        'Summary': 'Login fails',
        'Description': 'Steps to reproduce...',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        summary: 'Login fails',
        description: 'Steps to reproduce...',
      });
      expect(mockSchemaDiscovery.getFieldsForIssueType).toHaveBeenCalledWith('ENG', 'Bug');
    });

    it('should be case-insensitive', async () => {
      const input = {
        'SUMMARY': 'Test',
        'summary': 'Test2',
        'Summary': 'Test3',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        summary: 'Test3', // Last one wins
      });
    });

    it('should handle spaces in field names', async () => {
      const input = {
        'Story Points': 5,
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        customfield_10024: 5,
      });
    });

    it('should handle hyphens in field names', async () => {
      // Add field with hyphens to schema
      mockSchema.fields.customfield_10026 = {
        id: 'customfield_10026',
        name: 'Test-Field-Name',
        type: 'string',
        required: false,
        schema: { type: 'string', custom: 'custom', customId: 10026 },
      };

      const input = {
        'Test_Field_Name': 'value',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        customfield_10026: 'value',
      });
    });

    it('should handle underscores in field names', async () => {
      const input = {
        'Story_Points': 3,
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        customfield_10024: 3,
      });
    });

    it('should handle Project special case', async () => {
      const input = {
        'Project': 'ENG',
        'Summary': 'Test',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        project: { key: 'ENG' },
        summary: 'Test',
      });
    });

    it('should handle Project case variations', async () => {
      const input = {
        'project': 'ENG',
        'PROJECT': 'IGNORED', // Last one wins (JavaScript object behavior)
        'Summary': 'Test',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      // In JavaScript, when multiple keys normalize to the same value, the last one wins
      expect(result.project).toEqual({ key: 'IGNORED' });
    });

    it('should handle Issue Type special case', async () => {
      const input = {
        'Issue Type': 'Bug',
        'Summary': 'Test',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        issuetype: { name: 'Bug' },
        summary: 'Test',
      });
    });

    it('should handle Issue Type variations', async () => {
      const testCases = [
        'Issue Type',
        'issue type',
        'ISSUE TYPE',
        'IssueType',
        'issuetype',
        'Type',
        'type',
      ];

      for (const fieldName of testCases) {
        const input = { [fieldName]: 'Bug' };
        const result = await resolver.resolveFields('ENG', 'Bug', input);
        expect(result.issuetype).toEqual({ name: 'Bug' });
      }
    });

    it('should pass through field IDs unchanged', async () => {
      const input = {
        'customfield_10024': 5,
        'summary': 'Test',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        customfield_10024: 5,
        summary: 'Test',
      });
    });

    it('should skip unknown field ID with warning', async () => {
      const input = {
        'customfield_99999': 'value',
        'summary': 'Valid field', // Include a valid field
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await resolver.resolveFields('ENG', 'Bug', input);
      
      // Should skip unknown field
      expect(result).not.toHaveProperty('customfield_99999');
      // Should include valid field
      expect(result).toHaveProperty('summary', 'Valid field');
      // Should have warned
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Field ID 'customfield_99999' not found in schema")
      );
      
      consoleSpy.mockRestore();
    });

    it('should skip unknown field name with warning', async () => {
      const input = {
        'Unknown Field': 'value',
        'summary': 'Valid field', // Include a valid field
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await resolver.resolveFields('ENG', 'Bug', input);
      
      // Should skip unknown field
      expect(Object.values(result)).not.toContain('value');
      // Should include valid field
      expect(result).toHaveProperty('summary', 'Valid field');
      // Should have warned with suggestions
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Field 'Unknown Field' not found")
      );
      
      consoleSpy.mockRestore();
    });

    it('should suggest closest matches for typos in warning', async () => {
      const input = {
        'Summry': 'Test', // Typo: missing 'a'
        'description': 'Valid field',
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await resolver.resolveFields('ENG', 'Bug', input);
      
      // Should skip typo field
      expect(Object.values(result)).not.toContain('Test');
      // Should include valid field
      expect(result).toHaveProperty('description', 'Valid field');
      // Should have warned with suggestions
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Did you mean')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Summary')
      );
      
      consoleSpy.mockRestore();
    });

    it('should provide top 3 suggestions in warning', async () => {
      const input = {
        'Descr': 'Test', // Partial match
        'summary': 'Valid field',
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await resolver.resolveFields('ENG', 'Bug', input);
      
      // Should skip unknown field
      expect(Object.values(result)).not.toContain('Test');
      // Should include valid field
      expect(result).toHaveProperty('summary', 'Valid field');
      // Should have warned with suggestions
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Field 'Descr' not found")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Description')
      );
      
      consoleSpy.mockRestore();
    });

    it('should resolve multiple fields correctly', async () => {
      const input = {
        'Project': 'ENG',
        'Issue Type': 'Bug',
        'Summary': 'Login fails',
        'Description': 'User cannot log in',
        'Priority': 'High',
        'Story Points': 5,
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        project: { key: 'ENG' },
        issuetype: { name: 'Bug' },
        summary: 'Login fails',
        description: 'User cannot log in',
        priority: 'High',
        customfield_10024: 5,
      });
    });

    it('should handle empty input', async () => {
      const input = {};

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({});
    });

    it('should preserve null values', async () => {
      const input = {
        'Description': null,
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        description: null,
      });
    });

    it('should preserve undefined values', async () => {
      const input = {
        'Description': undefined,
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        description: undefined,
      });
    });
  });

  describe('Levenshtein distance', () => {
    it('should calculate correct edit distance for suggestions in warning', async () => {
      // Test by providing similar field names and checking suggestions
      const input = {
        'Summery': 'Test', // 1 edit (y → a)
        'description': 'Valid', // Include valid field
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await resolver.resolveFields('ENG', 'Bug', input);
      
      // Should skip unknown field
      expect(Object.values(result)).not.toContain('Test');
      // Should include valid field
      expect(result).toHaveProperty('description', 'Valid');
      // Summary should be the closest match in warning
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Summary')
      );
      
      consoleSpy.mockRestore();
    });

    it('should prioritize closer matches in warning suggestions', async () => {
      // Add more fields to test ranking
      mockSchema.fields.summaryNote = {
        id: 'customfield_10030',
        name: 'Summary Note',
        type: 'string',
        required: false,
        schema: { type: 'string', custom: 'custom', customId: 10030 },
      };

      const input = {
        'Summ': 'Test', // Partial
        'description': 'Valid', // Include valid field
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await resolver.resolveFields('ENG', 'Bug', input);
      
      // Should skip unknown field
      expect(Object.values(result)).not.toContain('Test');
      // Should include valid field  
      expect(result).toHaveProperty('description', 'Valid');
      // Should have warning with suggestions
      expect(consoleSpy).toHaveBeenCalled();
      const warningCall = consoleSpy.mock.calls[0][0] as string;
      // "Summary" (edit distance 3) should appear in suggestions
      expect(warningCall).toContain('Summary');
      
      consoleSpy.mockRestore();
    });

    it('should handle unknown field with no close matches by still providing default suggestions', async () => {
      const input = {
        'ZzZzZ999XxXx': 'Test', // Very different from any field name
        'description': 'Valid'
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await resolver.resolveFields('ENG', 'Bug', input);
      
      // Should skip unknown field
      expect(Object.values(result)).not.toContain('Test');
      // Should include valid field
      expect(result).toHaveProperty('description', 'Valid');
      // Should have warning and suggestions (suggestions list might fall back to top matches)
      expect(consoleSpy).toHaveBeenCalled();
      const warningCall = consoleSpy.mock.calls[0][0] as string;
      expect(warningCall).toContain("Field 'ZzZzZ999XxXx' not found");
      expect(warningCall).toContain('Did you mean');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle fields with multiple spaces', async () => {
      mockSchema.fields.customfield_10040 = {
        id: 'customfield_10040',
        name: 'Very  Long  Field  Name',
        type: 'string',
        required: false,
        schema: { type: 'string', custom: 'custom', customId: 10040 },
      };

      const input = {
        'Very Long Field Name': 'value',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        customfield_10040: 'value',
      });
    });

    it('should handle special characters in values', async () => {
      const input = {
        'Summary': 'Test with "quotes" and symbols: @#$%',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        summary: 'Test with "quotes" and symbols: @#$%',
      });
    });

    it('should handle numeric field names', async () => {
      mockSchema.fields.customfield_10050 = {
        id: 'customfield_10050',
        name: '123',
        type: 'string',
        required: false,
        schema: { type: 'string', custom: 'custom', customId: 10050 },
      };

      const input = {
        '123': 'value',
      };

      const result = await resolver.resolveFields('ENG', 'Bug', input);

      expect(result).toEqual({
        customfield_10050: 'value',
      });
    });
  });

  describe('Virtual Field Resolution (E3-S02b)', () => {
    beforeEach(() => {
      // Add timetracking field with virtual sub-fields to mock schema
      mockSchema.fields.timetracking = {
        id: 'timetracking',
        name: 'Time Tracking',
        type: 'timetracking',
        required: false,
        schema: { type: 'timetracking', system: 'timetracking' },
      };

      mockSchema.fields['timetracking.originalEstimate'] = {
        id: 'timetracking.originalEstimate',
        name: 'Original Estimate',
        type: 'string',
        required: false,
        schema: { type: 'string', system: 'originalEstimate', custom: 'virtual', customId: undefined },
      };

      mockSchema.fields['timetracking.remainingEstimate'] = {
        id: 'timetracking.remainingEstimate',
        name: 'Remaining Estimate',
        type: 'string',
        required: false,
        schema: { type: 'string', system: 'remainingEstimate', custom: 'virtual', customId: undefined },
      };

      mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValue(mockSchema);
    });

    it('should resolve "Original Estimate" to timetracking.originalEstimate property', async () => {
      const input = {
        Summary: 'Test issue',
        'Original Estimate': '3d',
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        summary: 'Test issue',
        timetracking: {
          originalEstimate: '3d',
        },
      });
    });

    it('should resolve "Remaining Estimate" to timetracking.remainingEstimate property', async () => {
      const input = {
        Summary: 'Test issue',
        'Remaining Estimate': '1d',
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        summary: 'Test issue',
        timetracking: {
          remainingEstimate: '1d',
        },
      });
    });

    it('should merge both virtual fields into single timetracking object', async () => {
      const input = {
        Summary: 'Test issue',
        'Original Estimate': '3d',
        'Remaining Estimate': '1d',
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        summary: 'Test issue',
        timetracking: {
          originalEstimate: '3d',
          remainingEstimate: '1d',
        },
      });
    });

    it('should be case-insensitive for virtual fields', async () => {
      const input = {
        'original estimate': '3d',
        'REMAINING ESTIMATE': '1d',
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        timetracking: {
          originalEstimate: '3d',
          remainingEstimate: '1d',
        },
      });
    });

    it('should support object format alongside virtual fields (backward compatibility)', async () => {
      const input = {
        Summary: 'Test issue',
        'Time Tracking': {
          originalEstimate: '2d',
        },
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        summary: 'Test issue',
        timetracking: {
          originalEstimate: '2d',
        },
      });
    });

    it('should allow top-level virtual fields to override object format (AC5)', async () => {
      const input = {
        Summary: 'Test issue',
        'Time Tracking': {
          originalEstimate: '1d',
          remainingEstimate: '30m',
        },
        'Original Estimate': '3d', // Should override
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        summary: 'Test issue',
        timetracking: {
          originalEstimate: '3d', // Virtual field overrides object
          remainingEstimate: '30m',
        },
      });
    });

    it('should handle partial virtual fields (only one sub-field)', async () => {
      const input = {
        Summary: 'Test issue',
        'Original Estimate': '5d',
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        summary: 'Test issue',
        timetracking: {
          originalEstimate: '5d',
        },
      });
    });

    it('should work with other fields (regression test)', async () => {
      const input = {
        Summary: 'Test issue',
        Description: 'Test description',
        Priority: 'High',
        'Original Estimate': '3d',
        'Story Points': 5,
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        summary: 'Test issue',
        description: 'Test description',
        priority: 'High',
        timetracking: {
          originalEstimate: '3d',
        },
        customfield_10024: 5,
      });
    });

    it('should handle variations of field names', async () => {
      const input = {
        'originalEstimate': '2d',
        'remaining-estimate': '1d',
      };

      const result = await resolver.resolveFields('ENG', 'Task', input);

      expect(result).toEqual({
        timetracking: {
          originalEstimate: '2d',
          remainingEstimate: '1d',
        },
      });
    });
  });

  // AC4: Field Resolver Integration Tests with Parent Field Discovery
  describe('AC4: Parent Field Resolution Integration', () => {
    let mockParentFieldDiscovery: { getParentFieldKey: jest.Mock };
    let mockClient: { get: jest.Mock };
    let mockCache: any;
    let mockHierarchyDiscovery: any;

    beforeEach(() => {
      // Create mock ParentFieldDiscovery
      mockParentFieldDiscovery = {
        getParentFieldKey: jest.fn(),
      };

      // Create mock JiraClient
      mockClient = {
        get: jest.fn(),
      };

      // Create mock cache and hierarchy discovery
      mockCache = {};
      mockHierarchyDiscovery = {};

      // Recreate resolver with all dependencies
      resolver = new FieldResolver(
        mockSchemaDiscovery,
        mockParentFieldDiscovery as any,
        mockClient as any,
        mockCache,
        mockHierarchyDiscovery
      );
    });

    it('should pass issue type name to getParentFieldKey when resolving parent synonym', async () => {
      // Mock schema with parent field
      const schemaWithParent = {
        ...mockSchema,
        fields: {
          ...mockSchema.fields,
          customfield_10100: {
            id: 'customfield_10100',
            name: 'Parent Link',
            type: 'string',
            required: false,
            schema: { type: 'any' },
          },
        },
      };
      mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValue(schemaWithParent);

      // Mock parent field discovery to return SuperEpic's parent field
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue('customfield_10100');

      // Mock issue type API response
      mockClient.get.mockResolvedValueOnce({
        values: [
          { id: '10001', name: 'SuperEpic' }
        ]
      });

      // Mock parent issue GET response (for ParentLinkResolver)
      mockClient.get.mockResolvedValueOnce({
        key: 'ZUL-100',
        fields: {
          issuetype: {
            id: '10002',
            name: 'Container'
          }
        }
      });

      // Mock hierarchy discovery for validation
      mockHierarchyDiscovery.getHierarchy = jest.fn().mockResolvedValue([
        { id: 4, title: 'Container', issueTypeIds: ['10002'] },
        { id: 3, title: 'SuperEpic', issueTypeIds: ['10001'] }
      ]);

      const input = {
        'Summary': 'Test SuperEpic',
        'Parent': 'ZUL-100', // Parent synonym
      };

      await resolver.resolveFields('ZUL', 'SuperEpic', input);

      // Verify getParentFieldKey was called with BOTH project key AND issue type name
      expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenCalledWith('ZUL', 'SuperEpic');
      expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenCalledTimes(1);
    });

    it('should throw ConfigurationError with project key when parent field not found', async () => {
      mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValue(mockSchema);

      // Mock parent field discovery to return null (no parent field found)
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue(null);

      const input = {
        'Summary': 'Test Task',
        'Parent': 'ZUL-200',
      };

      await expect(resolver.resolveFields('ZUL', 'SimpleTask', input))
        .rejects
        .toThrow(ConfigurationError);

      await expect(resolver.resolveFields('ZUL', 'SimpleTask', input))
        .rejects
        .toThrow(/Project ZUL does not have a parent field configured/);
      
      // Verify getParentFieldKey was called with issue type
      expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenCalledWith('ZUL', 'SimpleTask');
    });

    it('should resolve different parent fields for Epic vs Story in same project', async () => {
      const epicSchema = {
        ...mockSchema,
        issueType: 'Epic',
        fields: {
          ...mockSchema.fields,
          customfield_10100: {
            id: 'customfield_10100',
            name: 'Parent Link',
            type: 'string',
            required: false,
            schema: { type: 'any' },
          },
        },
      };

      const storySchema = {
        ...mockSchema,
        issueType: 'Story',
        fields: {
          ...mockSchema.fields,
          customfield_10014: {
            id: 'customfield_10014',
            name: 'Epic Link',
            type: 'string',
            required: false,
            schema: { type: 'any' },
          },
        },
      };

      // First call (Epic)
      mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValueOnce(epicSchema);
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValueOnce('customfield_10100');
      
      // Mock issue type API response for Epic
      mockClient.get.mockResolvedValueOnce({
        values: [{ id: '10002', name: 'Epic' }]
      });
      
      // Mock parent issue GET response for Epic
      mockClient.get.mockResolvedValueOnce({
        key: 'PROJ-1',
        fields: {
          issuetype: { id: '10003', name: 'SuperEpic' }
        }
      });
      
      // Mock hierarchy for Epic
      mockHierarchyDiscovery.getHierarchy = jest.fn().mockResolvedValueOnce([
        { id: 3, title: 'SuperEpic', issueTypeIds: ['10003'] },
        { id: 2, title: 'Epic', issueTypeIds: ['10002'] }
      ]);

      const epicInput = {
        'Summary': 'Test Epic',
        'Parent': 'PROJ-1',
      };

      const epicResult = await resolver.resolveFields('PROJ', 'Epic', epicInput);

      // Second call (Story)
      mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValueOnce(storySchema);
      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValueOnce('customfield_10014');
      
      // Mock issue type API response for Story
      mockClient.get.mockResolvedValueOnce({
        values: [{ id: '10001', name: 'Story' }]
      });
      
      // Mock parent issue GET response for Story
      mockClient.get.mockResolvedValueOnce({
        key: 'PROJ-2',
        fields: {
          issuetype: { id: '10002', name: 'Epic' }
        }
      });
      
      // Mock hierarchy for Story
      mockHierarchyDiscovery.getHierarchy = jest.fn().mockResolvedValueOnce([
        { id: 2, title: 'Epic', issueTypeIds: ['10002'] },
        { id: 1, title: 'Story', issueTypeIds: ['10001'] }
      ]);

      const storyInput = {
        'Summary': 'Test Story',
        'Parent': 'PROJ-2',
      };

      const storyResult = await resolver.resolveFields('PROJ', 'Story', storyInput);

      // Verify different parent fields were resolved
      expect(epicResult).toHaveProperty('customfield_10100', 'PROJ-1');
      expect(storyResult).toHaveProperty('customfield_10014', 'PROJ-2');

      // Verify getParentFieldKey was called with correct issue types
      expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenNthCalledWith(1, 'PROJ', 'Epic');
      expect(mockParentFieldDiscovery.getParentFieldKey).toHaveBeenNthCalledWith(2, 'PROJ', 'Story');
    });

    it('should throw ConfigurationError when parent field discovery not configured', async () => {
      // Create resolver without parent field discovery
      const resolverWithoutParent = new FieldResolver(
        mockSchemaDiscovery
        // No parentFieldDiscovery parameter
      );

      const input = {
        parent: 'PROJ-1',
        summary: 'Test'
      };

      await expect(
        resolverWithoutParent.resolveFields('PROJ', 'Story', input)
      ).rejects.toThrow('Parent field discovery not configured');
    });

    it('should throw ConfigurationError when required dependencies missing for parent resolution', async () => {
      // Create resolver without client
      const resolverWithoutDeps = new FieldResolver(
        mockSchemaDiscovery,
        mockParentFieldDiscovery as any,
        undefined, // No client
        mockCache,
        mockHierarchyDiscovery
      );

      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValueOnce('customfield_10014');

      const input = {
        parent: 'PROJ-1',
        summary: 'Test'
      };

      await expect(
        resolverWithoutDeps.resolveFields('PROJ', 'Story', input)
      ).rejects.toThrow('Required dependencies not configured for parent link resolution');
    });

    it('should throw ConfigurationError when issue type not found in project', async () => {
      const resolver = new FieldResolver(
        mockSchemaDiscovery,
        mockParentFieldDiscovery as any,
        mockClient as any,
        mockCache,
        mockHierarchyDiscovery
      );

      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValueOnce('customfield_10014');
      
      // Mock API returning issue types without the requested one
      mockClient.get.mockResolvedValueOnce({
        values: [
          { id: '10001', name: 'Bug' },
          { id: '10002', name: 'Epic' }
          // 'Story' not in list
        ]
      });

      const input = {
        parent: 'PROJ-1',
        summary: 'Test'
      };

      await expect(
        resolver.resolveFields('PROJ', 'Story', input)
      ).rejects.toThrow("Issue type 'Story' not found in project 'PROJ'");
    });
  });

  describe('Additional Branch Coverage', () => {
    it('should handle project field already in object format', async () => {
      const input = {
        project: { key: 'PROJ' }, // Already in correct format
        summary: 'Test'
      };

      const result = await resolver.resolveFields('PROJ', 'Bug', input);

      expect(result).toHaveProperty('project', { key: 'PROJ' });
      expect(result).toHaveProperty('summary', 'Test');
    });

    it('should format parent value as object when parent field type is issuelink', async () => {
      // Setup mocks for parent field resolution
      const mockParentFieldDiscovery = { getParentFieldKey: jest.fn() };
      const mockClient = { get: jest.fn() };
      const mockCache = { get: jest.fn(), set: jest.fn() }; // Required for parent link resolution
      const mockHierarchyDiscovery = { getHierarchy: jest.fn() };

      // Create schema with issuelink type parent field (standard JIRA parent)
      const schemaWithIssueLinkParent = {
        ...mockSchema,
        fields: {
          ...mockSchema.fields,
          parent: {
            id: 'parent',
            name: 'Parent',
            type: 'issuelink', // Standard JIRA parent field type
            required: false,
            schema: { type: 'issuelink' },
          },
        },
      };
      mockSchemaDiscovery.getFieldsForIssueType.mockResolvedValue(schemaWithIssueLinkParent);

      const resolverWithParent = new FieldResolver(
        mockSchemaDiscovery,
        mockParentFieldDiscovery as any,
        mockClient as any,
        mockCache as any, // cache required
        mockHierarchyDiscovery as any
      );

      mockParentFieldDiscovery.getParentFieldKey.mockResolvedValue('parent');
      mockClient.get.mockResolvedValueOnce({
        values: [{ id: '10001', name: 'Sub-task' }]
      });
      mockClient.get.mockResolvedValueOnce({
        key: 'PROJ-100',
        fields: { issuetype: { id: '10002', name: 'Story' } }
      });
      mockHierarchyDiscovery.getHierarchy.mockResolvedValue([
        { id: 1, title: 'Story', issueTypeIds: ['10002'] },
        { id: 0, title: 'Sub-task', issueTypeIds: ['10001'] }
      ]);

      const input = {
        summary: 'Test Sub-task',
        parent: 'PROJ-100',
      };

      const result = await resolverWithParent.resolveFields('PROJ', 'Sub-task', input);

      // issuelink type should format parent as object: { key: "PROJ-100" }
      expect(result).toHaveProperty('parent', { key: 'PROJ-100' });
      expect(result.parent).toEqual({ key: 'PROJ-100' });
    });
  });
});

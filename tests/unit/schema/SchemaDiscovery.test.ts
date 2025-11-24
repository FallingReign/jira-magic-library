import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { JiraClient } from '../../../src/client/JiraClient.js';
import { CacheClient } from '../../../src/types/cache.js';
import { NotFoundError } from '../../../src/errors/NotFoundError.js';
import { ProjectSchema } from '../../../src/types/schema.js';

describe('SchemaDiscovery', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let mockCache: jest.Mocked<CacheClient>;
  let discovery: SchemaDiscovery;
  const baseUrl = 'https://jira.example.com';
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<JiraClient>;

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      clear: jest.fn(),
      ping: jest.fn(),
    } as jest.Mocked<CacheClient>;

    discovery = new SchemaDiscovery(mockClient, mockCache, baseUrl);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('getFieldsForIssueType', () => {
    // Mock for step 1: Get issue types (actual API format with pagination)
    const mockIssueTypes = {
      maxResults: 50,
      startAt: 0,
      total: 3,
      isLast: true,
      values: [
        { id: '1', name: 'Bug' },
        { id: '2', name: 'Task' },
        { id: '3', name: 'Story' },
      ],
    };

    // Mock for step 2: Get fields for issue type (actual JIRA API format - array with fieldId)
    const mockFieldsData = {
      maxResults: 50,
      startAt: 0,
      total: 6,
      isLast: true,
      values: [
        {
          fieldId: 'summary',
          required: true,
          schema: { type: 'string', system: 'summary' },
          name: 'Summary',
          hasDefaultValue: false,
          operations: ['set'],
        },
        {
          fieldId: 'priority',
          required: false,
          schema: { type: 'priority', system: 'priority' },
          name: 'Priority',
          hasDefaultValue: false,
          operations: ['set'],
          allowedValues: [
            { id: '1', name: 'High' },
            { id: '2', name: 'Medium' },
          ],
        },
        {
          fieldId: 'customfield_10024',
          required: false,
          schema: {
            type: 'number',
            custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
            customId: 10024,
          },
          name: 'Story Points',
          hasDefaultValue: false,
          operations: ['set'],
        },
        {
          fieldId: 'assignee',
          required: false,
          schema: { type: 'user', system: 'assignee' },
          name: 'Assignee',
          hasDefaultValue: false,
          operations: ['set'],
        },
        {
          fieldId: 'labels',
          required: false,
          schema: { type: 'array', items: 'string', system: 'labels' },
          name: 'Labels',
          hasDefaultValue: false,
          operations: ['add', 'set', 'remove'],
        },
        {
          fieldId: 'components',
          required: false,
          schema: { type: 'array', items: 'component', system: 'components' },
          name: 'Component/s',
          hasDefaultValue: false,
          operations: ['add', 'set', 'remove'],
          allowedValues: [
            { id: '10001', name: 'Backend' },
            { id: '10002', name: 'Frontend' },
          ],
        },
      ],
    };

    it('should fetch schema from API on cache miss', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)  // Step 1: Get issue types
        .mockResolvedValueOnce(mockFieldsData);  // Step 2: Get fields

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert
      expect(mockClient.get).toHaveBeenCalledTimes(2);
      expect(mockClient.get).toHaveBeenNthCalledWith(1, '/rest/api/2/issue/createmeta/ENG/issuetypes');
      expect(mockClient.get).toHaveBeenNthCalledWith(2, '/rest/api/2/issue/createmeta/ENG/issuetypes/1?startAt=0&maxResults=1000');
      expect(schema.projectKey).toBe('ENG');
      expect(schema.issueType).toBe('Bug');
      expect(Object.keys(schema.fields)).toHaveLength(6);
    });

    it('should cache schema after fetching from API', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(mockFieldsData);

      // Act
      await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert
      expect(mockCache.set).toHaveBeenCalledWith(
        'jml:schema:https://jira.example.com:ENG:Bug',
        expect.any(String),
        900
      );

      const cachedData = JSON.parse((mockCache.set as jest.Mock).mock.calls[0][1]);
      expect(cachedData.projectKey).toBe('ENG');
      expect(cachedData.issueType).toBe('Bug');
    });

    it('should return cached schema on cache hit', async () => {
      // Arrange
      const cachedSchema: ProjectSchema = {
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
        },
      };
      mockCache.get.mockResolvedValue(JSON.stringify(cachedSchema));

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert
      expect(mockClient.get).not.toHaveBeenCalled();
      expect(schema).toEqual(cachedSchema);
    });

    it('should parse field definitions correctly', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(mockFieldsData);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert - Summary field
      expect(schema.fields.summary).toEqual({
        id: 'summary',
        name: 'Summary',
        type: 'string',
        required: true,
        schema: { type: 'string', system: 'summary' },
      });

      // Assert - Priority field with allowed values
      expect(schema.fields.priority).toEqual({
        id: 'priority',
        name: 'Priority',
        type: 'priority',
        required: false,
        allowedValues: [
          { id: '1', name: 'High', value: 'High' },
          { id: '2', name: 'Medium', value: 'Medium' },
        ],
        schema: { type: 'priority', system: 'priority' },
      });

      // Assert - Custom field
      expect(schema.fields.customfield_10024).toEqual({
        id: 'customfield_10024',
        name: 'Story Points',
        type: 'number',
        required: false,
        schema: {
          type: 'number',
          custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
          customId: 10024,
        },
      });
    });

    it('should map JIRA schema types to internal types', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(mockFieldsData);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert - type mappings
      expect(schema.fields.summary.type).toBe('string');
      expect(schema.fields.priority.type).toBe('priority');
      expect(schema.fields.customfield_10024.type).toBe('number');
      expect(schema.fields.assignee.type).toBe('user');
      expect(schema.fields.labels.type).toBe('array');
      expect(schema.fields.components.type).toBe('array');
    });

    it('should throw NotFoundError if project does not exist', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.get.mockResolvedValue({ values: [] });

      // Act & Assert
      await expect(discovery.getFieldsForIssueType('INVALID', 'Bug')).rejects.toThrow(
        NotFoundError
      );
      await expect(discovery.getFieldsForIssueType('INVALID', 'Bug')).rejects.toThrow(
        "No issue types found for project 'INVALID'"
      );
    });

    it('should throw NotFoundError if issue type does not exist in project', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      const response = {
        values: [
          { id: '1', name: 'Bug' },
          { id: '2', name: 'Task' },
        ],
      };
      mockClient.get.mockResolvedValue(response);

      // Act & Assert
      await expect(discovery.getFieldsForIssueType('ENG', 'Epic')).rejects.toThrow(NotFoundError);
      await expect(discovery.getFieldsForIssueType('ENG', 'Epic')).rejects.toThrow(
        "Issue type 'Epic' not found in project 'ENG'. Available types: Bug, Task"
      );
    });

    it('should handle cache errors gracefully and fetch from API', async () => {
      // Arrange
      mockCache.get.mockRejectedValue(new Error('Redis connection failed'));
      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(mockFieldsData);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert - should succeed despite cache error
      expect(schema.projectKey).toBe('ENG');
      expect(mockClient.get).toHaveBeenCalled();
    });

    it('should handle cache set errors gracefully', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockRejectedValue(new Error('Redis write failed'));
      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(mockFieldsData);

      // Act & Assert - should not throw
      await expect(discovery.getFieldsForIssueType('ENG', 'Bug')).resolves.toBeDefined();
    });

    it('should throw NotFoundError when no fields returned for issue type', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      const emptyFieldsResponse = {
        values: [],
        maxResults: 50,
        startAt: 0,
        total: 0,
        isLast: true,
      };
      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(emptyFieldsResponse); // Empty fields response

      // Act & Assert
      await expect(discovery.getFieldsForIssueType('ENG', 'Bug')).rejects.toThrow(
        "No fields found for issue type 'Bug' in project 'ENG'"
      );
    });

    it('should parse cascading select fields with children correctly', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      const cascadingFieldData = {
        values: [
          {
            fieldId: 'customfield_10030',
            name: 'Location',
            required: false,
            schema: {
              type: 'option-with-child',
              custom: 'com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect',
              customId: 10030,
            },
            allowedValues: [
              {
                id: '1',
                value: 'USA',
                children: [
                  { id: '11', value: 'New York' },
                  { id: '12', value: 'California' },
                ],
              },
              {
                id: '2',
                value: 'UK',
                children: [
                  { id: '21', value: 'London' },
                  { id: '22', value: 'Manchester' },
                ],
              },
            ],
          },
        ],
      };

      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(cascadingFieldData);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert - children should be properly mapped
      expect(schema.fields.customfield_10030.allowedValues).toEqual([
        {
          id: '1',
          name: 'USA',
          value: 'USA',
          children: [
            { id: '11', value: 'New York' },
            { id: '12', value: 'California' },
          ],
        },
        {
          id: '2',
          name: 'UK',
          value: 'UK',
          children: [
            { id: '21', value: 'London' },
            { id: '22', value: 'Manchester' },
          ],
        },
      ]);
    });
  });

  describe('getFieldIdByName', () => {
    const mockSchema: ProjectSchema = {
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
        priority: {
          id: 'priority',
          name: 'Priority',
          type: 'priority',
          required: false,
          schema: { type: 'priority' },
        },
        customfield_10024: {
          id: 'customfield_10024',
          name: 'Story Points',
          type: 'number',
          required: false,
          schema: { type: 'number' },
        },
      },
    };

    beforeEach(() => {
      mockCache.get.mockResolvedValue(JSON.stringify(mockSchema));
    });

    it('should resolve field name to ID', async () => {
      // Act
      const fieldId = await discovery.getFieldIdByName('ENG', 'Bug', 'Summary');

      // Assert
      expect(fieldId).toBe('summary');
    });

    it('should be case-insensitive', async () => {
      // Act
      const fieldId1 = await discovery.getFieldIdByName('ENG', 'Bug', 'summary');
      const fieldId2 = await discovery.getFieldIdByName('ENG', 'Bug', 'SUMMARY');
      const fieldId3 = await discovery.getFieldIdByName('ENG', 'Bug', 'SuMmArY');

      // Assert
      expect(fieldId1).toBe('summary');
      expect(fieldId2).toBe('summary');
      expect(fieldId3).toBe('summary');
    });

    it('should resolve custom field names', async () => {
      // Act
      const fieldId = await discovery.getFieldIdByName('ENG', 'Bug', 'Story Points');

      // Assert
      expect(fieldId).toBe('customfield_10024');
    });

    it('should return null if field not found', async () => {
      // Act
      const fieldId = await discovery.getFieldIdByName('ENG', 'Bug', 'NonExistent');

      // Assert
      expect(fieldId).toBeNull();
    });

    it('should handle field names with special characters', async () => {
      // Arrange
      const schemaWithSpecialChars: ProjectSchema = {
        ...mockSchema,
        fields: {
          ...mockSchema.fields,
          customfield_10025: {
            id: 'customfield_10025',
            name: 'Component/s',
            type: 'array',
            required: false,
            schema: { type: 'array' },
          },
        },
      };
      mockCache.get.mockResolvedValue(JSON.stringify(schemaWithSpecialChars));

      // Act
      const fieldId = await discovery.getFieldIdByName('ENG', 'Bug', 'Component/s');

      // Assert
      expect(fieldId).toBe('customfield_10025');
    });
  });

  describe('Lazy Loading', () => {
    it('should not fetch schema during instantiation', () => {
      // Act - constructor called in beforeEach
      // Assert
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should fetch schema only on first use', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockClient.get
        .mockResolvedValueOnce({ values: [{ id: '1', name: 'Bug' }] })  // Step 1
        .mockResolvedValueOnce({
          values: [
            {
              fieldId: 'summary',
              required: true,
              schema: { type: 'string', system: 'summary' },
              name: 'Summary',
            },
          ],
        });  // Step 2

      // Act
      await discovery.getFieldIdByName('ENG', 'Bug', 'Summary');

      // Assert
      expect(mockClient.get).toHaveBeenCalledTimes(2);  // Two-step API
    });

    it('should reuse cached schema for subsequent calls', async () => {
      // Arrange
      const cachedSchema: ProjectSchema = {
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: {
          summary: {
            id: 'summary',
            name: 'Summary',
            type: 'string',
            required: true,
            schema: { type: 'string' },
          },
        },
      };
      mockCache.get.mockResolvedValue(JSON.stringify(cachedSchema));

      // Act
      await discovery.getFieldIdByName('ENG', 'Bug', 'Summary');
      await discovery.getFieldIdByName('ENG', 'Bug', 'Summary');
      await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert
      expect(mockClient.get).not.toHaveBeenCalled();
      expect(mockCache.get).toHaveBeenCalledTimes(3); // Cache checked each time
    });
  });

  describe('Error Handling', () => {
    it('should throw NotFoundError when fieldsData.values is missing', async () => {
      // Arrange
      const mockIssueTypes = {
        values: [{ id: '1', name: 'Bug' }],
      };
      
      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes) // First call: get issue types
        .mockResolvedValueOnce({ }); // Second call: fields data WITHOUT values

      // Act & Assert
      await expect(discovery.getFieldsForIssueType('ENG', 'Bug')).rejects.toThrow(/No fields found for issue type/);
    });

    it('should skip fields without fieldId silently', async () => {
      // Arrange
      const mockIssueTypes = {
        values: [{ id: '1', name: 'Bug' }],
      };
      
      const fieldsWithMissingId = {
        values: [
          {
            // Missing fieldId!
            name: 'BadField',
            required: false,
            schema: { type: 'string' },
          },
          {
            fieldId: 'summary',
            name: 'Summary',
            required: true,
            schema: { type: 'string', system: 'summary' },
          },
        ],
      };

      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(fieldsWithMissingId);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert - Should silently skip missing fieldId
      expect(schema.fields).not.toHaveProperty('undefined');
      expect(schema.fields).toHaveProperty('summary');
      expect(Object.keys(schema.fields)).toHaveLength(1); // Only summary should be parsed
    });
  });

  describe('Branch Coverage - mapFieldType', () => {
    it('should handle null schema in mapFieldType', async () => {
      // Arrange
      const mockIssueTypes = {
        values: [{ id: '1', name: 'Bug' }],
      };
      
      const fieldsWithNullSchema = {
        values: [
          {
            fieldId: 'nullschema',
            name: 'NullSchemaField',
            required: false,
            schema: null, // This should trigger the null schema branch
          },
          {
            fieldId: 'summary',
            name: 'Summary',
            required: true,
            schema: { type: 'string' },
          },
        ],
      };

      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(fieldsWithNullSchema);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert - Should handle null schema gracefully
      expect(schema.fields).toHaveProperty('nullschema');
      expect(schema.fields.nullschema.type).toBe('unknown'); // mapFieldType should return 'unknown' for null schema
    });

    it('should handle array type without items in mapFieldType', async () => {
      // Arrange
      const mockIssueTypes = {
        values: [{ id: '1', name: 'Bug' }],
      };
      
      const fieldsWithArrayNoItems = {
        values: [
          {
            fieldId: 'arrayfield',
            name: 'ArrayField',
            required: false,
            schema: { type: 'array' }, // Array type but no items property
          },
          {
            fieldId: 'summary',
            name: 'Summary', 
            required: true,
            schema: { type: 'string' },
          },
        ],
      };

      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(fieldsWithArrayNoItems);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert - Should handle array without items
      expect(schema.fields).toHaveProperty('arrayfield');
      expect(schema.fields.arrayfield.type).toBe('array'); // Should still return 'array' even without items
    });

    it('should handle schema with falsy type in mapFieldType', async () => {
      // Arrange
      const mockIssueTypes = {
        values: [{ id: '1', name: 'Bug' }],
      };
      
      const fieldsWithFalsyType = {
        values: [
          {
            fieldId: 'falsytype',
            name: 'FalsyTypeField',
            required: false,
            schema: { type: '' }, // Empty string type (falsy but not null/undefined)
          },
          {
            fieldId: 'summary',
            name: 'Summary', 
            required: true,
            schema: { type: 'string' },
          },
        ],
      };

      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(fieldsWithFalsyType);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');

      // Assert - Should handle falsy type and return 'unknown'
      expect(schema.fields).toHaveProperty('falsytype');
      expect(schema.fields.falsytype.type).toBe('unknown'); // mapFieldType should return 'unknown' for falsy type
    });
  });

  describe('Virtual Field Generation (E3-S02b)', () => {
    const mockIssueTypes = {
      maxResults: 50,
      startAt: 0,
      total: 1,
      isLast: true,
      values: [{ id: '1', name: 'Task' }],
    };

    it('should generate virtual sub-fields for timetracking field', async () => {
      // Arrange - Mock API responses with timetracking field
      const mockFieldsData = {
        maxResults: 50,
        startAt: 0,
        total: 3,
        isLast: true,
        values: [
          {
            fieldId: 'summary',
            name: 'Summary',
            required: true,
            schema: { type: 'string', system: 'summary' },
          },
          {
            fieldId: 'timetracking',
            name: 'Time Tracking',
            required: false,
            schema: { type: 'timetracking', system: 'timetracking' },
          },
          {
            fieldId: 'description',
            name: 'Description',
            required: false,
            schema: { type: 'string', system: 'description' },
          },
        ],
      };

      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(mockFieldsData);

      mockCache.get.mockResolvedValue(null);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Task');

      // Assert - Original timetracking field exists
      expect(schema.fields).toHaveProperty('timetracking');
      expect(schema.fields.timetracking.name).toBe('Time Tracking');

      // Assert - Virtual field: Original Estimate
      expect(schema.fields['timetracking.originalEstimate']).toBeDefined();
      expect(schema.fields['timetracking.originalEstimate'].name).toBe('Original Estimate');
      expect(schema.fields['timetracking.originalEstimate'].type).toBe('string');
      expect(schema.fields['timetracking.originalEstimate'].schema?.custom).toBe('virtual');
      expect(schema.fields['timetracking.originalEstimate'].schema?.system).toBe('originalEstimate');

      // Assert - Virtual field: Remaining Estimate
      expect(schema.fields['timetracking.remainingEstimate']).toBeDefined();
      expect(schema.fields['timetracking.remainingEstimate'].name).toBe('Remaining Estimate');
      expect(schema.fields['timetracking.remainingEstimate'].type).toBe('string');
      expect(schema.fields['timetracking.remainingEstimate'].schema?.custom).toBe('virtual');
      expect(schema.fields['timetracking.remainingEstimate'].schema?.system).toBe('remainingEstimate');
    });

    it('should not generate virtual fields for non-timetracking fields', async () => {
      // Arrange - Mock API responses without timetracking field
      const mockFieldsData = {
        maxResults: 50,
        startAt: 0,
        total: 2,
        isLast: true,
        values: [
          {
            fieldId: 'summary',
            name: 'Summary',
            required: true,
            schema: { type: 'string', system: 'summary' },
          },
          {
            fieldId: 'description',
            name: 'Description',
            required: false,
            schema: { type: 'string', system: 'description' },
          },
        ],
      };

      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(mockFieldsData);

      mockCache.get.mockResolvedValue(null);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Task');

      // Assert - Only summary and description fields
      expect(Object.keys(schema.fields)).toEqual(['summary', 'description']);
      expect(schema.fields).not.toHaveProperty('timetracking.originalEstimate');
      expect(schema.fields).not.toHaveProperty('timetracking.remainingEstimate');
    });

    it('should preserve all original timetracking field metadata', async () => {
      // Arrange - Mock with timetracking field with full metadata
      const mockFieldsData = {
        maxResults: 50,
        startAt: 0,
        total: 1,
        isLast: true,
        values: [
          {
            fieldId: 'timetracking',
            name: 'Time Tracking',
            required: false,
            schema: {
              type: 'timetracking',
              system: 'timetracking',
              custom: undefined,
              customId: undefined,
            },
          },
        ],
      };

      mockClient.get
        .mockResolvedValueOnce(mockIssueTypes)
        .mockResolvedValueOnce(mockFieldsData);

      mockCache.get.mockResolvedValue(null);

      // Act
      const schema = await discovery.getFieldsForIssueType('ENG', 'Task');

      // Assert - Virtual fields inherit parent metadata (except name and specific virtual markers)
      const virtualField = schema.fields['timetracking.originalEstimate'];
      expect(virtualField.id).toBe('timetracking.originalEstimate');
      expect(virtualField.required).toBe(false); // Inherited from parent
      expect(virtualField.schema?.type).toBe('string'); // Overridden for virtual field
      expect(virtualField.schema?.system).toBe('originalEstimate'); // Virtual property path
      expect(virtualField.schema?.custom).toBe('virtual'); // Marked as virtual
      expect(virtualField.schema?.customId).toBeUndefined(); // Virtual fields don't have custom IDs
    });
  });

  describe('getIssueTypesForProject - Branch Coverage', () => {
    it('should throw NotFoundError when values array is empty (line 59 branch)', async () => {
      // Test the branch: if (!values || values.length === 0)
      mockClient.get.mockResolvedValueOnce({
        values: [] // Empty array
      });

      await expect(discovery.getIssueTypesForProject('EMPTY'))
        .rejects.toThrow('No issue types found');
    });

    it('should throw NotFoundError when values is missing (line 59 branch)', async () => {
      // Test the branch: if (!values || values.length === 0)
      mockClient.get.mockResolvedValueOnce({
        // No values property at all
      });

      await expect(discovery.getIssueTypesForProject('NOVAL'))
        .rejects.toThrow('No issue types found');
    });

    it('should return issue types when values array has data', async () => {
      mockClient.get.mockResolvedValueOnce({
        values: [
          { id: '1', name: 'Bug' },
          { id: '2', name: 'Task' }
        ]
      });

      const result = await discovery.getIssueTypesForProject('TEST');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', name: 'Bug' });
      expect(result[1]).toEqual({ id: '2', name: 'Task' });
    });
  });
});

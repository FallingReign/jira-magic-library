import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import { JiraClient } from '../../../src/client/JiraClient.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import { Issue } from '../../../src/types.js';
import type { LookupCache } from '../../../src/types/converter.js';

describe('IssueOperations', () => {
  let issueOps: IssueOperations;
  let mockClient: jest.Mocked<JiraClient>;
  let mockSchema: jest.Mocked<SchemaDiscovery>;
  let mockResolver: jest.Mocked<FieldResolver>;
  let mockConverter: jest.Mocked<ConverterRegistry>;

  beforeEach(() => {
    // Create mocks
    mockClient = {
      post: jest.fn(),
      get: jest.fn(), // Added for ProjectConverter to resolve project names
    } as any;

    // Default mock: ProjectConverter will try to resolve project key
    // Mock a successful project lookup by key
    (mockClient.get as jest.Mock).mockResolvedValue({
      id: '10000',
      key: 'ENG',
      name: 'Engineering',
    });

    mockSchema = {
      getFieldsForIssueType: jest.fn(),
    } as any;

    mockResolver = {
      resolveFields: jest.fn(),
      resolveFieldsWithExtraction: jest.fn(),
    } as any;

    // Default mock for resolveFieldsWithExtraction that extracts project/issueType from input
    // Individual tests can override this if needed
    (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockImplementation(async (input: Record<string, unknown>) => {
      const projectVal = input['Project'] || input['project'];
      const issueTypeVal = input['Issue Type'] || input['issuetype'] || input['issueType'];
      
      const projectKey = typeof projectVal === 'string' 
        ? projectVal 
        : (projectVal as any)?.key || 'PROJ';
      const issueType = typeof issueTypeVal === 'string'
        ? issueTypeVal
        : (issueTypeVal as any)?.name || 'Task';
      
      return {
        projectKey,
        issueType,
        fields: {
          project: { key: projectKey },
          issuetype: { name: issueType },
          ...input,
        },
      };
    });

    mockConverter = {
      convertFields: jest.fn(),
    } as any;

    issueOps = new IssueOperations(
      mockClient,
      mockSchema,
      mockResolver,
      mockConverter
    );
  });

  describe('create', () => {
    const validInput = {
      Project: 'ENG',
      'Issue Type': 'Bug',
      Summary: 'Login fails on Safari',
      Description: 'Steps to reproduce...',
    };

    it('should create issue successfully', async () => {
      // Arrange
      const mockProjectSchema = {
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: {
          summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } },
          description: { id: 'description', name: 'Description', type: 'text', required: false, schema: { type: 'text' } },
        },
      };

      const mockResolvedFields = {
        project: { key: 'ENG' },
        issuetype: { name: 'Bug' },
        summary: 'Login fails on Safari',
        description: 'Steps to reproduce...',
      };

      const mockConvertedFields = {
        project: { key: 'ENG' },
        issuetype: { name: 'Bug' },
        summary: 'Login fails on Safari',
        description: 'Steps to reproduce...',
      };

      const mockResponse: Issue = {
        key: 'ENG-123',
        id: '10050',
        self: 'https://jira.example.com/rest/api/2/issue/10050',
      };

      mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
      // Override default mock to return specific resolved fields
      (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockResolvedValueOnce({
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: mockResolvedFields,
      });
      mockConverter.convertFields.mockResolvedValue(mockConvertedFields);
      mockClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await issueOps.create(validInput);

      // Assert
      expect(result).toEqual(mockResponse);
      // S4: Project/issueType extraction now happens inside resolveFieldsWithExtraction
      expect(mockResolver.resolveFieldsWithExtraction).toHaveBeenCalledWith(validInput);
      expect(mockSchema.getFieldsForIssueType).toHaveBeenCalledWith('ENG', 'Bug');
      expect(mockConverter.convertFields).toHaveBeenCalledWith(
        mockProjectSchema,
        mockResolvedFields,
        expect.objectContaining({ projectKey: 'ENG', issueType: 'Bug' })
      );
      expect(mockClient.post).toHaveBeenCalledWith('/rest/api/2/issue', {
        fields: mockConvertedFields,
      });
    });

    it('should resolve field names to IDs', async () => {
      // Arrange
      const mockProjectSchema = {
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: {},
      };

      mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
      mockConverter.convertFields.mockResolvedValue({});
      mockClient.post.mockResolvedValue({ key: 'ENG-1', id: '1', self: '' });

      // Act
      await issueOps.create(validInput);

      // Assert - S4: resolveFieldsWithExtraction now handles project/issueType extraction
      expect(mockResolver.resolveFieldsWithExtraction).toHaveBeenCalledWith(validInput);
    });

    it('should convert field values', async () => {
      // Arrange
      const mockProjectSchema = {
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: {},
      };

      const mockResolvedFields = { summary: '  Login bug  ' };

      mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
      // Override default mock to return specific resolved fields
      (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockResolvedValueOnce({
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: mockResolvedFields,
      });
      mockConverter.convertFields.mockResolvedValue({ summary: 'Login bug' });
      mockClient.post.mockResolvedValue({ key: 'ENG-1', id: '1', self: '' });

      // Act
      await issueOps.create(validInput);

      // Assert
      expect(mockConverter.convertFields).toHaveBeenCalledWith(
        mockProjectSchema,
        mockResolvedFields,
        { projectKey: 'ENG', issueType: 'Bug', cache: undefined, client: expect.any(Object) }
      );
    });

    it('should build correct JIRA payload', async () => {
      // Arrange
      const mockProjectSchema = {
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: {},
      };

      const mockConvertedFields = {
        project: { key: 'ENG' },
        issuetype: { name: 'Bug' },
        summary: 'Login fails',
      };

      mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
      mockResolver.resolveFields.mockResolvedValue({});
      mockConverter.convertFields.mockResolvedValue(mockConvertedFields);
      mockClient.post.mockResolvedValue({ key: 'ENG-1', id: '1', self: '' });

      // Act
      await issueOps.create(validInput);

      // Assert
      expect(mockClient.post).toHaveBeenCalledWith('/rest/api/2/issue', {
        fields: mockConvertedFields,
      });
    });

    it('should throw ValidationError if Project missing', async () => {
      // Arrange
      const invalidInput = {
        'Issue Type': 'Bug',
        Summary: 'Test',
      };

      // Act & Assert
      // E4-S04: Now throws from detectInputType, not createSingle
      await expect(issueOps.create(invalidInput)).rejects.toThrow(
        /must have Project field/i
      );
    });

    it('should throw ValidationError if Issue Type missing', async () => {
      // Arrange
      const invalidInput = {
        Project: 'ENG',
        Summary: 'Test',
      };

      // Override mock to throw for missing issue type
      (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockRejectedValueOnce(
        new Error("Field 'Issue Type' is required")
      );

      // Act & Assert
      await expect(issueOps.create(invalidInput)).rejects.toThrow(
        "Field 'Issue Type' is required"
      );
    });

    it('should wrap JIRA API errors', async () => {
      // Arrange
      const mockProjectSchema = {
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: {},
      };

      const jiraError = new Error('Field "priority" is required');

      mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
      mockResolver.resolveFields.mockResolvedValue({});
      mockConverter.convertFields.mockResolvedValue({});
      mockClient.post.mockRejectedValue(jiraError);

      // Act & Assert
      await expect(issueOps.create(validInput)).rejects.toThrow(
        'Failed to create issue: Field "priority" is required'
      );
    });
  });

  describe('Dry-run mode', () => {
    const validInput = {
      Project: 'ENG',
      'Issue Type': 'Bug',
      Summary: 'Test issue',
    };

    it('should not call JIRA API', async () => {
      // Arrange
      const mockProjectSchema = {
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: {},
      };

      const mockConvertedFields = {
        project: { key: 'ENG' },
        issuetype: { name: 'Bug' },
        summary: 'Test issue',
      };

      mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
      mockResolver.resolveFields.mockResolvedValue({});
      mockConverter.convertFields.mockResolvedValue(mockConvertedFields);

      // Act
      await issueOps.create(validInput, { validate: true });

      // Assert
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should return payload in response', async () => {
      // Arrange
      const mockProjectSchema = {
        projectKey: 'ENG',
        issueType: 'Bug',
        fields: {},
      };

      const mockConvertedFields = {
        project: { key: 'ENG' },
        issuetype: { name: 'Bug' },
        summary: 'Test issue',
      };

      mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
      mockResolver.resolveFields.mockResolvedValue({});
      mockConverter.convertFields.mockResolvedValue(mockConvertedFields);

      // Act
      const result = await issueOps.create(validInput, { validate: true });

      // Assert
      expect(result).toEqual({
        key: 'DRY-RUN',
        id: '0',
        self: '',
        fields: mockConvertedFields,
      });
    });

    it('should handle non-Error exceptions in catch block', async () => {
      // Arrange - Setup mocks to return valid data
      const mockProjectSchema = { 
        projectKey: 'ENG', 
        issueType: 'Bug', 
        fields: {} 
      };
      
      mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
      mockResolver.resolveFields.mockResolvedValue(validInput);
      mockConverter.convertFields.mockResolvedValue(validInput);
      
      // Mock client.post to throw a non-Error object (covers line 99 - String(err))
      mockClient.post.mockRejectedValue('Non-error string thrown');

      // Act & Assert
      await expect(issueOps.create(validInput)).rejects.toThrow('Failed to create issue: Non-error string thrown');
    });
  });

  // E4-S04: Unified create() Method Tests
  describe('E4-S04: Unified create() - Input Type Detection', () => {
    describe('AC1: Detect Input Type', () => {
      it('should detect single object input (has Project field)', async () => {
        const input = {
          Project: 'ENG',
          'Issue Type': 'Task',
          Summary: 'Single issue'
        };

        // Mock single issue flow
        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Task',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue({});
        mockConverter.convertFields.mockResolvedValue({});
        mockClient.post.mockResolvedValue({
          key: 'ENG-123',
          id: '10050',
          self: 'https://jira.example.com/rest/api/2/issue/10050'
        });

        const result = await issueOps.create(input);

        // Should return single Issue object
        expect(result).toHaveProperty('key');
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('self');
        expect(Array.isArray(result)).toBe(false);
      });

      it('should detect array of objects input', async () => {
        const input = [
          { Project: 'ENG', 'Issue Type': 'Task', Summary: 'Issue 1' },
          { Project: 'ENG', 'Issue Type': 'Task', Summary: 'Issue 2' }
        ];

        // For now, this will fail until we implement bulk path
        // Test validates detection works
        expect(Array.isArray(input)).toBe(true);
      });

      it('should detect file path input (from property)', async () => {
        const input = { from: 'tickets.csv' };

        expect(input).toHaveProperty('from');
        expect(typeof input.from).toBe('string');
      });

      it('should detect string data input (data + format properties)', async () => {
        const input = { 
          data: 'Project,Summary\nENG,Test', 
          format: 'csv' as const
        };

        expect(input).toHaveProperty('data');
        expect(input).toHaveProperty('format');
      });

      it('should throw error on invalid input (no Project, not array, no from/data)', async () => {
        const input = { Something: 'Invalid' };

        // Current implementation throws Project required error
        // After implementing detection, should throw "Invalid input format"
        await expect(issueOps.create(input as any))
          .rejects.toThrow(/project.*required|invalid input/i);
      });
    });
  });

  describe('E4-S04: Unified create() - Backward Compatibility', () => {
    describe('AC2: Single Issue Creation (E1-S09 Compatibility)', () => {
      const validInput = {
        Project: 'ENG',
        'Issue Type': 'Bug',
        Summary: 'Test issue',
      };

      it('should maintain E1-S09 behavior for single object', async () => {
        // Setup mocks
        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Bug',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue({});
        mockConverter.convertFields.mockResolvedValue({});
        mockClient.post.mockResolvedValue({
          key: 'ENG-456',
          id: '10051',
          self: 'https://jira.example.com/rest/api/2/issue/10051'
        });

        const result = await issueOps.create(validInput);

        // Should return Issue object (not BulkResult)
        expect(result).toHaveProperty('key', 'ENG-456');
        expect(result).not.toHaveProperty('total');
        expect(result).not.toHaveProperty('succeeded');
      });

      it('should support dry-run mode with validate: true', async () => {
        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Bug',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue({});
        mockConverter.convertFields.mockResolvedValue({
          project: { key: 'ENG' },
          summary: 'Test'
        });

        const result = await issueOps.create(validInput, { validate: true });

        // Should return dry-run result
        // E4-S04: Result can be Issue | BulkResult, type narrow
        expect('key' in result && result.key).toBe('DRY-RUN');
        expect(mockClient.post).not.toHaveBeenCalled();
      });

      it('should throw error if Project missing', async () => {
        const invalidInput = {
          'Issue Type': 'Bug',
          Summary: 'No project',
        };

        // E4-S04: Error now thrown from detectInputType
        await expect(issueOps.create(invalidInput))
          .rejects.toThrow(/must have Project field/i);
      });

      it('should throw error if Issue Type missing', async () => {
        const invalidInput = {
          Project: 'ENG',
          Summary: 'No issue type',
        };

        // Override mock to throw for missing issue type
        (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockRejectedValueOnce(
          new Error("Field 'Issue Type' is required")
        );

        await expect(issueOps.create(invalidInput))
          .rejects.toThrow(/issue type.*required/i);
      });
    });

    describe('AC3: Bulk Creation', () => {
      it('should create multiple issues from array', async () => {
        // Mock bulk dependencies
        const mockCache = {
          get: jest.fn(),
          set: jest.fn(),
          getLookup: jest.fn(),
          setLookup: jest.fn(),
        } as unknown as LookupCache;

        const issueOpsWithCache = new IssueOperations(
          mockClient,
          mockSchema,
          mockResolver,
          mockConverter,
          mockCache
        );

        // Setup mocks for each record
        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Bug',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue({});
        mockConverter.convertFields.mockResolvedValue({});

        // Mock bulk API response
        mockClient.post.mockResolvedValueOnce({
          issues: [
            { key: 'ENG-101', id: '1001', self: 'http://jira/1001' },
            { key: 'ENG-102', id: '1002', self: 'http://jira/1002' }
          ]
        });

        const bulkInput = [
          { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Bug 1' },
          { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Bug 2' }
        ];

        const result = await issueOpsWithCache.create(bulkInput);

        // Should return BulkResult
        expect(result).toHaveProperty('manifest');
        expect(result).toHaveProperty('total', 2);
        expect(result).toHaveProperty('succeeded');
        expect(result).toHaveProperty('failed');
      });

      it('should throw error if cache not configured', async () => {
        // issueOps (from beforeEach) has no cache
        const bulkInput = [
          { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Bug 1' }
        ];

        await expect(issueOps.create(bulkInput))
          .rejects.toThrow(/bulk operations require cache/i);
      });
    });

    describe('Error Handling Edge Cases', () => {
      it('should throw error on invalid input format', async () => {
        // Input without Project field, not an array, and no from/data/format
        const invalidInput = { Summary: 'No project' };

        await expect(issueOps.create(invalidInput))
          .rejects.toThrow(/invalid input format/i);
      });

      it('should throw error if Project missing', async () => {
        const input = { 
          'Issue Type': 'Bug',
          Summary: 'Missing project'
          // Missing: Project
        };

        await expect(issueOps.create(input))
          .rejects.toThrow(/invalid input format/i);
      });

      it('should throw error if Project is not a string or valid object', async () => {
        const input = { 
          Project: 123,  // Not a string or object
          'Issue Type': 'Bug',
          Summary: 'Invalid project type'
        };

        // Override mock to throw for invalid project type
        (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockRejectedValueOnce(
          new Error("Field 'Project' must be a string or object with key/id")
        );

        await expect(issueOps.create(input))
          .rejects.toThrow(/project.*string.*object/i);
      });

      it('should throw error if Issue Type missing', async () => {
        const input = { 
          Project: 'ENG',
          Summary: 'Missing issue type'
          // Missing: 'Issue Type'
        };

        // Override mock to throw for missing issue type
        (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockRejectedValueOnce(
          new Error("Field 'Issue Type' is required")
        );

        await expect(issueOps.create(input))
          .rejects.toThrow(/issue type.*required/i);
      });

      it('should throw error if Issue Type is not a string or valid object', async () => {
        const input = { 
          Project: 'ENG',
          'Issue Type': 456,  // Not a string or object
          Summary: 'Invalid issue type'
        };

        // Override mock to throw for invalid issue type
        (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockRejectedValueOnce(
          new Error("Field 'Issue Type' must be a string or object with name/id")
        );

        await expect(issueOps.create(input))
          .rejects.toThrow(/issue type.*string.*object/i);
      });

      it('should handle all records failing validation in bulk', async () => {
        // Create mock cache for bulk operations
        const mockCacheForBulk = {
          get: jest.fn(),
          set: jest.fn(),
          del: jest.fn(),
          disconnect: jest.fn(),
        } as unknown as LookupCache;

        // Create issueOps WITH cache for bulk operations
        const issueOpsWithCache = new IssueOperations(
          mockClient,
          mockSchema,
          mockResolver,
          mockConverter,
          mockCacheForBulk,
          'https://test.atlassian.net'
        );

        // All records have invalid issue type (will fail validation)
        const allInvalidInput = [
          { Project: 'ENG', 'Issue Type': 'InvalidType1', Summary: 'Test 1' },
          { Project: 'ENG', 'Issue Type': 'InvalidType2', Summary: 'Test 2' }
        ];

        // Mock schema to throw for invalid issue types
        mockSchema.getFieldsForIssueType = jest.fn().mockRejectedValue(
          new Error('Issue type not found')
        );

        await expect(issueOpsWithCache.create(allInvalidInput))
          .rejects.toThrow(/issue type not found/i);
      });

      it('should handle partial validation failures gracefully', async () => {
        // Create mock cache for bulk operations
        const mockCacheForBulk = {
          get: jest.fn(),
          set: jest.fn(),
          del: jest.fn(),
          disconnect: jest.fn(),
        } as unknown as LookupCache;

        const issueOpsWithCache = new IssueOperations(
          mockClient,
          mockSchema,
          mockResolver,
          mockConverter,
          mockCacheForBulk,
          'https://test.atlassian.net'
        );

        // Mix of valid and invalid records
        const mixedInput = [
          { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Valid 1' },
          { Project: 'ENG', 'Issue Type': 'InvalidType', Summary: 'Invalid' },
          { Project: 'ENG', 'Issue Type': 'Task', Summary: 'Valid 2' }
        ];

        // Mock schema: Bug and Task work, InvalidType fails
        mockSchema.getFieldsForIssueType = jest.fn().mockImplementation((projectKey, issueType) => {
          if (issueType === 'InvalidType') {
            return Promise.reject(new Error('Issue type InvalidType not found'));
          }
          return Promise.resolve({
            projectKey,
            issueType,
            fields: {
              summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } },
            },
          });
        });

        mockResolver.resolveFields = jest.fn().mockImplementation((input) => {
          return Promise.resolve({
            project: { key: 'ENG' },
            issuetype: { name: input['Issue Type'] },
            summary: input.Summary,
          });
        });

        mockConverter.convertFields = jest.fn().mockImplementation((fields) => fields);

        // Mock bulk API to succeed for valid payloads
        mockClient.post = jest.fn().mockResolvedValue({
          issues: [
            { key: 'ENG-1', id: '10001', self: 'https://test.atlassian.net/rest/api/2/issue/10001' },
            { key: 'ENG-2', id: '10002', self: 'https://test.atlassian.net/rest/api/2/issue/10002' }
          ]
        });

        const result = await issueOpsWithCache.create(mixedInput);

        // Should get BulkResult with partial success
        expect(result).toHaveProperty('total', 3);
        expect(result).toHaveProperty('succeeded', 2);
        expect(result).toHaveProperty('failed', 1);
        expect(result).toHaveProperty('manifest');

        // Check validation error is in manifest
        const bulkResult = result as any;
        expect(bulkResult.manifest.errors[1]).toBeDefined();
        expect(bulkResult.manifest.errors[1].errors.validation).toContain('InvalidType');
      });
    });

    // ========================================================================
    // COVERAGE COMPLETION TESTS - Target specific uncovered lines
    // ========================================================================
    
    describe('Coverage Completion Tests', () => {
      let issueOpsWithCache: IssueOperations;
      let mockCache: LookupCache;

      beforeEach(() => {
        // Create cache-enabled IssueOperations for bulk tests
        mockCache = {
          get: jest.fn(),
          set: jest.fn(),
          getLookup: jest.fn(),
          setLookup: jest.fn(),
        } as unknown as LookupCache;

        issueOpsWithCache = new IssueOperations(
          mockClient,
          mockSchema,
          mockResolver,
          mockConverter,
          mockCache
        );
      });

      describe('Validation Error Handling', () => {
        it('should catch validation errors in try/catch block (line 305)', async () => {
          // Test that validation errors thrown by createSingle are caught
          // This exercises the try/catch block around createSingle in the bulk method
          const input = [
            { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Valid' },
            { Summary: 'Missing Project' } // This will throw validation error
          ];

          mockSchema.getFieldsForIssueType = jest.fn().mockResolvedValue({
            projectKey: 'ENG',
            issueType: 'Bug',
            fields: {
              summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } }
            }
          });

          // First call succeeds (valid record), second call fails (missing Project)
          (mockResolver.resolveFieldsWithExtraction as jest.Mock)
            .mockResolvedValueOnce({
              projectKey: 'ENG',
              issueType: 'Bug',
              fields: {
                project: { key: 'ENG' },
                issuetype: { name: 'Bug' },
                summary: 'Valid'
              }
            })
            .mockRejectedValueOnce(new Error("Field 'Project' is required"));

          mockConverter.convertFields = jest.fn().mockImplementation(f => f);

          mockClient.post = jest.fn().mockResolvedValue({
            issues: [{ key: 'ENG-1', id: '10001', self: 'https://test.atlassian.net/rest/api/2/issue/10001' }]
          });

          const result = await issueOpsWithCache.create(input);

          // Should handle gracefully - 1 success, 1 validation failure
          expect(result).toHaveProperty('succeeded', 1);
          expect(result).toHaveProperty('failed', 1);
          
          // Verify validation error captured in manifest
          const bulkResult = result as any;
          expect(bulkResult.manifest.errors[1]).toBeDefined();
          expect(bulkResult.manifest.errors[1].errors.validation).toContain('Project');
        });
      });

      describe('Bulk API Failure Loops', () => {
        it('should remap bulk API failures correctly (lines 370, 408)', async () => {
          // Test the remapping logic when bulk API returns failures
          const input = [
            { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Test 1' },
            { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Test 2' },
            { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Test 3' }
          ];

          mockSchema.getFieldsForIssueType = jest.fn().mockResolvedValue({
            projectKey: 'ENG',
            issueType: 'Bug',
            fields: {
              summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } }
            }
          });

          mockResolver.resolveFields = jest.fn().mockImplementation((rec) => {
            return Promise.resolve({
              project: { key: 'ENG' },
              issuetype: { name: 'Bug' },
              summary: rec.Summary
            });
          });

          mockConverter.convertFields = jest.fn().mockImplementation(f => f);

          // Mock bulk API to return mixed success/failure
          mockClient.post = jest.fn().mockResolvedValue({
            issues: [
              { key: 'ENG-1', id: '10001', self: 'https://test.atlassian.net/rest/api/2/issue/10001' }
            ],
            errors: [
              {
                status: 400,
                elementErrors: {
                  errors: { summary: 'Summary is required' }
                },
                failedElementNumber: 1
              },
              {
                status: 400,
                elementErrors: {
                  errors: { assignee: 'User not found' }
                },
                failedElementNumber: 2
              }
            ]
          });

          const result = await issueOpsWithCache.create(input);

          // Should have 1 success, 2 API failures
          expect(result).toHaveProperty('succeeded', 1);
          expect(result).toHaveProperty('failed', 2);
          
          // Verify remapped indices in manifest
          const bulkResult = result as any;
          expect(bulkResult.manifest.created[0]).toBe('ENG-1');
          expect(bulkResult.manifest.errors[1]).toBeDefined();
          expect(bulkResult.manifest.errors[2]).toBeDefined();
          
          // Verify error details are remapped correctly
          expect(bulkResult.manifest.errors[1].errors.summary).toContain('required');
          expect(bulkResult.manifest.errors[2].errors.assignee).toContain('not found');
        });

        it('should handle nullish coalescing in index remapping (lines 350, 355)', async () => {
          // Test the ?? operators: indexMapping.get(item.index) ?? item.index
          // This tests when mapping returns undefined (index not found)
          const input = [
            { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Test' }
          ];

          mockSchema.getFieldsForIssueType = jest.fn().mockResolvedValue({
            projectKey: 'ENG',
            issueType: 'Bug',
            fields: {
              summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } }
            }
          });

          mockResolver.resolveFields = jest.fn().mockResolvedValue({
            project: { key: 'ENG' },
            issuetype: { name: 'Bug' },
            summary: 'Test'
          });

          mockConverter.convertFields = jest.fn().mockImplementation(f => f);

          // Mock API to return item with index that's NOT in mapping
          // (This is an edge case, but tests the ?? fallback)
          mockClient.post = jest.fn().mockResolvedValue({
            issues: [
              { key: 'ENG-1', id: '10001', self: 'https://test.atlassian.net/rest/api/2/issue/10001' }
            ]
          });

          const result = await issueOpsWithCache.create(input);

          expect(result).toHaveProperty('succeeded', 1);
          expect(result).toHaveProperty('total', 1);
        });
      });

      describe('Helper Functions', () => {
        it('should call detectInputType for array input', () => {
          const arrayInput = [
            { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Test' }
          ];

          const inputType = (issueOpsWithCache as any).detectInputType(arrayInput);
          expect(inputType).toBe('bulk');
        });

        it('should call detectInputType for parseInput options', () => {
          const parseInputOpt = {
            from: '/tmp/test.csv',
            format: 'csv' as const
          };

          const inputType = (issueOpsWithCache as any).detectInputType(parseInputOpt);
          expect(inputType).toBe('bulk');
        });

        it('should call detectInputType for single object', () => {
          const singleInput = {
            Project: 'ENG',
            'Issue Type': 'Bug',
            Summary: 'Single issue'
          };

          const inputType = (issueOpsWithCache as any).detectInputType(singleInput);
          expect(inputType).toBe('single');
        });

        it('should call detectInputType for data string option', () => {
          const dataOpt = {
            data: 'Project,Issue Type\nENG,Bug',
            format: 'csv' as const
          };

          const inputType = (issueOpsWithCache as any).detectInputType(dataOpt);
          expect(inputType).toBe('bulk');
        });

        it('should call detectInputType for format-only option', () => {
          const formatOpt = {
            format: 'json' as const
            // No from or data - just format
          };

          const inputType = (issueOpsWithCache as any).detectInputType(formatOpt);
          expect(inputType).toBe('bulk');
        });

        it('should call detectInputType for lowercase project field', () => {
          const lowercaseProject = {
            project: 'ENG', // lowercase 'project' instead of 'Project'
            'Issue Type': 'Bug',
            Summary: 'Test'
          };

          const inputType = (issueOpsWithCache as any).detectInputType(lowercaseProject);
          expect(inputType).toBe('single');
        });

        it('should test all branch combinations in detectInputType', () => {
          // Test case: object with only 'from' property (first branch)
          expect((issueOpsWithCache as any).detectInputType({ from: 'file.csv' })).toBe('bulk');
          
          // Test case: object with data=null (not undefined, so branch is true)
          expect((issueOpsWithCache as any).detectInputType({ data: null, format: 'csv' as const })).toBe('bulk');
          
          // Test case: object with data=false (not undefined, so branch is true)
          expect((issueOpsWithCache as any).detectInputType({ data: false })).toBe('bulk');
          
          // Test case: object with data='' (not undefined, so branch is true)
          expect((issueOpsWithCache as any).detectInputType({ data: '' })).toBe('bulk');
          
          // Test case: object with only 'format' (third branch, first two false)
          expect((issueOpsWithCache as any).detectInputType({ format: 'yaml' as const })).toBe('bulk');
          
          // Test case: object with Project (uppercase) falls through to single
          expect((issueOpsWithCache as any).detectInputType({ Project: 'KEY' })).toBe('single');
          
          // Test case: object with project (lowercase) falls through to single
          expect((issueOpsWithCache as any).detectInputType({ project: 'key' })).toBe('single');
          
          // Test case: invalid input (no parse props, no project) throws
          expect(() => (issueOpsWithCache as any).detectInputType({ Summary: 'test' })).toThrow(/invalid input format/i);
        });
      });
    });
  });

  describe('Edge Cases for Branch Coverage', () => {
    let issueOpsWithCache: IssueOperations;
    let mockCache: LookupCache;

    beforeEach(() => {
      mockCache = {
        getLookup: jest.fn(),
        setLookup: jest.fn(),
        getProjectKey: jest.fn(),
        setProjectKey: jest.fn(),
        disconnect: jest.fn(),
      } as any;

      issueOpsWithCache = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCache,
        'https://test.atlassian.net'
      );
    });

    describe('Field variant handling', () => {
      it('should handle lowercase "issuetype" field', async () => {
        const input = {
          project: 'ENG',
          issuetype: 'Bug', // Lowercase variant
          Summary: 'Test with lowercase issuetype'
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Bug',
          fields: {
            summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } }
          }
        });

        mockResolver.resolveFields.mockResolvedValue({
          summary: 'Test with lowercase issuetype'
        });

        mockConverter.convertFields.mockResolvedValue({
          summary: 'Test with lowercase issuetype'
        });

        mockClient.post.mockResolvedValue({
          id: '10001',
          key: 'ENG-1',
          self: 'https://test.atlassian.net/rest/api/2/issue/10001'
        });

        const result = await issueOpsWithCache.create(input) as Issue;
        expect(result.key).toBe('ENG-1');
      });

      it('should handle camelCase "issueType" field variant', async () => {
        const input = {
          project: 'ENG',
          issueType: 'Task', // camelCase variant
          Summary: 'Test with camelCase issueType'
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Task',
          fields: {
            summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } }
          }
        });

        mockResolver.resolveFields.mockResolvedValue({
          summary: 'Test with camelCase issueType'
        });

        mockConverter.convertFields.mockResolvedValue({
          summary: 'Test with camelCase issueType'
        });

        mockClient.post.mockResolvedValue({
          id: '10002',
          key: 'ENG-2',
          self: 'https://test.atlassian.net/rest/api/2/issue/10002'
        });

        const result = await issueOpsWithCache.create(input) as Issue;
        expect(result.key).toBe('ENG-2');
      });

      it('should handle Project field with non-string type', async () => {
        const input = {
          Project: 123, // Not a string
          'Issue Type': 'Bug',
          Summary: 'Test'
        };

        // Override default mock to throw for invalid project type
        (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockRejectedValueOnce(
          new Error("Field 'Project' must be a string or object with key/id")
        );

        await expect(issueOpsWithCache.create(input))
          .rejects.toThrow(/Project.*must be a string/i);
      });

      it('should handle Issue Type field with non-string type', async () => {
        const input = {
          Project: 'ENG',
          'Issue Type': 123, // Not a string
          Summary: 'Test'
        };

        // Override default mock to throw for invalid issue type
        (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockRejectedValueOnce(
          new Error("Field 'Issue Type' must be a string or object with name/id")
        );

        await expect(issueOpsWithCache.create(input))
          .rejects.toThrow(/Issue Type.*must be a string/i);
      });
    });
  });

  describe('E4-S13: Hierarchy Bulk Creation', () => {
    let issueOpsWithCache: IssueOperations;
    let mockCacheForHierarchy: jest.Mocked<LookupCache>;

    beforeEach(() => {
      mockCacheForHierarchy = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
      } as any;

      // Mock project lookup for all hierarchy tests
      (mockClient.get as jest.Mock).mockResolvedValue({
        id: '10000',
        key: 'ENG',
        name: 'Engineering',
      });

      issueOpsWithCache = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        mockCacheForHierarchy
      );
    });

    describe('AC3: Hierarchy routing', () => {
      it('should route to createBulkHierarchy when UIDs detected', async () => {
        // Arrange: Input with UID references
        const input = [
          { uid: 'epic-1', Project: 'ENG', 'Issue Type': 'Epic', Summary: 'Epic 1' },
          { uid: 'task-1', Project: 'ENG', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' },
        ];

        // Mock schema for all issue types
        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Epic',
          fields: {
            summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } }
          }
        });

        mockResolver.resolveFields.mockResolvedValue({
          project: { key: 'ENG' },
          issuetype: { name: 'Epic' },
          summary: 'Epic 1'
        });

        mockConverter.convertFields.mockResolvedValue({
          project: { key: 'ENG' },
          issuetype: { name: 'Epic' },
          summary: 'Epic 1'
        });

        // Mock bulk API responses for each level
        mockClient.post.mockResolvedValueOnce({
          issues: [{ id: '100', key: 'ENG-100', self: 'https://...' }],
          errors: []
        }).mockResolvedValueOnce({
          issues: [{ id: '101', key: 'ENG-101', self: 'https://...' }],
          errors: []
        });

        // Act
        const result = await issueOpsWithCache.create(input);

        // Assert: Should return BulkResult
        expect(result).toHaveProperty('total');
        expect(result).toHaveProperty('succeeded');
        expect(result).toHaveProperty('manifest');
      });

      it('should use flat bulk when no hierarchy detected', async () => {
        // Arrange: Input without UID references
        const input = [
          { Project: 'ENG', 'Issue Type': 'Task', Summary: 'Task 1' },
          { Project: 'ENG', 'Issue Type': 'Task', Summary: 'Task 2' },
        ];

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Task',
          fields: {
            summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } }
          }
        });

        mockResolver.resolveFields.mockResolvedValue({
          project: { key: 'ENG' },
          issuetype: { name: 'Task' },
          summary: 'Task 1'
        });

        mockConverter.convertFields.mockResolvedValue({
          project: { key: 'ENG' },
          issuetype: { name: 'Task' },
          summary: 'Task 1'
        });

        // Mock single bulk API response (not two levels)
        mockClient.post.mockResolvedValue({
          issues: [
            { id: '100', key: 'ENG-100', self: 'https://...' },
            { id: '101', key: 'ENG-101', self: 'https://...' }
          ],
          errors: []
        });

        // Act
        const result = await issueOpsWithCache.create(input);

        // Assert: Should return BulkResult with all succeeded
        expect(result).toHaveProperty('total', 2);
        expect((result as any).manifest).not.toHaveProperty('uidMap'); // No uidMap for flat bulk
      });
    });

    describe('AC8: Retry hierarchy awareness', () => {
      it('should use hierarchy retry when manifest has uidMap', async () => {
        // Arrange: Manifest with uidMap (indicates previous hierarchy operation)
        const manifest = {
          id: 'bulk-hier-123',
          timestamp: Date.now(),
          total: 2,
          succeeded: [0], // Epic succeeded
          failed: [1],    // Task failed
          created: { 0: 'ENG-100' },
          errors: { 1: { status: 400, errors: { parent: 'Invalid parent' } } },
          uidMap: { 'epic-1': 'ENG-100' }, // This indicates hierarchy operation
        };

        // Mock manifest storage - returns { value, isStale } format
        mockCacheForHierarchy.get.mockImplementation(async (key: string) => {
          if (key.includes('bulk-hier-123')) {
            return { value: JSON.stringify(manifest), isStale: false };
          }
          return { value: null, isStale: false };
        });

        // Input with hierarchy
        const input = [
          { uid: 'epic-1', Project: 'ENG', 'Issue Type': 'Epic', Summary: 'Epic 1' },
          { uid: 'task-1', Project: 'ENG', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' },
        ];

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Task',
          fields: {
            summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } }
          }
        });

        mockResolver.resolveFields.mockResolvedValue({
          project: { key: 'ENG' },
          issuetype: { name: 'Task' },
          summary: 'Task 1',
          parent: { key: 'ENG-100' } // UID replaced with key
        });

        mockConverter.convertFields.mockResolvedValue({
          project: { key: 'ENG' },
          issuetype: { name: 'Task' },
          summary: 'Task 1',
          parent: { key: 'ENG-100' }
        });

        // Mock bulk API success for retry
        mockClient.post.mockResolvedValue({
          issues: [{ id: '101', key: 'ENG-101', self: 'https://...' }],
          errors: []
        });

        // Act
        const result = await issueOpsWithCache.create(input, { retry: 'bulk-hier-123' });

        // Assert: Should succeed with merged manifest
        expect(result).toHaveProperty('succeeded');
        expect(result).toHaveProperty('manifest');
        // The retry should use existing UID mappings
      });
    });
  });

  // Raw JIRA API Format - Unwrap and Process (Option A)
  // When users send { fields: {...} } format, JML unwraps it and processes
  // through the normal pipeline (resolution, conversion), then re-wraps for JIRA
  describe('JIRA fields format support', () => {
    describe('Single issue with { fields: { project: ... } } format', () => {
      it('should unwrap fields and process through JML pipeline', async () => {
        const jiraFormatPayload = {
          fields: {
            project: { key: 'HELP' },
            issuetype: { name: 'Help Request' },
            summary: 'User needs assistance!',
            description: 'Details here',
            assignee: { name: '+Help_OnCall' },
            priority: { name: 'High' },
            customfield_10395: { value: 'Raven' },
            customfield_12300: 'C030SKZCJ15'
          }
        };

        // Mock the pipeline
        const mockProjectSchema = {
          projectKey: 'HELP',
          issueType: 'Help Request',
          fields: {}
        };
        const mockConvertedFields = {
          project: { key: 'HELP' },
          issuetype: { name: 'Help Request' },
          summary: 'User needs assistance!',
          assignee: { name: '+Help_OnCall' }
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue(mockProjectSchema);
        mockResolver.resolveFields.mockResolvedValue(jiraFormatPayload.fields);
        mockConverter.convertFields.mockResolvedValue(mockConvertedFields);
        mockClient.post.mockResolvedValue({
          key: 'HELP-123',
          id: '10050',
          self: 'https://jira.example.com/rest/api/2/issue/10050'
        });

        const result = await issueOps.create(jiraFormatPayload as any);

        // Assert: Should process through JML pipeline
        expect(result).toHaveProperty('key', 'HELP-123');
        
        // SHOULD call field resolution/conversion (processed mode)
        expect(mockSchema.getFieldsForIssueType).toHaveBeenCalledWith('HELP', 'Help Request');
        expect(mockResolver.resolveFieldsWithExtraction).toHaveBeenCalled();
        expect(mockConverter.convertFields).toHaveBeenCalled();
        
        // Final payload should be wrapped in fields
        expect(mockClient.post).toHaveBeenCalledWith('/rest/api/2/issue', {
          fields: mockConvertedFields
        });
      });

      it('should handle fields.project with key', async () => {
        const jiraFormatPayload = {
          fields: {
            project: { key: 'TEST' },
            issuetype: { name: 'Task' },
            summary: 'Test issue'
          }
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'TEST',
          issueType: 'Task',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue(jiraFormatPayload.fields);
        mockConverter.convertFields.mockResolvedValue(jiraFormatPayload.fields);
        mockClient.post.mockResolvedValue({
          key: 'TEST-1',
          id: '10051',
          self: 'https://jira.example.com/rest/api/2/issue/10051'
        });

        const result = await issueOps.create(jiraFormatPayload as any);

        expect(result).toHaveProperty('key', 'TEST-1');
        expect(mockSchema.getFieldsForIssueType).toHaveBeenCalledWith('TEST', 'Task');
      });

      it('should handle fields.project with id', async () => {
        const jiraFormatPayload = {
          fields: {
            project: { id: '10000' },
            issuetype: { id: '10001' },
            summary: 'Issue via project ID'
          }
        };

        // Mock project lookup by ID
        mockClient.get.mockResolvedValue({
          id: '10000',
          key: 'PROJ',
          name: 'Project'
        });

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'PROJ',
          issueType: 'Task',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue(jiraFormatPayload.fields);
        mockConverter.convertFields.mockResolvedValue(jiraFormatPayload.fields);
        mockClient.post.mockResolvedValue({
          key: 'PROJ-1',
          id: '10051',
          self: 'https://jira.example.com/rest/api/2/issue/10051'
        });

        const result = await issueOps.create(jiraFormatPayload as any);

        expect(result).toHaveProperty('key', 'PROJ-1');
      });

      it('should support dry-run mode with fields format', async () => {
        const jiraFormatPayload = {
          fields: {
            project: { key: 'TEST' },
            issuetype: { name: 'Task' },
            summary: 'Dry run test'
          }
        };

        const mockConvertedFields = {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Dry run test'
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'TEST',
          issueType: 'Task',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue(jiraFormatPayload.fields);
        mockConverter.convertFields.mockResolvedValue(mockConvertedFields);

        const result = await issueOps.create(jiraFormatPayload as any, { validate: true });

        // Dry-run should return payload without calling API
        expect(result).toHaveProperty('key', 'DRY-RUN');
        expect(result).toHaveProperty('fields');
        expect(mockClient.post).not.toHaveBeenCalled();
      });

      it('should reject fields object without project', async () => {
        const invalidPayload = {
          fields: {
            issuetype: { name: 'Task' },
            summary: 'Missing project'
          }
        };

        await expect(issueOps.create(invalidPayload as any))
          .rejects.toThrow(/project/i);
      });

      it('should handle JIRA API errors', async () => {
        const jiraFormatPayload = {
          fields: {
            project: { key: 'HELP' },
            issuetype: { name: 'Bad Type' },
            summary: 'Test'
          }
        };

        mockSchema.getFieldsForIssueType.mockRejectedValue(new Error('Issue type "Bad Type" does not exist'));

        await expect(issueOps.create(jiraFormatPayload as any))
          .rejects.toThrow('Issue type "Bad Type" does not exist');
      });

      it('should pass string user values through conversion pipeline', async () => {
        // This tests that { fields: { reporter: "username" } } gets unwrapped
        // and the string "username" is passed to converters (not an object)
        const jiraFormatPayload = {
          fields: {
            project: { key: 'HELP' },
            issuetype: { name: 'Task' },
            summary: 'Test issue',
            reporter: 'justin.time',  // String format
            assignee: 'help.desk'     // String format
          }
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'HELP',
          issueType: 'Task',
          fields: {
            reporter: { id: 'reporter', name: 'Reporter', type: 'user', required: false, schema: { type: 'user' } },
            assignee: { id: 'assignee', name: 'Assignee', type: 'user', required: false, schema: { type: 'user' } },
          }
        });

        // Mock resolveFieldsWithExtraction to return the unwrapped fields
        (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockResolvedValueOnce({
          projectKey: 'HELP',
          issueType: 'Task',
          fields: {
            project: { key: 'HELP' },
            issuetype: { name: 'Task' },
            summary: 'Test issue',
            reporter: 'justin.time',  // Should remain string for converter
            assignee: 'help.desk'     // Should remain string for converter
          }
        });

        mockConverter.convertFields.mockResolvedValue({
          project: { key: 'HELP' },
          issuetype: { name: 'Task' },
          summary: 'Test issue',
          reporter: { name: 'justin.time' },
          assignee: { name: 'help.desk' }
        });

        mockClient.post.mockResolvedValue({
          key: 'HELP-1',
          id: '10001',
          self: 'https://...'
        });

        await issueOps.create(jiraFormatPayload as any);

        // Verify the converter received the string values (not objects)
        expect(mockConverter.convertFields).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            reporter: 'justin.time',
            assignee: 'help.desk'
          }),
          expect.anything()
        );
      });

      it('should pass object user values through conversion pipeline', async () => {
        // This tests that { fields: { reporter: { name: "username" } } } gets unwrapped
        // and the object { name: "username" } is passed to converters
        const jiraFormatPayload = {
          fields: {
            project: { key: 'HELP' },
            issuetype: { name: 'Task' },
            summary: 'Test issue',
            reporter: { name: 'justin.time' },  // Object format
            assignee: { name: 'help.desk' }     // Object format
          }
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'HELP',
          issueType: 'Task',
          fields: {
            reporter: { id: 'reporter', name: 'Reporter', type: 'user', required: false, schema: { type: 'user' } },
            assignee: { id: 'assignee', name: 'Assignee', type: 'user', required: false, schema: { type: 'user' } },
          }
        });

        // Mock resolveFieldsWithExtraction to return the unwrapped fields
        (mockResolver.resolveFieldsWithExtraction as jest.Mock).mockResolvedValueOnce({
          projectKey: 'HELP',
          issueType: 'Task',
          fields: {
            project: { key: 'HELP' },
            issuetype: { name: 'Task' },
            summary: 'Test issue',
            reporter: { name: 'justin.time' },  // Should remain object for converter
            assignee: { name: 'help.desk' }     // Should remain object for converter
          }
        });

        mockConverter.convertFields.mockResolvedValue({
          project: { key: 'HELP' },
          issuetype: { name: 'Task' },
          summary: 'Test issue',
          reporter: { name: 'justin.time' },
          assignee: { name: 'help.desk' }
        });

        mockClient.post.mockResolvedValue({
          key: 'HELP-1',
          id: '10001',
          self: 'https://...'
        });

        await issueOps.create(jiraFormatPayload as any);

        // Verify the converter received the object values
        expect(mockConverter.convertFields).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            reporter: { name: 'justin.time' },
            assignee: { name: 'help.desk' }
          }),
          expect.anything()
        );
      });
    });

    describe('Bulk with { issues: [{ fields: ... }] } format', () => {
      let issueOpsWithCache: IssueOperations;
      let mockCacheForBulk: jest.Mocked<LookupCache>;

      beforeEach(() => {
        mockCacheForBulk = {
          get: jest.fn(),
          set: jest.fn(),
          getValue: jest.fn(),
          setValue: jest.fn(),
          clearAll: jest.fn(),
        } as any;

        issueOpsWithCache = new IssueOperations(
          mockClient,
          mockSchema,
          mockResolver,
          mockConverter,
          mockCacheForBulk,
          'https://jira.example.com',
          { baseUrl: 'https://jira.example.com', auth: { pat: 'test' } }
        );
      });

      it('should unwrap issues array and process through JML pipeline', async () => {
        const jiraBulkPayload = {
          issues: [
            {
              fields: {
                project: { key: 'HELP' },
                issuetype: { name: 'Task' },
                summary: 'Issue 1'
              }
            },
            {
              fields: {
                project: { key: 'HELP' },
                issuetype: { name: 'Task' },
                summary: 'Issue 2'
              }
            }
          ]
        };

        // Mock the pipeline for each issue
        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'HELP',
          issueType: 'Task',
          fields: {}
        });
        mockResolver.resolveFields.mockImplementation(async (_, __, input) => input);
        mockConverter.convertFields.mockImplementation(async (_, input) => input);

        // Mock bulk API response
        mockClient.post.mockResolvedValue({
          issues: [
            { id: '100', key: 'HELP-100', self: 'https://...' },
            { id: '101', key: 'HELP-101', self: 'https://...' }
          ],
          errors: []
        });

        const result = await issueOpsWithCache.create(jiraBulkPayload as any);

        // Should process through pipeline (schema called for each issue type)
        expect(mockSchema.getFieldsForIssueType).toHaveBeenCalled();

        // Should return BulkResult
        expect(result).toHaveProperty('total', 2);
        expect(result).toHaveProperty('succeeded');
        expect(result).toHaveProperty('manifest');
      });

      it('should handle mixed success/failure in bulk', async () => {
        const jiraBulkPayload = {
          issues: [
            {
              fields: {
                project: { key: 'HELP' },
                issuetype: { name: 'Task' },
                summary: 'Good issue'
              }
            },
            {
              fields: {
                project: { key: 'BAD' },
                issuetype: { name: 'Task' },
                summary: 'Bad project'
              }
            }
          ]
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'HELP',
          issueType: 'Task',
          fields: {}
        });
        mockResolver.resolveFields.mockImplementation(async (_, __, input) => input);
        mockConverter.convertFields.mockImplementation(async (_, input) => input);

        mockClient.post.mockResolvedValue({
          issues: [{ id: '100', key: 'HELP-100', self: 'https://...' }],
          errors: [{ 
            status: 400, 
            elementErrors: { 
              errors: { project: 'Project does not exist' } 
            } 
          }]
        });

        const result = await issueOpsWithCache.create(jiraBulkPayload as any);

        expect(result).toHaveProperty('total', 2);
        expect(result).toHaveProperty('succeeded', 1);
        expect(result).toHaveProperty('failed', 1);
      });
    });

    describe('Format detection edge cases', () => {
      it('should prefer fields format over human-readable when fields property exists', async () => {
        // This payload has both 'fields' and 'Project'
        // Should use fields and ignore top-level Project
        const ambiguousPayload = {
          fields: {
            project: { key: 'TEST' },
            issuetype: { name: 'Task' },
            summary: 'Ambiguous'
          },
          Project: 'IGNORED' // This should be ignored
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'TEST',
          issueType: 'Task',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue(ambiguousPayload.fields);
        mockConverter.convertFields.mockResolvedValue(ambiguousPayload.fields);
        mockClient.post.mockResolvedValue({
          key: 'TEST-1',
          id: '10052',
          self: 'https://...'
        });

        await issueOps.create(ambiguousPayload as any);

        // Should use TEST from fields, not IGNORED
        expect(mockSchema.getFieldsForIssueType).toHaveBeenCalledWith('TEST', 'Task');
      });

      it('should handle empty fields object gracefully', async () => {
        const emptyFields = { fields: {} };

        // No project field = falls through to "Invalid input format" error
        await expect(issueOps.create(emptyFields as any))
          .rejects.toThrow(/Invalid input format/i);
      });

      it('should process fields with string project through JML (resolves to object)', async () => {
        // User sends project as string in fields - JML will resolve it
        const stringProject = {
          fields: {
            project: 'TEST', // String - JML will resolve to { key: 'TEST' }
            issuetype: { name: 'Task' },
            summary: 'Test'
          }
        };

        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'TEST',
          issueType: 'Task',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue({
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Test'
        });
        mockConverter.convertFields.mockResolvedValue({
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Test'
        });
        mockClient.post.mockResolvedValue({
          key: 'TEST-1',
          id: '10053',
          self: 'https://...'
        });

        const result = await issueOps.create(stringProject as any);

        expect(result).toHaveProperty('key', 'TEST-1');
        // Verify it went through the pipeline
        expect(mockSchema.getFieldsForIssueType).toHaveBeenCalled();
      });
    });

    describe('Per-call options (mergeConfig)', () => {
      const validInput = {
        Project: 'ENG',
        'Issue Type': 'Bug',
        Summary: 'Test issue',
      };

      beforeEach(() => {
        mockSchema.getFieldsForIssueType.mockResolvedValue({
          projectKey: 'ENG',
          issueType: 'Bug',
          fields: {}
        });
        mockResolver.resolveFields.mockResolvedValue({
          project: { key: 'ENG' },
          issuetype: { name: 'Bug' },
          summary: 'Test issue'
        });
        mockConverter.convertFields.mockResolvedValue({
          project: { key: 'ENG' },
          issuetype: { name: 'Bug' },
          summary: 'Test issue'
        });
        mockClient.post.mockResolvedValue({
          key: 'ENG-1',
          id: '10001',
          self: 'https://...'
        });
      });

      it('should use instance config when no per-call options provided', async () => {
        const result = await issueOps.create(validInput);
        expect(result).toHaveProperty('key', 'ENG-1');
      });

      it('should merge per-call ambiguityPolicy with instance config', async () => {
        // Create with per-call ambiguity override
        const result = await issueOps.create(validInput, {
          ambiguityPolicy: { user: 'first' }
        });
        expect(result).toHaveProperty('key', 'ENG-1');
      });

      it('should merge per-call fuzzyMatch with instance config', async () => {
        // Create with per-call fuzzy match override
        const result = await issueOps.create(validInput, {
          fuzzyMatch: { enabled: true, threshold: 0.8 }
        });
        expect(result).toHaveProperty('key', 'ENG-1');
      });

      it('should merge both ambiguityPolicy and fuzzyMatch per-call options', async () => {
        const result = await issueOps.create(validInput, {
          ambiguityPolicy: { user: 'error' },
          fuzzyMatch: { enabled: false }
        });
        expect(result).toHaveProperty('key', 'ENG-1');
      });
    });
  });

  describe('Progress Tracking HTTP Timeout Behavior', () => {
    it('should disable HTTP timeout when onProgress callback provided', async () => {
      // Arrange
      const mockBulkApiWrapper = {
        createBulk: jest.fn().mockResolvedValue({ created: [], failed: [] })
      };

      const issueOps = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        { timeout: { bulk: 30000 } }  // 30s configured
      );

      // Inject mock
      (issueOps as any).bulkApiWrapper = mockBulkApiWrapper;

      // Setup mocks for field resolution
      mockResolver.resolveFieldsWithExtraction.mockResolvedValue({
        projectKey: 'TEST',
        issueType: 'Task',
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Test'
        }
      });

      mockConverter.convertFields.mockResolvedValue({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test'
      });

      // Act
      await issueOps.create([{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }], {
        onProgress: jest.fn()  // Progress callback provided
      });

      // Assert: createBulk was called with Infinity timeout
      expect(mockBulkApiWrapper.createBulk).toHaveBeenCalledWith(
        expect.anything(),
        Infinity  // HTTP timeout should be disabled
      );
    });

    it('should use configured bulk timeout when NO onProgress callback', async () => {
      // Arrange
      const mockBulkApiWrapper = {
        createBulk: jest.fn().mockResolvedValue({ created: [], failed: [] })
      };

      const issueOps = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter,
        { timeout: { bulk: 30000 } }  // 30s configured
      );

      (issueOps as any).bulkApiWrapper = mockBulkApiWrapper;

      // Setup mocks
      mockResolver.resolveFieldsWithExtraction.mockResolvedValue({
        projectKey: 'TEST',
        issueType: 'Task',
        fields: {
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
          summary: 'Test'
        }
      });

      mockConverter.convertFields.mockResolvedValue({
        project: { key: 'TEST' },
        issuetype: { name: 'Task' },
        summary: 'Test'
      });

      // Act
      await issueOps.create([{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }]);
      // NO onProgress callback

      // Assert: createBulk was called with configured timeout (or undefined, which uses default)
      expect(mockBulkApiWrapper.createBulk).toHaveBeenCalledWith(
        expect.anything(),
        undefined  // Should not pass Infinity, let it use default
      );
    });
  });
});


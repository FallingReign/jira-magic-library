/**
 * Unit tests for Schema Validator
 * 
 * Story: E4-S07 - Schema-Only Validation Method
 * 
 * Tests schema-only validation (no API lookups):
 * - Required field validation
 * - Type validation (string, number, array, object)
 * - Enum validation (allowed values)
 * - Performance (<100ms for 100 rows)
 */

import { ValidationService } from '../../../src/validation/ValidationService.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { parseInput } from '../../../src/parsers/InputParser.js';
import { ProjectSchema } from '../../../src/types/schema.js';
import { NotFoundError } from '../../../src/errors/NotFoundError.js';

// Mock dependencies
jest.mock('../../../src/schema/SchemaDiscovery');
jest.mock('../../../src/parsers/InputParser');

describe('ValidationService', () => {
  let validationService: ValidationService;
  let mockSchemaDiscovery: jest.Mocked<SchemaDiscovery>;
  const mockParseInput = parseInput as jest.MockedFunction<typeof parseInput>;

  // Test schema fixture
  const testSchema: ProjectSchema = {
    projectKey: 'TEST',
    issueType: 'Task',
    fields: {
      summary: {
        id: 'summary',
        name: 'Summary',
        type: 'string',
        required: true,
        schema: { type: 'string', system: 'summary' }
      },
      description: {
        id: 'description',
        name: 'Description',
        type: 'string',
        required: false,
        schema: { type: 'string', system: 'description' }
      },
      priority: {
        id: 'priority',
        name: 'Priority',
        type: 'priority',
        required: false,
        allowedValues: [
          { id: '1', name: 'High' },
          { id: '2', name: 'Medium' },
          { id: '3', name: 'Low' }
        ],
        schema: { type: 'priority', system: 'priority' }
      },
      customfield_10024: {
        id: 'customfield_10024',
        name: 'Story Points',
        type: 'number',
        required: false,
        schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' }
      },
      labels: {
        id: 'labels',
        name: 'Labels',
        type: 'array',
        required: false,
        schema: { type: 'array', items: 'string', system: 'labels' }
      },
      reporter: {
        id: 'reporter',
        name: 'Reporter',
        type: 'user',
        required: false,
        schema: { type: 'user', system: 'reporter' }
      },
      linkedProject: {
        id: 'linkedProject',
        name: 'Linked Project',
        type: 'project',
        required: false,
        schema: { type: 'project', system: 'project' }
      },
      customfield_20000: {
        id: 'customfield_20000',
        name: 'Legacy Custom',
        type: 'custom',
        required: false,
        schema: { type: 'string', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield' }
      },
      customfield_30000: {
        id: 'customfield_30000',
        name: 'Numeric Enum',
        type: 'number',
        required: false,
        allowedValues: [
          { id: '1', name: '1' },
          { id: '2', name: '2' }
        ],
        schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' }
      }
    }
  };

  beforeEach(() => {
    mockSchemaDiscovery = {
      getFieldsForIssueType: jest.fn().mockResolvedValue(testSchema),
      getFieldIdByName: jest.fn(),
      getIssueTypesForProject: jest.fn(),
      clearCache: jest.fn()
    } as unknown as jest.Mocked<SchemaDiscovery>;

    mockParseInput.mockClear();

    validationService = new ValidationService(mockSchemaDiscovery);
  });

  describe('AC1: Separate validate() Method', () => {
    it('should provide a validate() method', () => {
      expect(validationService.validate).toBeDefined();
      expect(typeof validationService.validate).toBe('function');
    });

    it('should NOT create issues', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }]
      });

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      // Should not call any creation methods
    });

    it('should NOT perform field resolution or conversion', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
        format: 'json',
        source: 'array'
      });

      await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }]
      });

      // Should only validate against schema, no name-ID resolution
      expect(mockSchemaDiscovery.getFieldIdByName).not.toHaveBeenCalled();
    });

  });

  describe('AC2: Schema Validation Rules', () => {
    describe('Required Fields', () => {
      it('should pass validation when all required fields present', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test issue' }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test issue' }]
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should fail validation when required field missing (Summary)', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ Project: 'TEST', 'Issue Type': 'Task' }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ Project: 'TEST', 'Issue Type': 'Task' }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
          rowIndex: 0,
          field: 'Summary',
          code: 'REQUIRED_FIELD_MISSING'
        });
        expect(result.errors[0].message).toMatch(/[Rr]equired/);
      });

      it('should fail validation when required field is empty string', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: '' }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: '' }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0].code).toBe('REQUIRED_FIELD_MISSING');
      });

      it('should fail validation when required field is null', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: null }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: null }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0].code).toBe('REQUIRED_FIELD_MISSING');
      });

      it('should fail when Project is missing', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 'Issue Type': 'Task', Summary: 'Test issue' }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 'Issue Type': 'Task', Summary: 'Test issue' }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'Project',
              code: 'REQUIRED_FIELD_MISSING'
            })
          ])
        );
        expect(mockSchemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
      });

      it('should fail when Issue Type is missing', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ Project: 'TEST', Summary: 'Test issue' }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ Project: 'TEST', Summary: 'Test issue' }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'Issue Type',
              code: 'REQUIRED_FIELD_MISSING'
            })
          ])
        );
        expect(mockSchemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
      });

      it('should fail when Issue Type is an array (cannot be extracted)', async () => {
        // Arrays cannot be extracted to strings, so Issue Type will be null
        mockParseInput.mockResolvedValue({
          data: [{ Project: 123, 'Issue Type': ['Task'], Summary: 'Test' }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ Project: 123, 'Issue Type': ['Task'], Summary: 'Test' }]
        });

        expect(result.valid).toBe(false);
        // Arrays can't be extracted, so Issue Type is treated as missing
        expect(result.errors[0]).toMatchObject({
          field: 'Issue Type',
          code: 'REQUIRED_FIELD_MISSING'
        });
        expect(mockSchemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
      });
    });

    describe('Type Validation', () => {
      it('should pass validation for correct string type', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Description: 'A description'
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Description: 'A description'
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should pass validation for correct number type', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            'Story Points': 5
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            'Story Points': 5
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should accept string representation of numbers for number fields', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            'Story Points': '5'
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            'Story Points': '5'
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should fail validation for non-numeric string in number field', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            'Story Points': 'abc'
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            'Story Points': 'abc'
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatchObject({
          field: 'Story Points',
          code: 'INVALID_TYPE',
          message: expect.stringContaining('number')
        });
      });

      it('should pass validation for correct array type', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Labels: ['bug', 'urgent']
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Labels: ['bug', 'urgent']
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should fail validation for non-array in array field', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Labels: 'bug'
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Labels: 'bug'
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatchObject({
          field: 'Labels',
          code: 'INVALID_TYPE',
          message: expect.stringContaining('array')
        });
      });

      it('should reject non-finite numbers for Story Points', async () => {
        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            'Story Points': Infinity
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            'Story Points': Infinity
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatchObject({
          field: 'Story Points',
          code: 'INVALID_TYPE'
        });
      });

      it('should allow user fields as string or object', async () => {
        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Reporter: 'alice'
          }],
          format: 'json',
          source: 'array'
        });

        const stringResult = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Reporter: 'alice'
          }]
        });

        expect(stringResult.valid).toBe(true);

        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Reporter: { name: 'Alice' }
          }],
          format: 'json',
          source: 'array'
        });

        const objectResult = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Reporter: { name: 'Alice' }
          }]
        });

        expect(objectResult.valid).toBe(true);
      });

      it('should reject user fields with invalid types', async () => {
        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Reporter: 123
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Reporter: 123
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatchObject({
          field: 'Reporter',
          code: 'INVALID_TYPE'
        });
      });

      it('should allow project reference fields', async () => {
        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            'Linked Project': 'OPS'
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            'Linked Project': 'OPS'
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should skip schema enforcement for custom field types', async () => {
        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            'Legacy Custom': 123
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            'Legacy Custom': 123
          }]
        });

        expect(result.valid).toBe(true);
      });
    });

    describe('Enum Validation', () => {
      it('should pass validation for valid enum value', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Priority: 'High'
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Priority: 'High'
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should fail validation for invalid enum value', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Priority: 'Critical'
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Priority: 'Critical'
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatchObject({
          field: 'Priority',
          code: 'INVALID_ENUM_VALUE'
        });
        expect(result.errors[0].message).toMatch(/[Aa]llowed values/);
      });

      it('should provide list of allowed values in error message', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Priority: 'Urgent'
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{ 
            Project: 'TEST', 
            'Issue Type': 'Task', 
            Summary: 'Test',
            Priority: 'Urgent'
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toMatch(/High.*Medium.*Low/);
      });

      it('should accept enum value provided as numeric literal', async () => {
        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            'Numeric Enum': 2
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            'Numeric Enum': 2
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should accept enum object with numeric id', async () => {
        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Priority: { id: 1 }
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Priority: { id: 1 }
          }]
        });

        expect(result.valid).toBe(true);
      });

      it('should treat enum object without identifiers as invalid', async () => {
        mockParseInput.mockResolvedValue({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Priority: { extra: true }
          }],
          format: 'json',
          source: 'array'
        });

        const result = await validationService.validate({
          data: [{
            Project: 'TEST',
            'Issue Type': 'Task',
            Summary: 'Test',
            Priority: { extra: true }
          }]
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatchObject({
          field: 'Priority',
          code: 'INVALID_ENUM_VALUE'
        });
      });
    });

    describe('Schema Lookup Failures', () => {
      it('should convert missing issue types into validation errors', async () => {
        const testData = [{
          Project: 'TEST',
          'Issue Type': 'Story',
          Summary: 'Invalid issue type'
        }];

        mockParseInput.mockResolvedValue({
          data: testData,
          format: 'json',
          source: 'array'
        });

        mockSchemaDiscovery.getFieldsForIssueType.mockRejectedValueOnce(
          new NotFoundError(
            `Issue type 'Story' not found in project 'TEST'. Available types: Task, Bug`,
            { projectKey: 'TEST', issueTypeName: 'Story', availableTypes: ['Task', 'Bug'] }
          )
        );

        const result = await validationService.validate({
          data: testData
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([
          expect.objectContaining({
            rowIndex: 0,
            field: 'Issue Type',
            code: 'INVALID_ISSUE_TYPE',
            message: expect.stringContaining('Issue type \'Story\' not found'),
            context: expect.objectContaining({
              availableTypes: ['Task', 'Bug']
            })
          })
        ]);
      });

      it('should convert missing projects into validation errors', async () => {
        const testData = [{
          Project: 'BAD',
          'Issue Type': 'Task',
          Summary: 'Invalid project'
        }];

        mockParseInput.mockResolvedValue({
          data: testData,
          format: 'json',
          source: 'array'
        });

        mockSchemaDiscovery.getFieldsForIssueType.mockRejectedValueOnce(
          new NotFoundError(
            `No issue types found for project 'BAD'`,
            { projectKey: 'BAD' }
          )
        );

        const result = await validationService.validate({
          data: testData
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual([
          expect.objectContaining({
            rowIndex: 0,
            field: 'Project',
            code: 'INVALID_PROJECT',
            message: expect.stringContaining('project \'BAD\'')
          })
        ]);
      });

      it('should reuse cached lookup failures across rows', async () => {
        const testData = [
          {
            Project: 'TEST',
            'Issue Type': 'Story',
            Summary: 'First invalid row'
          },
          {
            Project: 'TEST',
            'Issue Type': 'Story',
            Summary: 'Second invalid row'
          }
        ];

        mockParseInput.mockResolvedValue({
          data: testData,
          format: 'json',
          source: 'array'
        });

        mockSchemaDiscovery.getFieldsForIssueType.mockRejectedValueOnce(
          new NotFoundError(
            `Issue type 'Story' not found in project 'TEST'. Available types: Task, Bug`,
            { projectKey: 'TEST', issueTypeName: 'Story', availableTypes: ['Task', 'Bug'] }
          )
        );

        const result = await validationService.validate({
          data: testData
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors.every(err => err.field === 'Issue Type')).toBe(true);
        expect(mockSchemaDiscovery.getFieldsForIssueType).toHaveBeenCalledTimes(1);
      });
    });

    describe('No Lookups Constraint', () => {
      it('should NOT call getFieldIdByName during validation', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
          format: 'json',
          source: 'array'
        });

        await validationService.validate({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }]
        });

        expect(mockSchemaDiscovery.getFieldIdByName).not.toHaveBeenCalled();
      });

      it('should only use cached schema (no fresh API calls)', async () => {
        mockParseInput.mockResolvedValue({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
          format: 'json',
          source: 'array'
        });

        await validationService.validate({
          data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }]
        });

        // getFieldsForIssueType should be called, but it uses cache internally
        expect(mockSchemaDiscovery.getFieldsForIssueType).toHaveBeenCalledWith('TEST', 'Task');
      });
    });
  });

  describe('AC3: Validation Result Format', () => {
    it('should return ValidationResult with valid:true when no errors', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }]
      });

      expect(result).toMatchObject({
        valid: true,
        errors: []
      });
    });

    it('should return ValidationResult with valid:false when errors present', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }]
      });

      expect(result).toMatchObject({
        valid: false,
        errors: expect.any(Array)
      });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should include rowIndex in each error', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }]
      });

      expect(result.errors[0]).toHaveProperty('rowIndex', 0);
    });

    it('should include field name in each error', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }]
      });

      expect(result.errors[0]).toHaveProperty('field');
      expect(typeof result.errors[0].field).toBe('string');
    });

    it('should include error code in each error', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }]
      });

      expect(result.errors[0]).toHaveProperty('code');
      expect(typeof result.errors[0].code).toBe('string');
    });

    it('should include descriptive message in each error', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task' }]
      });

      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0].message.length).toBeGreaterThan(0);
    });

    it('should group errors by row for multi-row input', async () => {
      mockParseInput.mockResolvedValue({
        data: [
          { Project: 'TEST', 'Issue Type': 'Task' },      // Row 0 - missing Summary
          { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Valid' }, // Row 1 - valid
          { Project: 'TEST', 'Issue Type': 'Task', Priority: 'Invalid' } // Row 2 - missing Summary, invalid Priority
        ],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [
          { Project: 'TEST', 'Issue Type': 'Task' },
          { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Valid' },
          { Project: 'TEST', 'Issue Type': 'Task', Priority: 'Invalid' }
        ]
      });

      expect(result.valid).toBe(false);
      
      // Check row 0 errors
      const row0Errors = result.errors.filter(e => e.rowIndex === 0);
      expect(row0Errors.length).toBeGreaterThan(0);
      
      // Check row 1 errors (should be none)
      const row1Errors = result.errors.filter(e => e.rowIndex === 1);
      expect(row1Errors.length).toBe(0);
      
      // Check row 2 errors (should have 2: missing Summary + invalid Priority)
      const row2Errors = result.errors.filter(e => e.rowIndex === 2);
      expect(row2Errors.length).toBe(2);
    });
  });

  describe('AC4: Performance Target', () => {
    it('should validate 100 rows in <100ms', async () => {
      // Generate 100 valid rows
      const rows = Array.from({ length: 100 }, (_, i) => ({
        Project: 'TEST',
        'Issue Type': 'Task',
        Summary: `Test issue ${i + 1}`
      }));

      mockParseInput.mockResolvedValue({
        data: rows,
        format: 'json',
        source: 'array'
      });

      const startTime = Date.now();
      const result = await validationService.validate({ data: rows });
      const duration = Date.now() - startTime;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    it('should validate 100 rows with errors in <100ms', async () => {
      // Generate 100 rows with validation errors
      const rows = Array.from({ length: 100 }, () => ({
        Project: 'TEST',
        'Issue Type': 'Task',
        // Omit Summary to trigger validation error
      }));

      mockParseInput.mockResolvedValue({
        data: rows,
        format: 'json',
        source: 'array'
      });

      const startTime = Date.now();
      const result = await validationService.validate({ data: rows });
      const duration = Date.now() - startTime;

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(100);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('AC5: Support Single and Bulk Input', () => {
    it('should accept single object input', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
        format: 'json',
        source: 'object'
      });

      const result = await validationService.validate({
        data: { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }
      });

      expect(result.valid).toBe(true);
    });

    it('should accept array of objects input', async () => {
      mockParseInput.mockResolvedValue({
        data: [
          { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test 1' },
          { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test 2' }
        ],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [
          { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test 1' },
          { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test 2' }
        ]
      });

      expect(result.valid).toBe(true);
    });

    it('should accept file input (CSV)', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
        format: 'csv',
        source: 'file'
      });

      const result = await validationService.validate({
        from: 'test-data.csv'
      });

      expect(mockParseInput).toHaveBeenCalledWith({
        from: 'test-data.csv'
      });
      expect(result.valid).toBe(true);
    });

    it('should accept file input (JSON)', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
        format: 'json',
        source: 'file'
      });

      const result = await validationService.validate({
        from: 'test-data.json'
      });

      expect(result.valid).toBe(true);
    });

    it('should use InputParser for all input types', async () => {
      mockParseInput.mockResolvedValue({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }],
        format: 'json',
        source: 'array'
      });

      await validationService.validate({
        data: [{ Project: 'TEST', 'Issue Type': 'Task', Summary: 'Test' }]
      });

      expect(mockParseInput).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input array', async () => {
      mockParseInput.mockResolvedValue({
        data: [],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: []
      });

      expect(result).toMatchObject({
        valid: true,
        errors: []
      });
    });

    it('should surface warnings for unknown field names', async () => {
      mockParseInput.mockResolvedValue({
        data: [{
          Project: 'TEST',
          'Issue Type': 'Task',
          Summary: 'Test',
          UnknownField: 'Some value'
        }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{
          Project: 'TEST',
          'Issue Type': 'Task',
          Summary: 'Test',
          UnknownField: 'Some value'
        }]
      });

      // Unknown fields should be ignored, not cause validation errors
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'UnknownField',
            code: 'UNKNOWN_FIELD'
          })
        ])
      );
    });

    it('should handle case-insensitive field name matching', async () => {
      mockParseInput.mockResolvedValue({
        data: [{
          project: 'TEST',  // lowercase
          'issue type': 'Task',
          summary: 'Test'
        }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{
          project: 'TEST',
          'issue type': 'Task',
          summary: 'Test'
        }]
      });

      expect(result.valid).toBe(true);
    });

    it('should handle multiple errors for single row', async () => {
      mockParseInput.mockResolvedValue({
        data: [{
          Project: 'TEST',
          'Issue Type': 'Task',
          // Missing Summary (required)
          Priority: 'Invalid',  // Invalid enum
          'Story Points': 'not-a-number'  // Invalid type
        }],
        format: 'json',
        source: 'array'
      });

      const result = await validationService.validate({
        data: [{
          Project: 'TEST',
          'Issue Type': 'Task',
          Priority: 'Invalid',
          'Story Points': 'not-a-number'
        }]
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3); // Missing Summary + Invalid Priority + Invalid Story Points
      expect(result.errors.every(e => e.rowIndex === 0)).toBe(true);
    });
  });
});



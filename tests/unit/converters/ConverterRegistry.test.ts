/**
 * Unit tests for ConverterRegistry
 * Story: E1-S08
 */

import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import { FieldSchema, ProjectSchema } from '../../../src/types/schema.js';
import { ConversionContext } from '../../../src/types/converter.js';

describe('ConverterRegistry', () => {
  let registry: ConverterRegistry;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    registry = new ConverterRegistry();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('String Converter', () => {
    const stringField: FieldSchema = {
      id: 'summary',
      name: 'Summary',
      type: 'string',
      required: true,
      schema: { type: 'string', system: 'summary' },
    };

    const context: ConversionContext = {
      projectKey: 'TEST',
      issueType: 'Bug',
    };

    it('should convert string value', async () => {
      const result = await registry.convert('test value', stringField, context);
      expect(result).toBe('test value');
    });

    it('should trim whitespace from string', async () => {
      const result = await registry.convert('  test value  ', stringField, context);
      expect(result).toBe('test value');
    });

    it('should convert number to string', async () => {
      const result = await registry.convert(42, stringField, context);
      expect(result).toBe('42');
    });

    it('should convert boolean to string', async () => {
      const result = await registry.convert(true, stringField, context);
      expect(result).toBe('true');
    });

    it('should return empty string for null', async () => {
      const result = await registry.convert(null, stringField, context);
      expect(result).toBe('');
    });

    it('should return empty string for undefined', async () => {
      const result = await registry.convert(undefined, stringField, context);
      expect(result).toBe('');
    });
  });

  describe('Text Converter', () => {
    const textField: FieldSchema = {
      id: 'description',
      name: 'Description',
      type: 'text',
      required: false,
      schema: { type: 'string', system: 'description' },
    };

    const context: ConversionContext = {
      projectKey: 'TEST',
      issueType: 'Bug',
    };

    it('should preserve newlines in text', async () => {
      const result = await registry.convert('line 1\nline 2\nline 3', textField, context);
      expect(result).toBe('line 1\nline 2\nline 3');
    });

    it('should trim leading and trailing whitespace only', async () => {
      const result = await registry.convert('  line 1\n  line 2  \n  line 3  ', textField, context);
      expect(result).toBe('line 1\n  line 2  \n  line 3');
    });

    it('should preserve internal spaces', async () => {
      const result = await registry.convert('This  has   multiple    spaces', textField, context);
      expect(result).toBe('This  has   multiple    spaces');
    });

    it('should return empty string for null', async () => {
      const result = await registry.convert(null, textField, context);
      expect(result).toBe('');
    });
  });

  describe('convertFields()', () => {
    const schema: ProjectSchema = {
      projectKey: 'TEST',
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
          type: 'text',
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
      },
    };

    const context: ConversionContext = {
      projectKey: 'TEST',
      issueType: 'Bug',
    };

    it('should convert multiple fields', async () => {
      const resolvedFields = {
        summary: '  Test Issue  ',
        description: '  Line 1\nLine 2  ',
      };

      const result = await registry.convertFields(schema, resolvedFields, context);

      expect(result).toEqual({
        summary: 'Test Issue',
        description: 'Line 1\nLine 2',
      });
    });

    it('should skip null fields', async () => {
      const resolvedFields = {
        summary: 'Test Issue',
        description: null,
      };

      const result = await registry.convertFields(schema, resolvedFields, context);

      expect(result).toEqual({
        summary: 'Test Issue',
      });
      expect(result).not.toHaveProperty('description');
    });

    it('should skip undefined fields', async () => {
      const resolvedFields = {
        summary: 'Test Issue',
        description: undefined,
      };

      const result = await registry.convertFields(schema, resolvedFields, context);

      expect(result).toEqual({
        summary: 'Test Issue',
      });
      expect(result).not.toHaveProperty('description');
    });

    it('should pass through unknown types with warning', async () => {
      // Add a custom field type that has no converter
      const schemaWithCustom: ProjectSchema = {
        ...schema,
        fields: {
          ...schema.fields,
          customfield_10001: {
            id: 'customfield_10001',
            name: 'Custom Field',
            type: 'unknowntype',
            required: false,
            schema: { type: 'unknowntype', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield' },
          },
        },
      };

      const resolvedFields = {
        summary: 'Test Issue',
        customfield_10001: { value: 'custom' },
      };

      const result = await registry.convertFields(schemaWithCustom, resolvedFields, context);

      expect(result).toEqual({
        summary: 'Test Issue',
        customfield_10001: { value: 'custom' }, // Passed through unchanged
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "No converter for type 'unknowntype', passing value through"
      );
    });

    it('should pass through special fields (project, issuetype)', async () => {
      const resolvedFields = {
        project: { key: 'TEST' },
        issuetype: { name: 'Bug' },
        summary: '  Test Issue  ',
      };

      const result = await registry.convertFields(schema, resolvedFields, context);

      expect(result).toEqual({
        project: { key: 'TEST' },
        issuetype: { name: 'Bug' },
        summary: 'Test Issue',
      });
    });

    it('should handle empty input', async () => {
      const result = await registry.convertFields(schema, {}, context);
      expect(result).toEqual({});
    });
  });

  describe('Custom Converters', () => {
    it('should allow registering custom converters', async () => {
      const customField: FieldSchema = {
        id: 'customfield_10001',
        name: 'Custom Field',
        type: 'custom-type',
        required: false,
        schema: { type: 'custom-type', custom: 'com.acme.custom' },
      };

      const context: ConversionContext = {
        projectKey: 'TEST',
        issueType: 'Bug',
      };

      // Register custom converter
      registry.register('custom-type', (value) => {
        return { custom: String(value).toUpperCase() };
      });

      const result = await registry.convert('test', customField, context);
      expect(result).toEqual({ custom: 'TEST' });
    });
  });
});

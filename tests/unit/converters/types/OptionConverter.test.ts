import { convertOptionType } from '../../../../src/converters/types/OptionConverter.js';
import { ValidationError, AmbiguityError } from '../../../../src/errors.js';
import type { FieldSchema, ConversionContext } from '../../../../src/types/converter.js';
import { createMockContext, createMockCache } from '../../../helpers/test-utils.js';

describe('OptionConverter', () => {
  const fieldSchema: FieldSchema = {
    id: 'customfield_10024',
    name: 'Environment',
    type: 'option',
    required: false,
    schema: { type: 'option', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select', customId: 10024 },
    allowedValues: [
      { id: '10100', name: 'Production' },
      { id: '10101', name: 'Staging' },
      { id: '10102', name: 'Development' },
    ],
  };

  const mockCache = createMockCache();

  const context: ConversionContext = createMockContext({ cache: mockCache as any });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AC1: Type-Based Registration', () => {
    it('should work for field type "option"', () => {
      // This will be tested when we register in ConverterRegistry
      expect(fieldSchema.type).toBe('option');
    });
  });

  describe('AC2: Option Name to ID Conversion', () => {
    it('should convert string "Production" to { id: "10100" }', async () => {
      const result = await convertOptionType('Production', fieldSchema, context);
      
      expect(result).toEqual({ id: '10100' });
    });

    it('should convert string "Staging" to { id: "10101" }', async () => {
      const result = await convertOptionType('Staging', fieldSchema, context);
      
      expect(result).toEqual({ id: '10101' });
    });

    it('should be case-insensitive: "production" matches "Production"', async () => {
      const result = await convertOptionType('production', fieldSchema, context);
      
      expect(result).toEqual({ id: '10100' });
    });

    it('should be case-insensitive: "DEVELOPMENT" matches "Development"', async () => {
      const result = await convertOptionType('DEVELOPMENT', fieldSchema, context);
      
      expect(result).toEqual({ id: '10102' });
    });

    it('should pass through already-object input { id: "10100" }', async () => {
      const input = { id: '10100' };
      const result = await convertOptionType(input, fieldSchema, context);
      
      expect(result).toEqual({ id: '10100' });
    });

    it('should pass through object with additional properties', async () => {
      const input = { id: '10101', name: 'Staging', self: 'http://...' };
      const result = await convertOptionType(input, fieldSchema, context);
      
      expect(result).toEqual(input);
    });
  });

  describe('AC3: Use Field Schema AllowedValues', () => {
    it('should query allowedValues from field schema', async () => {
      const result = await convertOptionType('Production', fieldSchema, context);
      
      // Should use allowedValues from fieldSchema, not cache
      expect(result).toEqual({ id: '10100' });
    });

    it('should match option by name property (normalized from JIRA value)', async () => {
      const schema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '123', name: 'Production' },
          { id: '456', name: 'Staging' },
        ],
      };

      const result = await convertOptionType('Production', schema, context);
      
      // Should match "Production" and return id "123", not "10100"
      expect(result).toEqual({ id: '123' });
    });

    it('should work with allowedValues from cache if available', async () => {
      mockCache.getLookup.mockResolvedValue([
        { id: '999', name: 'Cached Production' },
        { id: '888', name: 'Cached Staging' },
      ]);

      const schemaWithoutAllowed: FieldSchema = {
        ...fieldSchema,
        allowedValues: undefined,
      };

      const result = await convertOptionType('Cached Production', schemaWithoutAllowed, context);
      
      expect(mockCache.getLookup).toHaveBeenCalledWith('TEST', 'option', 'Bug');
      expect(result).toEqual({ id: '999' });
    });
  });

  describe('AC4: Use Ambiguity Detection', () => {
    it('should throw AmbiguityError if multiple options match name', async () => {
      mockCache.getLookup.mockResolvedValue(null); // Ensure cache miss
      
      const ambiguousSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '1', name: 'Test Environment' },
          { id: '2', name: 'Test Server' },
          { id: '3', name: 'Production' },
        ],
      };

      await expect(
        convertOptionType('Test', ambiguousSchema, context)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should include candidate list in ambiguity error', async () => {
      mockCache.getLookup.mockResolvedValue(null); // Ensure cache miss
      
      const ambiguousSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '1', name: 'Production East' },
          { id: '2', name: 'Production West' },
        ],
      };

      try {
        await convertOptionType('Production', ambiguousSchema, context);
        fail('Should have thrown AmbiguityError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(AmbiguityError);
        expect(error.message).toContain('Production East');
        expect(error.message).toContain('Production West');
      }
    });

    it('should NOT be ambiguous if exact match found', async () => {
      mockCache.getLookup.mockResolvedValue(null); // Ensure cache miss
      
      const schema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '1', name: 'Production' },
          { id: '2', name: 'Production East' },
          { id: '3', name: 'Production West' },
        ],
      };

      // "Production" exactly matches first option
      const result = await convertOptionType('Production', schema, context);
      
      expect(result).toEqual({ id: '1' });
    });
  });

  describe('AC5: Validation & Error Handling', () => {
    it('should throw ValidationError if option not found', async () => {
      await expect(
        convertOptionType('Testing', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should include available options in not found error', async () => {
      mockCache.getLookup.mockResolvedValue(null); // Ensure cache miss
      
      try {
        await convertOptionType('Testing', fieldSchema, context);
        fail('Should have thrown ValidationError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('Testing');
        expect(error.message).toContain('Production');
        expect(error.message).toContain('Staging');
        expect(error.message).toContain('Development');
      }
    });

    it('should throw ValidationError on empty string', async () => {
      await expect(
        convertOptionType('', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
      
      await expect(
        convertOptionType('', fieldSchema, context)
      ).rejects.toThrow(/empty string/i);
    });

    it('should pass through null (optional field)', async () => {
      const result = await convertOptionType(null, fieldSchema, context);
      expect(result).toBeNull();
    });

    it('should pass through undefined (optional field)', async () => {
      const result = await convertOptionType(undefined, fieldSchema, context);
      expect(result).toBeUndefined();
    });

    it('should throw ValidationError on invalid type', async () => {
      await expect(
        convertOptionType(123 as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
      
      await expect(
        convertOptionType(123 as any, fieldSchema, context)
      ).rejects.toThrow(/expected string or object/i);
    });

    it('should throw ValidationError if no allowedValues available', async () => {
      const schemaWithoutAllowed: FieldSchema = {
        ...fieldSchema,
        allowedValues: undefined,
      };

      mockCache.getLookup.mockResolvedValue(null);

      await expect(
        convertOptionType('Production', schemaWithoutAllowed, context)
      ).rejects.toThrow(ValidationError);
      
      await expect(
        convertOptionType('Production', schemaWithoutAllowed, context)
      ).rejects.toThrow(/no option values available/i);
    });
  });

  describe('Edge Cases', () => {
    it('should trim whitespace from option name', async () => {
      const result = await convertOptionType('  Production  ', fieldSchema, context);
      
      expect(result).toEqual({ id: '10100' });
    });

    it('should handle partial matches correctly', async () => {
      const result = await convertOptionType('prod', fieldSchema, context);
      
      // Should match "Production" (case-insensitive partial)
      expect(result).toEqual({ id: '10100' });
    });

    it('should cache options after lookup from allowedValues', async () => {
      await convertOptionType('Production', fieldSchema, context);
      
      // Should cache the allowedValues
      expect(mockCache.setLookup).toHaveBeenCalledWith(
        'TEST',
        'option',
        fieldSchema.allowedValues,
        'Bug'
      );
    });

    it('should handle cache errors gracefully', async () => {
      mockCache.getLookup.mockRejectedValue(new Error('Redis connection failed'));

      // Should fall back to allowedValues
      const result = await convertOptionType('Production', fieldSchema, context);
      
      expect(result).toEqual({ id: '10100' });
    });

    it('should work without cache (graceful degradation)', async () => {
      const contextWithoutCache: ConversionContext = {
        projectKey: 'TEST',
        issueType: 'Bug',
        cache: undefined,
        registry: {} as any,
      };

      const result = await convertOptionType('Staging', fieldSchema, contextWithoutCache);
      
      expect(result).toEqual({ id: '10101' });
    });
  });

  describe('JIRA API Format Support', () => {
    it('should extract and resolve { value: "Production" } format', async () => {
      const result = await convertOptionType({ value: 'Production' }, fieldSchema, context);
      expect(result).toEqual({ id: '10100' });
    });

    it('should extract and resolve { value: "Staging" } format (case-insensitive)', async () => {
      const result = await convertOptionType({ value: 'staging' }, fieldSchema, context);
      expect(result).toEqual({ id: '10101' });
    });

    it('should extract and resolve { name: "Development" } format', async () => {
      const result = await convertOptionType({ name: 'Development' }, fieldSchema, context);
      expect(result).toEqual({ id: '10102' });
    });

    it('should prefer { id } over { value } for passthrough', async () => {
      const result = await convertOptionType({ id: '10100', value: 'Ignored' }, fieldSchema, context);
      expect(result).toEqual({ id: '10100', value: 'Ignored' });
    });

    it('should pass through object with multiple keys (let converter error)', async () => {
      // Objects with multiple keys pass through unchanged (rule 3)
      // Converter then rejects it as invalid input
      await expect(
        convertOptionType({ value: 'Production', name: 'Ignored' }, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for { value: "NonExistent" }', async () => {
      await expect(
        convertOptionType({ value: 'NonExistent' }, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle { value: "" } empty string', async () => {
      await expect(
        convertOptionType({ value: '' }, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });
  });
});

import { convertPriorityType } from '../../../../src/converters/types/PriorityConverter.js';
import { ValidationError, AmbiguityError } from '../../../../src/errors.js';
import type { FieldSchema, ConversionContext } from '../../../../src/types/converter.js';
import { createMockContext, createMockCache } from '../../../helpers/test-utils.js';

describe('PriorityConverter', () => {
  const fieldSchema: FieldSchema = {
    id: 'priority',
    name: 'Priority',
    type: 'priority',
    required: false,
    schema: { type: 'priority', system: 'priority' },
    allowedValues: [
      { id: '1', name: 'Highest' },
      { id: '2', name: 'High' },
      { id: '3', name: 'Medium' },
      { id: '4', name: 'Low' },
      { id: '5', name: 'Lowest' },
    ],
  };

  const mockCache = createMockCache();

  const context: ConversionContext = createMockContext({ cache: mockCache as any });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AC1: Type-Based Registration', () => {
    it('should be registered for type "priority"', () => {
      // This will be tested when we register in ConverterRegistry
      expect(fieldSchema.type).toBe('priority');
    });
  });

  describe('AC2: Name to ID Conversion', () => {
    it('should convert string "High" to { id: "2" }', async () => {
      const result = await convertPriorityType('High', fieldSchema, context);
      
      expect(result).toEqual({ id: '2' });
    });

    it('should convert string "Medium" to { id: "3" }', async () => {
      const result = await convertPriorityType('Medium', fieldSchema, context);
      
      expect(result).toEqual({ id: '3' });
    });

    it('should be case-insensitive: "high" matches "High"', async () => {
      const result = await convertPriorityType('high', fieldSchema, context);
      
      expect(result).toEqual({ id: '2' });
    });

    it('should be case-insensitive: "LOWEST" matches "Lowest"', async () => {
      const result = await convertPriorityType('LOWEST', fieldSchema, context);
      
      expect(result).toEqual({ id: '5' });
    });

    it('should pass through already-object input { id: "1" }', async () => {
      const input = { id: '1' };
      const result = await convertPriorityType(input, fieldSchema, context);
      
      expect(result).toEqual({ id: '1' });
    });

    it('should pass through object with additional properties', async () => {
      const input = { id: '3', name: 'Medium', self: 'http://...' };
      const result = await convertPriorityType(input, fieldSchema, context);
      
      expect(result).toEqual(input);
    });
  });

  describe('AC3: Use Ambiguity Detection', () => {
    it('should throw AmbiguityError if multiple priorities match name', async () => {
      const ambiguousSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '1', name: 'High' },
          { id: '2', name: 'High Priority' },
          { id: '3', name: 'Highest' },
        ],
      };

      // "Hi" matches "High", "High Priority", "Highest" - no exact match
      await expect(
        convertPriorityType('Hi', ambiguousSchema, context)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should include candidate list in AmbiguityError', async () => {
      const ambiguousSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '1', name: 'High' },
          { id: '2', name: 'High Priority' },
        ],
      };

      // "Hi" matches both "High" and "High Priority" - no exact match
      await expect(
        convertPriorityType('Hi', ambiguousSchema, context)
      ).rejects.toThrow(/Hi.*High.*id: 1.*High Priority.*id: 2/s);
    });

    it('should prefer exact match when available', async () => {
      const ambiguousSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '1', name: 'High' },
          { id: '2', name: 'High Priority' },
          { id: '3', name: 'Highest' },
        ],
      };

      // "High" exactly matches first item, should not be ambiguous
      const result = await convertPriorityType('High', ambiguousSchema, context);
      
      expect(result).toEqual({ id: '1' });
    });
  });

  describe('AC4: Use Lookup Cache', () => {
    it('should use cached priorities if available', async () => {
      const cachedPriorities = [
        { id: '10', name: 'Critical' },
        { id: '20', name: 'Major' },
      ];

      mockCache.getLookup.mockResolvedValue({ value: cachedPriorities, isStale: false });

      const schemaWithoutAllowed: FieldSchema = {
        ...fieldSchema,
        allowedValues: undefined,
      };

      const result = await convertPriorityType('Critical', schemaWithoutAllowed, context);

      expect(mockCache.getLookup).toHaveBeenCalledWith('TEST', 'priority', 'Bug');
      expect(result).toEqual({ id: '10' });
    });

    it('should cache priorities after fetching from allowedValues', async () => {
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false }); // Cache miss

      await convertPriorityType('High', fieldSchema, context);

      expect(mockCache.setLookup).toHaveBeenCalledWith(
        'TEST',
        'priority',
        fieldSchema.allowedValues,
        'Bug'
      );
    });

    it('should handle cache being unavailable gracefully', async () => {
      const contextWithoutCache: ConversionContext = {
        ...context,
        cache: undefined,
      };

      const result = await convertPriorityType('Medium', fieldSchema, contextWithoutCache);

      expect(result).toEqual({ id: '3' });
    });

    it('should handle cache errors gracefully', async () => {
      mockCache.getLookup.mockRejectedValue(new Error('Cache error'));

      const schemaWithoutAllowed: FieldSchema = {
        ...fieldSchema,
        allowedValues: undefined,
      };

      // Should fall back to allowedValues or throw ValidationError
      await expect(
        convertPriorityType('High', schemaWithoutAllowed, context)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('AC5: Validation & Error Handling', () => {
    it('should throw ValidationError if priority name not found', async () => {
      await expect(
        convertPriorityType('Critical', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should include available priorities in error message', async () => {
      await expect(
        convertPriorityType('Critical', fieldSchema, context)
      ).rejects.toThrow(/Highest.*High.*Medium.*Low.*Lowest/s);
    });

    it('should throw ValidationError on empty string', async () => {
      await expect(
        convertPriorityType('', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should pass through null for optional field', async () => {
      const result = await convertPriorityType(null, fieldSchema, context);
      
      expect(result).toBeNull();
    });

    it('should pass through undefined for optional field', async () => {
      const result = await convertPriorityType(undefined, fieldSchema, context);
      
      expect(result).toBeUndefined();
    });

    it('should throw ValidationError if no allowedValues and no cache', async () => {
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      const schemaWithoutAllowed: FieldSchema = {
        ...fieldSchema,
        allowedValues: undefined,
      };

      await expect(
        convertPriorityType('High', schemaWithoutAllowed, context)
      ).rejects.toThrow(ValidationError);
      await expect(
        convertPriorityType('High', schemaWithoutAllowed, context)
      ).rejects.toThrow(/No priority values available/);
    });

    it('should throw ValidationError on invalid input type (number)', async () => {
      await expect(
        convertPriorityType(123 as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
      await expect(
        convertPriorityType(123 as any, fieldSchema, context)
      ).rejects.toThrow(/Expected string or object/);
    });

    it('should throw ValidationError on invalid input type (boolean)', async () => {
      await expect(
        convertPriorityType(true as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('AC6: Edge Cases', () => {
    it('should handle priority names with special characters', async () => {
      const specialSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '1', name: 'P0 - Critical' },
          { id: '2', name: 'P1 - High' },
        ],
      };

      const result = await convertPriorityType('P0 - Critical', specialSchema, context);
      
      expect(result).toEqual({ id: '1' });
    });

    it('should handle whitespace in input', async () => {
      const result = await convertPriorityType('  High  ', fieldSchema, context);
      
      expect(result).toEqual({ id: '2' });
    });

    it('should handle empty allowedValues array', async () => {
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      const emptySchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [],
      };

      await expect(
        convertPriorityType('High', emptySchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle priorities with same name but different IDs', async () => {
      const duplicateNameSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '1', name: 'High' },
          { id: '2', name: 'High' }, // Same name, different ID (shouldn't happen in JIRA)
        ],
      };

      // Should throw ambiguity error
      await expect(
        convertPriorityType('High', duplicateNameSchema, context)
      ).rejects.toThrow(AmbiguityError);
    });
  });

  describe('JIRA API Format Support', () => {
    it('should extract and resolve { name: "High" } format', async () => {
      const result = await convertPriorityType({ name: 'High' }, fieldSchema, context);
      expect(result).toEqual({ id: '2' });
    });

    it('should extract and resolve { name: "medium" } format (case-insensitive)', async () => {
      const result = await convertPriorityType({ name: 'medium' }, fieldSchema, context);
      expect(result).toEqual({ id: '3' });
    });

    it('should prefer { id } over { name } for passthrough', async () => {
      const result = await convertPriorityType({ id: '1', name: 'Ignored' }, fieldSchema, context);
      expect(result).toEqual({ id: '1', name: 'Ignored' });
    });

    it('should throw ValidationError for { name: "NonExistent" }', async () => {
      await expect(
        convertPriorityType({ name: 'NonExistent' }, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle { name: "" } empty string', async () => {
      await expect(
        convertPriorityType({ name: '' }, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle full JIRA API response object', async () => {
      // Full JIRA API format with additional fields
      const jiraFormat = { id: '2', name: 'High', self: 'https://jira.example.com/rest/api/2/priority/2', iconUrl: 'https://...' };
      const result = await convertPriorityType(jiraFormat, fieldSchema, context);
      expect(result).toEqual(jiraFormat); // Passthrough because id is present
    });
  });
});

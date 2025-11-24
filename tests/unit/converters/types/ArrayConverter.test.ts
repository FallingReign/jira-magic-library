/**
 * Unit tests for Array Type Converter
 * Story: E2-S04
 * 
 * Tests the container pattern:
 * - Array converter delegates to item type converters
 * - Handles both array and CSV string inputs
 * - Propagates context to item converters
 */

import { convertArrayType } from '../../../../src/converters/types/ArrayConverter.js';
import { FieldSchema } from '../../../../src/types/schema.js';
import { ConversionContext } from '../../../../src/types/converter.js';
import { ValidationError } from '../../../../src/errors/ValidationError.js';
import { ConverterRegistry } from '../../../../src/converters/ConverterRegistry.js';

describe('ArrayConverter', () => {
  let registry: ConverterRegistry;
  let context: ConversionContext;

  beforeEach(() => {
    registry = new ConverterRegistry();
    context = {
      registry,
      projectKey: 'TEST',
      issueType: 'Bug',
    };
  });

  const stringArrayFieldSchema: FieldSchema = {
    id: 'labels',
    name: 'Labels',
    type: 'array',
    required: false,
    schema: {
      type: 'array',
      items: 'string',
    },
  };

  describe('AC1: Type-Based Registration', () => {
    it('should be registered for type "array"', () => {
      const converter = registry.get('array');
      expect(converter).toBeDefined();
      expect(typeof converter).toBe('function');
    });
  });

  describe('AC2: Array Input Handling', () => {
    it('should iterate and convert each item in array ["item1", "item2"]', async () => {
      const result = await convertArrayType(['bug', 'frontend'], stringArrayFieldSchema, context);
      expect(result).toEqual(['bug', 'frontend']);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should pass through empty array []', async () => {
      const result = await convertArrayType([], stringArrayFieldSchema, context);
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should work correctly with single-item array ["item"]', async () => {
      const result = await convertArrayType(['bug'], stringArrayFieldSchema, context);
      expect(result).toEqual(['bug']);
      expect(Array.isArray(result) && result.length).toBe(1);
    });
  });

  describe('AC3: CSV String Input Handling', () => {
    it('should split CSV string "item1, item2, item3" on comma', async () => {
      const result = await convertArrayType('bug, frontend, ui', stringArrayFieldSchema, context);
      expect(result).toEqual(['bug', 'frontend', 'ui']);
    });

    it('should trim whitespace: " item1 , item2 " → ["item1", "item2"]', async () => {
      const result = await convertArrayType(' bug , frontend ', stringArrayFieldSchema, context);
      expect(result).toEqual(['bug', 'frontend']);
    });

    it('should handle single value "item" → ["item"]', async () => {
      const result = await convertArrayType('bug', stringArrayFieldSchema, context);
      expect(result).toEqual(['bug']);
    });

    it('should convert empty string "" → []', async () => {
      const result = await convertArrayType('', stringArrayFieldSchema, context);
      expect(result).toEqual([]);
    });

    it('should handle whitespace-only string " " → []', async () => {
      const result = await convertArrayType('   ', stringArrayFieldSchema, context);
      expect(result).toEqual([]);
    });
  });

  describe('AC4: Item Type Delegation', () => {
    it('should delegate to string converter for items: "string"', async () => {
      const result = await convertArrayType(['test', 'value'], stringArrayFieldSchema, context);
      // String converter trims whitespace
      expect(result).toEqual(['test', 'value']);
    });

    it('should delegate to component converter for items: "component"', async () => {
      // Mock component converter
      const mockComponentConverter = jest.fn((value) => ({ id: `${value}-id` }));
      registry.register('component', mockComponentConverter);

      const componentFieldSchema: FieldSchema = {
        id: 'components',
        name: 'Components',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'component',
        },
      };

      const result = await convertArrayType(['Backend', 'API'], componentFieldSchema, context);

      expect(mockComponentConverter).toHaveBeenCalledTimes(2);
      expect(mockComponentConverter).toHaveBeenCalledWith('Backend', expect.any(Object), context);
      expect(mockComponentConverter).toHaveBeenCalledWith('API', expect.any(Object), context);
      expect(result).toEqual([{ id: 'Backend-id' }, { id: 'API-id' }]);
    });

    it('should delegate to version converter for items: "version"', async () => {
      // Mock version converter
      const mockVersionConverter = jest.fn((value) => ({ id: `version-${value}` }));
      registry.register('version', mockVersionConverter);

      const versionFieldSchema: FieldSchema = {
        id: 'fixVersions',
        name: 'Fix Versions',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'version',
        },
      };

      const result = await convertArrayType(['v1.0', 'v2.0'], versionFieldSchema, context);

      expect(mockVersionConverter).toHaveBeenCalledTimes(2);
      expect(result).toEqual([{ id: 'version-v1.0' }, { id: 'version-v2.0' }]);
    });

    it('should delegate to option converter for items: "option"', async () => {
      // Mock option converter
      const mockOptionConverter = jest.fn((value) => ({ value }));
      registry.register('option', mockOptionConverter);

      const optionFieldSchema: FieldSchema = {
        id: 'customfield_10025',
        name: 'Multi-Select',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'option',
        },
      };

      const result = await convertArrayType(['Option1', 'Option2'], optionFieldSchema, context);

      expect(mockOptionConverter).toHaveBeenCalledTimes(2);
      expect(result).toEqual([{ value: 'Option1' }, { value: 'Option2' }]);
    });

    it('should throw ValidationError for unknown item type', async () => {
      const unknownFieldSchema: FieldSchema = {
        id: 'customfield_99999',
        name: 'Unknown Field',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'unknown-type',
        },
      };

      await expect(convertArrayType(['test'], unknownFieldSchema, context))
        .rejects.toThrow(ValidationError);
      await expect(convertArrayType(['test'], unknownFieldSchema, context))
        .rejects.toThrow(/No converter for type: unknown-type/);
    });
  });

  describe('AC5: Context Propagation', () => {
    it('should pass context object to each item converter', async () => {
      const mockConverter = jest.fn((value) => value);
      registry.register('testtype', mockConverter);

      const testFieldSchema: FieldSchema = {
        id: 'test',
        name: 'Test',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'testtype',
        },
      };

      await convertArrayType(['a', 'b', 'c'], testFieldSchema, context);

      // Verify context was passed to each call
      expect(mockConverter).toHaveBeenCalledTimes(3);
      expect(mockConverter).toHaveBeenCalledWith('a', expect.any(Object), context);
      expect(mockConverter).toHaveBeenCalledWith('b', expect.any(Object), context);
      expect(mockConverter).toHaveBeenCalledWith('c', expect.any(Object), context);
    });

    it('should make registry available to item converters via context', async () => {
      const mockConverter = jest.fn((value, fieldSchema, ctx) => {
        expect(ctx.registry).toBe(registry);
        return value;
      });
      registry.register('testtype', mockConverter);

      const testFieldSchema: FieldSchema = {
        id: 'test',
        name: 'Test',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'testtype',
        },
      };

      await convertArrayType(['test'], testFieldSchema, context);

      expect(mockConverter).toHaveBeenCalled();
    });
  });

  describe('AC6: Validation & Error Handling', () => {
    it('should throw ValidationError if context is missing registry', async () => {
      const contextWithoutRegistry: ConversionContext = {
        projectKey: 'TEST',
        issueType: 'Bug',
      };

      await expect(convertArrayType(['test'], stringArrayFieldSchema, contextWithoutRegistry))
        .rejects.toThrow(ValidationError);
      await expect(convertArrayType(['test'], stringArrayFieldSchema, contextWithoutRegistry))
        .rejects.toThrow(/Array converter requires registry in context/);
    });

    it('should throw ValidationError if schema is missing items property', async () => {
      const fieldSchemaNoItems: FieldSchema = {
        id: 'test',
        name: 'Test',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          // items property missing
        },
      };

      await expect(convertArrayType(['test'], fieldSchemaNoItems, context))
        .rejects.toThrow(ValidationError);
      await expect(convertArrayType(['test'], fieldSchemaNoItems, context))
        .rejects.toThrow(/missing items type in schema/);
    });

    it('should throw ValidationError on non-array, non-string input (object)', async () => {
      await expect(convertArrayType({ key: 'value' }, stringArrayFieldSchema, context))
        .rejects.toThrow(ValidationError);
      await expect(convertArrayType({ key: 'value' }, stringArrayFieldSchema, context))
        .rejects.toThrow(/Expected array or CSV string/);
    });

    it('should throw ValidationError on non-array, non-string input (number)', async () => {
      await expect(convertArrayType(123, stringArrayFieldSchema, context))
        .rejects.toThrow(ValidationError);
    });

    it('should wrap item converter errors with array context (item index)', async () => {
      // Mock converter that throws on specific value
      const mockConverter = jest.fn((value) => {
        if (value === 'bad') {
          throw new ValidationError('Invalid value', { value });
        }
        return value;
      });
      registry.register('testtype', mockConverter);

      const testFieldSchema: FieldSchema = {
        id: 'test',
        name: 'Test Array',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'testtype',
        },
      };

      await expect(convertArrayType(['good', 'bad', 'ok'], testFieldSchema, context))
        .rejects.toThrow(ValidationError);
      await expect(convertArrayType(['good', 'bad', 'ok'], testFieldSchema, context))
        .rejects.toThrow(/item at index 1/);
    });

    it('should re-throw non-ValidationError errors from item converters', async () => {
      // Mock converter that throws a non-ValidationError
      const mockConverter = jest.fn((value) => {
        if (value === 'fatal') {
          throw new Error('Unexpected system error');
        }
        return value;
      });
      registry.register('testtype', mockConverter);

      const testFieldSchema: FieldSchema = {
        id: 'test',
        name: 'Test Array',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'testtype',
        },
      };

      await expect(convertArrayType(['ok', 'fatal'], testFieldSchema, context))
        .rejects.toThrow('Unexpected system error');
      await expect(convertArrayType(['ok', 'fatal'], testFieldSchema, context))
        .rejects.not.toThrow(ValidationError);
    });

    it('should pass through null (optional field)', async () => {
      const result = await convertArrayType(null, stringArrayFieldSchema, context);
      expect(result).toBeNull();
    });

    it('should pass through undefined (optional field)', async () => {
      const result = await convertArrayType(undefined, stringArrayFieldSchema, context);
      expect(result).toBeUndefined();
    });

    it('should throw clear error if item type not registered', async () => {
      const missingFieldSchema: FieldSchema = {
        id: 'test',
        name: 'Test',
        type: 'array',
        required: false,
        schema: {
          type: 'array',
          items: 'unregistered-type',
        },
      };

      await expect(convertArrayType(['test'], missingFieldSchema, context))
        .rejects.toThrow(/No converter for type: unregistered-type/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle array with mix of values', async () => {
      const result = await convertArrayType(['bug', 'frontend', 'ui', 'backend'], stringArrayFieldSchema, context);
      expect(result).toEqual(['bug', 'frontend', 'ui', 'backend']);
      expect(Array.isArray(result) && result.length).toBe(4);
    });

    it('should handle CSV with trailing comma "a,b," → ["a", "b"]', async () => {
      const result = await convertArrayType('bug,frontend,', stringArrayFieldSchema, context);
      // Trailing comma creates empty string, which should be filtered
      expect(result).toEqual(['bug', 'frontend']);
    });

    it('should handle CSV with multiple commas "a,,b" → ["a", "b"]', async () => {
      const result = await convertArrayType('bug,,frontend', stringArrayFieldSchema, context);
      // Multiple commas create empty strings, which should be filtered
      expect(result).toEqual(['bug', 'frontend']);
    });
  });
  describe('Branch Coverage', () => {
    it('should throw when registry is missing on context', async () => {
      const contextWithoutRegistry: ConversionContext = {
        ...context,
        registry: undefined as any,
      };

      await expect(
        convertArrayType(['frontend'], stringArrayFieldSchema, contextWithoutRegistry)
      ).rejects.toThrow(/requires registry/i);
    });

    it('should throw when registry becomes unavailable between checks', async () => {
      let firstAccess = true;
      const flakyContext = { ...context } as ConversionContext;

      Object.defineProperty(flakyContext, 'registry', {
        configurable: true,
        get() {
          if (firstAccess) {
            firstAccess = false;
            return context.registry;
          }
          return undefined;
        },
      });

      await expect(
        convertArrayType(['frontend'], stringArrayFieldSchema, flakyContext)
      ).rejects.toThrow(/look up item converter/i);
    });
  });

});


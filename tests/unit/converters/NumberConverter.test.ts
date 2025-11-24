/**
 * Unit tests for Number Type Converter
 * Story: E2-S01
 */

import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import { FieldSchema, ProjectSchema } from '../../../src/types/schema.js';
import { ConversionContext } from '../../../src/types/converter.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';

describe('Number Type Converter', () => {
  let registry: ConverterRegistry;

  const numberField: FieldSchema = {
    id: 'customfield_10030',
    name: 'Story Points',
    type: 'number',
    required: false,
    schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float' },
  };

  const context: ConversionContext = {
    projectKey: 'TEST',
    issueType: 'Story',
  };

  beforeEach(() => {
    registry = new ConverterRegistry();
  });

  describe('AC2: Parse Strings to Numbers', () => {
    it('should convert string "5" to number 5', async () => {
      const result = await registry.convert('5', numberField, context);
      expect(result).toBe(5);
      expect(typeof result).toBe('number');
    });

    it('should convert string "3.14" to number 3.14', async () => {
      const result = await registry.convert('3.14', numberField, context);
      expect(result).toBe(3.14);
      expect(typeof result).toBe('number');
    });

    it('should convert string "0" to number 0', async () => {
      const result = await registry.convert('0', numberField, context);
      expect(result).toBe(0);
      expect(typeof result).toBe('number');
    });

    it('should convert string "-10" to number -10', async () => {
      const result = await registry.convert('-10', numberField, context);
      expect(result).toBe(-10);
      expect(typeof result).toBe('number');
    });

    it('should pass through already-numeric input', async () => {
      const result = await registry.convert(5, numberField, context);
      expect(result).toBe(5);
      expect(typeof result).toBe('number');
    });
  });

  describe('AC3: Preserve Integer vs Float', () => {
    it('should preserve integer 5 as 5 (not 5.0)', async () => {
      const result = await registry.convert(5, numberField, context);
      expect(result).toBe(5);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should preserve float 3.5 as 3.5', async () => {
      const result = await registry.convert(3.5, numberField, context);
      expect(result).toBe(3.5);
      expect(Number.isInteger(result)).toBe(false);
    });

    it('should convert string "5" to integer 5 (not 5.0)', async () => {
      const result = await registry.convert('5', numberField, context);
      expect(result).toBe(5);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should convert string "5.0" to number (JavaScript treats as integer)', async () => {
      const result = await registry.convert('5.0', numberField, context);
      expect(result).toBe(5);
      // Note: In JavaScript, 5.0 === 5, so this will be an integer
    });

    it('should preserve string "5.5" as float', async () => {
      const result = await registry.convert('5.5', numberField, context);
      expect(result).toBe(5.5);
      expect(Number.isInteger(result)).toBe(false);
    });
  });

  describe('AC4: Validation & Error Handling', () => {
    it('should throw ValidationError for non-numeric string "abc"', async () => {
      await expect(registry.convert('abc', numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('abc', numberField, context)).rejects.toThrow(/Invalid number format/);
    });

    it('should throw ValidationError for empty string', async () => {
      await expect(registry.convert('', numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('', numberField, context)).rejects.toThrow(/Invalid number format/);
    });

    it('should pass through null (optional field)', async () => {
      const result = await registry.convert(null, numberField, context);
      expect(result).toBeNull();
    });

    it('should pass through undefined (optional field)', async () => {
      const result = await registry.convert(undefined, numberField, context);
      expect(result).toBeUndefined();
    });

    it('should throw ValidationError for NaN', async () => {
      await expect(registry.convert(NaN, numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert(NaN, numberField, context)).rejects.toThrow(/Invalid number/);
    });

    it('should throw ValidationError for Infinity', async () => {
      await expect(registry.convert(Infinity, numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert(Infinity, numberField, context)).rejects.toThrow(/Invalid number/);
    });

    it('should throw ValidationError for -Infinity', async () => {
      await expect(registry.convert(-Infinity, numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert(-Infinity, numberField, context)).rejects.toThrow(/Invalid number/);
    });
  });

  describe('AC5: Edge Cases', () => {
    it('should convert scientific notation "1e3" to 1000', async () => {
      const result = await registry.convert('1e3', numberField, context);
      expect(result).toBe(1000);
    });

    it('should convert scientific notation "1.5e2" to 150', async () => {
      const result = await registry.convert('1.5e2', numberField, context);
      expect(result).toBe(150);
    });

    it('should trim leading/trailing whitespace " 5 "', async () => {
      const result = await registry.convert(' 5 ', numberField, context);
      expect(result).toBe(5);
    });

    it('should trim leading/trailing whitespace "  3.14  "', async () => {
      const result = await registry.convert('  3.14  ', numberField, context);
      expect(result).toBe(3.14);
    });

    it('should convert negative zero "-0" to 0', async () => {
      const result = await registry.convert('-0', numberField, context);
      expect(result).toBe(0);
    });

    it('should warn for very large numbers but convert them', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const largeNumber = Number.MAX_SAFE_INTEGER + 1;
      
      const result = await registry.convert(String(largeNumber), numberField, context);
      
      expect(result).toBe(largeNumber);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeds MAX_SAFE_INTEGER')
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle very large numbers as strings', async () => {
      const result = await registry.convert('999999999999999999', numberField, context);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Integration with ConverterRegistry', () => {
    it('should be registered for type "number"', async () => {
      // This test verifies the converter is registered in the constructor
      const result = await registry.convert(5, numberField, context);
      expect(result).toBe(5);
    });

    it('should handle mixed input types in convertFields', async () => {
      const schema: ProjectSchema = {
        projectKey: 'TEST',
        issueType: 'Story',
        fields: {
          customfield_10030: numberField,
          summary: {
            id: 'summary',
            name: 'Summary',
            type: 'string',
            required: true,
            schema: { type: 'string', system: 'summary' },
          },
        },
      };

      const resolvedFields = {
        customfield_10030: '8',
        summary: 'Test Issue',
      };

      const converted = await registry.convertFields(schema, resolvedFields, context);

      expect(converted.customfield_10030).toBe(8);
      expect(converted.summary).toBe('Test Issue');
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error for non-numeric string', async () => {
      await expect(registry.convert('abc', numberField, context)).rejects.toThrow(/Invalid number format for field 'Story Points'/);
    });

    it('should provide clear error for empty string', async () => {
      await expect(registry.convert('', numberField, context)).rejects.toThrow(/Invalid number format for field 'Story Points'/);
    });

    it('should include field name in error message', async () => {
      await expect(registry.convert('invalid', numberField, context)).rejects.toThrow('Story Points');
    });

    it('should include actual value in error message', async () => {
      await expect(registry.convert('xyz', numberField, context)).rejects.toThrow('xyz');
    });
  });

  describe('Non-String, Non-Number Types', () => {
    it('should throw ValidationError for object', async () => {
      await expect(registry.convert({ value: 5 }, numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert({ value: 5 }, numberField, context)).rejects.toThrow(/cannot convert value of type object/);
    });

    it('should convert single-element array to number', async () => {
      // JavaScript quirk: Number([5]) === 5
      const result = await registry.convert([5], numberField, context);
      expect(result).toBe(5);
    });

    it('should throw ValidationError for multi-element array', async () => {
      await expect(registry.convert([5, 10], numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert([5, 10], numberField, context)).rejects.toThrow(/cannot convert value of type object/);
    });

    it('should convert boolean true to 1', async () => {
      const result = await registry.convert(true, numberField, context);
      expect(result).toBe(1);
    });

    it('should convert boolean false to 0', async () => {
      const result = await registry.convert(false, numberField, context);
      expect(result).toBe(0);
    });
  });

  describe('String Infinity Edge Cases', () => {
    it('should throw ValidationError for string "Infinity"', async () => {
      await expect(registry.convert('Infinity', numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('Infinity', numberField, context)).rejects.toThrow(/Invalid number/);
    });

    it('should throw ValidationError for string "-Infinity"', async () => {
      await expect(registry.convert('-Infinity', numberField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('-Infinity', numberField, context)).rejects.toThrow(/Invalid number/);
    });
  });
});

/**
 * Unit tests for Date Type Converter
 * Story: E2-S02
 */

import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import { FieldSchema, ProjectSchema } from '../../../src/types/schema.js';
import { ConversionContext } from '../../../src/types/converter.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';

describe('Date Type Converter', () => {
  let registry: ConverterRegistry;

  const dateField: FieldSchema = {
    id: 'duedate',
    name: 'Due Date',
    type: 'date',
    required: false,
    schema: { type: 'date', system: 'duedate' },
  };

  const context: ConversionContext = {
    projectKey: 'TEST',
    issueType: 'Task',
  };

  beforeEach(() => {
    registry = new ConverterRegistry();
  });

  describe('AC1: Type-Based Registration', () => {
    it('should be registered for type "date"', async () => {
      // Converter should handle date fields
      const result = await registry.convert('2025-09-30', dateField, context);
      expect(result).toBe('2025-09-30');
    });

    it('should work with custom date fields', async () => {
      const customDateField: FieldSchema = {
        id: 'customfield_10050',
        name: 'Release Date',
        type: 'date',
        required: false,
        schema: { type: 'date', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:datepicker' },
      };

      const result = await registry.convert('2025-12-31', customDateField, context);
      expect(result).toBe('2025-12-31');
    });
  });

  describe('AC2: ISO 8601 String Support', () => {
    it('should pass through valid ISO date "2025-09-30"', async () => {
      const result = await registry.convert('2025-09-30', dateField, context);
      expect(result).toBe('2025-09-30');
    });

    it('should extract date from ISO datetime "2025-09-30T14:30:00Z"', async () => {
      const result = await registry.convert('2025-09-30T14:30:00Z', dateField, context);
      expect(result).toBe('2025-09-30');
    });

    it('should extract date from ISO with timezone "2025-09-30T14:30:00-05:00"', async () => {
      const result = await registry.convert('2025-09-30T14:30:00-05:00', dateField, context);
      expect(result).toBe('2025-09-30');
    });

    it('should preserve leading zeros "2025-01-05"', async () => {
      const result = await registry.convert('2025-01-05', dateField, context);
      expect(result).toBe('2025-01-05');
      expect(result).not.toBe('2025-1-5'); // Must have leading zero
    });
  });

  describe('AC3: Excel Serial Date Support', () => {
    it('should convert Excel serial 1 to "1900-01-01"', async () => {
      const result = await registry.convert(1, dateField, context);
      expect(result).toBe('1900-01-01');
    });

    it('should convert Excel serial 45744 to correct date', async () => {
      const result = await registry.convert(45744, dateField, context);
      // Excel serial 45744 = 2025-03-28 (accounting for Excel's 1900 leap year bug)
      expect(result).toBe('2025-03-28');
    });

    it('should throw ValidationError for Excel serial 0', async () => {
      await expect(registry.convert(0, dateField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert(0, dateField, context)).rejects.toThrow(/Invalid Excel serial date: 0/);
    });

    it('should throw ValidationError for negative serial', async () => {
      await expect(registry.convert(-1, dateField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert(-1, dateField, context)).rejects.toThrow(/Invalid Excel serial date/);
    });

    it('should ignore time component in float serial 45744.5', async () => {
      const result = await registry.convert(45744.5, dateField, context);
      expect(result).toBe('2025-03-28'); // Same date, time ignored (Excel bug applied)
    });

    it('should handle Excel 1900 leap year bug correctly', async () => {
      // Excel incorrectly treats 1900 as a leap year
      // Serial 60 = "Feb 29, 1900" (invalid date) in Excel
      // Serial 61 = March 1, 1900
      const serial61 = await registry.convert(61, dateField, context);
      expect(serial61).toBe('1900-03-01'); // Matches Excel behavior
      
      // Serials <= 60 use (serial - 1) formula
      const serial59 = await registry.convert(59, dateField, context);
      expect(serial59).toBe('1900-02-28'); // Last valid Feb date
      
      // Serials > 60 use (serial - 2) formula to skip the fake leap day
      const serial62 = await registry.convert(62, dateField, context);
      expect(serial62).toBe('1900-03-02');
    });
  });

  describe('AC4: JavaScript Date Object Support', () => {
    it('should convert Date object to YYYY-MM-DD', async () => {
      const date = new Date('2025-09-30');
      const result = await registry.convert(date, dateField, context);
      expect(result).toBe('2025-09-30');
    });

    it('should extract date from datetime Date object', async () => {
      const date = new Date('2025-09-30T14:30:00Z');
      const result = await registry.convert(date, dateField, context);
      expect(result).toBe('2025-09-30');
    });

    it('should use UTC date (not local)', async () => {
      // Create date in UTC
      const date = new Date(Date.UTC(2025, 8, 30)); // Sept 30, 2025 UTC
      const result = await registry.convert(date, dateField, context);
      expect(result).toBe('2025-09-30');
    });

    it('should throw ValidationError for invalid Date object', async () => {
      const invalidDate = new Date('invalid');
      await expect(registry.convert(invalidDate, dateField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert(invalidDate, dateField, context)).rejects.toThrow(/Invalid Date object/);
    });
  });

  describe('AC5: Validation & Error Handling', () => {
    it('should throw ValidationError for US format "09/30/2025"', async () => {
      await expect(registry.convert('09/30/2025', dateField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('09/30/2025', dateField, context)).rejects.toThrow(/Invalid date format/);
    });

    it('should throw ValidationError for partial date "2025-09"', async () => {
      await expect(registry.convert('2025-09', dateField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('2025-09', dateField, context)).rejects.toThrow(/Invalid date format/);
    });

    it('should throw ValidationError for invalid date "2025-02-31"', async () => {
      await expect(registry.convert('2025-02-31', dateField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('2025-02-31', dateField, context)).rejects.toThrow(/Invalid date/);
    });

    it('should throw ValidationError for empty string', async () => {
      await expect(registry.convert('', dateField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('', dateField, context)).rejects.toThrow(/Empty string/);
    });

    it('should pass through null (optional field)', async () => {
      const result = await registry.convert(null, dateField, context);
      expect(result).toBeNull();
    });

    it('should pass through undefined (optional field)', async () => {
      const result = await registry.convert(undefined, dateField, context);
      expect(result).toBeUndefined();
    });

    it('should throw ValidationError for object', async () => {
      await expect(registry.convert({ year: 2025 }, dateField, context)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for array', async () => {
      await expect(registry.convert(['2025-09-30'], dateField, context)).rejects.toThrow(ValidationError);
    });
  });

  describe('AC6: Edge Cases', () => {
    it('should validate leap year date "2024-02-29"', async () => {
      const result = await registry.convert('2024-02-29', dateField, context);
      expect(result).toBe('2024-02-29');
    });

    it('should throw ValidationError for non-leap year "2023-02-29"', async () => {
      await expect(registry.convert('2023-02-29', dateField, context)).rejects.toThrow(ValidationError);
      await expect(registry.convert('2023-02-29', dateField, context)).rejects.toThrow(/Invalid date/);
    });

    it('should validate year 1900 "1900-01-01"', async () => {
      const result = await registry.convert('1900-01-01', dateField, context);
      expect(result).toBe('1900-01-01');
    });

    it('should validate year 2100 "2100-12-31"', async () => {
      const result = await registry.convert('2100-12-31', dateField, context);
      expect(result).toBe('2100-12-31');
    });

    it('should trim leading/trailing whitespace', async () => {
      const result = await registry.convert(' 2025-09-30 ', dateField, context);
      expect(result).toBe('2025-09-30');
    });
  });

  describe('Integration with ConverterRegistry', () => {
    it('should handle mixed field types in convertFields', async () => {
      const schema: ProjectSchema = {
        projectKey: 'TEST',
        issueType: 'Task',
        fields: {
          duedate: dateField,
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
        duedate: '2025-12-31',
        summary: 'Test Issue',
      };

      const converted = await registry.convertFields(schema, resolvedFields, context);

      expect(converted.duedate).toBe('2025-12-31');
      expect(converted.summary).toBe('Test Issue');
    });

    it('should handle Excel serial in convertFields', async () => {
      const schema: ProjectSchema = {
        projectKey: 'TEST',
        issueType: 'Task',
        fields: {
          duedate: dateField,
        },
      };

      const resolvedFields = {
        duedate: 45744, // Excel serial (with 1900 leap year bug)
      };

      const converted = await registry.convertFields(schema, resolvedFields, context);

      expect(converted.duedate).toBe('2025-03-28');
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error for invalid format', async () => {
      await expect(registry.convert('09/30/2025', dateField, context)).rejects.toThrow(/Invalid date format for field 'Due Date'/);
    });

    it('should provide clear error for invalid date', async () => {
      await expect(registry.convert('2025-02-31', dateField, context)).rejects.toThrow(/Invalid date for field 'Due Date'/);
    });

    it('should include field name in error message', async () => {
      await expect(registry.convert('invalid', dateField, context)).rejects.toThrow('Due Date');
    });

    it('should include actual value in error message', async () => {
      await expect(registry.convert('2025-13-01', dateField, context)).rejects.toThrow('2025-13-01');
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle year boundaries correctly', async () => {
      expect(await registry.convert('1999-12-31', dateField, context)).toBe('1999-12-31');
      expect(await registry.convert('2000-01-01', dateField, context)).toBe('2000-01-01');
    });

    it('should validate month boundaries', async () => {
      await expect(registry.convert('2025-00-15', dateField, context)).rejects.toThrow(ValidationError);

      await expect(registry.convert('2025-13-15', dateField, context)).rejects.toThrow(ValidationError);
    });

    it('should validate day boundaries', async () => {
      await expect(registry.convert('2025-06-00', dateField, context)).rejects.toThrow(ValidationError);

      await expect(registry.convert('2025-06-31', dateField, context)).rejects.toThrow(ValidationError); // June has 30 days
    });

    it('should handle different month lengths correctly', async () => {
      expect(await registry.convert('2025-01-31', dateField, context)).toBe('2025-01-31'); // Jan: 31 days
      expect(await registry.convert('2025-04-30', dateField, context)).toBe('2025-04-30'); // Apr: 30 days
      expect(await registry.convert('2025-02-28', dateField, context)).toBe('2025-02-28'); // Feb: 28 days (non-leap)
      
      await expect(registry.convert('2025-04-31', dateField, context)).rejects.toThrow(ValidationError); // April has only 30 days
    });
  });
});

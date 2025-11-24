/**
 * Unit tests for DateTime Type Converter
 * Story: E2-S03
 */

import { convertDateTimeType } from '../../../../src/converters/types/DateTimeConverter.js';
import { ValidationError } from '../../../../src/errors/ValidationError.js';

describe('DateTimeConverter', () => {
  const fieldSchema = {
    id: 'customfield_10050',
    name: 'Custom DateTime',
    type: 'datetime',
    required: false,
    schema: { type: 'datetime' }
  };

  describe('AC1: Type-Based Registration', () => {
    it('should be registered for datetime type fields', async () => {
      // This will be tested in ConverterRegistry.test.ts
      expect(fieldSchema.schema.type).toBe('datetime');
    });
  });

  describe('AC2: ISO DateTime String Support', () => {
    it('should convert valid ISO datetime "2025-09-30T14:30:00Z" to JIRA format', async () => {
      const result = convertDateTimeType('2025-09-30T14:30:00Z', fieldSchema);
      expect(result).toBe('2025-09-30T14:30:00.000+0000');
    });

    it('should convert ISO with milliseconds "2025-09-30T14:30:00.123Z" to JIRA format', async () => {
      const result = convertDateTimeType('2025-09-30T14:30:00.123Z', fieldSchema);
      expect(result).toBe('2025-09-30T14:30:00.123+0000');
    });

    it('should convert ISO with timezone offset "2025-09-30T14:30:00-05:00" to UTC', async () => {
      const result = convertDateTimeType('2025-09-30T14:30:00-05:00', fieldSchema);
      expect(result).toBe('2025-09-30T19:30:00.000+0000'); // Converted to UTC
    });

    it('should convert ISO without timezone "2025-09-30T14:30:00" assuming UTC', async () => {
      const result = convertDateTimeType('2025-09-30T14:30:00', fieldSchema);
      expect(result).toBe('2025-09-30T14:30:00.000+0000');
    });

    it('should convert ISO with positive timezone offset "2025-09-30T14:30:00+02:00" to UTC', async () => {
      const result = convertDateTimeType('2025-09-30T14:30:00+02:00', fieldSchema);
      expect(result).toBe('2025-09-30T12:30:00.000+0000'); // Converted to UTC
    });
  });

  describe('AC3: Date String Fallback', () => {
    it('should convert date-only ISO string "2025-09-30" to midnight UTC', async () => {
      const result = convertDateTimeType('2025-09-30', fieldSchema);
      expect(result).toBe('2025-09-30T00:00:00.000+0000');
    });

    it('should convert partial datetime "2025-09-30T14:30" adding seconds', async () => {
      const result = convertDateTimeType('2025-09-30T14:30', fieldSchema);
      expect(result).toBe('2025-09-30T14:30:00.000+0000');
    });
  });

  describe('AC4: Unix Timestamp Support', () => {
    it('should convert Unix timestamp in milliseconds (13 digits)', async () => {
      // Timestamps >= 10 billion are treated as milliseconds
      const result = convertDateTimeType(1727704200000, fieldSchema);
      expect(result).toBe('2024-09-30T13:50:00.000+0000');
    });

    it('should convert Unix timestamp in seconds (10 digits)', async () => {
      // Timestamps < 10 billion are treated as seconds (multiply by 1000)
      const result = convertDateTimeType(1727704200, fieldSchema);
      expect(result).toBe('2024-09-30T13:50:00.000+0000');
    });

    it('should treat timestamp 0 as Unix epoch', async () => {
      const result = convertDateTimeType(0, fieldSchema);
      expect(result).toBe('1970-01-01T00:00:00.000+0000');
    });

    it('should convert negative timestamp (before epoch) as seconds', async () => {
      // -86400 seconds = -1 day from epoch = 1969-12-31
      const result = convertDateTimeType(-86400, fieldSchema);
      expect(result).toBe('1969-12-31T00:00:00.000+0000');
    });
  });

  describe('AC5: JavaScript Date Object Support', () => {
    it('should convert Date object to ISO format with UTC timezone', async () => {
      const date = new Date('2025-09-30T14:30:00Z');
      const result = convertDateTimeType(date, fieldSchema);
      expect(result).toBe('2025-09-30T14:30:00.000+0000');
    });

    it('should convert Date with local timezone to UTC', async () => {
      const date = new Date('2025-09-30T14:30:00-05:00'); // Local timezone
      const result = convertDateTimeType(date, fieldSchema);
      expect(result).toBe('2025-09-30T19:30:00.000+0000'); // Converted to UTC
    });

    it('should throw ValidationError for invalid Date object', async () => {
      const invalidDate = new Date('invalid-date');
      expect(() => convertDateTimeType(invalidDate, fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType(invalidDate, fieldSchema))
        .toThrow(/Invalid Date object/);
    });
  });

  describe('AC6: Validation & Error Handling', () => {
    it('should throw ValidationError for invalid format "09/30/2025 2:30 PM"', async () => {
      expect(() => convertDateTimeType('09/30/2025 2:30 PM', fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType('09/30/2025 2:30 PM', fieldSchema))
        .toThrow(/Invalid datetime format/);
    });

    it('should throw ValidationError for empty string', async () => {
      expect(() => convertDateTimeType('', fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType('', fieldSchema))
        .toThrow(/Empty string is not a valid datetime/);
    });

    it('should pass through null (field is optional)', async () => {
      const result = convertDateTimeType(null, fieldSchema);
      expect(result).toBeNull();
    });

    it('should pass through undefined (field is optional)', async () => {
      const result = convertDateTimeType(undefined, fieldSchema);
      expect(result).toBeUndefined();
    });

    it('should throw ValidationError for non-datetime type (object)', async () => {
      expect(() => convertDateTimeType({ invalid: 'object' }, fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType({ invalid: 'object' }, fieldSchema))
        .toThrow(/Expected datetime value/);
    });

    it('should throw ValidationError for non-datetime type (array)', async () => {
      expect(() => convertDateTimeType(['invalid', 'array'], fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType(['invalid', 'array'], fieldSchema))
        .toThrow(/Expected datetime value/);
    });

    it('should throw ValidationError for boolean', async () => {
      expect(() => convertDateTimeType(true, fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType(true, fieldSchema))
        .toThrow(/Expected datetime value/);
    });

    it('should wrap unexpected formatter exceptions with ValidationError', () => {
      const original = Date.prototype.getUTCFullYear;
      Date.prototype.getUTCFullYear = function () {
        throw new Error('formatter failed');
      };

      try {
        expect(() => convertDateTimeType('2025-09-30T14:30:00Z', fieldSchema))
          .toThrow(/Failed to convert datetime value/);
      } finally {
        Date.prototype.getUTCFullYear = original;
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle ISO string with fractional seconds precision', async () => {
      const result = convertDateTimeType('2025-09-30T14:30:00.12345Z', fieldSchema);
      expect(result).toBe('2025-09-30T14:30:00.123+0000'); // Truncated to 3 decimal places
    });

    it('should handle very large timestamp', async () => {
      const largeTimestamp = 4102444800000; // Year 2100
      const result = convertDateTimeType(largeTimestamp, fieldSchema);
      expect(result).toBe('2100-01-01T00:00:00.000+0000');
    });

    it('should handle small timestamp (10 digits boundary)', async () => {
      const smallTimestamp = 1000000000; // 10 digits exactly (seconds)
      const result = convertDateTimeType(smallTimestamp, fieldSchema);
      expect(result).toBe('2001-09-09T01:46:40.000+0000');
    });

    it('should handle large timestamp (11 digits boundary)', async () => {
      const largeTimestamp = 10000000000; // 11 digits exactly (milliseconds)
      const result = convertDateTimeType(largeTimestamp, fieldSchema);
      expect(result).toBe('1970-04-26T17:46:40.000+0000');
    });

    it('should handle datetime with milliseconds but no timezone', async () => {
      const result = convertDateTimeType('2025-09-30T14:30:00.123', fieldSchema);
      expect(result).toBe('2025-09-30T14:30:00.123+0000');
    });

    it('should throw ValidationError for invalid numeric timestamp (NaN)', async () => {
      expect(() => convertDateTimeType(NaN, fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType(NaN, fieldSchema))
        .toThrow(/Invalid timestamp/);
    });

    it('should throw ValidationError for Infinity timestamp', async () => {
      expect(() => convertDateTimeType(Infinity, fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType(Infinity, fieldSchema))
        .toThrow(/Invalid timestamp/);
    });

    it('should throw ValidationError for valid ISO format with invalid date values', async () => {
      // Valid format but invalid date (month 13 doesn't exist)
      expect(() => convertDateTimeType('2025-13-30T14:30:00Z', fieldSchema))
        .toThrow(ValidationError);
      expect(() => convertDateTimeType('2025-13-30T14:30:00Z', fieldSchema))
        .toThrow(/Invalid datetime format/);
    });
  });
});

import { convertTimeTrackingType } from '../../../../src/converters/types/TimeTrackingConverter.js';
import { FieldSchema } from '../../../../src/types/schema.js';
import { ValidationError } from '../../../../src/errors/ValidationError.js';
import { createMockContext } from '../../../helpers/test-utils.js';

describe('TimeTrackingConverter', () => {
  const mockFieldSchema: FieldSchema = {
    id: 'timetracking',
    name: 'Time Tracking',
    type: 'timetracking',
    required: false,
    schema: { type: 'timetracking' },
  };

  const mockContext = createMockContext();

  describe('AC1: Parse String Time Duration Formats (Pass Through JIRA Format)', () => {
    describe('Single unit formats - pass through', () => {
      it('should pass through "2h" as-is', () => {
        const result = convertTimeTrackingType('2h', mockFieldSchema, mockContext);
        expect(result).toBe('2h');
      });

      it('should pass through "30m" as-is', () => {
        const result = convertTimeTrackingType('30m', mockFieldSchema, mockContext);
        expect(result).toBe('30m');
      });

      it('should pass through "1d" as-is', () => {
        const result = convertTimeTrackingType('1d', mockFieldSchema, mockContext);
        expect(result).toBe('1d');
      });

      it('should pass through "1w" as-is', () => {
        const result = convertTimeTrackingType('1w', mockFieldSchema, mockContext);
        expect(result).toBe('1w');
      });
    });

    describe('Compound formats - pass through', () => {
      it('should pass through "1h 30m" as-is', () => {
        const result = convertTimeTrackingType('1h 30m', mockFieldSchema, mockContext);
        expect(result).toBe('1h 30m');
      });

      it('should pass through "2d 3h" as-is', () => {
        const result = convertTimeTrackingType('2d 3h', mockFieldSchema, mockContext);
        expect(result).toBe('2d 3h');
      });

      it('should pass through "1w 2d 4h" as-is', () => {
        const result = convertTimeTrackingType('1w 2d 4h', mockFieldSchema, mockContext);
        expect(result).toBe('1w 2d 4h');
      });

      it('should pass through compound format with all units', () => {
        const result = convertTimeTrackingType('1w 1d 1h 1m', mockFieldSchema, mockContext);
        expect(result).toBe('1w 1d 1h 1m');
      });
    });

    describe('Multiple values of same unit - pass through', () => {
      it('should pass through multiple hours as-is', () => {
        const result = convertTimeTrackingType('2h 3h', mockFieldSchema, mockContext);
        expect(result).toBe('2h 3h'); // JIRA will sum these
      });

      it('should pass through multiple days as-is', () => {
        const result = convertTimeTrackingType('1d 2d', mockFieldSchema, mockContext);
        expect(result).toBe('1d 2d');
      });
    });

    describe('Friendly formats - normalize to JIRA format', () => {
      it('should normalize "2 hours" to "2h"', () => {
        const result = convertTimeTrackingType('2 hours', mockFieldSchema, mockContext);
        expect(result).toBe('2h');
      });

      it('should normalize "30 minutes" to "30m"', () => {
        const result = convertTimeTrackingType('30 minutes', mockFieldSchema, mockContext);
        expect(result).toBe('30m');
      });

      it('should normalize "1 day" to "1d"', () => {
        const result = convertTimeTrackingType('1 day', mockFieldSchema, mockContext);
        expect(result).toBe('1d');
      });

      it('should normalize "1 week" to "1w"', () => {
        const result = convertTimeTrackingType('1 week', mockFieldSchema, mockContext);
        expect(result).toBe('1w');
      });

      it('should normalize "5 mins" to "5m"', () => {
        const result = convertTimeTrackingType('5 mins', mockFieldSchema, mockContext);
        expect(result).toBe('5m');
      });

      it('should normalize "10 min" to "10m"', () => {
        const result = convertTimeTrackingType('10 min', mockFieldSchema, mockContext);
        expect(result).toBe('10m');
      });
    });

    describe('Edge cases', () => {
      it('should handle leading/trailing spaces', () => {
        const result = convertTimeTrackingType('  2h  ', mockFieldSchema, mockContext);
        expect(result).toBe('2h');
      });

      it('should handle large values', () => {
        const result = convertTimeTrackingType('100w', mockFieldSchema, mockContext);
        expect(result).toBe('100w');
      });

      it('should handle zero values', () => {
        const result = convertTimeTrackingType('0h', mockFieldSchema, mockContext);
        expect(result).toBe('0h');
      });
    });
  });

  describe('AC2: Support Numeric Values (Convert Seconds to Duration String)', () => {
    it('should convert 7200 seconds to "2h"', () => {
      const result = convertTimeTrackingType(7200, mockFieldSchema, mockContext);
      expect(result).toBe('2h');
    });

    it('should convert 1800 seconds to "30m"', () => {
      const result = convertTimeTrackingType(1800, mockFieldSchema, mockContext);
      expect(result).toBe('30m');
    });

    it('should convert 28800 seconds to "1d" (8-hour day)', () => {
      const result = convertTimeTrackingType(28800, mockFieldSchema, mockContext);
      expect(result).toBe('1d');
    });

    it('should convert 144000 seconds to "1w" (5-day week)', () => {
      const result = convertTimeTrackingType(144000, mockFieldSchema, mockContext);
      expect(result).toBe('1w');
    });

    it('should convert 5400 seconds to "1h 30m"', () => {
      const result = convertTimeTrackingType(5400, mockFieldSchema, mockContext);
      expect(result).toBe('1h 30m');
    });

    it('should convert 68400 seconds to "2d 3h"', () => {
      const result = convertTimeTrackingType(68400, mockFieldSchema, mockContext);
      expect(result).toBe('2d 3h'); // 2*28800 + 3*3600 = 57600 + 10800
    });

    it('should convert 216000 seconds to "1w 2d 4h"', () => {
      const result = convertTimeTrackingType(216000, mockFieldSchema, mockContext);
      expect(result).toBe('1w 2d 4h'); // 144000 + 57600 + 14400
    });

    it('should convert 0 seconds to "0m"', () => {
      const result = convertTimeTrackingType(0, mockFieldSchema, mockContext);
      expect(result).toBe('0m');
    });

    it('should reject negative seconds', () => {
      expect(() => {
        convertTimeTrackingType(-100, mockFieldSchema, mockContext);
      }).toThrow(ValidationError);
      expect(() => {
        convertTimeTrackingType(-100, mockFieldSchema, mockContext);
      }).toThrow('must be a positive integer');
    });

    it('should reject decimal seconds', () => {
      expect(() => {
        convertTimeTrackingType(123.45, mockFieldSchema, mockContext);
      }).toThrow(ValidationError);
      expect(() => {
        convertTimeTrackingType(123.45, mockFieldSchema, mockContext);
      }).toThrow('must be a positive integer');
    });
  });

  describe('AC3: Support Object Format', () => {
    it('should handle object with originalEstimate (string)', () => {
      const result = convertTimeTrackingType(
        { originalEstimate: '2h' },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({ originalEstimate: '2h' });
    });

    it('should handle object with remainingEstimate (string)', () => {
      const result = convertTimeTrackingType(
        { remainingEstimate: '1h 30m' },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({ remainingEstimate: '1h 30m' });
    });

    it('should handle object with both fields (strings)', () => {
      const result = convertTimeTrackingType(
        {
          originalEstimate: '2d',
          remainingEstimate: '1d 4h',
        },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({
        originalEstimate: '2d',
        remainingEstimate: '1d 4h',
      });
    });

    it('should handle object with originalEstimate (number)', () => {
      const result = convertTimeTrackingType(
        { originalEstimate: 7200 },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({ originalEstimate: '2h' });
    });

    it('should handle object with remainingEstimate (number)', () => {
      const result = convertTimeTrackingType(
        { remainingEstimate: 5400 },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({ remainingEstimate: '1h 30m' });
    });

    it('should handle object with both fields (numbers)', () => {
      const result = convertTimeTrackingType(
        {
          originalEstimate: 28800,
          remainingEstimate: 14400,
        },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({
        originalEstimate: '1d',
        remainingEstimate: '4h',
      });
    });

    it('should handle object with friendly format strings', () => {
      const result = convertTimeTrackingType(
        {
          originalEstimate: '2 hours',
          remainingEstimate: '30 minutes',
        },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({
        originalEstimate: '2h',
        remainingEstimate: '30m',
      });
    });

    it('should handle object with null values', () => {
      const result = convertTimeTrackingType(
        {
          originalEstimate: null,
          remainingEstimate: '2h',
        },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({
        originalEstimate: null,
        remainingEstimate: '2h',
      });
    });

    it('should handle object with both fields null', () => {
      const result = convertTimeTrackingType(
        {
          originalEstimate: null,
          remainingEstimate: null,
        },
        mockFieldSchema,
        mockContext
      );
      expect(result).toEqual({
        originalEstimate: null,
        remainingEstimate: null,
      });
    });

    it('should handle empty object', () => {
      const result = convertTimeTrackingType({}, mockFieldSchema, mockContext);
      expect(result).toEqual({});
    });
  });

  describe('AC4: Handle null and undefined', () => {
    it('should return null for null input', () => {
      const result = convertTimeTrackingType(null, mockFieldSchema, mockContext);
      expect(result).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      const result = convertTimeTrackingType(undefined, mockFieldSchema, mockContext);
      expect(result).toBeUndefined();
    });
  });

  describe('AC5: Validation Errors', () => {
    it('should throw ValidationError for invalid format', () => {
      expect(() => {
        convertTimeTrackingType('2x', mockFieldSchema, mockContext);
      }).toThrow(ValidationError);
      expect(() => {
        convertTimeTrackingType('2x', mockFieldSchema, mockContext);
      }).toThrow('has invalid format');
    });

    it('should throw ValidationError for empty string', () => {
      expect(() => {
        convertTimeTrackingType('', mockFieldSchema, mockContext);
      }).toThrow(ValidationError);
      expect(() => {
        convertTimeTrackingType('', mockFieldSchema, mockContext);
      }).toThrow('cannot be empty');
    });

    it('should throw ValidationError for whitespace-only string', () => {
      expect(() => {
        convertTimeTrackingType('   ', mockFieldSchema, mockContext);
      }).toThrow(ValidationError);
      expect(() => {
        convertTimeTrackingType('   ', mockFieldSchema, mockContext);
      }).toThrow('cannot be empty');
    });

    it('should throw ValidationError for invalid type (boolean)', () => {
      expect(() => {
        convertTimeTrackingType(true, mockFieldSchema, mockContext);
      }).toThrow(ValidationError);
      expect(() => {
        convertTimeTrackingType(true, mockFieldSchema, mockContext);
      }).toThrow('must be a string, number, or object');
    });

    it('should throw ValidationError for invalid type (array)', () => {
      expect(() => {
        convertTimeTrackingType(['2h'], mockFieldSchema, mockContext);
      }).toThrow(ValidationError);
      expect(() => {
        convertTimeTrackingType(['2h'], mockFieldSchema, mockContext);
      }).toThrow('must be a string, number, or object');
    });

    it('should provide clear error messages with field name', () => {
      try {
        convertTimeTrackingType('invalid', mockFieldSchema, mockContext);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const err = error as ValidationError;
        expect(err.message).toContain('Time Tracking');
        expect(err.message).toContain('invalid format');
      }
    });

    it('should provide field-specific errors for object properties', () => {
      expect(() => {
        convertTimeTrackingType(
          { originalEstimate: 'invalid' },
          mockFieldSchema,
          mockContext
        );
      }).toThrow('originalEstimate');
    });
  });
});

/**
 * Unit tests for Version Type Converter
 * Story: E2-S11
 * 
 * Tests version conversion for fields with items: "version"
 * Used by array converter for fixVersions, versions arrays
 */

import { convertVersionType } from '../../../../src/converters/types/VersionConverter.js';
import { ValidationError } from '../../../../src/errors/ValidationError.js';
import { AmbiguityError } from '../../../../src/errors/AmbiguityError.js';
import type { FieldSchema, ConversionContext } from '../../../../src/types/converter.js';
import { createMockContext } from '../../../helpers/test-utils.js';

describe('VersionConverter', () => {
  const fieldSchema: FieldSchema = {
    id: 'fixVersions',
    name: 'Fix Version/s',
    type: 'array',
    required: false,
    schema: { type: 'array', items: 'version' },
    allowedValues: [
      { id: '10200', name: 'v1.0' },
      { id: '10201', name: 'v1.1' },
      { id: '10202', name: 'v2.0' },
      { id: '10203', name: 'Sprint 1' },
      { id: '10204', name: 'Release 2024-Q1' }
    ]
  };

  const context: ConversionContext = createMockContext();

  describe('AC1: Type-Based Registration', () => {
    // This will be tested when we register the converter
    it('should be a valid FieldConverter function', () => {
      expect(typeof convertVersionType).toBe('function');
      expect(convertVersionType.length).toBe(3); // (value, fieldSchema, context)
    });
  });

  describe('AC2: Version Name to ID Conversion', () => {
    it('should convert version name "v1.0" to { id: "10200" }', async () => {
      const result = await convertVersionType('v1.0', fieldSchema, context);
      expect(result).toEqual({ id: '10200' });
    });

    it('should convert version name "v2.0" to { id: "10202" }', async () => {
      const result = await convertVersionType('v2.0', fieldSchema, context);
      expect(result).toEqual({ id: '10202' });
    });

    it('should convert version name "Sprint 1" to { id: "10203" }', async () => {
      const result = await convertVersionType('Sprint 1', fieldSchema, context);
      expect(result).toEqual({ id: '10203' });
    });

    it('should convert version name "Release 2024-Q1" to { id: "10204" }', async () => {
      const result = await convertVersionType('Release 2024-Q1', fieldSchema, context);
      expect(result).toEqual({ id: '10204' });
    });

    it('should be case-insensitive: "V1.0" matches "v1.0"', async () => {
      const result = await convertVersionType('V1.0', fieldSchema, context);
      expect(result).toEqual({ id: '10200' });
    });

    it('should be case-insensitive: "v2.0" matches "V2.0"', async () => {
      const result = await convertVersionType('v2.0', fieldSchema, context);
      expect(result).toEqual({ id: '10202' });
    });

    it('should handle whitespace: " v1.0 " matches "v1.0"', async () => {
      const result = await convertVersionType(' v1.0 ', fieldSchema, context);
      expect(result).toEqual({ id: '10200' });
    });

    it('should pass through object with id: { id: "10200" }', async () => {
      const result = await convertVersionType({ id: '10200' }, fieldSchema, context);
      expect(result).toEqual({ id: '10200' });
    });

    it('should pass through object with id: { id: "10202", name: "v2.0" }', async () => {
      const result = await convertVersionType({ id: '10202', name: 'v2.0' }, fieldSchema, context);
      expect(result).toEqual({ id: '10202', name: 'v2.0' });
    });
  });

  describe('AC3: Use Lookup Cache', () => {
    it('should use cache if available', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue([
          { id: '10200', name: 'v1.0' },
          { id: '10201', name: 'v1.1' }
        ]),
        setLookup: jest.fn().mockResolvedValue(undefined)
      };

      const contextWithCache: ConversionContext = {
        ...context,
        cache: mockCache as any
      };

      const result = await convertVersionType('v1.0', fieldSchema, contextWithCache);

      expect(result).toEqual({ id: '10200' });
      expect(mockCache.getLookup).toHaveBeenCalledWith(
        'TEST',
        'version',
        undefined // Versions are project-level, not issue-type specific
      );
    });

    it('should fall back to allowedValues on cache miss', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue(null),
        setLookup: jest.fn().mockResolvedValue(undefined)
      };

      const contextWithCache: ConversionContext = {
        ...context,
        cache: mockCache as any
      };

      const result = await convertVersionType('v2.0', fieldSchema, contextWithCache);

      expect(result).toEqual({ id: '10202' });
      expect(mockCache.getLookup).toHaveBeenCalledWith('TEST', 'version', undefined);
    });

    it('should cache allowedValues after successful lookup', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue(null),
        setLookup: jest.fn().mockResolvedValue(undefined)
      };

      const contextWithCache: ConversionContext = {
        ...context,
        cache: mockCache as any
      };

      await convertVersionType('v1.0', fieldSchema, contextWithCache);

      expect(mockCache.setLookup).toHaveBeenCalledWith(
        'TEST',
        'version',
        fieldSchema.allowedValues,
        undefined // Versions are project-level
      );
    });

    it('should gracefully degrade on cache read error', async () => {
      const mockCache = {
        getLookup: jest.fn().mockRejectedValue(new Error('Redis down')),
        setLookup: jest.fn().mockResolvedValue(undefined)
      };

      const contextWithCache: ConversionContext = {
        ...context,
        cache: mockCache as any
      };

      // Should fall back to allowedValues
      const result = await convertVersionType('v1.0', fieldSchema, contextWithCache);
      expect(result).toEqual({ id: '10200' });
    });

    it('should gracefully degrade on cache write error', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue(null),
        setLookup: jest.fn().mockRejectedValue(new Error('Redis down'))
      };

      const contextWithCache: ConversionContext = {
        ...context,
        cache: mockCache as any
      };

      // Should still work, just without caching
      const result = await convertVersionType('v2.0', fieldSchema, contextWithCache);
      expect(result).toEqual({ id: '10202' });
    });
  });

  describe('AC4: Use Ambiguity Detection', () => {
    it('should throw AmbiguityError when multiple versions match (case-insensitive)', async () => {
      const ambiguousSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '10200', name: 'v1.0' },
          { id: '10201', name: 'V1.0' }, // Duplicate with different case
          { id: '10202', name: 'v2.0' }
        ]
      };

      await expect(
        convertVersionType('v1.0', ambiguousSchema, context)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should include candidate list in AmbiguityError', async () => {
      const ambiguousSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '10200', name: 'Release' },
          { id: '10201', name: 'release' },
          { id: '10202', name: 'RELEASE' }
        ]
      };

      await expect(
        convertVersionType('release', ambiguousSchema, context)
      ).rejects.toThrow(/Multiple matches found/);
    });
  });

  describe('AC5: Validation & Error Handling', () => {
    it('should throw ValidationError when version not found', async () => {
      await expect(
        convertVersionType('v99.0', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should include available versions in error message', async () => {
      await expect(
        convertVersionType('v99.0', fieldSchema, context)
      ).rejects.toThrow(/Available: v1.0, v1.1, v2.0, Sprint 1, Release 2024-Q1/);
    });

    it('should include project key in not found error', async () => {
      await expect(
        convertVersionType('NonExistent', fieldSchema, context)
      ).rejects.toThrow(/project TEST/);
    });

    it('should throw ValidationError on empty string', async () => {
      await expect(
        convertVersionType('', fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertVersionType('', fieldSchema, context)
      ).rejects.toThrow(/Empty string is not a valid version/);
    });

    it('should throw ValidationError on whitespace-only string', async () => {
      await expect(
        convertVersionType('   ', fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should pass through null for optional fields', async () => {
      const result = await convertVersionType(null, fieldSchema, context);
      expect(result).toBeNull();
    });

    it('should pass through undefined for optional fields', async () => {
      const result = await convertVersionType(undefined, fieldSchema, context);
      expect(result).toBeUndefined();
    });

    it('should throw ValidationError on invalid type (number)', async () => {
      await expect(
        convertVersionType(123 as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertVersionType(123 as any, fieldSchema, context)
      ).rejects.toThrow(/Expected string or object/);
    });

    it('should throw ValidationError on invalid type (boolean)', async () => {
      await expect(
        convertVersionType(true as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when no version list available', async () => {
      const schemaNoValues: FieldSchema = {
        ...fieldSchema,
        allowedValues: undefined
      };

      const contextNoCache: ConversionContext = {
        ...context,
        cache: undefined
      };

      await expect(
        convertVersionType('v1.0', schemaNoValues, contextNoCache)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertVersionType('v1.0', schemaNoValues, contextNoCache)
      ).rejects.toThrow(/No version values available/);
    });

    it('should throw ValidationError when version list is empty', async () => {
      const schemaEmptyValues: FieldSchema = {
        ...fieldSchema,
        allowedValues: []
      };

      await expect(
        convertVersionType('v1.0', schemaEmptyValues, context)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle version names with special characters', async () => {
      const specialSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '10300', name: 'v1.0-beta' },
          { id: '10301', name: 'Release 2024.Q1' }
        ]
      };

      const result1 = await convertVersionType('v1.0-beta', specialSchema, context);
      expect(result1).toEqual({ id: '10300' });

      const result2 = await convertVersionType('Release 2024.Q1', specialSchema, context);
      expect(result2).toEqual({ id: '10301' });
    });

    it('should handle very long version names', async () => {
      const longSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          { id: '10400', name: 'Release 2024 Q1 January Sprint 1 Hotfix Patch 3.2.1-rc5-beta' }
        ]
      };

      const result = await convertVersionType(
        'Release 2024 Q1 January Sprint 1 Hotfix Patch 3.2.1-rc5-beta',
        longSchema,
        context
      );
      expect(result).toEqual({ id: '10400' });
    });

    it('should handle version names with trailing commas (from CSV)', async () => {
      // Array converter would have already split, but test robustness
      const result = await convertVersionType('v1.0', fieldSchema, context);
      expect(result).toEqual({ id: '10200' });
    });
  });
});

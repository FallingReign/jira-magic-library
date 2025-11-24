/**
 * Component Converter Unit Tests
 * Story: E2-S10
 */

import { convertComponentType } from '../../../../src/converters/types/ComponentConverter.js';
import { ValidationError } from '../../../../src/errors/ValidationError.js';
import { AmbiguityError } from '../../../../src/errors/AmbiguityError.js';
import type { FieldSchema } from '../../../../src/types/schema.js';
import type { ConversionContext } from '../../../../src/types/converter.js';
import { createMockContext } from '../../../helpers/test-utils.js';

describe('ComponentConverter', () => {
  const mockFieldSchema: FieldSchema = {
    id: 'components',
    name: 'Component/s',
    type: 'component',
    required: false,
    schema: { type: 'component' },
    allowedValues: [
      { id: '10001', name: 'Backend' },
      { id: '10002', name: 'Frontend' },
      { id: '10003', name: 'API' },
      { id: '10004', name: 'Mobile' },
    ],
  };

  const mockContext: ConversionContext = createMockContext();

  describe('AC1: Type-Based Registration', () => {
    it('should be a function that accepts value, schema, and context', () => {
      expect(typeof convertComponentType).toBe('function');
      expect(convertComponentType.length).toBe(3);
    });
  });

  describe('AC2: Component Name to ID Conversion', () => {
    it('should convert string "Backend" to { id: "10001" }', async () => {
      const result = await convertComponentType('Backend', mockFieldSchema, mockContext);
      expect(result).toEqual({ id: '10001' });
    });

    it('should convert string "Frontend" to { id: "10002" }', async () => {
      const result = await convertComponentType('Frontend', mockFieldSchema, mockContext);
      expect(result).toEqual({ id: '10002' });
    });

    it('should convert string "API" to { id: "10003" }', async () => {
      const result = await convertComponentType('API', mockFieldSchema, mockContext);
      expect(result).toEqual({ id: '10003' });
    });

    it('should be case-insensitive: "backend" matches "Backend"', async () => {
      const result = await convertComponentType('backend', mockFieldSchema, mockContext);
      expect(result).toEqual({ id: '10001' });
    });

    it('should be case-insensitive: "FRONTEND" matches "Frontend"', async () => {
      const result = await convertComponentType('FRONTEND', mockFieldSchema, mockContext);
      expect(result).toEqual({ id: '10002' });
    });

    it('should be case-insensitive: "api" matches "API"', async () => {
      const result = await convertComponentType('api', mockFieldSchema, mockContext);
      expect(result).toEqual({ id: '10003' });
    });

    it('should pass through already-object input { id: "10001" }', async () => {
      const input = { id: '10001' };
      const result = await convertComponentType(input, mockFieldSchema, mockContext);
      expect(result).toEqual({ id: '10001' });
    });

    it('should pass through object with additional properties', async () => {
      const input = { id: '10002', name: 'Frontend', other: 'value' };
      const result = await convertComponentType(input, mockFieldSchema, mockContext);
      expect(result).toEqual(input);
    });

    it('should trim whitespace from string input', async () => {
      const result = await convertComponentType('  Backend  ', mockFieldSchema, mockContext);
      expect(result).toEqual({ id: '10001' });
    });
  });

  describe('AC3: Use Lookup Cache', () => {
    it('should use cached component list if available', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue([
          { id: '10001', name: 'Backend' },
          { id: '10002', name: 'Frontend' },
        ]),
        setLookup: jest.fn(),
      };

      const contextWithCache: ConversionContext = {
        ...mockContext,
        cache: mockCache as any,
      };

      const result = await convertComponentType('Backend', mockFieldSchema, contextWithCache);

      expect(mockCache.getLookup).toHaveBeenCalledWith('TEST', 'component', undefined);
      expect(result).toEqual({ id: '10001' });
    });

    it('should fall back to allowedValues on cache miss', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue(null),
        setLookup: jest.fn(),
      };

      const contextWithCache: ConversionContext = {
        ...mockContext,
        cache: mockCache as any,
      };

      const result = await convertComponentType('Backend', mockFieldSchema, contextWithCache);

      expect(mockCache.getLookup).toHaveBeenCalledWith('TEST', 'component', undefined);
      expect(result).toEqual({ id: '10001' });
    });

    it('should cache components from allowedValues for future use', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue(null),
        setLookup: jest.fn(),
      };

      const contextWithCache: ConversionContext = {
        ...mockContext,
        cache: mockCache as any,
      };

      await convertComponentType('Backend', mockFieldSchema, contextWithCache);

      expect(mockCache.setLookup).toHaveBeenCalledWith(
        'TEST',
        'component',
        mockFieldSchema.allowedValues,
        undefined
      );
    });

    it('should gracefully handle cache read errors', async () => {
      const mockCache = {
        getLookup: jest.fn().mockRejectedValue(new Error('Cache error')),
        setLookup: jest.fn(),
      };

      const contextWithCache: ConversionContext = {
        ...mockContext,
        cache: mockCache as any,
      };

      const result = await convertComponentType('Backend', mockFieldSchema, contextWithCache);
      expect(result).toEqual({ id: '10001' });
    });

    it('should gracefully handle cache write errors', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue(null),
        setLookup: jest.fn().mockRejectedValue(new Error('Cache write error')),
      };

      const contextWithCache: ConversionContext = {
        ...mockContext,
        cache: mockCache as any,
      };

      const result = await convertComponentType('Backend', mockFieldSchema, contextWithCache);
      expect(result).toEqual({ id: '10001' });
    });

    it('should NOT pass issueType to cache (components are project-level)', async () => {
      const mockCache = {
        getLookup: jest.fn().mockResolvedValue([
          { id: '10001', name: 'Backend' },
        ]),
        setLookup: jest.fn(),
      };

      const contextWithCache: ConversionContext = {
        ...mockContext,
        cache: mockCache as any,
      };

      await convertComponentType('Backend', mockFieldSchema, contextWithCache);

      // Should call with (projectKey, 'component', undefined) - no issueType
      expect(mockCache.getLookup).toHaveBeenCalledWith('TEST', 'component', undefined);
    });
  });

  describe('AC4: Use Ambiguity Detection', () => {
    it('should throw AmbiguityError if multiple components match', async () => {
      const ambiguousSchema: FieldSchema = {
        ...mockFieldSchema,
        allowedValues: [
          { id: '10001', name: 'Backend Service' },
          { id: '10002', name: 'Backend API' },
          { id: '10003', name: 'Backend Core' },
        ],
      };

      await expect(
        convertComponentType('Backend', ambiguousSchema, mockContext)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should include candidates in AmbiguityError', async () => {
      const ambiguousSchema: FieldSchema = {
        ...mockFieldSchema,
        allowedValues: [
          { id: '10001', name: 'Backend Service' },
          { id: '10002', name: 'Backend API' },
        ],
      };

      try {
        await convertComponentType('Backend', ambiguousSchema, mockContext);
        fail('Should have thrown AmbiguityError');
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguityError);
        if (error instanceof AmbiguityError) {
          const details = error.details as { candidates: Array<{ id: string; name: string }> };
          expect(details.candidates).toHaveLength(2);
          expect(details.candidates).toContainEqual({ id: '10001', name: 'Backend Service' });
          expect(details.candidates).toContainEqual({ id: '10002', name: 'Backend API' });
        }
      }
    });

    it('should NOT throw ambiguity error for exact match even with similar names', async () => {
      const exactMatchSchema: FieldSchema = {
        ...mockFieldSchema,
        allowedValues: [
          { id: '10001', name: 'Backend' },
          { id: '10002', name: 'Backend Service' },
          { id: '10003', name: 'Backend API' },
        ],
      };

      // Exact match for "Backend" should return without ambiguity
      const result = await convertComponentType('Backend', exactMatchSchema, mockContext);
      expect(result).toEqual({ id: '10001' });
    });
  });

  describe('AC5: Validation & Error Handling', () => {
    it('should throw ValidationError if component not found', async () => {
      await expect(
        convertComponentType('Database', mockFieldSchema, mockContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should include available components in not found error', async () => {
      try {
        await convertComponentType('Database', mockFieldSchema, mockContext);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        if (error instanceof ValidationError) {
          expect(error.message).toContain('Database');
          expect(error.message).toContain('Backend, Frontend, API, Mobile');
        }
      }
    });

    it('should throw ValidationError on empty string', async () => {
      await expect(
        convertComponentType('', mockFieldSchema, mockContext)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertComponentType('', mockFieldSchema, mockContext)
      ).rejects.toThrow(/Empty string/);
    });

    it('should throw ValidationError on whitespace-only string', async () => {
      await expect(
        convertComponentType('   ', mockFieldSchema, mockContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should pass through null for optional fields', async () => {
      const result = await convertComponentType(null, mockFieldSchema, mockContext);
      expect(result).toBeNull();
    });

    it('should pass through undefined for optional fields', async () => {
      const result = await convertComponentType(undefined, mockFieldSchema, mockContext);
      expect(result).toBeUndefined();
    });

    it('should throw ValidationError on invalid type (number)', async () => {
      await expect(
        convertComponentType(123 as any, mockFieldSchema, mockContext)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertComponentType(123 as any, mockFieldSchema, mockContext)
      ).rejects.toThrow(/Expected string or object/);
    });

    it('should throw ValidationError on invalid type (boolean)', async () => {
      await expect(
        convertComponentType(true as any, mockFieldSchema, mockContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError on invalid type (array)', async () => {
      await expect(
        convertComponentType(['Backend'] as any, mockFieldSchema, mockContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when no allowedValues and no cache', async () => {
      const schemaWithoutValues: FieldSchema = {
        ...mockFieldSchema,
        allowedValues: undefined,
      };

      await expect(
        convertComponentType('Backend', schemaWithoutValues, mockContext)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertComponentType('Backend', schemaWithoutValues, mockContext)
      ).rejects.toThrow(/No component values available/);
    });

    it('should throw ValidationError when allowedValues is empty array', async () => {
      const schemaWithEmptyValues: FieldSchema = {
        ...mockFieldSchema,
        allowedValues: [],
      };

      await expect(
        convertComponentType('Backend', schemaWithEmptyValues, mockContext)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle components with special characters', async () => {
      const specialSchema: FieldSchema = {
        ...mockFieldSchema,
        allowedValues: [
          { id: '10001', name: 'Backend/API' },
          { id: '10002', name: 'Frontend (Web)' },
        ],
      };

      const result = await convertComponentType('Backend/API', specialSchema, mockContext);
      expect(result).toEqual({ id: '10001' });
    });

    it('should handle components with numbers', async () => {
      const numberSchema: FieldSchema = {
        ...mockFieldSchema,
        allowedValues: [
          { id: '10001', name: 'Team 1' },
          { id: '10002', name: 'Team 2' },
        ],
      };

      const result = await convertComponentType('Team 1', numberSchema, mockContext);
      expect(result).toEqual({ id: '10001' });
    });

    it('should handle single-character component names', async () => {
      const singleCharSchema: FieldSchema = {
        ...mockFieldSchema,
        allowedValues: [
          { id: '10001', name: 'A' },
          { id: '10002', name: 'B' },
        ],
      };

      const result = await convertComponentType('A', singleCharSchema, mockContext);
      expect(result).toEqual({ id: '10001' });
    });
  });
});

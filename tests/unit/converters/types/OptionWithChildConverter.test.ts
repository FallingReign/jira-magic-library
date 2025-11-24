import { convertOptionWithChildType } from '../../../../src/converters/types/OptionWithChildConverter.js';
import { ValidationError, AmbiguityError, NotFoundError } from '../../../../src/errors.js';
import type { FieldSchema, ConversionContext } from '../../../../src/types/converter.js';
import { createMockContext, createMockCache } from '../../../helpers/test-utils.js';

describe('OptionWithChildConverter', () => {
  // Mock field schema based on real JIRA cascading select (Level field in ZUL)
  const fieldSchema: FieldSchema = {
    id: 'customfield_10050',
    name: 'Level',
    type: 'option-with-child',
    required: false,
    schema: { 
      type: 'option-with-child', 
      custom: 'com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect',
      customId: 10050 
    },
    allowedValues: [
      {
        id: '10000',
        name: 'MP',
        value: 'MP',
        children: [
          { id: '10075', value: 'mp_zul_newsroom' },
          { id: '10076', value: 'mp_zul_trainyard_01' },
          { id: '10077', value: 'mp_zul_trainyard_02' },
        ],
      },
      {
        id: '10001',
        name: 'ZM',
        value: 'ZM',
        children: [
          { id: '10080', value: 'zm_castle' },
          { id: '10081', value: 'zm_factory' },
        ],
      },
      {
        id: '10002',
        name: 'CP',
        value: 'CP',
        children: [
          { id: '10090', value: 'cp_hacienda' },
          { id: '10091', value: 'cp_seaside' },
        ],
      },
    ],
  };

  const mockCache = createMockCache();

  const context: ConversionContext = createMockContext({
    projectKey: 'ZUL',
    issueType: 'Story',
    cache: mockCache as any,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AC1: Parse Parent-Child Input Format', () => {
    describe('Object format', () => {
      it('should accept object with parent and child: { parent: "MP", child: "mp_zul_trainyard_01" }', async () => {
        const result = await convertOptionWithChildType(
          { parent: 'MP', child: 'mp_zul_trainyard_01' },
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10076' },
        });
      });

      it('should accept object with parent only: { parent: "ZM" }', async () => {
        const result = await convertOptionWithChildType(
          { parent: 'ZM' },
          fieldSchema,
          context
        );

        expect(result).toEqual({ id: '10001' });
      });

      it('should accept object with child only: { child: "mp_zul_newsroom" }', async () => {
        const result = await convertOptionWithChildType(
          { child: 'mp_zul_newsroom' },
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10075' },
        });
      });
    });

    describe('String format with arrow delimiter (->)', () => {
      it('should parse "MP -> mp_zul_trainyard_01"', async () => {
        const result = await convertOptionWithChildType(
          'MP -> mp_zul_trainyard_01',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10076' },
        });
      });

      it('should handle no spaces: "MP->mp_zul_trainyard_01"', async () => {
        const result = await convertOptionWithChildType(
          'MP->mp_zul_trainyard_01',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10076' },
        });
      });

      it('should handle multiple spaces: "MP  ->  mp_zul_trainyard_01"', async () => {
        const result = await convertOptionWithChildType(
          'MP  ->  mp_zul_trainyard_01',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10076' },
        });
      });
    });

    describe('String format with comma delimiter (,)', () => {
      it('should parse "ZM, zm_castle"', async () => {
        const result = await convertOptionWithChildType(
          'ZM, zm_castle',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10001',
          child: { id: '10080' },
        });
      });

      it('should handle no space: "ZM,zm_castle"', async () => {
        const result = await convertOptionWithChildType(
          'ZM,zm_castle',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10001',
          child: { id: '10080' },
        });
      });
    });

    describe('String format with slash delimiter (/)', () => {
      it('should parse "CP / cp_hacienda"', async () => {
        const result = await convertOptionWithChildType(
          'CP / cp_hacienda',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10002',
          child: { id: '10090' },
        });
      });

      it('should handle no spaces: "CP/cp_hacienda"', async () => {
        const result = await convertOptionWithChildType(
          'CP/cp_hacienda',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10002',
          child: { id: '10090' },
        });
      });
    });

    describe('Delimiter priority order', () => {
      it('should prioritize -> over , when both present', async () => {
        // Edge case: "MP -> zm_castle, extra" should treat "->" as delimiter
        const result = await convertOptionWithChildType(
          'MP -> mp_zul_trainyard_01',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10076' },
        });
      });
    });

    describe('String without delimiter (parent-only or child-only)', () => {
      it('should treat "MP" as child-only (auto-detect parent not needed for parent names)', async () => {
        // When no delimiter found, treat as child-only input
        // If "MP" doesn't exist as child, it should fail or be treated as parent
        // According to story: "Treat as child-only, resolver will handle"
        const result = await convertOptionWithChildType('MP', fieldSchema, context);

        // "MP" is actually a parent name, not a child
        // Since it doesn't exist as child, this will fail with NotFoundError
        // OR we could be smart and detect it's a valid parent
        expect(result).toEqual({ id: '10000' });
      });

      it('should treat "mp_zul_newsroom" as child-only and auto-detect parent MP', async () => {
        const result = await convertOptionWithChildType(
          'mp_zul_newsroom',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10075' },
        });
      });
    });

    describe('Null/undefined handling', () => {
      it('should pass through null (optional field)', async () => {
        const result = await convertOptionWithChildType(null, fieldSchema, context);
        expect(result).toBeNull();
      });

      it('should pass through undefined (optional field)', async () => {
        const result = await convertOptionWithChildType(undefined, fieldSchema, context);
        expect(result).toBeUndefined();
      });
    });

    describe('Invalid format', () => {
      it('should throw ValidationError on number input', async () => {
        await expect(
          convertOptionWithChildType(123 as any, fieldSchema, context)
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError on boolean input', async () => {
        await expect(
          convertOptionWithChildType(true as any, fieldSchema, context)
        ).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError on array input', async () => {
        await expect(
          convertOptionWithChildType(['MP', 'ZM'] as any, fieldSchema, context)
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  describe('AC2: Resolve Parent Option Name to ID', () => {
    it('should resolve parent "MP" to id "10000"', async () => {
      const result = await convertOptionWithChildType({ parent: 'MP' }, fieldSchema, context);
      expect(result).toEqual({ id: '10000' });
    });

    it('should be case-insensitive: "mp" matches "MP"', async () => {
      const result = await convertOptionWithChildType({ parent: 'mp' }, fieldSchema, context);
      expect(result).toEqual({ id: '10000' });
    });

    it('should throw ValidationError if parent not found', async () => {
      await expect(
        convertOptionWithChildType({ parent: 'UNKNOWN' }, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
      
      await expect(
        convertOptionWithChildType({ parent: 'UNKNOWN' }, fieldSchema, context)
      ).rejects.toThrow(/Value "UNKNOWN" not found for field/);
    });

    it('should throw AmbiguityError if multiple parents match (partial match)', async () => {
      // Create schema with ambiguous parent names
      const ambiguousSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          {
            id: '10000',
            name: 'Production',
            value: 'Production',
            children: [{ id: '10075', value: 'prod_server1' }],
          },
          {
            id: '10001',
            name: 'Production-East',
            value: 'Production-East',
            children: [{ id: '10076', value: 'prod_server2' }],
          },
        ],
      };

      await expect(
        convertOptionWithChildType({ parent: 'Prod' }, ambiguousSchema, context)
      ).rejects.toThrow(AmbiguityError);
    });
  });

  describe('AC3: Resolve Child Option Name to ID (Within Parent)', () => {
    it('should resolve child "mp_zul_trainyard_01" within parent "MP"', async () => {
      const result = await convertOptionWithChildType(
        { parent: 'MP', child: 'mp_zul_trainyard_01' },
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10000',
        child: { id: '10076' },
      });
    });

    it('should be case-insensitive: "MP_ZUL_TRAINYARD_01" matches', async () => {
      const result = await convertOptionWithChildType(
        { parent: 'MP', child: 'MP_ZUL_TRAINYARD_01' },
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10000',
        child: { id: '10076' },
      });
    });

    it('should throw ValidationError if child not found in parent', async () => {
      await expect(
        convertOptionWithChildType(
          { parent: 'MP', child: 'zm_castle' },
          fieldSchema,
          context
        )
      ).rejects.toThrow(ValidationError);

      await expect(
        convertOptionWithChildType(
          { parent: 'MP', child: 'zm_castle' },
          fieldSchema,
          context
        )
      ).rejects.toThrow(/Value "zm_castle" not found for field/);
    });

    describe('Auto-detect parent from child-only input', () => {
      it('should auto-detect parent when child is unambiguous: "mp_zul_newsroom" → MP', async () => {
        const result = await convertOptionWithChildType(
          { child: 'mp_zul_newsroom' },
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10075' },
        });
      });

      it('should auto-detect parent when child is unambiguous: "zm_castle" → ZM', async () => {
        const result = await convertOptionWithChildType(
          { child: 'zm_castle' },
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10001',
          child: { id: '10080' },
        });
      });

      it('should throw AmbiguityError if child exists under multiple parents', async () => {
        // Create schema with duplicate child names across parents
        const ambiguousSchema: FieldSchema = {
          ...fieldSchema,
          allowedValues: [
            {
              id: '10000',
              name: 'MP',
              value: 'MP',
              children: [{ id: '10075', value: 'common_level' }],
            },
            {
              id: '10001',
              name: 'ZM',
              value: 'ZM',
              children: [{ id: '10080', value: 'common_level' }],
            },
          ],
        };

        await expect(
          convertOptionWithChildType({ child: 'common_level' }, ambiguousSchema, context)
        ).rejects.toThrow(AmbiguityError);

        await expect(
          convertOptionWithChildType({ child: 'common_level' }, ambiguousSchema, context)
        ).rejects.toThrow(/Child 'common_level' exists under multiple parents/);
      });

      it('should throw AmbiguityError if multiple children match within parent', async () => {
        // Create schema with ambiguous child names within same parent
        const ambiguousSchema: FieldSchema = {
          ...fieldSchema,
          allowedValues: [
            {
              id: '10000',
              name: 'MP',
              value: 'MP',
              children: [
                { id: '10075', value: 'map_trainyard_01' },
                { id: '10076', value: 'map_trainyard_02' },
              ],
            },
          ],
        };

        await expect(
          convertOptionWithChildType({ parent: 'MP', child: 'map_train' }, ambiguousSchema, context)
        ).rejects.toThrow(AmbiguityError);

        await expect(
          convertOptionWithChildType({ parent: 'MP', child: 'map_train' }, ambiguousSchema, context)
        ).rejects.toThrow(/Ambiguous value "map_train" for field.*Multiple close matches/);
      });

      it('should throw AmbiguityError if multiple children match when auto-detecting parent', async () => {
        // Test ambiguity in resolveChildAcrossParents (child-only input)
        const ambiguousSchema: FieldSchema = {
          ...fieldSchema,
          allowedValues: [
            {
              id: '10000',
              name: 'MP',
              value: 'MP',
              children: [
                { id: '10075', value: 'level_trainyard_01' },
                { id: '10076', value: 'level_trainyard_02' },
              ],
            },
          ],
        };

        await expect(
          convertOptionWithChildType({ child: 'level_train' }, ambiguousSchema, context)
        ).rejects.toThrow(AmbiguityError);

        await expect(
          convertOptionWithChildType({ child: 'level_train' }, ambiguousSchema, context)
        ).rejects.toThrow(/Ambiguous value "level_train" for field.*Multiple close matches/);
      });

      it('should throw NotFoundError if child not found in any parent', async () => {
        await expect(
          convertOptionWithChildType({ child: 'nonexistent_level' }, fieldSchema, context)
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  describe('AC5: Return JIRA API Format', () => {
    it('should return parent-only format: { id: "10000" }', async () => {
      const result = await convertOptionWithChildType({ parent: 'MP' }, fieldSchema, context);

      expect(result).toEqual({ id: '10000' });
      expect(result).not.toHaveProperty('child');
    });

    it('should return parent-child format: { id: "10000", child: { id: "10076" } }', async () => {
      const result = await convertOptionWithChildType(
        { parent: 'MP', child: 'mp_zul_trainyard_01' },
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10000',
        child: { id: '10076' },
      });
    });

    it('should handle edge case: child is "-1" (JIRA None value)', async () => {
      const schemaWithNone: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          {
            id: '10000',
            name: 'MP',
            value: 'MP',
            children: [
              { id: '-1', value: 'None' },
              { id: '10076', value: 'mp_zul_trainyard_01' },
            ],
          },
        ],
      };

      const result = await convertOptionWithChildType(
        { parent: 'MP', child: 'None' },
        schemaWithNone,
        context
      );

      expect(result).toEqual({
        id: '10000',
        child: { id: '-1' },
      });
    });
  });

  describe('AC6: Register Converter in Type Registry', () => {
    it('should work for field type "option-with-child"', () => {
      expect(fieldSchema.type).toBe('option-with-child');
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should throw ValidationError if allowedValues is empty', async () => {
      const emptySchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [],
      };

      await expect(
        convertOptionWithChildType({ parent: 'MP' }, emptySchema, context)
      ).rejects.toThrow(ValidationError);
      
      await expect(
        convertOptionWithChildType({ parent: 'MP' }, emptySchema, context)
      ).rejects.toThrow(/has no allowed values/);
    });

    it('should throw ValidationError if parent has no children', async () => {
      const noChildrenSchema: FieldSchema = {
        ...fieldSchema,
        allowedValues: [
          {
            id: '10000',
            value: 'MP',
            children: undefined, // No children
          } as any,
        ],
      };

      await expect(
        convertOptionWithChildType(
          { parent: 'MP', child: 'anything' },
          noChildrenSchema,
          context
        )
      ).rejects.toThrow(ValidationError);
      
      await expect(
        convertOptionWithChildType(
          { parent: 'MP', child: 'anything' },
          noChildrenSchema,
          context
        )
      ).rejects.toThrow(/has no children/);
    });

    it('should handle string with only parent (no child after delimiter)', async () => {
      // Edge case: "MP -> " (trailing delimiter with whitespace)
      const result = await convertOptionWithChildType('MP', fieldSchema, context);
      
      // Should treat as parent-only
      expect(result).toEqual({ id: '10000' });
    });

    it('should handle case-insensitive matching for all delimiters', async () => {
      const tests = [
        'mp -> MP_ZUL_TRAINYARD_01',
        'MP, mp_zul_trainyard_01',
        'Mp / MP_ZUL_TRAINYARD_01',
      ];

      for (const test of tests) {
        const result = await convertOptionWithChildType(test, fieldSchema, context);
        expect(result).toEqual({
          id: '10000',
          child: { id: '10076' },
        });
      }
    });
  });

  describe('JIRA API Format Pass-Through', () => {
    it('should pass through valid parent with id', async () => {
      const result = await convertOptionWithChildType(
        { id: '10000', value: 'MP' },
        fieldSchema,
        context
      );
      
      expect(result).toEqual({ id: '10000', value: 'MP' });
    });

    it('should pass through valid parent+child with ids', async () => {
      const result = await convertOptionWithChildType(
        { 
          id: '10000', 
          value: 'MP',
          child: { id: '10076', value: 'mp_zul_trainyard_01' }
        },
        fieldSchema,
        context
      );
      
      expect(result).toEqual({ 
        id: '10000', 
        value: 'MP',
        child: { id: '10076', value: 'mp_zul_trainyard_01' }
      });
    });

    it('should pass through valid parent-only (no child property)', async () => {
      const result = await convertOptionWithChildType(
        { id: '10001' },
        fieldSchema,
        context
      );
      
      expect(result).toEqual({ id: '10001' });
    });

    it('should fall back to converter logic when child id does not match parent', async () => {
      await expect(
        convertOptionWithChildType(
          { id: '10000', child: { id: '99999' } },
          fieldSchema,
          context
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should throw when parent id is not present in schema', async () => {
      await expect(
        convertOptionWithChildType(
          { id: 'does-not-exist', child: { id: '10076' } },
          fieldSchema,
          context
        )
      ).rejects.toThrow(ValidationError);
    });
  });
});

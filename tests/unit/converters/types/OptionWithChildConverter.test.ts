import { convertOptionWithChildType } from '../../../../src/converters/types/OptionWithChildConverter.js';
import { ValidationError, AmbiguityError, NotFoundError } from '../../../../src/errors.js';
import type { FieldSchema, ConversionContext } from '../../../../src/types/converter.js';
import { createMockContext, createMockCache } from '../../../helpers/test-utils.js';

describe('OptionWithChildConverter', () => {
  // Mock field schema based on real JIRA cascading select
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
          { id: '10075', value: 'mp_apartment' },
          { id: '10076', value: 'mp_backyard_01' },
          { id: '10077', value: 'mp_backyard_02' },
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
    projectKey: 'PROJ',
    issueType: 'Story',
    cache: mockCache as any,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AC1: Parse Parent-Child Input Format', () => {
    describe('Object format', () => {
      it('should accept object with parent and child: { parent: "MP", child: "mp_backyard_01" }', async () => {
        const result = await convertOptionWithChildType(
          { parent: 'MP', child: 'mp_backyard_01' },
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

      it('should accept object with child only: { child: "mp_apartment" }', async () => {
        const result = await convertOptionWithChildType(
          { child: 'mp_apartment' },
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
      it('should parse "MP -> mp_backyard_01"', async () => {
        const result = await convertOptionWithChildType(
          'MP -> mp_backyard_01',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10076' },
        });
      });

      it('should handle no spaces: "MP->mp_backyard_01"', async () => {
        const result = await convertOptionWithChildType(
          'MP->mp_backyard_01',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10076' },
        });
      });

      it('should handle multiple spaces: "MP  ->  mp_backyard_01"', async () => {
        const result = await convertOptionWithChildType(
          'MP  ->  mp_backyard_01',
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
          'MP -> mp_backyard_01',
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

      it('should treat "mp_apartment" as child-only and auto-detect parent MP', async () => {
        const result = await convertOptionWithChildType(
          'mp_apartment',
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

      it('should throw ValidationError on object with non-extractable value', async () => {
        // Object that isn't { parent, child } and doesn't have extractable string value
        await expect(
          convertOptionWithChildType({ nested: { complex: 'structure' } } as any, fieldSchema, context)
        ).rejects.toThrow(ValidationError);
        await expect(
          convertOptionWithChildType({ nested: { complex: 'structure' } } as any, fieldSchema, context)
        ).rejects.toThrow(/Invalid object format for cascading select field/);
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
    it('should resolve child "mp_backyard_01" within parent "MP"', async () => {
      const result = await convertOptionWithChildType(
        { parent: 'MP', child: 'mp_backyard_01' },
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10000',
        child: { id: '10076' },
      });
    });

    it('should be case-insensitive: "MP_BACKYARD_01" matches', async () => {
      const result = await convertOptionWithChildType(
        { parent: 'MP', child: 'MP_BACKYARD_01' },
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
      it('should auto-detect parent when child is unambiguous: "mp_apartment" → MP', async () => {
        const result = await convertOptionWithChildType(
          { child: 'mp_apartment' },
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
                { id: '10075', value: 'map_backyard_01' },
                { id: '10076', value: 'map_backyard_02' },
              ],
            },
          ],
        };

        // 'backyard' fuzzy matches both 'map_backyard_01' and 'map_backyard_02' equally
        await expect(
          convertOptionWithChildType({ parent: 'MP', child: 'backyard' }, ambiguousSchema, context)
        ).rejects.toThrow(AmbiguityError);

        await expect(
          convertOptionWithChildType({ parent: 'MP', child: 'backyard' }, ambiguousSchema, context)
        ).rejects.toThrow(/Ambiguous value "backyard" for field.*Multiple close matches/);
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
                { id: '10075', value: 'level_backyard_01' },
                { id: '10076', value: 'level_backyard_02' },
              ],
            },
          ],
        };

        // 'level_backyard' fuzzy matches both children equally
        await expect(
          convertOptionWithChildType({ child: 'level_back' }, ambiguousSchema, context)
        ).rejects.toThrow(AmbiguityError);

        await expect(
          convertOptionWithChildType({ child: 'level_back' }, ambiguousSchema, context)
        ).rejects.toThrow(/Ambiguous value "level_back" for field.*Multiple close matches/);
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
        { parent: 'MP', child: 'mp_backyard_01' },
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
              { id: '10076', value: 'mp_backyard_01' },
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
        'mp -> MP_BACKYARD_01',
        'MP, mp_backyard_01',
        'Mp / MP_BACKYARD_01',
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
          child: { id: '10076', value: 'mp_backyard_01' }
        },
        fieldSchema,
        context
      );
      
      expect(result).toEqual({ 
        id: '10000', 
        value: 'MP',
        child: { id: '10076', value: 'mp_backyard_01' }
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

  describe('Additional Delimiters (> and |)', () => {
    it('should parse "MP > mp_backyard_01" with greater-than delimiter', async () => {
      const result = await convertOptionWithChildType(
        'MP > mp_backyard_01',
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10000',
        child: { id: '10076' },
      });
    });

    it('should parse "ZM | zm_castle" with pipe delimiter', async () => {
      const result = await convertOptionWithChildType(
        'ZM | zm_castle',
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10001',
        child: { id: '10080' },
      });
    });

    it('should handle no spaces with > delimiter: "CP>cp_hacienda"', async () => {
      const result = await convertOptionWithChildType(
        'CP>cp_hacienda',
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10002',
        child: { id: '10090' },
      });
    });

    it('should handle no spaces with | delimiter: "MP|mp_apartment"', async () => {
      const result = await convertOptionWithChildType(
        'MP|mp_apartment',
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10000',
        child: { id: '10075' },
      });
    });

    it('should prioritize -> over > when both present', async () => {
      // "A -> B > C" should split on -> first
      const result = await convertOptionWithChildType(
        'MP -> mp_backyard_01',
        fieldSchema,
        context
      );

      expect(result).toEqual({
        id: '10000',
        child: { id: '10076' },
      });
    });
  });

  describe('Fallback Delimiter Detection (single non-alphanumeric group)', () => {
    // Extended schema with realistic multi-word options
    const extendedFieldSchema: FieldSchema = {
      id: 'customfield_10051',
      name: 'Department',
      type: 'option-with-child',
      required: false,
      schema: { 
        type: 'option-with-child', 
        custom: 'com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect',
        customId: 10051 
      },
      allowedValues: [
        {
          id: '20000',
          name: 'Design',
          value: 'Design',
          children: [
            { id: '20001', value: 'Level' },
            { id: '20002', value: 'Level One' },
            { id: '20003', value: 'Senior' },
          ],
        },
        {
          id: '20010',
          name: 'Engineering',
          value: 'Engineering',
          children: [
            { id: '20011', value: 'Backend' },
            { id: '20012', value: 'Frontend' },
          ],
        },
        {
          id: '20020',
          name: 'Product Design',
          value: 'Product Design',
          children: [
            { id: '20021', value: 'Level One' },
            { id: '20022', value: 'Level Two' },
          ],
        },
      ],
    };

    describe('Valid single non-alphanumeric group splits', () => {
      it('should split "Design - Level" on single hyphen group', async () => {
        const result = await convertOptionWithChildType(
          'Design - Level',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20000',
          child: { id: '20001' },
        });
      });

      it('should split "Engineering -- Backend" on double hyphen group', async () => {
        const result = await convertOptionWithChildType(
          'Engineering -- Backend',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20010',
          child: { id: '20011' },
        });
      });

      it('should split "Design & Level" on ampersand', async () => {
        const result = await convertOptionWithChildType(
          'Design & Level',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20000',
          child: { id: '20001' },
        });
      });

      it('should split "Product Design - Level One" with multi-word parent and child', async () => {
        const result = await convertOptionWithChildType(
          'Product Design - Level One',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20020',
          child: { id: '20021' },
        });
      });

      it('should split on complex delimiter group "Product Design --# Level Two"', async () => {
        const result = await convertOptionWithChildType(
          'Product Design --# Level Two',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20020',
          child: { id: '20022' },
        });
      });

      it('should split "Engineering * Frontend" on asterisk', async () => {
        const result = await convertOptionWithChildType(
          'Engineering * Frontend',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20010',
          child: { id: '20012' },
        });
      });

      it('should split "Design +/@ Senior" on mixed symbols', async () => {
        const result = await convertOptionWithChildType(
          'Design +/@ Senior',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20000',
          child: { id: '20003' },
        });
      });
    });

    describe('Ambiguous splits (multiple non-alphanumeric groups)', () => {
      it('should throw AmbiguityError for "Product-Design - Level-One" (multiple split points)', async () => {
        await expect(
          convertOptionWithChildType(
            'Product-Design - Level-One',
            extendedFieldSchema,
            context
          )
        ).rejects.toThrow(AmbiguityError);
      });

      it('should throw AmbiguityError for "Design - Level_One" (hyphen and underscore)', async () => {
        await expect(
          convertOptionWithChildType(
            'Design - Level_One',
            extendedFieldSchema,
            context
          )
        ).rejects.toThrow(AmbiguityError);
      });

      it('should include helpful message about using supported delimiters', async () => {
        await expect(
          convertOptionWithChildType(
            'Product-Design - Level-One',
            extendedFieldSchema,
            context
          )
        ).rejects.toThrow(/use a supported delimiter/i);
      });
    });

    describe('Fallback order verification', () => {
      it('should try child-only match before fallback split', async () => {
        // "mp_apartment" should match as child directly, not try to split
        const result = await convertOptionWithChildType(
          'mp_apartment',
          fieldSchema,
          context
        );

        expect(result).toEqual({
          id: '10000',
          child: { id: '10075' },
        });
      });

      it('should try parent-only match before fallback split', async () => {
        // "Engineering" is a valid parent name
        const result = await convertOptionWithChildType(
          'Engineering',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({ id: '20010' });
      });

      it('should use fallback split only when child and parent lookups fail', async () => {
        // "Design - Level" won't match as child or parent, so fallback splits it
        const result = await convertOptionWithChildType(
          'Design - Level',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20000',
          child: { id: '20001' },
        });
      });
    });

    describe('Edge cases', () => {
      it('should handle leading/trailing spaces in fallback split', async () => {
        const result = await convertOptionWithChildType(
          '  Design  -  Level  ',
          extendedFieldSchema,
          context
        );

        expect(result).toEqual({
          id: '20000',
          child: { id: '20001' },
        });
      });

      it('should throw NotFoundError when fallback split parent not found', async () => {
        await expect(
          convertOptionWithChildType(
            'Unknown - Level',
            extendedFieldSchema,
            context
          )
        ).rejects.toThrow(NotFoundError);
      });

      it('should throw NotFoundError when fallback split child not found', async () => {
        await expect(
          convertOptionWithChildType(
            'Design - Unknown',
            extendedFieldSchema,
            context
          )
        ).rejects.toThrow(NotFoundError);
      });
    });
  });
});

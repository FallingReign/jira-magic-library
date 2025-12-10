/**
 * Unit tests for resolveUniqueName helper
 * Story: E2-S05
 */

import { resolveUniqueName } from '../../../src/utils/resolveUniqueName.js';
import { AmbiguityError } from '../../../src/errors.js';

describe('resolveUniqueName', () => {
  describe('AC1: Detect Ambiguous Names', () => {
    it('should return single match when name matches one value', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend' },
        { id: '10002', name: 'Frontend' },
      ];

      const result = resolveUniqueName('Backend', allowedValues, {
        field: 'component',
        fieldName: 'Component',
      });

      expect(result).toEqual({ id: '10001', name: 'Backend' });
    });

    it('should throw AmbiguityError when name matches multiple values (no exact match)', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend API' },
        { id: '10002', name: 'Backend Services' },
        { id: '10003', name: 'Backend Core' },
      ];

      expect(() =>
        resolveUniqueName('Backend', allowedValues, {
          field: 'component',
          fieldName: 'Component',
        })
      ).toThrow(AmbiguityError);
    });

    it('should include all matching candidates in error', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend API' },
        { id: '10002', name: 'Backend Services' },
        { id: '10003', name: 'Backend Core' },
      ];

      try {
        resolveUniqueName('Backend', allowedValues, {
          field: 'component',
          fieldName: 'Component',
        });
        // Should have thrown
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(AmbiguityError);
        expect(error.details.candidates).toHaveLength(3);
        expect(error.details.candidates).toEqual([
          { id: '10001', name: 'Backend API' },
          { id: '10002', name: 'Backend Services' },
          { id: '10003', name: 'Backend Core' },
        ]);
      }
    });
  });

  describe('AC2: Error Message Format', () => {
    it('should include field name in error message', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend API' },
        { id: '10002', name: 'Backend Services' },
      ];

      try {
        resolveUniqueName('Backend', allowedValues, {
          field: 'component',
          fieldName: 'Component',
        });
        expect(true).toBe(false); // Should have thrown
      } catch (error: any) {
        expect(error.message).toContain('Component');
      }
    });

    it('should include ambiguous value in error message', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend API' },
        { id: '10002', name: 'Backend Services' },
      ];

      try {
        resolveUniqueName('Backend', allowedValues, {
          field: 'component',
          fieldName: 'Component',
        });
        expect(true).toBe(false); // Should have thrown
      } catch (error: any) {
        expect(error.message).toContain('Backend');
      }
    });

    it('should format candidates as "Name (id: {id})"', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend API' },
        { id: '10002', name: 'Backend Services' },
      ];

      try {
        resolveUniqueName('Backend', allowedValues, {
          field: 'component',
          fieldName: 'Component',
        });
        expect(true).toBe(false); // Should have thrown
      } catch (error: any) {
        // E3-S16: New format includes fuzzy match scores
        expect(error.message).toContain('Backend API');
        expect(error.message).toContain('id: 10001');
        expect(error.message).toContain('Backend Services');
        expect(error.message).toContain('id: 10002');
      }
    });

    it('should suggest providing ID directly', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend API' },
        { id: '10002', name: 'Backend Services' },
      ];

      try {
        resolveUniqueName('Backend', allowedValues, {
          field: 'component',
          fieldName: 'Component',
        });
        expect(true).toBe(false); // Should have thrown
      } catch (error: any) {
        expect(error.message).toContain('specify by ID');
        expect(error.message).toContain('{ id:');
      }
    });
  });

  describe('AC3: Case-Insensitive Matching', () => {
    it('should match lowercase input to mixed case value', () => {
      const allowedValues = [
        { id: '1', name: 'High' },
        { id: '2', name: 'Medium' },
      ];

      const result = resolveUniqueName('high', allowedValues, {
        field: 'priority',
        fieldName: 'Priority',
      });

      expect(result).toEqual({ id: '1', name: 'High' });
    });

    it('should match uppercase input to mixed case value', () => {
      const allowedValues = [
        { id: '1', name: 'High' },
        { id: '2', name: 'Medium' },
      ];

      const result = resolveUniqueName('HIGH', allowedValues, {
        field: 'priority',
        fieldName: 'Priority',
      });

      expect(result).toEqual({ id: '1', name: 'High' });
    });

    it('should preserve original casing in error messages', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend API' },
        { id: '10002', name: 'BACKEND Services' },
      ];

      try {
        resolveUniqueName('backend', allowedValues, {
          field: 'component',
          fieldName: 'Component',
        });
        expect(true).toBe(false); // Should have thrown
      } catch (error: any) {
        // E3-S16: New fuzzy matching format includes scores
        expect(error.message).toContain('Backend API');
        expect(error.message).toContain('BACKEND Services');
        expect(error.message).not.toContain('backend Services'); // lowercase version shouldn't exist
      }
    });
  });

  describe('AC4: Exact Match Preference', () => {
    it('should prefer exact match over partial match', () => {
      const allowedValues = [
        { id: '10001', name: 'Back' },
        { id: '10002', name: 'Backend' },
      ];

      const result = resolveUniqueName('Back', allowedValues, {
        field: 'component',
        fieldName: 'Component',
      });

      expect(result).toEqual({ id: '10001', name: 'Back' });
    });

    it('should prefer exact match even with multiple partial matches', () => {
      const allowedValues = [
        { id: '10001', name: 'API' },
        { id: '10002', name: 'API Gateway' },
        { id: '10003', name: 'API Services' },
      ];

      const result = resolveUniqueName('API', allowedValues, {
        field: 'component',
        fieldName: 'Component',
      });

      expect(result).toEqual({ id: '10001', name: 'API' });
    });

    it('should be case-insensitive for exact match', () => {
      const allowedValues = [
        { id: '10001', name: 'API' },
        { id: '10002', name: 'API Gateway' },
      ];

      const result = resolveUniqueName('api', allowedValues, {
        field: 'component',
        fieldName: 'Component',
      });

      expect(result).toEqual({ id: '10001', name: 'API' });
    });

    it('should throw if multiple exact matches exist', () => {
      const allowedValues = [
        { id: '10001', name: 'Backend' },
        { id: '10002', name: 'Backend' }, // Duplicate name (edge case)
      ];

      expect(() =>
        resolveUniqueName('Backend', allowedValues, {
          field: 'component',
          fieldName: 'Component',
        })
      ).toThrow(AmbiguityError);
    });
  });

  describe('AC5: Helper Function', () => {
    it('should accept name, allowedValues, and context parameters', () => {
      const allowedValues = [{ id: '1', name: 'Test' }];

      expect(() =>
        resolveUniqueName('Test', allowedValues, {
          field: 'test',
          fieldName: 'Test Field',
        })
      ).not.toThrow();
    });

    it('should return single match object', () => {
      const allowedValues = [
        { id: '1', name: 'Test', extra: 'data' },
      ];

      const result = resolveUniqueName('Test', allowedValues, {
        field: 'test',
        fieldName: 'Test Field',
      });

      expect(result).toEqual({ id: '1', name: 'Test', extra: 'data' });
    });
  });

  describe('AC6: Edge Cases', () => {
    it('should throw ValidationError when no matches found', () => {
      const allowedValues = [
        { id: '1', name: 'Test' },
      ];

      expect(() =>
        resolveUniqueName('NonExistent', allowedValues, {
          field: 'test',
          fieldName: 'Test Field',
        })
      ).toThrow('not found');
    });

    it('should throw ValidationError when allowedValues is empty', () => {
      const allowedValues: Array<{ id: string; name: string }> = [];

      expect(() =>
        resolveUniqueName('Test', allowedValues, {
          field: 'test',
          fieldName: 'Test Field',
        })
      ).toThrow('not found');
    });

    it('should handle null input by throwing ValidationError', () => {
      const allowedValues = [{ id: '1', name: 'Test' }];

      expect(() =>
        resolveUniqueName(null as any, allowedValues, {
          field: 'test',
          fieldName: 'Test Field',
        })
      ).toThrow();
    });

    it('should handle undefined input by throwing ValidationError', () => {
      const allowedValues = [{ id: '1', name: 'Test' }];

      expect(() =>
        resolveUniqueName(undefined as any, allowedValues, {
          field: 'test',
          fieldName: 'Test Field',
        })
      ).toThrow();
    });

    it('should handle empty string input by throwing ValidationError', () => {
      const allowedValues = [{ id: '1', name: 'Test' }];

      expect(() =>
        resolveUniqueName('', allowedValues, {
          field: 'test',
          fieldName: 'Test Field',
        })
      ).toThrow();
    });

    it('should trim whitespace from input before matching', () => {
      const allowedValues = [
        { id: '1', name: 'Test' },
      ];

      const result = resolveUniqueName('  Test  ', allowedValues, {
        field: 'test',
        fieldName: 'Test Field',
      });

      expect(result).toEqual({ id: '1', name: 'Test' });
    });

    it('should handle non-string input (number) by throwing ValidationError', () => {
      const allowedValues = [{ id: '1', name: 'Test' }];

      expect(() =>
        resolveUniqueName(123 as any, allowedValues, {
          field: 'test',
          fieldName: 'Test Field',
        })
      ).toThrow('Expected string');
    });
  });

  describe('AC3: Fuzzy Matching with Underscores/Dashes (E3-S16)', () => {
    it('should match "MS7 2025" to "PROJ_MS7_2025" (underscore normalization)', () => {
      const versions = [
        { id: '1', name: 'PROJ_MS1_2024' },
        { id: '2', name: 'PROJ_MS7_2025' },
        { id: '3', name: 'PROJ_MS18_2027' },
      ];

      const result = resolveUniqueName('MS7 2025', versions, {
        field: 'fixVersions',
        fieldName: 'Fix Version/s',
      });

      expect(result.name).toBe('PROJ_MS7_2025');
      expect(result.id).toBe('2');
    });

    it('should match "code automation" to "Code - Automation" (dash normalization)', () => {
      const components = [
        { id: '1', name: 'Code - Automation' },
        { id: '2', name: 'Code - Backend' },
        { id: '3', name: 'UI - Frontend' },
      ];

      const result = resolveUniqueName('code automation', components, {
        field: 'components',
        fieldName: 'Component/s',
      });

      expect(result.name).toBe('Code - Automation');
      expect(result.id).toBe('1');
    });

    it('should match "p1 critical" to "P1 - Critical" (exact substring with dash)', () => {
      const priorities = [
        { id: '1', name: 'P1 - Critical' },
        { id: '2', name: 'P2 - High' },
        { id: '3', name: 'P3 - Medium' },
      ];

      const result = resolveUniqueName('p1 critical', priorities, {
        field: 'priority',
        fieldName: 'Priority',
      });

      expect(result.name).toBe('P1 - Critical');
      expect(result.id).toBe('1');
    });
  });

  describe('AC4: Fuzzy Matching with Typos (E3-S16)', () => {
    it('should match "automaton" to "Code - Automation" (typo tolerance)', () => {
      const components = [
        { id: '1', name: 'Code - Automation' },
        { id: '2', name: 'UI - Frontend' },
      ];

      const result = resolveUniqueName('automaton', components, {
        field: 'components',
        fieldName: 'Component/s',
      });

      expect(result.name).toBe('Code - Automation');
      expect(result.id).toBe('1');
    });

    it('should match "apartmnt" to "mp_apartment" (missing letter)', () => {
      const options = [
        { id: '1', name: 'mp_apartment' },
        { id: '2', name: 'mp_proj_warzone' },
      ];

      // 'apartmnt' is missing the 'e' - should fuzzy match 'mp_apartment'
      const result = resolveUniqueName('apartmnt', options, {
        field: 'customfield_10020',
        fieldName: 'Level',
      });

      expect(result.name).toBe('mp_apartment');
      expect(result.id).toBe('1');
    });

    it('should match "critcal" to "P1 - Critical" (transposition)', () => {
      const priorities = [
        { id: '1', name: 'P1 - Critical' },
        { id: '2', name: 'P2 - High' },
      ];

      const result = resolveUniqueName('critcal', priorities, {
        field: 'priority',
        fieldName: 'Priority',
      });

      expect(result.name).toBe('P1 - Critical');
      expect(result.id).toBe('1');
    });
  });

  describe('AC5: Ambiguity Detection with Fuzzy Matching (E3-S16)', () => {
    it('should throw AmbiguityError when multiple close fuzzy matches', () => {
      const components = [
        { id: '1', name: 'Code - Automation' },
        { id: '2', name: 'Code - Automation Tests' },
      ];

      expect(() =>
        resolveUniqueName('code automation', components, {
          field: 'components',
          fieldName: 'Component/s',
        })
      ).toThrow(AmbiguityError);
    });

    it('should return single clear winner when scores differ significantly', () => {
      const versions = [
        { id: '1', name: 'PROJ_MS7_2025' },
        { id: '2', name: 'PROJ_MS17_2025' },
      ];

      const result = resolveUniqueName('MS7 2025', versions, {
        field: 'fixVersions',
        fieldName: 'Fix Version/s',
      });

      // "MS7 2025" should match "PROJ_MS7_2025" much better than "PROJ_MS17_2025"
      expect(result.name).toBe('PROJ_MS7_2025');
      expect(result.id).toBe('1');
    });

    it('should still prefer exact match over fuzzy match', () => {
      const priorities = [
        { id: '1', name: 'High' },
        { id: '2', name: 'P2 - High Priority' },
      ];

      const result = resolveUniqueName('High', priorities, {
        field: 'priority',
        fieldName: 'Priority',
      });

      // Exact match should win
      expect(result.name).toBe('High');
      expect(result.id).toBe('1');
    });
  });

  describe('Invisible Unicode Character Handling', () => {
    const projects = [
      { id: 'HELP', name: 'Help Desk' },
      { id: 'PROJ', name: 'Project Alpha' },
    ];

    it('should match despite zero-width space (U+200B)', () => {
      const result = resolveUniqueName('HELP\u200B', projects, {
        field: 'project',
        fieldName: 'Project',
      });

      expect(result.id).toBe('HELP');
    });

    it('should match despite zero-width non-joiner (U+200C)', () => {
      const result = resolveUniqueName('HELP\u200C', projects, {
        field: 'project',
        fieldName: 'Project',
      });

      expect(result.id).toBe('HELP');
    });

    it('should match despite zero-width joiner (U+200D)', () => {
      const result = resolveUniqueName('HELP\u200D', projects, {
        field: 'project',
        fieldName: 'Project',
      });

      expect(result.id).toBe('HELP');
    });

    it('should match despite byte order mark (U+FEFF)', () => {
      const result = resolveUniqueName('\uFEFFHELP', projects, {
        field: 'project',
        fieldName: 'Project',
      });

      expect(result.id).toBe('HELP');
    });

    it('should match despite non-breaking space (U+00A0)', () => {
      const result = resolveUniqueName('HELP\u00A0', projects, {
        field: 'project',
        fieldName: 'Project',
      });

      expect(result.id).toBe('HELP');
    });

    it('should match despite multiple invisible characters', () => {
      const result = resolveUniqueName('\uFEFFHELP\u200B\u00A0', projects, {
        field: 'project',
        fieldName: 'Project',
      });

      expect(result.id).toBe('HELP');
    });

    it('should match by name with invisible characters', () => {
      const result = resolveUniqueName('Help\u200BDesk', projects, {
        field: 'project',
        fieldName: 'Project',
      });

      expect(result.id).toBe('HELP');
    });
  });
});

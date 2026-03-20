/**
 * Unit tests for special field detection
 *
 * Special fields are identified by schema.custom (not type/items) because JIRA's createmeta
 * type information does not accurately describe the required write format for certain fields.
 */

import { resolveSpecialType, SPECIAL_FIELD_CUSTOM_TYPES } from '../../../src/converters/specialFields.js';

describe('specialFields', () => {
  describe('resolveSpecialType', () => {
    it('should return "sprint" for Sprint custom key', () => {
      expect(resolveSpecialType('com.pyxis.greenhopper.jira:gh-sprint')).toBe('sprint');
    });

    it('should return undefined for an unknown custom key', () => {
      expect(resolveSpecialType('com.unknown.plugin:some-field')).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(resolveSpecialType(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(resolveSpecialType('')).toBeUndefined();
    });

    it('should be case-sensitive (custom keys are exact identifiers)', () => {
      expect(resolveSpecialType('com.pyxis.greenhopper.jira:GH-SPRINT')).toBeUndefined();
    });
  });

  describe('SPECIAL_FIELD_CUSTOM_TYPES', () => {
    it('should map Sprint custom key to "sprint"', () => {
      expect(SPECIAL_FIELD_CUSTOM_TYPES['com.pyxis.greenhopper.jira:gh-sprint']).toBe('sprint');
    });

    it('should be a plain object (easily extensible)', () => {
      expect(typeof SPECIAL_FIELD_CUSTOM_TYPES).toBe('object');
    });
  });
});

/**
 * Unit tests for extractFieldValue utility
 * 
 * Tests the universal shallow extraction for JIRA API object formats.
 */

import { extractFieldValue } from '../../../src/utils/extractFieldValue.js';

describe('extractFieldValue', () => {
  describe('Rule 1: Non-objects pass through', () => {
    it('should pass through null', () => {
      expect(extractFieldValue(null)).toBe(null);
    });

    it('should pass through undefined', () => {
      expect(extractFieldValue(undefined)).toBe(undefined);
    });

    it('should pass through strings', () => {
      expect(extractFieldValue('High')).toBe('High');
      expect(extractFieldValue('')).toBe('');
    });

    it('should pass through numbers', () => {
      expect(extractFieldValue(123)).toBe(123);
      expect(extractFieldValue(0)).toBe(0);
      expect(extractFieldValue(-1)).toBe(-1);
    });

    it('should pass through booleans', () => {
      expect(extractFieldValue(true)).toBe(true);
      expect(extractFieldValue(false)).toBe(false);
    });

    it('should pass through arrays', () => {
      const arr = [{ name: 'a' }, { name: 'b' }];
      expect(extractFieldValue(arr)).toBe(arr);
    });
  });

  describe('Rule 2: Objects with JIRA identifiers pass through', () => {
    it('should pass through object with id', () => {
      const obj = { id: '10100' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through object with id and other properties', () => {
      const obj = { id: '10100', value: 'Production', self: 'https://...' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through object with accountId', () => {
      const obj = { accountId: 'abc123' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through object with accountId and other properties', () => {
      const obj = { accountId: 'abc123', displayName: 'John Doe' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through object with key', () => {
      const obj = { key: 'PROJ' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through object with key and other properties', () => {
      const obj = { key: 'PROJ', name: 'My Project' };
      expect(extractFieldValue(obj)).toBe(obj);
    });
  });

  describe('Rule 3: Objects with multiple keys OR nested values pass through', () => {
    it('should pass through object with multiple keys', () => {
      const obj = { parent: 'MP', child: 'map1' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through object with name and iconUrl', () => {
      const obj = { name: 'High', iconUrl: 'https://...' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through single-key object with nested object value', () => {
      const obj = { child: { id: '10076' } };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through single-key object with array value', () => {
      const obj = { items: ['a', 'b', 'c'] };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should extract null from single-key object with null value', () => {
      // null is a primitive, so it gets extracted
      expect(extractFieldValue({ value: null })).toBe(null);
    });
  });

  describe('Rule 4: Single-key object with primitive value extracts', () => {
    it('should extract string from { value: "Production" }', () => {
      expect(extractFieldValue({ value: 'Production' })).toBe('Production');
    });

    it('should extract string from { name: "High" }', () => {
      expect(extractFieldValue({ name: 'High' })).toBe('High');
    });

    it('should extract string from { displayName: "John" }', () => {
      expect(extractFieldValue({ displayName: 'John' })).toBe('John');
    });

    it('should extract number from { value: 123 }', () => {
      expect(extractFieldValue({ value: 123 })).toBe(123);
    });

    it('should extract boolean from { value: true }', () => {
      expect(extractFieldValue({ value: true })).toBe(true);
    });

    it('should extract boolean from { value: false }', () => {
      expect(extractFieldValue({ value: false })).toBe(false);
    });

    it('should extract 0 from { value: 0 }', () => {
      expect(extractFieldValue({ value: 0 })).toBe(0);
    });

    it('should extract empty string from { value: "" }', () => {
      expect(extractFieldValue({ value: '' })).toBe('');
    });

    it('should extract from { foo: "bar" } (unknown key)', () => {
      expect(extractFieldValue({ foo: 'bar' })).toBe('bar');
    });

    it('should extract cascading string from { value: "MP -> map1" }', () => {
      expect(extractFieldValue({ value: 'MP -> map1' })).toBe('MP -> map1');
    });
  });

  describe('Edge cases', () => {
    it('should pass through empty object', () => {
      const obj = {};
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should handle object with falsy id (empty string)', () => {
      // Empty string is falsy, so 'id' in obj is true but obj.id is falsy
      // Rule 2 checks 'id' in obj - this passes, so it returns unchanged
      // Actually let me check the implementation...
      // Rule 2: if ('id' in obj || 'accountId' in obj || 'key' in obj) return value;
      // This just checks presence, not truthiness. So { id: '' } would pass through.
      const obj = { id: '' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should handle object with id: 0', () => {
      const obj = { id: 0 };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should handle object with undefined value', () => {
      const obj = { value: undefined };
      expect(extractFieldValue(obj)).toBe(undefined);
    });
  });

  describe('Real-world JIRA API formats', () => {
    it('should extract from option field: { value: "Production" }', () => {
      expect(extractFieldValue({ value: 'Production' })).toBe('Production');
    });

    it('should pass through resolved option: { id: "10100", value: "Production" }', () => {
      const obj = { id: '10100', value: 'Production' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should extract from priority field: { name: "High" }', () => {
      expect(extractFieldValue({ name: 'High' })).toBe('High');
    });

    it('should pass through resolved priority: { id: "2", name: "High" }', () => {
      const obj = { id: '2', name: 'High' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should extract from cascading select wrapper: { value: "MP -> mp_backyard_01" }', () => {
      expect(extractFieldValue({ value: 'MP -> mp_backyard_01' })).toBe('MP -> mp_backyard_01');
    });

    it('should pass through cascading select JML format: { parent: "MP", child: "map1" }', () => {
      const obj = { parent: 'MP', child: 'map1' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through cascading select JIRA format: { id: "10000", child: { id: "10076" } }', () => {
      const obj = { id: '10000', child: { id: '10076' } };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should pass through user with accountId: { accountId: "5d8c..." }', () => {
      const obj = { accountId: '5d8c...' };
      expect(extractFieldValue(obj)).toBe(obj);
    });

    it('should extract from user with name only: { name: "john.doe" }', () => {
      expect(extractFieldValue({ name: 'john.doe' })).toBe('john.doe');
    });

    it('should pass through project with key: { key: "PROJ" }', () => {
      const obj = { key: 'PROJ' };
      expect(extractFieldValue(obj)).toBe(obj);
    });
  });
});

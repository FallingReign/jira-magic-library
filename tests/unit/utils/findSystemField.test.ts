import { findSystemField, isIdOnlyObject, SystemFieldResult } from '../../../src/utils/findSystemField.js';

describe('findSystemField', () => {
  describe('finding project field', () => {
    it('should find Project field with exact key', () => {
      const input = { Project: 'ENG', Summary: 'Test' };
      const result = findSystemField(input, 'project');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'Project',
        value: 'ENG',
        extracted: 'ENG',
      });
    });

    it('should find project field with lowercase key', () => {
      const input = { project: 'ENG', summary: 'Test' };
      const result = findSystemField(input, 'project');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'project',
        value: 'ENG',
        extracted: 'ENG',
      });
    });

    it('should find PROJECT field with uppercase key', () => {
      const input = { PROJECT: 'ENG', SUMMARY: 'Test' };
      const result = findSystemField(input, 'project');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'PROJECT',
        value: 'ENG',
        extracted: 'ENG',
      });
    });

    it('should extract from object with key property', () => {
      const input = { project: { key: 'ENG' }, summary: 'Test' };
      const result = findSystemField(input, 'project');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'project',
        value: { key: 'ENG' },
        extracted: 'ENG',
      });
    });

    it('should extract from object with name property', () => {
      const input = { project: { name: 'Engineering' }, summary: 'Test' };
      const result = findSystemField(input, 'project');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'project',
        value: { name: 'Engineering' },
        extracted: 'Engineering',
      });
    });

    it('should return undefined when project not found', () => {
      const input = { summary: 'Test', issuetype: 'Bug' };
      const result = findSystemField(input, 'project');
      
      expect(result).toBeUndefined();
    });
  });

  describe('finding issuetype field', () => {
    it('should find Issue Type field with space', () => {
      const input = { 'Issue Type': 'Bug', Summary: 'Test' };
      const result = findSystemField(input, 'issuetype');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'Issue Type',
        value: 'Bug',
        extracted: 'Bug',
      });
    });

    it('should find issuetype field without space', () => {
      const input = { issuetype: 'Bug', summary: 'Test' };
      const result = findSystemField(input, 'issuetype');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'issuetype',
        value: 'Bug',
        extracted: 'Bug',
      });
    });

    it('should find type field (alias for issuetype)', () => {
      const input = { type: 'Bug', summary: 'Test' };
      const result = findSystemField(input, 'issuetype');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'type',
        value: 'Bug',
        extracted: 'Bug',
      });
    });

    it('should extract from object with name property', () => {
      const input = { issuetype: { name: 'Bug' }, summary: 'Test' };
      const result = findSystemField(input, 'issuetype');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'issuetype',
        value: { name: 'Bug' },
        extracted: 'Bug',
      });
    });

    it('should extract from object with id property', () => {
      const input = { issuetype: { id: '10001' }, summary: 'Test' };
      const result = findSystemField(input, 'issuetype');
      
      expect(result).toEqual<SystemFieldResult>({
        key: 'issuetype',
        value: { id: '10001' },
        extracted: '10001',
      });
    });
  });

  describe('value extraction', () => {
    it('should handle string values', () => {
      const result = findSystemField({ project: 'ENG' }, 'project');
      expect(result?.extracted).toBe('ENG');
    });

    it('should handle number values by converting to string', () => {
      const result = findSystemField({ project: 42 }, 'project');
      expect(result?.extracted).toBe('42');
    });

    it('should handle boolean values by converting to string', () => {
      const result = findSystemField({ project: true }, 'project');
      expect(result?.extracted).toBe('true');
    });

    it('should return null for empty string values', () => {
      const result = findSystemField({ project: '' }, 'project');
      expect(result?.extracted).toBeNull();
    });

    it('should return null for whitespace-only string values', () => {
      const result = findSystemField({ project: '   ' }, 'project');
      expect(result?.extracted).toBeNull();
    });

    it('should return null for null values', () => {
      const result = findSystemField({ project: null }, 'project');
      expect(result?.extracted).toBeNull();
    });

    it('should return null for undefined values', () => {
      const result = findSystemField({ project: undefined }, 'project');
      expect(result?.extracted).toBeNull();
    });

    it('should return null for array values', () => {
      const result = findSystemField({ project: ['ENG', 'QA'] }, 'project');
      expect(result?.extracted).toBeNull();
    });

    it('should extract value from { value: x } wrapper', () => {
      const result = findSystemField({ project: { value: 'ENG' } }, 'project');
      expect(result?.extracted).toBe('ENG');
    });
  });

  describe('input edge cases', () => {
    it('should return undefined for null input', () => {
      const result = findSystemField(null, 'project');
      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const result = findSystemField(undefined, 'project');
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      const result = findSystemField({}, 'project');
      expect(result).toBeUndefined();
    });

    it('should handle multiple fields and find correct one', () => {
      const input = {
        Project: 'ENG',
        'Issue Type': 'Bug',
        Summary: 'Test issue',
        Priority: 'High',
      };
      
      expect(findSystemField(input, 'project')?.extracted).toBe('ENG');
      expect(findSystemField(input, 'issuetype')?.extracted).toBe('Bug');
    });
  });
});

describe('isIdOnlyObject', () => {
  it('should return true for object with only id property', () => {
    expect(isIdOnlyObject({ id: '10000' })).toBe(true);
  });

  it('should return false for object with id and key', () => {
    expect(isIdOnlyObject({ id: '10000', key: 'ENG' })).toBe(false);
  });

  it('should return false for object with id and name', () => {
    expect(isIdOnlyObject({ id: '10000', name: 'Engineering' })).toBe(false);
  });

  it('should return false for object with only key', () => {
    expect(isIdOnlyObject({ key: 'ENG' })).toBe(false);
  });

  it('should return false for object with only name', () => {
    expect(isIdOnlyObject({ name: 'Engineering' })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isIdOnlyObject(null)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isIdOnlyObject('ENG')).toBe(false);
  });

  it('should return false for number', () => {
    expect(isIdOnlyObject(42)).toBe(false);
  });

  it('should return false for object with numeric id', () => {
    // id must be a string
    expect(isIdOnlyObject({ id: 10000 })).toBe(false);
  });
});

describe('extractFromObject edge cases', () => {
  it('should extract key from object with key only', () => {
    const input = { project: { key: 'ENG' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBe('ENG');
  });

  it('should extract name from object with name but no key', () => {
    const input = { 'issue type': { name: 'Bug' } };
    const result = findSystemField(input, 'issuetype');
    expect(result?.extracted).toBe('Bug');
  });

  it('should extract id from object with id but no key or name', () => {
    const input = { project: { id: '10000' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBe('10000');
  });

  it('should extract single-key object value', () => {
    // extractFieldValue rule 4: single key with primitive → extract value
    const input = { project: { unknownField: 'value' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBe('value');
  });

  it('should return null for object with multiple keys and no key/name/id', () => {
    // extractFieldValue rule 3: multiple keys pass through
    const input = { project: { a: '1', b: '2' } };
    const result = findSystemField(input, 'project');
    // Object passes through, no key/name/id to extract
    expect(result?.extracted).toBeNull();
  });

  it('should handle empty key string', () => {
    const input = { project: { key: '' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBeNull();
  });

  it('should handle empty name string', () => {
    const input = { project: { name: '' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBeNull();
  });

  it('should handle empty id string', () => {
    const input = { project: { id: '' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBeNull();
  });

  it('should handle whitespace-only id string', () => {
    const input = { project: { id: '   ' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBeNull();
  });

  it('should prefer key over name', () => {
    const input = { project: { key: 'KEY', name: 'Name' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBe('KEY');
  });

  it('should prefer name over id', () => {
    const input = { project: { name: 'Name', id: '10000' } };
    const result = findSystemField(input, 'project');
    expect(result?.extracted).toBe('Name');
  });

  it('should handle boolean extraction', () => {
    const input = { flagged: true };
    // For a custom "flagged" field that might be treated as issuetype lookup
    const result = findSystemField(input, 'flagged');
    expect(result?.extracted).toBe('true');
  });

  it('should handle number extraction', () => {
    const input = { priority: 123 };
    // For a custom field that might have numeric value
    const result = findSystemField(input, 'priority');
    expect(result?.extracted).toBe('123');
  });
});

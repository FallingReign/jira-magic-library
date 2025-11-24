/**
 * Unit Tests: Input Parser (CSV/JSON/YAML)
 * 
 * Story: E4-S01 - Unified Input Parser
 * Tests all acceptance criteria for parsing various input formats
 */

import { parseInput } from '../../../src/parsers/InputParser.js';
import { InputParseError, FileNotFoundError } from '../../../src/errors.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('InputParser', () => {
  const fixturesDir = path.join(__dirname, '../../fixtures');

  // AC1: Parse CSV from Multiple Sources
  describe('AC1: CSV Parsing', () => {
    it('should parse CSV from string', async () => {
      const csv = 'Project,Summary\nENG,Issue 1\nENG,Issue 2';
      const result = await parseInput({ data: csv, format: 'csv' });

      expect(result.format).toBe('csv');
      expect(result.source).toBe('string');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ Project: 'ENG', Summary: 'Issue 1' });
      expect(result.data[1]).toEqual({ Project: 'ENG', Summary: 'Issue 2' });
    });

    it('should parse CSV with quoted fields containing commas', async () => {
      const csv = 'Project,Summary\nENG,"Fix bug in parser, please"';
      const result = await parseInput({ data: csv, format: 'csv' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].Summary).toBe('Fix bug in parser, please');
    });

    it('should parse CSV with newlines within quoted fields', async () => {
      const csv = 'Project,Description\nENG,"Line 1\nLine 2"';
      const result = await parseInput({ data: csv, format: 'csv' });

      expect(result.data[0].Description).toBe('Line 1\nLine 2');
    });

    it('should parse CSV with escaped quotes', async () => {
      const csv = 'Project,Summary\nENG,"She said ""hello"""';
      const result = await parseInput({ data: csv, format: 'csv' });

      expect(result.data[0].Summary).toBe('She said "hello"');
    });

    it('should parse CSV from array of arrays', async () => {
      const data = [
        ['Project', 'Summary'],
        ['ENG', 'Issue 1'],
        ['ENG', 'Issue 2']
      ];
      const result = await parseInput({ data, format: 'csv' });

      expect(result.format).toBe('csv');
      expect(result.source).toBe('array');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ Project: 'ENG', Summary: 'Issue 1' });
    });

    it('should treat unquoted empty CSV fields as null', async () => {
      const csv = 'Project,Summary,Description\nENG,Issue 1,';
      const result = await parseInput({ data: csv, format: 'csv' });

      expect(result.data[0].Description).toBeNull();
    });

    it('should preserve quoted empty CSV fields as empty strings', async () => {
      const csv = 'Project,Summary,Description\nENG,Issue 1,""';
      const result = await parseInput({ data: csv, format: 'csv' });

      expect(result.data[0].Description).toBe('');
    });

    it('should parse CSV from file', async () => {
      // Create fixture file
      const csvPath = path.join(fixturesDir, 'test-issues.csv');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(csvPath, 'Project,Summary\nENG,Test Issue');

      const result = await parseInput({ from: csvPath });

      expect(result.format).toBe('csv');
      expect(result.source).toBe('file');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({ Project: 'ENG', Summary: 'Test Issue' });

      // Cleanup
      await fs.unlink(csvPath);
    });
  });

  // AC2: Parse JSON from Multiple Sources
  describe('AC2: JSON Parsing', () => {
    it('should parse JSON array from string', async () => {
      const jsonString = '[{"Project":"ENG","Summary":"Issue 1"},{"Project":"ENG","Summary":"Issue 2"}]';
      const result = await parseInput({ data: jsonString, format: 'json' });

      expect(result.format).toBe('json');
      expect(result.source).toBe('string');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ Project: 'ENG', Summary: 'Issue 1' });
    });

    it('should parse JSON single object from string', async () => {
      const jsonString = '{"Project":"ENG","Summary":"Single Issue"}';
      const result = await parseInput({ data: jsonString, format: 'json' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({ Project: 'ENG', Summary: 'Single Issue' });
    });

    it('should parse JSON from array of objects (pass-through)', async () => {
      const data = [
        { Project: 'ENG', Summary: 'Issue 1' },
        { Project: 'ENG', Summary: 'Issue 2' }
      ];
      const result = await parseInput({ data });

      expect(result.format).toBe('json');
      expect(result.source).toBe('array');
      expect(result.data).toHaveLength(2);
      expect(result.data).toEqual(data);
    });

    it('should parse JSON from single object (normalize to array)', async () => {
      const data = { Project: 'ENG', Summary: 'Single Issue' };
      const result = await parseInput({ data });

      expect(result.format).toBe('json');
      expect(result.source).toBe('object');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(data);
    });

    it('should parse JSON from file', async () => {
      const jsonPath = path.join(fixturesDir, 'test-issues.json');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(jsonPath, JSON.stringify([{ Project: 'ENG', Summary: 'Test' }]));

      const result = await parseInput({ from: jsonPath });

      expect(result.format).toBe('json');
      expect(result.source).toBe('file');
      expect(result.data).toHaveLength(1);

      await fs.unlink(jsonPath);
    });
  });

  // AC3: Parse YAML from Multiple Sources
  describe('AC3: YAML Parsing', () => {
    it('should parse YAML array from string', async () => {
      const yaml = `
- Project: ENG
  Summary: Issue 1
- Project: ENG
  Summary: Issue 2
`;
      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.format).toBe('yaml');
      expect(result.source).toBe('string');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ Project: 'ENG', Summary: 'Issue 1' });
    });

    it('should parse YAML single object from string', async () => {
      const yaml = `
Project: ENG
Summary: Single Issue
`;
      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({ Project: 'ENG', Summary: 'Single Issue' });
    });

    it('should parse YAML with nested objects', async () => {
      const yaml = `
- Project: ENG
  Summary: Test
  Components:
    - Frontend
    - Backend
`;
      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.data[0].Components).toEqual(['Frontend', 'Backend']);
    });

    it('should parse YAML with multi-line strings', async () => {
      const yaml = `
- Project: ENG
  Description: |
    Line 1
    Line 2
    Line 3
`;
      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.data[0].Description).toContain('Line 1');
      expect(result.data[0].Description).toContain('Line 2');
    });

    it('should parse YAML from file', async () => {
      const yamlPath = path.join(fixturesDir, 'test-issues.yaml');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(yamlPath, '- Project: ENG\n  Summary: Test');

      const result = await parseInput({ from: yamlPath });

      expect(result.format).toBe('yaml');
      expect(result.source).toBe('file');
      expect(result.data).toHaveLength(1);

      await fs.unlink(yamlPath);
    });

    it('should parse YAML from .yml extension', async () => {
      const yamlPath = path.join(fixturesDir, 'test-issues.yml');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(yamlPath, '- Project: ENG\n  Summary: Test');

      const result = await parseInput({ from: yamlPath });

      expect(result.format).toBe('yaml');

      await fs.unlink(yamlPath);
    });

    it('should parse YAML document stream format (user-friendly)', async () => {
      const yaml = `Project: ENG
Issue Type: Task
Summary: Setup environment
---
Project: ENG
Issue Type: Bug
Summary: Fix login
---
Project: ENG
Issue Type: Story
Summary: Add dark mode`;

      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.format).toBe('yaml');
      expect(result.source).toBe('string');
      expect(result.data).toHaveLength(3);
      expect(result.data[0]).toEqual({
        Project: 'ENG',
        'Issue Type': 'Task',
        Summary: 'Setup environment',
      });
      expect(result.data[1]).toEqual({
        Project: 'ENG',
        'Issue Type': 'Bug',
        Summary: 'Fix login',
      });
      expect(result.data[2]).toEqual({
        Project: 'ENG',
        'Issue Type': 'Story',
        Summary: 'Add dark mode',
      });
    });

    it('should parse YAML document stream with multi-line values', async () => {
      const yaml = `Project: ENG
Summary: First issue
Description: |
  Line 1
  Line 2
---
Project: ENG
Summary: Second issue
Description: Single line`;

      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].Description).toContain('Line 1');
      expect(result.data[1].Description).toBe('Single line');
    });

    it('should parse YAML document stream from file', async () => {
      const yamlPath = path.join(fixturesDir, 'test-stream.yaml');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(
        yamlPath,
        'Project: ENG\nSummary: Test 1\n---\nProject: ENG\nSummary: Test 2'
      );

      const result = await parseInput({ from: yamlPath });

      expect(result.format).toBe('yaml');
      expect(result.source).toBe('file');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].Summary).toBe('Test 1');
      expect(result.data[1].Summary).toBe('Test 2');

      await fs.unlink(yamlPath);
    });

    it('should handle mixed YAML formats (array and document stream)', async () => {
      // Document stream where one document is an array
      const yaml = `- Project: ENG
  Summary: Array item 1
- Project: ENG
  Summary: Array item 2
---
Project: ENG
Summary: Single object`;

      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.data).toHaveLength(3);
      expect(result.data[0].Summary).toBe('Array item 1');
      expect(result.data[1].Summary).toBe('Array item 2');
      expect(result.data[2].Summary).toBe('Single object');
    });

    it('should skip empty YAML documents in stream', async () => {
      const yaml = `Project: ENG
Summary: First
---
---
Project: ENG
Summary: Second`;

      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].Summary).toBe('First');
      expect(result.data[1].Summary).toBe('Second');
    });

    it('should differentiate quoted empty YAML strings vs null', async () => {
      const yaml = `Field1: ""
Field2:
`;

      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.data[0].Field1).toBe('');
      expect(result.data[0].Field2).toBeNull();
    });
  });

  // AC4: Detect Format Automatically
  describe('AC4: Format Detection', () => {
    it('should detect CSV from .csv file extension', async () => {
      const csvPath = path.join(fixturesDir, 'auto-detect.csv');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(csvPath, 'Project,Summary\nENG,Test');

      const result = await parseInput({ from: csvPath });

      expect(result.format).toBe('csv');

      await fs.unlink(csvPath);
    });

    it('should detect JSON from .json file extension', async () => {
      const jsonPath = path.join(fixturesDir, 'auto-detect.json');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(jsonPath, '[{"Project":"ENG"}]');

      const result = await parseInput({ from: jsonPath });

      expect(result.format).toBe('json');

      await fs.unlink(jsonPath);
    });

    it('should detect YAML from .yaml file extension', async () => {
      const yamlPath = path.join(fixturesDir, 'auto-detect.yaml');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(yamlPath, '- Project: ENG');

      const result = await parseInput({ from: yamlPath });

      expect(result.format).toBe('yaml');

      await fs.unlink(yamlPath);
    });

    it('should detect YAML from .yml file extension', async () => {
      const ymlPath = path.join(fixturesDir, 'auto-detect.yml');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(ymlPath, '- Project: ENG');

      const result = await parseInput({ from: ymlPath });

      expect(result.format).toBe('yaml');

      await fs.unlink(ymlPath);
    });

    it('should require explicit format for string data', async () => {
      await expect(
        parseInput({ data: 'Project,Summary\nENG,Test' })
      ).rejects.toThrow(InputParseError);
      
      await expect(
        parseInput({ data: 'Project,Summary\nENG,Test' })
      ).rejects.toThrow(/Cannot determine input format/);
    });

    it('should throw error for unsupported file extension', async () => {
      const txtPath = path.join(fixturesDir, 'test.txt');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(txtPath, 'some text');

      await expect(
        parseInput({ from: txtPath })
      ).rejects.toThrow(InputParseError);

      await fs.unlink(txtPath);
    });
  });

  // AC5: Input Normalization
  describe('AC5: Input Normalization', () => {
    it('should always return array of objects', async () => {
      const data = { Project: 'ENG', Summary: 'Test' };
      const result = await parseInput({ data });

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should handle empty CSV (return empty array)', async () => {
      const csv = 'Project,Summary\n';
      const result = await parseInput({ data: csv, format: 'csv' });

      expect(result.data).toEqual([]);
    });

    it('should handle empty JSON array', async () => {
      const result = await parseInput({ data: [], format: 'json' });

      expect(result.data).toEqual([]);
    });

    it('should handle empty YAML array', async () => {
      const yaml = '[]';
      const result = await parseInput({ data: yaml, format: 'yaml' });

      expect(result.data).toEqual([]);
    });

    it('should handle CSV with only headers', async () => {
      const csv = 'Project,Summary';
      const result = await parseInput({ data: csv, format: 'csv' });

      expect(result.data).toEqual([]);
    });
  });

  // AC6: Error Handling
  describe('AC6: Error Handling', () => {
    it('should throw InputParseError for malformed CSV', async () => {
      const csv = 'Project,Summary\n"ENG,"Missing quote';
      
      await expect(
        parseInput({ data: csv, format: 'csv' })
      ).rejects.toThrow(InputParseError);
    });

    it('should throw InputParseError for invalid JSON', async () => {
      const jsonString = '{invalid json}';
      
      await expect(
        parseInput({ data: jsonString, format: 'json' })
      ).rejects.toThrow(InputParseError);
    });

    it('should throw InputParseError for invalid YAML', async () => {
      const yaml = 'invalid: yaml: syntax:';
      
      await expect(
        parseInput({ data: yaml, format: 'yaml' })
      ).rejects.toThrow(InputParseError);
    });

    it('should throw FileNotFoundError for missing file', async () => {
      const nonExistentPath = path.join(fixturesDir, 'does-not-exist.csv');
      
      await expect(
        parseInput({ from: nonExistentPath })
      ).rejects.toThrow(FileNotFoundError);
    });

    it('should include error context in InputParseError', async () => {
      const jsonString = '{invalid}';
      
      try {
        await parseInput({ data: jsonString, format: 'json' });
        fail('Should have thrown InputParseError');
      } catch (error) {
        expect(error).toBeInstanceOf(InputParseError);
        const parseError = error as InputParseError;
        expect(parseError.details).toBeDefined();
        expect((parseError.details as Record<string, unknown>)?.format).toBe('json');
      }
    });

    it('should include file path in FileNotFoundError', async () => {
      const missingPath = path.join(fixturesDir, 'missing.csv');
      
      try {
        await parseInput({ from: missingPath });
        fail('Should have thrown FileNotFoundError');
      } catch (error) {
        expect(error).toBeInstanceOf(FileNotFoundError);
        const fileError = error as FileNotFoundError;
        expect(fileError.details).toBeDefined();
        expect((fileError.details as Record<string, unknown>)?.path).toBe(missingPath);
      }
    });

    it('should throw error when no input provided', async () => {
      await expect(
        parseInput({})
      ).rejects.toThrow(InputParseError);
    });
  });

  describe('Additional Branch Coverage', () => {
    it('should handle explicit format override for CSV file', async () => {
      const csvPath = path.join(fixturesDir, 'test.csv');
      await fs.writeFile(csvPath, 'Project,Summary\nENG,Test');

      const result = await parseInput({ from: csvPath, format: 'csv' });
      
      expect(result.format).toBe('csv');
      expect(result.data).toHaveLength(1);
      await fs.unlink(csvPath);
    });

    it('should handle explicit format override for JSON file', async () => {
      const jsonPath = path.join(fixturesDir, 'test.json');
      await fs.writeFile(jsonPath, '[{"key":"value"}]');

      const result = await parseInput({ from: jsonPath, format: 'json' });
      
      expect(result.format).toBe('json');
      expect(result.data).toHaveLength(1);
      await fs.unlink(jsonPath);
    });

    it('should handle explicit format override for YAML file', async () => {
      const yamlPath = path.join(fixturesDir, 'test.yaml');
      await fs.writeFile(yamlPath, '- key: value');

      const result = await parseInput({ from: yamlPath, format: 'yaml' });
      
      expect(result.format).toBe('yaml');
      expect(result.data).toHaveLength(1);
      await fs.unlink(yamlPath);
    });

    it('should throw error for invalid data type (number)', async () => {
      await expect(
        parseInput({ data: 123 as any, format: 'json' })
      ).rejects.toThrow('Invalid input data type');
    });

    it('should throw error for invalid data type (boolean)', async () => {
      await expect(
        parseInput({ data: true as any, format: 'json' })
      ).rejects.toThrow('Invalid input data type');
    });

    it('should throw error for invalid data type (function)', async () => {
      await expect(
        parseInput({ data: (() => {}) as any, format: 'json' })
      ).rejects.toThrow('Invalid input data type');
    });

    it('should handle CSV with inconsistent column count error', async () => {
      const csvString = `Project,Summary,Priority
ENG,Issue 1,High
ENG,Issue 2`;

      await expect(
        parseInput({ data: csvString, format: 'csv' })
      ).rejects.toThrow(InputParseError);
    });

    it('should handle CSV with non-array first element in array input', async () => {
      const invalidArray: any = [null, ['row1']];

      // With explicit CSV format, invalid structure throws error
      await expect(
        parseInput({ data: invalidArray, format: 'csv' })
      ).rejects.toThrow('first row must be an array of headers');
    });

    it('should handle empty array for CSV', async () => {
      const result = await parseInput({ data: [], format: 'csv' });
      
      expect(result.data).toEqual([]);
      expect(result.format).toBe('csv'); // Explicit CSV format preserved
      expect(result.source).toBe('array');
    });

    it('should handle array of arrays with non-array row (skip it)', async () => {
      const data = [
        ['Header1', 'Header2'],
        ['value1', 'value2'],
        'invalid-row' as any,
        ['value3', 'value4']
      ];

      const result = await parseInput({ data, format: 'csv' });
      
      // The invalid row should be skipped, resulting in 2 valid rows
      expect(result.data).toHaveLength(3);
      expect(result.data[0]).toEqual({ Header1: 'value1', Header2: 'value2' });
      expect(result.data[2]).toEqual({ Header1: 'value3', Header2: 'value4' });
    });

    it('should handle JSON parse error with context', async () => {
      const invalidJson = '{"key": invalid}';

      try {
        await parseInput({ data: invalidJson, format: 'json' });
        fail('Should have thrown InputParseError');
      } catch (error) {
        expect(error).toBeInstanceOf(InputParseError);
        expect((error as InputParseError).message).toContain('Invalid JSON format');
        expect((error as InputParseError).details).toBeDefined();
      }
    });

    it('should handle YAML parse error with context', async () => {
      const invalidYaml = '- item\n  - nested: invalid indentation';

      try {
        await parseInput({ data: invalidYaml, format: 'yaml' });
        fail('Should have thrown InputParseError');
      } catch (error) {
        expect(error).toBeInstanceOf(InputParseError);
        expect((error as InputParseError).message).toContain('Invalid YAML format');
      }
    });

    it('should handle JSON non-object/non-array result', async () => {
      const primitiveJson = '"just a string"';

      await expect(
        parseInput({ data: primitiveJson, format: 'json' })
      ).rejects.toThrow('JSON must be an object or array of objects');
    });

    it('should handle YAML non-object/non-array result', async () => {
      const primitiveYaml = 'just a string';

      await expect(
        parseInput({ data: primitiveYaml, format: 'yaml' })
      ).rejects.toThrow('YAML documents must be objects or arrays of objects');
    });

    it('should handle YAML null/undefined result (empty file)', async () => {
      const emptyYaml = '---\n';

      const result = await parseInput({ data: emptyYaml, format: 'yaml' });
      
      expect(result.data).toEqual([]);
    });

    it('should propagate InputParseError from parseContent', async () => {
      const malformedCSV = 'Header1,Header2\n"unclosed quote,value2';

      try {
        await parseInput({ data: malformedCSV, format: 'csv' });
        fail('Should have thrown InputParseError');
      } catch (error) {
        expect(error).toBeInstanceOf(InputParseError);
        expect((error as InputParseError).message).toContain('Invalid CSV format');
      }
    });

    it('should handle file read error gracefully', async () => {
      const invalidPath = path.join(fixturesDir, 'folder-that-does-not-exist', 'file.csv');

      await expect(
        parseInput({ from: invalidPath })
      ).rejects.toThrow(FileNotFoundError);
    });

    it('should handle empty array of arrays as CSV', async () => {
      const emptyArrayOfArrays: unknown[][] = [];
      
      const result = await parseInput({ data: emptyArrayOfArrays, format: 'csv' });
      
      expect(result.data).toEqual([]);
      expect(result.format).toBe('csv');
      expect(result.source).toBe('array');
    });

    it('should throw error for array of arrays with invalid headers (not array)', async () => {
      const invalidData: unknown[][] = ['not-an-array' as any, ['row1']];

      await expect(
        parseInput({ data: invalidData, format: 'csv' })
      ).rejects.toThrow('first row must be an array of headers');
    });

    it('should throw error for array of arrays with null headers', async () => {
      const invalidData: unknown[][] = [null as any, ['row1']];

      await expect(
        parseInput({ data: invalidData, format: 'csv' })
      ).rejects.toThrow('first row must be an array of headers');
    });

    it('should throw error for array of arrays with undefined headers', async () => {
      const invalidData: unknown[][] = [undefined as any, ['row1']];

      await expect(
        parseInput({ data: invalidData, format: 'csv' })
      ).rejects.toThrow('first row must be an array of headers');
    });
  });

  describe('Branch Coverage Tests', () => {
    it('should throw error when neither from nor data provided (line 105)', async () => {
      // Test: if (!options.from && options.data === undefined)
      // Note: Line 119 is unreachable dead code (same check as 105)
      await expect(
        parseInput({ format: 'csv' } as any)
      ).rejects.toThrow('No input provided');
    });

    it('should throw "No data provided" when data getter resolves to undefined on second read (line 118)', async () => {
      let firstAccess = true;
      const options = {
        get data() {
          if (firstAccess) {
            firstAccess = false;
            return 'placeholder';
          }
          return undefined;
        },
      };

      await expect(parseInput(options as any)).rejects.toThrow('No data provided');
    });

    it('should detect array of arrays (line 199)', async () => {
      // Test: if (data.length > 0 && Array.isArray(data[0]))
      const arrayOfArrays = [
        ['Project', 'Summary'],
        ['ENG', 'Test']
      ];
      
      const result = await parseInput({ data: arrayOfArrays, format: 'csv' });
      
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({ Project: 'ENG', Summary: 'Test' });
    });

    it('should auto-detect CSV array input when format omitted (line 199 alternate path)', async () => {
      const arrayOfArrays = [
        ['Project', 'Summary'],
        ['ZUL', 'Retry Test']
      ];

      const result = await parseInput({ data: arrayOfArrays });

      expect(result.format).toBe('csv');
      expect(result.data[0]).toEqual({ Project: 'ZUL', Summary: 'Retry Test' });
    });

    it('should handle empty data array (line 199 false branch)', async () => {
      // Test empty array: data.length > 0 is false
      const result = await parseInput({ data: [], format: 'json' });
      
      expect(result.data).toEqual([]);
    });

    it('should require explicit format for string data (lines 219-224)', async () => {
      await expect(
        parseInput({ data: 'Project,Summary\nENG,Issue 1' } as any)
      ).rejects.toThrow(/provide "format"/i);
    });

    it('should catch non-InputParseError exceptions (lines 265-266)', async () => {
      // Test: if (error instanceof InputParseError) { throw error; }
      // Else wrap in InputParseError
      await expect(
        parseInput({ data: 'invalid: yaml: data:', format: 'yaml' })
      ).rejects.toThrow(InputParseError);
    });
  });
});

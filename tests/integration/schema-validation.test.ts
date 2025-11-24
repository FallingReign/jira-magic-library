/**
 * Integration tests for Schema Validation Service
 * 
 * Story: E4-S07 - Schema-Only Validation Method
 * 
 * Tests validation against real JIRA schema:
 * - CSV input validation
 * - JSON input validation
 * - Performance benchmarks
 */

import { JML } from '../../src.js';
import { loadConfig } from '../../src/config/loader.js';
import { writeFile, unlink } from 'fs/promises';
import * as path from 'path';

describe('Integration: Schema Validation', () => {
  let jml: JML;
  const testProjectKey = process.env.JIRA_PROJECT_KEY || 'TEST';

  beforeAll(() => {
    if (!process.env.JIRA_BASE_URL) {
      console.warn('⚠️  Skipping integration tests (JIRA not configured)');
      return;
    }
    const config = loadConfig();
    jml = new JML(config);
  });

  describe('CSV Input Validation', () => {
    const csvFilePath = path.join(__dirname, '../fixtures/validation-test.csv');

    afterEach(async () => {
      try {
        await unlink(csvFilePath);
      } catch {
        // File may not exist
      }
    });

    it('should validate valid CSV input', async () => {
      if (!jml) return;

      const csvContent = `Project,Issue Type,Summary
${testProjectKey},Task,Test issue 1
${testProjectKey},Task,Test issue 2`;

      await writeFile(csvFilePath, csvContent);

      const result = await jml.validate({ from: csvFilePath });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields in CSV', async () => {
      if (!jml) return;

      const csvContent = `Project,Issue Type
${testProjectKey},Task
${testProjectKey},Task`;

      await writeFile(csvFilePath, csvContent);

      const result = await jml.validate({ from: csvFilePath });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD_MISSING');
      expect(result.errors[0].field).toBe('Summary');
    });

    it('should validate 100 rows in <100ms', async () => {
      if (!jml) return;

      // Generate CSV with 100 rows
      const rows = [`Project,Issue Type,Summary`];
      for (let i = 1; i <= 100; i++) {
        rows.push(`${testProjectKey},Task,Test issue ${i}`);
      }

      await writeFile(csvFilePath, rows.join('\n'));

      const startTime = Date.now();
      const result = await jml.validate({ from: csvFilePath });
      const duration = Date.now() - startTime;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('JSON Input Validation', () => {
    it('should validate valid JSON array input', async () => {
      if (!jml) return;

      const result = await jml.validate({
        data: [
          { Project: testProjectKey, 'Issue Type': 'Task', Summary: 'Test 1' },
          { Project: testProjectKey, 'Issue Type': 'Task', Summary: 'Test 2' }
        ]
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate valid JSON single object input', async () => {
      if (!jml) return;

      const result = await jml.validate({
        data: { Project: testProjectKey, 'Issue Type': 'Task', Summary: 'Test' }
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect type mismatches', async () => {
      if (!jml) return;

      const result = await jml.validate({
        data: [{
          Project: testProjectKey,
          'Issue Type': 'Task',
          Summary: 'Test',
          Labels: 'not-an-array'  // Should be array
        }]
      });

      expect(result.valid).toBe(false);
      const typeError = result.errors.find(e => e.code === 'INVALID_TYPE');
      expect(typeError).toBeDefined();
      expect(typeError?.field).toBe('Labels');
    });
  });

  describe('Error Reporting', () => {
    it('should report multiple errors for single row', async () => {
      if (!jml) return;

      const result = await jml.validate({
        data: [{
          Project: testProjectKey,
          'Issue Type': 'Task'
          // Missing Summary (required)
        }]
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rowIndex).toBe(0);
    });

    it('should group errors by row', async () => {
      if (!jml) return;

      const result = await jml.validate({
        data: [
          { Project: testProjectKey, 'Issue Type': 'Task' },  // Row 0 - missing Summary
          { Project: testProjectKey, 'Issue Type': 'Task', Summary: 'Valid' },  // Row 1 - valid
          { Project: testProjectKey, 'Issue Type': 'Task', Labels: 'invalid' }  // Row 2 - missing Summary, invalid Labels
        ]
      });

      expect(result.valid).toBe(false);

      const row0Errors = result.errors.filter(e => e.rowIndex === 0);
      const row1Errors = result.errors.filter(e => e.rowIndex === 1);
      const row2Errors = result.errors.filter(e => e.rowIndex === 2);

      expect(row0Errors.length).toBeGreaterThan(0);
      expect(row1Errors.length).toBe(0);
      expect(row2Errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should validate 100 rows with no errors in <100ms', async () => {
      if (!jml) return;

      const rows = Array.from({ length: 100 }, (_, i) => ({
        Project: testProjectKey,
        'Issue Type': 'Task',
        Summary: `Test issue ${i + 1}`
      }));

      const startTime = Date.now();
      const result = await jml.validate({ data: rows });
      const duration = Date.now() - startTime;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    it('should validate 100 rows with errors in <100ms', async () => {
      if (!jml) return;

      // Create rows with validation errors
      const rows = Array.from({ length: 100 }, () => ({
        Project: testProjectKey,
        'Issue Type': 'Task'
        // Missing Summary to trigger validation errors
      }));

      const startTime = Date.now();
      const result = await jml.validate({ data: rows });
      const duration = Date.now() - startTime;

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(100); // One error per row
      expect(duration).toBeLessThan(100);
    });
  });
});

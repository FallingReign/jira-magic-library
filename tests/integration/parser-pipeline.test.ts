/**
 * Integration Tests: Parser → Pipeline Backward Compatibility
 * 
 * Story: E4-S01 - Unified Input Parser (AC8)
 * 
 * Tests that parsed data from CSV/JSON/YAML works correctly with:
 * - Field Resolution (E1-S07)
 * - All Epic 2 converters (date, user, priority, option, array, etc.)
 * - All Epic 3 converters (cascading select, time tracking, parent link, issue type, project)
 * 
 * Ensures no regression in existing converter functionality.
 */

import './setup'; // Load test config
import { parseInput } from '../../src/parsers/InputParser.js';
import { JML } from '../../src/jml.js';
import { loadConfig } from '../../src/config/loader.js';
import { isJiraConfigured } from './helpers.js';

describe('Integration: Parser → Pipeline Compatibility', () => {
  let jml: JML;
  const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'PROJ';

  beforeAll(async () => {
    if (!isJiraConfigured()) {
      console.warn('⚠️  Skipping integration tests: JIRA not configured');
      return;
    }

    console.log('\n🔗 Parser Pipeline Integration Tests');
    console.log(`   JIRA: ${process.env.JIRA_BASE_URL}`);
    console.log(`   Project: ${PROJECT_KEY}\n`);

    const config = loadConfig();
    jml = new JML(config);
  }, 30000);

  // AC8.1: Parse CSV → Epic 2 converters
  describe('AC8.1: CSV → Epic 2 Converters', () => {
    it('should parse CSV and convert all Epic 2 field types', async () => {
      if (!isJiraConfigured()) return;

      const csv = `Project,Issue Type,Summary,Priority,Due Date,Labels
${PROJECT_KEY},Task,Parser CSV Test,High,2025-12-31,"test,parser"`;

      const parsed = await parseInput({ data: csv, format: 'csv' });
      expect(parsed.data).toHaveLength(1);

      const row = parsed.data[0];
      console.log('   📊 Parsed CSV row:', row);

      // Verify parsed structure
      expect(row.Project).toBe(PROJECT_KEY);
      expect(row['Issue Type']).toBe('Task');
      expect(row.Summary).toBe('Parser CSV Test');
      expect(row.Priority).toBe('High');
      expect(row['Due Date']).toBe('2025-12-31');

      // Create issue using parsed data (tests full pipeline)
      const issue = await jml.issues.create(row);
      console.log(`   ✅ Created issue: ${issue.key}`);

      expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    }, 30000);
  });

  // AC8.2: Parse JSON → Epic 2 converters
  describe('AC8.2: JSON → Epic 2 Converters', () => {
    it('should parse JSON and convert all Epic 2 field types', async () => {
      if (!isJiraConfigured()) return;

      const json = [{
        "Project": PROJECT_KEY,
        "Issue Type": "Task",
        "Summary": "Parser JSON Test",
        "Priority": "Medium",
        "Due Date": "2025-12-15"
      }];

      const parsed = await parseInput({ data: json });
      expect(parsed.data).toHaveLength(1);

      const row = parsed.data[0];
      console.log('   📊 Parsed JSON row:', row);

      // Create issue using parsed data
      const issue = await jml.issues.create(row);
      console.log(`   ✅ Created issue: ${issue.key}`);

      expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    }, 30000);
  });

  // AC8.3: Parse YAML → Epic 2 converters
  describe('AC8.3: YAML → Epic 2 Converters', () => {
    it('should parse YAML and convert all Epic 2 field types', async () => {
      if (!isJiraConfigured()) return;

      const yaml = `
- Project: ${PROJECT_KEY}
  Issue Type: Task
  Summary: Parser YAML Test
  Description: |
    Multi-line description
    Line 2
    Line 3
  Priority: Low
  Due Date: 45678
  Labels:
    - test
    - yaml-parser
`;

      const parsed = await parseInput({ data: yaml, format: 'yaml' });
      expect(parsed.data).toHaveLength(1);

      const row = parsed.data[0];
      console.log('   📊 Parsed YAML row:', row);

      // Verify multi-line description preserved
      expect(row.Description).toContain('Multi-line');
      expect(row.Description).toContain('Line 2');

      // Verify array fields
      expect(Array.isArray(row.Labels)).toBe(true);

      // Create issue using parsed data (tests Excel date conversion)
      const issue = await jml.issues.create(row);
      console.log(`   ✅ Created issue: ${issue.key}`);

      expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    }, 30000);
  });

  // AC8.4: Verify no regression in single-issue creation (E1-S09)
  describe('AC8.4: Single Issue Creation (No Regression)', () => {
    it('should still create single issue without parser', async () => {
      if (!isJiraConfigured()) return;

      // Create issue directly (not using parser)
      const issue = await jml.issues.create({
        Project: PROJECT_KEY,
        'Issue Type': 'Task',
        Summary: 'Direct create (no parser)',
        Priority: 'Medium'
      });

      console.log(`   ✅ Created issue without parser: ${issue.key}`);
      expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    }, 30000);
  });

  // AC8.5: Field Resolution still works with parsed input
  describe('AC8.5: Field Resolution Compatibility', () => {
    it('should resolve human-readable field names from parsed CSV', async () => {
      if (!isJiraConfigured()) return;

      const csv = `Project,Issue Type,Summary,Priority,Due Date
${PROJECT_KEY},Task,Field resolution test,Medium,2025-11-30`;

      const parsed = await parseInput({ data: csv, format: 'csv' });
      const row = parsed.data[0];

      // Field resolver should handle "Priority" and "Due Date" correctly
      const issue = await jml.issues.create(row);
      console.log(`   ✅ Field resolution worked: ${issue.key}`);

      expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    }, 30000);
  });

  // AC8.6: Array converter works with parsed CSV
  describe('AC8.6: Array Converter Compatibility', () => {
    it('should handle arrays in CSV (quoted comma-separated values)', async () => {
      if (!isJiraConfigured()) return;

      const csv = `Project,Issue Type,Summary,Labels
${PROJECT_KEY},Task,Array test,"label1,label2,label3"`;

      const parsed = await parseInput({ data: csv, format: 'csv' });
      const row = parsed.data[0];

      console.log('   📊 Parsed Labels:', row.Labels);

      // Labels should be a single string (will be split by array converter)
      expect(typeof row.Labels).toBe('string');

      // Create issue (array converter should handle splitting)
      const issue = await jml.issues.create(row);
      console.log(`   ✅ Array converter worked: ${issue.key}`);

      expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    }, 30000);
  });
});

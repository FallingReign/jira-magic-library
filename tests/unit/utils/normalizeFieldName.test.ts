import { normalizeFieldName } from '../../../src/utils/normalizeFieldName.js';

describe('normalizeFieldName', () => {
  describe('basic normalization', () => {
    it('should convert to lowercase', () => {
      expect(normalizeFieldName('Summary')).toBe('summary');
      expect(normalizeFieldName('SUMMARY')).toBe('summary');
      expect(normalizeFieldName('SuMmArY')).toBe('summary');
    });

    it('should remove spaces', () => {
      expect(normalizeFieldName('Issue Type')).toBe('issuetype');
      expect(normalizeFieldName('Story Points')).toBe('storypoints');
      expect(normalizeFieldName('Fix Version')).toBe('fixversion');
    });

    it('should remove underscores', () => {
      expect(normalizeFieldName('issue_type')).toBe('issuetype');
      expect(normalizeFieldName('story_points')).toBe('storypoints');
      expect(normalizeFieldName('fix_version')).toBe('fixversion');
    });

    it('should remove hyphens', () => {
      expect(normalizeFieldName('issue-type')).toBe('issuetype');
      expect(normalizeFieldName('story-points')).toBe('storypoints');
      expect(normalizeFieldName('fix-version')).toBe('fixversion');
    });

    it('should remove forward slashes', () => {
      expect(normalizeFieldName('fix version/s')).toBe('fixversions');
      expect(normalizeFieldName('component/s')).toBe('components');
    });
  });

  describe('JIRA system fields', () => {
    it('should normalize common field variations to JIRA field IDs', () => {
      // These should all normalize to their JIRA system field IDs
      expect(normalizeFieldName('Issue Type')).toBe('issuetype');
      expect(normalizeFieldName('issue type')).toBe('issuetype');
      expect(normalizeFieldName('Issue_Type')).toBe('issuetype');
      expect(normalizeFieldName('issue-type')).toBe('issuetype');
      expect(normalizeFieldName('ISSUE TYPE')).toBe('issuetype');
      
      expect(normalizeFieldName('Project')).toBe('project');
      expect(normalizeFieldName('PROJECT')).toBe('project');
      
      expect(normalizeFieldName('Summary')).toBe('summary');
      expect(normalizeFieldName('SUMMARY')).toBe('summary');
      
      expect(normalizeFieldName('Description')).toBe('description');
      expect(normalizeFieldName('DESCRIPTION')).toBe('description');
      
      expect(normalizeFieldName('Assignee')).toBe('assignee');
      expect(normalizeFieldName('Reporter')).toBe('reporter');
      expect(normalizeFieldName('Priority')).toBe('priority');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(normalizeFieldName('')).toBe('');
    });

    it('should handle string with only separators', () => {
      expect(normalizeFieldName('   ')).toBe('');
      expect(normalizeFieldName('___')).toBe('');
      expect(normalizeFieldName('---')).toBe('');
      expect(normalizeFieldName('///')).toBe('');
    });

    it('should handle mixed separators', () => {
      expect(normalizeFieldName('Story-Points / Estimate')).toBe('storypointsestimate');
      expect(normalizeFieldName('Fix_Version/s')).toBe('fixversions');
    });

    it('should preserve numbers', () => {
      expect(normalizeFieldName('Sprint 1')).toBe('sprint1');
      expect(normalizeFieldName('customfield_10024')).toBe('customfield10024');
    });
  });
});

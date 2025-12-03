/**
 * Normalize Field Name Utility
 * 
 * Normalizes field names for case-insensitive, fuzzy matching.
 * Removes spaces, hyphens, underscores, slashes and converts to lowercase.
 * 
 * This produces strings that match JIRA system field IDs:
 * - "Issue Type" → "issuetype"
 * - "Project" → "project"
 * - "Fix Version/s" → "fixversions"
 * 
 * @param name - Field name to normalize
 * @returns Normalized field name
 * 
 * @example
 * ```typescript
 * normalizeFieldName('Issue Type')   // 'issuetype'
 * normalizeFieldName('Story_Points') // 'storypoints'
 * normalizeFieldName('SUMMARY')      // 'summary'
 * normalizeFieldName('Fix Version/s') // 'fixversions'
 * ```
 */
export function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-/]/g, '');
}

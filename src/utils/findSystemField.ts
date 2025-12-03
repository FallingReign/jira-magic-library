/**
 * Find System Field Utility
 * 
 * Dynamically finds a JIRA system field in user input without hardcoded field name lists.
 * Uses normalization to match user input keys against JIRA system field IDs.
 * 
 * How it works:
 * 1. Normalizes all input keys (e.g., "Issue Type" → "issuetype")
 * 2. Matches against the requested system field ID
 * 3. Extracts the value using extractFieldValue utility
 * 
 * Special mappings:
 * - "type" → matches "issuetype" (common shorthand)
 * 
 * @example
 * ```typescript
 * // Find project field
 * const result = findSystemField({ Project: 'ENG' }, 'project');
 * // { key: 'Project', value: 'ENG', extracted: 'ENG' }
 * 
 * // Find issue type with various input formats
 * findSystemField({ 'Issue Type': 'Bug' }, 'issuetype');
 * // { key: 'Issue Type', value: 'Bug', extracted: 'Bug' }
 * 
 * findSystemField({ type: { name: 'Bug' } }, 'issuetype');
 * // { key: 'type', value: { name: 'Bug' }, extracted: 'Bug' }
 * 
 * // Not found
 * findSystemField({ Summary: 'Test' }, 'project');
 * // undefined
 * ```
 */

import { normalizeFieldName } from './normalizeFieldName.js';
import { extractFieldValue } from './extractFieldValue.js';

/**
 * Result from findSystemField
 */
export interface SystemFieldResult {
  /** Original key as it appears in input */
  key: string;
  /** Raw value from input */
  value: unknown;
  /** Extracted value (string) after processing { key }, { name }, { value } wrappers */
  extracted: string | null;
}

/**
 * Mapping of shorthand field names to their canonical JIRA system field IDs.
 * Only used for common abbreviations that differ from the normalized form.
 */
const FIELD_ALIASES: Record<string, string> = {
  type: 'issuetype', // "type" is common shorthand for "issuetype"
};

/**
 * Finds a JIRA system field in user input using dynamic normalization.
 * 
 * @param input - User input object (e.g., from CSV, JSON, YAML)
 * @param systemFieldId - JIRA system field ID to find (e.g., 'project', 'issuetype')
 * @returns SystemFieldResult if found, undefined otherwise
 * 
 * @example
 * ```typescript
 * // Handles any case/format
 * findSystemField({ PROJECT: 'ENG' }, 'project');
 * findSystemField({ 'Issue Type': 'Bug' }, 'issuetype');
 * findSystemField({ issuetype: { name: 'Bug' } }, 'issuetype');
 * ```
 */
export function findSystemField(
  input: Record<string, unknown> | null | undefined,
  systemFieldId: string
): SystemFieldResult | undefined {
  // Guard: empty input
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const targetNormalized = normalizeFieldName(systemFieldId);

  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = normalizeFieldName(key);
    
    // Check direct match
    if (normalizedKey === targetNormalized) {
      return {
        key,
        value,
        extracted: extractToString(value),
      };
    }
    
    // Check alias match (e.g., "type" → "issuetype")
    const aliasTarget = FIELD_ALIASES[normalizedKey];
    if (aliasTarget === targetNormalized) {
      return {
        key,
        value,
        extracted: extractToString(value),
      };
    }
  }

  return undefined;
}

/**
 * Extracts a string value from various input formats.
 * Uses extractFieldValue for object unwrapping, then converts to string.
 * 
 * @param value - Raw value from input
 * @returns Extracted string or null if cannot extract
 */
function extractToString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  // Use extractFieldValue to unwrap { value: x }, { name: x } etc.
  const extracted = extractFieldValue(value);

  // String - use directly
  if (typeof extracted === 'string') {
    const trimmed = extracted.trim();
    return trimmed === '' ? null : trimmed;
  }

  // Object with id - special case for { id: "10000" } format
  // This needs to be preserved as we may need API lookup
  if (typeof extracted === 'object' && extracted !== null) {
    const obj = extracted as Record<string, unknown>;
    
    // Try key first (project), then name (issuetype), then id
    if (typeof obj.key === 'string') return obj.key.trim() || null;
    if (typeof obj.name === 'string') return obj.name.trim() || null;
    if (typeof obj.id === 'string') return obj.id.trim() || null;
    
    // Can't extract - return null (caller should check .value for raw object)
    return null;
  }

  // Number or other primitive - convert to string
  if (typeof extracted === 'number' || typeof extracted === 'boolean') {
    return String(extracted);
  }

  return null;
}

/**
 * Checks if a value represents an ID-based lookup (object with 'id' but not 'key' or 'name').
 * Used to determine if API lookup is needed for project/issuetype resolution.
 * 
 * @param value - Value to check
 * @returns true if this is an ID-only object requiring API lookup
 */
export function isIdOnlyObject(value: unknown): value is { id: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    !('key' in obj) &&
    !('name' in obj)
  );
}

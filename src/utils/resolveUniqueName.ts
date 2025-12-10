/**
 * Resolve unique name from lookup values with fuzzy matching
 * Stories: E2-S05, E3-S16
 * 
 * Resolves a user-provided name to a unique value from allowedValues.
 * Uses fuse.js for intelligent fuzzy matching (handles typos, underscores, dashes).
 * Throws AmbiguityError if multiple matches found.
 * 
 * Fuzzy Matching Features (E3-S16):
 * - Handles special characters: "MS7 2025" matches "PROJ_MS7_2025"
 * - Handles typos: "automaton" matches "Code - Automation"
 * - Exact matches always preferred (fast path)
 * - Threshold 0.3 (balanced: precision vs recall)
 * 
 * @param input - User-provided name (case-insensitive)
 * @param allowedValues - Array of allowed values with id and name
 * @param context - Context with field and fieldName for error messages
 * @returns The unique matching value
 * @throws {ValidationError} if input is invalid or no matches found
 * @throws {AmbiguityError} if multiple matches found
 * 
 * @example
 * ```typescript
 * // Exact match (fast path)
 * resolveUniqueName('High', priorities, { field: 'priority', fieldName: 'Priority' });
 * // → { id: '1', name: 'High' }
 * 
 * // Fuzzy match (underscore normalization)
 * resolveUniqueName('MS7 2025', versions, { field: 'fixVersions', fieldName: 'Fix Version/s' });
 * // → { id: '2', name: 'PROJ_MS7_2025' }
 * 
 * // Fuzzy match (typo tolerance)
 * resolveUniqueName('automaton', components, { field: 'components', fieldName: 'Component/s' });
 * // → { id: '1', name: 'Code - Automation' }
 * ```
 */

import Fuse from 'fuse.js';
import type { FuseResult } from 'fuse.js';
import { AmbiguityError } from '../errors/AmbiguityError.js';
import { ValidationError } from '../errors/ValidationError.js';

/**
 * Sanitizes a string by removing invisible Unicode characters and normalizing variations.
 * 
 * Fixes bugs where invisible characters from Slack/web interfaces (zero-width spaces,
 * non-breaking spaces, etc.) prevent matching against clean JIRA API data.
 * 
 * @param str - String to sanitize
 * @returns Sanitized string
 */
function sanitizeString(str: string): string {
  return str
    .normalize('NFKC')  // Normalize Unicode compatibility forms
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');  // Remove invisible characters
}

export interface LookupValue {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ResolveContext {
  field: string;
  fieldName: string;
}

export function resolveUniqueName(
  input: string,
  allowedValues: LookupValue[],
  context: ResolveContext
): LookupValue {
  // Validate input
  if (input === null || input === undefined) {
    throw new ValidationError(
      `Value is required for field "${context.fieldName}"`,
      { field: context.field, value: input }
    );
  }

  if (typeof input !== 'string') {
    throw new ValidationError(
      `Expected string for field "${context.fieldName}", got ${typeof input}`,
      { field: context.field, value: input, type: typeof input }
    );
  }

  // Sanitize input to remove invisible Unicode characters
  const sanitized = sanitizeString(input);
  const trimmed = sanitized.trim();
  if (trimmed === '') {
    throw new ValidationError(
      `Empty string is not valid for field "${context.fieldName}"`,
      { field: context.field, value: input }
    );
  }

  // Check if allowedValues is empty
  if (!allowedValues || allowedValues.length === 0) {
    throw new ValidationError(
      `Value "${trimmed}" not found for field "${context.fieldName}" (no allowed values)`,
      { field: context.field, value: trimmed }
    );
  }

  // Filter out entries with null/undefined names (can happen in JIRA)
  const validValues = allowedValues.filter((v) => v.name);

  // Normalize input for case-insensitive matching
  const normalizedInput = trimmed.toLowerCase();

  // Step 1: Exact match check (fast path - preserves existing performance)
  // E3-S16: Exact matches should always be preferred
  const exactMatches = validValues.filter(
    (v) => v.name.toLowerCase() === normalizedInput
  );

  if (exactMatches.length === 1) {
    return exactMatches[0]!;
  }

  // Multiple exact matches (edge case: duplicate names in JIRA)
  if (exactMatches.length > 1) {
    throw new AmbiguityError(
      formatAmbiguityMessage(trimmed, exactMatches, context),
      {
        field: context.field,
        input: trimmed,
        candidates: exactMatches,
      }
    );
  }

  // Step 2: Fuzzy search with fuse.js (E3-S16)
  // Handles underscores, dashes, typos, partial matches
  const fuse = new Fuse(validValues, {
    keys: ['name'],
    // Threshold 0.3 = balanced fuzzy matching
    // - 0.0 = exact match only
    // - 0.3 = good tolerance for typos, underscores, dashes (chosen based on testing)
    // - 1.0 = match everything (too loose)
    threshold: 0.3,
    // Match anywhere in string (not just beginning)
    ignoreLocation: true,
    // Require at least 2 characters to match
    minMatchCharLength: 2,
    // Include score for ambiguity detection
    includeScore: true,
  });

  const results = fuse.search(trimmed);

  // No fuzzy matches found
  if (results.length === 0) {
    throw new ValidationError(
      `Value "${trimmed}" not found for field "${context.fieldName}"`,
      { field: context.field, value: trimmed }
    );
  }

  // Single fuzzy match - return it
  if (results.length === 1) {
    return results[0]!.item;
  }

  // Multiple matches - check if scores are very close (ambiguity)
  // E3-S16: Ambiguity detection based on score similarity
  const bestScore = results[0]!.score!;
  const scoreThreshold = 0.1; // Scores within 0.1 are considered ambiguous

  const closeMatches = results.filter(
    (r) => Math.abs(r.score! - bestScore) < scoreThreshold
  );

  // If multiple close matches, it's ambiguous
  if (closeMatches.length > 1) {
    throw new AmbiguityError(
      formatFuzzyAmbiguityMessage(trimmed, closeMatches, context),
      {
        field: context.field,
        input: trimmed,
        candidates: closeMatches.map((r) => r.item),
      }
    );
  }

  // Best match is clear winner - return it
  return results[0]!.item;
}

/**
 * Format ambiguity error message with candidate list
 * For legacy substring matches (still used in fallback scenarios)
 */
function formatAmbiguityMessage(
  input: string,
  candidates: LookupValue[],
  context: ResolveContext
): string {
  const candidateList = candidates
    .map((c) => `  - ${c.name} (id: ${c.id})`)
    .join('\n');

  const firstId = candidates[0]!.id;

  return `Ambiguous value "${input}" for field "${context.fieldName}". Multiple matches found:\n${candidateList}\nPlease specify by ID: { id: '${firstId}' }`;
}

/**
 * Format ambiguity error message for fuzzy matches with scores (E3-S16)
 * Shows match quality scores to help users understand why matches are ambiguous
 */
function formatFuzzyAmbiguityMessage(
  input: string,
  candidates: FuseResult<LookupValue>[],
  context: ResolveContext
): string {
  const candidateList = candidates
    .map((r, i) => `  ${i + 1}. ${r.item.name} (id: ${r.item.id}, score: ${r.score?.toFixed(3)})`)
    .join('\n');

  const firstId = candidates[0]!.item.id;

  return `Ambiguous value "${input}" for field "${context.fieldName}". Multiple close matches:\n${candidateList}\nPlease specify by ID: { id: '${firstId}' } or use more specific name.`;
}

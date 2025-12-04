/**
 * Version Type Converter
 * Story: E2-S11
 * 
 * Converts version values for fields with items: "version" (used by array converter)
 * 
 * Accepts:
 * - String name: "v1.0", "v2.0", "Sprint 1" (case-insensitive)
 * - Object with id: { id: "10200" } (passthrough)
 * - Object with name: { name: "v1.0" } (JIRA API format - extracts and resolves)
 * - null/undefined for optional fields
 * 
 * Returns: { id: string }
 * 
 * Features:
 * - Case-insensitive name matching
 * - Ambiguity detection (multiple matches)
 * - Lookup caching (reduces API calls)
 * - Graceful cache degradation
 * - Project-level lookup (versions are not issue-type specific)
 * - JIRA API format support ({ name: "..." })
 * 
 * Note: This converter handles a SINGLE version value.
 * The array converter (E2-S04) handles iteration for multiple versions.
 * 
 * @example
 * ```typescript
 * // By name
 * convertVersionType("v1.0", fieldSchema, context)
 * // → { id: "10200" }
 * 
 * // By ID (passthrough)
 * convertVersionType({ id: "10200" }, fieldSchema, context)
 * // → { id: "10200" }
 * 
 * // JIRA API format (extracts and resolves)
 * convertVersionType({ name: "v1.0" }, fieldSchema, context)
 * // → { id: "10200" }
 * 
 * // Case-insensitive
 * convertVersionType("V1.0", fieldSchema, context)
 * // → { id: "10200" }
 * ```
 */

import type { FieldConverter } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { resolveUniqueName, type LookupValue } from '../../utils/resolveUniqueName.js';
import { extractFieldValue } from '../../utils/extractFieldValue.js';

export const convertVersionType: FieldConverter = async (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Extract value from JIRA API object formats (e.g., { name: "v1.0" })
  // Returns unchanged if already id/accountId/key, or complex/nested structure
  value = extractFieldValue(value);

  // Passthrough: already-resolved objects with id
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return value;
  }

  // Must be a string name
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Expected string or object for field "${fieldSchema.name}", got ${typeof value}`,
      { field: fieldSchema.id, value, type: typeof value }
    );
  }

  // Trim whitespace
  const versionName = value.trim();

  if (versionName === '') {
    throw new ValidationError(
      `Empty string is not a valid version for field "${fieldSchema.name}"`,
      { field: fieldSchema.id, value }
    );
  }

  // Get version list from cache or allowedValues
  let versions: LookupValue[] | null = null;

  // Try cache first
  // Note: Versions are project-level, not issue-type specific
  // Cache key: lookup:{projectKey}:version (no issueType)
  if (context.cache) {
    try {
      const result = await context.cache.getLookup(
        context.projectKey,
        'version',
        undefined  // Versions are project-level, not issue-type specific
      );
      versions = result.value as LookupValue[] | null;
      // Note: We don't do background refresh here - fallback to allowedValues is fine
    } catch {
      // Cache error - fall back to allowedValues
      versions = null;
    }
  }

  // Fall back to fieldSchema.allowedValues
  if (!versions && fieldSchema.allowedValues) {
    versions = fieldSchema.allowedValues as LookupValue[];

    // Cache for future use
    if (context.cache && versions.length > 0) {
      try {
        await context.cache.setLookup(
          context.projectKey,
          'version',
          versions,
          undefined  // Versions are project-level
        );
      } catch {
        // Ignore cache write errors - graceful degradation
      }
    }
  }

  // No version list available
  if (!versions || versions.length === 0) {
    throw new ValidationError(
      `No version values available for field "${fieldSchema.name}". Cannot resolve "${versionName}".`,
      { field: fieldSchema.id, value, projectKey: context.projectKey }
    );
  }

  // Resolve name to unique version using ambiguity detection
  try {
    const resolved = resolveUniqueName(versionName, versions, {
      field: fieldSchema.id,
      fieldName: fieldSchema.name,
    });

    // Return just the id (JIRA format)
    return { id: resolved.id };
  } catch (error) {
    // If NotFoundError, enhance with available versions list
    if (error instanceof ValidationError && error.message.includes('not found')) {
      const availableNames = versions.map((v) => v.name).join(', ');
      throw new ValidationError(
        `Version "${versionName}" not found in project ${context.projectKey}. Available: ${availableNames}`,
        { field: fieldSchema.id, value, availableValues: versions }
      );
    }
    // Re-throw other errors (AmbiguityError, empty string, etc.)
    throw error;
  }
};

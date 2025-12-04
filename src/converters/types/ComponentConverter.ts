/**
 * Component Type Converter
 * Story: E2-S10
 * 
 * Converts component values for fields with items: "component" (used by array converter)
 * 
 * Accepts:
 * - String name: "Backend", "Frontend", "API" (case-insensitive)
 * - Object with id: { id: "10001" } (passthrough)
 * - Object with name: { name: "Backend" } (JIRA API format - extracts and resolves)
 * - null/undefined for optional fields
 * 
 * Returns: { id: string }
 * 
 * Features:
 * - Case-insensitive name matching
 * - Ambiguity detection (multiple matches)
 * - Lookup caching (reduces API calls)
 * - Graceful cache degradation
 * - Project-level lookup (components are not issue-type specific)
 * - JIRA API format support ({ name: "..." })
 * 
 * Note: This converter handles a SINGLE component value.
 * The array converter (E2-S04) handles iteration for multiple components.
 * 
 * @example
 * ```typescript
 * // By name
 * convertComponentType("Backend", fieldSchema, context)
 * // → { id: "10001" }
 * 
 * // By ID (passthrough)
 * convertComponentType({ id: "10001" }, fieldSchema, context)
 * // → { id: "10001" }
 * 
 * // JIRA API format (extracts and resolves)
 * convertComponentType({ name: "Backend" }, fieldSchema, context)
 * // → { id: "10001" }
 * 
 * // Case-insensitive
 * convertComponentType("backend", fieldSchema, context)
 * // → { id: "10001" }
 * ```
 */

import type { FieldConverter } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { resolveUniqueName, type LookupValue } from '../../utils/resolveUniqueName.js';
import { extractFieldValue } from '../../utils/extractFieldValue.js';

export const convertComponentType: FieldConverter = async (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Extract value from JIRA API object formats (e.g., { name: "Backend" })
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
  const componentName = value.trim();

  if (componentName === '') {
    throw new ValidationError(
      `Empty string is not a valid component for field "${fieldSchema.name}"`,
      { field: fieldSchema.id, value }
    );
  }

  // Get component list from cache or allowedValues
  let components: LookupValue[] | null = null;

  // Try cache first
  // Note: Components are project-level, not issue-type specific
  // Cache key: lookup:{projectKey}:component (no issueType)
  if (context.cache) {
    try {
      const result = await context.cache.getLookup(
        context.projectKey,
        'component',
        undefined  // Components are project-level, not issue-type specific
      );
      components = result.value as LookupValue[] | null;
      // Note: We don't do background refresh here - fallback to allowedValues is fine
    } catch {
      // Cache error - fall back to allowedValues
      components = null;
    }
  }

  // Fall back to fieldSchema.allowedValues
  if (!components && fieldSchema.allowedValues) {
    components = fieldSchema.allowedValues as LookupValue[];

    // Cache for future use
    if (context.cache && components.length > 0) {
      try {
        await context.cache.setLookup(
          context.projectKey,
          'component',
          components,
          undefined  // Components are project-level
        );
      } catch {
        // Ignore cache write errors - graceful degradation
      }
    }
  }

  // No component list available
  if (!components || components.length === 0) {
    throw new ValidationError(
      `No component values available for field "${fieldSchema.name}". Cannot resolve "${componentName}".`,
      { field: fieldSchema.id, value, projectKey: context.projectKey }
    );
  }

  // Resolve name to unique component using ambiguity detection
  try {
    const resolved = resolveUniqueName(componentName, components, {
      field: fieldSchema.id,
      fieldName: fieldSchema.name,
    });

    // Return just the id (JIRA format)
    return { id: resolved.id };
  } catch (error) {
    // If NotFoundError, enhance with available components list
    if (error instanceof ValidationError && error.message.includes('not found')) {
      const availableNames = components.map((c) => c.name).join(', ');
      throw new ValidationError(
        `Component "${componentName}" not found in project ${context.projectKey}. Available: ${availableNames}`,
        { field: fieldSchema.id, value, availableValues: components }
      );
    }
    // Re-throw other errors (AmbiguityError, empty string, etc.)
    throw error;
  }
};

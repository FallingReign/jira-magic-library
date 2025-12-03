/**
 * Priority Type Converter
 * Story: E2-S07
 * 
 * Converts priority values for fields with type: "priority"
 * 
 * Accepts:
 * - String name: "High", "Medium", "Low" (case-insensitive)
 * - Object with id: { id: "1" } (passthrough)
 * - Object with name: { name: "High" } (JIRA API format - extracts and resolves)
 * - null/undefined for optional fields
 * 
 * Returns: { id: string }
 * 
 * Features:
 * - Case-insensitive name matching
 * - Ambiguity detection (multiple matches)
 * - Lookup caching (reduces API calls)
 * - Graceful cache degradation
 * - JIRA API format support ({ name: "..." })
 * 
 * @example
 * ```typescript
 * // By name
 * convertPriorityType("High", fieldSchema, context)
 * // → { id: "2" }
 * 
 * // By ID (passthrough)
 * convertPriorityType({ id: "2" }, fieldSchema, context)
 * // → { id: "2" }
 * 
 * // JIRA API format (extracts and resolves)
 * convertPriorityType({ name: "High" }, fieldSchema, context)
 * // → { id: "2" }
 * ```
 */

import type { FieldConverter } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { resolveUniqueName, type LookupValue } from '../../utils/resolveUniqueName.js';

export const convertPriorityType: FieldConverter = async (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Handle object input
  if (typeof value === 'object' && value !== null) {
    // ID passthrough (already resolved)
    if ('id' in value && value.id) {
      return value;
    }
    // JIRA API format: { name: "High" } - extract and resolve
    if ('name' in value && typeof (value as Record<string, unknown>).name === 'string') {
      value = (value as Record<string, unknown>).name as string;
      // Fall through to string resolution below
    }
  }

  // Must be a string name
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Expected string or object for field "${fieldSchema.name}", got ${typeof value}`,
      { field: fieldSchema.id, value, type: typeof value }
    );
  }

  // Trim whitespace
  const priorityName = value.trim();

  if (priorityName === '') {
    throw new ValidationError(
      `Empty string is not a valid priority for field "${fieldSchema.name}"`,
      { field: fieldSchema.id, value }
    );
  }

  // Get priority list from cache or allowedValues
  let priorities: LookupValue[] | null = null;

  // Try cache first
  if (context.cache) {
    try {
      priorities = await context.cache.getLookup(
        context.projectKey,
        'priority',
        context.issueType
      ) as LookupValue[] | null;
    } catch {
      // Cache error - fall back to allowedValues
      priorities = null;
    }
  }

  // Fall back to fieldSchema.allowedValues
  if (!priorities && fieldSchema.allowedValues) {
    priorities = fieldSchema.allowedValues as LookupValue[];

    // Cache for future use
    if (context.cache && priorities.length > 0) {
      try {
        await context.cache.setLookup(
          context.projectKey,
          'priority',
          priorities,
          context.issueType
        );
      } catch {
        // Ignore cache write errors
      }
    }
  }

  // No priority list available
  if (!priorities || priorities.length === 0) {
    throw new ValidationError(
      `No priority values available for field "${fieldSchema.name}". Cannot resolve "${priorityName}".`,
      { field: fieldSchema.id, value, projectKey: context.projectKey, issueType: context.issueType }
    );
  }

  // Resolve name to unique priority using ambiguity detection
  try {
    const resolved = resolveUniqueName(priorityName, priorities, {
      field: fieldSchema.id,
      fieldName: fieldSchema.name,
    });

    // Return just the id (JIRA format)
    return { id: resolved.id };
  } catch (error) {
    // If NotFoundError, enhance with available priorities list
    if (error instanceof ValidationError && error.message.includes('not found')) {
      const availableNames = priorities.map((p) => p.name).join(', ');
      throw new ValidationError(
        `Value "${priorityName}" not found for field "${fieldSchema.name}". Available priorities: ${availableNames}`,
        { field: fieldSchema.id, value, availableValues: priorities }
      );
    }
    // Re-throw other errors (AmbiguityError, empty string, etc.)
    throw error;
  }
};

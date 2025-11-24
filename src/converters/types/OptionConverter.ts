/**
 * Option Type Converter
 * Story: E2-S09
 * 
 * Converts option values for fields with type: "option" (single-select custom fields)
 * 
 * Accepts:
 * - String value: "Production", "Staging", "Development" (case-insensitive)
 * - Object with id: { id: "10100" }
 * - null/undefined for optional fields
 * 
 * Returns: { id: string }
 * 
 * Features:
 * - Case-insensitive value matching
 * - Ambiguity detection (multiple matches)
 * - Lookup caching (reduces API calls)
 * - Graceful cache degradation
 * 
 * @example
 * ```typescript
 * // By value
 * convertOptionType("Production", fieldSchema, context)
 * // → { id: "10100" }
 * 
 * // By ID
 * convertOptionType({ id: "10100" }, fieldSchema, context)
 * // → { id: "10100" }
 * ```
 */

import type { FieldConverter } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { resolveUniqueName, type LookupValue } from '../../utils/resolveUniqueName.js';

export const convertOptionType: FieldConverter = async (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Already an object with id → pass through
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return value;
  }

  // Must be a string value
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Expected string or object for field "${fieldSchema.name}", got ${typeof value}`,
      { field: fieldSchema.id, value, type: typeof value }
    );
  }

  // Trim whitespace
  const optionValue = value.trim();

  if (optionValue === '') {
    throw new ValidationError(
      `Empty string is not a valid option for field "${fieldSchema.name}"`,
      { field: fieldSchema.id, value }
    );
  }

  // Get option list from cache or allowedValues
  // Note: Schema already normalizes {id, value} from JIRA API to {id, name} format
  let options: LookupValue[] | null = null;

  // Try cache first
  if (context.cache) {
    try {
      options = (await context.cache.getLookup(
        context.projectKey,
        'option',
        context.issueType
      )) as LookupValue[] | null;
    } catch {
      // Cache error - fall back to allowedValues
      options = null;
    }
  }

  // Fall back to fieldSchema.allowedValues
  if (!options && fieldSchema.allowedValues) {
    options = fieldSchema.allowedValues;

    // Cache for future use
    if (context.cache && options.length > 0) {
      try {
        await context.cache.setLookup(
          context.projectKey,
          'option',
          options,
          context.issueType
        );
      } catch {
        // Ignore cache write errors
      }
    }
  }

  // No option list available
  if (!options || options.length === 0) {
    throw new ValidationError(
      `No option values available for field "${fieldSchema.name}". Cannot resolve "${optionValue}".`,
      { field: fieldSchema.id, value, projectKey: context.projectKey, issueType: context.issueType }
    );
  }

  // Resolve value to unique option using ambiguity detection
  try {
    const resolved = resolveUniqueName(optionValue, options, {
      field: fieldSchema.id,
      fieldName: fieldSchema.name,
    });

    // Return just the id (JIRA format)
    return { id: resolved.id };
  } catch (error) {
    // If NotFoundError, enhance with available options list
    if (error instanceof ValidationError && error.message.includes('not found')) {
      const availableValues = options.map((o) => o.name).join(', ');
      throw new ValidationError(
        `Value "${optionValue}" not found for field "${fieldSchema.name}". Available options: ${availableValues}`,
        { field: fieldSchema.id, value, availableValues: options }
      );
    }
    // Re-throw other errors (AmbiguityError, empty string, etc.)
    throw error;
  }
};

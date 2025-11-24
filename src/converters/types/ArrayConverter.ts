/**
 * Array Type Converter
 * Story: E2-S04
 * 
 * Container converter that delegates item conversion to registered item type converters.
 * Handles fields with type: "array" and items property specifying the item type.
 * 
 * Accepts:
 * - Arrays: ["item1", "item2", "item3"]
 * - CSV strings: "item1, item2, item3"
 * 
 * Output:
 * - Array of converted values based on item type
 * 
 * Features:
 * - Type-agnostic container pattern (delegates to item converters)
 * - CSV parsing with whitespace trimming
 * - Context propagation to item converters
 * - Error wrapping with item index
 * - Empty value handling (empty string → empty array)
 * - Optional field support (null/undefined passthrough)
 * 
 * @param value - User input (array, CSV string, null, or undefined)
 * @param fieldSchema - JIRA field schema with type: "array" and items property
 * @param context - Conversion context (must include registry for item converter lookup)
 * @returns Array of converted values or null/undefined if optional
 * @throws {ValidationError} if value is invalid format or item converter not found
 * 
 * @example
 * ```typescript
 * // Labels (items: "string")
 * convertArrayType(['bug', 'frontend'], field, context)          // → ['bug', 'frontend']
 * convertArrayType('bug, frontend', field, context)              // → ['bug', 'frontend']
 * 
 * // Components (items: "component" - delegates to component converter)
 * convertArrayType(['Backend', 'API'], field, context)           // → [{id: '10001'}, {id: '10002'}]
 * 
 * // Fix Versions (items: "version" - delegates to version converter)
 * convertArrayType(['v1.0', 'v2.0'], field, context)             // → [{id: '10200'}, {id: '10201'}]
 * 
 * // Empty handling
 * convertArrayType('', field, context)                           // → []
 * convertArrayType([], field, context)                           // → []
 * ```
 */

import { FieldSchema } from '../../types/schema.js';
import { ConversionContext, FieldConverter } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';

/**
 * Convert array field values by delegating to item type converters
 */
export const convertArrayType: FieldConverter = async (
  value: unknown,
  fieldSchema: FieldSchema,
  context: ConversionContext
): Promise<unknown> => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Validate context has registry
  if (!context.registry) {
    throw new ValidationError(
      `Array converter requires registry in context for field "${fieldSchema.name}"`,
      { field: fieldSchema.id }
    );
  }

  // Get item type from schema
  const itemType = fieldSchema.schema.items;
  if (!itemType) {
    throw new ValidationError(
      `Array field "${fieldSchema.name}" missing items type in schema`,
      { field: fieldSchema.id, schema: fieldSchema.schema }
    );
  }

  // Parse input to array
  let items: unknown[];

  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === 'string') {
    // CSV string parsing
    const trimmed = value.trim();
    if (trimmed === '') {
      return [];
    }
    // Split on comma, trim each item, filter out empty strings
    items = trimmed
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
  } else {
    throw new ValidationError(
      `Expected array or CSV string for field "${fieldSchema.name}", got ${typeof value}`,
      { field: fieldSchema.id, value, type: typeof value }
    );
  }

  // Get item converter from registry
  if (!context.registry) {
    throw new ValidationError(
      `Array converter requires registry in context to look up item converter`,
      { field: fieldSchema.id, itemType }
    );
  }

  const itemConverter = context.registry.get(itemType);
  if (!itemConverter) {
    throw new ValidationError(
      `No converter for type: ${itemType}`,
      { field: fieldSchema.id, itemType, availableTypes: context.registry.getTypes() }
    );
  }

  // Create item field schema for delegation
  // Array converter passes modified schema to item converter with item type
  const itemFieldSchema: FieldSchema = {
    ...fieldSchema,
    type: itemType,
    schema: {
      type: itemType,
    },
  };

  // Convert each item, wrapping errors with index context
  const converted: unknown[] = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const convertedItem = await Promise.resolve(itemConverter(items[i], itemFieldSchema, context));
      converted.push(convertedItem);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(
          `Error converting item at index ${i} for field "${fieldSchema.name}": ${error.message}`,
          {
            field: fieldSchema.id,
            itemIndex: i,
            itemValue: items[i],
            originalError: error.details,
          }
        );
      }
      throw error;
    }
  }

  return converted;
};

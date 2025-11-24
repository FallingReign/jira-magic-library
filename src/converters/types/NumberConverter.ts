import { FieldSchema } from '../../types/schema.js';
import { ValidationError } from '../../errors/ValidationError.js';

/**
 * Converts numeric values for fields with type: "number"
 * 
 * Accepts numbers or numeric strings, validates format, and preserves
 * integer vs float distinction. Handles Story Points, time estimates,
 * and custom numeric fields.
 * 
 * Features:
 * - Accepts strings or numbers
 * - Parses strings using Number() with validation
 * - Preserves integer vs float (5 stays 5, not 5.0)
 * - Trims whitespace before parsing
 * - Supports scientific notation (1e3 → 1000)
 * - Validates against NaN, Infinity
 * - Warns for numbers > MAX_SAFE_INTEGER
 * - Passes through null/undefined (optional fields)
 * 
 * @param value - User input (number, string, null, or undefined)
 * @param fieldSchema - JIRA field schema from createmeta
 * @returns Parsed number value or null/undefined if optional
 * @throws {ValidationError} if value is non-numeric, NaN, or Infinity
 * 
 * @example
 * ```typescript
 * // Parse string to number
 * convertNumber('5', field)        // → 5
 * convertNumber('3.14', field)     // → 3.14
 * 
 * // Pass through number
 * convertNumber(5, field)          // → 5
 * 
 * // Handle whitespace
 * convertNumber(' 5 ', field)      // → 5
 * 
 * // Scientific notation
 * convertNumber('1e3', field)      // → 1000
 * 
 * // Handle optional fields
 * convertNumber(null, field)       // → null
 * convertNumber(undefined, field)  // → undefined
 * 
 * // Validation errors
 * convertNumber('abc', field)      // throws ValidationError
 * convertNumber('', field)         // throws ValidationError
 * ```
 * 
 * @param value - User-provided value (string or number)
 * @param fieldSchema - Field schema for error messages
 * @returns Converted number, or null/undefined for optional fields
 * @throws {ValidationError} For invalid numeric formats
 */
export function convertNumber(
  value: unknown,
  fieldSchema: FieldSchema
): number | null | undefined {
  // Pass through null/undefined for optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // If already a number, validate it
  if (typeof value === 'number') {
    // Check for NaN
    if (Number.isNaN(value)) {
      throw new ValidationError(
        `Invalid number for field '${fieldSchema.name}': value is NaN`,
        { field: fieldSchema.name, value: 'NaN' }
      );
    }

    // Check for Infinity
    if (!Number.isFinite(value)) {
      throw new ValidationError(
        `Invalid number for field '${fieldSchema.name}': value is ${value}`,
        { field: fieldSchema.name, value: String(value) }
      );
    }

    return value;
  }

  // Convert string to number
  if (typeof value === 'string') {
    // Trim whitespace
    const trimmed = value.trim();

    // Reject empty strings
    if (trimmed === '') {
      throw new ValidationError(
        `Invalid number format for field '${fieldSchema.name}': empty string provided`,
        { field: fieldSchema.name, value: '(empty string)' }
      );
    }

    // Parse to number
    const parsed = Number(trimmed);

    // Check if parsing succeeded
    if (Number.isNaN(parsed)) {
      throw new ValidationError(
        `Invalid number format for field '${fieldSchema.name}': cannot convert '${value}' to number`,
        { field: fieldSchema.name, value }
      );
    }

    // Check for Infinity (can result from parsing "Infinity" string)
    if (!Number.isFinite(parsed)) {
      throw new ValidationError(
        `Invalid number for field '${fieldSchema.name}': value is ${parsed}`,
        { field: fieldSchema.name, value: String(parsed) }
      );
    }

    // Warn for numbers exceeding MAX_SAFE_INTEGER
    if (Math.abs(parsed) > Number.MAX_SAFE_INTEGER) {
      // eslint-disable-next-line no-console
      console.warn(
        `Warning: Number ${parsed} for field '${fieldSchema.name}' exceeds MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}). Precision may be lost.`
      );
    }

    // Convert -0 to 0 (JavaScript quirk: -0 !== 0 with Object.is())
    return Object.is(parsed, -0) ? 0 : parsed;
  }

  // For any other type, try to convert
  const converted = Number(value);
  if (Number.isNaN(converted)) {
    throw new ValidationError(
      `Invalid number format for field '${fieldSchema.name}': cannot convert value of type ${typeof value} to number`,
      { field: fieldSchema.name, valueType: typeof value }
    );
  }

  return converted;
}

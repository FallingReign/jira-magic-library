/**
 * DateTime Type Converter
 * Story: E2-S03
 * 
 * Converts datetime values for fields with type: "datetime"
 * 
 * Accepts:
 * - ISO datetime strings: "2025-09-30T14:30:00Z", "2025-09-30T14:30:00-05:00"
 * - Unix timestamps: 1727704200000 (ms) or 1727704200 (seconds)  
 * - JavaScript Date objects: new Date()
 * - Date-only strings: "2025-09-30" (fallback to midnight UTC)
 * 
 * Output:
 * - JIRA format: "YYYY-MM-DDTHH:mm:ss.sss+0000" (always UTC with milliseconds)
 * 
 * Features:
 * - Timezone conversion to UTC
 * - Auto-detect seconds vs milliseconds for timestamps
 * - Date-only fallback to midnight UTC
 * - Preserves milliseconds precision (3 decimal places)
 * - Validates input formats and Date objects
 * - Passes through null/undefined (optional fields)
 * 
 * @param value - User input (ISO string, timestamp, Date object, null, or undefined)
 * @param fieldSchema - JIRA field schema from createmeta
 * @param context - Conversion context (unused for datetime)
 * @returns DateTime string in YYYY-MM-DDTHH:mm:ss.sss+0000 format or null/undefined if optional
 * @throws {ValidationError} if value is invalid datetime format or invalid Date
 * 
 * @example
 * ```typescript
 * // ISO strings
 * convertDateTimeType('2025-09-30T14:30:00Z', field)      // → '2025-09-30T14:30:00.000+0000'
 * convertDateTimeType('2025-09-30T14:30:00-05:00', field) // → '2025-09-30T19:30:00.000+0000'
 * 
 * // Timestamps (auto-detect: < 10 billion = seconds, >= 10 billion = milliseconds)
 * convertDateTimeType(1727704200000, field)               // → '2024-09-30T13:50:00.000+0000' (ms)
 * convertDateTimeType(1727704200, field)                  // → '2024-09-30T13:50:00.000+0000' (seconds)
 * 
 * // Date objects (for explicit control)
 * convertDateTimeType(new Date('2025-09-30T14:30:00Z'), field) // → '2025-09-30T14:30:00.000+0000'
 * convertDateTimeType(new Date(86400000), field)               // → '1970-01-02T00:00:00.000+0000' (explicit ms)
 * 
 * // Date fallback
 * convertDateTimeType('2025-09-30', field)                // → '2025-09-30T00:00:00.000+0000'
 * ```
 */

import { FieldSchema } from '../../types/schema.js';
import { ValidationError } from '../../errors/ValidationError.js';

/**
 * Converts datetime values to JIRA's required format: YYYY-MM-DDTHH:mm:ss.sss+0000
 * 
 * @param value - User input (ISO string, timestamp, Date object, null, or undefined)
 * @param fieldSchema - JIRA field schema from createmeta
 * @returns DateTime string in YYYY-MM-DDTHH:mm:ss.sss+0000 format or null/undefined if optional
 * @throws {ValidationError} if value is invalid datetime format or invalid Date
 */
export function convertDateTimeType(
  value: unknown,
  fieldSchema: FieldSchema
): string | null | undefined {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  let date: Date;

  try {
    // Handle different input types
    if (value instanceof Date) {
      // JavaScript Date object
      date = value;
      if (isNaN(date.getTime())) {
        throw new ValidationError(
          `Invalid Date object for field "${fieldSchema.name}"`,
          { field: fieldSchema.id, value }
        );
      }
    } else if (typeof value === 'number') {
      // Unix timestamp (seconds or milliseconds)
      let timestamp = value;
      
      // Auto-detect seconds vs milliseconds using threshold approach
      // Threshold: 10 billion (10000000000)
      // - In seconds: Sep 9, 2001 (any date from 1970-2286)
      // - In milliseconds: Jan 1, 1970 (epoch start)
      // 
      // Strategy: Numbers < 10 billion are treated as Unix timestamps in seconds
      // This covers the common range (1970-2286) and matches Unix timestamp convention
      // 
      // Examples:
      // - 1727704200 (10 digits, < 10B) → seconds → 2024-09-30
      // - 1727704200000 (13 digits, > 10B) → milliseconds → 2024-09-30
      // - 86400000 (8 digits, < 10B) → seconds → 1972-09-29
      // 
      // Note: For timestamps near epoch where ambiguity exists, use Date object:
      //   convertDateTimeType(new Date(86400000), field) // Explicit milliseconds
      if (Math.abs(timestamp) < 10000000000) {
        timestamp *= 1000; // Convert seconds to milliseconds
      }
      
      date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        throw new ValidationError(
          `Invalid timestamp for field "${fieldSchema.name}": ${value}`,
          { field: fieldSchema.id, value }
        );
      }
    } else if (typeof value === 'string') {
      // String input - handle various formats
      const trimmed = value.trim();
      
      if (trimmed === '') {
        throw new ValidationError(
          `Empty string is not a valid datetime for field "${fieldSchema.name}"`,
          { field: fieldSchema.id, value }
        );
      }

      // Try parsing as ISO datetime string
      // Supports:
      // - "2025-09-30T14:30:00Z" (with timezone)
      // - "2025-09-30T14:30:00" (without timezone, assume UTC)
      // - "2025-09-30T14:30" (without seconds)
      // - "2025-09-30" (date only, midnight UTC)
      
      let isoString = trimmed;
      
      // Handle date-only format: "2025-09-30" → "2025-09-30T00:00:00Z"
      if (/^\d{4}-\d{2}-\d{2}$/.test(isoString)) {
        isoString += 'T00:00:00Z';
      }
      // Handle partial datetime: "2025-09-30T14:30" → "2025-09-30T14:30:00Z"
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(isoString)) {
        isoString += ':00Z';
      }
      // Handle datetime without timezone: "2025-09-30T14:30:00" → "2025-09-30T14:30:00Z"
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(isoString)) {
        isoString += 'Z';
      }
      // Handle datetime with milliseconds but no timezone: "2025-09-30T14:30:00.123" → "2025-09-30T14:30:00.123Z"
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+$/.test(isoString)) {
        isoString += 'Z';
      }
      // Validate that the string matches ISO 8601 format before parsing
      // Reject formats like "09/30/2025 2:30 PM" that JavaScript Date would accept
      else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(isoString)) {
        throw new ValidationError(
          `Invalid datetime format for field "${fieldSchema.name}": "${value}". Expected ISO 8601 format (e.g., "2025-09-30T14:30:00Z")`,
          { field: fieldSchema.id, value }
        );
      }

      date = new Date(isoString);
      if (isNaN(date.getTime())) {
        throw new ValidationError(
          `Invalid datetime format for field "${fieldSchema.name}": "${value}". Expected ISO 8601 format (e.g., "2025-09-30T14:30:00Z")`,
          { field: fieldSchema.id, value }
        );
      }
    } else {
      // Invalid type
      throw new ValidationError(
        `Expected datetime value (string, number, or Date) for field "${fieldSchema.name}", got ${typeof value}`,
        { field: fieldSchema.id, value, type: typeof value }
      );
    }

    // Convert to JIRA format: YYYY-MM-DDTHH:mm:ss.sss+0000
    // Always use UTC and include milliseconds (3 decimal places)
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+0000`;

  } catch (error) {
    // Re-throw ValidationError as-is
    if (error instanceof ValidationError) {
      throw error;
    }
    
    // Wrap other errors
    throw new ValidationError(
      `Failed to convert datetime value for field "${fieldSchema.name}": ${error instanceof Error ? error.message : String(error)}`,
      { field: fieldSchema.id, value, originalError: error }
    );
  }
}
import { FieldSchema } from '../../types/schema.js';
import { ValidationError } from '../../errors/ValidationError.js';

/**
 * Converts date values for fields with type: "date"
 * 
 * Accepts ISO 8601 strings, Excel serial dates, or JavaScript Date objects,
 * and converts them to JIRA's required format: YYYY-MM-DD (date only, no time).
 * 
 * Features:
 * - Accepts ISO 8601 strings (with or without time component)
 * - Accepts Excel serial dates (days since 1900-01-01)
 * - Accepts JavaScript Date objects
 * - Extracts date from datetime (ignores time component)
 * - Validates real dates (rejects Feb 31, etc.)
 * - Uses UTC date (not local timezone)
 * - Preserves leading zeros in output format
 * - Passes through null/undefined (optional fields)
 * 
 * @param value - User input (ISO string, Excel serial, Date object, null, or undefined)
 * @param fieldSchema - JIRA field schema from createmeta
 * @returns Date string in YYYY-MM-DD format or null/undefined if optional
 * @throws {ValidationError} if value is invalid date format or invalid date
 * 
 * @example
 * ```typescript
 * // ISO strings
 * convertDate('2025-09-30', field)              // → '2025-09-30'
 * convertDate('2025-09-30T14:30:00Z', field)    // → '2025-09-30'
 * 
 * // Excel serial dates (accounts for Excel's 1900 leap year bug)
 * convertDate(1, field)                         // → '1900-01-01'
 * convertDate(45744, field)                     // → '2025-03-28'
 * 
 * // Date objects
 * convertDate(new Date('2025-09-30'), field)    // → '2025-09-30'
 * 
 * // Handle optional fields
 * convertDate(null, field)                      // → null
 * convertDate(undefined, field)                 // → undefined
 * 
 * // Validation errors
 * convertDate('09/30/2025', field)              // throws ValidationError (US format)
 * convertDate('2025-02-31', field)              // throws ValidationError (invalid date)
 * convertDate('2025-09', field)                 // throws ValidationError (partial date)
 * ```
 */
export function convertDate(
  value: unknown,
  fieldSchema: FieldSchema
): string | null | undefined {
  // Pass through null/undefined for optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Handle Excel serial dates (numbers)
  if (typeof value === 'number') {
    return convertExcelSerial(value, fieldSchema);
  }

  // Handle Date objects
  if (value instanceof Date) {
    return convertDateObject(value, fieldSchema);
  }

  // Handle ISO strings
  if (typeof value === 'string') {
    return convertISOString(value, fieldSchema);
  }

  // Invalid type
  throw new ValidationError(
    `Invalid date value for field '${fieldSchema.name}': expected string, number (Excel serial), or Date object, got ${typeof value}`,
    { field: fieldSchema.id, value, type: typeof value }
  );
}

/**
 * Convert Excel serial date to YYYY-MM-DD
 * 
 * Excel stores dates as days since January 1, 1900 (serial 1 = 1900-01-01)
 * Ignores time component (fractional part of serial number)
 * 
 * Note: Excel has a leap year bug - it treats 1900 as a leap year (it wasn't).
 * Serial 60 = Feb 29, 1900 (invalid date). For dates after Feb 28, 1900,
 * we subtract 2 instead of 1 to match Excel's behavior.
 */
function convertExcelSerial(serial: number, fieldSchema: FieldSchema): string {
  // Validate serial number
  if (serial <= 0) {
    throw new ValidationError(
      `Invalid Excel serial date: ${serial} for field '${fieldSchema.name}' (must be > 0)`,
      { field: fieldSchema.id, value: serial }
    );
  }

  // Excel epoch: January 1, 1900
  const EXCEL_EPOCH = new Date(Date.UTC(1900, 0, 1));
  
  // Excel leap year bug: Excel treats 1900 as a leap year (it wasn't)
  // Serial 60 = "Feb 29, 1900" (invalid). For serials > 60, subtract extra day.
  // Serial 1 = 1900-01-01, Serial 60 = 1900-02-29 (invalid), Serial 61 = 1900-03-01
  let daysSinceEpoch: number;
  if (serial <= 60) {
    // Dates from Jan 1 to Feb 29, 1900 (serial 60 is the fake leap day)
    daysSinceEpoch = Math.floor(serial) - 1;
  } else {
    // Dates after Feb 29, 1900 - subtract 2 to account for bug
    daysSinceEpoch = Math.floor(serial) - 2;
  }
  
  const date = new Date(EXCEL_EPOCH.getTime() + daysSinceEpoch * 24 * 60 * 60 * 1000);

  return formatDate(date);
}

/**
 * Convert Date object to YYYY-MM-DD
 * 
 * Uses UTC date (not local timezone)
 */
function convertDateObject(date: Date, fieldSchema: FieldSchema): string {
  // Check for invalid Date
  if (isNaN(date.getTime())) {
    throw new ValidationError(
      `Invalid Date object for field '${fieldSchema.name}'`,
      { field: fieldSchema.id, value: date }
    );
  }

  return formatDate(date);
}

/**
 * Convert ISO 8601 string to YYYY-MM-DD
 * 
 * Accepts:
 * - ISO date: "2025-09-30"
 * - ISO datetime: "2025-09-30T14:30:00Z"
 * - ISO with timezone: "2025-09-30T14:30:00-05:00"
 * 
 * Rejects:
 * - US format: "09/30/2025"
 * - Partial dates: "2025-09"
 * - Invalid dates: "2025-02-31"
 */
function convertISOString(isoString: string, fieldSchema: FieldSchema): string {
  const trimmed = isoString.trim();

  // Check for empty string
  if (trimmed === '') {
    throw new ValidationError(
      `Empty string is not a valid date for field '${fieldSchema.name}'`,
      { field: fieldSchema.id, value: isoString }
    );
  }

  // Check for ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS...)
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T|$)/;
  if (!isoDatePattern.test(trimmed)) {
    throw new ValidationError(
      `Invalid date format for field '${fieldSchema.name}': expected ISO 8601 format (YYYY-MM-DD), got "${trimmed}"`,
      { field: fieldSchema.id, value: isoString }
    );
  }

  // Parse date
  const date = new Date(trimmed);

  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw new ValidationError(
      `Invalid date for field '${fieldSchema.name}': "${trimmed}"`,
      { field: fieldSchema.id, value: isoString }
    );
  }

  // Extract date part (YYYY-MM-DD) from ISO string
  const datePart = trimmed.split('T')[0];

  // Validate that the parsed date matches the input date
  // This catches invalid dates like "2025-02-31" which Date would normalize to "2025-03-03"
  const formatted = formatDate(date);
  if (formatted !== datePart) {
    throw new ValidationError(
      `Invalid date for field '${fieldSchema.name}': "${trimmed}" (date does not exist)`,
      { field: fieldSchema.id, value: isoString, parsed: formatted, expected: datePart }
    );
  }

  return datePart;
}

/**
 * Format Date object to YYYY-MM-DD string
 * 
 * Uses UTC date (not local timezone)
 * Preserves leading zeros: 2025-01-05 (not 2025-1-5)
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

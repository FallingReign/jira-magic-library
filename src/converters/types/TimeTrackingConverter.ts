import { FieldSchema } from '../../types/schema.js';
import { ConversionContext } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';

/**
 * Time tracking object format
 */
interface TimeTrackingObject {
  originalEstimate?: string | null;
  remainingEstimate?: string | null;
}

/**
 * Converts time tracking values for fields with type: "timetracking"
 * 
 * Normalizes user-friendly time formats to JIRA's expected duration string format.
 * JIRA accepts duration strings (e.g., "2h", "1d 4h") and stores both the string
 * and seconds representation internally.
 * 
 * Features:
 * - Accepts JIRA format strings: "2h", "30m", "1d", "1w", "1h 30m", "1w 2d 4h" (pass-through)
 * - Normalizes friendly formats: "2 hours" → "2h", "30 minutes" → "30m"
 * - Accepts numeric seconds: 7200 → "2h" (converts to duration string)
 * - Accepts object format: { originalEstimate: "2h", remainingEstimate: "1h 30m" }
 * - Validates format and provides clear error messages
 * - Passes through null/undefined (optional fields)
 * 
 * @param value - User input (string, number, object, null, or undefined)
 * @param fieldSchema - JIRA field schema from createmeta
 * @param context - Conversion context (unused but required by interface)
 * @returns Duration string, time tracking object, or null/undefined if optional
 * @throws {ValidationError} if value is invalid format
 * 
 * @example
 * ```typescript
 * // JIRA format strings (pass through)
 * convertTimeTrackingType('2h', field, context)              // → '2h'
 * convertTimeTrackingType('1h 30m', field, context)          // → '1h 30m'
 * convertTimeTrackingType('1w 2d 4h', field, context)        // → '1w 2d 4h'
 * 
 * // Friendly formats (normalize)
 * convertTimeTrackingType('2 hours', field, context)         // → '2h'
 * convertTimeTrackingType('30 minutes', field, context)      // → '30m'
 * 
 * // Numeric seconds (convert to duration string)
 * convertTimeTrackingType(7200, field, context)              // → '2h'
 * convertTimeTrackingType(5400, field, context)              // → '1h 30m'
 * 
 * // Object formats
 * convertTimeTrackingType(
 *   { originalEstimate: '2d', remainingEstimate: '1d 4h' },
 *   field,
 *   context
 * )
 * // → { originalEstimate: '2d', remainingEstimate: '1d 4h' }
 * 
 * // Handle optional fields
 * convertTimeTrackingType(null, field, context)              // → null
 * convertTimeTrackingType(undefined, field, context)         // → undefined
 * 
 * // Validation errors
 * convertTimeTrackingType('2x', field, context)              // throws ValidationError
 * convertTimeTrackingType(-100, field, context)              // throws ValidationError
 * ```
 */
export function convertTimeTrackingType(
  value: unknown,
  fieldSchema: FieldSchema,
  _context: ConversionContext
): string | TimeTrackingObject | null | undefined {
  // Handle null/undefined (optional field)
  if (value === null) return null;
  if (value === undefined) return undefined;

  // Handle object format: { originalEstimate, remainingEstimate }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const result: TimeTrackingObject = {};

    if ('originalEstimate' in obj) {
      if (obj.originalEstimate === null) {
        result.originalEstimate = null;
      } else if (obj.originalEstimate !== undefined) {
        result.originalEstimate = parseTimeValue(obj.originalEstimate, fieldSchema, 'originalEstimate');
      }
    }

    if ('remainingEstimate' in obj) {
      if (obj.remainingEstimate === null) {
        result.remainingEstimate = null;
      } else if (obj.remainingEstimate !== undefined) {
        result.remainingEstimate = parseTimeValue(obj.remainingEstimate, fieldSchema, 'remainingEstimate');
      }
    }

    return result;
  }

  // Handle string or numeric format
  return parseTimeValue(value, fieldSchema);
}

/**
 * Parse a single time value (string or number) and return duration string
 */
function parseTimeValue(
  value: unknown,
  fieldSchema: FieldSchema,
  fieldName?: string
): string {
  const fieldLabel = fieldName || fieldSchema.name;

  // Handle numeric format (seconds) - convert to duration string
  if (typeof value === 'number') {
    if (value < 0 || !Number.isInteger(value)) {
      throw new ValidationError(
        `Time tracking value for field "${fieldLabel}" must be a positive integer (got ${value})`
      );
    }
    return secondsToDuration(value);
  }

  // Handle string format
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new ValidationError(
        `Time tracking value for field "${fieldLabel}" cannot be empty. ` +
        `Valid formats: "2h", "30m", "1d", "1w", "1h 30m", etc.`
      );
    }

    // Check if already in JIRA format
    if (isValidJiraFormat(trimmed)) {
      return trimmed; // Pass through as-is
    }

    // Try to normalize friendly format
    const normalized = normalizeFriendlyFormat(trimmed);
    if (normalized) {
      return normalized;
    }

    // Invalid format
    throw new ValidationError(
      `Time tracking value for field "${fieldLabel}" has invalid format: "${value}". ` +
      `Expected JIRA format (e.g., "2h", "1d 4h") or friendly format (e.g., "2 hours", "30 minutes")`
    );
  }

  // Invalid type
  throw new ValidationError(
    `Time tracking value for field "${fieldLabel}" must be a string, number, or object (got ${typeof value})`
  );
}

/**
 * Checks if a string is valid JIRA duration format
 * Valid: "2h", "30m", "1d", "1w", "1h 30m", "1w 2d 4h", etc.
 */
function isValidJiraFormat(input: string): boolean {
  // JIRA format: one or more "{number}{unit}" separated by spaces
  // Units: w (week), d (day), h (hour), m (minute)
  const regex = /^(\d+[wdhm])(\s+\d+[wdhm])*$/;
  return regex.test(input);
}

/**
 * Normalizes friendly time formats to JIRA format
 * Examples: "2 hours" → "2h", "30 minutes" → "30m"
 */
function normalizeFriendlyFormat(input: string): string | null {
  const lowerInput = input.toLowerCase();

  // Map friendly terms to JIRA units
  const unitMap: Record<string, string> = {
    'week': 'w',
    'weeks': 'w',
    'day': 'd',
    'days': 'd',
    'hour': 'h',
    'hours': 'h',
    'minute': 'm',
    'minutes': 'm',
    'min': 'm',
    'mins': 'm',
  };

  // Try to match patterns like "2 hours", "30 minutes", etc.
  for (const [friendly, jiraUnit] of Object.entries(unitMap)) {
    const pattern = new RegExp(`^(\\d+)\\s*${friendly}$`);
    const match = lowerInput.match(pattern);
    if (match) {
      return `${match[1]}${jiraUnit}`;
    }
  }

  return null; // No match
}

/**
 * Converts seconds to JIRA duration string format
 * Examples: 7200 → "2h", 5400 → "1h 30m", 216000 → "1w 30m"
 */
function secondsToDuration(totalSeconds: number): string {
  if (totalSeconds === 0) return '0m';

  const units = [
    { unit: 'w', seconds: 5 * 8 * 60 * 60 }, // week = 5 days (JIRA workweek)
    { unit: 'd', seconds: 8 * 60 * 60 },     // day = 8 hours (JIRA workday)
    { unit: 'h', seconds: 60 * 60 },         // hour = 60 minutes
    { unit: 'm', seconds: 60 },              // minute = 60 seconds
  ];

  const parts: string[] = [];
  let remaining = totalSeconds;

  for (const { unit, seconds } of units) {
    if (remaining >= seconds) {
      const count = Math.floor(remaining / seconds);
      parts.push(`${count}${unit}`);
      remaining -= count * seconds;
    }
  }

  return parts.join(' ') || '0m';
}

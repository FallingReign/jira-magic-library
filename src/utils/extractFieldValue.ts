/**
 * Extract Field Value Utility
 * 
 * Universal shallow extraction for JIRA API object formats.
 * Used by all converters to normalize input before processing.
 * 
 * Rules:
 * 1. Non-objects pass through unchanged
 * 2. Objects with JIRA identifiers (id, accountId, key) pass through unchanged
 * 3. Objects with multiple keys OR nested values pass through unchanged
 * 4. Objects with single key (primitive value) → extract and return the value
 * 5. Anything else passes through unchanged
 * 
 * @example
 * ```typescript
 * extractFieldValue("High")                    // → "High" (rule 1)
 * extractFieldValue({ id: "10100" })           // → { id: "10100" } (rule 2)
 * extractFieldValue({ value: "Production" })   // → "Production" (rule 4)
 * extractFieldValue({ name: "High" })          // → "High" (rule 4)
 * extractFieldValue({ value: 123 })            // → 123 (rule 4)
 * extractFieldValue({ a: "1", b: "2" })        // → { a: "1", b: "2" } (rule 3 - multiple keys)
 * extractFieldValue({ child: { id: "10" } })   // → { child: { id: "10" } } (rule 3 - nested)
 * ```
 */

export function extractFieldValue(value: unknown): unknown {
  // Rule 1: Non-objects pass through
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value;
  }

  const obj = value as Record<string, unknown>;

  // Rule 2: Objects with JIRA identifiers pass through
  if ('id' in obj || 'accountId' in obj || 'key' in obj) {
    return value;
  }

  const keys = Object.keys(obj);
  const singleValue = keys.length === 1 ? obj[keys[0]!] : undefined;

  // Rule 3: Multiple keys OR nested value → pass through
  if (keys.length !== 1) {
    return value;
  }
  if (typeof singleValue === 'object' && singleValue !== null) {
    return value;
  }

  // Rule 4: Single key with primitive value → extract
  return singleValue;
}

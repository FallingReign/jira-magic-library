/**
 * Special Field Detection
 *
 * Certain JIRA fields have a misleading or incomplete type in createmeta.
 * The stable way to identify them is via schema.custom, as Atlassian explicitly
 * documents these custom plugin keys as the canonical field identifiers.
 *
 * This module maps schema.custom values → JML internal type names.
 * The JML type name is then used to dispatch to the correct converter,
 * bypassing the generic array/string/number converter pipeline.
 *
 * Design: separation of "discovery" (createmeta) from "serialisation" (converters).
 * createmeta tells us whether a field is present and required; this module
 * tells us how to write the value.
 *
 * @see https://docs.atlassian.com/jira-software/REST/
 * @see https://developer.atlassian.com/server/jira/platform/jira-rest-api-examples/
 */

/**
 * Maps JIRA schema.custom identifiers to JML internal type names.
 *
 * Add new entries here to support additional special fields in the future
 * (e.g. Epic Link, Rank, etc.)
 *
 * @example
 * ```typescript
 * // Sprint field in createmeta:
 * // { type: "array", items: "string", custom: "com.pyxis.greenhopper.jira:gh-sprint", customId: 10101 }
 * // createmeta says "array of string" but JIRA REST actually expects a plain integer
 * SPECIAL_FIELD_CUSTOM_TYPES["com.pyxis.greenhopper.jira:gh-sprint"] // → "sprint"
 * ```
 */
export const SPECIAL_FIELD_CUSTOM_TYPES: Record<string, string> = {
  // Sprint: expects a plain integer sprint ID (not array, not string)
  // Detectable via schema.custom on both Server and Data Center instances
  'com.pyxis.greenhopper.jira:gh-sprint': 'sprint',
};

/**
 * Resolve a JIRA schema.custom value to a JML internal type name.
 *
 * Returns undefined if the custom key is not a known special field,
 * in which case the standard type/items logic applies.
 *
 * @param custom - The schema.custom value from JIRA field metadata
 * @returns JML type name (e.g. "sprint"), or undefined if not special
 *
 * @example
 * ```typescript
 * resolveSpecialType('com.pyxis.greenhopper.jira:gh-sprint') // → 'sprint'
 * resolveSpecialType('com.atlassian.jira:grouppicker')        // → undefined
 * resolveSpecialType(undefined)                               // → undefined
 * ```
 */
export function resolveSpecialType(custom: string | undefined): string | undefined {
  if (!custom) return undefined;
  return SPECIAL_FIELD_CUSTOM_TYPES[custom];
}

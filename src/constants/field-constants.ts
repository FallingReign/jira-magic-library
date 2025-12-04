/**
 * Shared field constants across the library (E3-S07b AC9)
 */

/**
 * Known plugin identifiers for parent/hierarchy link fields.
 * These are checked first in ParentFieldDiscovery before falling back to name patterns.
 * 
 * Plugin-based detection is more reliable than name matching because it identifies
 * the field by its implementation rather than display name (which can be customized).
 */
export const PARENT_FIELD_PLUGINS: string[] = [
  'com.pyxis.greenhopper.jira:gh-epic-link',    // GreenHopper/JIRA Software Epic Link
  'com.atlassian.jpo:jpo-custom-field-parent',  // JPO/Advanced Roadmaps Parent Link
];

/**
 * Default patterns for parent field name matching.
 * Used for:
 * 1. Schema discovery - fallback when plugin-based detection doesn't find a match
 * 2. Input recognition - universal keywords that always work for parent field references
 * 
 * The library automatically discovers the actual parent field name from JIRA
 * and uses that for input matching. These defaults are always included as fallbacks.
 * 
 * Can be extended via JMLConfig.parentFieldSynonyms
 */
export const DEFAULT_PARENT_SYNONYMS: string[] = [
  'parent',
];

/**
 * Shared field constants across the library (E3-S07b AC9)
 */

/**
 * Default synonyms for parent field names used in field resolution.
 * Can be overridden via JMLConfig.parentFieldSynonyms
 * 
 * These are used when searching for parent fields in JIRA schemas,
 * allowing users to use common names like "Parent" instead of specific
 * field names like "Epic Link" or "Parent Link".
 * 
 * Order matters for ParentFieldDiscovery scoring (earlier = higher priority).
 * Consolidated from FieldResolver's PARENT_SYNONYMS and ParentFieldDiscovery's PARENT_FIELD_PATTERNS.
 */
export const DEFAULT_PARENT_SYNONYMS: string[] = [
  'parent',
  'epic link',
  'epic',
  'parent link',
  'parent issue',
];

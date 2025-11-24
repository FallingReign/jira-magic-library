/**
 * Types representing the JPO hierarchy structure.
 *
 * Story: E3-S03 - JPO Hierarchy Discovery & Caching
 */

/**
 * A single hierarchy level returned by the JPO hierarchy endpoint.
 *
 * Levels are ordered from lowest (0) to highest (N). Each level contains the
 * issue types that belong to that level.
 */
export interface HierarchyLevel {
  id: number;
  title: string;
  issueTypeIds: string[];
}

/**
 * The entire hierarchy structure. When JPO is unavailable the structure is null
 * to signal graceful degradation to consumers.
 */
export type HierarchyStructure = HierarchyLevel[] | null;

/**
 * Hierarchy level detection for bulk operations
 * Story: E4-S13b - AC1: Hierarchy Level Detection
 * 
 * Groups issues by hierarchy depth using BFS algorithm:
 * - Level 0: Issues with no parent or external parent (roots)
 * - Level 1: Issues whose parent is at Level 0
 * - Level 2: Issues whose parent is at Level 1
 * - etc.
 * 
 * This enables parallel creation within each level while maintaining
 * parent-before-child dependency order across levels.
 */

/**
 * Represents a single hierarchy level
 */
export interface HierarchyLevel {
  /** Hierarchy depth (0 = root, 1 = children of roots, etc.) */
  depth: number;
  /** Issues at this level with their original indices */
  issues: Array<{
    /** Original index in input array (for error mapping) */
    index: number;
    /** Original record data */
    record: Record<string, unknown>;
  }>;
}

/**
 * Builds hierarchy levels from input records using BFS algorithm.
 * 
 * Groups issues by dependency depth to enable level-based parallel creation:
 * - All Level 0 issues created in parallel (1 bulk call)
 * - Then all Level 1 issues created in parallel (1 bulk call)
 * - Then all Level 2 issues created in parallel (1 bulk call)
 * - etc.
 * 
 * **Key insight**: We don't need total order (topological sort) - we need
 * partial order by level!
 * 
 * **UID Resolution:**
 * - UIDs are normalized (trimmed, converted to string)
 * - Case-sensitive matching (Task-1 ≠ task-1)
 * - Numeric UIDs supported (1, 2, 3)
 * 
 * **Parent Resolution:**
 * - Internal parent (UID in payload) → Child goes to parent's level + 1
 * - External parent (JIRA key or not in payload) → Child goes to Level 0
 * - No parent → Issue goes to Level 0
 * 
 * **Index Preservation:**
 * - Original indices preserved for error mapping
 * - If Level 1 index 5 fails, error reports index 5 (not batch position)
 * 
 * @param input - Array of input records with optional uid and Parent fields
 * @returns Array of levels sorted by depth (Level 0, Level 1, ...)
 * 
 * @example
 * ```typescript
 * const input = [
 *   { uid: 'child', Parent: 'parent' },   // Level 1
 *   { uid: 'parent' },                     // Level 0
 *   { Summary: 'No UID' }                  // Level 0 (independent)
 * ];
 * 
 * const levels = buildHierarchyLevels(input);
 * // [
 * //   { depth: 0, issues: [{ index: 1, record: {...} }, { index: 2, record: {...} }] },
 * //   { depth: 1, issues: [{ index: 0, record: {...} }] }
 * // ]
 * ```
 */
export function buildHierarchyLevels(
  input: Array<Record<string, unknown>>
): HierarchyLevel[] {
  if (input.length === 0) {
    return [];
  }

  // Normalize UID/Parent references up front so we can reason about relationships.
  const uidMap = new Map<string, number>();
  const normalizedUids: Array<string | null> = new Array(input.length).fill(null);
  const normalizedParents: Array<string | null> = new Array(input.length).fill(null);

  input.forEach((record, index) => {
    const uid = record.uid;
    if (typeof uid === 'string' || typeof uid === 'number') {
      const uidStr = String(uid).trim();
      if (uidStr !== '') {
        normalizedUids[index] = uidStr;
        uidMap.set(uidStr, index);
      }
    }

    const parent = record.Parent;
    if (typeof parent === 'string' || typeof parent === 'number') {
      const parentStr = String(parent).trim();
      if (parentStr !== '') {
        normalizedParents[index] = parentStr;
      }
    }
  });

  // Map of parent UID -> child indices (children might not have their own UID).
  const parentChildren = new Map<string, number[]>();
  normalizedParents.forEach((parentStr, index) => {
    if (!parentStr) {
      return;
    }
    if (uidMap.has(parentStr)) {
      const list = parentChildren.get(parentStr);
      if (list) {
        list.push(index);
      } else {
        parentChildren.set(parentStr, [index]);
      }
    }
  });

  const levelMap = new Map<number, number>();
  const uidToLevel = new Map<string, number>();
  const queued = new Set<string>();
  const queue: string[] = [];

  const enqueue = (uid: string, level: number): void => {
    if (!queued.has(uid)) {
      queue.push(uid);
      queued.add(uid);
    }
    uidToLevel.set(uid, level);
  };

  // Phase 1: assign obvious roots
  input.forEach((_, index) => {
    const uidStr = normalizedUids[index];
    const parentStr = normalizedParents[index];

    if (uidStr) {
      if (!parentStr || !uidMap.has(parentStr)) {
        levelMap.set(index, 0);
        enqueue(uidStr, 0);
      }
      return;
    }

    // No UID: root unless parent references an internal UID.
    if (!parentStr || !uidMap.has(parentStr)) {
      levelMap.set(index, 0);
    }
  });

  // Phase 2: BFS across the UID graph (parent-before-child ordering)
  while (queue.length > 0) {
    const uid = queue.shift();
    if (!uid) {
      continue;
    }

    const currentLevel = uidToLevel.get(uid) ?? 0;
    const children = parentChildren.get(uid);
    if (!children) {
      continue;
    }

    children.forEach((childIndex) => {
      const nextLevel = currentLevel + 1;
      const existingLevel = levelMap.get(childIndex);
      if (existingLevel === undefined || existingLevel < nextLevel) {
        levelMap.set(childIndex, nextLevel);
      }

      const childUid = normalizedUids[childIndex];
      if (childUid) {
        enqueue(childUid, nextLevel);
      }
    });
  }

  // Phase 3: default any remaining issues (e.g., dangling references) to level 0
  input.forEach((_, index) => {
    if (!levelMap.has(index)) {
      levelMap.set(index, 0);
    }
  });

  // Phase 4: Build level structure
  const levelArrays = new Map<number, Array<{ index: number; record: Record<string, unknown> }>>();

  levelMap.forEach((level, index) => {
    if (!levelArrays.has(level)) {
      levelArrays.set(level, []);
    }
    levelArrays.get(level)!.push({
      index,
      record: input[index] as Record<string, unknown>
    });
  });

  // Convert to sorted array of levels
  const levels: HierarchyLevel[] = [];
  const sortedDepths = Array.from(levelArrays.keys()).sort((a, b) => a - b);

  sortedDepths.forEach(depth => {
    const issues = levelArrays.get(depth)!;
    levels.push({
      depth,
      issues
    });
  });

  return levels;
}

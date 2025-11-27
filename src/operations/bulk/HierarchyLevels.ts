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
  // Handle empty input
  if (input.length === 0) {
    return [];
  }

  // Build UID map: normalized UID string → original index
  const uidMap = new Map<string, number>();
  input.forEach((record, index) => {
    const uid = record.uid;
    if ((typeof uid === 'string' || typeof uid === 'number') && String(uid).trim() !== '') {
      const uidStr = String(uid).trim();
      uidMap.set(uidStr, index);
    }
  });

  // Track which level each issue belongs to
  const levelMap = new Map<number, number>(); // index → level
  const uidToLevel = new Map<string, number>(); // UID → level

  // BFS queue: { uid, level }
  const queue: Array<{ uid: string; level: number }> = [];

  // Phase 1: Find roots (no parent, external parent, or no UID)
  input.forEach((record, index) => {
    const uid = record.uid;
    const parent = record.Parent;

    // Issues without UID are independent (Level 0)
    if (!(typeof uid === 'string' || typeof uid === 'number') || String(uid).trim() === '') {
      levelMap.set(index, 0);
      return;
    }

    const uidStr = String(uid).trim();

    // No parent → root
    if (!parent || (typeof parent !== 'string' && typeof parent !== 'number') || String(parent).trim() === '') {
      queue.push({ uid: uidStr, level: 0 });
      uidToLevel.set(uidStr, 0);
      levelMap.set(index, 0);
      return;
    }

    const parentStr = String(parent).trim();

    // External parent (not in uidMap) → treat as root
    if (!uidMap.has(parentStr)) {
      queue.push({ uid: uidStr, level: 0 });
      uidToLevel.set(uidStr, 0);
      levelMap.set(index, 0);
      return;
    }

    // Internal parent exists → will be processed in BFS
    // (Don't add to queue yet - wait for parent to be processed)
  });

  // Phase 2: BFS to assign children to levels
  const processed = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const { uid, level } = current;
    processed.add(uid);

    // Find children of this UID
    input.forEach((record, index) => {
      const childUid = record.uid;
      const parent = record.Parent;

      if (!(typeof childUid === 'string' || typeof childUid === 'number') || String(childUid).trim() === '') {
        return;
      }

      const childUidStr = String(childUid).trim();

      // Skip if already processed
      if (processed.has(childUidStr)) {
        return;
      }

      // Check if this record's parent is the current UID
      if (parent && (typeof parent === 'string' || typeof parent === 'number')) {
        const parentStr = String(parent).trim();

        if (parentStr === uid) {
          const childLevel = level + 1;
          queue.push({ uid: childUidStr, level: childLevel });
          uidToLevel.set(childUidStr, childLevel);
          levelMap.set(index, childLevel);
          processed.add(childUidStr);
        }
      }
    });
  }

  // Phase 3: Build level structure
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

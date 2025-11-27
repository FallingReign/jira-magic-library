/**
 * Hierarchy Preprocessor for bulk operations
 * Story: E4-S13 - AC1: Create Preprocessing Utility
 * 
 * Preprocesses bulk input to detect UIDs, group by hierarchy level,
 * and prepare for level-based batching.
 */

import { detectUids, UidDetectionResult } from './UidDetector.js';
import { buildHierarchyLevels, HierarchyLevel } from './HierarchyLevels.js';
import { ValidationError } from '../../errors/index.js';

/**
 * Result of preprocessing
 */
export interface PreprocessResult {
  /** Whether hierarchy was detected (UIDs present) */
  hasHierarchy: boolean;
  
  /** Issues grouped by hierarchy level */
  levels: HierarchyLevel[];
  
  /** UID to original index mapping (for tracking) */
  uidMap?: Record<string, number>;
}

/**
 * Strips the uid field from a record (library-internal field)
 * 
 * @param record - Original record with potential uid field
 * @returns New record without uid field
 */
function stripUidField(record: Record<string, unknown>): Record<string, unknown> {
  const { uid, ...rest } = record;
  return rest;
}

/**
 * Detects circular dependencies in parent-child relationships.
 * Uses DFS to find back edges (cycles) in the dependency graph.
 * 
 * @param records - Array of records with uid and Parent fields
 * @throws {ValidationError} If a cycle is detected, includes cycle path in message
 */
function detectCycles(records: Array<Record<string, unknown>>): void {
  // Build adjacency map: child uid -> parent uid
  const parentMap = new Map<string, string>();
  const allUids = new Set<string>();

  for (const record of records) {
    const uid = record.uid as string | undefined;
    const parent = record.Parent as string | undefined;
    
    if (uid) {
      allUids.add(uid);
      if (parent && typeof parent === 'string') {
        parentMap.set(uid, parent);
      }
    }
  }

  // DFS state: 0 = unvisited, 1 = visiting, 2 = visited
  const state = new Map<string, number>();
  
  // Track path for error message
  function findCycle(uid: string, path: string[]): string[] | null {
    const currentState = state.get(uid) ?? 0;
    
    if (currentState === 1) {
      // Found a cycle - return path from cycle start
      const cycleStart = path.indexOf(uid);
      return [...path.slice(cycleStart), uid];
    }
    
    if (currentState === 2) {
      // Already fully processed
      return null;
    }
    
    // Mark as visiting
    state.set(uid, 1);
    path.push(uid);
    
    // Follow parent edge
    const parent = parentMap.get(uid);
    if (parent && allUids.has(parent)) {
      const cycle = findCycle(parent, path);
      if (cycle) {
        return cycle;
      }
    }
    
    // Mark as visited
    state.set(uid, 2);
    path.pop();
    return null;
  }

  // Check each node
  for (const uid of allUids) {
    const cycle = findCycle(uid, []);
    if (cycle) {
      throw new ValidationError(`Circular dependency detected: ${cycle.join(' → ')}`);
    }
  }
}

/**
 * Preprocesses records for hierarchy-based bulk creation.
 * 
 * This is the main entry point for AC1. It:
 * 1. Detects UIDs in input
 * 2. Strips uid field from records (library-internal only)
 * 3. Groups issues by hierarchy level using BFS fallback
 * 4. Returns structure ready for level-based creation
 * 
 * @param records - Array of input records
 * @returns Preprocessing result with levels and UID mappings
 * @throws {ValidationError} If duplicate UIDs detected
 * 
 * @example
 * ```typescript
 * const records = [
 *   { uid: 'epic-1', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Epic' },
 *   { uid: 'task-1', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task', Parent: 'epic-1' }
 * ];
 * 
 * const result = await preprocessHierarchyRecords(records);
 * // result.hasHierarchy = true
 * // result.levels = [{ depth: 0, issues: [epic] }, { depth: 1, issues: [task] }]
 * // result.uidMap = { 'epic-1': 0, 'task-1': 1 }
 * ```
 */
export async function preprocessHierarchyRecords(
  records: Array<Record<string, unknown>>
): Promise<PreprocessResult> {
  // Handle empty input
  if (records.length === 0) {
    return {
      hasHierarchy: false,
      levels: [],
    };
  }

  // Step 1: Detect UIDs (throws ValidationError on duplicates)
  const uidResult: UidDetectionResult = detectUids(records);

  // Step 2: If no UIDs, return all records as single level (backward compatible)
  if (!uidResult.hasUids) {
    const strippedRecords = records.map(stripUidField);
    return {
      hasHierarchy: false,
      levels: [{
        depth: 0,
        issues: strippedRecords.map((record, index) => ({
          index,
          record,
        })),
      }],
    };
  }

  // Step 3: Detect cycles before building hierarchy (fail fast)
  detectCycles(records);

  // Step 4: Build hierarchy levels using BFS algorithm
  // The BFS algorithm uses uid and Parent fields to determine levels
  const levels = buildHierarchyLevels(records);

  // Step 4: Strip uid field from all records in levels
  const strippedLevels: HierarchyLevel[] = levels.map(level => ({
    depth: level.depth,
    issues: level.issues.map(issue => ({
      index: issue.index,
      record: stripUidField(issue.record),
    })),
  }));

  return {
    hasHierarchy: true,
    levels: strippedLevels,
    uidMap: uidResult.uidMap,
  };
}

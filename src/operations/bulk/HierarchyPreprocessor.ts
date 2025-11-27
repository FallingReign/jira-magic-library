/**
 * Hierarchy Preprocessor for bulk operations
 * Story: E4-S13 - AC1: Create Preprocessing Utility
 * 
 * Preprocesses bulk input to detect UIDs, group by hierarchy level,
 * and prepare for level-based batching.
 */

import { detectUids, UidDetectionResult } from './UidDetector.js';
import { buildHierarchyLevels, HierarchyLevel } from './HierarchyLevels.js';

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

  // Step 3: Build hierarchy levels using BFS algorithm
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

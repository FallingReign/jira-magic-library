/**
 * UID Detection for bulk hierarchy operations
 * Story: E4-S13 - AC1: UID Field Detection
 * 
 * Parses and validates unique identifiers from bulk input data.
 * UIDs enable parent-child references within a single bulk payload.
 */

import { ValidationError } from '../../errors/index.js';

/**
 * Result of UID detection
 */
export interface UidDetectionResult {
  /** Whether any UIDs were found in the input */
  hasUids: boolean;
  
  /** Map of UID → original row index (for parent reference resolution) */
  uidMap: Record<string, number>;
  
  /** Map of row index → UID (for manifest storage and error reporting) */
  uidsByIndex: Record<number, string>;
}

/**
 * Detects and validates UIDs from bulk input array.
 * 
 * Parses the `uid` field from each record, validates uniqueness,
 * and builds bidirectional mappings for parent resolution and error tracking.
 * 
 * @param input - Array of input records (issues to create)
 * @returns Detection result with UID mappings
 * @throws {ValidationError} If duplicate UIDs detected
 * 
 * @example
 * ```typescript
 * const input = [
 *   { uid: 'epic-1', Summary: 'Epic' },
 *   { uid: 'story-1', Summary: 'Story', Parent: 'epic-1' }
 * ];
 * 
 * const result = detectUids(input);
 * // result.uidMap = { 'epic-1': 0, 'story-1': 1 }
 * // result.uidsByIndex = { 0: 'epic-1', 1: 'story-1' }
 * ```
 */
export function detectUids(input: Array<Record<string, unknown>>): UidDetectionResult {
  const uidMap: Record<string, number> = {};
  const uidsByIndex: Record<number, string> = {};
  const duplicates: Record<string, number[]> = {};

  // Parse UID field from each record
  input.forEach((record, index) => {
    const rawUid = record.uid;

    // Skip null, undefined, or empty string
    if (rawUid === null || rawUid === undefined || rawUid === '') {
      return;
    }

    // Only allow string/number UIDs to avoid unsafe coercion
    if (typeof rawUid !== 'string' && typeof rawUid !== 'number') {
      return;
    }

    // Convert to string and trim whitespace
    const uid = String(rawUid).trim();

    // Skip empty after trimming
    if (uid === '') {
      return;
    }

    // Check for duplicates
    if (uid in uidMap) {
      const existingIndex = uidMap[uid];
      if (existingIndex !== undefined) {
        if (!duplicates[uid]) {
          duplicates[uid] = [existingIndex];
        }
        const dupArray = duplicates[uid];
        if (dupArray) {
          dupArray.push(index);
        }
      }
      return;
    }

    // Store UID mappings
    uidMap[uid] = index;
    uidsByIndex[index] = uid;
  });

  // AC1.3: Throw ValidationError on duplicate UIDs
  if (Object.keys(duplicates).length > 0) {
    const duplicateUids = Object.keys(duplicates);
    const firstDuplicate = duplicateUids[0];
    
    if (firstDuplicate && duplicates[firstDuplicate]) {
      const indices = duplicates[firstDuplicate];
      
      if (indices) {
        throw new ValidationError(
          `Duplicate UID "${firstDuplicate}" found at indices ${indices.join(' and ')}. Each UID must be unique in the input.`,
          { 
            uid: firstDuplicate, 
            indices,
            allDuplicates: duplicates
          }
        );
      }
    }
  }

  return {
    hasUids: Object.keys(uidMap).length > 0,
    uidMap,
    uidsByIndex
  };
}

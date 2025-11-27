/**
 * UID Replacement Engine for bulk hierarchy operations
 * Story: E4-S13 - AC5: UID Resolution During Creation
 * 
 * Tracks UID → Key mappings as issues are created and replaces
 * UID references with actual JIRA keys before dependent issues are created.
 */

/**
 * UID → Key mapping tracker
 */
export class UidReplacer {
  /** Map of UID → created issue key */
  private uidToKey: Map<string, string> = new Map();

  /**
   * Records a created issue's UID → Key mapping
   * 
   * @param uid - UID from input
   * @param key - Created JIRA issue key
   */
  recordCreation(uid: string, key: string): void {
    this.uidToKey.set(uid, key);
  }

  /**
   * Replaces UID references in a record with actual JIRA keys
   * 
   * Modifies the record in place, replacing Parent field if it references a UID.
   * 
   * @param record - Issue record to process
   * @returns Modified record with UIDs replaced by keys
   */
  replaceUids(record: Record<string, unknown>): Record<string, unknown> {
    const parent = record.Parent;
    
    if (!parent || typeof parent !== 'string') {
      return record;
    }

    // Check if parent is a UID that has been created
    const parentKey = this.uidToKey.get(parent);
    
    if (parentKey) {
      // Replace UID with actual key
      record.Parent = parentKey;
    }

    return record;
  }

  /**
   * Gets the current UID → Key mappings
   * 
   * @returns Map of UID to JIRA key
   */
  getUidMap(): Record<string, string> {
    const result: Record<string, string> = {};
    this.uidToKey.forEach((key, uid) => {
      result[uid] = key;
    });
    return result;
  }

  /**
   * Loads existing UID → Key mappings (for retry operations)
   * 
   * @param uidMap - Existing mappings from manifest
   */
  loadExistingMappings(uidMap: Record<string, string>): void {
    Object.entries(uidMap).forEach(([uid, key]) => {
      this.uidToKey.set(uid, key);
    });
  }

  /**
   * Checks if a UID has been created
   * 
   * @param uid - UID to check
   * @returns True if UID has been created and has a key
   */
  hasKey(uid: string): boolean {
    return this.uidToKey.has(uid);
  }

  /**
   * Gets the key for a UID
   * 
   * @param uid - UID to look up
   * @returns JIRA key if exists, undefined otherwise
   */
  getKey(uid: string): string | undefined {
    return this.uidToKey.get(uid);
  }
}

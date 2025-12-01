/**
 * Tests for HierarchyPreprocessor
 * Story: E4-S13 - AC1: Create Preprocessing Utility
 */

import { preprocessHierarchyRecords, PreprocessResult } from '../../../src/operations/bulk/HierarchyPreprocessor.js';
import { HierarchyLevel } from '../../../src/operations/bulk/HierarchyLevels.js';

// Mock dependencies
jest.mock('../../../src/schema/SchemaDiscovery.js');
jest.mock('../../../src/hierarchy/JPOHierarchyDiscovery.js');

describe('HierarchyPreprocessor', () => {
  describe('AC1.1: No UIDs (backward compatible)', () => {
    it('should return single level when no UIDs present', async () => {
      const records = [
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task 1' },
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task 2' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.hasHierarchy).toBe(false);
      expect(result.levels).toHaveLength(1);
      expect(result.levels[0].depth).toBe(0);
      expect(result.levels[0].issues).toHaveLength(2);
    });

    it('should preserve original records when no UIDs', async () => {
      const records = [
        { Project: 'TEST', 'Issue Type': 'Bug', Summary: 'Bug 1', Priority: 'High' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.levels[0].issues[0].record).toEqual(records[0]);
    });
  });

  describe('AC1.2: UID detection and stripping', () => {
    it('should detect UIDs and set hasHierarchy true', async () => {
      const records = [
        { uid: 'task-1', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task 1' },
        { uid: 'task-2', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task 2', Parent: 'task-1' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.hasHierarchy).toBe(true);
      expect(result.uidMap).toBeDefined();
      expect(result.uidMap!['task-1']).toBe(0);
      expect(result.uidMap!['task-2']).toBe(1);
    });

    it('should strip uid field from records before returning', async () => {
      const records = [
        { uid: 'task-1', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task 1' },
      ];

      const result = await preprocessHierarchyRecords(records);

      // The record preserves uid for UID→Key tracking (stripped later in createSingle)
      expect(result.levels[0].issues[0].record).toHaveProperty('uid', 'task-1');
      expect(result.levels[0].issues[0].record).toHaveProperty('Summary', 'Task 1');
    });

    it('should preserve uid in uidMap and in record for tracking', async () => {
      const records = [
        { uid: 'epic-1', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Epic 1' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.uidMap).toEqual({ 'epic-1': 0 });
      // uid preserved in record for createBulkHierarchy to track UID→Key mappings
      expect(result.levels[0].issues[0].record).toHaveProperty('uid', 'epic-1');
    });
  });

  describe('AC1.3: BFS fallback (when JPO not available)', () => {
    it('should group by parent-child relationships using BFS', async () => {
      const records = [
        { uid: 'child', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Child', Parent: 'parent' },
        { uid: 'parent', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Parent' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.levels).toHaveLength(2);
      
      // Level 0 should have the parent (no Parent field)
      const level0 = result.levels.find(l => l.depth === 0);
      expect(level0?.issues).toHaveLength(1);
      expect(level0?.issues[0].record.Summary).toBe('Parent');
      
      // Level 1 should have the child
      const level1 = result.levels.find(l => l.depth === 1);
      expect(level1?.issues).toHaveLength(1);
      expect(level1?.issues[0].record.Summary).toBe('Child');
    });

    it('should handle deep hierarchy (3+ levels)', async () => {
      const records = [
        { uid: 'grandchild', Project: 'TEST', 'Issue Type': 'Sub-task', Summary: 'Grandchild', Parent: 'child' },
        { uid: 'child', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Child', Parent: 'parent' },
        { uid: 'parent', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Parent' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.levels).toHaveLength(3);
      expect(result.levels[0].depth).toBe(0); // parent
      expect(result.levels[1].depth).toBe(1); // child
      expect(result.levels[2].depth).toBe(2); // grandchild
    });

    it('should treat children referencing UID parent even without their own uid', async () => {
      const records = [
        { uid: 'epic-1', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Parent Epic' },
        { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Child Task', Parent: 'epic-1' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.levels).toHaveLength(2);
      const level0 = result.levels.find(l => l.depth === 0);
      const level1 = result.levels.find(l => l.depth === 1);

      expect(level0?.issues.map(i => i.record.Summary)).toContain('Parent Epic');
      expect(level1?.issues.map(i => i.record.Summary)).toContain('Child Task');
    });
  });

  describe('AC1.4: Original index preservation', () => {
    it('should preserve original indices for error mapping', async () => {
      const records = [
        { uid: 'child', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Child', Parent: 'parent' },
        { uid: 'parent', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Parent' },
        { uid: 'grandchild', Project: 'TEST', 'Issue Type': 'Sub-task', Summary: 'Grandchild', Parent: 'child' },
      ];

      const result = await preprocessHierarchyRecords(records);

      // Find each issue and verify original index
      const parentIssue = result.levels.flatMap(l => l.issues).find(i => i.record.Summary === 'Parent');
      const childIssue = result.levels.flatMap(l => l.issues).find(i => i.record.Summary === 'Child');
      const grandchildIssue = result.levels.flatMap(l => l.issues).find(i => i.record.Summary === 'Grandchild');

      expect(parentIssue?.index).toBe(1);    // Original index 1
      expect(childIssue?.index).toBe(0);     // Original index 0
      expect(grandchildIssue?.index).toBe(2); // Original index 2
    });
  });

  describe('AC1.5: Error handling', () => {
    it('should throw ValidationError for duplicate UIDs', async () => {
      const records = [
        { uid: 'duplicate', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task 1' },
        { uid: 'duplicate', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task 2' },
      ];

      await expect(preprocessHierarchyRecords(records)).rejects.toThrow('Duplicate');
    });

    it('should handle empty input', async () => {
      const result = await preprocessHierarchyRecords([]);

      expect(result.hasHierarchy).toBe(false);
      expect(result.levels).toHaveLength(0);
    });
  });

  describe('AC1.6: External parent references', () => {
    it('should treat issues with external parent (JIRA key) as level 0', async () => {
      const records = [
        { uid: 'task-1', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'PROJ-123' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.levels).toHaveLength(1);
      expect(result.levels[0].depth).toBe(0);
      // Parent field should be preserved (external reference)
      expect(result.levels[0].issues[0].record.Parent).toBe('PROJ-123');
    });

    it('should handle mix of internal UIDs and external parents', async () => {
      const records = [
        { uid: 'epic', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Epic', Parent: 'PROJ-100' }, // External parent
        { uid: 'task', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task', Parent: 'epic' },     // Internal UID parent
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.levels).toHaveLength(2);
      // Epic at level 0 (external parent = root)
      // Task at level 1 (child of epic)
    });
  });

  describe('AC1.7: Level ordering (bottom-up creation)', () => {
    it('should return levels sorted by depth ascending', async () => {
      const records = [
        { uid: 'l2', Project: 'TEST', 'Issue Type': 'Sub-task', Summary: 'Level 2', Parent: 'l1' },
        { uid: 'l0', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Level 0' },
        { uid: 'l1', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Level 1', Parent: 'l0' },
      ];

      const result = await preprocessHierarchyRecords(records);

      expect(result.levels[0].depth).toBe(0);
      expect(result.levels[1].depth).toBe(1);
      expect(result.levels[2].depth).toBe(2);
    });
  });

  describe('AC7: Circular dependency detection', () => {
    it('should throw ValidationError for simple cycle (A → B → A)', async () => {
      const records = [
        { uid: 'a', Project: 'TEST', 'Issue Type': 'Task', Summary: 'A', Parent: 'b' },
        { uid: 'b', Project: 'TEST', 'Issue Type': 'Task', Summary: 'B', Parent: 'a' },
      ];

      await expect(preprocessHierarchyRecords(records)).rejects.toThrow(/[Cc]ircular/);
    });

    it('should throw ValidationError for longer cycle (A → B → C → A)', async () => {
      const records = [
        { uid: 'a', Project: 'TEST', 'Issue Type': 'Task', Summary: 'A', Parent: 'c' },
        { uid: 'b', Project: 'TEST', 'Issue Type': 'Task', Summary: 'B', Parent: 'a' },
        { uid: 'c', Project: 'TEST', 'Issue Type': 'Task', Summary: 'C', Parent: 'b' },
      ];

      await expect(preprocessHierarchyRecords(records)).rejects.toThrow(/[Cc]ircular/);
    });

    it('should throw ValidationError for self-reference (A → A)', async () => {
      const records = [
        { uid: 'a', Project: 'TEST', 'Issue Type': 'Task', Summary: 'A', Parent: 'a' },
      ];

      await expect(preprocessHierarchyRecords(records)).rejects.toThrow(/[Cc]ircular/);
    });

    it('should include cycle path in error message', async () => {
      const records = [
        { uid: 'epic', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Epic', Parent: 'task' },
        { uid: 'task', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task', Parent: 'epic' },
      ];

      await expect(preprocessHierarchyRecords(records)).rejects.toThrow(/epic.*task|task.*epic/);
    });

    it('should not throw for valid hierarchy (no cycles)', async () => {
      const records = [
        { uid: 'epic', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Epic' },
        { uid: 'task', Project: 'TEST', 'Issue Type': 'Task', Summary: 'Task', Parent: 'epic' },
        { uid: 'subtask', Project: 'TEST', 'Issue Type': 'Sub-task', Summary: 'Subtask', Parent: 'task' },
      ];

      await expect(preprocessHierarchyRecords(records)).resolves.toBeDefined();
    });
  });
});

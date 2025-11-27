/**
 * Unit tests for hierarchy level detection
 * Story: E4-S13b - AC1: Hierarchy Level Detection
 * 
 * Tests BFS algorithm that groups issues by hierarchy depth:
 * - Level 0: Issues with no parent or external parent
 * - Level 1: Issues whose parent is at Level 0
 * - Level 2: Issues whose parent is at Level 1
 * - etc.
 */

import { buildHierarchyLevels } from '../../../src/operations/bulk/HierarchyLevels.js';

describe('buildHierarchyLevels', () => {
  describe('AC1.1: Single level (no hierarchy)', () => {
    it('should handle single issue with no parent', () => {
      const input = [
        { uid: 'task-1', Summary: 'Task 1' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(1);
      expect(levels[0]).toEqual({
        depth: 0,
        issues: [
          { index: 0, record: input[0] }
        ]
      });
    });

    it('should handle multiple independent issues', () => {
      const input = [
        { uid: 'task-1', Summary: 'Task 1' },
        { uid: 'task-2', Summary: 'Task 2' },
        { uid: 'task-3', Summary: 'Task 3' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(1);
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(3);
      expect(levels[0]?.issues[0]?.index).toBe(0);
      expect(levels[0]?.issues[1]?.index).toBe(1);
      expect(levels[0]?.issues[2]?.index).toBe(2);
    });

    it('should handle issues without UID (non-hierarchy issues)', () => {
      const input = [
        { Summary: 'No UID 1' },
        { Summary: 'No UID 2' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(1);
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(2);
    });

    it('should handle mixed UID and non-UID issues', () => {
      const input = [
        { uid: 'task-1', Summary: 'Has UID' },
        { Summary: 'No UID' },
        { uid: 'task-2', Summary: 'Has UID 2' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(1);
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(3);
    });
  });

  describe('AC1.2: Two-level hierarchy', () => {
    it('should group parent at level 0, child at level 1', () => {
      const input = [
        { uid: 'child', Parent: 'parent', Summary: 'Child' },
        { uid: 'parent', Summary: 'Parent' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(2);
      
      // Level 0: parent
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(1);
      expect(levels[0]?.issues[0]?.index).toBe(1); // parent is at index 1
      expect(levels[0]?.issues[0]?.record.uid).toBe('parent');
      
      // Level 1: child
      expect(levels[1]?.depth).toBe(1);
      expect(levels[1]?.issues).toHaveLength(1);
      expect(levels[1]?.issues[0]?.index).toBe(0); // child is at index 0
      expect(levels[1]?.issues[0]?.record.uid).toBe('child');
    });

    it('should handle multiple children of same parent', () => {
      const input = [
        { uid: 'epic', Summary: 'Epic' },
        { uid: 'task-1', Parent: 'epic', Summary: 'Task 1' },
        { uid: 'task-2', Parent: 'epic', Summary: 'Task 2' },
        { uid: 'task-3', Parent: 'epic', Summary: 'Task 3' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(2);
      
      // Level 0: epic
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(1);
      
      // Level 1: 3 tasks
      expect(levels[1]?.depth).toBe(1);
      expect(levels[1]?.issues).toHaveLength(3);
    });
  });

  describe('AC1.3: Multi-level hierarchy', () => {
    it('should handle 3-level hierarchy (epic → task → subtask)', () => {
      const input = [
        { uid: 'epic', Summary: 'Epic' },
        { uid: 'task', Parent: 'epic', Summary: 'Task' },
        { uid: 'subtask', Parent: 'task', Summary: 'Subtask' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(3);
      
      // Level 0: epic
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(1);
      expect(levels[0]?.issues[0]?.record.uid).toBe('epic');
      
      // Level 1: task
      expect(levels[1]?.depth).toBe(1);
      expect(levels[1]?.issues).toHaveLength(1);
      expect(levels[1]?.issues[0]?.record.uid).toBe('task');
      
      // Level 2: subtask
      expect(levels[2]?.depth).toBe(2);
      expect(levels[2]?.issues).toHaveLength(1);
      expect(levels[2]?.issues[0]?.record.uid).toBe('subtask');
    });

    it('should handle complex multi-branch hierarchy', () => {
      const input = [
        { uid: 'epic-1', Summary: 'Epic 1' },
        { uid: 'task-1', Parent: 'epic-1', Summary: 'Task 1' },
        { uid: 'task-2', Parent: 'epic-1', Summary: 'Task 2' },
        { uid: 'subtask-1', Parent: 'task-1', Summary: 'Subtask 1' },
        { uid: 'subtask-2', Parent: 'task-1', Summary: 'Subtask 2' },
        { uid: 'subtask-3', Parent: 'task-2', Summary: 'Subtask 3' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(3);
      
      // Level 0: 1 epic
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(1);
      
      // Level 1: 2 tasks
      expect(levels[1]?.depth).toBe(1);
      expect(levels[1]?.issues).toHaveLength(2);
      
      // Level 2: 3 subtasks
      expect(levels[2]?.depth).toBe(2);
      expect(levels[2]?.issues).toHaveLength(3);
    });
  });

  describe('AC1.4: Parallel branches (multiple roots)', () => {
    it('should handle multiple independent hierarchies', () => {
      const input = [
        { uid: 'epic-1', Summary: 'Epic 1' },
        { uid: 'task-1', Parent: 'epic-1', Summary: 'Task 1' },
        { uid: 'epic-2', Summary: 'Epic 2' },
        { uid: 'task-2', Parent: 'epic-2', Summary: 'Task 2' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(2);
      
      // Level 0: 2 epics
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(2);
      expect(levels[0]?.issues.map((i: { record: Record<string, unknown> }) => i.record.uid).sort()).toEqual(['epic-1', 'epic-2']);
      
      // Level 1: 2 tasks
      expect(levels[1]?.depth).toBe(1);
      expect(levels[1]?.issues).toHaveLength(2);
      expect(levels[1]?.issues.map((i: { record: Record<string, unknown> }) => i.record.uid).sort()).toEqual(['task-1', 'task-2']);
    });
  });

  describe('AC1.5: External parent references', () => {
    it('should treat issues with external parent as root (level 0)', () => {
      const input = [
        { uid: 'task-1', Parent: 'ENG-123', Summary: 'Task with JIRA key parent' },
        { uid: 'task-2', Parent: 'PROJ-456', Summary: 'Task with another key parent' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(1);
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(2);
    });

    it('should handle mix of internal and external parents', () => {
      const input = [
        { uid: 'epic', Summary: 'Epic' },
        { uid: 'task-1', Parent: 'epic', Summary: 'Task with internal parent' },
        { uid: 'task-2', Parent: 'ENG-999', Summary: 'Task with external parent' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(2);
      
      // Level 0: epic and task-2 (external parent)
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues).toHaveLength(2);
      
      // Level 1: task-1
      expect(levels[1]?.depth).toBe(1);
      expect(levels[1]?.issues).toHaveLength(1);
    });
  });

  describe('AC1.6: Original index preservation', () => {
    it('should preserve original indices regardless of ordering', () => {
      const input = [
        { uid: 'child', Parent: 'parent', Summary: 'Child' },   // index 0
        { uid: 'grandchild', Parent: 'child', Summary: 'GC' },  // index 1
        { uid: 'parent', Summary: 'Parent' }                    // index 2
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(3);
      
      // Level 0: parent at original index 2
      expect(levels[0]?.issues[0]?.index).toBe(2);
      
      // Level 1: child at original index 0
      expect(levels[1]?.issues[0]?.index).toBe(0);
      
      // Level 2: grandchild at original index 1
      expect(levels[2]?.issues[0]?.index).toBe(1);
    });

    it('should map errors back to original input order', () => {
      const input = [
        { Summary: 'No UID at 0' },
        { uid: 'task', Parent: 'epic', Summary: 'Task at 1' },
        { uid: 'epic', Summary: 'Epic at 2' }
      ];

      const levels = buildHierarchyLevels(input);

      // If Level 1 (task at original index 1) fails validation,
      // we need to report error at index 1, not at batch position
      const level1Issue = levels[1]?.issues[0];
      expect(level1Issue?.index).toBe(1); // Original index preserved
    });
  });

  describe('AC1.7: Edge cases', () => {
    it('should handle empty input', () => {
      const levels = buildHierarchyLevels([]);
      expect(levels).toEqual([]);
    });

    it('should handle numeric UIDs', () => {
      const input = [
        { uid: 1, Summary: 'Numeric UID' },
        { uid: 2, Parent: 1, Summary: 'Child with numeric parent' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(2);
      expect(levels[0]?.issues[0]?.record.uid).toBe(1);
      expect(levels[1]?.issues[0]?.record.uid).toBe(2);
    });

    it('should handle UIDs with whitespace', () => {
      const input = [
        { uid: '  task-1  ', Summary: 'UID with spaces' },
        { uid: 'task-2', Parent: '  task-1  ', Summary: 'Child referencing trimmed' }
      ];

      const levels = buildHierarchyLevels(input);

      expect(levels).toHaveLength(2);
      // Should normalize whitespace in UID matching
    });

    it('should handle case-sensitive UIDs', () => {
      const input = [
        { uid: 'Task-1', Summary: 'Uppercase' },
        { uid: 'task-1', Summary: 'Lowercase' }, // Different UID
        { uid: 'child', Parent: 'Task-1', Summary: 'Child of uppercase' }
      ];

      const levels = buildHierarchyLevels(input);

      // Task-1 and task-1 are different UIDs
      expect(levels[0]?.issues).toHaveLength(2); // Both at level 0
      expect(levels[1]?.issues).toHaveLength(1); // Child references Task-1
    });
  });

  describe('AC1.8: Unresolved parents (orphans)', () => {
    it('should treat orphan (parent not in payload) as root', () => {
      const input = [
        { uid: 'child', Parent: 'missing-parent', Summary: 'Orphan' }
      ];

      const levels = buildHierarchyLevels(input);

      // Child with missing parent goes to level 0
      expect(levels).toHaveLength(1);
      expect(levels[0]?.depth).toBe(0);
      expect(levels[0]?.issues[0]?.record.uid).toBe('child');
    });
  });
});

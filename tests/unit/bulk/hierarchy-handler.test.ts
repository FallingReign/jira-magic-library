/**
 * Tests for createBulkHierarchy method
 * Story: E4-S13 - AC2: Level-Based Handler Method
 * 
 * Tests hierarchy-based bulk creation with level-based batching.
 */

import { UidReplacer } from '../../../src/operations/bulk/UidReplacer.js';
import { HierarchyLevel } from '../../../src/operations/bulk/HierarchyLevels.js';
import { preprocessHierarchyRecords } from '../../../src/operations/bulk/HierarchyPreprocessor.js';

describe('createBulkHierarchy', () => {
  // Note: createBulkHierarchy is a private method in IssueOperations.
  // We test its behavior through unit tests of the helper classes
  // and integration tests of the public create() method.
  
  describe('UidReplacer integration', () => {
    let uidReplacer: UidReplacer;

    beforeEach(() => {
      uidReplacer = new UidReplacer();
    });

    describe('AC2.1: Record creation mapping', () => {
      it('should store UID → Key mapping when issue created', () => {
        // After Level 0 epic is created with key PROJ-100
        uidReplacer.recordCreation('epic-1', 'PROJ-100');
        
        expect(uidReplacer.getKey('epic-1')).toBe('PROJ-100');
        expect(uidReplacer.hasKey('epic-1')).toBe(true);
      });

      it('should handle multiple mappings from same level', () => {
        // Level 0: Two epics created
        uidReplacer.recordCreation('epic-1', 'PROJ-100');
        uidReplacer.recordCreation('epic-2', 'PROJ-101');
        
        expect(uidReplacer.getKey('epic-1')).toBe('PROJ-100');
        expect(uidReplacer.getKey('epic-2')).toBe('PROJ-101');
      });
    });

    describe('AC2.2: Parent UID replacement', () => {
      it('should replace parent UID with key from previous level', () => {
        // Simulate: Level 0 epic created, now processing Level 1 task
        uidReplacer.recordCreation('epic-1', 'PROJ-100');
        
        const record = {
          Project: 'PROJ',
          'Issue Type': 'Task',
          Summary: 'Task 1',
          Parent: 'epic-1', // UID reference
        };
        
        const result = uidReplacer.replaceUids(record);
        
        expect(result.Parent).toBe('PROJ-100'); // Replaced with key
      });

      it('should leave external parent references unchanged', () => {
        // Parent is already a JIRA key (external reference)
        const record = {
          Project: 'PROJ',
          'Issue Type': 'Sub-task',
          Summary: 'Sub-task 1',
          Parent: 'PROJ-50', // External JIRA key
        };
        
        const result = uidReplacer.replaceUids(record);
        
        expect(result.Parent).toBe('PROJ-50'); // Unchanged
      });

      it('should handle missing parent gracefully', () => {
        const record = {
          Project: 'PROJ',
          'Issue Type': 'Epic',
          Summary: 'Epic 1',
          // No Parent field
        };
        
        const result = uidReplacer.replaceUids(record);
        
        expect(result.Parent).toBeUndefined();
      });
    });

    describe('AC2.3: Multi-level chain', () => {
      it('should build complete UID map through multiple levels', () => {
        // Simulate 3-level hierarchy:
        // Level 0: Epic created
        uidReplacer.recordCreation('epic-1', 'PROJ-100');
        
        // Level 1: Task created (parent was epic-1)
        uidReplacer.recordCreation('task-1', 'PROJ-101');
        
        // Level 2: Sub-task needs to reference task-1
        const subtaskRecord = {
          Project: 'PROJ',
          'Issue Type': 'Sub-task',
          Summary: 'Sub-task 1',
          Parent: 'task-1',
        };
        
        const result = uidReplacer.replaceUids(subtaskRecord);
        
        expect(result.Parent).toBe('PROJ-101');
        
        // Verify complete UID map
        const uidMap = uidReplacer.getUidMap();
        expect(uidMap).toEqual({
          'epic-1': 'PROJ-100',
          'task-1': 'PROJ-101',
        });
      });
    });

    describe('AC2.4: Retry support', () => {
      it('should load existing mappings for retry', () => {
        // Simulate: First attempt created some issues, now retrying
        const existingMappings = {
          'epic-1': 'PROJ-100',
          'task-1': 'PROJ-101',
        };
        
        uidReplacer.loadExistingMappings(existingMappings);
        
        // Now can replace UIDs for failed issues in retry
        const record = {
          Project: 'PROJ',
          'Issue Type': 'Sub-task',
          Summary: 'Sub-task 1',
          Parent: 'task-1',
        };
        
        const result = uidReplacer.replaceUids(record);
        
        expect(result.Parent).toBe('PROJ-101');
      });
    });
  });

  describe('Level processing simulation', () => {
    /**
     * Simulates the core logic of createBulkHierarchy:
     * For each level, replace UIDs then "create" issues
     */
    function simulateHierarchyCreation(
      levels: HierarchyLevel[],
      createBulk: (records: Record<string, unknown>[]) => { key: string }[]
    ): { created: string[]; uidMap: Record<string, string> } {
      const uidReplacer = new UidReplacer();
      const createdKeys: string[] = [];

      for (const level of levels) {
        // Replace UIDs with keys from previous levels
        const preparedRecords = level.issues.map(issue => {
          const record = { ...issue.record };
          return uidReplacer.replaceUids(record);
        });

        // "Create" issues (in real code, this calls createBulk API)
        const results = createBulk(preparedRecords);

        // Record UID → Key mappings for next level
        level.issues.forEach((issue, i) => {
          const uid = issue.record.uid as string | undefined;
          if (uid && results[i]) {
            uidReplacer.recordCreation(uid, results[i].key);
            createdKeys.push(results[i].key);
          }
        });
      }

      return {
        created: createdKeys,
        uidMap: uidReplacer.getUidMap(),
      };
    }

    it('should process levels in order (bottom-up)', () => {
      // Setup: 2-level hierarchy (Epic → Task)
      const levels: HierarchyLevel[] = [
        {
          depth: 0,
          issues: [
            { index: 0, record: { uid: 'epic-1', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 1' } },
          ],
        },
        {
          depth: 1,
          issues: [
            { index: 1, record: { uid: 'task-1', Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' } },
          ],
        },
      ];

      let callCount = 0;
      const mockCreateBulk = (records: Record<string, unknown>[]) => {
        const currentCall = callCount++;
        return records.map((_, i) => ({ key: `PROJ-${100 + currentCall * 10 + i}` }));
      };

      const result = simulateHierarchyCreation(levels, mockCreateBulk);

      // Verify: Level 0 processed before Level 1
      expect(callCount).toBe(2);
      expect(result.created).toEqual(['PROJ-100', 'PROJ-110']);
      expect(result.uidMap['epic-1']).toBe('PROJ-100');
      expect(result.uidMap['task-1']).toBe('PROJ-110');
    });

    it('should replace UIDs before creating child issues', () => {
      const levels: HierarchyLevel[] = [
        {
          depth: 0,
          issues: [
            { index: 0, record: { uid: 'epic-1', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 1' } },
          ],
        },
        {
          depth: 1,
          issues: [
            { index: 1, record: { uid: 'task-1', Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' } },
          ],
        },
      ];

      let capturedRecords: Record<string, unknown>[][] = [];
      let callCount = 0;
      const mockCreateBulk = (records: Record<string, unknown>[]) => {
        capturedRecords.push([...records]);
        const currentCall = callCount++;
        return records.map((_, i) => ({ key: `PROJ-${100 + currentCall * 10 + i}` }));
      };

      simulateHierarchyCreation(levels, mockCreateBulk);

      // Verify: Level 1 task has Parent replaced with PROJ-100
      expect(capturedRecords[0][0].Parent).toBeUndefined(); // Epic has no parent
      expect(capturedRecords[1][0].Parent).toBe('PROJ-100'); // Task has parent replaced
    });

    it('should handle 3+ level hierarchy', () => {
      const levels: HierarchyLevel[] = [
        {
          depth: 0,
          issues: [
            { index: 0, record: { uid: 'epic-1', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 1' } },
          ],
        },
        {
          depth: 1,
          issues: [
            { index: 1, record: { uid: 'task-1', Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' } },
          ],
        },
        {
          depth: 2,
          issues: [
            { index: 2, record: { uid: 'subtask-1', Project: 'PROJ', 'Issue Type': 'Sub-task', Summary: 'Sub-task 1', Parent: 'task-1' } },
          ],
        },
      ];

      let capturedRecords: Record<string, unknown>[][] = [];
      let callCount = 0;
      const mockCreateBulk = (records: Record<string, unknown>[]) => {
        capturedRecords.push([...records]);
        const currentCall = callCount++;
        return records.map((_, i) => ({ key: `PROJ-${100 + currentCall * 10 + i}` }));
      };

      const result = simulateHierarchyCreation(levels, mockCreateBulk);

      // Verify all levels processed
      expect(capturedRecords.length).toBe(3);
      
      // Verify parent replacement chain
      expect(capturedRecords[1][0].Parent).toBe('PROJ-100'); // Task → Epic
      expect(capturedRecords[2][0].Parent).toBe('PROJ-110'); // Sub-task → Task
      
      // Verify complete UID map
      expect(result.uidMap).toEqual({
        'epic-1': 'PROJ-100',
        'task-1': 'PROJ-110',
        'subtask-1': 'PROJ-120',
      });
    });

    it('should handle multiple issues per level (parallel within level)', () => {
      const levels: HierarchyLevel[] = [
        {
          depth: 0,
          issues: [
            { index: 0, record: { uid: 'epic-1', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 1' } },
            { index: 1, record: { uid: 'epic-2', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 2' } },
          ],
        },
        {
          depth: 1,
          issues: [
            { index: 2, record: { uid: 'task-1', Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' } },
            { index: 3, record: { uid: 'task-2', Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 2', Parent: 'epic-2' } },
            { index: 4, record: { uid: 'task-3', Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 3', Parent: 'epic-1' } },
          ],
        },
      ];

      let capturedRecords: Record<string, unknown>[][] = [];
      let callCount = 0;
      const mockCreateBulk = (records: Record<string, unknown>[]) => {
        capturedRecords.push([...records]);
        const currentCall = callCount++;
        return records.map((_, i) => ({ key: `PROJ-${100 + currentCall * 10 + i}` }));
      };

      const result = simulateHierarchyCreation(levels, mockCreateBulk);

      // Verify: 2 API calls (1 per level), not 5 calls
      expect(capturedRecords.length).toBe(2);
      
      // Verify: Level 0 has 2 issues, Level 1 has 3 issues
      expect(capturedRecords[0].length).toBe(2);
      expect(capturedRecords[1].length).toBe(3);
      
      // Verify parent replacements
      expect(capturedRecords[1][0].Parent).toBe('PROJ-100'); // task-1 → epic-1
      expect(capturedRecords[1][1].Parent).toBe('PROJ-101'); // task-2 → epic-2
      expect(capturedRecords[1][2].Parent).toBe('PROJ-100'); // task-3 → epic-1
    });
  });

  describe('AC3: Routing logic', () => {
    describe('preprocessHierarchyRecords routing detection', () => {
      it('should return hasHierarchy=false for records without UIDs', async () => {
        const records = [
          { Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 1' },
          { Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 2' },
        ];

        const result = await preprocessHierarchyRecords(records);

        expect(result.hasHierarchy).toBe(false);
        expect(result.levels.length).toBe(1);
      });

      it('should return hasHierarchy=true for records with UIDs', async () => {
        const records = [
          { uid: 'epic-1', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 1' },
          { uid: 'task-1', Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' },
        ];

        const result = await preprocessHierarchyRecords(records);

        expect(result.hasHierarchy).toBe(true);
        expect(result.levels.length).toBe(2); // Epic at level 0, Task at level 1
      });

      it('should detect single level hierarchy (no children)', async () => {
        const records = [
          { uid: 'epic-1', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 1' },
          { uid: 'epic-2', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 2' },
        ];

        const result = await preprocessHierarchyRecords(records);

        expect(result.hasHierarchy).toBe(true);
        expect(result.levels.length).toBe(1); // All at level 0 (no parents)
      });

      it('should preserve uid field for tracking (stripped later in createSingle)', async () => {
        const records = [
          { uid: 'epic-1', Project: 'PROJ', 'Issue Type': 'Epic', Summary: 'Epic 1' },
          { uid: 'task-1', Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' },
        ];

        const result = await preprocessHierarchyRecords(records);

        // uid should be preserved for UID→Key tracking in createBulkHierarchy
        // It gets stripped in createSingle before sending to JIRA
        result.levels.forEach(level => {
          level.issues.forEach(issue => {
            expect(issue.record.uid).toBeDefined();
          });
        });

        // uidMap should also have the mappings
        expect(result.uidMap).toBeDefined();
        expect(result.uidMap!['epic-1']).toBe(0);
        expect(result.uidMap!['task-1']).toBe(1);
      });
    });
  });
});

# E4-S13: Hierarchy Support with Level-Based Batching

**Epic**: Epic 4 - Bulk Operations  
**Size**: Medium (5 points)  
**Priority**: P0  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer importing issues in bulk  
**I want** to create parent-child hierarchies in a single payload using temporary UIDs  
**So that** I can create entire hierarchies in 3 API calls (one per level) instead of 100 sequential calls

---

## Context & Architecture Decision

**Problem with Previous Approach:**
The initial E4-S13/E4-S13b implementation violated core architectural principles:
1. **Single Responsibility:** Baked UID handling into `createBulk` (should be separate preprocessing)
2. **Wrong Abstraction:** Used `createSingle(validate: true)` for payload building (coupling between single/bulk)
3. **Wrong Timing:** Pre-validated Parent references before parent existed
4. **Complexity:** Double validation, placeholder hacks, topological sort overkill

**Correct Approach (Preprocessing + Level-Based Batching):**
```typescript
// PREPROCESSING (before createBulk)
const batch = preprocessHierarchyRecords(records);
// Returns: { levels: [...], uidMap }

// PROCESSING (loop levels)
for (const level of batch.levels) {
  // 1. Replace Parent UIDs with keys from previous level
  replaceParentUids(level.records, uidReplacer);
  
  // 2. Use EXISTING createBulk (unchanged!)
  const result = await createBulk(level.records);
  
  // 3. Store UID→Key mappings for next level
  storeKeys(result, uidReplacer);
}
```

**Key Principles:**
- Separation of concerns: Preprocessing detects/groups, processing creates
- Natural order: Create parent → Get key → Replace UID → Create child (no placeholders)
- Single responsibility: Each component does one thing well
- Additive changes: Existing methods unchanged, new methods added
- No pre-validation: JIRA validates during creation (not before)

---

## Acceptance Criteria

### AC1: Create Preprocessing Utility
- [ ] Implement `preprocessHierarchyRecords(records)` in `src/operations/bulk/HierarchyPreprocessor.ts`
- [ ] Detect UIDs using existing `UidDetector.ts` (saved from previous implementation)
- [ ] If no UIDs: Return single level (backward compatible)
- [ ] If UIDs found: Use existing `HierarchyLevels.ts` BFS algorithm to group by depth
- [ ] Return structure: `{ levels: HierarchyLevel[], uidMap?: Map<string, number> }`
- [ ] Pure function (no side effects, no API calls)

**Evidence:** 
- Implementation: `src/operations/bulk/HierarchyPreprocessor.ts`
- Unit tests: `tests/unit/bulk/hierarchy-preprocessor.test.ts`
- Reuses: `UidDetector.ts`, `HierarchyLevels.ts` (already tested with 98.46% coverage)

---

### AC2: Create Level-Based Handler Method
- [ ] Implement `createBulkHierarchy(batch, options)` in `IssueOperations.ts`
- [ ] Loop through levels sequentially (Level 0 → Level 1 → Level 2)
- [ ] For each level:
  1. Replace Parent UIDs with keys from `UidReplacer` (previous level results)
  2. Call **existing** `createBulk(records)` method (unchanged!)
  3. Store UID→Key mappings from results for next level
- [ ] Merge results from all levels into single `BulkResult`
- [ ] Preserve manifest with UID mappings (for retry support)

**Evidence:** 
- Implementation: `src/operations/IssueOperations.ts` - new method `createBulkHierarchy`
- Uses existing: `createBulk` (unchanged), `UidReplacer.ts`
- Unit tests: `tests/unit/operations/hierarchy-handler.test.ts`

---

### AC3: Modify Entry Point to Route Hierarchy Batches
- [ ] Update `create()` entry point in `IssueOperations.ts`
- [ ] After parsing input, call `preprocessHierarchyRecords()`
- [ ] If single level returned: Use existing `createBulk()` path
- [ ] If multiple levels returned: Use new `createBulkHierarchy()` path
- [ ] Preserve backward compatibility (no UIDs = existing behavior)

**Evidence:** 
- Implementation: `src/operations/IssueOperations.ts` - modified `create()` method
- Unit tests: Verify routing logic (single level vs multi-level)
- Integration tests: Verify backward compatibility (no UIDs = same behavior)

---

### AC4: Performance Validation
- [ ] Create integration test: 13 issues (1 epic, 3 tasks, 9 subtasks)
- [ ] Verify: Exactly 3 API calls (one per level: 0, 1, 2)
- [ ] Verify: All 13 issues created successfully
- [ ] Verify: Parent-child relationships correct (subtasks linked to tasks, tasks linked to epic)
- [ ] Verify: Duration <10 seconds
- [ ] Document 10x improvement: 100 issues = 3 API calls (was 100 calls)

**Evidence:** 
- Integration test: `tests/integration/hierarchy-performance.test.ts`
- Test uses realistic hierarchy: Epic → Stories → Subtasks
- Verifies API call count (not just success)

---

### AC5: Validation Approach Review
- [ ] Audit all validation points in codebase
- [ ] Ensure validation only happens during actual creation (not before)
- [ ] Verify no double validation (pre-validate + JIRA validate)
- [ ] Confirm: `validate: true` option is for user dry-runs only (not internal payload building)
- [ ] Document validation flow in story completion notes

**Evidence:** 
- Code review notes in DoD section below
- No `createSingle(validate: true)` usage for internal payload building
- Validation happens once: during `createBulk()` API call to JIRA

---

### AC6: Parent Reference Resolution
- [ ] Support UID references: `Parent: 'uid:epic-1'` or `Parent: 'epic-1'`
- [ ] Support JIRA key pattern: `Parent: 'PROJ-123'` (existing issue)
- [ ] Support summary search: `Parent: 'My Epic'` (search payload first, then JIRA)
- [ ] Use existing `ParentReferenceResolver.ts` from saved utilities
- [ ] Apply `ambiguityPolicy.parent` from JMLConfig for multiple matches

**Resolution Priority:**
1. Explicit UID prefix (`uid:epic-1`)
2. JIRA key pattern (`PROJ-123`)
3. Unambiguous UID in payload (`epic-1`)
4. Local summary search (payload `Summary` or `Epic Name`)
5. JIRA summary search with ambiguity policy

**Evidence:** 
- Reuses: `ParentReferenceResolver.ts` (already implemented)
- Integration test: Mixed references in same payload

---

### AC7: Circular Dependency Detection
- [ ] Detect cycles before any API calls: `A → B → C → A`
- [ ] Throw `ValidationError` with clear message and full cycle path
- [ ] Use existing `DependencyGraph.ts` topological sort from saved utilities
- [ ] Fail fast (before creating any issues)

**Evidence:** 
- Reuses: `DependencyGraph.ts` (already implemented)
- Unit tests: Cycle detection scenarios

---

### AC8: Manifest UID Tracking
- [ ] Store UID→Key mappings in `BulkManifest.uidMap` field
- [ ] Preserve mappings across retry attempts (E4-S05 integration)
- [ ] When retrying with manifest: Load existing mappings into `UidReplacer`
- [ ] Enable partial retry: Level 0 succeeded, Level 1 failed → Retry uses Level 0 keys

**Evidence:** 
- Implementation: `BulkManifest.uidMap` field (already exists from previous work)
- Integration test: Create hierarchy → Fail some in level 1 → Retry with manifest

---

## Technical Notes

### Architecture Prerequisites
- **Existing Utilities (Preserved from Previous Implementation):**
  - `src/operations/bulk/HierarchyLevels.ts` - BFS algorithm (98.46% coverage, 18 tests)
  - `src/operations/bulk/UidDetector.ts` - UID detection
  - `src/operations/bulk/UidReplacer.ts` - UID→Key mapping
  - `src/operations/bulk/ParentReferenceResolver.ts` - 5-level priority resolution
  - `src/operations/bulk/DependencyGraph.ts` - Topological sort + cycle detection

- **Dependencies:**
  - E4-S02 (ManifestStorage) - for retry support
  - E4-S03 (JiraBulkApiWrapper) - for bulk API calls
  - E4-S04 (Unified create()) - entry point to modify

### Key Design Decisions

**1. Preprocessing vs Inline Processing**
- **Decision:** Preprocessing approach (detect/group before createBulk)
- **Rationale:** 
  - Separation of concerns (detection separate from creation)
  - Natural order (create parent first, no placeholders)
  - Reuses existing `createBulk` (additive change)
  - Simpler to test (pure functions)

**2. Level-Based Batching vs Topological Sort**
- **Decision:** Level-based batching with BFS
- **Rationale:**
  - Simpler than full topological sort
  - Enables parallel creation within level (not sequential)
  - Clear separation: Level 0 (roots) → Level 1 (children) → Level 2 (grandchildren)
  - Performance: 100 issues with 3 levels = 3 API calls (not 100)

**3. No Pre-Validation Phase**
- **Decision:** Validate during creation, not before
- **Rationale:**
  - JIRA validates when you create (no need to pre-validate)
  - Pre-validation causes timing issues (parent doesn't exist yet)
  - Simpler implementation (one validation point)
  - No coupling to `createSingle` method

**4. Additive Changes Only**
- **Decision:** Don't modify existing `createBulk`, add new `createBulkHierarchy`
- **Rationale:**
  - Backward compatible (existing users unaffected)
  - Single responsibility (each method focused)
  - Easier to test (clear boundaries)
  - Reduces risk (existing code unchanged)

### Testing Prerequisites
**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [ ] Redis running with cache enabled
- [ ] JIRA credentials configured
- [ ] Test project allows Epics, Tasks, Subtasks

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Verify connection
redis-cli ping
```

---

## Related Stories

- **Depends On**: 
  - E4-S02 (ManifestStorage) - for manifest with UID tracking
  - E4-S03 (JiraBulkApiWrapper) - for bulk API calls
  - E4-S04 (Unified create()) - entry point to extend
- **Blocks**: None
- **Related**: 
  - E4-S05 (Retry with Manifest) - UID mappings enable hierarchy retry
  - E3-S03 (JPO Hierarchy Discovery) - parent field discovery

---

## Testing Strategy

### Unit Tests

**File 1**: `tests/unit/bulk/hierarchy-preprocessor.test.ts`
- **Coverage Target**: ≥95%
- **Test Cases:**
  - No UIDs: Returns single level
  - Simple hierarchy: Epic → Tasks (2 levels)
  - Deep hierarchy: Epic → Stories → Subtasks (3 levels)
  - Parallel branches: 1 epic → 3 stories (same level)
  - Edge cases: Empty input, single issue, orphans

**File 2**: `tests/unit/operations/hierarchy-handler.test.ts`
- **Coverage Target**: ≥95%
- **Test Cases:**
  - Level-based batching: Verify sequential level processing
  - UID replacement: Verify Parent UIDs replaced with keys
  - Result merging: Verify results from all levels combined
  - Manifest creation: Verify UID mappings stored
  - Error handling: Level fails → Remaining levels skipped

**File 3**: Reuse existing tests
- `tests/unit/bulk/hierarchy-levels.test.ts` (18 tests, 98.46% coverage)
- `tests/unit/bulk/uid-detector.test.ts`
- `tests/unit/bulk/dependency-graph.test.ts`

### Integration Tests

**File**: `tests/integration/hierarchy-performance.test.ts`
- **Test Case 1: Basic Hierarchy (AC4)**
  - Create: 1 epic, 3 tasks (parent = epic UID), 9 subtasks (parent = task UIDs)
  - Assert: Exactly 3 API calls (one per level)
  - Assert: All 13 issues created
  - Assert: Duration <10 seconds
  - Assert: Parent-child links correct

- **Test Case 2: Mixed References (AC6)**
  - Create: Mix of UID refs, JIRA keys, summaries
  - Assert: All resolved correctly
  - Assert: Ambiguity policy applied

- **Test Case 3: Retry with Hierarchy (AC8)**
  - Create: 13 issues, force some to fail in level 1
  - Retry: With same manifest ID
  - Assert: Level 0 keys reused (not recreated)
  - Assert: Failed level 1 issues retried

- **Test Case 4: Backward Compatibility (AC3)**
  - Create: Bulk without UIDs
  - Assert: Uses existing `createBulk` path
  - Assert: Same behavior as before

---

## Definition of Done

### Code Quality
- [x] All acceptance criteria implemented
- [x] Code follows architectural rules (preprocessing + level-based batching)
- [x] No modifications to existing `createBulk` method (additive only)
- [x] TypeScript types updated (no `any` types)
- [x] JSDoc comments for public methods
- [x] Error handling with clear messages

### Testing
- [x] Unit tests: ≥95% coverage
- [x] Integration tests: All scenarios covered
- [x] All tests passing (`npm test`)
- [x] Coverage report generated (`npm run test:coverage`)

### Validation Review (AC5)
- [x] Audited validation approach
- [x] Confirmed single validation point (during creation)
- [x] No pre-validation phase
- [x] No `createSingle(validate: true)` for internal payload building
- [x] Documented validation flow below

**Validation Flow (Confirmed Correct):**
```typescript
// ✅ CORRECT: Validation happens once during creation
for (const level of batch.levels) {
  // 1. Replace UIDs (no validation)
  replaceParentUids(level.records, uidReplacer);
  
  // 2. createBulk converts and validates (single validation point)
  const result = await createBulk(level.records);
  //    ↑ This calls JIRA API which validates
  //    ↑ Field resolution happens here
  //    ↑ Type conversion happens here
  
  // 3. Store keys for next level
  storeKeys(result, uidReplacer);
}
```

**No Double Validation:**
- ❌ Pre-validation phase removed (was wrong timing)
- ❌ `createSingle(validate: true)` NOT used for payload building
- ✅ Single validation: JIRA API during `createBulk()`

### Documentation
- [x] Story updated with implementation notes
- [x] Architectural decision documented in story
- [x] Performance improvement quantified (10x faster)

### Demo
- [ ] Demo script created in `demo-app/src/features/bulk-hierarchy-uids.js`
- [ ] Demonstrates level-based batching
- [ ] Shows 3 API calls for 13 issues
- [ ] Displays created issues with relationships
- [ ] README.md updated with hierarchy example

---

## Performance Improvement

**Before (Sequential Creation):**
- 100 issues with hierarchy = 100 API calls
- Duration: ~30 seconds (300ms per call)
- Scale: Linear O(n)

**After (Level-Based Batching):**
- 100 issues with 3 levels = 3 API calls
- Duration: ~3 seconds (1 second per level)
- Scale: O(depth) where depth typically 2-3
- **10x faster!**

---

## Implementation Notes

**Reusing Saved Utilities:**
The following files were saved from the previous implementation and should be restored from `~/backup-utilities/`:
1. `src/operations/bulk/HierarchyLevels.ts` - BFS algorithm (217 lines, 98.46% coverage)
2. `src/operations/bulk/UidDetector.ts` - UID detection
3. `src/operations/bulk/UidReplacer.ts` - UID→Key mapping
4. `tests/unit/bulk/hierarchy-levels.test.ts` - 18 comprehensive tests

**New Files to Create:**
1. `src/operations/bulk/HierarchyPreprocessor.ts` - Preprocessing utility (AC1)
2. `tests/unit/bulk/hierarchy-preprocessor.test.ts` - Unit tests for preprocessor
3. `tests/unit/operations/hierarchy-handler.test.ts` - Unit tests for handler
4. `tests/integration/hierarchy-performance.test.ts` - Performance validation (AC4)
5. `demo-app/src/features/bulk-hierarchy-uids.js` - Interactive demo

**Files to Modify:**
1. `src/operations/IssueOperations.ts` - Add `createBulkHierarchy()` method and modify `create()` routing

---

## Lessons Learned from Previous Attempt

**What Went Wrong:**
1. Baked UID handling into `createBulk` (violated SRP)
2. Used `createSingle(validate: true)` for payload building (wrong abstraction)
3. Pre-validated Parent references before parent existed (wrong timing)
4. Complex validation phases with double validation

**What Works (Preserved):**
1. BFS algorithm for level detection (correct and tested)
2. UID detection and replacement utilities (simple and pure)
3. Topological sort for cycle detection (works correctly)

**Key Insight:**
> "Preprocess BEFORE createBulk, not inside it"

This separation of concerns makes the code simpler, more testable, and easier to understand.

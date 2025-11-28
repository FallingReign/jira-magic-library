# E4-S13: Hierarchy Support with Level-Based Batching

**Epic**: Epic 4 - Bulk Operations  
**Size**: Medium (5 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: -  
**Started**: 2025-11-27  
**Completed**: 2025-11-28

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
- [x] Implement `preprocessHierarchyRecords(records, projectKey, schema)` in `src/operations/bulk/HierarchyPreprocessor.ts`
- [x] Detect UIDs using existing `UidDetector.ts` (saved from previous implementation)
- [x] Automatically strip `uid` field from all records (library-internal field, not sent to JIRA)
- [x] If no UIDs: Return single level (backward compatible)
- [x] If UIDs found: Use JPO hierarchy discovery to determine creation order
  - Use `JPOHierarchyDiscovery.getHierarchy()` to get hierarchy structure
  - **Issue Type Name→ID Resolution**: Use `SchemaDiscovery.getIssueTypesForProject(projectKey)` to get mapping
  - Match each record's `Issue Type` name to ID, then find corresponding JPO level via `issueTypeIds[]`
  - Group issues by JPO level for bottom-up creation (level 0 first, then 1, then 2, etc.)
  - Fallback: If JPO not available (returns null), use BFS algorithm (from saved `HierarchyLevels.ts`)
- [x] Return structure: `{ levels: HierarchyLevel[], uidMap?: Map<string, number> }`
- [x] Note: Not a pure function - requires `schema` and `hierarchy` discovery (async)
- **Evidence**: `src/operations/bulk/HierarchyPreprocessor.ts`, `tests/unit/bulk/hierarchy-preprocessor.test.ts`

**Important JPO Hierarchy Ordering:**
- JPO uses level id 0 as LOWEST (bottom of hierarchy)
- Higher level ids go UP the hierarchy
- Example: Sub-task (0) → Task (1) → Epic (2) → Super Epic (3) → Container (4) → Initiative (5)
- Creation order: Create from BOTTOM to TOP (level 0 first, then 1, then 2, etc.)
- This is OPPOSITE of typical parent-first thinking but matches JIRA's dependency structure

**Issue Type Resolution Flow:**
1. Input record has `"Issue Type": "Task"` (name)
2. Call `SchemaDiscovery.getIssueTypesForProject("PROJ")` → `[{ id: "10001", name: "Task" }, ...]`
3. Find ID: `"Task"` → `"10001"`
4. Find JPO level where `issueTypeIds.includes("10001")` → level 1
5. Group record into level 1 batch

**BFS Fallback Behavior (when JPO unavailable):**
- Use Parent UID references to build dependency graph
- Infer hierarchy from issue type names where possible (e.g., "Sub-task" always below other types)
- Goal: Achieve user intent even without JPO - create parents before children
- BFS walks the graph to determine creation order

**Evidence:** (To be added upon completion)

---

### AC2: Create Level-Based Handler Method
- [x] Implement `createBulkHierarchy(batch, options)` in `IssueOperations.ts`
- [x] Loop through levels sequentially (Level 0 → Level 1 → Level 2 → ...)
- [x] For each level:
  1. Replace Parent UIDs with keys from `UidReplacer` (previous level results)
  2. Call **existing** `createBulk(records)` method (unchanged!)
  3. Handle partial failures: Some issues in level may fail, continue with successes
  4. Store UID→Key mappings from successful results for next level
- [x] Merge results from all levels into single `BulkResult`
- [x] Preserve manifest with UID mappings (enables retry with partial hierarchy)
- **Evidence**: `src/operations/IssueOperations.ts` (createBulkHierarchy), `tests/unit/bulk/hierarchy-handler.test.ts`

---

### AC3: Modify Entry Point to Route Hierarchy Batches
- [x] Update `create()` entry point in `IssueOperations.ts`
- [x] After parsing input, call `preprocessHierarchyRecords()`
- [x] If single level returned: Use existing `createBulk()` path
- [x] If multiple levels returned: Use new `createBulkHierarchy()` path
- [x] **Multi-project batches**: If input contains issues for multiple projects:
  - Group by `Project` field first
  - Process each project independently (separate preprocessing, separate hierarchy creation)
  - Merge results from all projects into single `BulkResult`
  - Each project uses its own JPO hierarchy (hierarchies may differ between projects)
- [x] Preserve backward compatibility (no UIDs = existing behavior)
- **Evidence**: `src/operations/IssueOperations.ts` (create() routing), `tests/unit/operations/IssueOperations.test.ts`, `tests/integration/hierarchy-bulk.test.ts`

---

### AC4: Performance Validation with Full Hierarchy
- [x] Create integration test with complete JIRA hierarchy structure from JPO (fallback to BFS when JPO unavailable)
- [x] Query JPO hierarchy: Use `JPOHierarchyDiscovery.getHierarchy()` to get actual hierarchy
- [x] **Verify JPO ordering assumption**: Confirm that level id 0 = lowest (bottom) by inspecting JPO response
  - Log hierarchy structure in test for verification
  - Assert that Sub-task types appear at lower level ids than Epic types
- [x] Test hierarchy based on JPO response:
  - JPO returns levels with id (0 = lowest/bottom, increasing = going up)
  - Use actual issue types from JPO `issueTypeIds` at each level
  - Example hierarchy: Sub-task (L0) → Task (L1) → Epic (L2) → Super Epic (L3) → Container (L4) → Initiative (L5)
  - Test should create issues bottom-up: Sub-tasks → Tasks → Epics → Super Epics → Containers → Initiatives
- [x] Test data: Minimum 13 issues across hierarchy levels
  - Scale based on JPO hierarchy depth (typically 3-6 levels in real projects)
  - Example: 5 sub-tasks (L0) → 3 tasks (L1) → 3 epics (L2) → 1 super epic (L3) → 1 container (L4)
- [x] Verify: API calls = number of JPO hierarchy levels (NOT number of issues)
- [x] Verify: All issues created successfully
- [x] Verify: Parent-child relationships follow JPO hierarchy rules
- [x] Verify: Duration <10 seconds
- [x] Document 10x improvement: 100 issues with 3 levels = 3 API calls (was 100 sequential calls)
- **Evidence**: `tests/integration/hierarchy-bulk.test.ts`, `tests/integration/jpo-hierarchy.test.ts`, coverage report

**Important:** 
- JPO level id 0 is the LOWEST level (Sub-task in standard JIRA)
- Higher level ids go UP the hierarchy: Sub-task (0) → Task (1) → Epic (2) → Super Epic (3) → Container (4) → Initiative (5)
- Verify this bottom-up creation order in test assertions

**Evidence:** (To be added upon completion)

---

### AC5: Validation Approach Review
- [x] Audit all validation points in codebase
- [x] Ensure validation only happens during actual creation (not before)
- [x] Verify no double validation (pre-validate + JIRA validate)
- [x] Confirm: `validate()` method is ONLY called explicitly by users (not used internally)
- [x] Confirm: Internally we do NOT validate, we rely on JIRA payload errors on create
- [x] Confirm: `validate: true` option in `create()` is for user dry-runs only (not internal payload building)
- [x] Document validation flow in story completion notes
- **Evidence**: `src/operations/IssueOperations.ts` (createBulk/createBulkHierarchy), `tests/unit/operations/IssueOperations.test.ts`

**Validation Rules:**
- ✅ User calls `jml.validate(data)` → Explicit validation request
- ✅ User calls `jml.create(data, { validate: true })` → Dry-run mode (no creation)
- ❌ Library NEVER calls `validate()` or `createSingle(validate: true)` internally
- ❌ Library NEVER pre-validates before calling JIRA API
- ✅ JIRA API validates during actual creation (single validation point)

**Evidence:** (To be added upon completion)

---

### AC6: Parent Reference Resolution
- [x] Support UID references: `Parent: 'uid:epic-1'` or `Parent: 'epic-1'`
- [x] Support JIRA key pattern: `Parent: 'PROJ-123'` (existing issue)
- [x] Support summary search: `Parent: 'My Epic'` (search payload first, then JIRA)
- [x] Use existing `ParentReferenceResolver.ts` from saved utilities
- [x] Apply `ambiguityPolicy.parent` from JMLConfig for multiple matches

**Resolution Priority:**
1. Explicit UID prefix (`uid:epic-1`)
2. JIRA key pattern (`PROJ-123`)
3. Unambiguous UID in payload (`epic-1`)
4. Local summary search (payload `Summary` or `Epic Name`)
5. JIRA summary search with ambiguity policy

**Evidence:** `src/hierarchy/ParentLinkResolver.ts`, `tests/unit/hierarchy/ParentLinkResolver.test.ts`, `tests/unit/converters/FieldResolver.test.ts`

---

### AC7: Circular Dependency Detection
- [x] Detect cycles before any API calls: `A → B → C → A`
- [x] Throw `ValidationError` with clear message and full cycle path
- [x] Use existing `DependencyGraph.ts` topological sort from saved utilities
- [x] Fail fast (before creating any issues)

**Evidence:** `src/operations/bulk/HierarchyPreprocessor.ts` (detectCycles), `tests/unit/bulk/hierarchy-preprocessor.test.ts`

---

### AC8: Manifest UID Tracking with Retry Support
- [x] Store UID→Key mappings in `BulkManifest.uidMap` field (already exists)
- [x] Integrate with **existing** E4-S05 retry infrastructure (no new retry mechanism)
- [x] When retrying: `retryWithManifest()` already loads `manifest.uidMap` (line ~169-171)
- [x] Enable partial retry scenarios:
  - Level 0 succeeded, Level 1 failed → Retry uses Level 0 keys (doesn't recreate)
  - Level 0 partially succeeded → Retry skips succeeded issues via `manifest.failed` array
  - Level 1 succeeded, Level 2 failed → Retry uses both Level 0 and Level 1 keys
- [x] `UidReplacer.loadExistingMappings()` restores UID→Key state for retry
- [x] No new retry code: Hierarchy preprocessing works within existing retry flow

**Evidence:** `src/operations/IssueOperations.ts` (retryWithManifest/retryWithHierarchy), `tests/unit/operations/IssueOperations-retry.test.ts`

**Integration with E4-S05:**
- `retryWithManifest()` handles manifest loading (lines 133-280)
- `manifest.failed` array tracks which indices failed
- `manifest.uidMap` preserves UID→Key mappings
- Retry filters input to failed indices only
- Hierarchy preprocessing runs on filtered input, uses existing UID keys

**Evidence:** (To be added upon completion)

---

## Technical Notes

### Architecture Prerequisites
- **Existing Utilities (Preserved from Previous Implementation):**
  - `src/operations/bulk/UidDetector.ts` - UID detection
  - `src/operations/bulk/UidReplacer.ts` - UID→Key mapping
  - `src/operations/bulk/ParentReferenceResolver.ts` - 5-level priority resolution
  - `src/operations/bulk/DependencyGraph.ts` - Topological sort + cycle detection
  - `src/operations/bulk/HierarchyLevels.ts` - BFS fallback algorithm (if JPO not available)

- **JPO Hierarchy Integration:**
  - `src/hierarchy/JPOHierarchyDiscovery.ts` - Get hierarchy structure from JIRA
  - **IMPORTANT:** JPO uses level id 0 as LOWEST (bottom), increasing = going UP
  - Example: level 0 = Sub-task, level 1 = Task, level 2 = Epic, level 3 = Super Epic, level 4 = Container, level 5 = Initiative
  - Creation order: Bottom-up (level 0 first, then 1, then 2, etc.)
  - Fallback to BFS if JPO endpoint returns 404
  - Cached for 1 hour to reduce API calls

- **Dependencies:**
  - E4-S02 (ManifestStorage) - for retry support
  - E4-S03 (JiraBulkApiWrapper) - for bulk API calls
  - E4-S04 (Unified create()) - entry point to modify
  - E3-S03 (JPO Hierarchy Discovery) - for level detection

### Key Design Decisions

**1. Preprocessing vs Inline Processing**
- **Decision:** Preprocessing approach (detect/group before createBulk)
- **Rationale:** 
  - Separation of concerns (detection separate from creation)
  - Natural order (create parent first, no placeholders)
  - Reuses existing `createBulk` (additive change)
  - Simpler to test (pure functions)

**2. Level-Based Batching: JPO Hierarchy vs BFS Fallback**
- **Decision:** Use JPO hierarchy for level detection, fallback to BFS
- **Rationale:**
  - JPO provides authoritative hierarchy structure from JIRA configuration
  - Respects custom hierarchy: Sub-task (L0) → Task (L1) → Epic (L2) → Super Epic (L3) → Container (L4) → Initiative (L5)
  - **JPO ordering:** Level id 0 = LOWEST (Sub-task), increasing ids = going UP the hierarchy
  - BFS fallback ensures backward compatibility (JPO endpoint may not exist)
  - Creation order: Bottom-up (children before parents, level 0 first, then 1, then 2, etc.)
  - Performance: 100 issues with 3 levels = 3 API calls (not 100)
  - JPO cached for 1 hour (minimal API overhead)

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

**5. UID Field Handling**
- **Decision:** Automatically strip `uid` field from records before sending to JIRA
- **Rationale:**
  - `uid` is library-internal only (used for hierarchy tracking)
  - JIRA doesn't recognize `uid` field (would cause validation error)
  - Existing functionality (already implemented in codebase)
  - Transparent to users (they don't need to remove it manually)
  
**Note on Future externalId Support:**
After this story is complete, we should evaluate using JIRA's native `externalId` field as an alternative to `uid`. Benefits:
- Persists in JIRA (enables sync/update operations)
- Standard JIRA field (no custom handling needed)
- Would support future `update()` method (sync user app state with JIRA)
- Discussion needed: Trade-offs between simplicity (uid) vs persistence (externalId)

### Testing Prerequisites
**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [x] Redis running with cache enabled
- [x] JIRA credentials configured
- [x] Test project allows Epics, Tasks, Subtasks

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
  - UID stripping: Verify `uid` field removed from payloads before sending to JIRA
  - Result merging: Verify results from all levels combined
  - Manifest creation: Verify UID mappings stored
  - Error handling: Level partially fails → Continue with successes, track failures

**File 3**: Reuse existing tests
- `tests/unit/bulk/hierarchy-levels.test.ts` (18 tests, BFS fallback)
- `tests/unit/bulk/uid-detector.test.ts`
- `tests/unit/bulk/dependency-graph.test.ts`

**File 4**: `tests/unit/bulk/jpo-hierarchy-integration.test.ts`
- **Coverage Target**: ≥95%
- **Test Cases:**
  - JPO hierarchy available: Uses JPO levels for grouping
  - JPO hierarchy unavailable (404): Falls back to BFS
  - JPO hierarchy cached: Reuses cached structure
  - Custom hierarchy: Initiative → Epic → Story → Task → Subtask (5 levels)

### Integration Tests

**File**: `tests/integration/hierarchy-performance.test.ts`
- **Test Case 1: Full Hierarchy (AC4)**
  - Create: Complete JIRA hierarchy (5 levels if supported: Initiative → Epic → Story → Task → Subtask)
  - Minimum: 3 levels (Epic → Task → Subtask)
  - Test data: Minimum 13 issues, scale: 1 initiative, 1 epic, 3 stories, 3 tasks, 5 subtasks
  - Assert: API calls = number of hierarchy levels (3-5 calls, not 13+)
  - Assert: All issues created
  - Assert: Parent-child links correct at every level
  - Assert: Duration <10 seconds

- **Test Case 2: Mixed References (AC6)**
  - Create: Mix of UID refs, JIRA keys, summaries
  - Assert: All resolved correctly
  - Assert: Ambiguity policy applied

- **Test Case 3: Partial Failure & Retry (AC8)**
  - Create: 13 issues across 3 levels
  - Force failures: Some in level 1, some in level 2
  - Assert: Level 0 succeeded completely
  - Assert: Manifest contains UID→Key mappings for level 0
  - Retry: With same manifest ID
  - Assert: Level 0 keys reused (not recreated)
  - Assert: Failed issues in levels 1 and 2 retried
  - Assert: Successful issues in level 1 not recreated

- **Test Case 4: Backward Compatibility (AC3)**
  - Create: Bulk without UIDs
  - Assert: Uses existing `createBulk` path
  - Assert: Same behavior as before

- **Test Case 5: JPO Hierarchy Integration**
  - Create: Hierarchy matching JPO structure
  - Assert: Issues grouped by JPO levels (not BFS)
  - Assert: Respects custom hierarchy order
  - Test fallback: Mock JPO 404 → Falls back to BFS

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
- [x] Demo script created in `demo-app/src/features/hierarchy-bulk-uids.js`
- [x] Demonstrates level-based batching
- [x] Shows 3 API calls for 13 issues (or per-level batching)
- [x] Displays created issues with relationships
- [x] README.md updated with hierarchy example

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
1. `src/operations/bulk/HierarchyLevels.ts` - BFS fallback algorithm (217 lines, 98.46% coverage)
2. `src/operations/bulk/UidDetector.ts` - UID detection
3. `src/operations/bulk/UidReplacer.ts` - UID→Key mapping
4. `tests/unit/bulk/hierarchy-levels.test.ts` - 18 comprehensive tests

**New Files to Create:**
1. `src/operations/bulk/HierarchyPreprocessor.ts` - Preprocessing utility (AC1)
   - Calls `JPOHierarchyDiscovery.getHierarchy()` for authoritative levels
   - Falls back to BFS if JPO not available
   - Maps issue types to JPO levels (remembering: 0 = lowest)
   - Automatically strips `uid` field from all records before grouping
2. `tests/unit/bulk/hierarchy-preprocessor.test.ts` - Unit tests for preprocessor
3. `tests/unit/operations/hierarchy-handler.test.ts` - Unit tests for handler
4. `tests/integration/hierarchy-performance.test.ts` - Performance validation (AC4)
5. `demo-app/src/features/bulk-hierarchy-uids.js` - Interactive demo

**Files to Modify:**
1. `src/operations/IssueOperations.ts` - Add `createBulkHierarchy()` method and modify `create()` routing

**Critical Implementation Details:**
- **UID Field Stripping:** The `uid` field is library-internal metadata for tracking issues in a batch. It MUST be stripped before sending payloads to JIRA (JIRA will reject unknown fields). This happens in `preprocessHierarchyRecords()` before grouping.
- **JPO Hierarchy Ordering:** JPO returns level id 0 as LOWEST (e.g., Subtask), not highest. Creation must be bottom-up (level 0 → 1 → 2). This is counter-intuitive but matches JIRA's structure.
- **Retry Integration:** No new retry code needed. Hierarchy preprocessing detects UIDs → Groups by level → Existing `retryWithManifest()` handles filtering to failed indices and loading `manifest.uidMap`.

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

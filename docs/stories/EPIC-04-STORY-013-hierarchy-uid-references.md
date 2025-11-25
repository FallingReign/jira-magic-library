# E4-S13: Hierarchy Support with UID References

**Epic**: Epic 4 - Bulk Operations  
**Size**: Large (8 points)  
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
**So that** I don't have to create parents first and then manually link children in separate API calls

---

## Acceptance Criteria

### ✅ AC1: UID Field Detection
- [ ] Parse `uid` field from input (any format: CSV, JSON, YAML, array)
- [ ] Support alphanumeric UIDs: `epic-1`, `story_a`, `TASK123`, `1`, `2`, `3`
- [ ] Validate uniqueness: Throw `ValidationError` if duplicate UIDs in payload
- [ ] UIDs are optional: If no `uid` field, process in input order (backward compatible)
- [ ] Preserve `uid` in manifest for tracking across retries

**Evidence**: 
- Unit tests: `tests/unit/bulk/uid-detection.test.ts`
- Test cases: alphanumeric UIDs, numeric UIDs (CSV rows), duplicate detection
- Integration test: Bulk create with and without UIDs (backward compatibility)

---

### ✅ AC2: Parent Reference Resolution
- [ ] Support explicit UID prefix: `Parent: 'uid:epic-1'` → Always treated as UID reference
- [ ] Support JIRA key pattern: `Parent: 'PROJ-123'` → Existing issue key in JIRA
- [ ] Support unambiguous UID: `Parent: 'epic-1'` → If `epic-1` exists as UID in payload
- [ ] Support local summary search: `Parent: 'My Epic'` → Search payload `Summary` and `Epic Name` fields first
- [ ] Support JIRA summary search: `Parent: 'My Epic'` → If not found in payload, search JIRA
- [ ] Apply ambiguity policy: Multiple JIRA matches → Use `ambiguityPolicy.parent` from JMLConfig
- [ ] Handle mixed references: Some UIDs, some keys, some summaries in same payload

**Resolution Priority**:
1. Explicit UID prefix (`uid:epic-1`)
2. JIRA key pattern (`PROJ-123`)
3. Unambiguous UID in payload (`epic-1`)
4. Local summary search (payload `Summary` or `Epic Name`)
5. JIRA summary search with ambiguity policy

**Evidence**: 
- Unit tests: `tests/unit/bulk/parent-resolution.test.ts`
- Test all resolution paths (UID, key, summary local, summary JIRA)
- Test ambiguity detection (multiple payload matches, multiple JIRA matches)
- Integration test: Mixed references in single payload

---

### ✅ AC3: Topological Sort by Hierarchy
- [ ] Build dependency graph from UID → Parent references
- [ ] Sort issues: Parents before children (using JPO hierarchy from E3-S03)
- [ ] Support multiple levels: Epic → Story → Subtask → (future sub-subtask levels)
- [ ] Support parallel branches: `epic-1 → [story-1, story-2, story-3]` created in parallel batches
- [ ] Preserve batching strategy: Group issues by depth level, batch within level

**Evidence**: 
- Unit tests: `tests/unit/bulk/topological-sort.test.ts`
- Test cases: 2-level hierarchy, 3-level hierarchy, parallel branches
- Integration test: Create Epic → 3 Stories → 5 Subtasks (verify creation order)

---

### ✅ AC4: Circular Dependency Detection
- [ ] Detect cycles in dependency graph: `A → B → C → A`
- [ ] Throw `ValidationError` with clear message: "Circular dependency detected: epic-1 → story-1 → epic-1"
- [ ] Show full cycle path in error message
- [ ] Validate before any API calls (fail fast)

**Evidence**: 
- Unit tests: `tests/unit/bulk/circular-dependency.test.ts`
- Test cases: Direct cycle (`A → A`), 2-node cycle, 3-node cycle, complex graph
- Error message includes full cycle path

---

### ✅ AC5: UID Resolution During Creation
- [ ] Create issues in topological order (parents first, then children)
- [ ] Track created keys: `{ 'epic-1': 'PROJ-100', 'story-1': 'PROJ-101' }`
- [ ] Replace UID references with actual keys before creating dependent issues
- [ ] Update manifest with UID → Key mapping: `manifest.uidMap = { 'epic-1': 'PROJ-100' }`
- [ ] Handle partial success: If parent fails, mark all descendants as failed (dependency failure)

**Example Flow**:
```javascript
// Input:
[
  { uid: 'epic-1', 'Issue Type': 'Epic', Summary: 'Phase 1' },
  { uid: 'story-1', 'Issue Type': 'Story', Summary: 'Feature A', Parent: 'epic-1' }
]

// Step 1: Create epic-1 → PROJ-100
// Step 2: Replace 'epic-1' → 'PROJ-100' in story-1's Parent field
// Step 3: Create story-1 with Parent: 'PROJ-100' → PROJ-101

// Manifest:
{
  uidMap: { 'epic-1': 'PROJ-100', 'story-1': 'PROJ-101' },
  succeeded: [0, 1],
  created: { 'PROJ-100': {...}, 'PROJ-101': {...} }
}
```

**Evidence**: 
- Integration test: `tests/integration/bulk-hierarchy.test.ts`
- Test case: Create Epic → Story → Subtask (verify keys replaced correctly)
- Test case: Parent creation fails → Children marked as dependency failure

---

### ✅ AC6: Integration with Retry (E4-S05)
- [ ] Load UID → Key mappings from manifest on retry: `manifest.uidMap`
- [ ] Skip already-created UIDs (check `uidMap` before creating)
- [ ] Resolve parent UIDs using manifest: If `Parent: 'epic-1'` and `uidMap['epic-1'] = 'PROJ-100'`, use `PROJ-100`
- [ ] Handle partial hierarchy completion: Epic created, stories failed → Retry creates stories with correct parent key
- [ ] Preserve UID → Key mappings across multiple retry attempts

**Example Retry Flow**:
```javascript
// First attempt: Epic created, story failed
await jml.issues.create([
  { uid: 'epic-1', ... }, // Created → PROJ-100
  { uid: 'story-1', ..., Parent: 'epic-1' } // Failed (network error)
]);
// Manifest: { uidMap: { 'epic-1': 'PROJ-100' }, succeeded: [0], failed: [1] }

// Retry:
await jml.issues.create([...], { retry: 'bulk-abc123' });
// Step 1: Load manifest.uidMap = { 'epic-1': 'PROJ-100' }
// Step 2: Skip epic-1 (row 0 in succeeded)
// Step 3: Process story-1, resolve Parent 'epic-1' → 'PROJ-100' from uidMap
// Step 4: Create story-1 with Parent: 'PROJ-100'
```

**Evidence**: 
- Integration test: `tests/integration/bulk-hierarchy-retry.test.ts`
- Test case: Create Epic → Fail Story → Retry Story (verify parent key resolved)
- Test case: Multiple retries preserve UID mappings

---

### ✅ AC7: Ambiguity Policy Configuration
- [ ] Add `parent` policy to `AmbiguityPolicyConfig` in JMLConfig
- [ ] Support policies: `'first'` (default), `'error'`, `'score'`
- [ ] Apply policy only for JIRA summary searches (not payload or UID resolution)
- [ ] Default policy: `'error'` (throw error if multiple JIRA matches)
- [ ] User can override: `new JML({ ..., ambiguityPolicy: { parent: 'first' } })`

**JMLConfig Update**:
```typescript
export interface AmbiguityPolicyConfig {
  user?: AmbiguityPolicy;
  parent?: AmbiguityPolicy; // NEW - for parent reference resolution
}
```

**Evidence**: 
- Config type update: `src/types/config.ts`
- Unit tests: `tests/unit/config/ambiguity-policy.test.ts`
- Integration test: Summary search with multiple matches + policy (error/first/score)

---

### ✅ AC8: Error Handling
- [ ] Clear error if parent UID not found in payload: `ValidationError: "Parent UID 'epic-1' not found in input"`
- [ ] Clear error if parent created but failed: `DependencyError: "Parent issue 'epic-1' failed to create, cannot create dependent 'story-1'"`
- [ ] Clear error if parent reference ambiguous in payload: `AmbiguityError: "Summary 'My Epic' matches multiple issues in payload: epic-1, epic-2"`
- [ ] Clear error if parent reference ambiguous in JIRA (with policy 'error'): `AmbiguityError: "Summary 'My Epic' matches multiple JIRA issues: PROJ-100, PROJ-200. Use explicit key or UID."`
- [ ] Include row index in all error messages for bulk context

**Evidence**: 
- Custom error types: `src/errors/DependencyError.ts`
- Unit tests: `tests/unit/bulk/hierarchy-errors.test.ts`
- Test all error scenarios with clear messages

---

### ✅ AC9: Graceful Degradation (No UIDs)
- [ ] If no `uid` field present, skip UID detection and topological sort
- [ ] Process issues in input order (existing behavior from E4-S04)
- [ ] Parent references resolve normally (key or summary search, no UID fallback)
- [ ] Backward compatible with existing bulk operations

**Evidence**: 
- Integration test: `tests/integration/bulk-no-uids.test.ts`
- Test case: Bulk create without `uid` field → Works as before (no regression)

---

### ✅ AC10: Testing Coverage
- [ ] Unit tests for UID detection (parsing, validation, uniqueness)
- [ ] Unit tests for parent resolution (all 5 priority paths)
- [ ] Unit tests for topological sort (2-level, 3-level, parallel branches)
- [ ] Unit tests for circular dependency detection
- [ ] Integration tests for hierarchy creation (Epic → Story → Subtask)
- [ ] Integration tests for retry with UID mappings
- [ ] Integration tests for ambiguity policy enforcement
- [ ] 95% test coverage

**Evidence**: 
- Unit tests: `tests/unit/bulk/` (uid-detection, parent-resolution, topological-sort, circular-dependency, hierarchy-errors)
- Integration tests: `tests/integration/` (bulk-hierarchy, bulk-hierarchy-retry, bulk-no-uids)
- Coverage report: Statements ≥95%, Branches ≥95%, Functions ≥95%, Lines ≥95%

---

## Related Stories

- **Depends On**: 
  - E4-S01 (Unified Input Parser) - needs UID field parsing
  - E4-S02 (Manifest Storage) - needs UID → Key mapping storage
  - E4-S03 (JIRA Bulk API) - uses bulk API for creation
  - E4-S04 (Unified create() Method) - integrates with unified create flow
  - E4-S05 (Retry with Manifest) - retry must use UID mappings
  - E3-S03 (JPO Hierarchy Discovery) - needs hierarchy levels for sort
  - E3-S05 (Parent Resolver) - reuse summary search logic
- **Blocks**: 
  - E4-S12 (Documentation) - document UID reference feature
- **Related**: 
  - E1-S07 (Field Resolution) - ambiguity policy pattern
  - E2-S05 (User Converter) - ambiguity policy precedent

---

## Testing Strategy

### Unit Tests
- **Files**: 
  - `tests/unit/bulk/uid-detection.test.ts`
  - `tests/unit/bulk/parent-resolution.test.ts`
  - `tests/unit/bulk/topological-sort.test.ts`
  - `tests/unit/bulk/circular-dependency.test.ts`
  - `tests/unit/bulk/hierarchy-errors.test.ts`
  - `tests/unit/config/ambiguity-policy.test.ts`
- **Coverage Target**: ≥95%
- **Focus Areas**:
  - UID parsing from CSV/JSON/YAML (alphanumeric, numeric, special chars)
  - Parent reference resolution (all 5 priority paths)
  - Topological sort correctness (various hierarchy shapes)
  - Circular dependency detection (direct, indirect, complex cycles)
  - Error messages clarity (all error scenarios)

### Integration Tests
- **Files**: 
  - `tests/integration/bulk-hierarchy.test.ts`
  - `tests/integration/bulk-hierarchy-retry.test.ts`
  - `tests/integration/bulk-no-uids.test.ts`
- **Prerequisites**:
  - Real JIRA instance with project (e.g., TEST)
  - Issue types: Epic, Story, Subtask
  - Credentials in `.env` file
- **Test Scenarios**:
  - Create 2-level hierarchy: Epic → 3 Stories (verify creation order, parent keys)
  - Create 3-level hierarchy: Epic → Story → 2 Subtasks (verify all levels)
  - Create with mixed references: UID, key, summary in same payload
  - Create → Fail → Retry: Parent created, child failed, retry child (verify UID resolution)
  - Ambiguity policy enforcement: Multiple JIRA matches with policy 'error'/'first'
  - Backward compatibility: Bulk create without UIDs (no regression)

---

## Technical Notes

### Architecture Prerequisites
- **E4-S01**: Parser must extract `uid` field from CSV/JSON/YAML
- **E4-S02**: Manifest must store `uidMap: { uid: key }` structure
- **E4-S03**: Bulk API wrapper must handle topological batching
- **E4-S04**: `create()` method must call topological sort before batching
- **E4-S05**: Retry logic must load and use `uidMap` from manifest
- **E3-S03**: JPO hierarchy discovery provides valid parent-child relationships
- **E3-S05**: Parent resolver provides summary search logic (reuse for JIRA searches)

### Testing Prerequisites
- **E1-S07**: Field resolution framework (for testing resolution pipeline)
- **E1-S09**: Single issue creation (for testing no-UID fallback)
- **E3-S03**: JPO hierarchy (for testing hierarchy levels)
- **E3-S05**: Parent resolver (for testing summary search)
- **E4-S01**: Parser (for testing UID parsing from files)
- **E4-S02**: Manifest storage (for testing UID → Key tracking)
- **E4-S05**: Retry logic (for testing manifest-based resolution)

### Dependencies
- **External**: 
  - `graphlib` or similar for topological sort (or implement in-house)
  - `js-yaml` (already added in E4-S01)
- **Internal Modules**:
  - `src/parsers/InputParser.ts` (E4-S01)
  - `src/bulk/ManifestManager.ts` (E4-S02)
  - `src/bulk/BulkAPIWrapper.ts` (E4-S03)
  - `src/operations/IssueOperations.ts` (E4-S04)
  - `src/resolvers/ParentResolver.ts` (E3-S05)
  - `src/schema/JPOHierarchyManager.ts` (E3-S03)

### Implementation Guidance

**Key Components to Build**:

1. **UID Detector** (`src/bulk/UIDDetector.ts`):
   - Parse `uid` field from input
   - Validate uniqueness
   - Return UID → Row Index mapping

2. **Dependency Graph Builder** (`src/bulk/DependencyGraph.ts`):
   - Build graph from UID → Parent references
   - Detect circular dependencies
   - Topological sort using hierarchy levels

3. **Parent Reference Resolver** (`src/bulk/ParentReferenceResolver.ts`):
   - Implement 5-level resolution priority
   - Local summary search (payload)
   - JIRA summary search with ambiguity policy
   - Return resolved parent key or UID

4. **UID Replacement Engine** (`src/bulk/UIDReplacer.ts`):
   - Track UID → Key mappings during creation
   - Replace UID references before dependent creation
   - Update manifest with mappings

5. **Config Update** (`src/types/config.ts`):
   - Add `parent?: AmbiguityPolicy` to `AmbiguityPolicyConfig`

**Integration Points**:
- `IssueOperations.create()` calls `UIDDetector` → `DependencyGraph.sort()` → `UIDReplacer.track()`
- `ManifestManager` stores/loads `uidMap` structure
- `ParentReferenceResolver` reuses `ParentResolver` (E3-S05) for JIRA searches

**Topological Sort Algorithm**:
```typescript
// Pseudocode
function topologicalSort(issues: Issue[]): Issue[] {
  1. Build graph: UID → Parent UID dependencies
  2. Detect cycles (DFS with visited/recursion stack)
  3. Assign depth level: root=0, child=parent.depth+1
  4. Group by depth level: [level0, level1, level2]
  5. Return flattened: [...level0, ...level1, ...level2]
}
```

**UID Resolution During Creation**:
```typescript
// Pseudocode
async function createWithUIDs(sortedIssues: Issue[]): BulkResult {
  const uidMap = {};
  
  for (const issue of sortedIssues) {
    // Replace Parent UID with actual key
    if (issue.Parent && uidMap[issue.Parent]) {
      issue.Parent = uidMap[issue.Parent]; // epic-1 → PROJ-100
    }
    
    // Create issue
    const result = await createIssue(issue);
    
    // Track mapping
    if (issue.uid && result.key) {
      uidMap[issue.uid] = result.key;
    }
  }
  
  return { uidMap, ... };
}
```

---

## Implementation Example

### Basic Hierarchy with UIDs

```javascript
const jml = new JML({
  baseUrl: 'https://jira.company.com',
  auth: { token: process.env.JIRA_PAT },
  ambiguityPolicy: {
    parent: 'error' // Throw error if summary search is ambiguous
  }
});

// Create Epic → Stories → Subtasks in one call
const result = await jml.issues.create([
  { 
    uid: 'epic-1',
    Project: 'ENG', 
    'Issue Type': 'Epic', 
    Summary: 'Q4 Platform Improvements',
    'Epic Name': 'Q4 Platform'
  },
  { 
    uid: 'story-1',
    Project: 'ENG', 
    'Issue Type': 'Story', 
    Summary: 'Implement caching layer',
    Parent: 'epic-1' // References UID above
  },
  { 
    uid: 'story-2',
    Project: 'ENG', 
    'Issue Type': 'Story', 
    Summary: 'Add monitoring',
    Parent: 'epic-1'
  },
  { 
    uid: 'task-1',
    Project: 'ENG', 
    'Issue Type': 'Subtask', 
    Summary: 'Research cache backends',
    Parent: 'story-1' // References story UID
  },
  { 
    uid: 'task-2',
    Project: 'ENG', 
    'Issue Type': 'Subtask', 
    Summary: 'Implement Redis cache',
    Parent: 'story-1'
  },
  { 
    uid: 'task-3',
    Project: 'ENG', 
    'Issue Type': 'Subtask', 
    Summary: 'Set up Prometheus',
    Parent: 'story-2'
  }
]);

console.log(result);
// {
//   succeeded: [0, 1, 2, 3, 4, 5],
//   failed: [],
//   created: {
//     'ENG-100': { uid: 'epic-1', key: 'ENG-100', ... },
//     'ENG-101': { uid: 'story-1', key: 'ENG-101', parent: 'ENG-100', ... },
//     'ENG-102': { uid: 'story-2', key: 'ENG-102', parent: 'ENG-100', ... },
//     'ENG-103': { uid: 'task-1', key: 'ENG-103', parent: 'ENG-101', ... },
//     'ENG-104': { uid: 'task-2', key: 'ENG-104', parent: 'ENG-101', ... },
//     'ENG-105': { uid: 'task-3', key: 'ENG-105', parent: 'ENG-102', ... }
//   },
//   uidMap: {
//     'epic-1': 'ENG-100',
//     'story-1': 'ENG-101',
//     'story-2': 'ENG-102',
//     'task-1': 'ENG-103',
//     'task-2': 'ENG-104',
//     'task-3': 'ENG-105'
//   },
//   manifestId: 'bulk-abc123',
//   errors: {}
// }
```

### CSV with Numeric UIDs

```csv
uid,Project,Issue Type,Summary,Parent
1,ENG,Epic,Q4 Platform,
2,ENG,Story,Caching layer,1
3,ENG,Story,Monitoring,1
4,ENG,Subtask,Research backends,2
5,ENG,Subtask,Redis implementation,2
6,ENG,Subtask,Prometheus setup,3
```

```javascript
const result = await jml.issues.create({ from: 'issues.csv' });
// Library:
// 1. Detects uid field
// 2. Sorts: 1 → [2,3] → [4,5,6]
// 3. Creates in order
// 4. Replaces Parent "1" with "ENG-100" before creating row 2
```

### Mixed References (UID + Key + Summary)

```javascript
await jml.issues.create([
  { 
    uid: 'epic-1',
    Project: 'ENG', 
    'Issue Type': 'Epic', 
    Summary: 'Q4 Platform'
  },
  { 
    uid: 'story-1',
    Project: 'ENG', 
    'Issue Type': 'Story', 
    Summary: 'New feature',
    Parent: 'epic-1' // UID reference
  },
  { 
    uid: 'story-2',
    Project: 'ENG', 
    'Issue Type': 'Story', 
    Summary: 'Link to existing',
    Parent: 'ENG-50' // Existing JIRA key
  },
  { 
    uid: 'task-1',
    Project: 'ENG', 
    'Issue Type': 'Subtask', 
    Summary: 'Link by name',
    Parent: 'Q3 Infrastructure' // Summary search (JIRA)
  }
]);
```

### Retry After Partial Failure

```javascript
// First attempt: Epic created, story failed
try {
  await jml.issues.create([
    { uid: 'epic-1', Project: 'ENG', 'Issue Type': 'Epic', Summary: 'Q4' },
    { uid: 'story-1', Project: 'ENG', 'Issue Type': 'Story', Summary: 'Feature', Parent: 'epic-1' }
  ]);
} catch (error) {
  console.log(error.manifestId); // "bulk-abc123"
  // Epic created: ENG-100
  // Story failed: Network timeout
}

// Retry (user fixes network issue)
const retryResult = await jml.issues.create([
  { uid: 'epic-1', ... }, // Skipped (already created)
  { uid: 'story-1', ... }  // Created with Parent: ENG-100 (from manifest)
], { retry: 'bulk-abc123' });

console.log(retryResult.uidMap);
// { 'epic-1': 'ENG-100', 'story-1': 'ENG-106' }
```

---

## Definition of Done

### Code Complete
- [ ] `UIDDetector` implemented with parsing and validation
- [ ] `DependencyGraph` implemented with topological sort and cycle detection
- [ ] `ParentReferenceResolver` implemented with 5-level resolution priority
- [ ] `UIDReplacer` implemented with UID → Key tracking
- [ ] `AmbiguityPolicyConfig.parent` added to config types
- [ ] Integration with `IssueOperations.create()` complete
- [ ] Integration with `ManifestManager` complete (UID map storage)

### Tests Passing
- [ ] All unit tests passing (uid-detection, parent-resolution, topological-sort, circular-dependency, hierarchy-errors)
- [ ] All integration tests passing (bulk-hierarchy, bulk-hierarchy-retry, bulk-no-uids)
- [ ] Test coverage ≥95% (statements, branches, functions, lines)
- [ ] No regressions: All existing tests still passing

### Documentation
- [ ] TSDoc comments for all public methods
- [ ] Inline comments for complex logic (topological sort, resolution priority)
- [ ] README example added (hierarchy with UIDs)
- [ ] Architecture doc updated (if new patterns introduced)

### Code Quality
- [ ] TypeScript strict mode passing
- [ ] ESLint passing (no warnings)
- [ ] No console.log or debug code
- [ ] Error messages clear and actionable

### Demo
- [ ] Demo added: `demo-app/demos/bulk-hierarchy.ts`
- [ ] Demo shows: 
  - Basic hierarchy (Epic → Story → Subtask) with UIDs
  - Mixed references (UID + key + summary)
  - Retry after partial failure (parent created, child failed)
  - CSV with numeric UIDs
  - Error handling (circular dependency, ambiguous references)
- [ ] Demo output shows: UID → Key mappings, creation order, manifest ID
- [ ] Demo documented in demo-app README

### Integration
- [ ] Works with existing parsers (E4-S01)
- [ ] Works with existing manifest storage (E4-S02)
- [ ] Works with existing bulk API wrapper (E4-S03)
- [ ] Works with existing retry logic (E4-S05)
- [ ] No breaking changes to existing APIs

### Definition of Done Exceptions

*(None - all items are achievable)*

---

## Demo Requirements

**Location**: `demo-app/demos/bulk-hierarchy.ts`

**Content**:
1. **Basic Hierarchy**: Create Epic → 3 Stories → 5 Subtasks using UIDs
   - Show input with `uid` field and `Parent` references
   - Show creation order (topological sort)
   - Show UID → Key mappings in result
2. **CSV with Numeric UIDs**: Load `fixtures/hierarchy.csv` with numeric UIDs
   - Show CSV format
   - Show parsed result with hierarchy created
3. **Mixed References**: Create issues with UID, key, and summary references
   - Show resolution priority working correctly
4. **Retry After Failure**: Simulate partial failure, then retry
   - Show manifest with UID mappings
   - Show retry skipping already-created issues
   - Show parent UID resolved from manifest
5. **Error Handling**: Show circular dependency detection
   - Show clear error message with cycle path

**Expected Output**:
```
=== Basic Hierarchy with UIDs ===
Input:
  - uid: 'epic-1', Issue Type: Epic, Summary: Q4 Platform
  - uid: 'story-1', Issue Type: Story, Parent: epic-1
  - uid: 'task-1', Issue Type: Subtask, Parent: story-1

Creation Order (Topological Sort):
  1. epic-1 (depth 0) → ENG-100
  2. story-1 (depth 1, parent: ENG-100) → ENG-101
  3. task-1 (depth 2, parent: ENG-101) → ENG-102

Result:
  Succeeded: 3/3 issues
  UID Map: { 'epic-1': 'ENG-100', 'story-1': 'ENG-101', 'task-1': 'ENG-102' }
  Manifest ID: bulk-abc123

=== CSV with Numeric UIDs ===
[Shows CSV loaded and hierarchy created]

=== Retry After Partial Failure ===
[Shows manifest loaded, UIDs resolved, retry successful]

=== Error: Circular Dependency ===
Input: epic-1 → story-1 → epic-1
Error: Circular dependency detected: epic-1 → story-1 → epic-1
```

---

## Story Size Justification

**Size**: Large (8 points)

**Rationale**:
- **Complexity**: Topological sort, circular dependency detection, 5-level resolution priority
- **Scope**: 10 ACs covering UID detection, parent resolution, graph algorithms, retry integration, config update
- **Dependencies**: 7 story dependencies (E4-S01 through E4-S05, E3-S03, E3-S05)
- **Testing**: 6 unit test files + 3 integration test scenarios
- **Integration**: Touch 5+ existing modules (parser, manifest, bulk API, operations, config)
- **Duration**: Estimated 1-2 days for experienced developer

**Similar to**:
- E4-S01 (8 pts): Parser with 3 formats + backward compatibility testing
- E4-S04 (8 pts): Unified create with input detection + batching
- E4-S05 (8 pts): Retry with manifest filtering + merging

**Smaller than**:
- Would be 13 pts if included custom graph library implementation (using existing library reduces scope)

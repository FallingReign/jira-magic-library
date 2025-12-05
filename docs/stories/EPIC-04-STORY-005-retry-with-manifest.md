# E4-S05: Retry with Manifest Support

**Epic**: Epic 4 - Bulk Operations  
**Size**: Large (8 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: Commits 83ac58a (implementation), 044536f (coverage tests), e2a7f7e (DoD complete)  
**Started**: 2025-11-17  
**Completed**: 2025-11-18

---

## User Story

**As a** developer using the library  
**I want** to retry failed bulk imports by passing a manifest ID  
**So that** I can fix errors and resume without re-creating successful issues

---

## Acceptance Criteria

### ✅ AC1: Accept Retry Parameter
- [x] Accept `{ retry: manifestId }` in options parameter
- [x] Load manifest from Redis using ManifestStorage
- [x] Throw error if manifest not found or expired
- [x] Log warning if manifest is older than 24 hours

**Evidence**: [IssueOperations.ts lines 101-107](../../../src/operations/IssueOperations.ts#L101-L107) (dispatch), [lines 118-197](../../../src/operations/IssueOperations.ts#L118-L197) (retryWithManifest), commit 83ac58a 

### ✅ AC2: Filter Input Based on Manifest
- [x] Get succeeded row indices from manifest
- [x] Remove succeeded rows from input array
- [x] Preserve original row indices for failed rows
- [x] Only process rows that previously failed

**Evidence**: [IssueOperations.ts lines 199-207](../../../src/operations/IssueOperations.ts#L199-L207) (filtering logic), commit 83ac58a 

### ✅ AC3: Process Failed Rows Only
- [x] Call bulk API with filtered payloads
- [x] Map results back to original row indices
- [x] Track which retried rows succeeded/failed

**Evidence**: [IssueOperations.ts lines 209-244](../../../src/operations/IssueOperations.ts#L209-L244) (validation + bulk API + index mapping), commit 83ac58a 

### ✅ AC4: Merge Results with Original Manifest
- [x] Update manifest.succeeded with new successes
- [x] Update manifest.failed with remaining failures
- [x] Update manifest.created with new issue keys
- [x] Update manifest.errors with new/updated errors
- [x] Store merged manifest back to Redis

**Evidence**: [IssueOperations.ts lines 246-280](../../../src/operations/IssueOperations.ts#L246-L280) (manifest merging + storage), commit 83ac58a 

### ✅ AC5: Return Combined Result
- [x] Return BulkResult with original + new results
- [x] Total count includes all original rows
- [x] Succeeded count includes original + retry successes
- [x] Failed count is updated failures only
- [x] Same manifest ID throughout retry chain

**Evidence**: [IssueOperations.ts lines 282-305](../../../src/operations/IssueOperations.ts#L282-L305) (result building), commit 83ac58a 

### ✅ AC6: Handle Multiple Retries
- [x] Support retrying same manifest multiple times
- [x] Each retry processes remaining failed rows
- [x] Manifest accumulates all successes across retries
- [x] Stop when no failed rows remain

**Evidence**: [IssueOperations.ts lines 246-280](../../../src/operations/IssueOperations.ts#L246-L280) (manifest merging logic preserves ID and accumulates), commit 83ac58a 

### ✅ AC7: Testing Coverage
- [x] Unit tests for manifest filtering logic
- [x] Unit tests for result merging
- [x] Integration test: create → partial fail → retry → success
- [x] Integration test: multiple retries in sequence
- [x] 95% test coverage

**Evidence**: 
- Unit tests: [IssueOperations-retry.test.ts](../../../tests/unit/operations/IssueOperations-retry.test.ts) (24 tests, all passing)
- Fixtures: [retry-manifests.ts](../../../tests/fixtures/retry-manifests.ts) (4 scenarios)
- Helpers: [retry-test-utils.ts](../../../tests/helpers/retry-test-utils.ts) (4 utilities)
- Coverage: 97.37% overall (commits 0128bdd, 4190fc3)
- Integration tests: [retry-with-manifest.test.ts](../../../tests/integration/retry-with-manifest.test.ts) (6 tests, all passing, commit 0cf1c3e) 

### ✅ AC8: Interactive Demo with Retry Flow
- [x] Extend `bulk-import.js` demo to support retry
- [x] After creation, detect if failures exist
- [x] Offer retry option: "Some issues failed. Would you like to fix and retry?"
- [x] Display failed rows with their error messages
- [x] Allow user to edit failed row values interactively
- [x] Call `create(editedData, { retry: manifestId })` with manifest ID
- [x] Show merged results (original + retry successes)
- [x] Display final summary with accumulated results
- [x] Support multiple retry attempts until all succeed or user cancels
- [x] Generate JQL search link to view all created issues
- [x] Display clickable link: `{baseUrl}/issues/?jql=key in (PROJ-123, PROJ-124, PROJ-125)`

**Evidence**: Commit b2d3d42 - Added 207-line `retryFailedIssues()` function in [retryFailedIssues.js](../../../demo-app/src/features/retryFailedIssues.js) with:
- Failure detection ([lines 312-329](../../../demo-app/src/features/retryFailedIssues.js#L312-L329))
- Error display with intelligent parsing ([lines 400-606](../../../demo-app/src/features/retryFailedIssues.js#L400-L606))
- Interactive field editing via inquirer checkboxes
- Retry with same manifest ID
- Accumulated results display
- JQL link generation ([lines 330-345](../../../demo-app/src/features/retryFailedIssues.js#L330-L345), [lines 580-587](../../../demo-app/src/features/retryFailedIssues.js#L580-L587)) 

**Demo Flow:**
```
1. Parse CSV/JSON/YAML ✅ (existing)
2. Create issues ✅ (existing)
3. Show manifest with results ✅ (existing)
4. ⭐ NEW: If failures exist, ask "Fix and retry?" 
5. ⭐ NEW: Show each failed row with error
6. ⭐ NEW: Prompt user to edit failed values
7. ⭐ NEW: Call create() with { retry: manifestId }
8. ⭐ NEW: Show merged results (same manifest ID)
9. ⭐ NEW: Repeat until all succeed or user exits
10. ⭐ NEW: Show JQL link to view all created issues
```

**Example Interaction:**
```
✅ Created 2/3 issues
❌ Failed: 1
📂 Manifest ID: bulk-abc123

Failed Issues:
  1. Row 3: "Add dark mode support"
     Error: Issue Type 'Story' does not exist

Would you like to fix errors and retry? (y/n) y

Editing failed row 3:
  Current: Issue Type = "Story"
  Enter new value (or press Enter to keep): Task

Retrying with manifest bulk-abc123...
✅ Created 1/1 remaining issues

Final Results:
✅ Succeeded: 3/3 (all issues created!)
📂 Manifest ID: bulk-abc123 (same manifest)

🔍 View all created issues:
   https://your-jira.atlassian.net/issues/?jql=key in (PROJ-123, PROJ-124, PROJ-125)
```

---

## Technical Notes

### Architecture Prerequisites
- [Bulk Processor](../architecture/system-architecture.md#6-bulk-processor)
- Redis-based manifest storage from E4-S02
- Key decision: Explicit retry parameter (not auto-detect)

### Testing Prerequisites
**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [x] Redis running with manifest storage enabled
- [x] JIRA credentials configured
- [x] Test fixtures with intentional failures

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Verify manifest storage working
redis-cli keys "bulk:manifest:*"
```

---

## Related Stories

- **Depends On**: 
  - E4-S02 (Manifest Storage) - for loading/updating manifests
  - E4-S04 (Unified create() Method) - extends with retry capability
- **Blocks**: None
- **Related**: E4-S06 (Rollback JQL Generator) - uses manifest data

## Design Note: Error Format Independence

Retry logic uses only `manifest.succeeded` and `manifest.failed` arrays for filtering.
Error details (format defined by E4-S02/E4-S03) are stored/updated but not parsed by retry logic.
This makes retry independent of JIRA's error format changes.

---

## Testing Strategy

### Unit Tests
- **File**: `tests/unit/operations/RetryWithManifest.test.ts`
- **Coverage Target**: ≥95%
- **Focus Areas**:
  - Manifest loading from Redis
  - Input filtering (skip succeeded rows)
  - Result merging logic
  - Multiple sequential retry handling

### Integration Tests
- **File**: `tests/integration/retry-flow.test.ts`
- **Focus Areas**:
  - Create bulk → partial failure → retry with manifest ID → success
  - Multiple retry attempts (fix in stages)
  - Combined result verification (original + retries)
  - Manifest update after each retry

### Prerequisites
- JIRA credentials configured
- Redis running (for manifest storage)
- Test data with intentional failures

---

## Technical Notes

### Architecture Prerequisites
- E4-S02: Bulk Result Manifest & Redis Storage
- E4-S04: Unified create() Method

### Implementation Guidance

**Retry Flow:**
```typescript
async create(input: any, options?: { retry?: string }): Promise<BulkResult> {
  let manifestData: BulkManifest | null = null;
  let filteredInput = input;
  
  // Load existing manifest if retry
  if (options?.retry) {
    manifestData = await manifestStorage.getManifest(options.retry);
    if (!manifestData) {
      throw new Error(`Manifest ${options.retry} not found or expired`);
    }
    
    // Filter input to remove succeeded rows
    filteredInput = input.filter((row: any, index: number) => {
      return !manifestData!.succeeded.includes(index);
    });
    
    console.log(`Retrying ${filteredInput.length} failed rows`);
  }
  
  // Process filtered input
  const result = await processBulk(filteredInput);
  
  // Merge with existing manifest if retry
  if (manifestData) {
    return mergeResults(manifestData, result);
  }
  
  return result;
}
```

**Result Merging:**
```typescript
function mergeResults(original: BulkManifest, retry: BulkResult): BulkResult {
  return {
    manifest: {
      id: original.id,
      timestamp: original.timestamp,
      total: original.total,
      succeeded: [...original.succeeded, ...retry.manifest.succeeded],
      failed: retry.manifest.failed,  // Only remaining failures
      created: { ...original.created, ...retry.manifest.created },
      errors: { ...original.errors, ...retry.manifest.errors }
    },
    total: original.total,
    succeeded: original.succeeded.length + retry.succeeded,
    failed: retry.failed,
    results: [...original.results, ...retry.results]  // Combined history
  };
}
```

---

## Implementation Example

```typescript
// First attempt - some fail
const result1 = await jml.issues.create(payload);
console.log(`Attempt 1: ${result1.succeeded}/${result1.total} succeeded`);
console.log(`Manifest ID: ${result1.manifest.id}`);

// Fix failed rows in payload
payload[3]['Issue Type'] = 'Task';  // Fix invalid type
payload[5].Summary = 'Fixed summary';  // Fix missing field

// Retry with manifest ID
const result2 = await jml.issues.create(payload, { 
  retry: result1.manifest.id 
});
console.log(`Attempt 2: ${result2.succeeded}/${result2.total} succeeded`);

// Same manifest ID, accumulated results
assert(result2.manifest.id === result1.manifest.id);
assert(result2.succeeded === result1.succeeded + 2);  // 2 more succeeded
```

---

## Definition of Done

- [x] All acceptance criteria met with evidence links
- [x] Code implemented in `src/operations/IssueOperations.ts` (extend create())
- [x] Unit tests passing (≥95% coverage)
- [x] Integration test: full retry flow passing
- [x] Demo extended: `bulk-import.js` with interactive retry capability
  - [x] Detect failures and offer retry
  - [x] Display failed rows with error messages
  - [x] Allow user to edit failed values
  - [x] Call `create()` with `{ retry: manifestId }`
  - [x] Show merged results with accumulated successes
  - [x] Support multiple retry attempts
- [x] TSDoc comments updated for retry parameter
- [x] Code passes linting and type checking
- [x] Testing prerequisites documented
- [x] Committed with message: `E4-S05: Implement retry support with manifest tracking`

### Coverage Challenge & Resolution

**Initial Issue**: After implementing E4-S05 behavior changes (graceful unknown field handling in FieldResolver, Redis offline queue), overall branch coverage dropped from expected baseline to 93.47%.

**Root Cause**: The story's behavior changes modified execution paths in existing code:
- FieldResolver.ts: Changed unknown field handling from throw → warn+skip (lines 133-159)
- RedisCache.ts: Changed `enableOfflineQueue: false` → `true` (line 147)

These changes affected multiple files that use these components, leaving edge case branches uncovered.

**Resolution**: Added comprehensive branch coverage tests across 7 files:
- FieldResolver.test.ts: Fixed fuzzy match test expectations
- ArrayConverter.test.ts: Registry availability edge cases (2 tests)
- DateTimeConverter.test.ts: Formatter exception wrapping (1 test)
- IssueTypeConverter.test.ts: Hierarchy degradation + caching (5 tests)
- OptionWithChildConverter.test.ts: JIRA API format validation (2 tests)
- IssueOperations-retry.test.ts: Retry operation edge cases (5 tests)
- InputParser.test.ts: Comprehensive branch coverage (7 tests)

**Final Coverage**: 96.11% branches (766/797 covered)
- Started: 93.47% (745/797)
- Gained: 21 branches (+2.64%)
- **Result**: ✅ Exceeds 95% requirement

**Evidence**: Commits 89452c5, 4581b57, 044536f

**Note**: While E4-S05 code itself was well-tested (100% coverage of new retry logic), the ripple effects of behavior changes required systematic coverage improvements across the interconnected codebase. This is expected when modifying core infrastructure components like FieldResolver and RedisCache.

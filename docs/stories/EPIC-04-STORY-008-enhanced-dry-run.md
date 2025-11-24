# E4-S08: Enhanced Dry-Run Mode

**Epic**: Epic 4 - Bulk Operations  
**Size**: Small (3 points)  
**Priority**: P1  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer using the library  
**I want** an enhanced dry-run mode that shows the full JIRA payload  
**So that** I can verify what will be sent to JIRA before actually creating issues

---

## Acceptance Criteria

### ✅ AC1: Extend Existing validate Option
- [ ] Enhance existing `{ validate: true }` option from E1-S09
- [ ] Return full JIRA API payload in result
- [ ] Include all converted fields with JIRA IDs
- [ ] Do NOT call JIRA API

**Evidence**: 

### ✅ AC2: Show Converted Fields
- [ ] Perform complete field resolution (names → IDs)
- [ ] Perform complete value conversion (names → JIRA objects)
- [ ] Include all lookups (user, component, version IDs)
- [ ] Show exact payload that would be sent to JIRA

**Evidence**: 

### ✅ AC3: Bulk Dry-Run Support
- [ ] Support dry-run for bulk input
- [ ] Return array of payloads (one per issue)
- [ ] Include row index with each payload
- [ ] Show batching plan (which issues in which batch)

**Evidence**: 

### ✅ AC4: Result Format
- [ ] For single issue: Return `{ key: 'DRY-RUN', payload: {...} }`
- [ ] For bulk: Return `{ dryRun: true, payloads: [{index, payload}] }`
- [ ] Include manifest with dryRun: true flag
- [ ] No actual API calls made

**Evidence**: 

### ✅ AC5: Testing Coverage
- [ ] Unit tests for dry-run with single issue
- [ ] Unit tests for dry-run with bulk input
- [ ] Integration test showing full payload generation
- [ ] 95% test coverage

**Evidence**: 

---

## Technical Notes

### Architecture Prerequisites
- [Issue Operations Module](../architecture/system-architecture.md#5-issue-operations-module)
- Extends existing validate option from E1-S09

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [ ] Redis running for lookups
- [ ] JIRA credentials for schema/lookup fetching

**Start Prerequisites:**
```bash
npm run redis:start
```

---

## Related Stories

- **Depends On**: 
  - E1-S09 (Single Issue Creation) - extends validate option
  - E4-S04 (Unified create()) - extends for bulk
- **Blocks**: None
- **Related**: E4-S07 (Schema Validation) - different validation approach

---

## Testing Strategy

### Unit Tests
- **File**: `tests/unit/operations/DryRun.test.ts`
- **Coverage Target**: ≥95%
- **Focus Areas**:
  - Dry-run flag handling
  - Payload generation (no API call)
  - Single vs bulk dry-run
  - Batching plan generation

### Integration Tests
- **File**: `tests/integration/dry-run.test.ts`
- **Focus Areas**:
  - Dry-run single issue (verify payload structure)
  - Dry-run bulk (verify all payloads generated)
  - Verify no actual JIRA API calls made
  - Verify field resolution and conversion happens

### Prerequisites
- JIRA credentials (for field resolution/conversion)
- Redis running (for caching)

---

## Technical Notes

### Architecture Prerequisites
- E1-S09: Create Single Issue API (extends validate option)
- E4-S04: Unified create() Method

### Implementation Guidance

**Enhanced validate option:**
```typescript
async create(input: any, options?: { validate?: boolean }): Promise<Issue | BulkResult> {
  // ... field resolution and conversion
  
  if (options?.validate) {
    // Single issue
    if (isSingleInput) {
      return {
        key: 'DRY-RUN',
        id: '0',
        self: '',
        payload: convertedFields  // NEW: Include payload
      };
    }
    
    // Bulk
    return {
      dryRun: true,
      total: payloads.length,
      payloads: payloads.map((payload, index) => ({
        index,
        payload
      })),
      manifest: { id: 'dry-run', /* ... */ }
    };
  }
  
  // Normal create flow...
}
```

---

## Implementation Example

```typescript
// Dry-run single issue
const result = await jml.issues.create({
  Project: 'ENG',
  'Issue Type': 'Task',
  Summary: 'Test issue',
  Assignee: 'john.doe@company.com'
}, { validate: true });

console.log('Would create with payload:');
console.log(JSON.stringify(result.payload, null, 2));
// Shows:
// {
//   "project": { "key": "ENG" },
//   "issuetype": { "id": "10001" },
//   "summary": "Test issue",
//   "assignee": { "accountId": "5f8..." }
// }

// Dry-run bulk
const bulkResult = await jml.issues.create([
  { Project: 'ENG', Summary: 'Issue 1' },
  { Project: 'ENG', Summary: 'Issue 2' }
], { validate: true });

console.log(`Would create ${bulkResult.total} issues:`);
bulkResult.payloads.forEach(item => {
  console.log(`Row ${item.index}:`, JSON.stringify(item.payload));
});
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Code updated in `src/operations/IssueOperations.ts`
- [ ] Unit tests passing (≥95% coverage)
- [ ] Integration test showing payload generation
- [ ] Demo created showing dry-run mode
- [ ] TSDoc comments updated
- [ ] Code passes linting and type checking
- [ ] Committed with message: `E4-S08: Enhance dry-run mode to show full JIRA payload`

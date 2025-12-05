# E4-S06: Rollback JQL Generator

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
**I want** to generate a JQL search URL for all created issues in a bulk operation  
**So that** I can review and optionally delete them via JIRA UI

---

## Acceptance Criteria

### ✅ AC1: Generate JQL from Manifest
- [ ] Accept manifest ID or BulkResult
- [ ] Extract created issue keys from manifest.created
- [ ] Generate JQL: `key IN (KEY-1, KEY-2, ...)`
- [ ] Handle empty created list (return null)

**Evidence**: 

### ✅ AC2: Generate JIRA Search URL
- [ ] Build complete URL: `{baseUrl}/issues/?jql={encodedJQL}`
- [ ] URL-encode JQL string
- [ ] Use baseUrl from library config
- [ ] Return full clickable URL

**Evidence**: 

### ✅ AC3: Handle Large Key Lists
- [ ] Support up to 1000 keys in JQL (JIRA limit)
- [ ] If >1000 keys, generate multiple URLs
- [ ] Return array of URLs if split needed
- [ ] Log warning if keys exceed limit

**Evidence**: 

### ✅ AC4: Testing Coverage
- [ ] Unit test: JQL generation from keys
- [ ] Unit test: URL encoding
- [ ] Unit test: Large key list splitting
- [ ] Unit test: Empty key list handling
- [ ] 95% test coverage

**Evidence**: 

---

## Technical Notes

### Architecture Prerequisites
- None (simple utility function)
- Uses baseUrl from JMLConfig

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [ ] No special prerequisites (unit tests only)

---

## Related Stories

- **Depends On**: E4-S02 (Manifest Storage) - uses manifest.created keys
- **Blocks**: None
- **Related**: E4-S04 (Unified create()) - rollback for bulk operations

---

## Testing Strategy

### Unit Tests
- **File**: `tests/unit/operations/RollbackJQL.test.ts`
- **Coverage Target**: ≥95%
- **Focus Areas**:
  - JQL generation from key list
  - URL encoding
  - Large key list handling (>1000 keys)
  - Empty manifest handling

### Integration Tests
- **File**: `tests/integration/rollback-jql.test.ts`
- **Focus Areas**:
  - Generate JQL for real manifest
  - Verify URL format
  - Test with 1000+ keys (pagination)

### Prerequisites
- Test manifests with varying key counts

---

## Technical Notes

### Architecture Prerequisites
- E4-S02: Bulk Result Manifest (uses manifest.created)

### Implementation Guidance

**API:**
```typescript
export interface RollbackInfo {
  jql: string;
  url: string;
  count: number;
}

export function generateRollbackJQL(
  manifest: BulkManifest,
  baseUrl: string
): RollbackInfo | null {
  const keys = Object.values(manifest.created);
  
  if (keys.length === 0) {
    return null;
  }
  
  const jql = `key IN (${keys.join(',')})`;
  const encodedJQL = encodeURIComponent(jql);
  const url = `${baseUrl}/issues/?jql=${encodedJQL}`;
  
  return { jql, url, count: keys.length };
}
```

**Usage:**
```typescript
const rollback = generateRollbackJQL(result.manifest, jiraBaseUrl);

if (rollback) {
  console.log(`Created ${rollback.count} issues`);
  console.log(`Review: ${rollback.url}`);
  console.log(`To delete, visit JIRA and bulk delete using this search`);
}
```

---

## Implementation Example

```typescript
import { generateRollbackJQL } from './RollbackHelper';

const manifest = {
  id: 'bulk-123',
  created: {
    '0': 'PROJ-24659',
    '1': 'PROJ-24660',
    '2': 'PROJ-24661'
  },
  // ... other manifest fields
};

const rollback = generateRollbackJQL(manifest, 'https://jira.company.com');

console.log(rollback);
// {
//   jql: 'key IN (PROJ-24659,PROJ-24660,PROJ-24661)',
//   url: 'https://jira.company.com/issues/?jql=key%20IN%20(PROJ-24659%2CPROJ-24660%2CPROJ-24661)',
//   count: 3
// }
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Code implemented in `src/operations/RollbackHelper.ts`
- [ ] Unit tests passing (≥95% coverage)
- [ ] No integration tests needed (URL generation only)
- [ ] Demo created showing URL generation
- [ ] TSDoc comments added
- [ ] Code passes linting and type checking
- [ ] Committed with message: `E4-S06: Implement rollback JQL generator for created issues`

# E4-S03: JIRA Bulk API Wrapper

**Epic**: Epic 4 - Bulk Operations  
**Size**: Medium (5 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: Commits 5988ed4 (implementation), 743b1d5 (demo fixes), 483301b (lint fix)  
**Started**: 2025-11-14  
**Completed**: 2025-11-14

---

## User Story

**As a** library maintainer  
**I want** a wrapper around JIRA's `/rest/api/2/issue/bulk` endpoint  
**So that** I can create multiple issues in a single API call with proper error handling

---

## Acceptance Criteria

### ✅ AC1: Call JIRA Bulk API
- [x] POST to `/rest/api/2/issue/bulk` **Evidence**: [src/operations/JiraBulkApiWrapper.ts:100-103](../../src/operations/JiraBulkApiWrapper.ts#L100-L103)
- [x] Payload format: `{ issueUpdates: [{ fields: {...} }, ...] }` **Evidence**: [src/operations/JiraBulkApiWrapper.ts:102](../../src/operations/JiraBulkApiWrapper.ts#L102)
- [x] Use existing JiraClient from E1-S05 **Evidence**: [src/operations/JiraBulkApiWrapper.ts:41-42](../../src/operations/JiraBulkApiWrapper.ts#L41-L42)
- [x] Set appropriate headers (Content-Type: application/json) **Evidence**: [JiraClient sets headers](../../src/client/JiraClient.ts#L150-L155)

### ✅ AC2: Handle Partial Success (HTTP 201)
- [x] Parse response with `issues` array (created issues) **Evidence**: [src/operations/JiraBulkApiWrapper.ts:114-123](../../src/operations/JiraBulkApiWrapper.ts#L114-L123)
- [x] Parse response with `errors` array (failed issues) **Evidence**: [src/operations/JiraBulkApiWrapper.ts:126-135](../../src/operations/JiraBulkApiWrapper.ts#L126-L135)
- [x] Map `failedElementNumber` to original row index **Evidence**: [src/operations/JiraBulkApiWrapper.ts:127](../../src/operations/JiraBulkApiWrapper.ts#L127)
- [x] Extract issue keys from successful creations **Evidence**: [src/operations/JiraBulkApiWrapper.ts:119](../../src/operations/JiraBulkApiWrapper.ts#L119)

### ✅ AC3: Handle Full Failure (HTTP 400)
- [x] Parse response with only `errors` array **Evidence**: [src/operations/JiraBulkApiWrapper.ts:126-135](../../src/operations/JiraBulkApiWrapper.ts#L126-L135)
- [x] Empty `issues` array **Evidence**: [tests/unit/operations/JiraBulkApiWrapper.test.ts:223-254](../../tests/unit/operations/JiraBulkApiWrapper.test.ts#L223-L254)
- [x] Map all errors to row indices **Evidence**: [src/operations/JiraBulkApiWrapper.ts:127-134](../../src/operations/JiraBulkApiWrapper.ts#L127-L134)
- [x] Preserve JIRA error messages **Evidence**: [src/operations/JiraBulkApiWrapper.ts:132-133](../../src/operations/JiraBulkApiWrapper.ts#L132-L133)

### ✅ AC4: Error Mapping
- [x] Map JIRA `elementErrors.errors` to ErrorDetail format **Evidence**: [src/operations/JiraBulkApiWrapper.ts:130-134](../../src/operations/JiraBulkApiWrapper.ts#L130-L134)
- [x] Include field name from error object keys **Evidence**: [src/operations/JiraBulkApiWrapper.ts:132](../../src/operations/JiraBulkApiWrapper.ts#L132)
- [x] Include error message from error object values **Evidence**: [src/operations/JiraBulkApiWrapper.ts:133](../../src/operations/JiraBulkApiWrapper.ts#L133)
- [x] Preserve HTTP status code per error **Evidence**: [src/operations/JiraBulkApiWrapper.ts:131](../../src/operations/JiraBulkApiWrapper.ts#L131)

### ✅ AC5: Response Normalization
- [x] Return consistent BulkApiResult regardless of success/failure **Evidence**: [src/operations/JiraBulkApiWrapper.ts:109-141](../../src/operations/JiraBulkApiWrapper.ts#L109-L141)
- [x] Include created issues with keys, IDs, and self URLs **Evidence**: [src/operations/JiraBulkApiWrapper.ts:115-123](../../src/operations/JiraBulkApiWrapper.ts#L115-L123)
- [x] Include failed issues with row indices and error details **Evidence**: [src/operations/JiraBulkApiWrapper.ts:126-135](../../src/operations/JiraBulkApiWrapper.ts#L126-L135)
- [x] Calculate total/succeeded/failed counts **Evidence**: [src/operations/JiraBulkApiWrapper.ts:110-112](../../src/operations/JiraBulkApiWrapper.ts#L110-L112)

### ✅ AC6: Testing Coverage
- [x] Unit tests with mocked JIRA responses (partial success, full failure) **Evidence**: [tests/unit/operations/JiraBulkApiWrapper.test.ts:23 tests](../../tests/unit/operations/JiraBulkApiWrapper.test.ts)
- [x] Unit tests for error mapping **Evidence**: [tests/unit/operations/JiraBulkApiWrapper.test.ts:223-254](../../tests/unit/operations/JiraBulkApiWrapper.test.ts#L223-L254)
- [x] Integration test with real JIRA bulk endpoint **Evidence**: [tests/integration/bulk-api-wrapper.test.ts:5 tests](../../tests/integration/bulk-api-wrapper.test.ts)
- [x] Test with intentional failures (invalid issue type) **Evidence**: [tests/integration/bulk-api-wrapper.test.ts:131-184](../../tests/integration/bulk-api-wrapper.test.ts#L131-L184)
- [x] 95% test coverage **Evidence**: Coverage 98.05% (>95% requirement)

---

## Technical Notes

### Architecture Prerequisites
- [JIRA API Client](../architecture/system-architecture.md#2-jira-api-client)
- Uses existing JiraClient.post() method from E1-S05
- Response format documented from Epic 4 planning (tested Nov 12, 2025)

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [x] JIRA credentials configured in .env **Evidence**: Integration tests passing (would fail without credentials)
- [x] JIRA_PROJECT_KEY points to valid project **Evidence**: Integration tests successfully create issues
- [x] Test project allows bulk issue creation **Evidence**: [bulk-api-wrapper.test.ts](../../tests/integration/bulk-api-wrapper.test.ts) line 50-62 creates 3 issues

**Start Prerequisites:**
```bash
# Verify JIRA connection
cat .env | grep JIRA_BASE_URL
cat .env | grep JIRA_PAT
```

---

## Related Stories

- **Depends On**: E1-S05 (JIRA API Client) - uses JiraClient for HTTP calls
- **Blocks**: E4-S04 (Unified create() Method) - needs bulk API wrapper
- **Related**: None

---

## Testing Strategy

### Unit Tests
- **File**: `tests/unit/operations/JiraBulkApiWrapper.test.ts`
- **Coverage Target**: ≥95%
- **Focus Areas**:
  - Response parsing (HTTP 201 partial success)
  - Response parsing (HTTP 400 full failure)
  - Error mapping from JIRA `elementErrors` to library format
  - Response normalization

### Integration Tests
- **File**: `tests/integration/bulk-api-wrapper.test.ts`
- **Focus Areas**:
  - Call real JIRA bulk API with valid issues (all succeed)
  - Call with mix of valid/invalid issues (partial success)
  - Call with all invalid issues (full failure)
  - Verify error details mapped correctly

### Prerequisites
- JIRA credentials configured (.env)
- JIRA project with permissions for bulk creation
- Test data with intentional errors (missing required fields)

---

## Technical Notes

### Architecture Prerequisites

**JIRA API Response Format (Tested):**
```typescript
// Partial success (HTTP 201)
{
  "issues": [
    {
      "id": "4894364",
      "key": "ZUL-24659",
      "self": "https://.../rest/api/2/issue/4894364"
    }
  ],
  "errors": [
    {
      "status": 400,
      "elementErrors": {
        "errorMessages": [],
        "errors": {
          "issuetype": "issue type is required"
        }
      },
      "failedElementNumber": 2  // Zero-indexed
    }
  ]
}
```

**Wrapper Interface:**
```typescript
export interface BulkApiResult {
  created: Array<{
    index: number;
    key: string;
    id: string;
    self: string;
  }>;
  failed: Array<{
    index: number;
    status: number;
    errors: Record<string, string>;  // field → message
  }>;
}

export class JiraBulkApiWrapper {
  constructor(private client: JiraClient) {}

  async createBulk(payloads: Array<{ fields: Record<string, any> }>): Promise<BulkApiResult> {
    const response = await this.client.post('/rest/api/2/issue/bulk', {
      issueUpdates: payloads
    });
    
    return this.normalizeResponse(response);
  }

  private normalizeResponse(response: any): BulkApiResult {
    // Map JIRA response to BulkApiResult
  }
}
```

---

## Implementation Example

```typescript
const wrapper = new JiraBulkApiWrapper(jiraClient);

const payloads = [
  { fields: { project: { key: 'ENG' }, issuetype: { name: 'Task' }, summary: 'Issue 1' } },
  { fields: { project: { key: 'ENG' }, issuetype: { name: 'InvalidType' }, summary: 'Issue 2' } }
];

const result = await wrapper.createBulk(payloads);

console.log(`Created: ${result.created.length}`);
console.log(`Failed: ${result.failed.length}`);

result.created.forEach(item => {
  console.log(`Row ${item.index}: ${item.key}`);
});

result.failed.forEach(item => {
  console.log(`Row ${item.index}: ${Object.entries(item.errors)}`);
});
```

---

## Definition of Done

- [x] All acceptance criteria met with evidence links **Evidence**: All ACs checked above
- [x] Code implemented in `src/operations/JiraBulkApiWrapper.ts` **Evidence**: [JiraBulkApiWrapper.ts](../../src/operations/JiraBulkApiWrapper.ts)
- [x] Unit tests passing (≥95% coverage) **Evidence**: 23 unit tests, coverage 98.05%
- [x] Integration test with real JIRA passing **Evidence**: [bulk-api-wrapper.test.ts](../../tests/integration/bulk-api-wrapper.test.ts) - 5 tests passing
- [x] Demo created in `demo-app/` showing bulk API behavior (success, partial failure, full failure) **Evidence**: [bulk-api-wrapper-demo.js](../../demo-app/src/features/bulk-api-wrapper-demo.js) - manually tested Nov 14, 2025
- [x] TSDoc comments added to public APIs **Evidence**: [JiraBulkApiWrapper.ts:30-86](../../src/operations/JiraBulkApiWrapper.ts#L30-L86)
- [x] Code passes linting and type checking **Evidence**: `npm run lint` passes (0 errors)
- [x] Testing prerequisites documented **Evidence**: Story file lines 82-92
- [x] Committed with message: `E4-S03: Implement JIRA bulk API wrapper with error mapping` **Evidence**: Commits 5988ed4, 743b1d5, 483301b

---

## Demo Requirements

**Demo Location**: `demo-app/demos/bulk-api-wrapper.ts`

**Demo Content**: Show JIRA bulk API behavior:
1. Successful bulk creation (all issues valid)
2. Partial failure (mix of valid and invalid issues)
3. Full failure (all issues invalid)
4. Error mapping from JIRA format to library format
5. Show response structure for each scenario

**Expected Output**: Console showing:
- Successful creation: List of created issue keys
- Partial failure: HTTP 201, both `issues[]` and `errors[]` arrays populated
- Full failure: HTTP 400, only `errors[]` array populated
- Clear error messages mapped from JIRA's `elementErrors` format

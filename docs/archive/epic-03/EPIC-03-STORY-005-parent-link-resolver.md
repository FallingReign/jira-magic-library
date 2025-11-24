# E3-S05: Parent Link Resolver (Key or Summary Search)

**Epic**: Epic 3 - Issue Hierarchy & Complex Types
**Size**: Medium (5 points)
**Priority**: P0
**Status**: ✅ Done
**Assignee**: Claude Sonnet 4.5
**PR**: Commit a0c6408, 72c3cdb
**Started**: 2025-11-03
**Completed**: 2025-11-03

---

## User Story

**As a** developer using the library  
**I want** to specify parent issues by key or summary text  
**So that** I don't need to look up issue keys manually when creating child issues

---

## Acceptance Criteria

### ✅ AC1: Accept Exact Issue Key
- [x] Accept parent as exact key: `"PROJ-1234"` **Evidence**: [isIssueKey check](src/hierarchy/ParentLinkResolver.ts:51-52), [resolveByKey](src/hierarchy/ParentLinkResolver.ts:78-117), [tests](tests/unit/hierarchy/ParentLinkResolver.test.ts:71-96)
- [x] Validate key format: `[A-Z]+-[0-9]+` **Evidence**: [regex validation](src/hierarchy/ParentLinkResolver.ts:259), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:72-96)
- [x] Fetch issue by key from JIRA API **Evidence**: [API call](src/hierarchy/ParentLinkResolver.ts:86-92), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:83-96)
- [x] Throw NotFoundError if key doesn't exist **Evidence**: [error handling](src/hierarchy/ParentLinkResolver.ts:86-92), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:148-164)
- [x] Return issue key (pass-through, no transformation) **Evidence**: [return uppercase](src/hierarchy/ParentLinkResolver.ts:117), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:94)


### ✅ AC2: Accept Summary Text Search
- [x] Accept parent as summary text: `"newsroom - phase 1"` **Evidence**: [resolveBySummary](src/hierarchy/ParentLinkResolver.ts:134-244), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:184-193)
- [x] Search issues by summary using JQL: `summary ~ "newsroom - phase 1"` **Evidence**: [JQL construction](src/hierarchy/ParentLinkResolver.ts:188), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:196-203)
- [x] Case-insensitive search **Evidence**: [normalize for cache](src/hierarchy/ParentLinkResolver.ts:143), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:205-233)
- [x] Exact phrase matching (wrap in quotes for JQL) **Evidence**: [JQL quotes](src/hierarchy/ParentLinkResolver.ts:188), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:251-264)


### ✅ AC3: Filter by Valid Parent Level (JPO Hierarchy)
- [x] Get child's issue type ID from context **Evidence**: [parameter](src/hierarchy/ParentLinkResolver.ts:136), [usage](src/hierarchy/ParentLinkResolver.ts:167)
- [x] Get valid parent level from JPO hierarchy (E3-S03) **Evidence**: [getParentLevel call](src/hierarchy/ParentLinkResolver.ts:167), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:284-297)
- [x] Filter search results to only parent level issue types **Evidence**: [JQL filter](src/hierarchy/ParentLinkResolver.ts:188), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:268-297)
- [x] Intersect with project's available issue types (from schema) **Evidence**: [validParentTypeIds](src/hierarchy/ParentLinkResolver.ts:177), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:299-326)
- [x] Only return issues that are valid parents for child type **Evidence**: [JQL issuetype IN](src/hierarchy/ParentLinkResolver.ts:188), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:295-297)


### ✅ AC4: Handle Ambiguity (Multiple Matches)
- [x] If multiple issues match summary search, throw AmbiguityError **Evidence**: [ambiguity check](src/hierarchy/ParentLinkResolver.ts:215), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:330-371)
- [x] Include candidate list in error: issue keys, summaries, issue types **Evidence**: [candidate format](src/hierarchy/ParentLinkResolver.ts:216-218), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:373-412)
- [x] Suggest user provides more specific summary or uses exact key **Evidence**: [error message](src/hierarchy/ParentLinkResolver.ts:221), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:415-452)
- [x] Error format: `AmbiguityError("Multiple parents match 'newsroom': PROJ-123 (Epic), PROJ-456 (Phase)")` **Evidence**: [error construction](src/hierarchy/ParentLinkResolver.ts:220-231), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:409-411)


### ✅ AC5: Handle Not Found
- [x] If no issues match summary search, throw NotFoundError **Evidence**: [not found check](src/hierarchy/ParentLinkResolver.ts:207), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:456-475)
- [x] Include search term in error message **Evidence**: [error message](src/hierarchy/ParentLinkResolver.ts:209), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:485-500)
- [x] Suggest checking summary text or using exact key **Evidence**: [error context](src/hierarchy/ParentLinkResolver.ts:208-210), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:477-500)
- [x] Error format: `NotFoundError("No parent found matching 'newsroom - phase 1'")` **Evidence**: [error construction](src/hierarchy/ParentLinkResolver.ts:208-211), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:498)


### ✅ AC6: Validate Parent is Higher Level
- [x] Use JPO hierarchy to validate parent is exactly 1 level above child **Evidence**: [isValidParent check](src/hierarchy/ParentLinkResolver.ts:108), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:529-552)
- [x] Throw HierarchyError if parent is same level as child **Evidence**: [validation logic](src/hierarchy/ParentLinkResolver.ts:110-114), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:554-576)
- [x] Throw HierarchyError if parent is lower level than child **Evidence**: [validation logic](src/hierarchy/ParentLinkResolver.ts:110-114), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:578-600)
- [x] Throw HierarchyError if parent is >1 level above child **Evidence**: [isValidParent implementation](src/hierarchy/JPOHierarchyDiscovery.ts:152-163), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:529-552)
- [x] Error format: `HierarchyError("Cannot set Story as parent of Epic (wrong hierarchy level)")` **Evidence**: [error message](src/hierarchy/ParentLinkResolver.ts:111-114), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:626)


### ✅ AC7: Return Resolved Parent Key
- [x] Return parent issue key as string **Evidence**: [return type](src/hierarchy/ParentLinkResolver.ts:41-49), [return statements](src/hierarchy/ParentLinkResolver.ts:117,244)
- [x] Format: `"PROJ-1234"` (uppercase project key) **Evidence**: [toUpperCase](src/hierarchy/ParentLinkResolver.ts:117), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:94,121,146)
- [x] Ready to use in parent field value **Evidence**: [return value](src/hierarchy/ParentLinkResolver.ts:244), [integration test](tests/integration/parent-link-resolver.test.ts:111-122)
- [x] Cache resolved key for performance (short TTL: 5 minutes) **Evidence**: [cache.set with TTL=300](src/hierarchy/ParentLinkResolver.ts:239), [test](tests/unit/hierarchy/ParentLinkResolver.test.ts:687-716,743-776)


---

## Technical Notes

### Architecture Prerequisites
- [Field Conversion Engine](../architecture/system-architecture.md#4-field-resolution--conversion-engine)
- [JPO Hierarchy Discovery](EPIC-03-STORY-003-jpo-hierarchy-discovery.md)
- Key design patterns: JQL search, ambiguity detection, hierarchy validation
- Key constraints: Native fetch, Redis cache, 95% test coverage

## Testing Strategy

Unit tests cover all seven acceptance criteria with 28 test cases achieving 95.55% coverage on ParentLinkResolver.ts. Integration tests verify real JIRA operations across 5 scenarios including exact key resolution, summary search, ambiguity handling, not found cases, and hierarchy validation.

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2).

**Before running tests, ensure:**
- Redis running on localhost:6379 (`npm run redis:start`)
- .env file configured with JIRA credentials
- JIRA_PROJECT_KEY set to project with hierarchy configured
- Test data: Known parent issues with unique summaries
- Test data: Ambiguous summaries (multiple matches)

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Verify test issues exist
curl -u admin:token "${JIRA_BASE_URL}/rest/api/2/search?jql=project=PROJ AND summary ~ 'test parent'"
```

### Dependencies
- E1-S05 (JIRA API Client): JQL search queries
- E1-S06 (Schema Discovery): Get project's available issue types
- E2-S05 (Ambiguity Detection): Use ambiguity error pattern
- E3-S03 (JPO Hierarchy): Get valid parent level

### Implementation Guidance

**JQL search for parent by summary:**
```typescript
// Search query
const jql = `project = ${projectKey} AND summary ~ "${summaryText}" AND issuetype IN (${parentIssueTypeIds.join(',')})`;

// Example
const jql = `project = PROJ AND summary ~ "newsroom" AND issuetype IN (10000, 11002, 11700)`;
```

**Module structure:**
```typescript
// src/hierarchy/ParentLinkResolver.ts

export async function resolveParentLink(
  input: string,
  childIssueTypeId: string,
  projectKey: string,
  context: ConversionContext
): Promise<string> {
  // Check if input is exact key format
  if (isIssueKey(input)) {
    return await resolveByKey(input, childIssueTypeId, projectKey, context);
  }
  
  // Search by summary
  return await resolveBySummary(input, childIssueTypeId, projectKey, context);
}

async function resolveByKey(
  key: string,
  childIssueTypeId: string,
  projectKey: string,
  context: ConversionContext
): Promise<string> {
  // Fetch issue
  const issue = await context.apiClient.get(`/rest/api/2/issue/${key}`);
  
  // Validate parent level
  const isValid = isValidParent(
    childIssueTypeId,
    issue.fields.issuetype.id,
    context.hierarchy
  );
  
  if (!isValid) {
    throw new HierarchyError(
      `Issue ${key} (${issue.fields.issuetype.name}) is not a valid parent for ${childIssueTypeId}`
    );
  }
  
  return key.toUpperCase();
}

async function resolveBySummary(
  summaryText: string,
  childIssueTypeId: string,
  projectKey: string,
  context: ConversionContext
): Promise<string> {
  // Get valid parent level
  const parentLevel = getParentLevel(childIssueTypeId, context.hierarchy);
  if (!parentLevel) {
    throw new HierarchyError(`Issue type ${childIssueTypeId} has no valid parent level`);
  }
  
  // Get project's available issue types
  const projectSchema = await context.schemaCache.getProjectSchema(projectKey);
  const availableTypeIds = projectSchema.issueTypes.map(t => t.id);
  
  // Intersect with parent level types
  const validParentTypeIds = parentLevel.issueTypeIds.filter(id =>
    availableTypeIds.includes(id)
  );
  
  // Build JQL search
  const jql = `project = ${projectKey} AND summary ~ "${summaryText}" AND issuetype IN (${validParentTypeIds.join(',')})`;
  
  const results = await context.apiClient.post('/rest/api/2/search', {
    jql,
    fields: ['summary', 'issuetype'],
    maxResults: 10
  });
  
  if (results.data.total === 0) {
    throw new NotFoundError(`No parent found matching '${summaryText}'`);
  }
  
  if (results.data.total > 1) {
    const candidates = results.data.issues.map(issue =>
      `${issue.key} (${issue.fields.issuetype.name})`
    ).join(', ');
    throw new AmbiguityError(
      `Multiple parents match '${summaryText}': ${candidates}`
    );
  }
  
  return results.data.issues[0].key;
}

function isIssueKey(input: string): boolean {
  return /^[A-Z]+-[0-9]+$/i.test(input);
}
```

**Cache strategy:**
```typescript
// Cache resolved parent key (short TTL - summaries can change)
const cacheKey = `parent-resolve:${projectKey}:${summaryText}`;
// TTL: 300 seconds (5 minutes)
```

**Hierarchy validation:**
```typescript
// Use E3-S03 helper
const isValid = isValidParent(childTypeId, parentTypeId, hierarchy);

// Examples
isValidParent("10001", "13301", hierarchy) // true: Story → Epic
isValidParent("10001", "10204", hierarchy) // false: Story → Subtask (wrong direction)
isValidParent("10001", "10001", hierarchy) // false: Story → Story (same level)
```

---

## Implementation Example

```typescript
// Example 1: Exact key
const parentKey = await resolveParentLink("PROJ-1234", "10001", "PROJ", context);
console.log(parentKey); // "PROJ-1234"

// Example 2: Summary search (unique match)
const parentKey = await resolveParentLink("newsroom - phase 1", "10001", "PROJ", context);
console.log(parentKey); // "PROJ-789" (found via summary search)

// Example 3: Ambiguous summary
try {
  await resolveParentLink("newsroom", "10001", "PROJ", context);
} catch (error) {
  console.error(error);
  // AmbiguityError: Multiple parents match 'newsroom': PROJ-123 (Epic), PROJ-456 (Phase)
}

// Example 4: Not found
try {
  await resolveParentLink("nonexistent issue", "10001", "PROJ", context);
} catch (error) {
  console.error(error);
  // NotFoundError: No parent found matching 'nonexistent issue'
}

// Example 5: Invalid hierarchy level
try {
  await resolveParentLink("PROJ-999", "13301", "PROJ", context);
  // PROJ-999 is a Story, trying to set as parent of Epic
} catch (error) {
  console.error(error);
  // HierarchyError: Issue PROJ-999 (Story) is not a valid parent for Epic
}
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] Unit tests written and passing (≥95% coverage)
- [x] Integration test with exact key resolution
- [x] Integration test with summary search (unique match)
- [x] Integration test with ambiguous summary (multiple matches)
- [x] Integration test with not found summary
- [x] Integration test with invalid hierarchy validation
- [x] Code follows project conventions (ESLint passing)
- [x] Type definitions exported in public API
- [x] No console.log or debug code remaining
- [x] Git commit follows convention: `E3-S05: Implement parent link resolver`
- [x] Demo decision documented (see Demo Decision section)

---

## Demo Decision

**Question**: Should E3-S05 add parent linking examples to demo app?

**Decision**: ❌ **Demo NOT required for E3-S05**

**Rationale**:
- E3-S05 is an **infrastructure story** - implements the internal resolver helper function
- Story **E3-S09: Integration Tests** will add comprehensive parent linking demos including:
  - AC10: Update Demo App with Hierarchy Examples
  - Parent field with exact keys (`"PROJ-123"`)
  - Parent field with summary search (`"newsroom - phase 1"`)
  - Multi-level hierarchies (subtask → story → epic → phase)
  - All parent synonyms ("Parent", "Epic Link", "Epic", etc.)
- Adding partial demo to E3-S05 would be premature - E3-S09 will provide complete user-facing examples
- Tests provide sufficient evidence of functionality (28 unit tests, 5 integration tests, 95.82% coverage)

**Alternative Evidence**:
- Unit tests: [ParentLinkResolver.test.ts](tests/unit/hierarchy/ParentLinkResolver.test.ts) - 28 test cases covering all ACs
- Integration tests: [parent-link-resolver.test.ts](tests/integration/parent-link-resolver.test.ts) - 5 real JIRA scenarios
- Test coverage: 95.82% branch coverage on ParentLinkResolver.ts
- Implementation examples in story file (lines 244-277)

**Approved By**: User decision confirmed that E3-S09 will handle comprehensive demos

---

## Related Stories

- **Depends On**: E1-S05 (API Client - JQL), E1-S06 (Schema Discovery), E2-S05 (Ambiguity Detection), E3-S03 (JPO Hierarchy), E3-S04 (Parent Field Discovery)
- **Blocks**: E3-S06 (Parent Synonym Handler), E3-S09 (Integration Tests)
- **Related**: E2-S07 (Priority Resolver - similar pattern), E2-S08 (User Resolver - similar pattern)

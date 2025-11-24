# E3-S06: Parent Synonym Handler

**Epic**: Epic 3 - Issue Hierarchy & Complex Types
**Size**: Small (3 points)
**Priority**: P0
**Status**: ✅ Done
**Assignee**: GitHub Copilot
**PR**: Commit eb96a41
**Started**: 2025-11-03
**Completed**: 2025-11-03

---

## User Story

**As a** developer using the library  
**I want** to use "Parent", "Epic Link", or "Epic" interchangeably  
**So that** I can create parent-child relationships with intuitive field names regardless of JIRA's field configuration

---

## Acceptance Criteria

### ✅ AC1: Accept Parent Synonyms
- [x] Accept "Parent" as field name **Evidence**: [PARENT_SYNONYMS array](src/converters/FieldResolver.ts:15), [isParentSynonym check](src/converters/FieldResolver.ts:92), [unit tests](tests/unit/hierarchy/ParentSynonymHandler.test.ts:92-142)
- [x] Accept "Epic Link" as field name **Evidence**: [same array](src/converters/FieldResolver.ts:15)
- [x] Accept "Epic" as field name **Evidence**: [same array](src/converters/FieldResolver.ts:15)
- [x] Accept "Parent Issue" as field name **Evidence**: [same array](src/converters/FieldResolver.ts:15)
- [x] Accept "Parent Link" as field name **Evidence**: [same array](src/converters/FieldResolver.ts:15)
- [x] All synonyms case-insensitive **Evidence**: [normalizeFieldName usage](src/converters/FieldResolver.ts:329), [case tests](tests/unit/hierarchy/ParentSynonymHandler.test.ts:93-109), [integration tests](tests/integration/parent-synonyms.test.ts:170-188)


### ✅ AC2: Map to Discovered Parent Field
- [x] Use parent field discovery (E3-S04) to get actual field key **Evidence**: [getParentFieldKey call](src/converters/FieldResolver.ts:360), [test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:192-205)
- [x] Map all synonyms to the same discovered field (e.g., `customfield_10014`) **Evidence**: [resolveParentSynonym](src/converters/FieldResolver.ts:348-406), [test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:145-170)
- [x] Works regardless of actual field name in JIRA instance **Evidence**: [field name independence test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:172-190)
- [x] Example: User says "Parent", maps to "Epic Link" field in JIRA **Evidence**: [integration in resolveFields](src/converters/FieldResolver.ts:92-100)


### ✅ AC3: Resolve Parent Value
- [x] Use parent link resolver (E3-S05) to resolve value **Evidence**: [resolveParentLink call](src/converters/FieldResolver.ts:392-400), [test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:208-231)
- [x] Accept exact key: `"Parent: PROJ-1234"` **Evidence**: [exact key test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:209-231)
- [x] Accept summary search: `"Epic Link: newsroom - phase 1"` **Evidence**: [summary search test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:233-255), [integration test](tests/integration/parent-synonyms.test.ts:59-88)
- [x] Works with any synonym: `"Epic: PROJ-1234"` same as `"Parent: PROJ-1234"` **Evidence**: [all synonyms test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:257-283)


### ✅ AC4: Validate Hierarchy at Any Level
- [x] Works for Subtask → Story: `"Parent: STORY-123"` **Evidence**: [issueTypeId passed to resolver](src/converters/FieldResolver.ts:394), [subtask test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:311-333), [integration test](tests/integration/parent-synonyms.test.ts:91-103)
- [x] Works for Story → Epic: `"Epic Link: EPIC-456"` **Evidence**: [story-epic test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:335-357), [integration test](tests/integration/parent-synonyms.test.ts:105-117)
- [x] Works for Epic → Phase: `"Parent: PHASE-789"` **Evidence**: [epic-phase test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:359-380), [integration test](tests/integration/parent-synonyms.test.ts:119-137)
- [x] Works for Phase → Container: `"Parent: CONTAINER-012"` **Evidence**: [phase-container test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:383-405)
- [x] Validate using JPO hierarchy (E3-S03) regardless of synonym used **Evidence**: [hierarchyDiscovery passed](src/converters/FieldResolver.ts:398), [hierarchy validation](tests/unit/hierarchy/ParentSynonymHandler.test.ts:287-309)


### ✅ AC5: Handle Missing Parent Field
- [x] If parent field not discovered (E3-S04 returns null), throw ConfigurationError **Evidence**: [null check and error](src/converters/FieldResolver.ts:362-366), [test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:409-420)
- [x] Error message: `"Project does not have a parent field configured"` **Evidence**: [error message](src/converters/FieldResolver.ts:363-365), [message test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:422-436)
- [x] Suggest checking JIRA project configuration **Evidence**: [error message text](src/converters/FieldResolver.ts:364-365)
- [x] Don't crash - clear actionable error **Evidence**: [ConfigurationError usage](src/converters/FieldResolver.ts:355-357), [actionable test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:438-453), [integration test](tests/integration/parent-synonyms.test.ts:140-168)


### ✅ AC6: Integration with Field Resolver
- [x] Register parent synonyms in field resolver (E1-S07) **Evidence**: [synonym check in resolveFields](src/converters/FieldResolver.ts:92), [isParentSynonym method](src/converters/FieldResolver.ts:328-331)
- [x] Works with standard field conversion flow **Evidence**: [integration in resolveFields](src/converters/FieldResolver.ts:78-171), [standard flow test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:471-490)
- [x] Example: `createIssue({ "Parent": "PROJ-123", ... })` resolves automatically **Evidence**: [no special handling test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:492-514)
- [x] No special handling required by end user **Evidence**: [backward compatibility test](tests/unit/hierarchy/ParentSynonymHandler.test.ts:544-560)


---

## Testing Strategy

### Unit Tests
- **Location**: `tests/unit/hierarchy/ParentSynonymHandler.test.ts`
- **Coverage**: 100% (all synonym mappings, error cases, hierarchy validation)
- **Mocking**: Mock parent field discovery, parent link resolver, hierarchy discovery
- **Key scenarios**:
  - All parent synonyms map to same field
  - Case-insensitive matching
  - Summary search with synonyms
  - Hierarchy validation at multiple levels
  - Error handling (missing parent field, invalid hierarchy)

### Integration Tests
- **Location**: `tests/integration/parent-synonyms.test.ts`
- **Scope**: Real JIRA API validation with live data
- **Prerequisites**: JPO hierarchy configured, parent field available
- **Key scenarios**:
  - Create issue using each parent synonym
  - Summary search with parent synonyms
  - Hierarchy validation (Subtask→Story, Story→Epic, Epic→Phase)
  - Error case: project without parent field

### Test Data Requirements
- Test project with JPO hierarchy enabled
- At least 3 hierarchy levels (e.g., Subtask, Story, Epic)
- Parent issues at each level for link testing
- Issues with distinct summaries for search testing

---

## Technical Notes

### Architecture Prerequisites
- [Field Name Resolution](../architecture/system-architecture.md#field-name-resolution)
- [Parent Field Discovery](EPIC-03-STORY-004-parent-field-discovery.md)
- [Parent Link Resolver](EPIC-03-STORY-005-parent-link-resolver.md)
- Key design patterns: Synonym mapping, field resolver integration
- Key constraints: Native fetch, 95% test coverage

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- Redis running on localhost:6379 (`npm run redis:start`)
- .env file configured with JIRA credentials
- JIRA_PROJECT_KEY set to project with parent field
- Test data: Issues at multiple hierarchy levels

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Verify hierarchy configured
curl -u admin:token ${JIRA_BASE_URL}/rest/jpo-api/1.0/hierarchy
```

### Dependencies
- E1-S07 (Field Name Resolution): Register synonyms
- E3-S03 (JPO Hierarchy): Validate hierarchy
- E3-S04 (Parent Field Discovery): Get actual field key
- E3-S05 (Parent Link Resolver): Resolve parent value

### Implementation Guidance

**Synonym registration pattern:**
```typescript
// src/hierarchy/ParentSynonymHandler.ts

const PARENT_SYNONYMS = [
  'parent',
  'epic link',
  'epic',
  'parent issue',
  'parent link'
];

export function registerParentSynonyms(
  fieldResolver: FieldResolver,
  projectKey: string
): void {
  PARENT_SYNONYMS.forEach(synonym => {
    fieldResolver.registerAlias(synonym, async (context) => {
      // Get actual parent field key
      const parentFieldKey = await getParentFieldKey(projectKey);
      
      if (!parentFieldKey) {
        throw new ConfigurationError(
          `Project ${projectKey} does not have a parent field configured`
        );
      }
      
      return parentFieldKey;
    });
  });
}
```

**Field conversion integration:**
```typescript
// In field conversion flow (extends E1-S07)

export async function resolveFieldName(
  fieldName: string,
  projectKey: string,
  context: ConversionContext
): Promise<FieldSchema> {
  // Check if it's a parent synonym
  if (isParentSynonym(fieldName)) {
    const parentFieldKey = await getParentFieldKey(projectKey);
    if (!parentFieldKey) {
      throw new ConfigurationError(
        `Project ${projectKey} does not have a parent field configured`
      );
    }
    return context.schemaCache.getFieldSchema(projectKey, parentFieldKey);
  }
  
  // ... existing field resolution logic
}

export async function convertFieldValue(
  fieldName: string,
  value: any,
  projectKey: string,
  issueTypeId: string,
  context: ConversionContext
): Promise<any> {
  // Check if it's a parent synonym
  if (isParentSynonym(fieldName)) {
    // Resolve parent link (key or summary)
    return await resolveParentLink(value, issueTypeId, projectKey, context);
  }
  
  // ... existing conversion logic
}

function isParentSynonym(fieldName: string): boolean {
  const normalized = fieldName.toLowerCase().trim();
  return PARENT_SYNONYMS.includes(normalized);
}
```

**Hierarchy validation example:**
```typescript
// Story → Epic
const parentKey = await resolveParentLink("EPIC-123", "10001", "PROJ", context);
// Validates: 10001 (Story) can have parent from Epic level

// Epic → Phase
const parentKey = await resolveParentLink("PHASE-456", "13301", "PROJ", context);
// Validates: 13301 (Epic) can have parent from Phase level

// Subtask → Story
const parentKey = await resolveParentLink("STORY-789", "16101", "PROJ", context);
// Validates: 16101 (Subtask) can have parent from Story level
```

**Error handling:**
```typescript
// Missing parent field
try {
  await resolveFieldName("Parent", "SIMPLE", context);
} catch (error) {
  // ConfigurationError: Project SIMPLE does not have a parent field configured
}

// Invalid hierarchy
try {
  await convertFieldValue("Epic Link", "STORY-123", "PROJ", "13301", context);
  // Trying to set Story as parent of Epic
} catch (error) {
  // HierarchyError: Issue STORY-123 (Story) is not a valid parent for Epic
}
```

---

## Implementation Example

```typescript
// Example 1: Using "Parent" synonym
const issue = await createIssue({
  project: "PROJ",
  issueType: "Story",
  summary: "New story",
  "Parent": "EPIC-123"  // ← Synonym for epic link field
});
// Resolves to: customfield_10014: "EPIC-123"

// Example 2: Using "Epic Link" synonym
const issue = await createIssue({
  project: "PROJ",
  issueType: "Story",
  summary: "New story",
  "Epic Link": "newsroom - phase 1"  // ← Summary search
});
// Resolves to: customfield_10014: "EPIC-789" (found via search)

// Example 3: Using "Epic" synonym
const issue = await createIssue({
  project: "PROJ",
  issueType: "Story",
  summary: "New story",
  "Epic": "EPIC-123"  // ← Short form
});
// Same as Example 1

// Example 4: Subtask parent
const subtask = await createIssue({
  project: "PROJ",
  issueType: "Sub-task",
  summary: "Implementation task",
  "Parent": "STORY-456"  // ← Subtask → Story
});
// Validates hierarchy: Subtask can have Story parent

// Example 5: Epic parent (Advanced Roadmap)
const epic = await createIssue({
  project: "PROJ",
  issueType: "Epic",
  summary: "New epic",
  "Parent": "PHASE-789"  // ← Epic → Phase
});
// Validates hierarchy: Epic can have Phase parent
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] Unit tests written and passing (≥95% coverage)
- [x] Integration test with each parent synonym
- [x] Integration test at multiple hierarchy levels (Subtask→Story, Story→Epic, Epic→Phase)
- [x] Integration test with summary search using synonym
- [x] Integration test with missing parent field (error handling)
- [x] Code follows project conventions (ESLint passing)
- [x] Type definitions exported in public API
- [x] No console.log or debug code remaining
- [x] Git commit follows convention: `E3-S06: Implement parent synonym handler`

---

## Related Stories

- **Depends On**: E1-S07 (Field Name Resolution), E3-S03 (JPO Hierarchy), E3-S04 (Parent Field Discovery), E3-S05 (Parent Link Resolver)
- **Blocks**: E3-S09 (Integration Tests)
- **Related**: E1-S09 (Create Single Issue - uses field resolver)

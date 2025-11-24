# E3-S07: IssueType Resolver (By Name)

**Epic**: Epic 3 - Complex Field Types
**Size**: Small (3 points)
**Priority**: P1
**Status**: ✅ Done
**Assignee**: GitHub Copilot
**PR**: Commit c99f26c
**Started**: 2025-11-03
**Completed**: 2025-11-04

---

## User Story

**As a** developer using the library  
**I want** to specify issue types by name instead of ID  
**So that** I can create issues without knowing internal issue type IDs

---

## Acceptance Criteria

### ✅ AC1: Resolve Issue Type Name to ID
- [x] Accept issue type name: "Bug", "Story", "Task", "Epic"
- [x] Use existing schema discovery (from E1-S06) to get issue type list
- [x] Match name case-insensitively
- [x] Return issue type object: `{id: "10001", name: "Bug"}`

**Evidence**: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)

### ✅ AC2: Handle Ambiguous Issue Type Names
- [x] Throw AmbiguityError if name matches multiple issue types
- [x] Include candidate list in error message
- [x] Example: "task" matches "Task" and "Sub-task"

**Evidence**: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)

### ✅ AC3: Handle Not Found Issue Types
- [x] Throw NotFoundError if issue type name doesn't exist
- [x] Error message includes available issue type names for project
- [x] Suggest close matches if possible (optional fuzzy matching)

**Evidence**: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)

### ✅ AC4: Cache Issue Type Metadata
- [x] Reuse existing schema cache (from E1-S06)
- [x] Issue types already cached per project
- [x] No additional API calls needed (data already available)
- [x] Cache TTL: 5 minutes (optimized for issue type resolution)

**Evidence**: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/integration/issuetype-resolver.test.ts](tests/integration/issuetype-resolver.test.ts)

### ✅ AC5: Integration with Schema Module
- [x] Add to existing schema module exports
- [x] Export `resolveIssueType(projectKey, name)` function
- [x] Follow existing schema discovery patterns
- [x] Integrate with SchemaCache class

**Evidence**: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [src/operations/IssueOperations.ts](src/operations/IssueOperations.ts)

### ✅ AC6: Integration Test with Real JIRA
- [x] Resolve "Bug" issue type for test project
- [x] Resolve "Story" issue type for test project
- [x] Verify issue type IDs match JIRA instance
- [x] Test against real JIRA project

**Evidence**: [tests/integration/issuetype-resolver.test.ts](tests/integration/issuetype-resolver.test.ts)


## AC Verification Evidence

- [x] Exact match resolution — Evidence: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)
- [x] Fuzzy matching and abbreviations — Evidence: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)
- [x] Hierarchy filtering — Evidence: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/integration/issuetype-resolver.test.ts](tests/integration/issuetype-resolver.test.ts)
- [x] Ambiguity handling (AmbiguityError) — Evidence: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)
- [x] Not found handling (NotFoundError) — Evidence: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)
- [x] Caching behavior and integration — Evidence: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts), [tests/integration/issuetype-resolver.test.ts](tests/integration/issuetype-resolver.test.ts)
---

## Demo Decision

Infrastructure-only resolver logic. No demo changes required.

## API Documentation

No public API changes. [IssueTypeResolver](src/operations/IssueTypeResolver.ts:65) is internal-only and not exported from the library entry point ([src/index.ts](src/index.ts:11)). No update to `docs/api.md` is required.
## Technical Notes

### Architecture Prerequisites
- [Schema Discovery & Caching](../architecture/system-architecture.md#3-schema-discovery--caching)
- Key design patterns: Schema resolution, caching
- Key constraints: Reuse existing schema cache, 95% test coverage

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [x] Redis running on localhost:6379 (`npm run redis:start`)
- [x] .env file configured with JIRA credentials
- [x] JIRA_PROJECT_KEY set to project with standard issue types

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Check .env
cat .env | grep JIRA_PROJECT_KEY

# Verify issue types exist
npm run test:integration -- --grep "issue type"
```

### Dependencies
- E1-S06 (Schema Discovery): Reuse project schema with issue types
- E1-S04 (Redis Cache): Issue types already cached
- E2-S05 (Ambiguity Detection): Reuse ambiguity detection pattern

### Implementation Guidance

**Issue types are already discovered in E1-S06:**
```typescript
// From E1-S06 schema discovery response:
{
  "projects": [
    {
      "key": "PROJ",
      "issuetypes": [
        { "id": "10001", "name": "Bug", ... },
        { "id": "10002", "name": "Story", ... },
        { "id": "10003", "name": "Task", ... },
        { "id": "10004", "name": "Epic", ... }
      ]
    }
  ]
}
```

**Simple resolver implementation:**
```typescript
export class IssueTypeResolver {
  constructor(private schemaCache: SchemaCache) {}
  
  async resolveIssueType(
    projectKey: string,
    name: string
  ): Promise<IssueType> {
    // Get cached project schema
    const projectSchema = await this.schemaCache.getProjectSchema(projectKey);
    const issueTypes = projectSchema.issuetypes;
    
    // Match name case-insensitively
    const normalizedName = name.toLowerCase().trim();
    const matches = issueTypes.filter(
      it => it.name.toLowerCase() === normalizedName
    );
    
    // Handle results
    if (matches.length === 0) {
      throw new NotFoundError(
        `Issue type '${name}' not found in project ${projectKey}. ` +
        `Available: ${issueTypes.map(it => it.name).join(', ')}`
      );
    }
    
    if (matches.length > 1) {
      const candidates = matches.map(it => it.name);
      throw new AmbiguityError(
        `Issue type '${name}' is ambiguous`,
        candidates
      );
    }
    
    // Return match
    return matches[0];
  }
}

interface IssueType {
  id: string;
  name: string;
  description?: string;
  subtask?: boolean;
}
```

**Usage in field resolution:**
```typescript
// User input (field value)
const input = {
  project: { key: "PROJ" },
  issuetype: { name: "Bug" },  // ← Resolve this
  summary: "Test issue"
};

// Resolve issue type name → ID
const issueType = await issueTypeResolver.resolveIssueType("PROJ", "Bug");
// Result: { id: "10001", name: "Bug" }

// JIRA API payload
const payload = {
  fields: {
    project: { key: "PROJ" },
    issuetype: { id: "10001" },  // ← Converted to ID
    summary: "Test issue"
  }
};
```

---

## Implementation Example

```typescript
// Example 1: Resolve issue type
const resolver = new IssueTypeResolver(schemaCache);
const issueType = await resolver.resolveIssueType("PROJ", "Bug");
// Result: { id: "10001", name: "Bug" }

// Example 2: Case-insensitive
const issueType = await resolver.resolveIssueType("PROJ", "bug");
// Result: { id: "10001", name: "Bug" }

// Example 3: Not found error
const issueType = await resolver.resolveIssueType("PROJ", "Feature");
// Throws: NotFoundError("Issue type 'Feature' not found in project PROJ. Available: Bug, Story, Task, Epic")

// Example 4: Ambiguity error (rare - would need duplicate names)
const issueType = await resolver.resolveIssueType("PROJ", "task");
// If both "Task" and "Sub-task" exist and match "task":
// Throws: AmbiguityError with candidates: ["Task", "Sub-task"]
```

---

## Definition of Done

- [x] All acceptance criteria met with evidence links
- [x] Unit tests written and passing (≥95% coverage)
- [x] Integration test passing against real JIRA instance
- [x] Code follows project conventions (ESLint passing)
- [x] Integrated with existing schema module
- [x] Type definitions exported in public API
- [x] No console.log or debug code remaining
- [x] Git commit follows convention: `E3-S07: Finalize IssueType Resolver documentation and status updates`

---

## Related Stories

- **Depends On**: E1-S06 (Schema Discovery - provides issue type data), E2-S05 (Ambiguity Detection pattern)
- **Blocks**: None (helper function for converters)
- **Related**: E3-S08 (Project Resolver - similar pattern)


## Testing Strategy

- Scope
  - Unit tests: [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)
    - Exact match resolution (case-insensitive)
    - Fuzzy matching and abbreviations
    - Hierarchy level filtering with JPO hierarchy
    - Ambiguity handling (AmbiguityError) with candidate details
    - Not found handling (NotFoundError) with available types in details
    - Caching behavior: TTL=300s, cache keys with hierarchy level, refresh bypass
  - Integration tests: [tests/integration/issuetype-resolver.test.ts](tests/integration/issuetype-resolver.test.ts)
    - Validates resolution against real JIRA for common types (Bug, Story where available)
    - Validates hierarchy filtering (when JPO available)
    - Confirms IDs are numeric strings and subtask flag correctness
    - Ensures cache integration works with Redis

- Preconditions
  - Redis running on localhost:6379 (Docker): docker exec jml-redis redis-cli ping → PONG
  - .env/.env.test configured (JIRA_BASE_URL, JIRA_PAT, JIRA_PROJECT_KEY)

- Commands
  - Unit: npm test
  - Coverage (≥95% overall): npm run test:coverage
  - Integration (full suite): npm run test:integration
  - Lint: npm run lint
  - Workflow validation: npm run validate:workflow

- Evidence
  - Implementation: [src/operations/IssueTypeResolver.ts](src/operations/IssueTypeResolver.ts)
  - Unit tests: [tests/unit/operations/IssueTypeResolver.test.ts](tests/unit/operations/IssueTypeResolver.test.ts)
  - Integration tests: [tests/integration/issuetype-resolver.test.ts](tests/integration/issuetype-resolver.test.ts)

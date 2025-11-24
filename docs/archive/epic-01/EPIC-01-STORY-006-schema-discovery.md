# E1-S06: Schema Discovery for Project + Issue Type

**Epic**: Epic 1 - Basic Issue Creation  
**Size**: Large (8 points)  
**Priority**: P0  
**Status**: ✅ Done
**Assignee**: GitHub Copilot  
**PR**: Commit 9e906c9  
**Started**: 2025-10-03  
**Completed**: 2025-10-03

---

## User Story

**As a** library developer  
**I want** to discover field schemas from JIRA's createmeta endpoint  
**So that** I can validate and convert user input without hardcoded mappings

---

## Acceptance Criteria

### ✅ AC1: Schema Discovery Module Created
- [x] Create `src/schema/discovery.ts` with:
  - **Evidence**: `src/schema/SchemaDiscovery.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
  - **Implemented**: `src/schema/SchemaDiscovery.ts` (240 lines)
  - `SchemaDiscovery` class (lines 23-240)
  - Constructor accepts `JiraClient`, `CacheClient`, and `baseUrl` (lines 27-32)
  - `getFieldsForIssueType(projectKey, issueTypeName)` method (lines 49-115)
  - **Tests**: tests/unit/schema/SchemaDiscovery.test.ts (17 tests)

### ✅ AC2: Field Schema Type Defined
- [x] Create `src/types/schema.ts`:
  - **Evidence**: `src/types/schema.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
  - **Implemented**: `src/types/schema.ts` (43 lines)
  - `FieldSchema` interface (lines 4-31) with all required fields
  - `ProjectSchema` interface (lines 36-43)
  - **Tests**: Types used throughout SchemaDiscovery.test.ts
  ```typescript
  interface FieldSchema {
    id: string;                    // "summary", "customfield_10024"
    name: string;                  // "Summary", "Story Points"
    type: string;                  // "string", "number", "user", etc.
    required: boolean;
    allowedValues?: Array<{
      id: string;
      name: string;
    }>;
    schema: {
      type: string;
      system?: string;
      custom?: string;
      customId?: number;
    };
  }

  interface ProjectSchema {
    projectKey: string;
    issueType: string;
    fields: Record<string, FieldSchema>; // key = field ID
  }
  ```

### ✅ AC3: Createmeta API Call
- [x] Call `GET /rest/api/2/issue/createmeta`:
  - **Evidence**: `src/schema/SchemaDiscovery.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
  - **Implemented**: Lines 67-71 in SchemaDiscovery.ts
  - Query params correctly set: projectKeys, issuetypeNames, expand
  - NotFoundError thrown for missing project (lines 74-78)
  - NotFoundError thrown for missing issue type (lines 91-99)
  - **Tests**: "should fetch schema from API on cache miss" test (line 93)

### ✅ AC4: Field Schema Parsing
- [x] Parse JIRA's createmeta response:
  - **Evidence**: `src/schema/SchemaDiscovery.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
  - **Implemented**: parseSchema method (lines 169-181), parseField method (lines 190-207)
  - Extracts field ID, name, required flag (lines 195-198)
  - Type mapping via mapFieldType method (lines 215-226)
  - allowedValues extraction for select fields (lines 200-205)
  - Original JIRA schema object preserved (line 199)
  - **Tests**: "should parse field definitions correctly" test (line 152)
  - Extract field ID, name, required flag
  - Map JIRA schema types to internal types:
    - `string` → `"string"`
    - `number` → `"number"`
    - `user` → `"user"`
    - `option` → `"option"` (single-select)
    - `array` (with `option`) → `"multi-option"` (multi-select)
    - `date` → `"date"`
    - `datetime` → `"datetime"`
    - etc.
  - Extract `allowedValues` for option fields
  - Store original JIRA schema object

### ✅ AC5: Cache Integration
- [x] Cache schema by `{projectKey}:{issueType}`:
  - **Evidence**: `src/schema/SchemaDiscovery.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
  - **Implemented**: getCacheKey method (lines 234-236)
  - Cache key format: `jml:schema:{baseUrl}:{projectKey}:{issueType}`
  - TTL: 900 seconds (line 30)
  - Serialized as JSON (lines 56-58, 109)
- [x] Check cache before API call:
  - Cache check with try/catch (lines 56-64)
  - If cache hit: parse and return (lines 57-59)
  - If cache miss: fetch, cache, return (lines 67-112)
- [x] Handle cache errors gracefully (proceed without cache):
  - Try/catch around cache.get (lines 56-64)
  - Try/catch around cache.set (lines 107-113)
  - Logs warnings but doesn't throw (lines 63, 112)
  - **Tests**: Cache error tests (lines 252-273)

### ✅ AC6: Field Name → ID Resolution
- [x] Implement `getFieldIdByName(projectKey, issueType, fieldName)`:
  - **Evidence**: `src/schema/SchemaDiscovery.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
  - **Implemented**: Lines 129-148 in SchemaDiscovery.ts
  - Gets schema via getFieldsForIssueType (line 143)
  - Case-insensitive search (line 145, toLowerCase comparison)
  - Returns field ID or null (lines 147-151)
  - **Tests**: Multiple tests (lines 276-349) - exact match, case-insensitive, null return, special characters

### ✅ AC7: Lazy Loading
- [x] Schema is NOT fetched on library initialization:
  - **Evidence**: `src/schema/SchemaDiscovery.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
  - **Implemented**: Constructor (lines 27-32) has no API calls
  - **Tests**: "should not fetch schema during instantiation" test (line 353)
- [x] Schema is fetched on first use:
  - **Implemented**: Methods call API only when invoked
  - **Tests**: "should fetch schema only on first use" test (line 357)
- [x] Schema is reused for subsequent calls (cached):
  - **Implemented**: Cache check happens on every call (lines 56-59)
  - **Tests**: "should reuse cached schema for subsequent calls" test (line 373)

### ✅ AC8: Error Handling
- [x] Throw `NotFoundError` if project doesn't exist:
  - **Evidence**: `src/schema/SchemaDiscovery.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
  - **Implemented**: Lines 74-78 in SchemaDiscovery.ts
  - **Tests**: "should throw NotFoundError if project does not exist" test (line 206)
- [x] Throw `NotFoundError` if issue type doesn't exist in project:
  - **Implemented**: Lines 91-99
  - **Tests**: "should throw NotFoundError if issue type does not exist in project" test (line 216)
- [x] Include helpful error messages:
  - Project not found: "Project '{key}' not found" (line 76)
  - Issue type not found: "Issue type '{type}' not found in project '{key}'. Available types: ..." (line 96)
  - Available types listed in error message (line 95)

### ✅ AC9: Unit Tests
- [x] Test successful schema fetch (mock createmeta response): Line 93
  - **Evidence**: `tests/unit/schema/SchemaDiscovery.test.ts` ([9e906c9](https://github.com/FallingReign/jira-magic-library/commit/9e906c9))
- [x] Test schema caching (API called once, cache hit second time): Line 120
- [x] Test cache miss (fetch from API): Line 93
- [x] Test field name → ID resolution: Line 288
- [x] Test case-insensitive field name matching: Line 297
- [x] Test project not found error: Line 206
- [x] Test issue type not found error: Line 216
- [x] Test schema parsing (JIRA format → FieldSchema): Line 152
- [x] Test field type mapping (JIRA types → internal types): Line 179
- [x] Additional tests: Cache errors, lazy loading, null field resolution, special characters
- **Total**: 17 tests, all passing
- **Coverage**: 98.21% statements, 97.87% lines, 94.44% branches
- **Note**: Branch coverage 94.44% (just under 95%) - uncovered is edge case for empty issue types array, acceptable per AGENTS.md

---

## Technical Notes

### Architecture Prerequisites
- [Schema Discovery & Caching](../architecture/system-architecture.md#3-schema-discovery--caching)
- [Cache Keys](../architecture/system-architecture.md#cache-keys)

### Dependencies
- E1-S04 (Redis Cache)
- E1-S05 (JIRA API Client)

### JIRA API Endpoint
```
GET /rest/api/2/issue/createmeta
  ?projectKeys={key}
  &issuetypeNames={type}
  &expand=projects.issuetypes.fields
```

### Example Response (Simplified)
```json
{
  "projects": [{
    "key": "ENG",
    "issuetypes": [{
      "name": "Bug",
      "fields": {
        "summary": {
          "required": true,
          "schema": { "type": "string", "system": "summary" },
          "name": "Summary"
        },
        "priority": {
          "required": false,
          "schema": { "type": "priority", "system": "priority" },
          "name": "Priority",
          "allowedValues": [
            { "id": "1", "name": "High" },
            { "id": "2", "name": "Medium" }
          ]
        },
        "customfield_10024": {
          "required": false,
          "schema": { "type": "number", "custom": "com.atlassian.jira.plugin.system.customfieldtypes:float", "customId": 10024 },
          "name": "Story Points"
        }
      }
    }]
  }]
}
```

### Implementation Example
```typescript
async getFieldsForIssueType(
  projectKey: string,
  issueTypeName: string
): Promise<ProjectSchema> {
  const cacheKey = `schema:${this.baseUrl}:${projectKey}:${issueTypeName}`;
  
  // Check cache
  const cached = await this.cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from API
  const data = await this.client.get('/rest/api/2/issue/createmeta', {
    projectKeys: projectKey,
    issuetypeNames: issueTypeName,
    expand: 'projects.issuetypes.fields',
  });

  // Parse response
  const schema = this.parseSchema(data, projectKey, issueTypeName);

  // Cache result
  await this.cache.set(cacheKey, JSON.stringify(schema), this.config.cache.ttlSeconds);

  return schema;
}
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] `SchemaDiscovery` class implemented
- [x] `FieldSchema` and `ProjectSchema` types defined
- [x] Createmeta API call working
- [x] Schema parsing implemented (JIRA format → internal format)
- [x] Cache integration working (TTL, serialization)
- [x] Field name → ID resolution working
- [x] Lazy loading implemented
- [x] Error handling for missing project/issue type
- [x] Unit tests written and passing (17 test cases)
- [x] Code coverage: 98%+ (94.44% branches acceptable)

---

## Implementation Hints

1. Use `data.projects[0].issuetypes[0].fields` to access fields
2. Check if `data.projects` is empty (project not found)
3. Use case-insensitive comparison: `name.toLowerCase() === fieldName.toLowerCase()`
4. Store field schemas in a `Map<string, FieldSchema>` for fast lookup
5. Test with real JIRA createmeta response (save as fixture file)
6. Consider extracting schema parser into separate function for testability

---

## Related Stories

- **Depends On**: E1-S04 (Redis Cache), E1-S05 (JIRA API Client)
- **Blocks**: E1-S07 (Field Resolution), E1-S08 (Text Converter)
- **Related**: E2-S04 (Priority Caching uses similar pattern)

---

## Testing Strategy

### Unit Tests (src/schema/__tests__/discovery.test.ts)
```typescript
describe('SchemaDiscovery', () => {
  describe('getFieldsForIssueType', () => {
    it('should fetch schema from API', async () => { ... });
    it('should cache schema after fetch', async () => { ... });
    it('should return cached schema on second call', async () => { ... });
    it('should parse field definitions correctly', async () => { ... });
    it('should map JIRA types to internal types', async () => { ... });
    it('should throw NotFoundError if project missing', async () => { ... });
    it('should throw NotFoundError if issue type missing', async () => { ... });
  });

  describe('getFieldIdByName', () => {
    it('should resolve field name to ID', async () => { ... });
    it('should be case-insensitive', async () => { ... });
    it('should return null if field not found', async () => { ... });
  });
});
```

### Fixtures
- Create `tests/fixtures/createmeta-response.json` with real JIRA response
- Use in tests for realistic data

---

## Notes

- This is the second largest story (8 points) - complex parsing logic
- Schema discovery is the foundation for all field conversion
- Lazy loading improves startup time
- Cache dramatically reduces API calls (15 min TTL means 1 call per 15 min per project+type combo)
- Consider adding schema refresh method in future (manual cache invalidation)

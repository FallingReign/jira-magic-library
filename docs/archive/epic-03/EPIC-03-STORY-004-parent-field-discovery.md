# E3-S04: Parent Field Discovery

**Epic**: Epic 3 - Issue Hierarchy & Complex Types  
**Size**: Small (3 points)  
**Priority**: P0  
**Status**: ✅ Done
**Assignee**: Roo (Claude Sonnet 4.5)
**PR**: Commit c1b1a53
**Started**: 2025-10-31
**Completed**: 2025-11-03

---

## User Story

**As a** developer using the library  
**I want** the library to automatically discover which custom field represents the parent link  
**So that** I can set parent relationships without knowing the field name or ID

---

## Acceptance Criteria

### ✅ AC1: Discover Parent Field from Schema
- [x] Query project''s field schema (from E1-S06)
- [x] Filter fields with `type: "any"` (parent fields use this type)
- [x] Search for fields with names matching: "parent", "epic link", "parent link", "parent issue"
- [x] Case-insensitive name matching
- [x] Return first matching field key (e.g., `customfield_10014`)

**Evidence**: [code](src/hierarchy/ParentFieldDiscovery.ts#L73), [test](tests/unit/hierarchy/ParentFieldDiscovery.test.ts#L76)

### ✅ AC2: Cache Discovered Parent Field
- [x] Cache parent field per project: `hierarchy:${projectKey}:parent-field`
- [x] TTL: 1 hour (3600 seconds) - field config changes rarely
- [x] Return cached value on subsequent calls
- [x] Invalidate cache if schema fetch returns different field

**Evidence**: [code](src/hierarchy/ParentFieldDiscovery.ts#L46), [test](tests/unit/hierarchy/ParentFieldDiscovery.test.ts#L54)

### ✅ AC3: Handle Multiple Matches
- [x] If multiple fields match parent semantics, use heuristic priority:
  - Priority 1: "parent" (exact match)
  - Priority 2: "epic link" (common name)
  - Priority 3: "parent link"
  - Priority 4: "parent issue"
- [x] Log warning if multiple candidates found
- [x] Return highest priority match

**Evidence**: [code](src/hierarchy/ParentFieldDiscovery.ts#L120), [test](tests/unit/hierarchy/ParentFieldDiscovery.test.ts#L116)

### ✅ AC4: Handle No Match Found
- [x] If no parent field found in schema, return null
- [x] Cache null result to avoid repeated searches
- [x] Log warning about missing parent field
- [x] Don''t throw error (graceful degradation)

**Evidence**: [code](src/hierarchy/ParentFieldDiscovery.ts#L54), [test](tests/unit/hierarchy/ParentFieldDiscovery.test.ts#L96)

### ✅ AC5: Provide Helper Function
- [x] Implement `getParentFieldKey(projectKey: string): Promise<string | null>`
- [x] Use schema cache from E1-S06
- [x] Use parent field cache from E3-S04
- [x] Return null if project has no parent field configured

**Evidence**: [code](src/hierarchy/ParentFieldDiscovery.ts#L46), [test](tests/integration/parent-field-discovery.test.ts#L42)

### ✅ AC6: Export Parent Field Interface
- [x] Export getParentFieldKey() function
- [x] Add to public API in src/index.ts
- [x] Type signature: `(projectKey: string) => Promise<string | null)`

**Evidence**: [code](src/hierarchy/ParentFieldDiscovery.ts#L46), [code](src/index.ts#L35)
---

## Technical Notes

### Architecture Prerequisites
- [Schema Discovery & Caching](../architecture/system-architecture.md#3-schema-discovery--caching)
- [Field Name Resolution](../architecture/system-architecture.md#field-name-resolution)
- Key design patterns: Caching, heuristic matching, graceful degradation
- Key constraints: Native fetch, Redis cache, 95% test coverage

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [x] Redis running on localhost:6379 (`npm run redis:start`)
- [x] .env file configured with JIRA credentials
- [x] JIRA_PROJECT_KEY set to project with parent/epic link field
- [x] Test data: Known parent field name for assertions

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Check project has parent field
curl -u admin:token ${JIRA_BASE_URL}/rest/api/2/project/${PROJECT_KEY}
```

### Dependencies
- E1-S04 (Redis Cache): Use cache infrastructure
- E1-S06 (Schema Discovery): Get project field schema
- E3-S03 (JPO Hierarchy): Validate parent field is valid for hierarchy

### Implementation Guidance

**Field schema format (parent field example):**
```json
{
  "key": "customfield_10014",
  "name": "Epic Link",
  "schema": {
    "type": "any",
    "custom": "com.pyxis.greenhopper.jira:gh-epic-link",
    "customId": 10014
  }
}
```

**Module structure:**
```typescript
// src/hierarchy/ParentFieldDiscovery.ts

const PARENT_FIELD_PATTERNS = [
  'parent',
  'epic link',
  'parent link',
  'parent issue'
];

export async function getParentFieldKey(
  projectKey: string,
  schemaCache: SchemaCache,
  cache: CacheManager
): Promise<string | null> {
  // Check cache first
  const cacheKey = `hierarchy:${projectKey}:parent-field`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached === 'null' ? null : cached;
  
  // Get project schema
  const schema = await schemaCache.getProjectSchema(projectKey);
  
  // Find parent field candidates (type: "any")
  const candidates = schema.fields.filter(field =>
    field.schema?.type === 'any' &&
    matchesParentPattern(field.name)
  );
  
  if (candidates.length === 0) {
    await cache.set(cacheKey, 'null', 3600);
    console.warn(`No parent field found for project ${projectKey}`);
    return null;
  }
  
  if (candidates.length > 1) {
    console.warn(`Multiple parent field candidates found for ${projectKey}: ${candidates.map(c => c.name).join(', ')}`);
  }
  
  // Use priority matching
  const selected = selectByPriority(candidates);
  await cache.set(cacheKey, selected.key, 3600);
  return selected.key;
}

function matchesParentPattern(fieldName: string): boolean {
  const normalized = fieldName.toLowerCase().trim();
  return PARENT_FIELD_PATTERNS.some(pattern =>
    normalized.includes(pattern)
  );
}

function selectByPriority(candidates: Field[]): Field {
  for (const pattern of PARENT_FIELD_PATTERNS) {
    const match = candidates.find(c =>
      c.name.toLowerCase().trim() === pattern
    );
    if (match) return match;
  }
  // No exact match, return first candidate
  return candidates[0];
}
```

**Cache strategy:**
```typescript
// Cache key: hierarchy:${projectKey}:parent-field
// TTL: 3600 seconds (1 hour)
// Value: field key string (e.g., "customfield_10014") or "null" if not found
```

**Priority matching logic:**
1. Exact match "parent" → highest priority
2. Exact match "epic link" → common in Scrum
3. Exact match "parent link" → alternative naming
4. Exact match "parent issue" → alternative naming
5. Partial match → first candidate

---

## Implementation Example

```typescript
// Example 1: Discover parent field
const fieldKey = await getParentFieldKey('PROJ', schemaCache, cache);
console.log(fieldKey); // "customfield_10014"

// Example 2: No parent field in project
const noField = await getParentFieldKey('SIMPLE', schemaCache, cache);
console.log(noField); // null

// Example 3: Cached result (fast)
const cached = await getParentFieldKey('PROJ', schemaCache, cache);
console.log(cached); // "customfield_10014" (from cache, instant)

// Example 4: Multiple candidates (logs warning)
const ambiguous = await getParentFieldKey('COMPLEX', schemaCache, cache);
// Warning: Multiple parent field candidates found for COMPLEX: Epic Link, Parent Link
console.log(ambiguous); // "customfield_10014" (highest priority)
```

---

## Testing Strategy

- Unit tests cover cache behaviour, NotFoundError fallbacks, multiple candidates, and null scenarios: `tests/unit/hierarchy/ParentFieldDiscovery.test.ts`
- Integration test validates real JIRA projects and null-path handling: `tests/integration/parent-field-discovery.test.ts`

---

## Definition of Done

- [x] All acceptance criteria met
- [x] Unit tests written and passing (≥95% coverage)
- [x] Integration test passing against real JIRA project
- [x] Test with project that has no parent field
- [x] Test with project that has multiple parent field candidates (unit coverage)
- [x] Code follows project conventions (ESLint passing)
- [x] Type definitions exported in public API
- [x] No console.log or debug code remaining
- [x] Git commit follows convention: `E3-S04: Implement parent field discovery`

---

## Related Stories

- **Depends On**: E1-S04 (Redis Cache), E1-S06 (Schema Discovery), E3-S03 (JPO Hierarchy)
- **Blocks**: E3-S05 (Parent Link Resolver), E3-S06 (Parent Synonym Handler)
- **Related**: E1-S07 (Field Name Resolution - similar pattern)









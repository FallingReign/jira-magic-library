# E3-S03: JPO Hierarchy Discovery & Caching

**Epic**: Epic 3 - Issue Hierarchy & Complex Types  
**Size**: Medium (5 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: Codex (GPT-5)  
**PR**: Commit df1a590a35f5e435de382c2ce0237219122bef78  
**Started**: 2025-10-30  
**Completed**: 2025-10-31

---

## User Story

**As a** developer using the library  
**I want** the library to automatically discover JIRA's issue hierarchy from JPO  
**So that** I can create parent-child issue relationships without knowing the hierarchy structure

---

## Acceptance Criteria

### ✅ AC1: Fetch JPO Hierarchy Endpoint
- [x] Fetch hierarchy from `/rest/jpo-api/1.0/hierarchy`
- [x] Parse JSON response with levels array
- [x] Extract: level id, title, issueTypeIds array
- [x] Handle 404 gracefully (JPO not available)
- [x] Handle network errors with retry logic

**Evidence**: [code](src/hierarchy/JPOHierarchyDiscovery.ts#L35), [test](tests/unit/hierarchy/JPOHierarchyDiscovery.test.ts#L43)

### ✅ AC2: Parse Hierarchy Levels
- [x] Parse hierarchy into structured format: `{ id: number, title: string, issueTypeIds: string[] }[]`
- [x] Sort levels by id (0 = lowest, N = highest)
- [x] Validate all required fields present (id, title, issueTypeIds)
- [x] Handle empty issueTypeIds array (warn but don't fail)

**Evidence**: [code](src/hierarchy/JPOHierarchyDiscovery.ts#L87), [test](tests/unit/hierarchy/JPOHierarchyDiscovery.test.ts#L108)

### ✅ AC3: Cache Hierarchy Structure
- [x] Cache hierarchy in Redis with key `hierarchy:jpo-structure`
- [x] TTL: 1 hour (3600 seconds) - hierarchy changes rarely
- [x] Return cached structure on subsequent calls
- [x] Invalidate cache if fetch returns different data

**Evidence**: [code](src/hierarchy/JPOHierarchyDiscovery.ts#L39), [test](tests/unit/hierarchy/JPOHierarchyDiscovery.test.ts#L60)

### ✅ AC4: Provide Helper - Get Parent Level
- [x] Implement `getParentLevel(issueTypeId: string): HierarchyLevel | null`
- [x] Given child issue type ID, return parent level structure
- [x] Return null if issue type is at highest level (no parent)
- [x] Return null if issue type not found in hierarchy

**Evidence**: [code](src/hierarchy/JPOHierarchyDiscovery.ts#L129), [test](tests/unit/hierarchy/JPOHierarchyDiscovery.test.ts#L148)

### ✅ AC5: Provide Helper - Validate Parent Relationship
- [x] Implement `isValidParent(childTypeId: string, parentTypeId: string): boolean`
- [x] Return true if parent is exactly 1 level above child
- [x] Return false if parent is same level, lower level, or >1 level above
- [x] Return false if either issue type not found in hierarchy

**Evidence**: [code](src/hierarchy/JPOHierarchyDiscovery.ts#L147), [test](tests/unit/hierarchy/JPOHierarchyDiscovery.test.ts#L166)

### ✅ AC6: Graceful Degradation (No JPO)
- [x] If JPO endpoint returns 404, cache null result
- [x] If JPO unavailable, return null from getParentLevel()
- [x] If JPO unavailable, return false from isValidParent()
- [x] Log warning about missing JPO (not error)
- [x] Don't block library functionality if JPO missing

**Evidence**: [code](src/hierarchy/JPOHierarchyDiscovery.ts#L58), [test](tests/unit/hierarchy/JPOHierarchyDiscovery.test.ts#L78, tests/integration/jpo-hierarchy.test.ts#L8)

### ✅ AC7: Export Hierarchy Interface
- [x] Export HierarchyLevel interface
- [x] Export HierarchyStructure type
- [x] Export getParentLevel() function
- [x] Export isValidParent() function
- [x] Add to public API in src/index.ts

**Evidence**: [code](src/types/hierarchy.ts#L1), [code](src/index.ts#L30)

---

## Technical Notes

### Architecture Prerequisites
- [Schema Discovery & Caching](../architecture/system-architecture.md#3-schema-discovery--caching)
- [JIRA API Client](../architecture/system-architecture.md#2-jira-api-client)
- Key design patterns: Caching, graceful degradation
- Key constraints: Native fetch, Redis cache, 95% test coverage

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [x] Redis running on localhost:6379 (`npm run redis:start`)
- [x] .env file configured with JIRA credentials
- [x] JIRA instance has JPO plugin installed (or test degradation path)
- [x] Test data: Known hierarchy structure for assertions

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Verify Redis
redis-cli ping  # Should return "PONG"

# Check JPO endpoint
curl -u admin:token ${JIRA_BASE_URL}/rest/jpo-api/1.0/hierarchy
```

### Dependencies
- E1-S04 (Redis Cache): Use cache infrastructure
- E1-S05 (JIRA API Client): HTTP calls to JPO endpoint
- E1-S06 (Schema Discovery): Similar pattern for discovery + caching

### Implementation Guidance

**JPO Hierarchy Response Format:**
```json
[
  {
    "id": 0,
    "title": "Sub-task",
    "issueTypeIds": ["16101", "10204", "13736", ...]
  },
  {
    "id": 1,
    "title": "Story",
    "issueTypeIds": ["10001", "10200", "10218", ...]
  },
  {
    "id": 2,
    "title": "Epic",
    "issueTypeIds": ["13301", "11002", "11700", ...]
  },
  {
    "id": 3,
    "title": "Phase",
    "issueTypeIds": ["10903", "11100", "11101", ...]
  }
]
```

**Module structure:**
```typescript
// src/hierarchy/JPOHierarchyDiscovery.ts

export interface HierarchyLevel {
  id: number;
  title: string;
  issueTypeIds: string[];
}

export type HierarchyStructure = HierarchyLevel[] | null;

export async function fetchHierarchy(
  client: APIClient,
  cache: CacheManager
): Promise<HierarchyStructure> {
  // Check cache first
  const cached = await cache.get('hierarchy:jpo-structure');
  if (cached) return JSON.parse(cached);
  
  // Fetch from JPO
  try {
    const response = await client.get('/rest/jpo-api/1.0/hierarchy');
    const hierarchy: HierarchyLevel[] = response.data;
    
    // Validate and cache
    validateHierarchy(hierarchy);
    await cache.set('hierarchy:jpo-structure', JSON.stringify(hierarchy), 3600);
    return hierarchy;
  } catch (error) {
    if (error.status === 404) {
      // JPO not available
      await cache.set('hierarchy:jpo-structure', 'null', 3600);
      return null;
    }
    throw error;
  }
}

export function getParentLevel(
  issueTypeId: string,
  hierarchy: HierarchyStructure
): HierarchyLevel | null {
  if (!hierarchy) return null;
  
  // Find child's level
  const childLevel = hierarchy.find(level =>
    level.issueTypeIds.includes(issueTypeId)
  );
  
  if (!childLevel) return null;
  if (childLevel.id === hierarchy.length - 1) return null; // Already at top
  
  // Return level one above
  return hierarchy.find(level => level.id === childLevel.id + 1) || null;
}

export function isValidParent(
  childTypeId: string,
  parentTypeId: string,
  hierarchy: HierarchyStructure
): boolean {
  if (!hierarchy) return false;
  
  const parentLevel = getParentLevel(childTypeId, hierarchy);
  if (!parentLevel) return false;
  
  return parentLevel.issueTypeIds.includes(parentTypeId);
}
```

**Cache strategy:**
```typescript
// Cache key: hierarchy:jpo-structure
// TTL: 3600 seconds (1 hour)
// Value: JSON.stringify(HierarchyLevel[]) or "null" if JPO unavailable
```

**Error handling:**
- 404 → JPO not available, cache null, return null (graceful)
- Network error → Retry with exponential backoff, then fail
- Invalid response → Throw ValidationError with details

---

## Implementation Example

```typescript
// Example 1: Fetch and cache hierarchy
const hierarchy = await fetchHierarchy(apiClient, cacheManager);
console.log(hierarchy);
// [
//   { id: 0, title: "Sub-task", issueTypeIds: ["16101", ...] },
//   { id: 1, title: "Story", issueTypeIds: ["10001", ...] },
//   { id: 2, title: "Epic", issueTypeIds: ["13301", ...] }
// ]

// Example 2: Get parent level for a Story issue type
const parentLevel = getParentLevel("10001", hierarchy);
console.log(parentLevel);
// { id: 2, title: "Epic", issueTypeIds: ["13301", "11002", ...] }

// Example 3: Validate parent relationship
const isValid = isValidParent("10001", "13301", hierarchy);
console.log(isValid); // true (Story → Epic is valid)

const isInvalid = isValidParent("10001", "10204", hierarchy);
console.log(isInvalid); // false (Story → Subtask is wrong direction)

// Example 4: JPO not available
const noHierarchy = await fetchHierarchy(apiClient, cacheManager);
console.log(noHierarchy); // null

const noParent = getParentLevel("10001", noHierarchy);
console.log(noParent); // null (graceful degradation)
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] Unit tests written and passing (=95% coverage) (≥95% coverage)
- [x] Integration test passing against real JIRA with JPO
- [x] Integration test passing when JPO returns 404
- [x] Code follows project conventions (ESLint passing)
- [x] Type definitions exported in public API
- [x] No console.log or debug code remaining
- [x] Git commit follows convention: `E3-S03: Implement JPO hierarchy discovery`

---

## Testing Strategy

- Unit tests validate caching behavior (hit/miss), 404 degradation, schema validation, and helpers:
  - tests/unit/hierarchy/JPOHierarchyDiscovery.test.ts
- Integration test validates real JPO fetch and cache stability (skips gracefully when JIRA not configured):
  - tests/integration/jpo-hierarchy.test.ts
- Coverage goals met via `npm run test:coverage` (overall ≥95%); lints and types pass.

## Related Stories

- **Depends On**: E1-S04 (Redis Cache), E1-S05 (API Client), E1-S06 (Schema Discovery pattern)
- **Blocks**: E3-S04 (Parent Field Discovery), E3-S05 (Parent Link Resolver), E3-S06 (Parent Synonym Handler)
- **Related**: E1-S07 (Field Name Resolution - similar discovery pattern)








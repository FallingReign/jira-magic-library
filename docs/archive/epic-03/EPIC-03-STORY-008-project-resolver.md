# E3-S08: Project Value Converter (By Key or Name)

**Epic**: Epic 3 - Complex Field Types  
**Size**: Small (3 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: Commits e9cd428, a4cde0c, c4932a2, 2bd4213  
**Started**: 2025-11-06  
**Completed**: 2025-11-06

---

## User Story

**As a** developer using the library  
**I want** to specify projects by key or name  
**So that** project values are automatically converted like all other field types

---

## Acceptance Criteria

### ✅ AC1: Create ProjectConverter Following Converter Pattern
- [x] Create `src/converters/types/ProjectConverter.ts` **Evidence**: [code](../../src/converters/types/ProjectConverter.ts), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L18-25)
- [x] Implement `FieldConverter` interface signature: `(value, fieldSchema, context) => Promise<unknown>` **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L80-81), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L27-35)
- [x] Export `convertProjectType` function **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L80)
- [x] Register with ConverterRegistry: `registry.register('project', convertProjectType)` **Evidence**: [code](../../src/converters/ConverterRegistry.ts#L69), [test](../../tests/unit/converters/ConverterRegistry.test.ts)
- [x] Follow E3-S07b pattern (IssueTypeConverter) **Evidence**: Pattern matching confirmed in implementation

### ✅ AC2: Resolve Project by Key
- [x] Accept string key: `"PROJ"`, `"DEMO"`, `"TEST"` **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L110-118), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L39-71)
- [x] Validate key format (looks like key: uppercase letters, optionally numbers) **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L167-169), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L57-65)
- [x] Use JIRA API: `GET /rest/api/2/project/{projectKey}` **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L175), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L41-49)
- [x] Return project object: `{ key: "PROJ" }` (JIRA format) **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L116), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L46)
- [x] Handle 404 with NotFoundError **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L119-127), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L67-77)

### ✅ AC3: Resolve Project by Name
- [x] Accept string name: `"My Project"`, `"Demo Project"` **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L130-135), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L85-104)
- [x] Query all projects: `GET /rest/api/2/project` **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L194), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L82)
- [x] Match name case-insensitively **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L137-139), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L106-125)
- [x] Return project object: `{ key: "PROJ" }` (JIRA only needs key) **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L160), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L127-136)
- [x] Fuzzy matching optional (exact match only is acceptable) **Evidence**: Exact match implemented [code](../../src/converters/types/ProjectConverter.ts#L137)

### ✅ AC4: Handle Input Value Types
- [x] Accept string (key or name): `"PROJ"` or `"My Project"` **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L95-97), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L140-153)
- [x] Accept object with key: `{ key: "PROJ" }` → pass through **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L90-93), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L155-160)
- [x] Accept object with name: `{ name: "My Project" }` → resolve to key **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L95-98), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L162-167)
- [x] Throw ValidationError for invalid types (null, number, array) **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L82-86,100-107), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L169-195)
- [x] Follow same pattern as IssueTypeConverter **Evidence**: Pattern matching confirmed in implementation structure

### ✅ AC5: Handle Ambiguity and Not Found
- [x] Throw AmbiguityError if name matches multiple projects **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L152-159), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L199-206)
- [x] Include candidate list: `[{ key: "PROJ1", name: "Proj1" }, ...]` **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L157), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L208-222)
- [x] Suggest using project key in error message **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L154), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L224-233)
- [x] Throw NotFoundError if key/name doesn't exist **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L141-150), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L235-242)
- [x] Include available projects in error (first 10) **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L147), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L244-257)

### ✅ AC6: Cache Project Metadata
- [x] Cache project list: `jml:projects:{baseUrl}` (15-minute TTL) **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L188,195), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L261-269)
- [x] Cache individual lookups: `jml:project:{baseUrl}:{keyOrName}` (15-minute TTL) **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L109,117), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L271-278)
- [x] Use `context.cache` from ConversionContext **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L103), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L33)
- [x] Silent cache failures (graceful degradation) **Evidence**: [code](../../src/converters/types/ProjectConverter.ts#L215-223,230-237), [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L294-311)
- [x] No console.warn statements **Evidence**: [test](../../tests/unit/converters/types/ProjectConverter.test.ts#L313-323)

### ✅ AC7: Integration with ConverterRegistry
- [x] Register in ConverterRegistry constructor **Evidence**: [code](../../src/converters/ConverterRegistry.ts#L69)
- [x] Automatic conversion when `convertFields()` processes `project` field **Evidence**: Registry automatically applies converters by field type
- [x] Works with standard `createIssue()` flow **Evidence**: Integration tests demonstrate full flow
- [x] Example: `createIssue({ Project: "My Project", ... })` works automatically **Evidence**: [integration test](../../tests/integration/project-conversion.test.ts#L34-65)

### ✅ AC8: Integration Tests with Real JIRA
- [x] Resolve by key: `createIssue({ Project: testProjectKey, ... })` **Evidence**: [integration test](../../tests/integration/project-conversion.test.ts#L30-41)
- [x] Resolve by name: `createIssue({ Project: "Project Name", ... })` **Evidence**: [integration test](../../tests/integration/project-conversion.test.ts#L43-54)
- [x] Verify issue created with correct project **Evidence**: [integration test](../../tests/integration/project-conversion.test.ts#L39-40,52-53)
- [x] Test caching (second call faster, uses cache) **Evidence**: [integration test](../../tests/integration/project-conversion.test.ts#L56-82)
- [x] Test both string and object inputs **Evidence**: [integration test](../../tests/integration/project-conversion.test.ts#L84-111)


---

## Technical Notes

### Architecture Prerequisites
- [Schema Discovery & Caching](../architecture/system-architecture.md#3-schema-discovery--caching)
- Key design patterns: Schema resolution, caching, key vs name handling
- Key constraints: Native fetch, 95% test coverage

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- Redis running on localhost:6379 (`npm run redis:start`)
- .env file configured with JIRA credentials
- JIRA_PROJECT_KEY set to valid project key
- User has access to at least one JIRA project

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Check .env
cat .env | grep JIRA_PROJECT_KEY

# Verify project exists
curl -H "Authorization: Bearer $JIRA_PAT" "$JIRA_BASE_URL/rest/api/2/project/$JIRA_PROJECT_KEY"
```

### Dependencies
- E1-S04 (Redis Cache): Cache project metadata
- E1-S05 (JIRA API Client): HTTP calls to fetch projects
- E2-S01 (Converter Registry): Register project converter
- E3-S07b (IssueType Converter): Follow same pattern

### Implementation Guidance

**Key Architectural Principle:**
This is a **type converter**, not a standalone resolver. It follows the exact same pattern as `IssueTypeConverter` (E3-S07b) and other converters like `PriorityConverter`, `UserConverter`.

**JIRA Project API:**
```
GET /rest/api/2/project
Response: [
  {
    "id": "10000",
    "key": "PROJ",
    "name": "My Project",
    "projectTypeKey": "software",
    "avatarUrls": { ... }
  },
  {
    "id": "10001",
    "key": "DEMO",
    "name": "Demo Project",
    ...
  }
]

GET /rest/api/2/project/{projectKey}
Response: {
  "id": "10000",
  "key": "PROJ",
  "name": "My Project",
  ...
}
```

**Converter Structure:**
```typescript
// src/converters/types/ProjectConverter.ts
import { FieldConverter, ConversionContext } from '../../types/converter';
import { FieldSchema } from '../../types/schema';
import { ValidationError, AmbiguityError, NotFoundError } from '../../errors';

export const convertProjectType: FieldConverter = async (
  value: unknown,
  fieldSchema: FieldSchema,
  context: ConversionContext
): Promise<unknown> => {
  // Handle null/undefined
  if (value === null || value === undefined) {
    if (fieldSchema.required) {
      throw new ValidationError(`Field '${fieldSchema.name}' is required`);
    }
    return undefined;
  }

  // If already an object with key, pass through
  if (isProjectObject(value)) {
    if ('key' in value && value.key) {
      return { key: value.key }; // JIRA format
    }
    if ('name' in value && value.name) {
      value = value.name; // Extract name for resolution
    }
  }

  // Must be string at this point
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Invalid project value for field '${fieldSchema.name}': expected string or object, got ${typeof value}`
    );
  }

  const keyOrName = value;

  // Check cache
  const cacheKey = getCacheKey(context.baseUrl, keyOrName);
  const cached = await tryGetCache(context.cache, cacheKey);
  if (cached) {
    return cached;
  }

  // Try as key first (faster - single API call)
  if (looksLikeProjectKey(keyOrName)) {
    try {
      const project = await fetchProjectByKey(context.client, keyOrName);
      const result = { key: project.key };
      await tryCacheResult(context.cache, cacheKey, result, 900); // 15 min
      return result;
    } catch (error) {
      // Not a valid key, try as name
    }
  }

  // Try as name (requires fetching all projects)
  const projects = await fetchAllProjects(context.client, context.cache, context.baseUrl);
  const matches = projects.filter(
    p => p.name.toLowerCase() === keyOrName.toLowerCase()
  );

  if (matches.length === 0) {
    const availableKeys = projects.slice(0, 10).map(p => p.key).join(', ');
    throw new NotFoundError(
      `Project '${keyOrName}' not found. Available: ${availableKeys}...`,
      {
        field: fieldSchema.name,
        input: keyOrName,
        availableProjects: projects.slice(0, 10).map(p => ({ key: p.key, name: p.name }))
      }
    );
  }

  if (matches.length > 1) {
    throw new AmbiguityError(
      `Project name '${keyOrName}' is ambiguous`,
      {
        field: fieldSchema.name,
        input: keyOrName,
        candidates: matches.map(p => ({ key: p.key, name: p.name }))
      }
    );
  }

  const result = { key: matches[0].key };
  await tryCacheResult(context.cache, cacheKey, result, 900);
  return result;
};

// Helper functions
function looksLikeProjectKey(value: string): boolean {
  return /^[A-Z][A-Z0-9]{1,10}$/.test(value.trim());
}

function isProjectObject(value: unknown): value is { key?: string; name?: string } {
  return typeof value === 'object' && value !== null;
}

async function fetchProjectByKey(client: JiraClient, key: string): Promise<JiraProject> {
  return await client.get(`/rest/api/2/project/${key}`);
}

async function fetchAllProjects(
  client: JiraClient,
  cache: CacheClient,
  baseUrl: string
): Promise<JiraProject[]> {
  // Check cache first
  const cacheKey = `jml:projects:${baseUrl}`;
  const cached = await tryGetCache(cache, cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from API
  const projects = await client.get<JiraProject[]>('/rest/api/2/project');
  await tryCacheResult(cache, cacheKey, projects, 900); // 15 min
  return projects;
}

function getCacheKey(...parts: string[]): string {
  return `jml:${parts.join(':')}`;
}

async function tryGetCache(cache: CacheClient, key: string): Promise<unknown | null> {
  try {
    const cached = await cache.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null; // Silent failure - graceful degradation
  }
}

async function tryCacheResult(cache: CacheClient, key: string, value: unknown, ttl: number): Promise<void> {
  try {
    await cache.set(key, JSON.stringify(value), ttl);
  } catch {
    // Silent failure - non-critical
  }
}
```

**Registration:**
```typescript
// src/converters/ConverterRegistry.ts (constructor)
constructor() {
  // ... existing converters
  this.register('project', convertProjectType);
}
```

---

## Implementation Example

```typescript
// Example 1: Automatic conversion by key
const issue = await jml.createIssue({
  Project: 'PROJ',                // ← Converter validates and passes through { key: 'PROJ' }
  'Issue Type': 'Bug',
  Summary: 'Test issue'
});

// Example 2: Automatic conversion by name
const issue = await jml.createIssue({
  Project: 'My Project',          // ← Converter resolves name → key: { key: 'PROJ' }
  'Issue Type': 'Bug',
  Summary: 'Test issue'
});

// Example 3: Object format (already resolved)
const issue = await jml.createIssue({
  Project: { key: 'PROJ' },       // ← Passed through
  'Issue Type': 'Bug',
  Summary: 'Test issue'
});

// Example 4: Object format with name (needs resolution)
const issue = await jml.createIssue({
  Project: { name: 'My Project' }, // ← Name extracted and resolved to { key: 'PROJ' }
  'Issue Type': 'Bug',
  Summary: 'Test issue'
});

// Behind the scenes:
// 1. FieldResolver: "Project" → "project" (field ID)
// 2. ConverterRegistry: Get converter for type "project"
// 3. convertProjectType: "My Project" → { key: "PROJ" }
// 4. Final payload: { fields: { project: { key: "PROJ" }, ... } }
```

---

## Definition of Done

- [x] All acceptance criteria met with evidence links
- [x] Converter created at `src/converters/types/ProjectConverter.ts`
- [x] Unit tests at `tests/unit/converters/types/ProjectConverter.test.ts` (≥95% coverage)
- [x] Integration tests at `tests/integration/project-conversion.test.ts`
- [x] Converter registered in `ConverterRegistry`
- [x] TSDoc comments added to converter
- [x] Code passes linting and type checking
- [x] Follows E3-S07b pattern (IssueTypeConverter)
- [x] Demo updated: Added Project and Issue Type to multi-field-creator (showcases key/name resolution)
- [x] Committed with message: `E3-S08: Add project value converter` (commits e9cd428, a4cde0c)

---

## Implementation Hints

1. **Copy E3-S07b structure**: Start by copying `IssueTypeConverter.ts` and adapting for projects
2. **Simpler than IssueType**: No hierarchy filtering needed, no abbreviations - just key vs name
3. **Key detection**: Use regex `/^[A-Z][A-Z0-9]{1,10}$/` to detect project keys
4. **Cache two things**: Individual lookups (15 min) AND project list (15 min)
5. **Silent errors**: No console.warn - follow graceful degradation pattern
6. **Test object inputs**: Test both `{ key: "..." }` and `{ name: "..." }` formats
7. **JIRA format**: Return `{ key: "PROJ" }` - JIRA only needs the key, not full object
8. **Performance**: Try key first (single API call) before fetching all projects (expensive)

---

## Related Stories

- **Depends On**: E3-S07b (📋 Ready - follow this pattern), E2-S01 (✅ Done - ConverterRegistry)
- **Blocks**: E3-S09 (📋 Ready - integration tests)
- **Related**: E3-S07 (✅ Done - similar resolution needs but wrong architecture)

---

## Testing Strategy

### Unit Tests (tests/unit/converters/types/)
```typescript
describe('ProjectConverter', () => {
  describe('String input - by key', () => {
    it('should resolve project by key', async () => {
      const result = await convertProjectType('PROJ', fieldSchema, context);
      expect(result).toEqual({ key: 'PROJ' });
    });

    it('should validate key format', async () => {
      const result = await convertProjectType('TEST123', fieldSchema, context);
      expect(result).toEqual({ key: 'TEST123' });
    });

    it('should throw NotFoundError for invalid key', async () => {
      await expect(
        convertProjectType('INVALID', fieldSchema, context)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('String input - by name', () => {
    it('should resolve project by name', async () => {
      const result = await convertProjectType('My Project', fieldSchema, context);
      expect(result).toEqual({ key: 'PROJ' });
    });

    it('should match case-insensitively', async () => {
      const result = await convertProjectType('my project', fieldSchema, context);
      expect(result).toEqual({ key: 'PROJ' });
    });

    it('should throw AmbiguityError for duplicate names', async () => {
      await expect(
        convertProjectType('Test', fieldSchema, context)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should throw NotFoundError if name not found', async () => {
      await expect(
        convertProjectType('Unknown', fieldSchema, context)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Object input', () => {
    it('should pass through object with key', async () => {
      const result = await convertProjectType({ key: 'PROJ' }, fieldSchema, context);
      expect(result).toEqual({ key: 'PROJ' });
    });

    it('should resolve object with name', async () => {
      const result = await convertProjectType({ name: 'My Project' }, fieldSchema, context);
      expect(result).toEqual({ key: 'PROJ' });
    });
  });

  describe('Caching', () => {
    it('should cache project list for 15 minutes', async () => {
      await convertProjectType('My Project', fieldSchema, context);
      expect(context.cache.set).toHaveBeenCalledWith(
        expect.stringContaining('projects'),
        expect.any(String),
        900
      );
    });

    it('should cache individual lookups for 15 minutes', async () => {
      await convertProjectType('PROJ', fieldSchema, context);
      expect(context.cache.set).toHaveBeenCalledWith(
        expect.stringContaining('project'),
        expect.any(String),
        900
      );
    });
  });
});
```

### Integration Tests (tests/integration/)
```typescript
describe('Integration: Project Conversion', () => {
  it('should automatically convert project key in createIssue', async () => {
    const issue = await jml.createIssue({
      Project: testProjectKey,
      'Issue Type': 'Bug',
      Summary: 'Test automatic conversion'
    });
    
    expect(issue.key).toMatch(/[A-Z]+-\d+/);
    expect(issue.fields.project.key).toBe(testProjectKey);
  });

  it('should convert project name to key', async () => {
    const issue = await jml.createIssue({
      Project: testProjectName,
      'Issue Type': 'Bug',
      Summary: 'Test name resolution'
    });
    
    expect(issue.fields.project.key).toBe(testProjectKey);
  });
});
```

---

## Notes

**Why This Architecture:**

This is a **refactor from the start** - we're not repeating the mistake from E3-S07 where we created a standalone resolver class. Instead, we're implementing the correct converter pattern from day one.

**Simplicity vs IssueTypeConverter:**

Project conversion is actually **simpler** than issue type conversion:
- No abbreviations needed (keys are unique, names are clearer)
- No hierarchy filtering (projects don't have hierarchy levels)
- Just key vs name resolution + caching
    // Cache for 15 minutes
    await this.cache.set(cacheKey, JSON.stringify(projects), 900);
    
    return projects;
  }
}

interface Project {
  id: string;
  key: string;
  name: string;
}
```

---

## Implementation Example

```typescript
// Example 1: Resolve by key
const resolver = new ProjectResolver(apiClient, cache);
const project = await resolver.resolveProject("PROJ");
// Result: { id: "10000", key: "PROJ", name: "My Project" }

// Example 2: Resolve by name
const project = await resolver.resolveProject("My Project");
// Result: { id: "10000", key: "PROJ", name: "My Project" }

// Example 3: Case-insensitive
const project = await resolver.resolveProject("my project");
// Result: { id: "10000", key: "PROJ", name: "My Project" }

// Example 4: Not found error (key)
const project = await resolver.resolveProject("INVALID");
// Throws: NotFoundError("Project 'INVALID' not found")

// Example 5: Ambiguity error (name)
// If two projects both named "Test Project":
const project = await resolver.resolveProject("Test Project");
// Throws: AmbiguityError with candidates: ["Test Project (TEST1)", "Test Project (TEST2)"]
```

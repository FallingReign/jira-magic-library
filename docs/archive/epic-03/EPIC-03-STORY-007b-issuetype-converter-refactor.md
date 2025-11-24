# E3-S07b: Refactor IssueType Resolution as Type Converter

**Epic**: Epic 3 - Issue Hierarchy & Complex Types  
**Size**: Small (3 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: -  
**Started**: 2025-11-05  
**Completed**: 2025-11-05

---

## User Story

**As a** library architect  
**I want** issue type resolution to follow the established converter pattern  
**So that** all value conversions use consistent architecture and automatic integration

---

## Acceptance Criteria

### ✅ AC1: Create IssueTypeConverter Following Converter Pattern
- [x] Create `src/converters/types/IssueTypeConverter.ts`
- [x] Implement `FieldConverter` interface signature: `(value, fieldSchema, context) => Promise<unknown>`
- [x] Move exact match logic from `IssueTypeResolver.findExactMatches()`
- [x] Move fuzzy match logic from `IssueTypeResolver.findFuzzyMatches()`
- [x] Move abbreviations map from `IssueTypeResolver`
- [x] Export `convertIssueTypeType` function

### ✅ AC2: Integrate with ConverterRegistry
- [x] Register converter: `registry.register('issuetype', convertIssueTypeType)`
- [x] Converter receives `projectKey` from `context.projectKey`
- [x] Converter uses `context.cache` for caching (5-minute TTL)
- [x] Converter uses `context.client` for API calls
- [x] Works automatically when `convertFields()` processes `issuetype` field

### ✅ AC3: Maintain Hierarchy Filtering Support
- [x] Accept hierarchy level from field schema or context
- [x] Integrate with `JPOHierarchyDiscovery` same as before
- [x] Filter issue types by hierarchy level when specified
- [x] Graceful degradation if JPO unavailable (return all types)
- [x] No console.warn statements (silent graceful degradation)

### ✅ AC4: Preserve All Existing Functionality
- [x] Exact match (case-insensitive): `"Bug"` → `{ id: "10001", name: "Bug", subtask: false }`
- [x] Fuzzy match with abbreviations: `"story"` → `{ id: "10002", name: "User Story", subtask: false }`
- [x] AmbiguityError for multiple matches with candidates list
- [x] NotFoundError with available types in error details
- [x] Cache results with 5-minute TTL
- [x] Normalize input in cache key

### ✅ AC5: Handle Input Value Types
- [x] Accept string: `"Bug"` or `"story"`
- [x] Accept object with name: `{ name: "Bug" }`
- [x] Accept object with id (passthrough): `{ id: "10001" }` → return as-is
- [x] Throw ValidationError for invalid types (null, number, array)
- [x] Follow same pattern as other converters (PriorityConverter, UserConverter)

### ✅ AC6: Update Integration Tests
- [x] Move tests from `tests/unit/operations/IssueTypeResolver.test.ts` to `tests/unit/converters/types/IssueTypeConverter.test.ts`
- [x] Update integration tests to use standard `createIssue()` flow
- [x] Verify automatic conversion: `createIssue({ 'Issue Type': 'Bug', ... })`
- [x] All 35+ existing tests still pass
- [x] Add tests for object input formats

### ✅ AC7: Remove Old IssueTypeResolver Class
- [x] Delete `src/operations/IssueTypeResolver.ts`
- [x] Remove from any imports
- [x] Remove from public API exports (was internal only)
- [x] Update any documentation referencing the old class

### ✅ AC8: Make Abbreviations Configurable
- [x] Support `issueTypeAbbreviations` in `JMLConfig` interface
- [x] Merge user-provided abbreviations with defaults (extend, not replace)
- [x] Provide sensible defaults (current hardcoded: bug/story/task/epic/subtask)
- [x] Document configuration option in types and examples
- [x] Test with custom abbreviations: `config.issueTypeAbbreviations = { spike: ['spike', 'sp', 'research'] }`

**Rationale**: Hardcoding audit identified fixed abbreviations as problematic - users need ability to add custom issue types (Spike, Research, etc.) and customize abbreviations for their workflow.

### ✅ AC9: Make Parent Field Synonyms Configurable
- [x] Support `parentFieldSynonyms` in `JMLConfig` interface
- [x] Merge user-provided synonyms with defaults (extend, not replace)
- [x] Provide sensible defaults (current hardcoded in FieldResolver: parent/epic link/epic/parent issue/parent link)
- [x] Update `FieldResolver` to use merged list from config
- [x] Export `PARENT_SYNONYMS` as single source of truth (shared constant)
- [x] Update `ParentFieldDiscovery.PARENT_FIELD_PATTERNS` to import from shared constant
- [x] Document configuration option in types and examples
- [x] Test with custom synonyms: `config.parentFieldSynonyms = ['initiative', 'portfolio item']`

**Rationale**: Hardcoding audit identified two issues: (1) FieldResolver cannot handle custom parent field names, (2) DRY violation - parent synonyms defined in two places (FieldResolver line 15, ParentFieldDiscovery line 10). Consolidate to single source and make configurable.

**Implementation Notes (AC9):**
- Created `src/constants/field-constants.ts` with `DEFAULT_PARENT_SYNONYMS` export
- Fixed DRY violation: Consolidated two different synonym lists into one shared constant
- Fixed order inconsistency: FieldResolver and ParentFieldDiscovery had different orders (order matters for scoring)
- Final order: `['parent', 'epic link', 'epic', 'parent link', 'parent issue']`
- Updated both FieldResolver and ParentFieldDiscovery to accept optional `customParentSynonyms` parameter
- Updated JML to pass `config.parentFieldSynonyms` to both classes
- All 52 related tests passing (38 ParentSynonymHandler + 14 ParentFieldDiscovery)

### ✅ AC10: Update Documentation and Types
- [x] Update TSDoc comments to reflect converter pattern
- [x] Document accepted input formats in converter
- [x] Add example to converter showing usage
- [x] Update architecture doc if it references IssueTypeResolver

---

## Technical Notes

### Architecture Prerequisites
- [Converter Registry Pattern](../architecture/system-architecture.md#4-field-resolution--conversion-engine)
- [Type-Based Conversion](../architecture/system-architecture.md#b-value-conversion-type-based)
- Key design patterns: Type converters, registry pattern, caching
- Key constraints: FieldConverter interface, native fetch, 95% test coverage

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [ ] Redis running on localhost:6379 (`npm run redis:start`)
- [ ] .env file configured with JIRA credentials
- [ ] JIRA_PROJECT_KEY set to project with standard issue types

**Start Prerequisites:**
```bash
# Start Redis
npm run redis:start

# Verify Redis
docker exec jml-redis redis-cli ping
# Should return "PONG"

# Check .env
cat .env | grep JIRA_PROJECT_KEY
```

### Dependencies
- E1-S06: Schema Discovery (provides issue type data)
- E2-S01: Converter Registry (register converter)
- E3-S03: JPO Hierarchy Discovery (for hierarchy filtering)
- E3-S07: IssueType Resolver (existing implementation to refactor)

### Implementation Guidance

**Key Architectural Change:**
```typescript
// OLD: Manual resolution (E3-S07)
const resolver = new IssueTypeResolver(client, cache, baseUrl);
const issueType = await resolver.resolve('PROJ', 'Bug');
// Then manually set: issuetype: { id: issueType.id }

// NEW: Automatic conversion (E3-S07b)
const issue = await jml.createIssue({
  'Issue Type': 'Bug',  // ← Automatically converted by ConverterRegistry
  Summary: 'Test'
});
// ConverterRegistry detects field type "issuetype" → calls convertIssueTypeType()
```

**Converter Structure:**
```typescript
// src/converters/types/IssueTypeConverter.ts
import { FieldConverter, ConversionContext } from '../../types/converter';
import { FieldSchema } from '../../types/schema';
import { JPOHierarchyDiscovery } from '../../hierarchy/JPOHierarchyDiscovery';

const ABBREVIATIONS = {
  bug: ['bug', 'defect', 'issue'],
  story: ['story', 'user story', 'feature'],
  task: ['task', 'work item'],
  epic: ['epic', 'initiative'],
  subtask: ['subtask', 'sub-task', 'sub task'],
};

export const convertIssueTypeType: FieldConverter = async (
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

  // If already an object with ID, pass through
  if (isIssueTypeObject(value)) {
    if ('id' in value && value.id) {
      return value; // Already resolved
    }
    if ('name' in value && value.name) {
      value = value.name; // Extract name for resolution
    }
  }

  // Must be string at this point
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Invalid issue type value for field '${fieldSchema.name}': expected string or object, got ${typeof value}`
    );
  }

  const name = value;
  const projectKey = context.projectKey;

  // Get hierarchy level from context if specified
  const hierarchyLevel = context.hierarchyLevel;

  // Check cache
  const cacheKey = getCacheKey(context.baseUrl, projectKey, name, hierarchyLevel);
  const cached = await tryGetCache(context.cache, cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch available issue types
  const issueTypes = await fetchIssueTypes(context.client, projectKey);

  // Apply hierarchy filtering if requested
  let candidateTypes = issueTypes;
  if (hierarchyLevel !== undefined) {
    candidateTypes = await filterByHierarchyLevel(
      issueTypes,
      hierarchyLevel,
      context.client,
      context.cache
    );
  }

  // Try exact match
  const exactMatches = findExactMatches(name, candidateTypes);
  if (exactMatches.length === 1) {
    const resolved = toResolvedType(exactMatches[0]);
    await tryCacheResult(context.cache, cacheKey, resolved, 300);
    return resolved;
  }

  // Handle ambiguity
  if (exactMatches.length > 1) {
    throw new AmbiguityError(
      `Issue type '${name}' is ambiguous in project ${projectKey}`,
      {
        field: fieldSchema.name,
        input: name,
        candidates: exactMatches.map(it => ({ id: it.id, name: it.name })),
      }
    );
  }

  // Try fuzzy matching
  const fuzzyMatches = findFuzzyMatches(name, candidateTypes);
  if (fuzzyMatches.length === 1) {
    const resolved = toResolvedType(fuzzyMatches[0]);
    await tryCacheResult(context.cache, cacheKey, resolved, 300);
    return resolved;
  }

  if (fuzzyMatches.length > 1) {
    throw new AmbiguityError(
      `Issue type '${name}' matches multiple types in project ${projectKey}`,
      {
        field: fieldSchema.name,
        input: name,
        candidates: fuzzyMatches.map(it => ({ id: it.id, name: it.name })),
      }
    );
  }

  // Not found
  throw new NotFoundError(
    `Issue type '${name}' not found in project ${projectKey}`,
    {
      field: fieldSchema.name,
      projectKey,
      issueTypeName: name,
      availableTypes: candidateTypes.map(it => it.name),
    }
  );
};

// Helper functions (extract from IssueTypeResolver)
function findExactMatches(name: string, types: JiraIssueType[]): JiraIssueType[] { ... }
function findFuzzyMatches(name: string, types: JiraIssueType[]): JiraIssueType[] { ... }
function getCacheKey(...parts: string[]): string { ... }
async function tryGetCache(cache, key): Promise<unknown | null> { ... }
async function tryCacheResult(cache, key, value, ttl): Promise<void> { ... }
```

**Registration:**
```typescript
// src/converters/ConverterRegistry.ts (constructor)
constructor() {
  // ... existing converters
  this.register('issuetype', convertIssueTypeType);
}
```

---

## Implementation Example

```typescript
// Example 1: Automatic conversion through standard flow
const issue = await jml.createIssue({
  Project: 'PROJ',
  'Issue Type': 'Bug',           // ← Converter called automatically
  Summary: 'Login fails'
});

// Example 2: Case-insensitive and abbreviations work
const issue = await jml.createIssue({
  Project: 'PROJ',
  'Issue Type': 'story',         // ← Resolves to "User Story"
  Summary: 'New feature'
});

// Example 3: Object format (already resolved)
const issue = await jml.createIssue({
  Project: 'PROJ',
  'Issue Type': { id: '10001' }, // ← Passed through
  Summary: 'Test'
});

// Example 4: Object format with name (needs resolution)
const issue = await jml.createIssue({
  Project: 'PROJ',
  'Issue Type': { name: 'Bug' }, // ← Name extracted and resolved
  Summary: 'Test'
});

// Behind the scenes:
// 1. FieldResolver: "Issue Type" → "issuetype" (field ID)
// 2. ConverterRegistry: Get converter for type "issuetype"
// 3. convertIssueTypeType: "Bug" → { id: "10001", name: "Bug", subtask: false }
// 4. Final payload: { fields: { issuetype: { id: "10001" }, ... } }
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Converter created at `src/converters/types/IssueTypeConverter.ts`
- [ ] Unit tests moved to `tests/unit/converters/types/IssueTypeConverter.test.ts` (≥95% coverage)
- [ ] Integration tests updated to use standard flow
- [ ] Old `IssueTypeResolver.ts` deleted
- [ ] Converter registered in `ConverterRegistry`
- [ ] TSDoc comments added to converter
- [ ] Code passes linting and type checking
- [ ] All existing tests still passing (35+ tests)
- [ ] Committed with message: `E3-S07b: Refactor issue type resolution as type converter`

---

## Implementation Hints

1. **Start by copying logic**: Copy all the logic from `IssueTypeResolver` to the new converter - don't try to refactor yet
2. **Adapt to FieldConverter interface**: Change method signature to match `(value, fieldSchema, context) => Promise<unknown>`
3. **Use context properties**: Replace constructor params with context properties (context.client, context.cache, etc.)
4. **Handle value types**: Add support for object inputs `{ id: "..." }` and `{ name: "..." }`
5. **Silent error handling**: No console.warn - follow pattern established in E3-S07 fix
6. **Move tests one at a time**: Move and adapt each test case individually to avoid breaking coverage
7. **Test through ConverterRegistry**: Add integration tests that verify automatic conversion through `convertFields()`
8. **Cache key format**: Keep same format as before: `jml:issuetype:{baseUrl}:{projectKey}:{name}:{level?}`

---

## Related Stories

- **Depends On**: E3-S07 (✅ Done - provides existing implementation)
- **Blocks**: E3-S08 (📋 Ready - should follow this pattern)
- **Related**: E2-S03 (✅ Done - PriorityConverter pattern to follow), E2-S04 (✅ Done - UserConverter pattern to follow)

---

## Testing Strategy

### Unit Tests (tests/unit/converters/types/)
```typescript
describe('IssueTypeConverter', () => {
  describe('String input', () => {
    it('should resolve exact match case-insensitively', async () => {
      const result = await convertIssueTypeType('Bug', fieldSchema, context);
      expect(result).toEqual({ id: '10001', name: 'Bug', subtask: false });
    });

    it('should resolve abbreviation "story" to "User Story"', async () => {
      const result = await convertIssueTypeType('story', fieldSchema, context);
      expect(result).toEqual({ id: '10002', name: 'User Story', subtask: false });
    });

    it('should throw AmbiguityError for multiple matches', async () => {
      await expect(
        convertIssueTypeType('task', fieldSchema, context)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should throw NotFoundError if not found', async () => {
      await expect(
        convertIssueTypeType('Feature', fieldSchema, context)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Object input', () => {
    it('should pass through object with id', async () => {
      const input = { id: '10001' };
      const result = await convertIssueTypeType(input, fieldSchema, context);
      expect(result).toBe(input);
    });

    it('should resolve object with name', async () => {
      const result = await convertIssueTypeType({ name: 'Bug' }, fieldSchema, context);
      expect(result).toEqual({ id: '10001', name: 'Bug', subtask: false });
    });
  });

  describe('Caching', () => {
    it('should cache resolved results', async () => {
      await convertIssueTypeType('Bug', fieldSchema, context);
      expect(context.cache.set).toHaveBeenCalledWith(
        expect.stringContaining('issuetype'),
        expect.any(String),
        300
      );
    });

    it('should return cached results', async () => {
      context.cache.get.mockResolvedValueOnce(JSON.stringify({ id: '10001', name: 'Bug' }));
      await convertIssueTypeType('Bug', fieldSchema, context);
      expect(context.client.get).not.toHaveBeenCalled();
    });
  });

  describe('Hierarchy filtering', () => {
    it('should filter by hierarchy level when specified', async () => {
      context.hierarchyLevel = 0;
      const result = await convertIssueTypeType('Sub-task', fieldSchema, context);
      expect(result.subtask).toBe(true);
    });

    it('should gracefully degrade if JPO unavailable', async () => {
      // Mock JPO returning null
      const result = await convertIssueTypeType('Bug', fieldSchema, context);
      expect(result).toBeDefined(); // Still works, no filtering
    });
  });
});
```

### Integration Tests (tests/integration/)
```typescript
describe('Integration: IssueType Conversion', () => {
  it('should automatically convert issue type name in createIssue', async () => {
    const issue = await jml.createIssue({
      Project: testProjectKey,
      'Issue Type': 'Bug',
      Summary: 'Test automatic conversion'
    });
    
    expect(issue.key).toMatch(/[A-Z]+-\d+/);
    expect(issue.fields.issuetype.name).toBe('Bug');
  });

  it('should work with abbreviations', async () => {
    const issue = await jml.createIssue({
      Project: testProjectKey,
      'Issue Type': 'story',
      Summary: 'Test abbreviation'
    });
    
    expect(issue.fields.issuetype.name).toContain('Story');
  });
});
```

---

## Notes

**Why This Refactor Matters:**

1. **Architectural Consistency**: All value conversion happens through `ConverterRegistry` - no special cases
2. **User Experience**: Users never need to call resolvers manually - conversion is automatic
3. **Maintainability**: One place to look for conversion logic (converters), not scattered across `operations/`
4. **Extensibility**: Users can override with custom converters if needed
5. **Future-Proof**: E3-S08 (Project) will follow this exact pattern

**Migration Path:**

This is a refactor, not a new feature. All existing functionality is preserved, just relocated to the correct architectural layer. Tests should move with the code to maintain coverage.

# E2-S11: Version Item Converter

**Epic**: Epic 2 - Core Field Types  
**Size**: Small (3 points)  
**Priority**: P1  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: Commit 41ba623, e7e7adb, 72c371b  
**Started**: 2025-10-22  
**Completed**: 2025-10-22

---

## User Story

**As a** developer using the JIRA Magic Library  
**I want** to set fix versions by name (e.g., "v1.0", "v2.0") for `items: "version"`  
**So that** I can assign versions without looking up IDs, and the array converter handles multiple versions automatically

---

## Acceptance Criteria

### ✅ AC1: Type-Based Registration
- [x] Converter registered as `registry.register('version', convertVersionType)`
- [x] Used by array converter when `schema.items === 'version'`
- [x] Works for any project's version list

**Evidence**: [ConverterRegistry.ts line 61](../../src/converters/ConverterRegistry.ts#L61) - Registered as 'version' type

### ✅ AC2: Version Name to ID Conversion
- [x] String `"v1.0"` converts to `{ id: "10200" }` (from versions list)
- [x] Case-insensitive: `"v1.0"` matches `"V1.0"`
- [x] Already-object input `{ id: "10200" }` passes through unchanged

**Evidence**: [VersionConverter.test.ts lines 47-82](../../tests/unit/converters/types/VersionConverter.test.ts#L47-L82) - 10 tests passing

### ✅ AC3: Use Lookup Cache
- [x] Query version list from cache if available
- [x] On cache miss, query JIRA createmeta or project API
- [x] Store result in cache with TTL
- [x] Cache key: `lookup:{projectKey}:version`

**Evidence**: [VersionConverter.test.ts lines 84-148](../../tests/unit/converters/types/VersionConverter.test.ts#L84-L148) - 6 cache tests passing, including graceful degradation

### ✅ AC4: Use Ambiguity Detection
- [x] If multiple versions match name, throw `AmbiguityError` with candidates
- [x] Use `resolveUniqueName()` helper from E2-S05

**Evidence**: [VersionConverter.test.ts lines 150-171](../../tests/unit/converters/types/VersionConverter.test.ts#L150-L171) - AmbiguityError tests passing

### ✅ AC5: Validation & Error Handling
- [x] If version not found, throw `ValidationError` with available versions
- [x] Empty string throws `ValidationError`
- [x] `null` or `undefined` passes through (optional field)

**Evidence**: [VersionConverter.test.ts lines 173-242](../../tests/unit/converters/types/VersionConverter.test.ts#L173-L242) - 12 validation tests passing

### ✅ AC6: Unit Tests
- [x] Test version name → ID conversion (mock versions)
- [x] Test case-insensitive matching
- [x] Test already-object passthrough
- [x] Test ambiguity detection (multiple matches)
- [x] Test not found error
- [x] Test cache usage
- [x] Coverage ≥95%

**Evidence**: 31/31 unit tests passing, 100% coverage for VersionConverter (97.68% overall)

### ✅ AC7: Integration Test with Real JIRA
- [x] Create issue with fixVersions array: `{ fixVersions: ["v1.0", "v2.0"] }` **Evidence**: [tests/integration/version-converter.test.ts:93-124](../../tests/integration/version-converter.test.ts#L93-L124) - Test creates ZUL issues with multiple versions
- [x] Verify array converter delegates to version converter (versions resolved by name) **Evidence**: Test 1-5 all use version names, successfully converted to IDs
- [x] Verify JIRA accepts version IDs and creates issue with correct fix versions **Evidence**: 6 issues created (ZUL-22533 to ZUL-22538), versions verified via API
- [x] Integration test passes: `npm run test:integration` **Evidence**: 7/7 tests passing (5 creation tests + 2 error handling tests)

---

## Technical Notes

### Architecture Prerequisites
- [Field Conversion - Version Example](../architecture/system-architecture.md#b-value-conversion-type-based)
- [JIRA Field Types - Version](../JIRA-FIELD-TYPES.md#lookup-types)

### Dependencies
- E2-S04: Array Type Converter (calls this converter for version arrays)
- E2-S05: Ambiguity Detection (provides helper)
- E2-S06: Lookup Cache Infrastructure (provides caching)

### Implementation Guidance
- Query versions from createmeta: `fields.fixVersions.allowedValues`
- Or query project: `GET /rest/api/2/project/{projectKey}/versions`
- Versions are project-specific (not issue-type specific)
- Format: `[{ id: "10200", name: "v1.0" }, { id: "10201", name: "v2.0" }]`

---

## Example Behavior

### Example 1: Fix Versions Array
```typescript
// User input
{
  project: 'TEST',
  issueType: 'Bug',
  summary: 'Bug to fix',
  fixVersions: ['v1.0', 'v1.1']
}

// Field schema
{
  "fixVersions": {
    "schema": { "type": "array", "items": "version" },
    "allowedValues": [
      { "id": "10200", "name": "v1.0" },
      { "id": "10201", "name": "v1.1" },
      { "id": "10202", "name": "v2.0" }
    ]
  }
}

// Conversion
fixVersions: ["v1.0", "v1.1"]
  → Array converter iterates
  → Version converter: "v1.0" → { id: "10200" }
  → Version converter: "v1.1" → { id: "10201" }
  → Return: [{ id: "10200" }, { id: "10201" }]

// Output
{
  fields: {
    fixVersions: [
      { id: '10200' },
      { id: '10201' }
    ]
  }
}
```

### Example 2: Single Version (CSV)
```typescript
// User input
{
  project: 'TEST',
  issueType: 'Bug',
  summary: 'Quick fix',
  fixVersions: 'v1.0'  // CSV string with single value
}

// Conversion
fixVersions: "v1.0"
  → Array converter splits: ["v1.0"]
  → Version converter: "v1.0" → { id: "10200" }
  → Return: [{ id: "10200" }]

// Output
{
  fields: {
    fixVersions: [{ id: '10200' }]
  }
}
```

### Example 3: Version Not Found
```typescript
// User input
{ fixVersions: ['v3.0'] }

// Available versions
[
  { id: "10200", name: "v1.0" },
  { id: "10201", name: "v1.1" },
  { id: "10202", name: "v2.0" }
]

// Result: ❌ ValidationError
// Message: "Version 'v3.0' not found in project TEST. Available: v1.0, v1.1, v2.0"
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] Version converter implemented in `src/converters/types/VersionConverter.ts`
- [x] Registered in `ConverterRegistry`
- [x] Unit tests passing (≥95% coverage)
- [x] Integration test passing (with array converter)
- [x] Uses ambiguity detection helper
- [x] Uses lookup cache
- [x] TSDoc comments added
- [x] Code passes linting and type checking
- [x] Committed with message: `E2-S11: Implement version item converter`

---

## Related Stories

- **Depends On**: E2-S04: Array Type Converter (✅ Done - calls this converter)
- **Depends On**: E2-S05: Ambiguity Detection (📋 Ready)
- **Depends On**: E2-S06: Lookup Cache (📋 Ready)
- **Related**: E2-S10: Component Item Converter (similar pattern)
- **Blocks**: E2-S12: Integration Tests (📋 Ready)

---

## Testing Strategy

### Unit Tests (tests/unit/converters/types/)
- Version name → ID conversion
- Case-insensitive matching
- Object passthrough
- Ambiguity detection
- Not found error
- Cache usage

### Integration Tests (tests/integration/)
- Create issue with fixVersions array
- Create issue with fixVersions CSV
- Verify array converter uses version converter
- Test with real JIRA versions

---

## Notes

**Array Integration**: Like component converter, this handles a **single version**. The array converter handles iteration.

**Project-Specific**: Versions are defined per project. Cache by project key only.

**Common Versions**: v1.0, v1.1, v2.0, Sprint 1, Release 2024-Q1, etc.

**Released vs Unreleased**: JIRA versions have `released: true/false` flag. For MVP, ignore this (convert any version). Can add filtering in Epic 6.

**Reference**: [JIRA Field Types - Version](../JIRA-FIELD-TYPES.md#lookup-types)

# S1: User Ambiguity Policy Options

**Epic**: None
**Size**: Small (3 points)  
**Priority**: P1  
**Status**: ✅ Done  
**Assignee**: Codex (GPT-5)  
**PR**: Commit 2483346c9e0496982e75f9469ed9066cf3780d18  
**Started**: 2025-11-22  
**Completed**: 2025-11-22

---

## User Story

**As a** developer consuming the user converter  
**I want** to control how ambiguous user lookups are resolved (first, error, or score-based)  
**So that** automation and tooling flows can pick the right account without being blocked by harmless duplicates while still allowing strict validation when needed

---

## Acceptance Criteria

### ✅ AC1: Default policy resolves to first exact match
- [x] Default ambiguity policy for user lookups is `first` (breaking change from "error")
- [x] When multiple candidates all match the same email/username (case-insensitive), return the first candidate instead of throwing
- [x] Behavior is applied across user converter code paths (email, display name, and username inputs)

**Evidence**: Updated converter logic (`src/converters/types/UserConverter.ts`) and default policy tests (`tests/unit/converters/types/UserConverter.test.ts:380`)

### ✅ AC2: Configurable policy supports `error`
- [x] A configurable option (e.g., `ambiguityPolicy.user`) accepts at least `first` and `error`
- [x] When set to `error`, previous behavior is preserved: multiple matches throw `AmbiguityError`
- [x] Policy can be set via JML config and is honored by the user converter

**Evidence**: Config types (`src/types/config.ts`), loader env parsing (`src/config/loader.ts`), and strict policy tests (`tests/unit/converters/types/UserConverter.test.ts:250-360`, `tests/unit/config/loader.test.ts:220-248`)

### ✅ AC3: Configurable policy supports `score`
- [x] A `score` policy is available that selects the highest-confidence candidate when multiple results are returned
- [x] Ties under `score` fall back deterministically (documented behavior: e.g., first in sorted list, not random)
- [x] Unit tests cover `score` policy selection and tie handling

**Evidence**: Score ranking implementation (`src/converters/types/UserConverter.ts`) with coverage in `tests/unit/converters/types/UserConverter.test.ts:398-430`)

### ✅ AC4: Documentation and tests updated
- [x] README/guide notes updated to describe user ambiguity policies and defaults
- [x] Unit tests added/updated for all policies (`first`, `error`, `score`) and exact-match shortcut
- [x] No PII or real user accounts are hardcoded in tests; tests rely on helpers/fixtures

**Evidence**: README config section (`README.md#User Ambiguity Policy`) plus the refreshed unit suite (`tests/unit/converters/types/UserConverter.test.ts`)

---



## Technical Notes

### Architecture Prerequisites
- Field Resolution & Conversion: see `src/converters/types/UserConverter.ts`
- Config surface likely via existing JML config or converter options

### Testing Prerequisites

**Before running tests, ensure:**
- Redis available if any integration paths need it (`redis://localhost:6379` for defaults)
- `.env.test` contains JIRA test user for converter tests (`JIRA_TEST_USER_EMAIL`, `JIRA_TEST_USER_NAME`)
- Node 18+ per project standard

**Start Prerequisites:**
```bash
# Verify Redis (optional for unit-only)
docker ps | grep redis

# Verify test env
grep JIRA_TEST_USER_EMAIL .env.test
```

### Dependencies
- None new; builds on existing user converter in Epic 2

### Implementation Guidance
- Add `ambiguityPolicy.user` (or similar) to config; default to `first`
- Implement exact-match fast path (all candidates share the same identifier → pick first)
- Implement `score` by ordering candidates using existing search scoring; document tie-break
- Preserve `AmbiguityError` messaging for `error` policy

```typescript
// Example policy shape
type AmbiguityPolicy = 'first' | 'error' | 'score';

const policy = config.ambiguityPolicy?.user ?? 'first';
```

---

## Implementation Example

```typescript
describe('User ambiguity policy', () => {
  it('first (default) returns first exact email match', async () => {
    const result = await convertUserType('alex@example.com', field, ctxWithPolicy('first'));
    expect(result).toEqual({ name: 'alex' });
  });

  it('error throws when multiple matches and policy=error', async () => {
    await expect(
      convertUserType('alex@example.com', field, ctxWithPolicy('error'))
    ).rejects.toThrow(AmbiguityError);
  });

  it('score picks highest scoring candidate', async () => {
    const result = await convertUserType('alex', field, ctxWithPolicy('score'));
    expect(result).toEqual({ name: 'higher-score' });
  });
});
```

---

## Definition of Done

- [x] All acceptance criteria met with evidence links


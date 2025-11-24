# S3: Fuzzy Field Name Resolution

**Epic**: None  
**Size**: Medium (5 points)  
**Priority**: P2  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer mapping human-friendly field names  
**I want** field name resolution to use the same fuzzy matching quality as value lookups (Fuse.js)  
**So that** slight variations like “Fix Version” or “Versions” still bind to the correct JIRA field without manual retries

---

## Acceptance Criteria

### ✅ AC1: Fuse-backed field name matching
- [ ] Field name resolution uses Fuse.js (or equivalent scoring) over the available schema field names
- [ ] Exact matches always win; fuzzy scoring only applies when no exact match
- [ ] Matching is case-insensitive and tolerant of spaces, slashes, underscores, and hyphens

**Evidence**:

### ✅ AC2: Ambiguity handling for field names
- [ ] When multiple field names score within a small threshold, surface an explicit ambiguity error listing candidates
- [ ] Deterministic tie-breaker documented (e.g., best score, then shortest name, then alphabetical)
- [ ] Behavior mirrors value ambiguity handling patterns already in the library

**Evidence**:

### ✅ AC3: Safe fallbacks and warnings
- [ ] If no reasonable match is found (score below threshold), fall back to current warning/skip behavior
- [ ] Suggestions in warnings reference the highest-scoring candidates
- [ ] No existing exact-match flows regress (project/issuetype special cases remain unchanged)

**Evidence**:

### ✅ AC4: Tests and docs
- [ ] Unit tests cover: exact, near-miss, ambiguity, and no-match cases for field names (including Fix Version/s variants)
- [ ] README or architecture note updated to describe field name matching strategy and ambiguity behavior
- [ ] No PII introduced in tests

**Evidence**:

---

## Technical Notes

### Architecture Prerequisites
- Field Resolution: `src/converters/FieldResolver.ts`
- Existing value fuzzy matching: `src/utils/resolveUniqueName.ts` (Fuse.js)

### Testing Prerequisites

**Before running tests:**
- Redis not required for unit scope
- `.env.test` available for shared helpers
- Node 18+

### Dependencies
- Related: S1 (user ambiguity policy) informs ambiguity patterns
- Related: S2 (directory spike) for broader ambiguity approaches

### Implementation Guidance
- Mirror the Fuse configuration used in `resolveUniqueName` but tune threshold for field names (shorter strings)
- Preserve “exact match first, then fuzzy, then warn/skip” ordering
- Add ambiguity guardrails to avoid mis-routing values to the wrong field

```typescript
// Sketch
const fuse = new Fuse(fieldEntries, { keys: ['name'], threshold: 0.3, ignoreLocation: true });
const results = fuse.search(input);
```

---

## Implementation Example

```typescript
it('resolves near-miss field names with fuse', async () => {
  const resolved = await resolver.resolveFields('ENG', 'Bug', { 'Fix Version': 'MS7' });
  expect(resolved).toHaveProperty('fixVersions');
});
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Code implemented in `src/converters/FieldResolver.ts`
- [ ] Unit tests passing (=95% coverage target intact)
- [ ] Documentation updated (README/architecture note)
- [ ] Validation clean (`npm run validate:workflow`)
- [ ] Committed with message: `S3: Add fuzzy field name resolution`

---

## Definition of Done Exceptions

None requested.

---

## Implementation Hints

1. Keep project/issuetype special cases untouched.
2. Use deterministic tie-breakers to avoid flakiness across runs.
3. Log/suggest candidates when skipping instead of silently failing.
4. Avoid over-matching very short inputs; consider minimum length before fuzzing.
5. Reuse existing ambiguity error patterns for consistency.

---

## Related Stories

- **Depends On**: -  
- **Blocks**: -  
- **Related**: S1 (user ambiguity policy), S2 (user directory spike)

---

## Testing Strategy

### Unit Tests (tests/unit/)
```typescript
describe('FieldResolver (fuzzy)', () => {
  it('matches Fix Version from "Version"', ...);
  it('errors on ambiguity with close scores', ...);
  it('skips with warning when below threshold', ...);
});
```

### Integration Tests (tests/integration/)
- Not required unless adding end-to-end coverage later; unit coverage is sufficient for the resolver.

---

## Notes

- Keep thresholds conservative to avoid misrouting values to similarly named custom fields.
- Consider future config for fuzziness level if users request stricter behavior.

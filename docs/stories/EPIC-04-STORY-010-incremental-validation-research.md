# E4-S10: Incremental Validation Research

**Epic**: Epic 4 - Bulk Operations  
**Size**: Large (8 points)  
**Priority**: P2  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** library architect  
**I want** to research incremental validation strategies for live UI updates  
**So that** we can recommend a scalable approach for future validation features

---

## Acceptance Criteria

### ✅ AC1: Research Change Detection
- [ ] Investigate row-level change detection (compare original vs modified)
- [ ] Investigate field-level change detection (which fields changed)
- [ ] Research checksums/hashing for detecting unchanged rows
- [ ] Document findings in `docs/research/incremental-validation.md`

**Evidence**: 

### ✅ AC2: Research Partial Validation
- [ ] Investigate validating only changed rows
- [ ] Investigate validating only changed fields
- [ ] Research cache invalidation strategies for lookups
- [ ] Document API design for partial validation

**Evidence**: 

### ✅ AC3: Performance Benchmarks
- [ ] Benchmark: Detect changes in 1000 rows (<10ms)
- [ ] Benchmark: Validate single changed row (<50ms)
- [ ] Benchmark: Validate single changed field (<20ms)
- [ ] Document performance targets in research doc

**Evidence**: 

### ✅ AC4: Recommend Approach
- [ ] Recommend: Full re-validation vs incremental
- [ ] Recommend: When to use which strategy
- [ ] Document limitations and edge cases
- [ ] Provide API design example

**Evidence**: 

### ✅ AC5: Proof-of-Concept (Optional)
- [ ] Create minimal POC if needed to test approach
- [ ] POC code in `research/` directory (not production)
- [ ] Demonstrate change detection + partial validation
- [ ] Document POC results

**Evidence**: 

### ✅ AC6: Documentation
- [ ] Create `docs/research/incremental-validation.md`
- [ ] Include: problem statement, approaches, benchmarks
- [ ] Include: recommended approach with pros/cons
- [ ] Include: proposed API design for future epic

**Evidence**: 

---

## Technical Notes

### Architecture Prerequisites
- None (research story, no production code changes)

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running research/POC:**
- [ ] Redis running for POC lookups
- [ ] Test datasets prepared (1000+ rows)

**Start Prerequisites:**
```bash
npm run redis:start
```

---

## Related Stories

- **Depends On**: 
  - E4-S07 (Schema Validation) - baseline for comparison
  - E4-S09 (Full Pipeline Validation) - baseline for comparison
- **Blocks**: None (research story, may inform future epic)
- **Related**: None

---

## Testing Strategy

### Research Approach
- **Not traditional testing** - this is research/investigation
- **Deliverable**: `docs/research/incremental-validation.md`
- **Focus Areas**:
  - Change detection algorithms (checksums, diff)
  - Partial validation strategies
  - Performance benchmarks
  - Recommended approach with pros/cons

### Proof-of-Concept (If Created)
- **File**: `research/incremental-validation-poc.ts`
- **Focus Areas**:
  - Demonstrate change detection
  - Benchmark: Detect changes in 1000 rows
  - Benchmark: Validate single changed row
  - Compare full vs incremental performance

### Prerequisites
- Test datasets (1000+ rows)
- Redis running (for POC caching tests)

---

## Technical Notes

### Architecture Prerequisites
- E4-S07: Schema-Only Validation (baseline)
- E4-S09: Full Pipeline Validation (baseline)

### Implementation Guidance

**Research Questions to Answer:**

1. **Change Detection:**
   - How to efficiently detect which rows changed?
   - How to detect which fields within a row changed?
   - Should we use checksums, deep comparison, or user-provided hints?

2. **Partial Validation:**
   - Can we validate only changed rows (skip unchanged)?
   - Can we validate only changed fields (skip unchanged fields)?
   - How does this interact with dependent fields (e.g., Project affects available Components)?

3. **Cache Strategies:**
   - How long to cache lookup results?
   - How to invalidate cache when schema changes?
   - Can we use optimistic caching for unchanged rows?

4. **Performance Targets:**
   - UI scenario: User edits one cell, need feedback in <50ms
   - Bulk scenario: User imports 1000 rows, then edits 10 rows
   - What's the overhead of change detection itself?

**Possible Approaches:**

```typescript
// Approach A: Row-level change detection
interface ValidationOptions {
  originalData?: any[];  // For comparison
  changedIndices?: number[];  // User provides hints
}

await jml.validate(newData, { 
  originalData: oldData,  // Auto-detect changes
  mode: 'incremental'
});

// Approach B: Field-level change detection
await jml.validate(newData, {
  changedFields: {
    5: ['Assignee'],  // Row 5, only Assignee changed
    12: ['Summary', 'Description']  // Row 12, two fields changed
  }
});

// Approach C: Checkpoint-based
const checkpoint = await jml.validate(data);  // Returns checkpoint ID
// User edits data...
await jml.validate(data, { 
  checkpoint: checkpoint.id  // Only validate delta
});
```

---

## Implementation Example

```markdown
# docs/research/incremental-validation.md

## Problem Statement
When validating 1000 rows, full validation takes ~5 seconds. If user edits 1 row, 
re-validating all 1000 rows is wasteful. Can we validate only the changed row in <50ms?

## Approaches Investigated

### Approach 1: Row-Level Diff (Recommended)
- Compare new data vs original data using row checksums
- Only validate rows where checksum changed
- Overhead: ~10ms to compute checksums for 1000 rows
- Validation: ~50ms per changed row (same as full validation)
- **Pros**: Simple, no user hints needed
- **Cons**: Still validates entire row even if only one field changed

### Approach 2: Field-Level Diff
- Detect which specific fields changed in each row
- Only re-run converters for changed fields
- Problem: Field dependencies (e.g., Project change affects Components)
- **Pros**: Minimal work done
- **Cons**: Complex dependency tracking

### Approach 3: User-Provided Hints
- User tells us which rows/fields changed
- Fastest, no detection overhead
- **Pros**: Minimal overhead
- **Cons**: Requires UI integration, error-prone

## Benchmarks
- Compute checksums (1000 rows): 8ms
- Detect changes (1000 rows, 10 changed): 12ms
- Validate changed rows (10 rows): 500ms
- **Total**: 520ms (vs 5000ms full re-validation) = 90% faster

## Recommendation
Implement **Approach 1** in future epic:
- Use row-level checksums for change detection
- Validate only changed rows
- Cache lookup results (TTL: 5 minutes)
- Target: <50ms for single row edit

## Proposed API
```typescript
// User flow
const result1 = await jml.validate(data);
// User edits row 5...
const result2 = await jml.validate(data, { original: data });
// Only row 5 re-validated
```
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Research document created: `docs/research/incremental-validation.md`
- [ ] Benchmarks documented with measurements
- [ ] Recommended approach documented with pros/cons
- [ ] Proposed API design included
- [ ] POC code in `research/` directory (if created)
- [ ] Demo showing POC (if applicable) OR exception justified
- [ ] Committed with message: `E4-S10: Research incremental validation strategies`

---

## Definition of Done Exceptions

**Demo Exception (If No POC Created):**
This is a research story that may not produce executable code. If the research concludes that a POC is not needed (findings are clear from analysis), a demo exception is justified. Document the decision in the research document.

**Demo Exception (If POC Created):**
Demo can be a simple terminal output showing:
1. Benchmark results (change detection time, validation time)
2. Example of detecting changes in a dataset
3. Comparison: full validation vs incremental validation timing

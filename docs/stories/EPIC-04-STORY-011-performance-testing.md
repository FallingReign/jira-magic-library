# E4-S11: Performance Testing & Optimization

**Epic**: Epic 4 - Bulk Operations  
**Size**: Medium (5 points)  
**Priority**: P1  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer using the library  
**I want** bulk operations optimized for performance  
**So that** I can create 100+ issues quickly without bottlenecks

---

## Acceptance Criteria

### ✅ AC1: Benchmark Suite
- [ ] Create performance test suite in `tests/performance/`
- [ ] Benchmark: Create 100 issues from CSV (target: <10s)
- [ ] Benchmark: Create 100 issues from JSON (target: <10s)
- [ ] Benchmark: Create 100 issues from array (target: <10s)
- [ ] Run benchmarks against real JIRA instance

**Evidence**: 

### ✅ AC2: Identify Bottlenecks
- [ ] Measure time spent in parsing
- [ ] Measure time spent in field resolution
- [ ] Measure time spent in value conversion
- [ ] Measure time spent in API calls
- [ ] Document findings in `docs/performance.md`

**Evidence**: 

### ✅ AC3: Test Batch Size Tuning
- [ ] Test batch sizes: 10, 25, 50, 100
- [ ] Measure throughput for each batch size
- [ ] Measure error handling overhead
- [ ] Recommend optimal batch size

**Evidence**: 

### ✅ AC4: Test Concurrency Tuning
- [ ] Test concurrency levels: 1, 2, 4, 8 parallel batches
- [ ] Measure throughput for each level
- [ ] Identify JIRA rate limits (if any)
- [ ] Recommend optimal concurrency

**Evidence**: 

### ✅ AC5: Optimize Based on Findings
- [ ] Implement optimizations for identified bottlenecks
- [ ] May include: Caching improvements, batching adjustments, parallel lookups
- [ ] Re-run benchmarks to verify improvements
- [ ] Document: before/after performance metrics

**Evidence**: 

### ✅ AC6: Documentation
- [ ] Create `docs/performance.md` with benchmarks
- [ ] Document: optimal batch size and concurrency
- [ ] Document: performance best practices for users
- [ ] Include: troubleshooting slow performance

**Evidence**: 

---

## Technical Notes

### Architecture Prerequisites
- [Bulk Processor](../architecture/system-architecture.md#6-bulk-processor)
- Requires completed E4-S04 (Unified create) for testing

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running performance tests:**
- [ ] Redis running (for cache benchmarks)
- [ ] JIRA credentials configured
- [ ] JIRA project with permissions for bulk creation
- [ ] Large test datasets prepared (100+ rows)

**Start Prerequisites:**
```bash
npm run redis:start
```

---

## Related Stories

- **Depends On**: 
  - E4-S01 (Input Parser) - parsing benchmarks
  - E4-S04 (Unified create()) - end-to-end benchmarks
- **Blocks**: None
- **Related**: E4-S12 (Documentation) - performance findings documented

---

## Testing Strategy

### Performance Test Suite
- **File**: `tests/performance/bulk-create.perf.ts`
- **Coverage Target**: N/A (performance testing)
- **Focus Areas**:
  - Parse 100-row CSV/JSON/YAML (measure time)
  - Create 100 issues from array (<10s target)
  - Measure: Parsing, resolution, conversion, API calls
  - Test batch sizes: 10, 25, 50, 100
  - Test concurrency: 1, 2, 4, 8 parallel batches

### Benchmarking
- **Methodology**: Run each test 5 times, report avg/min/max
- **Baseline**: Document current performance
- **Optimization**: Identify bottlenecks, optimize, re-test
- **Documentation**: `docs/performance.md`

### Prerequisites
- JIRA credentials configured
- Redis running (for realistic caching behavior)
- Large test datasets (100+ rows)
- Clean JIRA project for testing

---

## Technical Notes

### Architecture Prerequisites
- E4-S01: Unified Input Parser (parsing benchmarks)
- E4-S04: Unified create() Method (end-to-end benchmarks)

### Implementation Guidance

**Performance test structure:**
```typescript
// tests/performance/bulk-create.perf.ts
describe('Bulk Create Performance', () => {
  it('should create 100 issues from CSV in <10s', async () => {
    const csv = generateTestCSV(100);  // Helper to generate test data
    
    const start = Date.now();
    const result = await jml.issues.create({ from: 'test.csv', data: csv });
    const duration = Date.now() - start;
    
    expect(result.succeeded).toBe(100);
    expect(duration).toBeLessThan(10000);  // 10 seconds
    
    console.log(`Created 100 issues in ${duration}ms`);
  });
  
  it('should measure parsing overhead', async () => {
    const csv = generateTestCSV(100);
    
    const start = Date.now();
    const parsed = await parser.parse({ data: csv, format: 'csv' });
    const duration = Date.now() - start;
    
    console.log(`Parsed 100 rows in ${duration}ms`);
  });
  
  it('should measure conversion overhead', async () => {
    const data = generateTestArray(100);
    
    const start = Date.now();
    for (const row of data) {
      await converter.convertFields(schema, row, context);
    }
    const duration = Date.now() - start;
    
    console.log(`Converted 100 rows in ${duration}ms`);
  });
});
```

**Batching experiment:**
```typescript
// Test different batch sizes
const batchSizes = [10, 25, 50, 100];
for (const size of batchSizes) {
  const start = Date.now();
  const result = await createWithBatchSize(data, size);
  const duration = Date.now() - start;
  console.log(`Batch size ${size}: ${duration}ms`);
}
```

---

## Implementation Example

```typescript
// Run performance tests
npm run test:performance

// Output:
// ✓ Create 100 issues from CSV: 8234ms (target: <10s) ✅
// ✓ Create 100 issues from JSON: 7891ms (target: <10s) ✅
// ✓ Create 100 issues from array: 7456ms (target: <10s) ✅
//
// Breakdown:
// - Parsing: 123ms (1.5%)
// - Field resolution: 234ms (2.8%)
// - Value conversion: 1456ms (17.6%)
// - API calls: 6543ms (78.1%)
//
// Batch size comparison:
// - 10 issues/batch: 12.3s
// - 25 issues/batch: 9.8s
// - 50 issues/batch: 8.2s ✅ (optimal)
// - 100 issues/batch: 9.1s (JIRA timeouts)
//
// Concurrency comparison:
// - 1 parallel batch: 15.6s
// - 2 parallel batches: 10.2s
// - 4 parallel batches: 8.2s ✅ (optimal)
// - 8 parallel batches: 8.5s (no improvement)
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Performance test suite created in `tests/performance/`
- [ ] Benchmarks run against real JIRA
- [ ] Bottlenecks identified and documented
- [ ] Optimizations implemented (if needed)
- [ ] Performance documentation created: `docs/performance.md`
- [ ] Demo showing before/after benchmarks
- [ ] TSDoc comments for performance-related code
- [ ] Code passes linting and type checking
- [ ] Committed with message: `E4-S11: Add performance testing and optimize bulk operations`

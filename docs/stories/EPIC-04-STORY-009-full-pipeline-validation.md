# E4-S09: Full Pipeline Validation

**Epic**: Epic 4 - Bulk Operations  
**Size**: Medium (5 points)  
**Priority**: P2  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer using the library  
**I want** validation that includes field resolution and value conversion  
**So that** I can catch ambiguity errors and lookup failures before creating issues

---

## Acceptance Criteria

### ✅ AC1: Full Pipeline Validation Option
- [ ] Add `validateFull()` method (or `validate({ full: true })`)
- [ ] Perform field resolution (field names → IDs)
- [ ] Perform value conversion (user names → accountIds, etc.)
- [ ] Catch AmbiguityError, NotFoundError from lookups
- [ ] Do NOT call create API

**Evidence**: 

### ✅ AC2: Detect Lookup Errors
- [ ] Catch ambiguous user names (multiple matches)
- [ ] Catch ambiguous component names
- [ ] Catch not-found errors (invalid user, component, etc.)
- [ ] Return errors with row index and field name

**Evidence**: 

### ✅ AC3: Performance Considerations
- [ ] Slower than schema-only validation (requires API lookups)
- [ ] Use cache to reduce lookup calls
- [ ] Batch lookups where possible
- [ ] Target: 100 rows in <5 seconds

**Evidence**: 

### ✅ AC4: Validation Result Format
- [ ] Same ValidationResult format as E4-S07
- [ ] Include additional error codes: AMBIGUOUS, NOT_FOUND
- [ ] Include candidate suggestions for ambiguous matches
- [ ] Clear error messages for each failure

**Evidence**: 

### ✅ AC5: Testing Coverage
- [ ] Unit tests for full pipeline validation
- [ ] Integration test with ambiguous user names
- [ ] Integration test with not-found components
- [ ] Performance test: 100 rows < 5 seconds
- [ ] 95% test coverage

**Evidence**: 

---

## Technical Notes

### Architecture Prerequisites
- [Field Resolution & Conversion Engine](../architecture/system-architecture.md#4-field-resolution--conversion-engine)
- Uses full converter pipeline but skips API call

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [ ] Redis running
- [ ] JIRA credentials configured
- [ ] Test data with ambiguous names

**Start Prerequisites:**
```bash
npm run redis:start
```

---

## Related Stories

- **Depends On**: 
  - E4-S07 (Schema Validation) - extends with full pipeline
  - E2-S05 (User Converter) - uses ambiguity detection
- **Blocks**: None
- **Related**: E4-S08 (Enhanced Dry-Run) - similar but creates payloads

---

## Testing Strategy

### Unit Tests
- **File**: `tests/unit/validation/FullPipelineValidator.test.ts`
- **Coverage Target**: ≥95%
- **Focus Areas**:
  - Field resolution with validation
  - Value conversion with validation
  - Ambiguity error detection
  - Not-found error detection

### Integration Tests
- **File**: `tests/integration/full-validation.test.ts`
- **Focus Areas**:
  - Validate with ambiguous user names
  - Validate with not-found components
  - Validate with invalid field values
  - Performance: 100 rows in <5 seconds

### Prerequisites
- JIRA credentials (for lookups)
- Redis running (for caching)
- Test data with ambiguous names

---

## Technical Notes

### Architecture Prerequisites
- E4-S07: Schema-Only Validation (extends with full pipeline)
- E2-S05: Ambiguity Detection

### Implementation Guidance

**Full validation:**
```typescript
async validateFull(input: any): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  
  for (const [index, row] of parsed.data.entries()) {
    try {
      // Perform field resolution
      const resolved = await this.resolver.resolveFields(projectKey, issueType, row);
      
      // Perform conversion (triggers lookups)
      const converted = await this.converter.convertFields(schema, resolved, context);
      
      // If we get here, validation passed for this row
    } catch (err) {
      if (err instanceof AmbiguityError) {
        errors.push({
          rowIndex: index,
          field: err.field,
          code: 'AMBIGUOUS',
          message: err.message,
          candidates: err.candidates  // Show options
        });
      } else if (err instanceof NotFoundError) {
        errors.push({
          rowIndex: index,
          field: err.field,
          code: 'NOT_FOUND',
          message: err.message
        });
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}
```

---

## Implementation Example

```typescript
// Full pipeline validation (catches lookup errors)
const validation = await jml.validateFull([
  { Project: 'ENG', Assignee: 'John' },  // Ambiguous (3 Johns)
  { Project: 'ENG', Component: 'Frontend' }
]);

if (!validation.valid) {
  validation.errors.forEach(err => {
    if (err.code === 'AMBIGUOUS') {
      console.log(`Row ${err.rowIndex}: ${err.message}`);
      console.log('Did you mean:', err.candidates);
    }
  });
}
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Code implemented in `src/validation/ValidationService.ts`
- [ ] Unit tests passing (≥95% coverage)
- [ ] Integration test with ambiguous lookups
- [ ] Demo created showing full vs schema-only validation
- [ ] TSDoc comments added
- [ ] Code passes linting and type checking
- [ ] Committed with message: `E4-S09: Implement full pipeline validation with lookup errors`

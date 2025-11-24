# E{EPIC}-S{STORY}: {Story Title}

**Epic**: Epic {EPIC} - {Epic Name}  
**Size**: {Small/Medium/Large} ({3/5/8} points)  
**Priority**: {P0/P1/P2/P3}  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** {role/persona}  
**I want** {feature/capability}  
**So that** {business value/outcome}

---

## Acceptance Criteria

### ✅ AC1: {First Acceptance Criterion}
- [ ] {Specific testable requirement}
- [ ] {Another specific requirement}
- [ ] {Edge case or error condition}

**Evidence**: 

### ✅ AC2: {Second Acceptance Criterion}
- [ ] {Specific testable requirement}
- [ ] {Another specific requirement}

**Evidence**: 

### ✅ AC3: {Third Acceptance Criterion}
- [ ] {Specific testable requirement}
- [ ] {Another specific requirement}

**Evidence**: 

{Add more ACs as needed - aim for 5-9 ACs per story}

**Evidence Guidelines**:
- One evidence section per AC (not per checkbox)
- Evidence proves the AC is met overall
- Format: `**Evidence**: [code](src/file.ts#L10-20), [test](tests/file.test.ts#L30-40)`
- Include links to relevant code and tests
- If AC spans multiple files, list all relevant links

---

## Technical Notes

### Architecture Prerequisites
- [Link to relevant architecture section](../architecture/system-architecture.md#{section})
- Key design patterns: {List patterns from architecture}
- Key constraints: {List technical constraints}

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- {Prerequisite 1 - e.g., Redis running on localhost:6379}
- {Prerequisite 2 - e.g., .env file configured}
- {Prerequisite 3 - e.g., JIRA_PROJECT_KEY set}

**Start Prerequisites:**
```bash
# Verify Redis
docker run redis:ping  # Should return "PONG"

# Example: Verify .env
cat .env | grep JIRA_BASE_URL
```

### Dependencies
- E{X}-S{YY}: {Dependency description}
- E{X}-S{ZZ}: {Another dependency}

### Implementation Guidance
{Any specific technical guidance, examples, or constraints}

```typescript
// Example code structure if helpful
class ExampleClass {
  // Show expected interface/structure
}
```

---

## Implementation Example

```typescript
// Concrete example of how this should work
// Show the "happy path" implementation

// Example:
describe('FeatureName', () => {
  it('should do the main thing', async () => {
    // Arrange
    const input = { ... };
    
    // Act
    const result = await feature.execute(input);
    
    // Assert
    expect(result).toBe(expected);
  });
});
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Code implemented in `{file path}`
- [ ] Unit tests passing (≥95% coverage)
- [ ] Integration test passing (if applicable)
- [ ] Demo created OR exception documented (see [DoD Exceptions](../workflow/reference/dod-exceptions.md))
- [ ] TSDoc comments added to public APIs
- [ ] Code passes linting and type checking
- [ ] Testing prerequisites documented (if any)
- [ ] Committed with message: `E{epic}-S{story}: {Imperative verb} {what}`

---

## Definition of Done Exceptions

{If requesting exception, use template from [dod-exceptions.md](../workflow/reference/dod-exceptions.md)}

**Example**:

**Standard DoD**: Demo created showing feature functionality

**Exception Request**: Waive demo requirement for E2-S02

**Justification**: 
- Story has comprehensive unit tests (100% coverage)
- Integration test validates converter with real JIRA
- Demo would only duplicate test scenarios

**Alternative Evidence**:
- Unit tests: [test file link]
- Integration test output: [link]
- Test coverage: 100%

**Approved By**: @product-owner (2025-10-10)

---

## Implementation Hints

1. {Helpful hint about implementation approach}
2. {Common pitfall to avoid}
3. {Performance consideration}
4. {Testing tip}
5. {Edge case to remember}

---

## Related Stories

- **Depends On**: E{X}-S{YY} ({Status emoji})
- **Blocks**: E{X}-S{ZZ} ({Status emoji})
- **Related**: E{X}-S{AA} ({Status emoji})

---

## Testing Strategy

### Unit Tests (tests/unit/)
```typescript
describe('ComponentName', () => {
  describe('methodName()', () => {
    it('should handle happy path', async () => { ... });
    it('should handle error case', async () => { ... });
    it('should handle edge case', async () => { ... });
  });
});
```

### Integration Tests (tests/integration/)
```typescript
describe('Integration: Feature Name', () => {
  it('should work end-to-end', async () => { ... });
});
```

---

## Notes

{Any additional context, decisions made, trade-offs, or future considerations}

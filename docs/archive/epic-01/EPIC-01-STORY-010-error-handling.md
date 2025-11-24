# E1-S10: Error Handling & Custom Error Types

**Epic**: Epic 1 - Basic Issue Creation  
**Size**: Medium (5 points)  
**Priority**: P1  
**Status**: ✅ Done
**Assignee**: GitHub Copilot  
**PR**: Commit e456722  
**Started**: 2025-10-07  
**Completed**: 2025-10-07

---

## User Story

**As a** library user  
**I want** clear, actionable error messages  
**So that** I can quickly fix issues with my input or configuration

---

## Acceptance Criteria

### ✅ AC1: Base Error Class
- [x] Create `src/errors/JMLError.ts`:
  - **Evidence**: `src/errors/JMLError.ts` ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722))
  ```typescript
  export class JMLError extends Error {
    constructor(
      message: string,
      public code: string,
      public details?: Record<string, any>,
      public jiraResponse?: any
    ) {
      super(message);
      this.name = this.constructor.name;
      Error.captureStackTrace(this, this.constructor);
    }
  }
  ```

### ✅ AC2: Error Type Hierarchy
- [x] All library errors extend `JMLError`
  - **Evidence**: `src/errors/JMLError.ts` and all error types ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722))
- [x] Error types already created in previous stories:
  - `ConfigurationError` (E1-S02)
  - `AuthenticationError` (E1-S03)
  - `NetworkError` (E1-S03)
  - `CacheError` (E1-S04)
  - `RateLimitError` (E1-S05)
  - `NotFoundError` (E1-S05)
  - `JiraServerError` (E1-S05)
- [x] New error types:
  - `ValidationError` (field validation)
  - `AmbiguityError` (multiple matches for name)

### ✅ AC3: ValidationError Implementation
- [x] Create `src/errors/ValidationError.ts`:
  - **Evidence**: `src/errors/ValidationError.ts` ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722))
  - Code: `"VALIDATION_ERROR"`
  - Includes field name that failed
  - Includes validation rule that failed (e.g., "required", "invalid format")
  - Example: `"Field 'Priority' is required"`
- [x] Used for:
  - Missing required fields
  - Invalid field values
  - Unknown field names (with suggestions)

### ✅ AC4: AmbiguityError Implementation
- [x] Create `src/errors/AmbiguityError.ts`:
  - **Evidence**: `src/errors/AmbiguityError.ts` ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722))
  - Code: `"AMBIGUITY_ERROR"`
  - Includes field name
  - Includes input value
  - Includes candidates array
  - Example message: `"Multiple components named 'Backend' found"`
  - Example details:
    ```typescript
    {
      field: "Component",
      input: "Backend",
      candidates: [
        { id: "10001", name: "Backend", description: "Core backend" },
        { id: "10002", name: "Backend", description: "Legacy backend" }
      ]
    }
    ```

### ✅ AC5: Error Message Best Practices
- [x] All errors include:
  - **Evidence**: Error messages in all error classes ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722)), tested in `src/errors/__tests__/errors.test.ts`
  - What went wrong (clear description)
  - Why it failed (root cause if known)
  - How to fix it (actionable suggestion)
- [x] Examples:
  - ❌ Bad: `"Field not found"`
  - ✅ Good: `"Field 'Summry' not found. Did you mean: Summary, Story Points?"`
  - ❌ Bad: `"Authentication failed"`
  - ✅ Good: `"Authentication failed: PAT is invalid or expired. Check JIRA_PAT in .env file."`

### ✅ AC6: JIRA Error Parsing
- [x] Parse JIRA API error responses:
  - **Evidence**: `src/errors/ValidationError.ts` and parsing logic ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722))
  ```json
  {
    "errorMessages": ["Field 'priority' is required"],
    "errors": {
      "priority": "Priority is required",
      "assignee": "User 'invalid@example.com' does not exist"
    }
  }
  ```
- [x] Extract field-specific errors
- [x] Combine into single ValidationError with details
- [x] Preserve original JIRA response for debugging

### ✅ AC7: Error Context Enrichment
- [x] Wrap errors with context where possible:
  - **Evidence**: Error context in error classes ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722))
  - Include project key and issue type (for schema errors)
  - Include field name and value (for conversion errors)
  - Include operation attempted (create, update, transition)
- [x] Use error chaining: `{ cause: originalError }`

### ✅ AC8: Error Logging
- [x] Log errors to console with:
  - **Evidence**: Logging in error handling ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722))
  - Timestamp
  - Error code
  - Message
  - Stack trace (for unexpected errors)
- [x] Use log levels:
  - ERROR: User-facing errors (validation, auth, etc.)
  - WARN: Degraded mode (cache failures, retries)
  - DEBUG: API calls, timing (future)

### ✅ AC9: Unit Tests
- [x] Test each error type can be instantiated
  - **Evidence**: `src/errors/__tests__/errors.test.ts` ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722))
- [x] Test error messages include actionable suggestions
- [x] Test JIRA error response parsing
- [x] Test error context enrichment
- [x] Test error chaining (cause property)

---

## Technical Notes

### Architecture Prerequisites
- [Error Handling & Validation](../architecture/system-architecture.md#error-response-format)
- [Operational Model - Error Handling](../architecture/system-architecture.md#error-handling--retries)

### Dependencies
- E1-S01 to E1-S09 (uses errors defined in previous stories)

### Error Code Convention
```typescript
// Pattern: {CATEGORY}_{TYPE}
"CONFIGURATION_ERROR"
"AUTHENTICATION_ERROR"
"VALIDATION_ERROR"
"NETWORK_ERROR"
"CACHE_ERROR"
"RATE_LIMIT_ERROR"
"NOT_FOUND_ERROR"
"JIRA_SERVER_ERROR"
"AMBIGUITY_ERROR"
```

### Implementation Example
```typescript
// ValidationError.ts
export class ValidationError extends JMLError {
  constructor(
    message: string,
    details?: {
      field?: string;
      rule?: string;
      suggestions?: string[];
    }
  ) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

// Usage
throw new ValidationError(
  "Field 'Summry' not found. Did you mean: Summary, Story Points?",
  {
    field: 'Summry',
    suggestions: ['Summary', 'Story Points']
  }
);

// AmbiguityError.ts
export class AmbiguityError extends JMLError {
  constructor(
    message: string,
    details: {
      field: string;
      input: string;
      candidates: Array<{ id: string; name: string; [key: string]: any }>;
    }
  ) {
    super(message, 'AMBIGUITY_ERROR', details);
  }
}

// Usage
throw new AmbiguityError(
  "Multiple components named 'Backend' found in project ENG",
  {
    field: 'Component',
    input: 'Backend',
    candidates: [
      { id: '10001', name: 'Backend', description: 'Core backend' },
      { id: '10002', name: 'Backend', description: 'Legacy backend' }
    ]
  }
);

// JIRA Error Parsing
function parseJiraError(response: any): ValidationError {
  const messages: string[] = [];
  const details: Record<string, string> = {};

  if (response.errorMessages) {
    messages.push(...response.errorMessages);
  }

  if (response.errors) {
    for (const [field, message] of Object.entries(response.errors)) {
      details[field] = message as string;
      messages.push(`${field}: ${message}`);
    }
  }

  return new ValidationError(
    messages.join('; '),
    { field: Object.keys(details)[0], details }
  );
}
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] Base `JMLError` class created
- [x] All error types extend `JMLError`
- [x] `ValidationError` and `AmbiguityError` implemented
- [x] Error messages follow best practices (what, why, how)
- [x] JIRA error parsing implemented
- [x] Error context enrichment implemented
- [x] Error logging implemented
- [x] Unit tests written and passing (5+ test cases)
- [x] Code coverage: 95%+

---

## Implementation Hints

1. Use `Error.captureStackTrace()` for proper stack traces
2. Set `this.name = this.constructor.name` for error type names
3. Use error chaining with `{ cause: originalError }` (Node.js 16.9+)
4. Test error messages are user-friendly (not just technical)
5. Consider using a logging library in future (winston, pino)
6. Keep console.log for MVP (replace with structured logging later)

---

## Related Stories

- **Depends On**: E1-S01 to E1-S09
- **Blocks**: E1-S11 (Integration Tests uses error types)
- **Related**: E2-S09 (Ambiguity Detection uses AmbiguityError)

---

## Testing Strategy

### Unit Tests (src/errors/__tests__/errors.test.ts)
```typescript
describe('Error Types', () => {
  describe('JMLError', () => {
    it('should create base error with code', () => { ... });
    it('should include details', () => { ... });
    it('should preserve stack trace', () => { ... });
  });

  describe('ValidationError', () => {
    it('should create with field details', () => { ... });
    it('should include suggestions', () => { ... });
  });

  describe('AmbiguityError', () => {
    it('should create with candidates', () => { ... });
    it('should format message with count', () => { ... });
  });

  describe('JIRA Error Parsing', () => {
    it('should parse errorMessages array', () => { ... });
    it('should parse errors object', () => { ... });
    it('should combine both into ValidationError', () => { ... });
  });
});
```

---

## Notes

- Good error messages are crucial for developer experience
- Actionable suggestions reduce support burden
- Error context helps with debugging production issues
- Consider adding error codes to documentation
- Future: Add error tracking integration (Sentry, etc.)

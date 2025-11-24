# E1-S09: Create Single Issue API

**Epic**: Epic 1 - Basic Issue Creation  
**Size**: Medium (5 points)  
**Priority**: P0  
**Status**: ✅ Done
**Assignee**: GitHub Copilot  
**PR**: Commit b81ef6f  
**Started**: 2025-10-07  
**Completed**: 2025-10-07

---

## User Story

**As a** library user  
**I want** to create a JIRA issue with human-readable input  
**So that** I can create issues without knowing field IDs or JIRA payload structures

---

## Acceptance Criteria

### ✅ AC1: Issue Operations Module Created
- [x] Create `src/operations/issues.ts` with:
  - **Evidence**: `src/operations/issues.ts` ([b81ef6f](https://github.com/FallingReign/jira-magic-library/commit/b81ef6f))
  - `IssueOperations` class
  - Constructor accepts dependencies (JiraClient, SchemaDiscovery, FieldResolver, ConverterRegistry)
  - `create(input, options?)` method

### ✅ AC2: Create Method Signature
- [x] Define `create()` method:
  - **Evidence**: `src/operations/issues.ts` ([b81ef6f](https://github.com/FallingReign/jira-magic-library/commit/b81ef6f))
  ```typescript
  async create(
    input: Record<string, any>,
    options?: { validate?: boolean }
  ): Promise<Issue>
  ```
- [x] Input example:
  ```typescript
  {
    "Project": "ENG",
    "Issue Type": "Bug",
    "Summary": "Login fails on Safari",
    "Description": "Steps to reproduce..."
  }
  ```

### ✅ AC3: Issue Response Type
- [x] Define `Issue` type in `src/types/issue.ts`:
  - **Evidence**: `src/types/issue.ts` ([b81ef6f](https://github.com/FallingReign/jira-magic-library/commit/b81ef6f))
  ```typescript
  interface Issue {
    key: string;           // "ENG-123"
    id: string;            // "10050"
    self: string;          // Full URL
    fields?: Record<string, any>;
  }
  ```

### ✅ AC4: Create Flow Implementation
- [x] Extract Project and Issue Type from input
  - **Evidence**: `src/operations/issues.ts` ([b81ef6f](https://github.com/FallingReign/jira-magic-library/commit/b81ef6f))
- [x] Call FieldResolver to resolve field names → IDs
- [x] Call ConverterRegistry to convert values
- [x] Build JIRA payload:
  ```json
  {
    "fields": {
      "project": { "key": "ENG" },
      "issuetype": { "name": "Bug" },
      "summary": "Login fails on Safari",
      "description": "Steps to reproduce..."
    }
  }
  ```
- [x] Call JiraClient `POST /rest/api/2/issue`
- [x] Parse response and return Issue object

### ✅ AC5: Dry-Run Validation Mode
- [x] If `options.validate === true`:
  - **Evidence**: `src/operations/issues.ts` ([b81ef6f](https://github.com/FallingReign/jira-magic-library/commit/b81ef6f))
  - Perform all resolution and conversion
  - Build JIRA payload
  - Do NOT call JIRA API
  - Return payload in `Issue` object (or special ValidationResult type)
- [x] Use case: Test inputs without creating issues

### ✅ AC6: Project/Issue Type Required
- [x] Throw `ValidationError` if "Project" missing
  - **Evidence**: `src/errors/ValidationError.ts` ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722)), tested in `src/operations/__tests__/issues.test.ts`
- [x] Throw `ValidationError` if "Issue Type" missing
- [x] Error message: "Field 'Project' is required"

### ✅ AC7: Error Handling
- [x] Wrap JIRA API errors with context:
  - **Evidence**: `src/operations/issues.ts` ([b81ef6f](https://github.com/FallingReign/jira-magic-library/commit/b81ef6f))
  - Include input data (sanitized)
  - Include field that caused error (if available)
- [x] Preserve original JIRA error for debugging
- [x] Example: `"Failed to create issue: Field 'priority' is required"`

### ✅ AC8: Unit Tests
- [x] Test successful issue creation (mock JIRA response)
  - **Evidence**: `src/operations/__tests__/issues.test.ts` ([b81ef6f](https://github.com/FallingReign/jira-magic-library/commit/b81ef6f))
- [x] Test field resolution (name → ID)
- [x] Test field conversion (string values)
- [x] Test dry-run mode (no API call)
- [x] Test missing Project error
- [x] Test missing Issue Type error
- [x] Test JIRA API error wrapped with context

---

## Technical Notes

### Architecture Prerequisites
- [Issue Operations Module](../architecture/system-architecture.md#5-issue-operations-module)
- [Critical Data Flows - Single Issue Creation](../architecture/system-architecture.md#flow-1-single-issue-creation-happy-path)

### Dependencies
- E1-S05 (JIRA API Client)
- E1-S06 (Schema Discovery)
- E1-S07 (Field Resolver)
- E1-S08 (Converter Registry)

### JIRA API Endpoint
```
POST /rest/api/2/issue
Body: { "fields": { ... } }
Response: { "key": "ENG-123", "id": "10050", "self": "..." }
```

### Implementation Example
```typescript
export class IssueOperations {
  constructor(
    private client: JiraClient,
    private schema: SchemaDiscovery,
    private resolver: FieldResolver,
    private converter: ConverterRegistry
  ) {}

  async create(
    input: Record<string, any>,
    options?: { validate?: boolean }
  ): Promise<Issue> {
    // Extract required fields
    const projectKey = input['Project'] || input['project'];
    const issueType = input['Issue Type'] || input['issuetype'];

    if (!projectKey) {
      throw new ValidationError("Field 'Project' is required");
    }
    if (!issueType) {
      throw new ValidationError("Field 'Issue Type' is required");
    }

    // Resolve field names → IDs
    const resolvedFields = await this.resolver.resolveFields(
      projectKey,
      issueType,
      input
    );

    // Convert values
    const projectSchema = await this.schema.getFieldsForIssueType(projectKey, issueType);
    const convertedFields = this.converter.convertFields(
      projectSchema,
      resolvedFields,
      { projectKey, issueType }
    );

    // Build payload
    const payload = {
      fields: convertedFields,
    };

    // Dry-run mode: return payload without API call
    if (options?.validate) {
      return {
        key: 'DRY-RUN',
        id: '0',
        self: '',
        fields: payload.fields,
      };
    }

    // Create issue
    try {
      const response = await this.client.post<Issue>('/rest/api/2/issue', payload);
      return response;
    } catch (err) {
      throw new Error(`Failed to create issue: ${err.message}`, { cause: err });
    }
  }
}
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] `IssueOperations` class implemented
- [x] `create()` method working
- [x] Field resolution integrated
- [x] Field conversion integrated
- [x] JIRA payload built correctly
- [x] Dry-run mode working
- [x] Required field validation working
- [x] Error wrapping working
- [x] Unit tests written and passing (9 test cases)
- [x] Code coverage: 100% for IssueOperations (94.02% overall - RedisCache documented as acceptable)
- [x] Demo created (npm run demo:E1-S09) and working
- [x] demo/README.md updated with demo entry
- [x] Integration test with real JIRA (manual verification - dry-run successful, schema discovery working)

---

## Implementation Hints

1. Extract Project and Issue Type first (before resolution)
2. Pass them to resolver for schema lookup
3. Use try-catch to wrap JIRA API errors
4. In dry-run mode, return mock Issue object with payload
5. Test with real JIRA to verify payload structure
6. Consider adding logging for debugging (request/response)

---

## Related Stories

- **Depends On**: E1-S05, E1-S06, E1-S07, E1-S08
- **Blocks**: E1-S11 (Integration Tests), E1-S12 (Documentation)
- **Related**: E2-S09 (adds more validation)

---

## Testing Strategy

### Unit Tests (src/operations/__tests__/issues.test.ts)
```typescript
describe('IssueOperations', () => {
  describe('create', () => {
    it('should create issue successfully', async () => { ... });
    it('should resolve field names to IDs', async () => { ... });
    it('should convert field values', async () => { ... });
    it('should build correct JIRA payload', async () => { ... });
    it('should throw ValidationError if Project missing', async () => { ... });
    it('should throw ValidationError if Issue Type missing', async () => { ... });
    it('should wrap JIRA API errors', async () => { ... });
  });

  describe('Dry-run mode', () => {
    it('should not call JIRA API', async () => { ... });
    it('should return payload in response', async () => { ... });
  });
});
```

### Integration Test (manual)
```typescript
// Set up .env with real JIRA credentials
// Run test that creates actual issue
// Verify issue appears in JIRA
// Clean up test issue
```

---

## Notes

- This is the culmination of Epic 1 - the first working feature!
- All previous stories (config, auth, cache, client, schema, resolver, converter) come together here
- After this story, users can `npm install jira-magic-library` and create issues
- Dry-run mode is crucial for testing without side effects
- Consider adding `delete()` method in future epic

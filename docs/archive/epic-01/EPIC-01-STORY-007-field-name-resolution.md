# E1-S07: Field Name Resolution (Text Fields Only)

**Epic**: Epic 1 - Basic Issue Creation  
**Size**: Medium (5 points)  
**Priority**: P0  
**Status**: ✅ Done
**Assignee**: GitHub Copilot  
**PR**: Commit f8e7405  
**Started**: 2025-10-06  
**Completed**: 2025-10-06

---

## User Story

**As a** library developer  
**I want** to resolve human-readable field names to JIRA field IDs  
**So that** users can provide "Summary" instead of "summary" or "customfield_10024"

---

## Acceptance Criteria

### ✅ AC1: Field Resolver Module Created
- [x] Create `src/converters/FieldResolver.ts` with:
  - **Evidence**: `src/converters/FieldResolver.ts` ([f8e7405](https://github.com/FallingReign/jira-magic-library/commit/f8e7405))
  - `FieldResolver` class
  - Constructor accepts `SchemaDiscovery`
  - `resolveFields(projectKey, issueType, input)` method

### ✅ AC2: Input Format Support
- [x] Accept user input as `Record<string, any>`:
  - **Evidence**: `src/converters/FieldResolver.ts` ([f8e7405](https://github.com/FallingReign/jira-magic-library/commit/f8e7405))
  ```typescript
  {
    "Project": "ENG",
    "Issue Type": "Bug",
    "Summary": "Login fails",
    "Description": "Steps to reproduce..."
  }
  ```

### ✅ AC3: Field Name Matching
- [x] Match field names case-insensitively:
  - **Evidence**: `src/converters/FieldResolver.ts` ([f8e7405](https://github.com/FallingReign/jira-magic-library/commit/f8e7405))
  - `"Summary"` → `"summary"`
  - `"SUMMARY"` → `"summary"`
  - `"summary"` → `"summary"`
- [x] Match with variations:
  - Ignore spaces: `"Issue Type"` → matches `"issuetype"` or `"Issue Type"`
  - Ignore hyphens/underscores: `"Story_Points"` → matches `"Story Points"`
- [x] Exact match preferred over fuzzy match

### ✅ AC4: Resolved Output Format
- [x] Return object mapping JIRA field IDs to values:
  - **Evidence**: `src/converters/FieldResolver.ts` ([f8e7405](https://github.com/FallingReign/jira-magic-library/commit/f8e7405))
  ```typescript
  {
    "summary": "Login fails",
    "description": "Steps to reproduce...",
    "project": { "key": "ENG" },
    "issuetype": { "name": "Bug" }
  }
  ```
- [x] Special handling for Project and Issue Type:
  - `"Project": "ENG"` → `"project": { "key": "ENG" }`
  - `"Issue Type": "Bug"` → `"issuetype": { "name": "Bug" }`

### ✅ AC5: Unknown Field Handling
- [x] Throw `ValidationError` if field name not found
  - **Evidence**: `src/errors/ValidationError.ts` ([e456722](https://github.com/FallingReign/jira-magic-library/commit/e456722)), tested in `src/converters/__tests__/resolver.test.ts`
- [x] Error includes:
  - Unknown field name
  - List of closest matches (Levenshtein distance)
  - Example: "Field 'Summry' not found. Did you mean: Summary, Story Points?"

### ✅ AC6: Field ID Passthrough
- [x] If user provides field ID directly, use it as-is:
  - **Evidence**: `src/converters/FieldResolver.ts` ([f8e7405](https://github.com/FallingReign/jira-magic-library/commit/f8e7405))
  - `"customfield_10024": 5` → `"customfield_10024": 5`
  - No resolution needed
- [x] Still validate field exists in schema

### ✅ AC7: Required Field Validation (Future)
- [x] For MVP: Do NOT validate required fields yet
  - **Evidence**: See implementation and comments in `src/converters/FieldResolver.ts` ([f8e7405](https://github.com/FallingReign/jira-magic-library/commit/f8e7405))
- [x] Let JIRA API return error if required field missing
- [x] Validation will be added in E1-S10 (Error Handling)

### ✅ AC8: Unit Tests
- [x] Test successful field resolution (name → ID)
  - **Evidence**: `src/converters/__tests__/resolver.test.ts` ([f8e7405](https://github.com/FallingReign/jira-magic-library/commit/f8e7405))
- [x] Test case-insensitive matching
- [x] Test fuzzy matching (spaces, hyphens)
- [x] Test Project and Issue Type special handling
- [x] Test field ID passthrough
- [x] Test unknown field error with suggestions
- [x] Test multiple fields resolved correctly

---

## Technical Notes

### Architecture Prerequisites
- [Field Resolution & Conversion Engine - Field Name Resolution](../architecture/system-architecture.md#a-field-name-resolution)

### Dependencies
- E1-S06 (Schema Discovery)

### Implementation Example
```typescript
async resolveFields(
  projectKey: string,
  issueType: string,
  input: Record<string, any>
): Promise<Record<string, any>> {
  const schema = await this.schemaDiscovery.getFieldsForIssueType(projectKey, issueType);
  const resolved: Record<string, any> = {};

  for (const [fieldName, value] of Object.entries(input)) {
    // Special cases
    if (fieldName.toLowerCase() === 'project') {
      resolved.project = { key: value };
      continue;
    }
    if (fieldName.toLowerCase() === 'issue type' || fieldName.toLowerCase() === 'issuetype') {
      resolved.issuetype = { name: value };
      continue;
    }

    // Check if already a field ID
    if (fieldName.startsWith('customfield_') || schema.fields[fieldName]) {
      resolved[fieldName] = value;
      continue;
    }

    // Resolve name → ID
    const fieldId = this.findFieldByName(schema, fieldName);
    if (!fieldId) {
      throw new ValidationError(`Field '${fieldName}' not found`, {
        suggestions: this.findClosestMatches(schema, fieldName),
      });
    }

    resolved[fieldId] = value;
  }

  return resolved;
}

private findFieldByName(schema: ProjectSchema, name: string): string | null {
  const normalized = name.toLowerCase().replace(/[\s_-]/g, '');
  
  for (const [fieldId, field] of Object.entries(schema.fields)) {
    const fieldNameNormalized = field.name.toLowerCase().replace(/[\s_-]/g, '');
    if (fieldNameNormalized === normalized) {
      return fieldId;
    }
  }
  
  return null;
}

private findClosestMatches(schema: ProjectSchema, name: string, maxResults = 3): string[] {
  // Use Levenshtein distance or simple string matching
  // Return top N closest field names
  const matches = Object.values(schema.fields)
    .map(f => ({ name: f.name, distance: this.levenshtein(name, f.name) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults)
    .map(m => m.name);
  
  return matches;
}
```

### Levenshtein Distance (Simple Implementation)
```typescript
private levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] `FieldResolver` class implemented
- [x] Field name matching working (case-insensitive, fuzzy)
- [x] Project/Issue Type special handling working
- [x] Field ID passthrough working
- [x] Unknown field error with suggestions working
- [x] Unit tests written and passing (23 test cases)
- [x] Code coverage: 100% (FieldResolver), 96.21% overall

---

## Implementation Hints

1. Normalize field names by removing spaces, hyphens, underscores
2. Use `toLowerCase()` for case-insensitive comparison
3. Handle special fields (Project, Issue Type) first before schema lookup
4. Levenshtein distance can be simple (don't over-optimize)
5. Consider using a fuzzy matching library if complexity grows (but keep MVP simple)
6. Cache normalized field name mappings for performance (optional)

---

## Related Stories

- **Depends On**: E1-S06 (Schema Discovery)
- **Blocks**: E1-S08 (Text Converter), E1-S09 (Create Issue API)
- **Related**: E1-S10 (Error Handling adds validation)

---

## Testing Strategy

### Unit Tests (src/converters/__tests__/resolver.test.ts)
```typescript
describe('FieldResolver', () => {
  describe('resolveFields', () => {
    it('should resolve field names to IDs', async () => { ... });
    it('should be case-insensitive', async () => { ... });
    it('should handle spaces in field names', async () => { ... });
    it('should handle Project special case', async () => { ... });
    it('should handle Issue Type special case', async () => { ... });
    it('should pass through field IDs unchanged', async () => { ... });
    it('should throw ValidationError for unknown fields', async () => { ... });
    it('should suggest closest matches for typos', async () => { ... });
  });
});
```

---

## Notes

- This story focuses on name→ID mapping only
- Value conversion happens in E1-S08 (Text Converter)
- Required field validation deferred to E1-S10
- Fuzzy matching helps users with typos
- Consider extracting Levenshtein distance into utils if used elsewhere

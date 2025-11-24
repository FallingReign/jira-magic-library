# Phase 2: Implementation

**Goal**: Write tests and code to meet all acceptance criteria.

**When**: After planning complete (Phase 1 done)

**Duration**: 2-8 hours (depends on story size)

**Output**: Working code with passing tests

---

## Overview

Implementation follows Test-Driven Development (TDD):
1. ✅ Write failing test
2. ✅ Write code to pass test
3. ✅ Refactor
4. ✅ Repeat

**Don't code without tests first!**

---

## Step 4: Write Tests FIRST

### Start Prerequisites ⚠️

**IMPORTANT**: Testing prerequisites are documented in story files under "### Testing Prerequisites" section. These are **workflow process steps**, not validated by the workflow validator.

**Before writing tests, check story file for testing prerequisites:**

```bash
# Example: Story requires Redis
grep -A 5 "Testing Prerequisites" docs/stories/EPIC-XX-STORY-YYY-*.md

# Start required services
npm run redis:start  # Starts Redis in Docker (or use: docker run -d -p 6379:6379 redis)

# Verify prerequisites met
docker exec jml-redis redis-cli ping   # Should return "PONG"
```

**Common Prerequisites:**
- **Redis running** (required for: caching, schema discovery, integration tests)
  ```bash
  npm run redis:start    # Start Redis
  docker exec jml-redis redis-cli ping          # Verify (should return "PONG")
  npm run redis:stop     # Stop when done
  ```
- **`.env` file configured** (authentication stories)
  ```bash
  cat .env | grep JIRA_BASE_URL  # Verify configured
  ```
- **`JIRA_PROJECT_KEY` set** (integration tests)

**If prerequisites unclear, ask before proceeding!**

---

### Coverage Requirements

| Type | Minimum | Target | When to Fail |
|------|---------|--------|--------------|
| **Overall** | 95% | 98% | PR merge blocked if <95% |
| **Critical paths** | 100% | 100% | Auth, issue creation, error handling |
| **Utilities** | 90% | 95% | Helper functions, formatters |

**Check coverage:**
```bash
npm run test:coverage
# Open detailed report: coverage/lcov-report/index.html
```

**Exceptions allowed for:**
- Production infrastructure setup (Redis connection, external API)
- Must be documented with evidence in story file
- Requires explicit user approval

---

### The TDD Cycle

```
Write Test (RED)
   ↓
Run Test (fails ❌)
   ↓
Write Code (GREEN)
   ↓
Run Test (passes ✅)
   ↓
Refactor (CLEAN)
   ↓
Repeat for next AC
```

### Test File Structure

```
tests/
├── unit/              # Fast, mocked, 90% of tests
│   ├── converters/
│   │   └── types/
│   │       └── NumberConverter.test.ts
│   ├── cache/
│   └── client/
├── integration/       # Slow, real JIRA, critical paths
│   ├── create-issue.test.ts
│   └── field-conversion.test.ts
└── fixtures/          # Test data
```

### Unit Test Template

```typescript
// tests/unit/converters/types/NumberConverter.test.ts
import { convertNumberType } from '../../../../src/converters/types/NumberConverter';
import { ValidationError } from '../../../../src/errors';

describe('NumberConverter', () => {
  const fieldSchema = {
    id: 'customfield_10030',
    name: 'Story Points',
    type: 'number',
    schema: { type: 'number' }
  };

  describe('AC2: Parse Strings to Numbers', () => {
    it('should parse integer string "5" to number 5', () => {
      const result = convertNumberType('5', fieldSchema, {});
      expect(result).toBe(5);
      expect(typeof result).toBe('number');
    });

    it('should parse float string "3.14" to number 3.14', () => {
      const result = convertNumberType('3.14', fieldSchema, {});
      expect(result).toBe(3.14);
    });

    it('should parse negative string "-10" to number -10', () => {
      const result = convertNumberType('-10', fieldSchema, {});
      expect(result).toBe(-10);
    });
  });

  describe('AC3: Preserve Integer vs Float', () => {
    it('should preserve integer 5 as 5 (not 5.0)', () => {
      const result = convertNumberType(5, fieldSchema, {});
      expect(result).toBe(5);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should preserve float 3.5 as 3.5', () => {
      const result = convertNumberType(3.5, fieldSchema, {});
      expect(result).toBe(3.5);
      expect(Number.isInteger(result)).toBe(false);
    });
  });

  describe('AC4: Validation & Error Handling', () => {
    it('should throw ValidationError on non-numeric string "abc"', () => {
      expect(() => convertNumberType('abc', fieldSchema, {}))
        .toThrow(ValidationError);
      expect(() => convertNumberType('abc', fieldSchema, {}))
        .toThrow(/Cannot convert "abc" to number/);
    });

    it('should throw ValidationError on empty string', () => {
      expect(() => convertNumberType('', fieldSchema, {}))
        .toThrow(ValidationError);
    });

    it('should pass through null', () => {
      expect(convertNumberType(null, fieldSchema, {})).toBeNull();
    });

    it('should pass through undefined', () => {
      expect(convertNumberType(undefined, fieldSchema, {})).toBeUndefined();
    });
  });
});
```

### Test Coverage Requirements

- **Overall**: ≥95%
- **Happy paths**: 100% (all valid inputs)
- **Error paths**: 100% (all validation errors)
- **Edge cases**: 100% (nulls, edge values)

### Integration Test Template

```typescript
// tests/integration/number-converter.test.ts
import { JML } from '../../src';
import { loadConfig } from '../../src/config/loader';

describe('Integration: Number Converter', () => {
  let jml: JML;

  beforeAll(() => {
    if (!process.env.JIRA_BASE_URL) {
      console.warn('⚠️  Skipping integration tests (JIRA not configured)');
      return;
    }
    const config = loadConfig();
    jml = new JML(config);
  });

  it('should create issue with Story Points as number', async () => {
    if (!jml) return; // Skip if no JIRA

    const issue = await jml.createIssue({
      project: process.env.JIRA_PROJECT_KEY!,
      issueType: 'Story',
      summary: 'Test: Number converter',
      storyPoints: 5
    });

    expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
  });

  it('should create issue with Story Points as string', async () => {
    if (!jml) return;

    const issue = await jml.createIssue({
      project: process.env.JIRA_PROJECT_KEY!,
      issueType: 'Story',
      summary: 'Test: Number converter (string)',
      storyPoints: '8'
    });

    expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
  });
});
```

---

## Step 5: Implement Code

### File Structure

Follow the established pattern:

```
src/
├── converters/
│   ├── types/
│   │   ├── NumberConverter.ts    ← Your file
│   │   ├── DateConverter.ts
│   │   └── ArrayConverter.ts
│   ├── ConverterRegistry.ts
│   └── FieldConverter.ts (interface)
├── cache/
├── client/
└── index.ts
```

### Implementation Template

```typescript
// src/converters/types/NumberConverter.ts
import { FieldConverter } from '../FieldConverter';
import { ValidationError } from '../../errors';

/**
 * Converts numeric values for fields with type: "number"
 * 
 * Accepts:
 * - Numbers: 5, 3.14, -10
 * - Strings: "5", "3.14", "-10"
 * 
 * Validates:
 * - Rejects non-numeric strings
 * - Rejects NaN, Infinity
 * - Passes through null/undefined (optional fields)
 * 
 * @example
 * convertNumberType("5", fieldSchema, context) // → 5
 * convertNumberType(3.14, fieldSchema, context) // → 3.14
 */
export const convertNumberType: FieldConverter = (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Already a number
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throw new ValidationError(
        `Invalid number value for field "${fieldSchema.name}": NaN`,
        { field: fieldSchema.id, value }
      );
    }
    if (!Number.isFinite(value)) {
      throw new ValidationError(
        `Invalid number value for field "${fieldSchema.name}": Infinity`,
        { field: fieldSchema.id, value }
      );
    }
    return value;
  }

  // Parse string
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      throw new ValidationError(
        `Empty string is not a valid number for field "${fieldSchema.name}"`,
        { field: fieldSchema.id, value }
      );
    }

    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      throw new ValidationError(
        `Cannot convert "${value}" to number for field "${fieldSchema.name}"`,
        { field: fieldSchema.id, value }
      );
    }
    if (!Number.isFinite(parsed)) {
      throw new ValidationError(
        `Invalid number value for field "${fieldSchema.name}": ${parsed}`,
        { field: fieldSchema.id, value }
      );
    }

    return parsed;
  }

  // Invalid type
  throw new ValidationError(
    `Expected number or string for field "${fieldSchema.name}", got ${typeof value}`,
    { field: fieldSchema.id, value, type: typeof value }
  );
};
```

### Register Converter

```typescript
// src/converters/ConverterRegistry.ts
import { convertNumberType } from './types/NumberConverter';

export class ConverterRegistry {
  constructor() {
    // ... existing converters
    this.register('number', convertNumberType);
  }
}
```

### Coding Standards

- **TypeScript strict mode**: No `any` types
- **ESLint rules**: Will be enforced
- **Prettier formatting**: Auto-format on save
- **TSDoc comments**: For public APIs
- **Error context**: Always enrich errors with context

### Architectural Constraints

✅ **MUST Use**:
- Native `fetch` (not axios)
- `ioredis` for Redis
- Native Date + Intl API (not moment.js)
- ES2022 features

❌ **MUST NOT Use**:
- axios (use native fetch)
- moment.js (use native Date)
- lodash (use native ES2022)
- winston (use console for MVP)

**For complete architectural rules and technology constraints, see:**
[System Architecture Document](../architecture/system-architecture.md)

---

## Step 6: Run Tests

### Test Commands

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests (needs JIRA)
npm run test:integration

# Run specific test file
npm test -- NumberConverter.test.ts

# Watch mode (re-run on changes)
npm test -- --watch
```

### Expected Output

```bash
npm test

 PASS  tests/unit/converters/types/NumberConverter.test.ts
  NumberConverter
    AC2: Parse Strings to Numbers
      ✓ should parse integer string "5" to number 5 (2 ms)
      ✓ should parse float string "3.14" to number 3.14
      ✓ should parse negative string "-10" to number -10
    AC3: Preserve Integer vs Float
      ✓ should preserve integer 5 as 5 (not 5.0)
      ✓ should preserve float 3.5 as 3.5
    AC4: Validation & Error Handling
      ✓ should throw ValidationError on non-numeric string "abc"
      ✓ should throw ValidationError on empty string
      ✓ should pass through null
      ✓ should pass through undefined

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Coverage:    98.5% (lines), 100% (branches)
```

### Coverage Report

```bash
npm run test:coverage

----------|---------|----------|---------|---------|-------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
----------|---------|----------|---------|---------|-------------------
All files |   98.5  |    100   |   100   |   98.5  |                   
 NumberConverter.ts | 98.5 | 100 | 100 | 98.5 | 45
----------|---------|----------|---------|---------|-------------------
```

### If Tests Fail

```
1. Read error message carefully
2. Identify which test failed
3. Debug (add console.log, use debugger)
4. Fix implementation
5. Re-run tests
6. Repeat until all pass
```

---

## Implementation Checklist

Before proceeding to Phase 3 (Validation):

- [ ] **Tests Written (TDD)**
  - [ ] Unit tests for all ACs
  - [ ] Tests cover happy paths
  - [ ] Tests cover error cases
  - [ ] Tests cover edge cases
  - [ ] Integration tests (if applicable)

- [ ] **Code Implemented**
  - [ ] Follows architectural constraints
  - [ ] Follows coding standards
  - [ ] TSDoc comments added
  - [ ] Error handling with context
  - [ ] Registered in registry (if converter)

- [ ] **Tests Passing**
  - [ ] `npm test` ✅ All passing
  - [ ] `npm run test:coverage` ✅ ≥95%
  - [ ] `npm run test:integration` ✅ (if applicable)
  - [ ] `npm run lint` ✅ No errors
  - [ ] No console warnings

- [ ] **ACs Checked (in story file)**
  - [ ] Check box for each AC as you complete it
  - [ ] Don't wait until end to check boxes

---

## Common Implementation Issues

### Issue: Tests pass locally but not in CI

**Cause**: Environment differences (Node version, dependencies)

**Fix**: 
```bash
# Check Node version
node --version  # Should be 18+

# Clean install dependencies
rm -rf node_modules package-lock.json
npm install
```

### Issue: Coverage <95%

**Cause**: Missing edge case tests

**Fix**: Look at coverage report
```bash
npm run test:coverage
# Check "Uncovered Line #s" column
# Add tests for those lines
```

### Issue: Integration tests fail

**Cause**: JIRA not configured or credentials invalid

**Fix**:
```bash
# Check .env file
cat .env | grep JIRA

# Test connection manually
curl -H "Authorization: Bearer $JIRA_PAT" $JIRA_BASE_URL/rest/api/2/serverInfo
```

---

## Quick Reference

### TDD Cycle
1. Write test (RED)
2. Run test (fails)
3. Write code (GREEN)
4. Run test (passes)
5. Refactor (CLEAN)

### Test Commands
```bash
npm test                    # Unit tests
npm run test:coverage       # Coverage report
npm run test:integration    # Integration tests
npm test -- --watch         # Watch mode
```

### File Locations
```
src/converters/types/NumberConverter.ts    # Implementation
tests/unit/converters/types/NumberConverter.test.ts  # Unit tests
tests/integration/number-converter.test.ts  # Integration tests
```

### Coverage Target
- Overall: ≥95%
- Happy paths: 100%
- Error paths: 100%

---

## Next Phase

Once all tests pass and coverage ≥95%:

**[3-validation.md](3-validation.md)** - Verify all ACs met

---

---

## Phase 2 Complete

**✅ When you've completed all implementation steps, you MUST say:**

> "✅ Finished with Phase 2: Implementation. Ready for Phase 3: Validation."

**This confirms:**
- ✅ All tests written and passing
- ✅ All code implemented
- ✅ All acceptance criteria checked off in story file
- ✅ Code committed with proper messages
- ✅ Ready for validation

**Next**: Proceed to [Phase 3: Validation](3-validation.md)

---

## See Also

- **[System Architecture](../architecture/system-architecture.md)** - Complete architectural rules and constraints
- **[AGENTS.md](../../AGENTS.md)** - Full development workflow and best practices

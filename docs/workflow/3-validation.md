# Phase 3: Validation

**Goal**: Verify ALL acceptance criteria are met before marking story Done.

**When**: After implementation complete (Phase 2 done)

**Duration**: 15-30 minutes

**Prerequisites**: 
- ✅ Code implemented (Phase 2)
- ✅ Tests passing
- ✅ Integration tests passing (if applicable)

---

## ⚠️ CRITICAL: Don't Skip This Phase

**This is the most commonly skipped phase.** Agents often:
- ✅ Complete implementation
- ✅ Run tests
- ❌ **FORGET to verify ACs**
- ❌ **FORGET to run validation**
- ❌ **FORGET to check coverage**
- ❌ Mark story Done anyway

**Result**: Story appears complete but ACs not actually met.

**Solution**: Always follow this checklist before marking Done.

---

## Before Starting Validation ⚠️

### Verify Testing Prerequisites

**IMPORTANT**: This is a **workflow reminder**, not a story file requirement. The validator does NOT check for "### Testing Prerequisites" sections.

**Ensure all prerequisites from story file are still running:**

```bash
# 1. Check Redis (required for most stories)
docker exec jml-redis redis-cli ping   # Should return "PONG"

# If Redis not running:
npm run redis:start  # Start Redis in Docker
docker exec jml-redis redis-cli ping        # Verify again

# 2. Check environment configured
cat .env | grep JIRA_BASE_URL

# 3. Check if Docker container still running
docker ps | grep redis
```

**Why**: Integration tests may have been written hours ago. Services may have stopped.

**Quick Redis Commands:**
```bash
npm run redis:start   # Start Redis
npm run redis:stop    # Stop Redis
docker exec jml-redis redis-cli ping         # Test connection
```

---

## The 5-Step AC Verification Process

For **EACH** acceptance criteria in the story file:

### Step 1: Read the AC
Understand **exactly** what needs to be implemented.

### Step 2: Find the Code
Locate where this AC is implemented in the codebase.

### Step 3: Read the Implementation
Verify code **actually does** what AC describes.

### Step 4: Find the Tests
Confirm tests **cover** this AC.

### Step 5: Check the Box & Add Evidence
**Only after steps 1-4**, mark `- [x]` in story file **AND add evidence links**.

**Evidence Format**:
```markdown
- [x] Converter registered as `registry.register('number', convertNumberType)` **Evidence**: [code](src/converters/ConverterRegistry.ts#L15), [test](tests/unit/converters/ConverterRegistry.test.ts#L42-45)
```

---

## Example Verification Walkthrough

### Story File AC:
```markdown
### AC3: Graceful Degradation
- [ ] If Redis connection fails, library logs warning and continues
```

### Verification Steps:

#### Step 1: Read AC
**Requirement**: Redis failure → log warning + continue (no crash)

#### Step 2: Find Code
```bash
grep -r "graceful" src/cache/
# Found: src/cache/manager.ts
```

#### Step 3: Read Implementation
```bash
cat src/cache/manager.ts
```

**Lines 15-18:**
```typescript
try {
  this.client = new Redis({ host, port });
} catch (error) {
  console.warn('Redis connection failed, continuing without cache');
  this.client = null;  // Graceful degradation
}
```

✅ Code logs warning  
✅ Code sets client to null (continues)  
✅ No throw (doesn't crash)

#### Step 4: Find Tests
```bash
cat tests/unit/cache/manager.test.ts
```

**Lines 42-47:**
```typescript
it('should handle Redis connection failure gracefully', () => {
  mockRedis.mockImplementation(() => {
    throw new Error('Connection failed');
  });
  const manager = new CacheManager(config);
  expect(manager.client).toBeNull();  // ✓ Continues without crash
});
```

✅ Test covers AC

#### Step 5: Check the Box
```markdown
### AC3: Graceful Degradation
- [x] If Redis connection fails, library logs warning and continues
```

---

## Red Flags: DON'T Check Box If...

| Red Flag | Reason | Action |
|----------|--------|--------|
| ❌ Can't find the code | AC not implemented | Implement it first |
| ❌ Code doesn't match AC description | AC incomplete | Fix implementation |
| ❌ No tests for this AC | Not verified | Add tests |
| ❌ Tests are failing | Code broken | Fix code |
| ❌ Checking from memory | Not verified | Actually read the code |
| ❌ "I think I did this" | Guessing | Find the actual code |

**Golden Rule**: If you can't point to **specific lines of code** that implement the AC, don't check the box.

---

## Validation Commands Checklist

Run ALL of these before marking story Done:

### 1. Unit Tests
```bash
npm test
```
**Expected**: All tests passing

### 2. Test Coverage
```bash
npm run test:coverage
```
**Expected**: ≥95% overall (or documented exception)

### 3. Integration Tests (if applicable)
```bash
npm run test:integration
```
**Expected**: All integration tests passing (or skipped if no JIRA configured)

### 4. Demo (if created)
```bash
# Build library first
npm run build

# Run interactive demo
npm run demo
```
**Expected**: Demo runs without errors, new field appears in multi-field creator

Example for field type converters:
```bash
npm run build
npm run demo
# Select "Multi-Field Issue Creator"
# Your new field should appear in the checkbox list (e.g., "Fix Version/s")
# Test creating an issue with the new field
```

### 5. Linter
```bash
npm run lint
```
**Expected**: No linting errors

### 6. Type Checker
```bash
npm run type-check
```
**Expected**: No type errors (if script exists)

### 7. Workflow Validation ⭐ **REQUIRED**
```bash
npm run validate:workflow
```
**Expected**: 
```
✅ All checks passed! ✨
```

**Understanding validation output:**
- ✅ **No errors** - Required to proceed
- ⚠️ **Warnings** - Non-blocking but MUST be fixed:
  - Can commit/push with warnings (to backup work)
  - Must resolve warnings before marking story complete
  - Example: PR link can be added after commit, then commit again
- ❌ **Errors** - MUST fix before proceeding to Phase 4

---

## Coverage Exceptions

**Default**: All stories must achieve ≥95% code coverage.

**Exception**: Some code is better tested via integration tests.

### When Exception is Acceptable

#### 1. Production Infrastructure Setup
**Example**: Redis client instantiation

```typescript
// src/cache/manager.ts
constructor(config: CacheConfig) {
  // Lines 35-36: Production Redis connection
  this.client = new Redis({
    host: config.host,
    port: config.port,
  });
}
```

**Coverage**: 85% (lines 35-36 uncovered)  
**Why**: Requires real Redis instance  
**Acceptable because**: Integration tests cover this path

**Document in story**:
```markdown
### ✅ AC5: Test Coverage ≥95%

**Coverage: 85.71%**

**Uncovered Lines:** 35-36 (Redis instantiation), tested in integration

**Evidence:** tests/integration/cache.test.ts:25-30 covers Redis connection

**Acceptable per docs/workflow/3-validation.md: Coverage Exceptions**
```

#### 2. External API Error Codes
**Example**: JIRA API error handling

```typescript
if (response.status === 401) throw new AuthenticationError();
if (response.status === 403) throw new PermissionError();  
if (response.status === 500) throw new ServerError();
```

**Coverage**: 87% (some error codes uncovered)  
**Why**: Hard to mock all error codes in unit tests  
**Acceptable because**: Integration tests hit these paths

### When Exception is NOT Acceptable

❌ **Missing tests entirely**
```markdown
Coverage: 70%
Rationale: Didn't have time
```
→ NOT acceptable. Write the tests.

❌ **Complex logic**
```typescript
// 60% coverage on complex branching
if (x > 10 && y < 5 || z === 'foo') {
  // Complex logic
}
```
→ NOT acceptable. Unit test this (mock externals).

### Coverage Exception Decision Tree

```
Is coverage <95%?
  ├─ Yes → Are uncovered lines production infrastructure?
  │         ├─ Yes → Are they integration tested?
  │         │        ├─ Yes → ✅ Acceptable (document it)
  │         │        └─ No → ❌ Add integration tests
  │         └─ No → ❌ Add unit tests
  └─ No → ✅ Proceed
```

---

## Final Checklist

Before proceeding to Phase 4 (Review):

- [ ] **Every AC verified against actual code** (not memory)
  - [ ] Read each AC
  - [ ] Found implementation code
  - [ ] Code matches AC description
  - [ ] Tests cover AC
  - [ ] Box checked: `- [x]`

- [ ] **All validation commands passed**:
  - [ ] `npm test` ✅
  - [ ] `npm run test:coverage` ✅ (≥95% or exception documented)
  - [ ] `npm run test:integration` ✅ (if applicable)
  - [ ] `npm run build && npm run demo` ✅ (if demo updated)
  - [ ] `npm run lint` ✅
  - [ ] `npm run validate:workflow` ✅ (no errors; warnings must be fixed before Phase 4 complete)

- [ ] **Coverage checked**:
  - [ ] ≥95% overall OR
  - [ ] <95% with documented exception in story file

- [ ] **Story file updated**:
  - [ ] All ACs checked: `- [x]`
  - [ ] Coverage documented (if exception)
  - [ ] Definition of Done items checked

---

## Common Validation Failures

### Error: "Story marked Done has unchecked ACs"

**Output:**
```bash
❌ EPIC-02-STORY-004-array-converter.md: 
   Story marked "Done" has 5 unchecked acceptance criteria
```

**Root Cause**: Story status is ✅ Done but ACs not checked.

**Fix Process**:
1. DON'T just check boxes
2. Actually verify each AC (5-step process above)
3. Update implementation if AC not met
4. Write tests if missing
5. THEN check boxes
6. Re-run validation

### Error: "Status mismatch"

**Output:**
```bash
❌ Status mismatch for E2-S04
   - Story file: ⏳ In Progress
   - Backlog: ✅ Done
```

**Fix**: Update both files to same status (usually backlog is wrong).

### Error: "Missing dependencies"

**Output:**
```bash
❌ E2-S07 depends on E2-S05 which is not Done
```

**Fix**: Complete dependency first, or mark current story as 🚫 Blocked.

### Warning: "Should have PR/commit link"

**Output:**
```bash
⚠️  WARNING: Story should have PR/commit link (can be added after commit)
```

**What this means**: 
- ✅ Warnings **don't block commits** - you can push to backup your work
- ⚠️ Warnings **must still be fixed** - they indicate incomplete work
- 🔄 Warnings **should be resolved** before marking story complete

**Fix Process**:
1. Commit/push your work (warning won't block)
2. Add commit hash to story file: `**PR**: Commit abc123d`
3. Commit the story file update
4. Re-run validation - warning should be gone

---

## When Validation Fails: The Fix Loop

```
npm run validate:workflow
  ↓
❌ Errors found
  ↓
Read error messages
  ↓
Identify root cause
  ↓
Fix implementation (NOT just validation)
  ↓
Re-run tests
  ↓
Re-verify ACs
  ↓
Re-run validation
  ↓
Repeat until ✅
```

**Don't**: Try to trick validation  
**Do**: Fix actual problems

---

## Pre-Commit Hook Validation

The project has a pre-commit hook that runs validation automatically:

**When it runs**: Before each commit that touches story/backlog files

**What it does**:
- Runs workflow validation
- Shows issues
- Lets you choose to abort or continue

**Example**:
```bash
git commit -m "E2-S04: Complete array converter"

🔍 Running workflow validation...

❌ EPIC-02-STORY-004-array-converter.md: 
   Story marked "Done" has 3 unchecked acceptance criteria

⚠️  Validation found issues (see above)

Continue with commit? [y/N] _
```

**Best practice**: Fix issues before committing (choose 'N', fix, commit again).

---

## Success Criteria

You've completed Phase 3 when:

✅ All ACs verified using 5-step process  
✅ All validation commands passed  
✅ Coverage ≥95% (or documented exception)  
✅ `npm run validate:workflow` shows ✅  
✅ Pre-commit hook would pass  

**Next Phase**: [4-review.md](4-review.md) - Finalize documentation and update status

---

## Quick Reference

### 5-Step AC Verification
1. Read AC
2. Find code
3. Verify implementation
4. Find tests
5. Check box

### Validation Commands
```bash
npm test                      # Unit tests
npm run test:coverage         # Coverage check
npm run test:integration      # Integration tests (optional)
npm run build && npm run demo # Demo (if updated - test from root)
npm run lint                  # Linter
npm run validate:workflow     # Workflow validation ⭐
```

### Coverage Exception Template
```markdown
**Coverage: 85.71%**
**Uncovered Lines:** 35-36 (Redis instantiation)
**Evidence:** tests/integration/cache.test.ts:25-30
**Acceptable per docs/workflow/3-validation.md**
```

---

---

## Phase 3 Complete

**⚠️ DON'T say Phase 3 is complete if there are warnings!**

**✅ When you've completed all validation steps AND resolved all warnings, you MUST say:**

> "✅ Finished with Phase 3: Validation. Ready for Phase 4: Review."

**This confirms:**
- ✅ All acceptance criteria verified
- ✅ Tests passing (unit + integration)
- ✅ Coverage ≥95% (or exception approved by user)
- ✅ No errors in terminal/console
- ✅ No warnings in validation output (all resolved)
- ✅ Code quality verified

**⚠️ If warnings exist:**
- Validation allows commit (to backup work)
- But Phase 3 is NOT complete
- Fix warnings, then announce completion

**⚠️ If validation failed:**
- DO NOT proceed to Phase 4
- Fix issues and re-validate
- Ask user for help if blocked

**Next**: Proceed to [Phase 4: Review](4-review.md)

---

## See Also

- **[AGENTS.md](../../AGENTS.md)** - Complete workflow and state management
- **[Phase 2: Implementation](2-implementation.md)** - Coverage requirements and testing standards

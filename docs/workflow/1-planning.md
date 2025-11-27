# Phase 1: Planning

**Goal**: Prepare for implementation by understanding requirements and context.

**When**: Before starting any coding work

**Duration**: 15-30 minutes

**Output**: Clear understanding of what to build and how it fits in the system

---

## Overview

Planning phase ensures you:
- ✅ Pick the right story (dependencies met)
- ✅ Understand all acceptance criteria
- ✅ Know the architectural context
- ✅ Investigate existing code for reuse opportunities
- ✅ Have all information needed to implement

**Don't skip planning!** 30 minutes of planning saves hours of rework.

---

## Step 1: Pick a Story

### Prerequisites

Before picking a story, check:

1. **Backlog Status**
   ```bash
   cat docs/backlog.md | grep "⏳\|📋"
   ```
   Look for stories marked 📋 (Ready for Development)

2. **Find Available Stories**
   ```bash
   grep -r "📋 Ready for Development" docs/stories/
   ```

### Selection Rules

✅ **Must have**:
- Status: 📋 Ready for Development
- All dependencies: ✅ Done
- No blockers

❌ **Don't pick if**:
- Status: ⏳ In Progress (someone else working)
- Status: 🚫 Blocked (waiting on external dependency)
- Dependencies: Not all ✅ Done

### Check Dependencies

Every story file has a "Depends On" section:

```markdown
## Dependencies

### Depends On
- ✅ E1-S01: Project Setup
- ✅ E1-S02: Environment Config
- 📋 E1-S03: PAT Authentication  ← Not done! Story is blocked

### Blocks
- E1-S05: HTTP Client
```

**Rule**: All "Depends On" stories must be ✅ Done before you can start.

### If Story is Blocked

If you find a story is blocked:
1. Mark status as 🚫 Blocked in story file
2. Update backlog with 🚫
3. Document blocker: `**Blocked By**: Waiting for E1-S03 to complete`
4. Pick a different story
5. Notify team

---

## Step 2: Update State

Once you've picked a story, update status to ⏳ In Progress.

### Files to Update

#### A. Story File (`docs/stories/EPIC-XX-STORY-YYY-*.md`)

**Before:**
```markdown
**Status**: 📋 Ready for Development  
**Assignee**: -  
**Started**: -
```

**After:**
```markdown
**Status**: ⏳ In Progress  
**Assignee**: Your Name (e.g., "GitHub Copilot" or "Alice")  
**Started**: 2025-10-09
```

#### B. Backlog (`docs/backlog.md`)

**Before:**
```markdown
- 📋 [E2-S01: Number Converter](stories/EPIC-02-STORY-001-number-type-converter.md) - 3 points
```

**After:**
```markdown
- ⏳ [E2-S01: Number Converter](stories/EPIC-02-STORY-001-number-type-converter.md) - 3 points *(Your Name)*
```

### Commands

```bash
# 1. Open story file
code docs/stories/EPIC-02-STORY-001-number-type-converter.md

# 2. Update status fields (use editor)

# 3. Open backlog
code docs/backlog.md

# 4. Update emoji and add your name

# 5. Commit status changes
git add docs/stories/EPIC-02-STORY-001-*.md docs/backlog.md
git commit -m "E2-S01: Start work on number type converter"
git push
```

---

## Step 3: Read Context

Before coding, read these documents in order:

### A. Architecture Document

**File**: `docs/architecture/system-architecture.md`

**What to read**:
- Section 1: Executive Summary (understand MVP scope)
- Section 2: Technology Stack (constraints, no axios!)
- Section 3: System Components (how your code fits)
- Section linked in story's "Technical Notes"

**Example**: Story says "See Architecture §3.4 - Converter Pattern"
```bash
# Find section 3.4
grep -A 20 "## 3.4" docs/architecture/system-architecture.md
```

### B. Your Story File (FULL READ)

**File**: `docs/stories/EPIC-XX-STORY-YYY-*.md`

**Read every section**:
1. **User Story** - Understand the "why"
2. **Context** - Background and use cases
3. **Acceptance Criteria** - What you must implement (ALL of them)
4. **Technical Notes** - High-level approach, not prescriptive
5. **Dependencies** - What you can use
6. **Definition of Done** - Final checklist
7. **Testing Strategy** - What to test
8. **Examples** - Expected behavior

**Critical**: Read ALL acceptance criteria. If any are unclear, ask before starting.

### C. JIRA Field Types Reference (Epic 2 stories)

**File**: `docs/JIRA-FIELD-TYPES.md`

**When**: If story involves field type conversion

**What to read**:
- Field type you're implementing
- Related field types (for context)
- Array strategy (if applicable)

### D. Related Stories

Check story file's "Related Stories" section:

```markdown
## Dependencies

### Depends On
- ✅ E1-S08: Basic Text Field Converter

### Related Stories
- E2-S02: Date Type Converter (similar validation pattern)
```

**Action**: Read related stories for patterns and examples.

```bash
# Quick read of related story
cat docs/stories/EPIC-02-STORY-002-date-type-converter.md
```

### E. Existing Code (If Dependencies Exist)

If story depends on previous stories, read their implementation:

**Example**: E2-S02 depends on E2-S01 (Number Converter)

```bash
# Find number converter implementation
cat src/converters/types/NumberConverter.ts

# Find tests (understand testing patterns)
cat tests/unit/converters/types/NumberConverter.test.ts
```

---

## Step 4: Investigate Existing Functionality

**Goal**: Maximize code reuse by systematically investigating what already exists in the codebase.

**Why This Matters**: As projects grow, significant functionality accumulates. Agents and developers often waste time reimplementing existing features. 15 minutes of investigation can save hours of redundant work.

### A. Review Completed Work

Check what has already been built:

```bash
# List all completed stories/tasks
grep -r "✅ Done\|✅ Complete" docs/backlog.md docs/stories/ 2>/dev/null

# Check archived work (if archives exist)
ls docs/archive/ 2>/dev/null && cat docs/archive/*/SUMMARY.md 2>/dev/null

# Review changelog or release notes
cat CHANGELOG.md 2>/dev/null | head -100
```

**What to look for:**
- Stories with similar patterns to your current task
- Technical notes about reusable components
- Lessons learned from previous implementations

### B. Explore Source Code Structure

Understand what modules and components exist:

```bash
# Get overview of source structure
find src -type f -name "*.ts" -o -name "*.js" -o -name "*.py" | head -50

# List main exports (entry point)
cat src/index.ts 2>/dev/null || cat src/index.js 2>/dev/null || cat src/main.py 2>/dev/null

# Find all exported classes/functions
grep -r "export class\|export function\|export const\|export default" src/ | head -30
```

**Build a mental map of:**
- Core modules and their responsibilities
- Utility functions available
- Shared types/interfaces
- Error handling patterns

### C. Search for Similar Patterns

Use semantic and text search to find relevant existing code:

```bash
# Search for keywords related to your story
grep -ri "keyword1\|keyword2\|keyword3" src/ --include="*.ts" --include="*.js"

# Find similar class/function names
grep -r "class.*Similar\|function.*similar" src/

# Search test files for usage examples
grep -ri "describe.*keyword\|it.*should" tests/ --include="*.test.*"
```

**Search strategies:**
- **By concept**: Search for domain terms (e.g., "validation", "cache", "converter")
- **By pattern**: Search for design patterns (e.g., "factory", "registry", "handler")
- **By type**: Search for similar data types or interfaces
- **By test**: Tests often show correct usage patterns

### D. Identify Reusable Components

For each component you might need, classify as:

| Category | Description | Action |
|----------|-------------|--------|
| **Direct Reuse** | Exact functionality exists | Import and use as-is |
| **Extend** | Base class/interface exists | Extend or implement |
| **Adapt** | Similar pattern exists | Copy pattern, modify for your needs |
| **New** | Nothing similar exists | Implement from scratch |

### E. Document Your Findings

Create a brief reuse analysis (can be mental notes or written):

```markdown
## Reuse Analysis for [Story ID]

### Direct Reuse
- `src/utils/validator.ts` - Input validation helpers
- `src/errors/CustomError.ts` - Base error class

### Extend/Implement
- `src/converters/BaseConverter.ts` - Extend for new converter

### Pattern to Follow
- `src/services/UserService.ts` - Similar service pattern
- `tests/unit/services/UserService.test.ts` - Test structure to follow

### New Code Required
- Business logic specific to this story
- Story-specific validation rules
```

### F. Quick Investigation Commands

**For TypeScript/JavaScript projects:**
```bash
# Find all classes
grep -r "export class" src/

# Find all interfaces/types
grep -r "export interface\|export type" src/

# Find utility functions
ls src/utils/ 2>/dev/null && grep -r "export function" src/utils/

# Find existing tests for patterns
ls tests/ && find tests -name "*.test.*" | head -20
```

**For Python projects:**
```bash
# Find all classes
grep -r "^class " src/ --include="*.py"

# Find all functions
grep -r "^def \|^async def " src/ --include="*.py"

# Find tests
find tests -name "test_*.py" -o -name "*_test.py"
```

**Universal approaches:**
```bash
# Search by semantic meaning (if AI tools available)
# "Find all code related to user authentication"

# Check documentation
ls docs/ && find docs -name "*.md" | xargs grep -l "keyword"

# Review recent commits for context
git log --oneline -20
git log --oneline --all -- "*keyword*"
```

### Investigation Checklist

Before proceeding, verify:

- [ ] Reviewed completed stories for similar work
- [ ] Explored source code structure
- [ ] Searched for similar patterns/keywords
- [ ] Identified components to reuse vs. create new
- [ ] Documented reuse plan (at least mentally)

**Time limit**: 15 minutes. If you haven't found relevant code by then, proceed with implementation—the codebase may genuinely not have what you need.

---

## Red Flags

**Stop and ask for clarification if**:

❌ Acceptance criteria unclear or ambiguous  
❌ Technical notes conflict with architecture  
❌ Required dependency not actually ✅ Done  
❌ Story asks for tech not in architecture (e.g., axios)  
❌ You don't understand the "why" (user story)

**Don't guess.** Asking questions saves time.

---

## Before Implementation: Start Prerequisites ⚠️

Most stories require Redis for caching and schema discovery. Start it now to avoid issues during implementation.

```bash
# Start Redis (if not already running)
npm run redis:start

# Verify it's running (Redis runs in Docker container)
docker ps | grep redis
# Should show: jira-magic-redis container running

# Alternative: Check if Redis responds via Docker
docker exec jml-redis redis-cli ping 
# Should return "PONG"
```

**Quick Redis Commands:**
```bash
npm run redis:start   # Start Redis in Docker
npm run redis:stop    # Stop Redis when done
docker ps | grep redis                         # Check if container running
docker exec jml-redis redis-cli ping     # Test connection from inside container
```

**Why start now?** You'll need it for:
- Running unit tests (mocked Redis)
- Running integration tests (real Redis)
- Testing demos
- Schema caching

---

## Planning Checklist

Before proceeding to Phase 2 (Implementation):

- [ ] **Story Selected**
  - [ ] Status was 📋 Ready
  - [ ] All dependencies ✅ Done
  - [ ] No blockers

- [ ] **State Updated**
  - [ ] Story file: 📋 → ⏳
  - [ ] Backlog: 📋 → ⏳ *(Your Name)*
  - [ ] Changes committed

- [ ] **Context Read**
  - [ ] Architecture doc (relevant sections)
  - [ ] Full story file (all ACs understood)
  - [ ] Related stories (for patterns)
  - [ ] Dependency code (if exists)

- [ ] **Existing Functionality Investigated**
  - [ ] Reviewed completed work for similar patterns
  - [ ] Explored source code structure
  - [ ] Searched for reusable components
  - [ ] Documented reuse plan (direct reuse / extend / adapt / new)

- [ ] **Ready to Implement**
  - [ ] Understand WHAT to build (ACs)
  - [ ] Understand WHY (user story)
  - [ ] Understand WHERE (file structure)
  - [ ] Understand HOW (technical notes, patterns, reuse plan)
  - [ ] No ambiguities or blockers

---

## Example Walkthrough

### Scenario: Starting E2-S01 (Number Converter)

#### Step 1: Pick Story

```bash
# Check backlog
cat docs/backlog.md | grep "E2-S01"
# Output: 📋 [E2-S01: Number Converter]... - 3 points

# Check status in story file
grep "Status" docs/stories/EPIC-02-STORY-001-number-type-converter.md
# Output: **Status**: 📋 Ready for Development

# Check dependencies
grep -A 5 "Depends On" docs/stories/EPIC-02-STORY-001-number-type-converter.md
# Output: - ✅ E1-S08: Basic Text Field Converter

# All checks pass! ✅
```

#### Step 2: Update State

```bash
# Update story file
code docs/stories/EPIC-02-STORY-001-number-type-converter.md
# Change: 📋 → ⏳, add assignee, add date

# Update backlog
code docs/backlog.md
# Change: 📋 → ⏳ *(GitHub Copilot)*

# Commit
git commit -m "E2-S01: Start work on number type converter"
```

#### Step 3: Read Context

```bash
# 1. Architecture (converter pattern)
grep -A 30 "Converter Pattern" docs/architecture/system-architecture.md

# 2. Story file (all sections)
cat docs/stories/EPIC-02-STORY-001-number-type-converter.md
# Key ACs:
# - Parse strings to numbers
# - Preserve int vs float
# - Validate format

# 3. JIRA field types
grep -A 20 "Number Type" docs/JIRA-FIELD-TYPES.md

# 4. Related story (E1-S08 text converter for pattern)
cat src/converters/types/StringConverter.ts
cat tests/unit/converters/types/StringConverter.test.ts
```

#### Result: Ready to Implement

Now you know:
- ✅ What: Parse strings/numbers, validate, preserve types
- ✅ Why: Users pass "5" or 5 for Story Points
- ✅ Where: `src/converters/types/NumberConverter.ts`
- ✅ How: Follow StringConverter pattern, register in registry
- ✅ Test: Unit tests (parse, validate, edge cases)

**Next Phase**: [2-implementation.md](2-implementation.md) - Write tests and code

---

## Quick Reference

### Files to Read
1. `docs/architecture/system-architecture.md` (relevant sections)
2. `docs/stories/EPIC-XX-STORY-YYY-*.md` (FULL)
3. `docs/JIRA-FIELD-TYPES.md` (if field conversion)
4. Related story files
5. Dependency implementations

### State Update Locations
1. Story file header (status, assignee, date)
2. Backlog (emoji, name)
3. Git commit (status changes)

### Commands
```bash
# Find ready stories
grep -r "📋 Ready" docs/stories/

# Check dependencies
grep -A 5 "Depends On" docs/stories/EPIC-XX-STORY-YYY-*.md

# Read architecture section
grep -A 20 "Section Name" docs/architecture/system-architecture.md

# Update status
git add docs/stories/EPIC-XX-*.md docs/backlog.md
git commit -m "EX-SYY: Start work on story"
```

---

## Phase 1 Complete

**✅ When you've completed all planning steps, you MUST say:**

> "✅ Finished with Phase 1: Planning. Ready for Phase 2: Implementation."

**This confirms:**
- ✅ Story selected and dependencies verified
- ✅ All acceptance criteria understood
- ✅ Architectural context reviewed
- ✅ Existing functionality investigated for reuse
- ✅ Technical approach planned
- ✅ Status updated to "⏳ In Progress"

**Next**: Proceed to [Phase 2: Implementation](2-implementation.md)

---

## See Also

- **[AGENTS.md](../../AGENTS.md)** - Complete workflow, state management, file structure
- **[System Architecture](../architecture/system-architecture.md)** - Technical decisions and constraints

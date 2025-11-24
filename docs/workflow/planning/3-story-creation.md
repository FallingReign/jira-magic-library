# Phase 3: Story Creation

**Goal**: Create detailed story files for all stories in the refined epic using the template.

**When**: After epic refinement approved (Phase 2 complete)

**Duration**: 1-2 hours (agent-led)

**Output**: All story files created in `docs/stories/`, ready for user review.

---

## Overview

Phase 3 is **agent-led execution** where you create detailed story files from the template. Each story file must be:
- ✅ Based on [`docs/stories/_TEMPLATE.md`](../../stories/_TEMPLATE.md)
- ✅ Fully filled in (no placeholder text remaining)
- ✅ Sized appropriately (S/M/L)
- ✅ Dependencies mapped
- ✅ Linked to architecture documentation

**User role**: Minimal involvement, reviews output in Phase 4.

---

## Step 1: Prepare Story List

### Get Refined Story List from Backlog

```bash
# Example: Epic 3
grep -A 20 "### Stories" docs/backlog.md | grep "E3-S"
```

**Expected output:**
```
1. E3-S01: Time Tracking Fields (5 points)
2. E3-S02a: Sprint Field Discovery (3 points)
3. E3-S02b: Sprint Converter with Active Sprint Detection (5 points)
4. E3-S04: Multi-Value Time Tracking (5 points)
5. E3-S05: Sprint Board Lookup (5 points)
6. E3-S07: Integration Tests (10 points)
7. E3-S08: Demo & Documentation (3 points)
8. E3-S09: Sprint Lookup Cache Infrastructure (5 points)
```

### Create Story Tracking Sheet

**In memory or temp file, track:**
```
Story ID | Title | Size | Dependencies | Status
---------|-------|------|--------------|-------
E3-S01   | Time Tracking Fields | 5 | E2-S01 | Not Started
E3-S09   | Sprint Lookup Cache | 5 | E1-S04 | Not Started
E3-S02a  | Sprint Discovery | 3 | E1-S06 | Not Started
E3-S02b  | Sprint Converter | 5 | E3-S09 | Not Started
...
```

---

## Step 2: Create Story Files

### For Each Story in Epic

**File naming:**
```
EPIC-{epic:02d}-STORY-{story:03d}-{kebab-case-title}.md

Examples:
EPIC-03-STORY-001-time-tracking-fields.md
EPIC-03-STORY-002a-sprint-field-discovery.md
EPIC-03-STORY-002b-sprint-converter.md
```

### Copy Template

```bash
# For first story
cp docs/stories/_TEMPLATE.md docs/stories/EPIC-03-STORY-001-time-tracking-fields.md
```

**Or use code to create file with template content.**

### Fill in Header

**Replace placeholders:**
```markdown
# E3-S01: Time Tracking Fields

**Epic**: Epic 3 - Complex Field Types
**Size**: Medium (5 points)
**Priority**: P0
**Status**: 📋 Ready for Development
**Assignee**: -
**PR**: -
**Started**: -
**Completed**: -
```

**Rules:**
- Size: S (3), M (5), L (8-10)
- Priority: P0 (critical), P1 (high), P2 (medium), P3 (nice-to-have)
- Status: Always "📋 Ready for Development" initially

---

## Step 3: Write User Story

### Format

```markdown
## User Story

**As a** {persona/role}
**I want** {capability}
**So that** {value/outcome}
```

### Examples

**For feature story:**
```markdown
**As a** developer using the library
**I want** to set time tracking fields using human-readable field names
**So that** I can add time estimates to issues without looking up field IDs
```

**For infrastructure story:**
```markdown
**As a** library maintainer
**I want** a sprint lookup cache to store active sprint information
**So that** sprint field conversion is fast and doesn't hit JIRA API repeatedly
```

**Guidelines:**
- "As a developer using the library" = user-facing features
- "As a library maintainer" = infrastructure/internal
- Be specific about the value ("So that" clause is critical)

---

## Step 4: Define Acceptance Criteria

### Structure

**Each story should have 5-9 acceptance criteria:**
```markdown
### ✅ AC1: {What behavior/capability}
- [ ] {Specific testable requirement}
- [ ] {Another specific requirement}
- [ ] {Edge case or error condition}

**Evidence**: ...
```

### How to Write ACs

**Good ACs are:**
- ✅ **Testable**: Can be proven with code/tests
- ✅ **Specific**: No ambiguity about what "done" means
- ✅ **Valuable**: User/system gets something useful
- ✅ **Independent**: Each AC can be implemented/tested separately

**Example AC structure:**

```markdown
### ✅ AC1: Parse String Time Values to Seconds
- [ ] Accept time as string (e.g., "2h", "30m", "1d", "1h 30m")
- [ ] Convert to seconds for JIRA API (1h = 3600s, 1d = 28800s)
- [ ] Handle both space-separated and compact formats
- [ ] Throw ValidationError if format invalid

**Evidence**: ...

### ✅ AC2: Support Numeric Values (Seconds)
- [ ] Accept numeric value as seconds directly
- [ ] Pass through to JIRA API without conversion
- [ ] Validate value is positive integer

**Evidence**: ...
```

### Typical AC Patterns

**For converter stories:**
1. AC1: Parse primary input format
2. AC2: Support alternative formats
3. AC3: Handle optional/null values
4. AC4: Error handling for invalid input
5. AC5: Integration with field schema
6. AC6: Caching behavior (if applicable)

**For infrastructure stories:**
1. AC1: Core functionality works
2. AC2: Configuration options
3. AC3: Error handling
4. AC4: Performance requirements
5. AC5: Integration points

**For test stories:**
1. AC1: Unit test coverage ≥95%
2. AC2: Integration tests for happy paths
3. AC3: Integration tests for error cases
4. AC4: Edge case coverage
5. AC5: Test data fixtures

---

## Step 5: Add Technical Notes

### Architecture Prerequisites

**Link to relevant architecture sections:**
```markdown
### Architecture Prerequisites
- [Field Conversion Engine](../architecture/system-architecture.md#4-field-resolution--conversion-engine)
- Key design patterns: Type-based conversion, async lookups
- Key constraints: Native fetch (no axios), 95% test coverage
```

**How to find architecture links:**
```bash
# Search architecture doc for relevant sections
grep -n "##" docs/architecture/system-architecture.md
```

### Testing Prerequisites

**Document what needs to be running:**
```markdown
### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- [ ] Redis running on localhost:6379 (`npm run redis:start`)
- [ ] .env file configured with JIRA credentials
- [ ] JIRA_PROJECT_KEY set to project with Sprint field

**Start Prerequisites:**
\`\`\`bash
# Start Redis
npm run redis:start

# Verify Redis
redis-cli ping  # Should return "PONG"

# Check .env
cat .env | grep JIRA_PROJECT_KEY
\`\`\`
```

### Dependencies

**List story dependencies:**
```markdown
### Dependencies
- E2-S01 (Number Converter): Time values are converted to numbers
- E1-S06 (Schema Discovery): Need field schema to identify time tracking fields
- E1-S04 (Redis Cache): Cache time tracking field metadata
```

**How to identify dependencies:**
1. What infrastructure does this story need? (from Epic 1)
2. What converters does this story use? (from Epic 2)
3. What stories in this epic must complete first?

### Implementation Guidance

**Provide concrete examples:**
```markdown
### Implementation Guidance

**Time format parsing examples:**
\`\`\`typescript
// Inputs to support
"2h"      → 7200 seconds
"30m"     → 1800 seconds  
"1d"      → 28800 seconds (8-hour workday)
"1h 30m"  → 5400 seconds
"2d 3h"   → 68400 seconds

// Error cases
"2x"      → ValidationError (invalid unit)
"-1h"     → ValidationError (negative time)
"abc"     → ValidationError (not a time format)
\`\`\`

**Converter structure:**
\`\`\`typescript
export const convertTimeTrackingType: FieldConverter = (value, fieldSchema, context) => {
  if (typeof value === 'string') {
    return parseTimeString(value);  // Convert "2h" → 7200
  }
  if (typeof value === 'number') {
    return validateSeconds(value);  // Validate positive integer
  }
  // Handle null/undefined...
};
\`\`\`
```

---

## Step 6: Size and Prioritize

### Story Sizing

**Use from backlog, validate makes sense:**

| Size | Points | Duration | Complexity |
|------|--------|----------|------------|
| **S** | 3 | 2-4 hours | Single class, <200 LOC, simple logic |
| **M** | 5 | 4-8 hours | Multiple classes, <500 LOC, moderate complexity |
| **L** | 8-10 | 1-2 days | Complex logic, >500 LOC, multiple integrations |

**Red flags:**
- ⚠️ Story >10 points → Should be split
- ⚠️ Story has >12 ACs → Probably too large
- ⚠️ Story depends on >5 other stories → May be too complex

### Priority Assignment

**P0 (Critical)**: Must have for epic to deliver value  
**P1 (High)**: Important, but epic can function without  
**P2 (Medium)**: Nice to have, enhances value  
**P3 (Low)**: Optional, can be deferred  

**Example:**
- E3-S01 (Time Tracking): P0 (core feature)
- E3-S09 (Sprint Cache): P0 (needed for performance)
- E3-S08 (Demo): P1 (important but not blocking)

---

## Step 7: Validate Story Quality

### Quality Checklist (Per Story)

**Before moving to next story:**

- [ ] File name follows convention: `EPIC-{XX}-STORY-{YYY}-{kebab-case}.md`
- [ ] Header fully filled (no {placeholders})
- [ ] User story has all three parts (As a / I want / So that)
- [ ] 5-9 acceptance criteria defined
- [ ] Each AC has evidence placeholder with expected file paths
- [ ] Technical notes section complete with architecture links
- [ ] Testing prerequisites documented (if any)
- [ ] Dependencies listed
- [ ] Implementation guidance provided (examples, code structure)
- [ ] Size (S/M/L) makes sense for scope
- [ ] Priority (P0-P3) assigned

### Common Mistakes

**❌ Vague ACs:**
```markdown
### ✅ AC1: Support time tracking
- [ ] It should work
```

**✅ Specific ACs:**
```markdown
### ✅ AC1: Parse String Time Values to Seconds
- [ ] Accept time as string (e.g., "2h", "30m", "1d")
- [ ] Convert to seconds for JIRA API
- [ ] Throw ValidationError if format invalid
```

**❌ Missing implementation guidance:**
```markdown
### Implementation Guidance
{TODO: Add details}
```

**✅ Concrete guidance:**
```markdown
### Implementation Guidance
\`\`\`typescript
// Expected converter structure
export const convertTimeTrackingType: FieldConverter = (value, fieldSchema, context) => {
  // Parse string formats like "2h", "30m", "1d"
  // Return seconds as number
};
\`\`\`
```

---

## Step 8: Update Backlog with Story Links

### Add Story Links to Backlog

**File**: [`docs/backlog.md`](../../backlog.md)

**Update epic section:**
```markdown
### Stories

| ID | Story | Size | Priority | Status |
|----|-------|------|----------|--------|
| E3-S01 | [Time Tracking Fields](stories/EPIC-03-STORY-001-time-tracking-fields.md) | M (5) | P0 | 📋 Ready |
| E3-S09 | [Sprint Lookup Cache](stories/EPIC-03-STORY-009-sprint-lookup-cache.md) | M (5) | P0 | 📋 Ready |
| E3-S02a | [Sprint Field Discovery](stories/EPIC-03-STORY-002a-sprint-discovery.md) | S (3) | P0 | 📋 Ready |
...
```

**Commit changes:**
```bash
git add docs/backlog.md docs/stories/EPIC-03-*.md
git commit -m "Epic 3: Create all story files (8 stories, 49 points)"
git push
```

---

## Completion Checklist

Before proceeding to Phase 4:

- [ ] All stories from refined epic have files created
- [ ] Every story file based on template
- [ ] No placeholder text remaining in any story
- [ ] All stories have 5-9 acceptance criteria
- [ ] All stories have technical notes with architecture links
- [ ] All stories have dependencies mapped
- [ ] All stories have implementation guidance
- [ ] All stories are sized (S/M/L) and prioritized (P0-P3)
- [ ] Backlog updated with story file links
- [ ] All changes committed to git

---

## Common Issues

### Issue: Story too large (>10 points)

**Symptom**: Story has 15+ ACs, feels overwhelming

**Fix**:
1. Split into 2-3 smaller stories
2. Example: "Sprint Converter" → "Sprint Discovery" + "Sprint Conversion" + "Sprint Caching"
3. Update backlog with new stories
4. Create separate files for each

### Issue: Can't figure out acceptance criteria

**Symptom**: Not sure what "done" means for this story

**Fix**:
1. Look at similar stories from previous epics (E1-S01 through E2-S12)
2. Read architecture document for guidance
3. Ask user: "What should E3-S05 deliver? What tests prove it works?"
4. Break down into testable behaviors

### Issue: Dependencies unclear

**Symptom**: Not sure which stories this depends on

**Fix**:
1. Check epic-level dependencies in backlog
2. Look for infrastructure needed (Redis, schema discovery, etc.)
3. Check if story uses converters from Epic 2
4. Ask user if unclear

---

## Phase 3 Complete

**✅ When all story files are created, you MUST say:**

> "✅ Finished with Planning Phase 3: Story Creation. Epic X has [N] story files created ([Y] total points). Ready for Planning Phase 4: Story Review."

**This confirms:**
- ✅ All story files created from template
- ✅ Every file fully filled in (no placeholders)
- ✅ Acceptance criteria defined (5-9 per story)
- ✅ Technical notes and dependencies documented
- ✅ Backlog updated with story links
- ✅ All changes committed
- ✅ Ready for user review

**Next**: Proceed to [Phase 4: Story Review](4-story-review.md)

---

## See Also

- **[Planning Workflow Overview](README.md)** - Full planning process
- **[Story Template](../../stories/_TEMPLATE.md)** - Template used for all stories
- **[Phase 2: Epic Refinement](2-epic-refinement.md)** - Previous phase
- **[Phase 4: Story Review](4-story-review.md)** - Next phase
- **[Example: Epic 1 Stories](../../archive/epic-01/)** - Real story examples

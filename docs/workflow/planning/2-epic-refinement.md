# Phase 2: Epic Refinement

**Goal**: Collaboratively review and refine the epic with the user, incorporating learnings and ensuring alignment with vision.

**When**: After epic selection (Phase 1 complete)

**Duration**: 30-60 minutes (collaborative discussion)

**Output**: Refined epic definition approved by user, ready for story creation.

---

## Overview

Phase 2 is a **collaborative, user-led process** where you:
1. Review what was learned from previous epic(s)
2. Validate epic goals still align with product vision
3. Adjust epic scope, acceptance criteria, and stories based on new insights
4. Get explicit user approval before creating detailed stories

**This is the most important phase** - it ensures the epic is worth building before investing time in detailed story creation.

---

## Step 1: Review Learnings from Previous Epic

### Gather Context

**Read the archived epic summary:**
```bash
# Example: Epic 2 complete, refining Epic 3
cat docs/archive/epic-02/EPIC-SUMMARY.md
```

**Look for:**
- ✅ What went well? (patterns to reuse)
- ⚠️ What was challenging? (risks to mitigate)
- 🔧 What architectural decisions were made?
- 📊 What was the actual effort vs estimated? (sizing lessons)

### Facilitate Discussion

**Agent prompts:**
```
Epic 2 (Core Field Types) Learnings:

✅ What went well:
- Lookup caching reduced API calls by 80%
- Type-based converters are more maintainable than name-based
- Integration tests caught edge cases unit tests missed

⚠️ Challenges:
- Ambiguity detection added complexity (E2-S05)
- Some stories were larger than estimated (E2-S08: 5→8 hours)
- Redis setup required for all integration tests

🔧 Architectural decisions:
- Introduced async converter pattern for lookups
- Caching strategy: 15min TTL for lookup lists
- Error handling: ValidationError for user input, ApiError for JIRA failures

Questions for Epic 3 planning:
1. Should we apply the async converter pattern to time tracking fields?
2. Do we need additional caching for sprint/board lookups?
3. Are any E3 stories likely to be larger than 8 points?
```

### User Responds

User shares insights and makes strategic decisions:

**Example:**
```
User: "Yes, async pattern should be used for sprint lookups - boards can have 100+ sprints.
       For time tracking, values are simple numbers, no async needed.
       Let's add a story for sprint caching infrastructure (E3-S02a).
       Also, subtask support is lower priority now - defer to Epic 6."
```

---

## Step 2: Validate Epic Goals

### Review Current Epic Definition

**Read epic section in backlog:**
```bash
# Example: Epic 3
grep -A 30 "## Epic 3:" docs/backlog.md
```

**Agent presents epic goals:**
```
Epic 3: Complex Field Types

Goal: Support advanced JIRA field types (time tracking, sprints, parent/epic links)

User Value: Create issues with sprint assignments, time estimates, and epic relationships

Acceptance Criteria:
- Support time tracking fields (original estimate, remaining estimate)
- Support sprint field with agile boards
- Support parent/epic link fields
- All converters type-driven (not name-based)
- 95% test coverage

Does this goal still align with product vision?
Any changes needed based on Epic 2 learnings?
```

### User Validation

User confirms or adjusts goals:

**Option 1: Goals approved**
```
User: "Yes, these goals still make sense. Let's proceed."
```

**Option 2: Goals need adjustment**
```
User: "Add acceptance criterion: Support time tracking in both hours and days.
       Remove parent/epic link for now - most users don't use it. Move to Epic 6.
       Update user value: 'Create issues with sprint assignments and time estimates'"
```

### Update Epic Definition

**If changes needed:**
```bash
# Open backlog
code docs/backlog.md

# Update epic section with user's changes
# Save and commit
git add docs/backlog.md
git commit -m "Epic 3: Refine goals based on Epic 2 learnings"
```

---

## Step 3: Refine Story List

### Review Current Stories

**From backlog.md, list current stories:**
```
Epic 3 Stories (current):
1. E3-S01: Time Tracking Fields (5 points)
2. E3-S02: Sprint Field Converter (5 points)
3. E3-S03: Parent/Epic Link (5 points)
4. E3-S04: Multi-Value Time Tracking (5 points)
5. E3-S05: Sprint Board Lookup (5 points)
6. E3-S06: Epic Link Resolution (3 points)
7. E3-S07: Integration Tests (8 points)
8. E3-S08: Demo & Documentation (3 points)

Total: 8 stories, 47 points
```

### Collaborative Story Adjustment

**Agent facilitates:**
```
Based on your feedback:
- Remove E3-S03 (Parent/Epic Link) → Move to Epic 6
- Remove E3-S06 (Epic Link Resolution) → Move to Epic 6
- Split E3-S02 (Sprint Field):
  → E3-S02a: Sprint Field Discovery (3 points)
  → E3-S02b: Sprint Value Conversion with Caching (5 points)
- Add E3-S09: Sprint Lookup Cache Infrastructure (5 points)

Proposed updated story list:
1. E3-S01: Time Tracking Fields (5 points)
2. E3-S02a: Sprint Field Discovery (3 points)
3. E3-S02b: Sprint Value Conversion with Caching (5 points)
4. E3-S04: Multi-Value Time Tracking (5 points)
5. E3-S05: Sprint Board Lookup (5 points)
6. E3-S07: Integration Tests (8 points)
7. E3-S08: Demo & Documentation (3 points)
8. E3-S09: Sprint Lookup Cache Infrastructure (5 points)

Total: 8 stories, 47 points (same total)

Does this look right?
```

### User Approves or Adjusts

**User refines:**
```
User: "Good. But E3-S09 should come before E3-S02b (dependency).
       Also, rename E3-S02b to 'Sprint Converter with Active Sprint Detection'
       And increase E3-S07 to 10 points - integration tests for sprints will be complex."
```

### Update Backlog

**Apply all changes:**
```bash
# Update epic section in docs/backlog.md
# - Adjust story list
# - Update point totals
# - Reorder by dependencies
# - Update any stories moved to other epics

git add docs/backlog.md
git commit -m "Epic 3: Refine story list - add sprint caching, remove epic link, adjust sizing"
```

---

## Step 4: Validate Dependencies

### Check Story Dependencies

**For each story, verify:**
- Does it depend on stories from previous epics? (should be ✅ Done)
- Does it depend on stories within this epic? (check ordering)
- Are there circular dependencies? (fix if found)

**Example dependency check:**
```
E3-S01: Time Tracking Fields
  Depends on: E2-S01 (Number Converter) ✅ Done
  
E3-S02a: Sprint Field Discovery  
  Depends on: E1-S06 (Schema Discovery) ✅ Done
  
E3-S02b: Sprint Converter with Active Sprint Detection
  Depends on: E3-S09 (Sprint Lookup Cache) ← Within epic, needs to come after
  
E3-S09: Sprint Lookup Cache Infrastructure
  Depends on: E1-S04 (Redis Cache) ✅ Done
```

### Reorder Stories

**Ensure logical sequence:**
```
Correct order:
1. E3-S01 (no internal dependencies)
2. E3-S09 (cache infrastructure first)
3. E3-S02a (discovery)
4. E3-S02b (uses cache from E3-S09)
5. E3-S04 (uses E3-S01)
6. E3-S05 (uses E3-S02b)
7. E3-S07 (tests all above)
8. E3-S08 (demo/docs last)
```

**Update backlog with correct order.**

---

## Step 5: Validate Architecture Alignment

### Check Architecture Document

```bash
# Read relevant sections
cat docs/architecture/system-architecture.md | grep -A 20 "Field Conversion"
```

**Verify:**
- ✅ Epic aligns with architectural decisions
- ✅ No new dependencies introduced without justification
- ✅ Converter pattern is consistent
- ✅ Caching strategy follows existing patterns

### Flag Architecture Concerns

**If epic introduces new patterns:**
```
Agent: "Epic 3 introduces async converter pattern for sprint lookups.
        This is a new pattern (not used in Epic 1/2).
        
        Should we:
        1. Document this pattern in system-architecture.md?
        2. Create an architecture decision record (ADR)?
        3. Add a story for refactoring Epic 2 converters to use async pattern?"
```

**User decides:**
```
User: "Yes, update system-architecture.md to document async pattern.
       No ADR needed - it's a natural evolution.
       Don't refactor E2 - async only needed for large lookup lists."
```

---

## Step 6: Size Validation

### Review Story Sizes

**Check sizing makes sense:**
```
S (3 points): 2-4 hours, simple, single class
M (5 points): 4-8 hours, moderate, multiple classes
L (8 points): 1-2 days, complex, may need splitting

Epic 3 sizes:
- 1 Small (3 points): E3-S02a
- 5 Medium (5 points): E3-S01, E3-S02b, E3-S04, E3-S05, E3-S09
- 1 Large (8 points): E3-S07 (adjusted to 10)
- 1 Small (3 points): E3-S08
```

**Flag concerns:**
```
Agent: "E3-S07 is now 10 points (1.25 Large). That's higher than our guideline.
        Should we split it into:
        - E3-S07a: Sprint Integration Tests (5 points)
        - E3-S07b: Time Tracking Integration Tests (5 points)"
```

**User decides:**
```
User: "No, keep it together. Integration tests are more efficient when comprehensive.
       10 points is acceptable for integration test stories."
```

---

## Step 7: Final Epic Approval

### Present Refined Epic

**Agent summarizes all changes:**
```
Epic 3 Refinement Summary:

Goal (Updated):
  Support advanced JIRA field types (time tracking, sprints) with efficient caching

User Value (Updated):
  Create issues with sprint assignments and time estimates without manual lookups

Acceptance Criteria (Updated):
  - Support time tracking fields (hours and days)
  - Support sprint field with active sprint detection
  - Sprint lookup caching with 15min TTL
  - All converters type-driven and async where needed
  - 95% test coverage

Stories (Updated):
  8 stories, 49 points (was 47)
  - Added: E3-S09 (Sprint Lookup Cache)
  - Removed: E3-S03, E3-S06 (moved to Epic 6)
  - Split: E3-S02 → E3-S02a, E3-S02b
  - Adjusted: E3-S07 sizing (8→10 points)

Dependencies:
  All external dependencies met (Epic 1, 2 complete)
  Internal dependencies validated and ordered

Architecture:
  Aligns with existing patterns
  Introduces async converter pattern (documented)

Ready to create detailed story files?
```

### User Gives Final Approval

**Required approval:**
```
User: "Approved. Create the story files."
```

**If not approved:**
```
User: "Wait, one more thing - add a story for error handling edge cases."
```
→ Make adjustments, re-present, get approval

---

## Step 8: Update Backlog Status

**Once approved:**

```bash
# Update epic status in backlog.md
# Change: 🔄 Refining → ⏳ Planning (story creation in progress)

git add docs/backlog.md
git commit -m "Epic 3: Refinement approved, ready for story creation"
git push
```

---

## Validation Checklist

Before proceeding to Phase 3, verify:

- [ ] Reviewed learnings from previous epic
- [ ] Validated epic goals with user
- [ ] Updated epic definition based on insights
- [ ] Refined story list (added/removed/split stories)
- [ ] Validated all dependencies
- [ ] Checked architecture alignment
- [ ] Reviewed story sizing
- [ ] User gave explicit approval to create stories
- [ ] Backlog updated with refined epic

---

## Common Issues

### Issue: User wants major scope changes

**Symptom**: User wants to add/remove 50% of stories

**Fix**:
1. This is expected! Previous epic taught lessons
2. Update epic point total significantly
3. May need to split epic if >60 points
4. Re-validate with user before proceeding

### Issue: Stories have circular dependencies

**Symptom**: E3-S02 depends on E3-S05, E3-S05 depends on E3-S02

**Fix**:
1. Identify shared dependency (e.g., lookup cache)
2. Extract shared infrastructure to new story
3. Both stories then depend on infrastructure story
4. Reorder: Infrastructure → Feature A → Feature B

### Issue: Epic no longer aligns with vision

**Symptom**: User says "This epic doesn't make sense anymore"

**Fix**:
1. Mark epic as "🚫 Blocked" or "❌ Cancelled" in backlog
2. Select next epic from backlog
3. Restart Phase 1 with new epic

---

## Phase 2 Complete

**✅ When refinement is approved, you MUST say:**

> "✅ Finished with Planning Phase 2: Epic Refinement. Epic X is refined and approved with [N] stories ([Y] points). Ready for Planning Phase 3: Story Creation."

**This confirms:**
- ✅ Epic goals validated with user
- ✅ Story list refined and approved
- ✅ Dependencies validated
- ✅ Architecture alignment confirmed
- ✅ User approved proceeding to story creation
- ✅ Backlog updated with refinements

**Next**: Proceed to [Phase 3: Story Creation](3-story-creation.md)

---

## See Also

- **[Planning Workflow Overview](README.md)** - Full planning process
- **[Phase 1: Epic Selection](1-epic-selection.md)** - Previous phase
- **[Phase 3: Story Creation](3-story-creation.md)** - Next phase
- **[Backlog](../../backlog.md)** - Epic definitions
- **[System Architecture](../../architecture/system-architecture.md)** - Architecture constraints

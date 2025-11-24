# Phase 4: Story Review

**Goal**: User reviews all created story files, provides feedback, and approves for development.

**When**: After all story files created (Phase 3 complete)

**Duration**: 30-60 minutes (user-led)

**Output**: All stories approved, epic ready for development workflow.

---

## Overview

Phase 4 is **user-led review** where the user:
- ✅ Reviews every story file for clarity and completeness
- ✅ Validates acceptance criteria are testable
- ✅ Confirms sizing is appropriate
- ✅ Identifies missing stories or dependencies
- ✅ Gives explicit approval to begin development

**Agent role**: Make adjustments based on feedback, facilitate discussion.

---

## Step 1: Present Stories for Review

### Agent Summary

**Provide overview of created stories:**
```
Epic 3 Story Creation Complete

📊 Summary:
- Stories created: 8
- Total points: 49
- Size distribution: 1 Small (3pt), 6 Medium (5pt), 1 Large (10pt)
- Priority distribution: 7 P0, 1 P1

📁 Files created:
1. EPIC-03-STORY-001-time-tracking-fields.md (5pt, P0)
2. EPIC-03-STORY-009-sprint-lookup-cache.md (5pt, P0)
3. EPIC-03-STORY-002a-sprint-field-discovery.md (3pt, P0)
4. EPIC-03-STORY-002b-sprint-converter.md (5pt, P0)
5. EPIC-03-STORY-004-multi-value-time-tracking.md (5pt, P0)
6. EPIC-03-STORY-005-sprint-board-lookup.md (5pt, P0)
7. EPIC-03-STORY-007-integration-tests.md (10pt, P0)
8. EPIC-03-STORY-008-demo-documentation.md (3pt, P1)

🔗 Dependencies validated:
- All stories depend on Epic 1 infrastructure ✅
- E3-S02b depends on E3-S09 (within epic)
- E3-S04 depends on E3-S01 (within epic)
- E3-S07 depends on all feature stories (within epic)

Ready for your review. Please review each story file and provide feedback.
```

### User Review Process

**User reads each story file:**
```bash
# Open all story files
code docs/stories/EPIC-03-*.md
```

**User checks for:**
1. Is user story clear? (As a / I want / So that)
2. Are acceptance criteria testable?
3. Is story sized appropriately?
4. Are dependencies correct?
5. Is implementation guidance sufficient?
6. Are there gaps or missing stories?

---

## Step 2: Collect Feedback

### Feedback Categories

**User provides feedback in these categories:**

#### 1. Story Too Large

**Example:**
```
User: "E3-S07 (Integration Tests - 10 points) feels too large.
       Split into:
       - E3-S07a: Time Tracking Integration Tests (5pt)
       - E3-S07b: Sprint Field Integration Tests (5pt)"
```

**Agent action:**
1. Create E3-S07a and E3-S07b files
2. Split ACs between them
3. Delete E3-S07
4. Update backlog
5. Show user for re-review

#### 2. Missing Acceptance Criteria

**Example:**
```
User: "E3-S02b (Sprint Converter) is missing an AC about handling inactive sprints.
       Add AC5: Handle Inactive/Closed Sprints
       - Validate sprint is active before assignment
       - Throw ValidationError if sprint closed
       - Provide clear error message with active sprint names"
```

**Agent action:**
1. Open E3-S02b file
2. Add AC5 with checkboxes as specified
3. Update evidence placeholder
4. Save and commit
5. Confirm with user

#### 3. Incorrect Dependencies

**Example:**
```
User: "E3-S04 (Multi-Value Time Tracking) shouldn't depend on E3-S01.
       It's actually independent - just uses base number converter from E2-S01."
```

**Agent action:**
1. Update E3-S04 dependencies section
2. Remove E3-S01 from dependencies
3. Ensure E2-S01 is listed
4. Update backlog if order needs changing
5. Commit change

#### 4. Missing Story

**Example:**
```
User: "We need a story for error handling when sprint board is inaccessible.
       Add E3-S10: Sprint Error Handling (3pt, P1)
       - Handle board not found errors
       - Handle permission errors
       - Provide fallback behavior"
```

**Agent action:**
1. Create E3-S10 file from template
2. Fill in with user's guidance
3. Add to backlog
4. Update epic point total (49 → 52)
5. Show user for approval

#### 5. Story Not Needed

**Example:**
```
User: "E3-S05 (Sprint Board Lookup) is actually covered by E3-S02b.
       Delete E3-S05, reduce epic to 44 points."
```

**Agent action:**
1. Delete E3-S05 file
2. Update backlog (remove story, update points)
3. Check if other stories depended on E3-S05
4. Update any affected dependencies
5. Commit changes

#### 6. Priority Adjustment

**Example:**
```
User: "E3-S08 (Demo & Documentation) should be P0, not P1.
       We need demos for every epic."
```

**Agent action:**
1. Update E3-S08 header: P1 → P0
2. Update backlog priority column
3. Commit change
4. Acknowledge

---

## Step 3: Iterative Adjustment

### Adjustment Loop

**Process:**
1. User provides feedback (see categories above)
2. Agent makes changes to story files
3. Agent commits changes
4. User reviews adjusted stories
5. **Repeat until user approves**

**Example iteration:**
```
Iteration 1:
User: "E3-S07 too large, E3-S04 wrong dependency, add E3-S10"
Agent: "Changes made. Re-review?"

Iteration 2:
User: "Good. But E3-S10 needs more detail on error messages"
Agent: "Added AC3 for specific error message formats. Re-review?"

Iteration 3:
User: "Approved. All stories ready."
```

### Track Changes

**Agent maintains changelog during review:**
```markdown
Epic 3 Story Review - Changes Made:

Round 1:
- Split E3-S07 → E3-S07a (5pt) + E3-S07b (5pt)
- Updated E3-S04 dependencies (removed E3-S01)
- Added E3-S10 (3pt) for sprint error handling

Round 2:
- Enhanced E3-S10 AC3 (error message formats)
- Increased E3-S02b from 5pt → 8pt (added inactive sprint handling)

Final Story Count: 9 stories, 55 points (was 8 stories, 49 points)
```

---

## Step 4: Final Validation

### User Approval Checklist

**Before final approval, user confirms:**

- [ ] **Every story has clear user value** (not just "implement X")
- [ ] **All ACs are testable** (can write tests to prove them)
- [ ] **Sizing feels right** (LLM can implement each in one session)
- [ ] **Dependencies are correct** (no circular deps, logical order)
- [ ] **No missing stories** (epic is complete)
- [ ] **Implementation guidance is sufficient** (agent knows what to build)
- [ ] **Testing prerequisites are documented** (agent knows what's needed)
- [ ] **Epic delivers promised value** (all acceptance criteria from Phase 2 covered)

### Agent Validation

**Agent verifies technical aspects:**

```bash
# Check all story files exist
ls docs/stories/EPIC-03-STORY-*.md | wc -l
# Should match story count

# Verify no template placeholders remain
grep -r "{" docs/stories/EPIC-03-*.md
# Should show no {PLACEHOLDER} text

# Check backlog links work
cat docs/backlog.md | grep "EPIC-03"
# All links should resolve

# Validate workflow validator will pass
npm run validate:workflow
# Should show no errors for new stories
```

---

## Step 5: Update Epic Status

### Mark Epic Ready for Development

**Once user approves all stories:**

**File**: [`docs/backlog.md`](../../backlog.md)

**Update epic status:**
```markdown
# Before
| **Epic 3** | Complex Field Types | 🔄 Refining | 8 (47 pts) | MEDIUM | Epic 2 ✅ |

# After
| **Epic 3** | Complex Field Types | ⏳ In Progress | 9 (55 pts) | MEDIUM | Epic 2 ✅ |
```

**Update story table with final counts:**
```markdown
### Stories

| ID | Story | Size | Priority | Status |
|----|-------|------|----------|--------|
| E3-S01 | [Time Tracking Fields](stories/EPIC-03-STORY-001-time-tracking-fields.md) | M (5) | P0 | 📋 Ready |
| E3-S09 | [Sprint Lookup Cache](stories/EPIC-03-STORY-009-sprint-lookup-cache.md) | M (5) | P0 | 📋 Ready |
...

**Total Story Points**: 55 points (updated from 47)
**Status**: ⏳ In Progress - Ready for Development
```

### Commit Final Changes

```bash
git add docs/backlog.md docs/stories/EPIC-03-*.md
git commit -m "Epic 3: All stories reviewed and approved - ready for development (9 stories, 55 points)"
git push
```

---

## Step 6: Handoff to Development

### Agent Announcement

**Format:**
```
✅ Epic 3 Planning Complete

📊 Final Summary:
- Epic: Complex Field Types
- Stories: 9 stories, 55 points
- Ready for development: All stories 📋 Ready

📋 Story Breakdown:
- P0 Critical: 8 stories (52 points)
- P1 High: 1 story (3 points)

🔗 First Story to Implement:
E3-S01: Time Tracking Fields (5 points, P0)
Dependencies: E2-S01 ✅ Done

📖 Development Process:
Agents should follow docs/workflow/1-planning.md for each story.

🎯 Epic Goal:
Support advanced JIRA field types (time tracking, sprints) with efficient caching

Ready to begin development?
```

### User Confirms Handoff

**User says:**
```
User: "Yes, begin development. Start with E3-S01."
```

**Or:**
```
User: "Wait, one more adjustment before we start..."
```
→ Make adjustment, re-confirm

---

## Completion Checklist

Before marking planning complete:

- [ ] User reviewed all story files
- [ ] Agent adjusted stories based on feedback
- [ ] No placeholders remain in any story file
- [ ] All stories have 5-9 testable acceptance criteria
- [ ] Dependencies validated and correct
- [ ] Sizing appropriate (no stories >10 points)
- [ ] Missing stories added, unnecessary stories removed
- [ ] User gave explicit final approval
- [ ] Backlog updated with final story count and points
- [ ] Epic status changed to "⏳ In Progress"
- [ ] All changes committed and pushed
- [ ] Ready for development workflow

---

## Common Issues

### Issue: User keeps finding more issues

**Symptom**: 5+ rounds of feedback, stories still need changes

**Fix**:
1. This is normal! Better to catch issues now than during development
2. Be patient, make all requested changes
3. If fundamental issue, may need to return to Phase 2 (refinement)

### Issue: User wants to add many new stories

**Symptom**: Epic grows from 8 stories to 15 stories during review

**Fix**:
1. This suggests Phase 2 (refinement) was incomplete
2. Ask user: "Should we split this into two epics?"
3. If yes, create Epic 3a and Epic 3b
4. If no, adjust timeline expectations (epic now 2x larger)

### Issue: Story dependencies create circular loop

**Symptom**: E3-S02 depends on E3-S05, E3-S05 depends on E3-S02

**Fix**:
1. Identify shared infrastructure both need
2. Extract to new story (e.g., E3-S10: Sprint Cache)
3. Both stories now depend on E3-S10
4. Update backlog ordering

### Issue: User says "this feels overwhelming"

**Symptom**: Epic has too many stories (>12)

**Fix**:
1. Validate with user: "Should we split into two epics?"
2. Group related stories into Epic 3a and Epic 3b
3. Epic 3a: Core features (must-have)
4. Epic 3b: Advanced features (nice-to-have)
5. Re-run planning workflow for Epic 3b later

---

## Phase 4 Complete

**✅ When user approves all stories, you MUST say:**

> "✅ Finished with Planning Phase 4: Story Review. Epic X has [N] stories ([Y] points) approved and ready for development. First story is [EX-SYY]. Ready to begin development workflow."

**This confirms:**
- ✅ User reviewed all story files
- ✅ Agent adjusted based on feedback
- ✅ User gave final approval
- ✅ Backlog updated with final details
- ✅ Epic status changed to "⏳ In Progress"
- ✅ All changes committed
- ✅ Ready for agents to implement stories

**Next**: Begin [Development Workflow](../1-planning.md) for first story

---

## Transition to Development

### From Planning to Development

**Planning workflow complete**, now agents implement stories using:

1. **[Phase 1: Planning](../1-planning.md)** - Read story, understand ACs
2. **[Phase 2: Implementation](../2-implementation.md)** - Write tests + code
3. **[Phase 3: Validation](../3-validation.md)** - Run tests, validate coverage
4. **[Phase 4: Review](../4-review.md)** - Demo, docs, mark Done

**Repeat for each story until epic complete.**

---

## See Also

- **[Planning Workflow Overview](README.md)** - Full planning process
- **[Phase 3: Story Creation](3-story-creation.md)** - Previous phase
- **[Development Workflow](../README.md)** - How to implement approved stories
- **[Backlog](../../backlog.md)** - Track story progress
- **[Story Template](../../stories/_TEMPLATE.md)** - Template reference

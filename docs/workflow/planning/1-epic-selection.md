# Phase 1: Epic Selection

**Goal**: Choose the next epic from the backlog and verify it's ready for refinement.

**When**: After previous epic is complete and archived.

**Duration**: 5-10 minutes

**Output**: Epic selected and approved by user for refinement.

---

## Prerequisites

Before selecting an epic:

- ✅ Previous epic is **complete** (all stories ✅ Done)
- ✅ Previous epic is **archived** (`npm run archive:epic -- epic-XX`)
- ✅ [`docs/backlog.md`](../../backlog.md) is up to date

**Check previous epic status:**
```bash
# View recent epic status
cat docs/backlog.md | head -30

# Check if Epic X is archived
ls docs/archive/
```

---

## Step 1: Identify Next Epic

### Read Backlog

```bash
cat docs/backlog.md
```

**Look for:**
1. Epic with status "📋 Ready" or "📋 Planned"
2. Epic dependencies are met (all dependency epics ✅ Complete or 📁 Archived)
3. Epic has high/medium priority

### Example Epic Summary

```markdown
| Epic | Name | Status | Stories | Value | Dependencies |
|------|------|--------|---------|-------|--------------|
| **Epic 1** | Basic Issue Creation | 📁 Archived | 13 (63/63) | HIGH | None |
| **Epic 2** | Core Field Types | 📁 Archived | 12 (57/57) | HIGH | Epic 1 ✅ |
| **Epic 3** | Complex Field Types | 📋 Ready | 8 (47 pts) | MEDIUM | Epic 2 ✅ |  ← NEXT
| **Epic 4** | Bulk Operations | 📋 Planned | 8 (36 pts) | HIGH | Epic 2 ✅ |
```

**Epic 3 is next** because:
- Status is "📋 Ready"
- Dependency (Epic 2) is archived ✅
- Next in logical sequence

---

## Step 2: Validate Epic Readiness

### Check Dependencies

For the selected epic, verify all dependencies are complete:

```bash
# Example: Epic 3 depends on Epic 2
grep "Epic 2" docs/backlog.md | head -5
# Should show: Epic 2 | ... | 📁 Archived ...
```

**If dependencies not met:**
- ❌ Epic is **blocked**
- Select a different epic with met dependencies
- Update backlog to mark epic as 🚫 Blocked

### Check Epic Definition

Read the epic section in [`docs/backlog.md`](../../backlog.md):

**Must have:**
- ✅ Clear goal statement
- ✅ User value description
- ✅ Acceptance criteria list
- ✅ High-level story outline (even if placeholder)
- ✅ Architecture component references

**Example (Epic 3):**
```markdown
## Epic 3: Complex Field Types

**Goal**: Support advanced JIRA field types (time tracking, sprints, parent/epic links)

**User Value**: Create issues with sprint assignments, time estimates, and epic relationships

**Acceptance Criteria**:
- Support time tracking fields (original estimate, remaining estimate)
- Support sprint field with agile boards
- Support parent/epic link fields
- All converters type-driven (not name-based)
- 95% test coverage

**Stories**: (8 stories, 47 points)
```

**If epic definition incomplete:**
- ⚠️ Flag for user attention
- Ask user: "Epic X definition looks incomplete. Should we flesh it out before refinement?"

---

## Step 3: Propose Epic to User

### Agent Announcement

**Format:**
```
📋 Epic Selection - Phase 1

Previous Epic: Epic 2 (Core Field Types) - Archived 2025-10-20
Next Epic: Epic 3 (Complex Field Types)

Status: 📋 Ready
Dependencies: Epic 2 ✅ Archived
Stories: 8 stories (47 points estimated)
Priority: MEDIUM

Epic Goal: Support advanced JIRA field types (time tracking, sprints, parent/epic links)

Ready to refine Epic 3?
```

### User Responds

**Option 1: Approve**
```
User: "Yes, let's refine Epic 3"
```
→ Proceed to [Phase 2: Epic Refinement](2-epic-refinement.md)

**Option 2: Request Different Epic**
```
User: "Actually, let's do Epic 4 (Bulk Operations) instead - higher priority"
```
→ Return to Step 1, select Epic 4

**Option 3: Request Epic Definition Updates**
```
User: "Epic 3 looks incomplete. Let's add X before refinement"
```
→ Update [`docs/backlog.md`](../../backlog.md), then re-propose

---

## Step 4: Update Backlog Status

Once user approves epic selection:

### Update Epic Status

**File**: [`docs/backlog.md`](../../backlog.md)

**Change:**
```markdown
# Before
| **Epic 3** | Complex Field Types | 📋 Ready | 8 (47 pts) | MEDIUM | Epic 2 ✅ |

# After
| **Epic 3** | Complex Field Types | 🔄 Refining | 8 (47 pts) | MEDIUM | Epic 2 ✅ |
```

**Commit change:**
```bash
git add docs/backlog.md
git commit -m "Epic 3: Mark as 'Refining' for planning workflow"
git push
```

---

## Validation Checklist

Before proceeding to Phase 2, verify:

- [ ] Previous epic is archived
- [ ] Next epic identified from backlog
- [ ] Epic dependencies are all met
- [ ] Epic has clear goal and acceptance criteria
- [ ] User approved epic selection
- [ ] Backlog updated to "🔄 Refining" status

---

## Common Issues

### Issue: No epics with "📋 Ready" status

**Symptom**: All epics are either complete, blocked, or future

**Fix**: 
1. Check if any "📋 Planned" epics have met dependencies
2. If yes, change status to "📋 Ready"
3. If no, ask user: "No ready epics found. Should we unblock Epic X?"

### Issue: Multiple epics ready

**Symptom**: Epic 3 and Epic 4 both show "📋 Ready"

**Fix**:
1. Propose both options to user with priority comparison
2. User selects which to do first
3. Mark selected as "🔄 Refining", leave other as "📋 Ready"

### Issue: Epic definition too vague

**Symptom**: Epic has goal but no acceptance criteria or story outline

**Fix**:
1. Flag to user: "Epic X definition needs more detail before refinement"
2. Collaborate with user to flesh out epic in backlog
3. Once complete, re-run Phase 1

---

## Phase 1 Complete

**✅ When you've selected and validated an epic, you MUST say:**

> "✅ Finished with Planning Phase 1: Epic Selection. Epic X is approved for refinement. Ready for Planning Phase 2: Epic Refinement."

**This confirms:**
- ✅ Epic selected from backlog
- ✅ Dependencies verified
- ✅ User approved selection
- ✅ Backlog updated
- ✅ Ready to refine epic with user

**Next**: Proceed to [Phase 2: Epic Refinement](2-epic-refinement.md)

---

## See Also

- **[Planning Workflow Overview](README.md)** - Full planning process
- **[Backlog](../../backlog.md)** - All epics and stories
- **[Phase 2: Epic Refinement](2-epic-refinement.md)** - Next phase

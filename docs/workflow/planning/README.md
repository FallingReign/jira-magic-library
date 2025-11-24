# Planning Workflow

**Purpose**: Document the process for taking an epic from the backlog, refining it with the user, and creating detailed user stories ready for development.

**When to use**: Before starting work on a new epic, after the previous epic is complete and archived.

---

## Overview

The Planning Workflow is a **collaborative process** between user and agent to ensure each epic:
- ✅ Still aligns with product vision and goals
- ✅ Incorporates learnings from previous epics
- ✅ Has clear, actionable user stories
- ✅ Is ready for development agents to implement

**This happens BEFORE the Development Workflow.** Once stories are approved, development agents use the [Development Workflow](../README.md) to implement them.

---

## The 4 Planning Phases

| Phase | File | Who Leads | Duration | Output |
|-------|------|-----------|----------|--------|
| **1. Epic Selection** | [1-epic-selection.md](1-epic-selection.md) | Agent | 5 min | Epic chosen from backlog |
| **2. Epic Refinement** | [2-epic-refinement.md](2-epic-refinement.md) | User | 30-60 min | Epic updated and approved |
| **3. Story Creation** | [3-story-creation.md](3-story-creation.md) | Agent | 1-2 hours | All story files created |
| **4. Story Review** | [4-story-review.md](4-story-review.md) | User | 30-60 min | Stories approved for dev |

**Total time**: 2-4 hours (mostly user-led discussion and review)

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PLANNING WORKFLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase 1: Epic Selection                                    │
│  ├─ Check backlog for next epic                            │
│  ├─ Verify dependencies met                                │
│  └─ User approves epic to refine                           │
│                                                             │
│  Phase 2: Epic Refinement (COLLABORATIVE)                   │
│  ├─ Review learnings from previous epic                    │
│  ├─ Validate goals still align with vision                 │
│  ├─ Update epic definition in backlog.md                   │
│  └─ User approves refined epic                             │
│                                                             │
│  Phase 3: Story Creation                                    │
│  ├─ Create story file for each story in epic               │
│  ├─ Fill in template with ACs, technical notes             │
│  ├─ Size stories (S/M/L)                                   │
│  └─ Map dependencies between stories                       │
│                                                             │
│  Phase 4: Story Review (USER-LED)                           │
│  ├─ User reviews all story files                           │
│  ├─ Agent adjusts based on feedback                        │
│  ├─ User approves stories for development                  │
│  └─ Update backlog.md with story links                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  DEVELOPMENT WORKFLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  For each story:                                            │
│  ├─ Phase 1: Planning (read story, understand ACs)         │
│  ├─ Phase 2: Implementation (write tests + code)           │
│  ├─ Phase 3: Validation (run tests, check coverage)        │
│  └─ Phase 4: Review (demo, docs, mark Done)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
                              ↓
                      Epic Complete
                              ↓
                    Archive Epic (npm run archive:epic)
                              ↓
              Back to Planning Workflow for next epic
```

---

## Key Principles

### User-Led Refinement
**Phase 2 (Epic Refinement)** is collaborative and user-led. The user:
- Decides if epic goals still make sense
- Incorporates learnings from previous work
- Makes strategic decisions about scope
- Approves proceeding to story creation

### Agent-Led Execution
**Phase 3 (Story Creation)** is agent-led. The agent:
- Creates story files from template
- Fills in acceptance criteria
- Maps dependencies
- Prepares stories for user review

### User Approval Gates
The workflow has **two approval checkpoints**:
1. **After Phase 2**: User approves refined epic definition
2. **After Phase 4**: User approves all story files

**No development begins until both approvals complete.**

---

## Who Does What?

| Task | Agent | User |
|------|-------|------|
| Select next epic from backlog | ✅ Propose | ✅ Approve |
| Facilitate epic refinement discussion | ✅ Lead | ✅ Participate |
| Make strategic decisions about scope | ❌ | ✅ Decide |
| Update backlog.md with refinements | ✅ Execute | ✅ Review |
| Create story files from template | ✅ Create | ❌ |
| Fill in acceptance criteria | ✅ Draft | ✅ Review |
| Size stories (S/M/L) | ✅ Propose | ✅ Adjust |
| Map story dependencies | ✅ Create | ✅ Validate |
| Review all stories before dev | ❌ | ✅ Review |
| Adjust stories based on feedback | ✅ Execute | ✅ Guide |
| Approve stories for development | ❌ | ✅ Approve |

---

## Example: Planning Epic 3

**Context**: Epic 2 (Core Field Types) is complete and archived.

**Phase 1: Epic Selection** (5 min)
```
Agent: "Epic 2 is archived. Next epic in backlog is Epic 3: Complex Field Types.
        Dependencies: Epic 2 ✅ Complete.
        Ready to refine Epic 3?"
User:   "Yes, let's refine Epic 3."
```

**Phase 2: Epic Refinement** (45 min)
```
Agent: "Let's review Epic 3 goals. During Epic 2, we learned that lookup caching
        is critical for performance. Should we add a story about optimizing
        multi-value field lookups?"
User:   "Good point. Yes, add E3-S09: Optimize Multi-Value Lookups (5 points).
        Also, I want to defer subtask support to Epic 6 - it's lower priority."
Agent: "Updated backlog.md. Epic 3 now has 9 stories (52 points). Epic 6 now
        includes subtask support. Ready to create stories?"
User:   "Approved. Create stories."
```

**Phase 3: Story Creation** (90 min)
```
Agent: "Creating 9 story files from template...
        - E3-S01: Time Tracking Fields (5 points)
        - E3-S02: Sprint Field Converter (5 points)
        - E3-S03: Parent/Epic Link (5 points)
        ...
        All files created. Ready for your review."
```

**Phase 4: Story Review** (30 min)
```
User:   "E3-S02 looks too large. Split into:
         - E3-S02a: Sprint Field Discovery (3 points)
         - E3-S02b: Sprint Value Conversion (3 points)
        Also, E3-S05 should depend on E3-S03, not E2-S12."
Agent: "Updated. Created E3-S02a and E3-S02b, removed E3-S02. Fixed E3-S05
        dependency. Re-review?"
User:   "Approved. Ready for development."
Agent: "✅ Epic 3 planning complete. 10 stories ready (52 points).
        Updated backlog.md with all story links."
```

---

## Getting Started

**To begin planning a new epic:**

1. Ensure previous epic is archived: `npm run archive:epic -- epic-XX`
2. Start with Phase 1: Read [1-epic-selection.md](1-epic-selection.md)
3. Follow the phases sequentially
4. Complete all approval gates before development

**Agent prompt to start planning:**
```
"I want to plan the next epic. Please follow docs/workflow/planning/1-epic-selection.md"
```

---

## See Also

- **[Development Workflow](../README.md)** - How to implement approved stories
- **[Backlog](../../backlog.md)** - All epics and high-level story outlines
- **[Story Template](../../stories/_TEMPLATE.md)** - Template for creating story files
- **[AGENTS.md](../../../AGENTS.md)** - Overall agent guidance

---

**Remember**: Planning is collaborative. User makes strategic decisions, agent executes tactical tasks.

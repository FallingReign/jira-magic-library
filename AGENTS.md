# AGENTS.md - Development Playbook

**Version**: 2.0  
**Last Updated**: October 9, 2025  
**Project**: JIRA Magic Library  

---

## Purpose

This document provides a **quick reference** for all agents (AI and human) working on this project. For detailed workflow instructions, see the [4-phase workflow guide](docs/workflow/README.md).

---

## 🚀 Two Workflows: Planning and Development

### Planning Workflow (Epic → Stories)

**When to use:** Before development begins, when taking next epic from backlog.

**Purpose:** Collaboratively refine an epic and create detailed story files.

**Process:**
1. Select epic from backlog
2. Refine epic with user (adjust based on learnings)
3. Create story files from template
4. User reviews and approves all stories

**See:** [Planning Workflow Guide](docs/workflow/planning/README.md)

---

### Development Workflow (Story → Implementation)

**When to use:** After stories are approved and ready for implementation.

**Purpose:** Implement a single story with tests, validation, and documentation.

#### The 4 Phases

| Phase | File | When to Use | Duration |
|-------|------|-------------|----------|
| **1. Planning** | [docs/workflow/1-planning.md](docs/workflow/1-planning.md) | Before writing any code | 15 min |
| **2. Implementation** | [docs/workflow/2-implementation.md](docs/workflow/2-implementation.md) | Writing tests + code | 2-8 hours |
| **3. Validation** ⭐ | [docs/workflow/3-validation.md](docs/workflow/3-validation.md) | After code complete, before commit | 30 min |
| **4. Review** | [docs/workflow/4-review.md](docs/workflow/4-review.md) | Final checks + close story | 15 min |

⭐ **Phase 3 is most critical** - agents frequently skip this step!

### Example Usage

```bash
# Human/Agent prompt:
"Implement story E2-S01 following docs/workflow/1-planning.md"

# After planning (agent must say this):
"✅ Finished with Phase 1: Planning. Ready for Phase 2: Implementation."

# After implementation (agent must say this):
"✅ Finished with Phase 2: Implementation. Ready for Phase 3: Validation."

# After validation (agent must say this):
"✅ Finished with Phase 3: Validation. Ready for Phase 4: Review."

# After review (agent must say this):
"✅ Finished with Phase 4: Review. Story E2-S01 is complete and ready for merge."
```

**See [docs/workflow/README.md](docs/workflow/README.md) for full details.**

### 🚨 Critical Rules for Agents

#### 1. ❌ Never Use Bypass Flags

**Forbidden:**
```bash
git commit --no-verify
npm run validate:workflow --skip-coverage
# Any other bypass flag
```

**Why:** Bypasses exist for human emergencies only. Agents must fix root causes, not work around them.

**What to do instead:**
1. Read validation error carefully
2. Ask user: "Validation failed with [error]. Can you help me resolve this?"
3. Wait for user guidance
4. Fix the actual issue
5. Re-validate

#### 2. ❌ Never Self-Approve DoD Exceptions

**Forbidden:**
- "Approved By: Agent (self-approved)"
- "Approved By: Product Owner" (generic)
- "Approved By: User" (not specific)

**Why:** Agents cannot judge when exceptions are legitimate. Only humans can approve deviations from quality standards.

**Required process:**
1. **STOP** when you cannot complete a DoD item
2. **ASK USER**: "I cannot complete [specific item] because [specific reason]. Can you help me resolve this?"
3. **WAIT** for user response - they can often help fix the issue
4. **DOCUMENT** only if user explicitly says "yes, exception approved" with their actual username and timestamp

#### 3. ✅ Always Announce Phase Completion

**Required statements (exact format):**
```
✅ Finished with Phase 1: Planning. Ready for Phase 2: Implementation.
✅ Finished with Phase 2: Implementation. Ready for Phase 3: Validation.
✅ Finished with Phase 3: Validation. Ready for Phase 4: Review.
✅ Finished with Phase 4: Review. Story [EX-SYY] is complete and ready for merge.
```

**Why:** Makes workflow progress trackable and prevents silent failures.

#### 4. 🛡️ When Validation Fails

**Never bypass - follow this process:**

1. **Read output carefully**
2. **Ask user for help**: "Validation failed with [exact error]. Can you help me resolve this?"
3. **Wait for response** - user may provide resources, guidance, or help fix
4. **Fix root cause** - not the validation itself
5. **Re-validate** until clean

---

## Table of Contents

1. [Quick Start for New Agents](#quick-start-for-new-agents)
2. [State Management](#state-management)
3. [File Structure & Conventions](#file-structure--conventions)
4. [Reference Documentation](#reference-documentation)
5. [Git Workflow](#git-workflow)
6. [File Editing Best Practices](#file-editing-best-practices)
7. [Commit Hygiene](#commit-hygiene)
8. [When Validation Fails](#when-validation-fails)
9. [Workflow Validation (CI)](#workflow-validation-ci)
10. [FAQ](#faq)

---

## Quick Start for New Agents

### Before Starting ANY Work

1. **Read the Architecture Document**
   - Location: `/docs/architecture/system-architecture.md`
   - Understand: MVP scope, tech stack, dependencies, design patterns
   - Key decisions: Node.js 18+, native fetch (no axios), Redis caching, PAT auth

2. **Read the Backlog**
   - Location: `/docs/backlog.md`
   - Identify: Which epics are in progress, which stories are available
   - Check: Your story's dependencies are complete

3. **Read Your Story File**
   - Location: `/docs/stories/EPIC-XX-STORY-YYY-name.md`
   - Understand: All acceptance criteria, technical notes, related stories
   - Clarify: Ask questions if anything is ambiguous

### Your First Task

**If stories exist and are ready:**
```bash
# 1. Check backlog status
cat docs/backlog.md | grep "⏳\|📋"

# 2. Find available stories (Ready for Development)
grep -r "📋 Ready for Development" docs/stories/

# 3. Pick a story with no blockers
# 4. Follow the Development Workflow (4 phases above)
```

**If next epic needs planning:**
```bash
# 1. Check which epic is next
cat docs/backlog.md

# 2. Follow the Planning Workflow
# Start with: docs/workflow/planning/1-epic-selection.md

# 3. After all stories approved, they become available for Development Workflow
```

---

## State Management

### Story Status Lifecycle

Stories progress through these states:

| Status | Emoji | Meaning | Location |
|--------|-------|---------|----------|
| **Ready** | 📋 | Dependencies met, ready to start | Story file + Backlog |
| **In Progress** | ⏳ | Someone is actively working on it | Story file + Backlog |
| **Done** | ✅ | All ACs met, tests passing, merged | Story file + Backlog |
| **Blocked** | 🚫 | Waiting on external dependency | Story file + Backlog |

### Where State is Tracked

#### 1. Backlog (`/docs/backlog.md`)
- **Source of truth** for epic and story status
- Updated when starting/completing stories
- Shows points completed per epic

**Format:**
```markdown
### Epic 1: Basic Issue Creation (⏳ In Progress - 25/45 points)

- ✅ [E1-S01: Project Setup](stories/EPIC-01-STORY-001-project-setup.md) - 3 points
- ✅ [E1-S02: Environment Config](stories/EPIC-01-STORY-002-environment-config.md) - 3 points
- ⏳ [E1-S03: PAT Authentication](stories/EPIC-01-STORY-003-pat-authentication.md) - 5 points *(Alice, PR #12)*
- 📋 [E1-S04: Redis Cache](stories/EPIC-01-STORY-004-redis-cache.md) - 5 points
```

#### 2. Story Files (`/docs/stories/*.md`)
- Detailed acceptance criteria with checkboxes
- Status emoji in header
- Implementation notes, assignee, PR links

**Format:**
```markdown
# E1-S03: PAT Authentication

**Epic**: Epic 1 - Basic Issue Creation  
**Size**: Medium (5 points)  
**Priority**: P1  
**Status**: ⏳ In Progress  
**Assignee**: Alice (GitHub Copilot)  
**PR**: #12  
**Started**: 2025-10-01  
**Completed**: -

---

## Acceptance Criteria

### ✅ AC1: Connection Validation
- [x] Implement validateConnection() method
- [x] Test against real JIRA endpoint
- [ ] Handle network errors gracefully
```

#### 3. Git Commits
- Reference story ID in commit messages
- Link commits back to stories

**Format:**
```bash
git commit -m "E1-S03: Implement PAT authentication with retry logic"
```

### Updating State

#### When Starting a Story
1. **Update story file status**: 📋 → ⏳
2. **Update backlog**: Change emoji, add your name
3. **Add metadata to story file**:
   ```markdown
   **Status**: ⏳ In Progress  
   **Assignee**: Your Name  
   **Started**: 2025-10-02
   ```

#### While Working on a Story
1. **Check off ACs as you complete them**: `- [ ]` → `- [x]`
2. **Update story file with implementation notes** (optional but helpful)
3. **Commit regularly** with story ID in message

#### When Completing a Story
1. **Verify all ACs checked**: Every `- [ ]` should be `- [x]`
2. **Update story file status**: ⏳ → ✅
3. **Update backlog**: Change emoji, add PR link, update points
4. **Add completion metadata**:
   ```markdown
   **Status**: ✅ Done  
   **PR**: #12  
   **Completed**: 2025-10-02
   ```
5. **Create PR** with story ID in title
6. **Update Definition of Done checklist** in story file



---

## File Structure & Conventions

### Size Estimation Guide

| Size | Points | Duration | Scope |
|------|--------|----------|-------|
| **Small** | 3 | 2-4 hours | Single class, <200 LOC, simple logic |
| **Medium** | 5 | 4-8 hours | Multiple classes, <500 LOC, moderate complexity |
| **Large** | 8 | 1-2 days | Complex logic, >500 LOC, external integration |

### One Story = One Session

**Golden Rule:** Each story should be **implementable in a single LLM prompt/session** by an agent that has read:
1. Architecture document
2. Story file
3. Related code (dependencies)

**If a story feels too big**, it probably is. Split it.

### Story Dependencies

**Always check "Depends On" section:**
```markdown
## Related Stories

- **Depends On**: E1-S01, E1-S02
- **Blocks**: E1-S05, E1-S06
- **Related**: E2-S03
```

**Rules:**
- Don't start a story until all dependencies are ✅
- If you find a missing dependency, mark story as 🚫 and update backlog
- Circular dependencies = design flaw, escalate to architect

### Vertical Slices

**Epic 1 is a complete vertical slice:**
- Users can install npm package
- Users can configure connection
- Users can create basic JIRA issues
- All infrastructure in place (cache, auth, schema discovery)

**Don't skip stories to "just get the feature working"**. The infrastructure stories exist for a reason.

### Directory Layout

```
jira-magic-library/
├── docs/
│   ├── architecture/
│   │   └── system-architecture.md      # Architectural decisions
│   ├── stories/
│   │   ├── EPIC-01-STORY-001-*.md      # Individual story files
│   │   └── ...
│   ├── backlog.md                      # Epic/story status tracking
│   └── testing.md                      # Testing guide (E1-S11)
├── src/
│   ├── config/                         # E1-S02
│   ├── auth/                           # E1-S03
│   ├── cache/                          # E1-S04
│   ├── client/                         # E1-S05
│   ├── schema/                         # E1-S06
│   ├── converters/                     # E1-S08, E2, E3
│   ├── operations/                     # E1-S09, E4, E5
│   ├── errors/                         # E1-S10
│   └── index.ts                        # Public API
├── tests/
│   ├── unit/                           # Fast, mocked tests
│   ├── integration/                    # Real JIRA tests
│   └── fixtures/                       # Test data
├── examples/                           # Usage examples
├── AGENTS.md                           # This file
├── README.md                           # End-state vision
└── package.json
```

### Naming Conventions

**Story Files:**
```
EPIC-{epic:02d}-STORY-{story:03d}-{kebab-case-name}.md

Examples:
- EPIC-01-STORY-001-project-setup.md
- EPIC-01-STORY-003-pat-authentication.md
- EPIC-02-STORY-005-date-field-converter.md
```

**Source Files:**
```typescript
// Classes: PascalCase
export class ConnectionValidator { ... }

// Interfaces: PascalCase with 'I' prefix for internal types
interface IRetryConfig { ... }
export interface JMLConfig { ... }  // Public API, no prefix

// Functions: camelCase
export function loadConfig(): JMLConfig { ... }

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRIES = 3;
const DEFAULT_CACHE_TTL = 900;
```

**Test Files:**
```typescript
// Unit tests: Mirror source structure
src/auth/validator.ts → tests/unit/auth/validator.test.ts

// Integration tests: Feature-based
tests/integration/create-issue.test.ts
tests/integration/field-resolution.test.ts
```

---

## Reference Documentation

For detailed technical guidance, see these reference files:

- **[Architectural Rules](docs/workflow/reference/architectural-rules.md)** - Core principles, technology constraints, design patterns
- **[Testing Standards](docs/workflow/reference/testing-standards.md)** - Test pyramid, coverage requirements, mocking strategy
- **[Demo Standards](docs/workflow/reference/demo-standards.md)** - When to create demos, templates, best practices
- **[Common Pitfalls](docs/workflow/reference/common-pitfalls.md)** - Mistakes to avoid, how to fix them
- **[Demo-App Integration Guide](demo-app/README.md)** - How to add demos to interactive demo application

**These are referenced from the 4-phase workflow files. Read as needed, not required upfront.**

### Critical: Demo-App Architecture

**Before creating any demo**, read [demo-app/README.md](demo-app/README.md#-adding-new-demos).

**Key Points:**
- Demo-app is an **interactive menu-driven application**, not standalone scripts
- Pattern: `features/{name}.js` → export async function → integrate in `index.js` + `prompts.js`
- Always import from `'jira-magic-library'` (never from `src/` or relative paths)
- Use UI helpers: `showHeader`, `info`, `success`, `error`, `showCode`, `pause`
- Scope demos to story boundaries (infrastructure demo ≠ full workflow demo)

---

## Git Workflow

### Branch Strategy

```
main (protected)
  └── example-branch (working branch)
       └── feature/E1-S03-pat-auth (feature branch per story)
```

**Rules:**
- `main` is protected, requires PR + review
- Create feature branch per story
- Branch name format: `feature/E{epic}-S{story}-{short-name}`
- Delete feature branch after merge

### Commit Messages

**Format:**
```
E{epic}-S{story}: {Imperative verb} {what}

Examples:
✅ E1-S03: Implement PAT authentication
✅ E1-S05: Add exponential backoff to HTTP client
✅ E2-S04: Add date field converter with Excel support
❌ Added auth  (missing story ID, past tense)
❌ E1-S03: added some stuff  (vague, past tense)
```

**Commit Often:**
- Commit after each AC completed
- Commit before switching tasks
- Commit before risky refactoring

### Pull Request Process

1. **Create PR** from feature branch to working branch
2. **Fill out PR template** (see Step 9 above)
3. **Ensure CI passes** (tests, linting, coverage)
4. **Self-review** code changes
5. **Request review** from team (if human)
6. **Address feedback**
7. **Merge** (squash commits for cleaner history)
8. **Update story status** to ✅
9. **Delete feature branch**

### Epic Archiving

**When epic complete** (all stories ✅ Done, epic validation story complete):

```bash
# Archive completed epic to keep workspace clean
npm run archive:epic -- epic-01

# Follow the commit instructions shown
git add docs/archive/ docs/backlog.md
git commit -m "Archive Epic 1: Move completed stories to archive"
git push
```

**What archiving does:**
- 📁 Moves all `EPIC-XX-STORY-*.md` files to `docs/archive/epic-XX/`
- 📊 Creates `EPIC-SUMMARY.md` with completion metrics
- 🔗 Updates backlog.md to reference archive location
- ✅ Keeps active workspace clean for next epic

**Archive structure:**
```
docs/
  stories/           # Active work only
    EPIC-02-STORY-*.md
  archive/           # Completed epics
    epic-01/
      EPIC-01-STORY-*.md
      EPIC-SUMMARY.md
```

**Why archive (not delete):**
- Preserve evidence for audits
- Keep implementation decisions for reference
- Enable pattern reuse in future epics
- Maintain historical context

---

## File Editing Best Practices

### The Golden Rules

1. **Always read the file first**
   ```bash
   cat docs/stories/EPIC-01-STORY-004-redis-cache.md
   ```
   Don't trust your memory. See the actual content.

2. **Use 5+ lines of context when editing**
   ```markdown
   ❌ Bad (2 lines context):
   **Status**: 📋 Ready
   
   ✅ Good (5+ lines context):
   **Epic**: Epic 1 - Basic Issue Creation  
   **Size**: Medium (5 points)  
   **Priority**: P1  
   **Status**: 📋 Ready for Development  
   **Assignee**: -
   ```

3. **Preserve exact formatting**
   - Markdown emoji: Use actual emoji characters (📋, not `:clipboard:`)
   - Spacing: Keep blank lines and indentation exact
   - Headers: Keep `##` vs `###` levels consistent

4. **Verify after editing**
   ```bash
   # After editing story file
   cat docs/stories/EPIC-01-STORY-004-redis-cache.md | head -20
   
   # Check for corruption
   grep "Status" docs/stories/EPIC-01-STORY-004-redis-cache.md
   # Should show ONE line, not duplicates
   ```

### Common File Corruption Mistakes

#### ❌ Mistake: Duplicate Text
```markdown
**Status**: 📋 Ready for Development**Status**: ⏳ In Progress
```

**Fix:**
1. Read file first to see exact format
2. Find EXACT line to replace (use 5+ lines context)
3. Replace entire line, not append

#### ❌ Mistake: Garbled Emojis
```markdown
**Status**: ⏳ In Progress
```

**Fix:**
1. Copy emoji from existing file
2. Or use emoji picker (not markdown codes)
3. Test in preview before committing

#### ❌ Mistake: Lost Context
```markdown
# Changed this:
**Status**: 📋 Ready

# Into this (missing surrounding lines):
**Status**: ⏳ In Progress
```

**Fix:** Always use 5+ lines context to preserve surrounding content

### File Corruption Recovery

**If you corrupt a file:**
```bash
# 1. Discard changes
git checkout -- docs/stories/EPIC-01-STORY-004-redis-cache.md

# 2. Re-read file
cat docs/stories/EPIC-01-STORY-004-redis-cache.md

# 3. Try again with MORE context (5+ lines)
```

---

## Commit Hygiene

### Local Commits vs Clean History

**Problem:** "Commit often" leads to messy history.

**Solution:** Different workflows for different contexts.

#### Workflow A: Direct Commits (Recommended for Solo/Fast Iteration)

**When to use:** Working alone, rapid iteration, simple changes

```bash
# Just commit directly with clean messages
git add .
git commit -m "E1-S04: Implement Redis cache with graceful degradation"
git push origin example-branch
```

**Pros:** Fast, simple, no overhead  
**Cons:** Can't squash mistakes

#### Workflow B: WIP Commits + Squash (For Complex Stories)

**When to use:** Complex story, experimental work, multiple attempts

```bash
# During development: commit frequently
git commit -m "wip: add redis client"
git commit -m "wip: add tests"
git commit -m "wip: fix coverage"
git commit -m "fix: header corruption"
git commit -m "fix: backlog format"

# Before pushing: squash into one clean commit
git rebase -i HEAD~5
# Pick first, squash others
# Edit message: "E1-S04: Implement Redis cache with graceful degradation"

git push origin example-branch
```

**Pros:** Clean history, can fix mistakes  
**Cons:** More complex, need to understand rebase

### When to Commit

**Commit locally when:**
- AC completed (even if tests failing)
- About to try risky refactor
- End of work session
- Before switching tasks

**Squash before push when:**
- Using Workflow B
- >3 commits for one story
- Commit messages say "wip", "oops", "fix typo"

### Tools

**Interactive Rebase (Squashing):**
```bash
git rebase -i HEAD~5

# Editor opens:
pick abc123 wip: add redis client
squash def456 wip: add tests
squash ghi789 wip: fix coverage
squash jkl012 fix: header
squash mno345 fix: backlog

# Save → Git combines into one commit
# Edit message: "E1-S04: Implement Redis cache with graceful degradation"
```

**Amend Last Commit (Quick Fix):**
```bash
# Made a typo in last commit
git add file.ts
git commit --amend --no-edit  # Adds to last commit
```

---

## When Validation Fails

### 🚨 CRITICAL: Never Bypass Validation

**❌ FORBIDDEN Actions:**
- Using `--no-verify` flag on commits
- Using `--skip-coverage` or similar bypass flags
- Self-approving DoD exceptions without user confirmation
- Marking DoD items complete without actually doing them
- Working around validation instead of fixing root cause

**✅ REQUIRED Actions:**
1. Read validation output carefully
2. Ask user: "Validation failed with [specific error]. Can you help me resolve this?"
3. Wait for user response - user can often help fix the issue
4. Fix the root cause (not the validation)
5. Re-validate until clean

### The Validation Failure Workflow

**Validation failed? Follow this process:**

```
npm run validate:workflow
❌ 3 errors, 1 warning

Step 1: Read output carefully
Step 2: ASK USER FOR HELP - "Validation failed with [error]. Can you help?"
Step 3: Wait for user guidance
Step 4: Fix implementation (not just validation)
Step 5: Re-validate
Step 6: Repeat until clean
```

**User is here to assist you - use them!** They can:
- Provide missing resources (test data, credentials, field IDs)
- Approve legitimate DoD exceptions
- Help debug complex validation failures
- Guide architectural decisions

### Example: Unchecked ACs

**Output:**
```bash
❌ EPIC-01-STORY-004-redis-cache.md: 
   Story marked "Done" has 5 unchecked acceptance criteria
```

**Root Cause Investigation:**
```bash
# 1. Read story file
cat docs/stories/EPIC-01-STORY-004-redis-cache.md

# 2. Check implementation
grep -n "graceful" src/cache/manager.ts
# No results → AC not implemented!
```

**Fix Process:**
1. **Don't just check boxes** ← This is the mistake!
2. **Implement missing features** (see AC Verification section)
3. **Write tests**
4. **Verify code implements AC**
5. **NOW check the boxes**
6. **Re-run validation**

### Example: Status Inconsistency

**Output:**
```bash
❌ Status mismatch for E1-S04
   - Story file: ⏳ In Progress
   - Backlog: ✅ Done
```

**Fix:**
```bash
# Determine which is correct
# Update the wrong one to match
# Re-validate
```

### Definition of Done (DoD) Exceptions

**⚠️ CRITICAL: DoD exceptions require explicit user approval**

**When you cannot complete a DoD item:**

1. **STOP** - Do not mark story Done
2. **ASK USER** - "I cannot complete [DoD item] because [reason]. Can you help me resolve this?"
3. **WAIT** - User will either:
   - Help you fix the issue (preferred)
   - Provide resources you need
   - Explicitly approve an exception
4. **DOCUMENT** - Only if user approves, add exception section with:
   - User's actual username (not "User" or "Product Owner")
   - Exact timestamp of approval
   - Clear justification
5. **NEVER SELF-APPROVE** - Agents cannot approve their own exceptions

**Example User Approval:**
```
User: "Yes, exception approved. We don't need a demo for this infrastructure story."
```

**Then you document:**
```markdown
## Definition of Done Exceptions

**User Approval**: JohnDoe explicitly approved this exception on 2025-10-17 15:23 UTC
**Chat Reference**: Message in conversation at 3:23 PM
```

**See**: [DoD Exceptions Reference](docs/workflow/reference/dod-exceptions.md)

### Common Validation Errors

| Error | Root Cause | Fix |
|-------|-----------|-----|
| Unchecked ACs | Feature not implemented | Implement feature, then check |
| Status mismatch | Forgot to update both files | Update story + backlog |
| Template placeholders | Copy/pasted template | Replace with actual values |
| Missing dependencies | Started too early | Wait or mark blocked |
| Coverage <95% | Tests incomplete | Write missing tests (or ask user for exception) |
| DoD item incomplete | Skipped required step | Complete the step (or ask user for exception) |

### Chicken-and-Egg: PR Links

**Problem:** Validator wants PR link, but can't get PR until you commit.

**Solution:** PR/commit links are **warnings, not errors**.

**Workflow:**
```bash
# 1. Mark story Done (without PR link yet)
**Status**: ✅ Done
**PR**: -
**Completed**: 2025-10-03

# 2. Run validator
npm run validate:workflow
⚠️  WARNING: Story should have PR/commit link (can be added after commit)
✅ Validation complete with warnings

# 3. Commit (warnings don't block)
git commit -m "E1-S04: Complete Redis cache"
git push

# 4. Add commit hash in follow-up
**PR**: Commit abc123d

git commit -m "E1-S04: Add commit reference to story"
git push
```

### Pre-Commit Hook (Recommended)

**Catch issues before committing, not after pushing to CI.**

#### Install (One-Time Setup)

```bash
npm run install:hooks
```

This installs a pre-commit hook that:
- ✅ Runs validation automatically before each commit
- ✅ Only runs if story/backlog files changed (fast!)
- ✅ Shows issues but lets you choose to continue or abort
- ✅ Takes ~1 second to run

#### What It Does

**When you commit story/backlog changes:**
```bash
git commit -m "E1-S07: Update story status"

🔍 Running workflow validation...

Changed story/backlog files:
  - docs/backlog.md
  - docs/stories/EPIC-01-STORY-007-field-resolution.md

✅ Validation passed!

[example-branch abc123d] E1-S07: Update story status
```

**If validation fails:**
```bash
❌ EPIC-01-STORY-007-field-resolution.md: 
   Story marked "Done" has 3 unchecked acceptance criteria

⚠️  Validation found issues (see above)

Options:
  1. Fix issues now (recommended) - Ctrl+C to abort, fix, then commit again
  2. Commit anyway - Issues will be caught by CI

Continue with commit? [y/N] _
```

**Benefits:**
- 🚀 **Faster feedback** - Catch issues in 1 second, not 30 seconds after push
- 🛡️ **Block bad commits** - Choose to abort if validation fails
- 📊 **Smart filtering** - Only runs when story files change
- 🤖 **Agent-friendly** - Clear prompts, easy to understand

**This catches issues BEFORE they hit CI, saving time and preventing bad commits.**

---

## FAQ

### Q: What if a story is blocked?

**A:** 
1. Mark story as 🚫 Blocked in story file + backlog
2. Document blocker: `**Blocked By**: Waiting for API keys from DevOps`
3. Pick another story
4. Notify team (comment in GitHub issue, Slack, etc.)

---

### Q: What if I find a bug in a completed story?

**A:**
1. Create a bug report (GitHub issue)
2. Reference original story: `Bug in E1-S03: PAT validation fails for expired tokens`
3. If critical, mark original story as ⏳ and reopen
4. If minor, create new story in backlog
5. Fix with same process (branch, tests, PR)

---

### Q: What if requirements are unclear?

**A:**
1. **Don't guess.** Ask for clarification.
2. Comment on story file (GitHub issue)
3. Tag architect or product owner
4. Mark story as 🚫 Blocked until clarified
5. Pick another story while waiting

---

### Q: Can I work on multiple stories at once?

**A:**
- **Humans**: Yes, but finish one before starting another
- **AI Agents**: No, one story per session
- **Reason**: Each story is sized for one session/prompt

---

### Q: What if a story is too big?

**A:**
1. Flag it: "This story is too large for one session"
2. Propose split: "E2-S05 should be split into E2-S05a (parsing) and E2-S05b (conversion)"
3. Update backlog with split stories
4. Get approval before implementing

---

### Q: What if I need to deviate from architecture?

**A:**
1. **Don't** deviate without discussion
2. Document proposed change + rationale
3. Update architecture doc (create PR)
4. Get approval from architect
5. Update affected stories
6. Then implement

---

### Q: How do I know if my tests are good enough?

**Checklist:**
- [ ] Coverage ≥95%
- [ ] All happy paths tested
- [ ] All error paths tested
- [ ] Edge cases covered (null, undefined, empty, max values)
- [ ] Integration test for critical path (if applicable)
- [ ] Tests are readable (clear arrange/act/assert)
- [ ] Tests are fast (<100ms per unit test)

---

### Q: What's the difference between README.md and architecture doc?

**README.md:**
- End-state vision
- Shows both Node.js AND Python (future)
- Shows both Cloud API AND Server API (MVP is Server only)
- Marketing/user-facing

**Architecture Doc:**
- MVP implementation plan
- Node.js only, Server API only (for now)
- Technical decisions + rationale
- Developer-facing

**Both are correct, different purposes.**

---

### Q: Can I use ChatGPT/Copilot/Claude to implement stories?

**A:** Yes! Each story is sized to be "LLM-implementable in one prompt". 

**Prompt Template:**
```
I'm implementing story E1-S03 for the JIRA Magic Library.

Context:
- Architecture: [paste relevant sections]
- Story: [paste story file]
- Dependencies: [paste related code]

Please implement this story following TDD:
1. Write tests first
2. Implement code to pass tests
3. Ensure 95% coverage
4. Follow architectural constraints (native fetch, no axios, etc.)
```

---

## Changelog

### Version 2.0 (October 9, 2025)
- **Restructured into 4-phase workflow** (planning, implementation, validation, review)
- **Extracted detailed steps** to `docs/workflow/` files for checkpoint-based prompting
- **Emphasized Phase 3 (Validation)** as most critical (agents frequently skip this)
- **Reduced main file size** from 1,493 to ~650 lines (57% reduction)
- **Created 4 reference files** to eliminate redundancy:
  - `docs/workflow/reference/architectural-rules.md` - Core principles, design patterns
  - `docs/workflow/reference/testing-standards.md` - Test pyramid, coverage requirements
  - `docs/workflow/reference/demo-standards.md` - Demo creation guidelines
  - `docs/workflow/reference/common-pitfalls.md` - Mistakes to avoid
- **Removed duplicate content** - All detailed guidance now in phase/reference files
- **Single source of truth** - No more conflicting information between files
- **Added workflow guide** at `docs/workflow/README.md`
- Created phase-specific files: `1-planning.md`, `2-implementation.md`, `3-validation.md`, `4-review.md`

### Version 1.0 (October 2, 2025)
- Initial version
- Defined state management with emojis
- Documented development workflow
- Established architectural rules
- Created testing strategy
- Defined git workflow

---

## Workflow Validation (CI)

The project includes an automated validation script (`scripts/validate-workflow.js`) that runs in CI to enforce all workflow rules defined in this document.

**Run locally before committing:**
```bash
npm run validate:workflow
```

**What it validates:**
- Story file format (all required sections present)
- Status consistency between backlog.md and story files
- Status rules (In Progress = has assignee, Done = all ACs checked)
- Dependencies met before starting work
- File naming conventions
- User Story format (As a... I want... So that...)
- Template placeholders replaced
- Definition of Done complete for Done stories

**Exit codes:** `0` = pass, `1` = fail (blocks PR merge)

**CI runs automatically** on push/PR via `.github/workflows/validate.yml`

---

## Contact

**Questions?** Comment on GitHub issue or update this document via PR.

**Found a gap?** This is a living document. Propose changes via PR.

---

*Remember: This playbook exists to help you succeed. If something isn't working, let's improve it together.* 🚀

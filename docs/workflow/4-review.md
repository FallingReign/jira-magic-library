# Phase 4: Review & Completion

**Goal**: Finalize documentation, create demo (if needed), and mark story Done.

**When**: After validation complete (Phase 3 done)

**Duration**: 15-30 minutes

**Output**: Story marked ✅ Done, all documentation updated

---

## Overview

Review phase ensures:
- ✅ Documentation updated (TSDoc, API docs)
- ✅ Demo created (if user-facing feature)
- ✅ Work committed (PR or direct)
- ✅ Status updated (⏳ → ✅ Done)

**Don't skip this!** Incomplete documentation causes confusion later.

---

## Step 7: Update Documentation

### TSDoc Comments (Required for Public APIs)

**What to document**:
- Public functions
- Public classes
- Exported interfaces
- Complex internal functions

**Template**:
```typescript
/**
 * Converts numeric values for fields with type: "number"
 * 
 * Accepts numbers or numeric strings, validates format, and preserves
 * integer vs float distinction.
 * 
 * @param value - User input (number, string, null, or undefined)
 * @param fieldSchema - JIRA field schema from createmeta
 * @param context - Conversion context (registry, projectKey, etc.)
 * @returns Parsed number value or null/undefined if optional
 * @throws {ValidationError} if value is non-numeric or NaN/Infinity
 * 
 * @example
 * ```typescript
 * // Parse string
 * convertNumberType("5", fieldSchema, context)  // → 5
 * 
 * // Pass through number
 * convertNumberType(3.14, fieldSchema, context)  // → 3.14
 * 
 * // Handle optional
 * convertNumberType(null, fieldSchema, context)  // → null
 * ```
 */
export const convertNumberType: FieldConverter = (value, fieldSchema, context) => {
  // ...
};
```

### API Documentation (If API Changed)

**File**: `docs/api.md` (create if doesn't exist)

**Example entry**:
```markdown
## Field Type Converters

### Number Type

**Type**: `number`

**Converter**: `convertNumberType`

**Input**: Number or numeric string

**Output**: Parsed number (integer or float)

**Example**:
\`\`\`typescript
{
  storyPoints: 5,        // Number → 5
  storyPoints: "5",      // String → 5
  storyPoints: "3.14"    // String → 3.14
}
\`\`\`

**Errors**:
- `ValidationError` if non-numeric string
- `ValidationError` if NaN or Infinity
```

### README Updates (Epic 1-7 Only)

**When**: If story adds user-facing feature to MVP

**Example**: E1-S09 (Create Issue) updates README with usage

**File**: `README.md`

Only update README for major features, not internal changes.

---

## Step 8A: Document Definition of Done Exceptions (If Needed)

### When to Use This Step

**Skip this step if:**
- ✅ All Definition of Done items are checked
- ✅ All acceptance criteria are met
- ✅ No waivers or exceptions needed

**Use this step if:**
- ⚠️ Demo not created (but have comprehensive tests)
- ⚠️ Test coverage <95% (but only for infrastructure code)
- ⚠️ Any other DoD item not completed

### Exception Process

**⚠️ CRITICAL: User Confirmation Required**

**Agents MUST follow this exact process - no shortcuts:**

1. **STOP**: Do not mark story Done or document exception without user approval
2. **Ask User First**: "I cannot complete [specific DoD item] because [reason]. Can you help me resolve this?"
3. **Wait for User Response**: User may help fix the issue, provide resources, or approve exception
4. **If Exception Approved**: Document using template below with explicit user approval timestamp
5. **Never Self-Approve**: Agents cannot approve their own exceptions

**Process**:

1. **Identify blocker** - What specific DoD item cannot be completed?
2. **Request user help** - User is here to assist, they can often resolve blockers
3. **Get explicit approval** - User must say "yes, exception approved" in chat
4. **Document exception** using template below with user name and timestamp
5. **Run validator** to verify exception documented correctly

### Exception Template

**⚠️ Only add this AFTER user explicitly approves exception in chat**

Add this section to story file **before** marking Done:

```markdown
## Definition of Done Exceptions

**Standard DoD**: Demo created showing feature functionality

**Exception Request**: Waive demo requirement for E2-S02

**Justification**: 
- Story has comprehensive unit tests (100% coverage)
- Integration test validates converter with real JIRA
- Demo would only duplicate test scenarios
- No stakeholder requested visual demo

**Alternative Evidence**:
- Unit tests: [DateConverter.test.ts](../../../tests/unit/converters/types/DateConverter.test.ts)
- Integration test output shows Excel serial conversion working
- Test coverage: 100% (statements, branches, functions, lines)

**User Approval**: [Username from chat] explicitly approved this exception on [Date/Time]
**Chat Reference**: [Link to approval message if available]
```

**IMPORTANT**: 
- Replace `[Username from chat]` with actual user who approved
- Replace `[Date/Time]` with timestamp of approval (e.g., "2025-10-17 14:32 UTC")
- Do NOT use generic names like "User" or "Product Owner" - use actual username
- Do NOT self-approve - wait for explicit user confirmation in chat

### Validation

**After documenting exception, run**:

```bash
npm run validate:workflow
```

**Validator checks**:
- ✅ Exception section present
- ✅ All required fields complete
- ✅ Alternative evidence provided
- ✅ Approver documented

**If validation fails**: Fix issues before marking story Done

---

## Step 8: Create Interactive Demo

### Demo Philosophy

**Demos showcase real-world use cases**, not individual converters.

**Two Types of Demos:**

#### 1. **User-Facing Demos** (Main Menu Section)
Demonstrate the **public JML API** that customers will use:
- `jml.issues.create()` - Single and bulk issue creation
- `multi-field-creator.js` - Testing field types with real issue creation
- `hierarchy-demo.js` - Parent/Epic link resolution
- Feature-complete workflows (parse CSV → create issues → get results)

**Principle**: Show APIs that users import from `jira-magic-library` package.

#### 2. **Infrastructure Demos** (Separate Menu Section)
Demonstrate **internal implementation components** for development/testing:
- `manifest-storage-demo.js` - ManifestStorage class (not exported in public API)
- `bulk-api-wrapper-demo.js` - JiraBulkApiWrapper class (not exported in public API)
- `field-reference.js` - JIRA field inspection (developer tool)

**Principle**: Show internal classes/utilities, not the final user experience.

**Why Separate?**
- **Clarity**: Users see only what they'll actually use
- **Focus**: User-facing demos showcase complete workflows
- **Development**: Infrastructure demos help debug/test components

**Example**: E4-S04 extends `bulk-import.js` (parsing demo) to create issues via `jml.issues.create()` → **User-Facing**. But `manifest-storage-demo.js` tests ManifestStorage class directly → **Infrastructure**.

**Approach**: The demo app features a **Multi-Field Issue Creator** that lets users test multiple field types in one workflow. This reflects how customers actually use the library - setting many fields at once, not one converter at a time.

**Location**: `demo-app/src/features/multi-field-creator.js`  
**Imports**: From compiled `dist/` (as customers use it), never from `src/`  
**Experience**: Professional terminal UI with menus, spinners, color-coded output  
**Safety**: Dry run mode validates with real API without creating issues

### Decision: Demo Required?

Use this decision tree:

```
Does story implement user-facing feature/API?
  ├─ Yes → ✅ Demo REQUIRED (User-Facing section)
  │   └─ Show complete workflow using public JML API
  └─ No → Is this infrastructure/internal class?
      ├─ Yes → Consider Infrastructure Demo (separate section)
      │   └─ Only if needed for development/testing
      └─ No → Check story file for decision
```

**User-Facing Demo Examples** (Main Menu):
- E1-S09 (Create Issue): ✅ Demo via multi-field-creator.js
- E1-S08 (Text Converter): ✅ Add Summary/Description to multi-field creator
- E2-S01 (Number Converter): ✅ Add Story Points to multi-field creator
- E4-S04 (Unified create()): ✅ Extend bulk-import.js to create issues

**Infrastructure Demo Examples** (Separate Section):
- E4-S02 (ManifestStorage): ✅ Demo internal class for development
- E4-S03 (BulkApiWrapper): ✅ Demo internal class for testing
- E1-S04 (Redis Cache): ❌ No demo (tested via integration tests)

**No Demo Examples**:
- E1-S01 (Project Setup): ❌ No demo (infrastructure only)
- E1-S02 (Config Loading): ❌ No demo (infrastructure only)
- E1-S06 (Schema Discovery): ❌ No demo (internal, tested)

**Check story file**: Look for "Demo Required" section and note whether user-facing or infrastructure.

### How to Add Your Field Type to Demo

When you implement a new field type converter, add it to the multi-field creator:

#### Step 1: Add to AVAILABLE_FIELDS

**File**: `demo-app/src/features/multi-field-creator.js`

```javascript
const AVAILABLE_FIELDS = [
  { name: '📝 Summary (required)', value: 'summary', type: 'string', required: true },
  { name: '📄 Description', value: 'description', type: 'text', required: false },
  { name: '🧩 Component/s', value: 'components', type: 'array[component]', required: false },
  { name: '🎯 Priority', value: 'priority', type: 'option', required: false },
  
  // ✅ Add your new field here
  { name: '🔢 Story Points', value: 'storypoints', type: 'number', required: false },
  // ... rest of fields
];
```

**Format:**
- `name`: Display name with emoji (what user sees)
- `value`: Internal ID (used in switch statements)
- `type`: Field type (for documentation/help text)
- `required`: Whether field is mandatory

#### Step 2: Add promptForField Handler

Add case for your field in `promptForField()` function:

```javascript
async function promptForField(field) {
  switch (field.value) {
    case 'summary':
      return await input('Enter summary:', `Demo issue - ${new Date().toLocaleString()}`);
    
    // ✅ Add your field's input prompt
    case 'storypoints':
      return await input('Enter story points (number):', '5');
    
    // ... rest of cases
  }
}
```

**Provide sensible defaults** so users can quickly test without typing everything.

#### Step 3: Add JIRA Field Mapping

Map your internal ID to JIRA field name in `getJiraFieldName()`:

```javascript
function getJiraFieldName(fieldId) {
  const mapping = {
    'summary': 'Summary',
    'description': 'Description',
    'storypoints': 'Story Points',  // ✅ Add your mapping
    // ... rest of mappings
  };
  return mapping[fieldId] || fieldId;
}
```

**Use exact JIRA field names** - the library will resolve these to field IDs.

#### Step 4: Test Your Addition

```bash
# From project root, build library first
npm run build

# Then run demo
npm run demo

# Select "Multi-Field Issue Creator"
# Your new field should appear in the checkbox list
# Select it and provide a value
# Verify issue created with correct value
```

### Example: Adding Date Converter to Demo

**Scenario**: E2-S02 implements date type converter

**Changes needed:**

```javascript
// 1. Add to AVAILABLE_FIELDS
{ name: '📅 Due Date', value: 'duedate', type: 'date', required: false },

// 2. Add promptForField handler
case 'duedate':
  return await input(
    'Enter due date (YYYY-MM-DD):',
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

// 3. Add mapping
'duedate': 'Due Date',
```

**That's it!** The multi-field creator handles the rest:
- Adds field to selection menu
- Prompts for value
- Passes to `jml.issues.create()`
- Shows code example
- Handles errors

### What the Demo Demonstrates

The multi-field creator showcases the library's **core value proposition**:

**User writes simple code:**
```javascript
await jml.issues.create({
  Project: 'ENG',
  'Issue Type': 'Bug',
  Summary: 'Fix login bug',
  Priority: 'High',           // ← Library converts to ID
  'Component/s': 'Backend',   // ← Library converts to ID
  Assignee: 'john@company.com', // ← Library resolves user
  'Due Date': '2025-10-30'    // ← Library formats correctly
});
```

**Library does all the work:**
- ✅ Resolves field names to IDs
- ✅ Converts priority/components/users to proper format
- ✅ Validates before sending
- ✅ Returns clean result

**No manual field ID lookups, no REST API docs needed!**

### Testing Your Demo Addition

After adding your field to multi-field creator:

```bash
# Build library first (demo uses compiled dist/)
npm run build

# Run demo from project root
npm run demo

# Test checklist:
- [ ] Your field appears in checkbox list
- [ ] Field has clear emoji + name
- [ ] Default value makes sense
- [ ] Input prompt is clear
- [ ] Field value reaches library correctly
- [ ] Issue created successfully
- [ ] Error handling works (try invalid value)
- [ ] Dry run mode works (user can cancel)
```

### Demo Checklist

- [ ] Field added to `AVAILABLE_FIELDS` array
- [ ] `promptForField()` handler implemented with sensible default
- [ ] Field mapping added to `getJiraFieldName()`
- [ ] Tested in demo app (field appears, value works)
- [ ] Error handling verified (invalid values show clear errors)
- [ ] Dry run mode tested (validates without creating)

**No other files need updating** - the multi-field creator handles everything!

---

## Step 9: Commit Work

### Two Workflows

#### Option A: Direct Commit (Recommended)

**When**: Solo work, simple changes, rapid iteration

```bash
git add .
git commit -m "E2-S01: Implement number type converter"
git push origin main
```

**After push**: Add commit hash to story file
```markdown
**PR**: Commit abc123d
```

#### Option B: Pull Request (For Team Review)

**When**: Complex changes, team review needed

```bash
# Create feature branch
git checkout -b feature/E2-S01-number-converter

# Commit
git add .
git commit -m "E2-S01: Implement number type converter"
git push origin feature/E2-S01-number-converter

# Create PR on GitHub
# Title: "E2-S01: Implement number type converter"
# Description: Link to story file

# After PR created: Add link to story file
# **PR**: #42
```

### Commit Message Format

```
E{epic}-S{story}: {Imperative verb} {what}

Examples:
✅ E2-S01: Implement number type converter
✅ E2-S02: Add date converter with Excel serial support
✅ E1-S09: Create basic issue endpoint

❌ Added converter  (missing story ID, past tense)
❌ E2-S01: converter  (not imperative, vague)
```

### What to Commit

**Include**:
- Implementation code (converter)
- Tests (unit + integration)
- Documentation (TSDoc comments)
- Demo updates (if field added to multi-field creator)
- Story file updates (ACs checked)
- Backlog updates (status changes)

**Example**:
```bash
# Core implementation
git add src/converters/types/NumberConverter.ts
git add tests/unit/converters/types/NumberConverter.test.ts
git add tests/integration/number-converter.test.ts

# Demo updates (if added field)
git add demo-app/src/features/multi-field-creator.js

# Documentation updates
git add docs/stories/EPIC-02-STORY-001-*.md
git add docs/backlog.md

git commit -m "E2-S01: Implement number type converter

- Add convertNumberType() with string parsing
- Handle integers and floats correctly
- 100% test coverage
- Add Story Points field to multi-field creator demo"
```

**Note**: No need to update `demo/README.md` or `package.json` - the multi-field creator is self-contained!

---

## Step 10: Update State

### Final Status Update

#### A. Story File

**Before** (from Phase 3):
```markdown
**Status**: ⏳ In Progress  
**Assignee**: GitHub Copilot  
**PR**: -  
**Started**: 2025-10-09  
**Completed**: -
```

**After**:
```markdown
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: Commit abc123d  
**Started**: 2025-10-09  
**Completed**: 2025-10-09
```

#### B. Backlog

**Before**:
```markdown
- ⏳ [E2-S01: Number Converter](stories/EPIC-02-STORY-001-*.md) - 3 points *(GitHub Copilot)*
```

**After**:
```markdown
- ✅ [E2-S01: Number Converter](stories/EPIC-02-STORY-001-*.md) - 3 points (Commit abc123d)
```

**Update epic progress**:
```markdown
### Epic 2: Core Field Types (⏳ In Progress - 3/57 points)
```

#### C. Mark Next Stories as Ready

If completing this story unblocks others:

**Example**: E2-S01 done, check what depends on it

```bash
grep -r "E2-S01" docs/stories/
# Found: E2-S05 depends on E2-S01
```

If all dependencies now met, mark E2-S05 as 📋 Ready:

```markdown
# In E2-S05 story file
**Status**: 📋 Ready for Development  ← Was 🚫 Blocked
```

### Commit Status Updates

```bash
git add docs/stories/EPIC-02-STORY-001-*.md docs/backlog.md
git commit -m "E2-S01: Update story status to Done"
git push
```

---

## Completion Checklist

Story is **truly Done** when:

- [ ] **Documentation Complete**
  - [ ] TSDoc comments added to public APIs
  - [ ] API documentation updated (if API changed)
  - [ ] README updated (if user-facing, Epic 1-7 only)

- [ ] **Definition of Done Exceptions** (if needed)
  - [ ] Exception documented in story file (Step 8A)
  - [ ] All required fields complete (Standard DoD, Exception Request, Justification, Alternative Evidence, Approved By)
  - [ ] Approval obtained from appropriate approver
  - [ ] Validation passes: `npm run validate:workflow`
  - [ ] **OR** No exceptions needed (all DoD items completed)

- [ ] **Demo Complete** (if required)
  - [ ] Field added to `AVAILABLE_FIELDS` in multi-field-creator.js
  - [ ] `promptForField()` handler added with sensible default
  - [ ] Field mapping added to `getJiraFieldName()`
  - [ ] Tested in demo app - field appears and works correctly
  - [ ] Error handling verified (invalid values show clear messages)
  - [ ] **OR** Demo exception documented (if waiving demo requirement)

- [ ] **Code Committed**
  - [ ] Commit message follows format
  - [ ] All files committed (code, tests, docs, demo)
  - [ ] Pushed to remote

- [ ] **Status Updated**
  - [ ] Story file: ⏳ → ✅
  - [ ] Story file: PR/commit link added
  - [ ] Story file: Completion date added
  - [ ] Backlog: ⏳ → ✅
  - [ ] Backlog: PR/commit link added
  - [ ] Backlog: Epic progress updated
  - [ ] Dependent stories: Marked 📋 if unblocked
  - [ ] Status updates committed

- [ ] **Validation Clean** ⭐
  - [ ] `npm run validate:workflow` shows no errors
  - [ ] All warnings resolved (not just ignored)
  - [ ] Can proceed to next story without technical debt

---

## Step 11: Archive Epic (If Epic Complete)

### When to Archive

**Archive an epic when:**
- ✅ All epic stories are marked ✅ Done in backlog
- ✅ Epic is marked ✅ Complete in backlog  
- ✅ Epic validation story (E*-S*13) is complete
- ✅ Ready to focus on next epic

**Purpose**: Keep active workspace clean while preserving history and evidence for audits.

### Archive Process

#### A. Validate Epic Ready

```bash
# Check epic status in backlog
grep -A 10 "### Epic 1:" docs/backlog.md
# Should show: (✅ Complete - XX/XX points)

# Check all stories Done
grep "EPIC-01" docs/backlog.md
# All should be: ✅ [Story Name](...) - points

# Check epic validation story exists and Done
ls docs/stories/*epic*validation*.md
cat docs/stories/EPIC-01-STORY-013-epic-validation.md | grep "**Status**"
# Should be: **Status**: ✅ Done
```

#### B. Run Archive Command

```bash
# Archive Epic 1
npm run archive:epic -- epic-01

# Archive Epic 2 (when complete)
npm run archive:epic -- epic-02
```

**What the archiver does**:
1. ✅ Validates epic is complete
2. 📁 Moves all `EPIC-XX-STORY-*.md` files to `docs/archive/epic-XX/`
3. 📊 Creates `EPIC-SUMMARY.md` with outcomes and metrics
4. 🔗 Updates backlog.md to reference archive location
5. 📋 Shows commit instructions

#### C. Commit Archive

```bash
# Archive command shows these instructions:
git add docs/archive/ docs/backlog.md
git commit -m "Archive Epic 1: Move completed stories to archive

- Moved 13 story files to docs/archive/epic-01/
- Generated EPIC-SUMMARY.md with completion metrics  
- Updated backlog.md with archive reference
- Keeps active workspace clean for Epic 2 development"

git push
```

### Archive Structure

After archiving, your workspace looks like:

```
docs/
  stories/                    # 🎯 Active work only
    _TEMPLATE.md
    EPIC-02-STORY-001-*.md    # Current epic
    EPIC-02-STORY-002-*.md
    ...
  archive/                    # 📁 Completed epics  
    epic-01/                  # Epic 1 archive
      EPIC-01-STORY-001-project-setup.md
      EPIC-01-STORY-002-environment-config.md
      ...
      EPIC-01-STORY-013-epic-validation.md
      EPIC-SUMMARY.md         # 📊 Epic outcomes
    epic-02/                  # When Epic 2 completes
      ...
```

### Backlog After Archiving

Epic 1 entry changes from:
```markdown
### Epic 1: Basic Issue Creation (✅ Complete - 45/45 points)
```

To:
```markdown  
### Epic 1: Basic Issue Creation (📁 Archived 2025-10-13) - **Archive**: [docs/archive/epic-01/](archive/epic-01/)
```

### Benefits

- ✅ **Clean workspace** - Only current epic stories visible
- 📚 **Preserved history** - All evidence and decisions kept  
- 🔍 **Easy reference** - Can look up "How did we implement auth in Epic 1?"
- 📋 **Audit ready** - Evidence links preserved for compliance
- 🏗️ **Pattern library** - Future epics can reference similar stories

### Restoration (If Needed)

```bash
# Restore Epic 1 to active development
mv docs/archive/epic-01/*.md docs/stories/

# Update backlog (manually change status back to "In Progress")  
# Edit docs/backlog.md

# Remove archive
rm -rf docs/archive/epic-01/
```

---

## Common Completion Issues

### Issue: Forgot to update backlog

**Symptom**: Story file says ✅ Done, backlog says ⏳ In Progress

**Fix**: Update backlog emoji and commit

### Issue: PR link missing

**Symptom**: Validation warning "Should have PR/commit link"

**Understanding**: 
- Warnings don't block commits (you can push work to backup)
- Warnings must still be fixed before story is complete

**Fix**: 
1. Commit and push your implementation code
2. Add commit hash to story file: `**PR**: Commit abc123d`
3. Commit the story file update
4. Re-run validation - warning should be resolved

### Issue: Field not appearing in demo

**Symptom**: Added field to multi-field creator but it doesn't show in menu

**Fix**: 
1. Check `AVAILABLE_FIELDS` array - field added correctly?
2. Rebuild and restart: `npm run build && npm run demo`
3. Check for JavaScript syntax errors in console
4. Verify field object has all required properties (name, value, type, required)

### Issue: Demo field value not working

**Symptom**: Field appears but issue creation fails with field error

**Fix**:
1. Check `getJiraFieldName()` mapping - does it match exact JIRA field name?
2. Check `promptForField()` - is return value correct format?
3. Test in JIRA directly - does field exist in project?
4. Check library converter implementation - does it handle this type?

### Issue: Dependent stories still blocked

**Symptom**: E2-S05 depends on E2-S01 but still marked 🚫

**Fix**: Update E2-S05 status to 📋 Ready

---

## Quick Reference

### Documentation
- TSDoc: Public functions/classes
- API docs: `docs/api.md` (if API changed)
- README: Major features only (Epic 1-7)

### Demo Decision
- User-facing field type → ✅ Add to multi-field creator
- Infrastructure only → ❌ No demo
- Check story file for specific decision

### Demo Updates (if required)
1. Add to `AVAILABLE_FIELDS` array
2. Add `promptForField()` case
3. Add `getJiraFieldName()` mapping
4. Test in demo app

### Commit Format
```
E{epic}-S{story}: {Imperative verb} {what}
```

### Status Update Locations
1. Story file (status, PR, completion date)
2. Backlog (emoji, PR, epic progress)
3. Dependent stories (unblock if ready)

### Final Command
```bash
npm run validate:workflow
# Should show: ✅ All checks passed! ✨
```

---

## Celebration! 🎉

**Story Complete!** You've:
- ✅ Planned the work
- ✅ Implemented with tests
- ✅ Validated all ACs
- ✅ Created documentation
- ✅ Created demo (if needed)
- ✅ Committed work
- ✅ Updated status

**Next Story**: Return to [1-planning.md](1-planning.md) and pick the next story!

---

---

## Phase 4 Complete

**✅ When you've completed all review steps, you MUST say:**

> "✅ Finished with Phase 4: Review. Story [EX-SYY] is complete and ready for merge."

**This confirms:**
- ✅ Demo created (or exception approved by user)
- ✅ Definition of Done fully checked
- ✅ Story status updated to "✅ Done"
- ✅ Backlog updated
- ✅ All changes committed
- ✅ Validation clean (no errors, no warnings)
- ✅ Ready for pull request or merge

**⚠️ Don't announce complete if:**
- Warnings still exist in validation output
- PR/commit links not added to story file
- Status updates not committed

**Final Step**: Create pull request or merge to main branch (depending on project workflow)

---

## See Also

- **[AGENTS.md](../../AGENTS.md)** - Complete workflow, state management, and best practices
- **[Backlog](../backlog.md)** - Update epic/story status after completion

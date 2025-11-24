# JIRA Magic Library - Product Backlog

## Overview

This backlog contains all epics and high-level user stories for the JIRA Magic Library. Each epic represents a **vertical slice** - a fully functional, independently deliverable increment that includes infrastructure, schema discovery, field conversion, validation, error handling, tests, and documentation.

**MVP Scope**: JIRA Server/DC API v2, Node.js/TypeScript, PAT authentication  
**Future Scope**: JIRA Cloud API v3 (Epic 8), Python SDK (Epic 9)

---

## Epic Summary

| Epic | Name | Status | Stories | Value | Dependencies |
|------|------|--------|---------|-------|--------------|
| **Epic 1** | [Basic Issue Creation](#epic-1-basic-issue-creation) | 📁 Archived 2025-10-13 | 13 (63/63 pts) | HIGH | None |
| **Epic 2** | [Core Field Types](#epic-2-core-field-types) | 📁 Archived 2025-10-23 | 14 (68/68 pts) | HIGH | Epic 1 ✅ |
| **Epic 3** | [Issue Hierarchy & Complex Types](#epic-3-issue-hierarchy--complex-types) | 📁 Archived 2025-11-11 | 16 (66/74 pts) | HIGH | Epic 2 ✅ |
| **Epic 4** | [Bulk Operations](#epic-4-bulk-operations) | ⏳ In Progress | 12 (66 pts) | HIGH | Epic 2 ✅ |
| **Epic 5** | [Issue Updates & Transitions](#epic-5-issue-updates--transitions) | 📋 Planned | 7 (38 pts) | MEDIUM | Epic 2 ✅ |
| **Epic 6** | [Advanced Features](#epic-6-advanced-features) | 📋 Planned | 10 (48 pts) | LOW | Epic 3, 5 |
| **Epic 7** | [CLI Interface](#epic-7-cli-interface) | 📋 Planned | 5 (23 pts) | LOW | Epic 4 |
| **Epic 8** | [Cloud API Support](#epic-8-cloud-api-support) | 🔮 Future | TBD | MEDIUM | Epic 1-7 |
| **Epic 9** | [Python SDK](#epic-9-python-sdk) | 🔮 Future | TBD | MEDIUM | Epic 1-7 |

**Total MVP Stories**: 58 (Epic 1-7)  
**Estimated MVP Duration**: 8-12 weeks (assuming 1 dev, 5-7 stories/week)

**Note**: Epic 3 refocused October 2025 - changed from "Complex Field Types" to "Issue Hierarchy & Complex Types". Moved attachment/generic issue link work to Epic 6. Added JPO hierarchy discovery and parent link resolution.

**Note**: Epic 2 and 3 updated to use **type-based conversion** (not field-name based). See [JIRA Field Types Reference](./JIRA-FIELD-TYPES.md).

---

## Standalone Backlog Stories

Stories outside the active epics but still tracked for delivery.

- ✅ [S1: User Ambiguity Policy Options](stories/BACKLOG-STORY-001-user-ambiguity-policy.md) - 3 points (Commit 2483346c9e0496982e75f9469ed9066cf3780d18)
- 📋 [S2: User Directory Ambiguity Spike](stories/BACKLOG-STORY-002-user-directory-spike.md) - 5 points

---

## Epic 1: Basic Issue Creation

**Goal**: Deliver a working, publishable npm package that can create JIRA issues with basic text fields using human-readable input.

**User Value**: Developers can create issues programmatically without knowing field IDs or JIRA API payload structures.

**Acceptance Criteria**:
- ✅ Users can install via `npm install jira-magic-library`
- ✅ Users can create issues with Project, Issue Type, Summary, Description
- ✅ Library dynamically discovers schema from JIRA Server/DC API v2
- ✅ Schema is cached in Redis (15min TTL)
- ✅ Clear error messages for missing config or invalid PAT
- ✅ 95% unit test coverage; integration tests against real JIRA instance

**Architecture Components**:
- Configuration & Auth Layer → [Architecture Doc §3.1](./architecture/system-architecture.md#1-configuration--auth-layer)
- JIRA API Client → [Architecture Doc §3.2](./architecture/system-architecture.md#2-jira-api-client)
- Schema Discovery & Caching → [Architecture Doc §3.3](./architecture/system-architecture.md#3-schema-discovery--caching)
- Field Resolution & Conversion Engine (basic text only) → [Architecture Doc §3.4](./architecture/system-architecture.md#4-field-resolution--conversion-engine)

### Stories

| ID | Story | Size | Priority | Status |
|----|-------|------|----------|--------|
| E1-S01 | [Project Setup & TypeScript Config](archive/epic-01/EPIC-01-STORY-001-project-setup.md) | S (3) | P0 | ✅ Done |
| E1-S02 | [Environment Config & dotenv Integration](archive/epic-01/EPIC-01-STORY-002-environment-config.md) | S (3) | P0 | ✅ Done |
| E1-S03 | [PAT Authentication & Connection Validation](archive/epic-01/EPIC-01-STORY-003-pat-authentication.md) | M (5) | P0 | ✅ Done |
| E1-S04 | [Redis Client Setup & Cache Infrastructure](archive/epic-01/EPIC-01-STORY-004-redis-cache.md) | M (5) | P0 | ✅ Done |
| E1-S05 | [JIRA API Client with Fetch & Retry Logic](archive/epic-01/EPIC-01-STORY-005-jira-api-client.md) | L (8) | P0 | ✅ Done |
| E1-S06 | [Schema Discovery for Project + Issue Type](archive/epic-01/EPIC-01-STORY-006-schema-discovery.md) | L (8) | P0 | ✅ Done |
| E1-S07 | [Field Name Resolution (Text Fields Only)](archive/epic-01/EPIC-01-STORY-007-field-name-resolution.md) | M (5) | P0 | ✅ Done |
| E1-S08 | [Basic Text Field Converter](archive/epic-01/EPIC-01-STORY-008-text-field-converter.md) | S (3) | P0 | ✅ Done |
| E1-S09 | [Create Single Issue API](archive/epic-01/EPIC-01-STORY-009-create-single-issue.md) | M (5) | P0 | ✅ Done |
| E1-S10 | [Error Handling & Custom Error Types](archive/epic-01/EPIC-01-STORY-010-error-handling.md) | M (5) | P1 | ✅ Done |
| E1-S11 | [Integration Tests with Real JIRA](archive/epic-01/EPIC-01-STORY-011-integration-tests.md) | M (5) | P1 | ✅ Done |
| E1-S12 | [README & Getting Started Guide](archive/epic-01/EPIC-01-STORY-012-readme-getting-started.md) | S (3) | P1 | ✅ Done |
| E1-S13 | [Epic 1 Closure Validation](archive/epic-01/EPIC-01-STORY-013-epic-validation.md) | M (5) | P1 | ✅ Done |

**Total Story Points**: 63 points  
**Completed**: 63 points (100%)  
**Status**: ✅ Complete (with notes - see E1-S13 for validation summary)

**Notes**: 
- All stories complete with evidence links
- 313 tests passing, >94% coverage on all metrics
- Linting errors (317) need resolution before npm publish
- Integration tests require live JIRA credentials (not run)
- Package ready for internal use and Epic 2 development

---

## Epic 2: Core Field Types

**Goal**: Extend Epic 1 to support common JIRA field types (number, date, datetime, priority, user, option, arrays) using **type-based conversion** (not field-name based).

**User Value**: Create realistic issues with assignees, due dates, priorities, and components without manual ID lookups. Library handles any field of a supported type, including custom fields.

**Acceptance Criteria**:
- ✅ Support all core JIRA types: `number`, `date`, `datetime`, `array`, `priority`, `user`, `option`
- ✅ Array converter handles any item type (`string`, `component`, `version`, `option`)
- ✅ Lookup cache for priority/component/version lists (reduce API calls)
- ✅ Ambiguity detection when names match multiple values
- ✅ All converters are type-driven (use `fieldSchema.type`, never field names)
- ✅ All converters have unit tests + integration tests

**Architecture Components**:
- Field Conversion Engine (type-based) → [Architecture Doc §3.4](./architecture/system-architecture.md#4-field-resolution--conversion-engine)
- Lookup cache patterns for name→ID resolution
- Array container converter with item type delegation

**Reference**: See [JIRA Field Types Reference](./JIRA-FIELD-TYPES.md) for complete type list

### Stories

| ID | Story | Size | Priority | Status |
|----|-------|------|----------|--------|
| E2-S01 | [Number Type Converter (`type: "number"`)](archive/epic-02/EPIC-02-STORY-001-number-type-converter.md) | S (3) | P0 | ✅ Done |
| E2-S02 | [Date Type Converter (`type: "date"`)](archive/epic-02/EPIC-02-STORY-002-date-type-converter.md) | M (5) | P0 | ✅ Done |
| E2-S03 | [DateTime Type Converter (`type: "datetime"`)](archive/epic-02/EPIC-02-STORY-003-datetime-type-converter.md) | S (3) | P0 | ✅ Done |
| E2-S04 | [Array Type Converter (`type: "array"`)](archive/epic-02/EPIC-02-STORY-004-array-type-converter.md) | M (5) | P0 | ✅ Done |
| E2-S05 | [Ambiguity Detection & Error Handling](archive/epic-02/EPIC-02-STORY-005-ambiguity-detection.md) | M (5) | P0 | ✅ Done |
| E2-S06 | [Lookup Cache Infrastructure](archive/epic-02/EPIC-02-STORY-006-lookup-cache-infrastructure.md) | M (5) | P0 | ✅ Done |
| E2-S07 | [Priority Type Converter (`type: "priority"`)](archive/epic-02/EPIC-02-STORY-007-priority-type-converter.md) | M (5) | P0 | ✅ Done |
| E2-S08 | [User Type Converter (`type: "user"`)](archive/epic-02/EPIC-02-STORY-008-user-type-converter.md) | L (8) | P0 | ✅ Done |
| E2-S09 | [Option Type Converter (`type: "option"`)](archive/epic-02/EPIC-02-STORY-009-option-type-converter.md) | M (5) | P0 | ✅ Done |
| E2-S10 | [Component Item Converter (`items: "component"`)](archive/epic-02/EPIC-02-STORY-010-component-item-converter.md) | M (5) | P1 | ✅ Done |
| E2-S11 | [Version Item Converter (`items: "version"`)](archive/epic-02/EPIC-02-STORY-011-version-item-converter.md) | S (3) | P1 | ✅ Done (Commits 41ba623, e7e7adb, 72c371b) |
| E2-S12 | [Integration Tests for All Type Converters](archive/epic-02/EPIC-02-STORY-012-integration-tests.md) | M (5) | P1 | ✅ Done (Commits 36fb60f, da1c27f, 06c71a1, d9552ad, 235f1de, 7cc79fe, f22f3d9) |
| E2-S13 | [Async Converter Architecture Support](archive/epic-02/EPIC-02-STORY-013-async-converter-architecture.md) | L (8) | P0 | ✅ Done |
| E2-S14 | [Update Tests for Async Converter Architecture](archive/epic-02/EPIC-02-STORY-014-async-test-updates.md) | S (3) | P1 | ✅ Done (Commit a02d844) |

**Total Story Points**: 68 points (added E2-S13: 8 points, E2-S14: 3 points)  
**Completed**: 68 points (100%) ✅  
**Status**: ✅ Complete

**Key Changes from Original Plan**:
- ❌ Removed: "Boolean Field Converter" (JIRA has no boolean type; checkboxes are `array` of `option`)
- ❌ Removed: "Labels Field Converter" (handled by `array` of `string`, type-driven)
- ❌ Removed: "Time Duration Parser" (moved to Epic 6 for timetracking complex type)
- ✅ Added: DateTime Type Converter (separate from Date)
- ✅ Added: Array Type Converter (generic container)
- ✅ Added: Option Type Converter (single-select custom fields)
- ✅ Added: Ambiguity Detection (moved earlier, needed by lookup converters)
- ✅ Added: Lookup Cache Infrastructure (explicit story for caching pattern)

---

## Epic 3: Issue Hierarchy & Complex Types ✅ Complete

**Goal**: Support JIRA issue hierarchy (parent-child relationships via JPO) and advanced field types (cascading select, time tracking) with intelligent parent resolution.

**User Value**: Create parent-child issue relationships (subtask→story→epic→phase→container→anthology) and complex fields without knowing field IDs or hierarchy configuration. Library auto-discovers hierarchy structure and resolves parent links by key or summary.

**Acceptance Criteria**:
- ✅ Discover hierarchy structure from JPO endpoint (`/rest/jpo-api/1.0/hierarchy`)
- ✅ Auto-discover parent field (Epic Link, Parent Link, etc.) per project
- ✅ Resolve parent by exact key: `"Parent: EPIC-123"`
- ✅ Resolve parent by summary search: `"Epic Link: newsroom - phase 1"`
- ✅ Support parent synonyms ("Parent", "Epic Link", "Epic", "Parent Issue", "Parent Link")
- ✅ Validate parent is exactly 1 level above child in hierarchy
- ✅ Filter parent search by project's available issue types
- ✅ Cascading select fields with multiple input formats: `type: "option-with-child"`
- ✅ Time tracking fields (duration parsing): `type: "timetracking"`
- ✅ All features work at any hierarchy level (not hardcoded to Epic→Story)
- ✅ Graceful degradation if JPO not available

**Architecture Components**:
- JPO Hierarchy Discovery → [Architecture Doc §3.3](./architecture/system-architecture.md#3-schema-discovery--caching)
- Parent Link Resolution → [Architecture Doc §3.4](./architecture/system-architecture.md#4-field-resolution--conversion-engine)
- Field Conversion Engine (complex types) → [Architecture Doc §3.4](./architecture/system-architecture.md#4-field-resolution--conversion-engine)

**Reference**: See [JIRA Field Types Reference](./JIRA-FIELD-TYPES.md) and [JPO Hierarchy Export](./reference/jpo-hierarchy-export.json)

### Stories

### Epic 3: Issue Hierarchy & Complex Types (✅ Complete - 66/74 points)

| ID | Story | Size | Priority | Status |
|----|-------|------|----------|--------|
| E3-S01 | [Option-With-Child Type Converter (cascading select)](archive/epic-03/EPIC-03-STORY-001-option-with-child-converter.md) | L (8) | P0 | ✅ Done *(Commits d6eb2a9, 88525ff, 84107f5)* |
| E3-S02 | [TimeTracking Type Converter (time duration parser)](archive/epic-03/EPIC-03-STORY-002-timetracking-converter.md) | M (5) | P0 | ✅ Done *(Commits 919db81, 3881b3d, ee7f07d)* |
| E3-S02b | [TimeTracking Extended Support (top-level field names)](archive/epic-03/EPIC-03-STORY-002b-timetracking-extended-support.md) | M (5) | P0 | ✅ Done *(Commits 5d156cd, 6ef04e7, 6e14b35)* |
| E3-S03 | [JPO Hierarchy Discovery & Caching](archive/epic-03/EPIC-03-STORY-003-jpo-hierarchy-discovery.md) | M (5) | P0 | ✅ Done *(Codex (GPT-5))* |
| E3-S04 | [Parent Field Discovery](archive/epic-03/EPIC-03-STORY-004-parent-field-discovery.md) | S (3) | P0 | ✅ Done *(Commit c1b1a53)* |
| E3-S05 | [Parent Link Resolver (Key or Summary Search)](archive/epic-03/EPIC-03-STORY-005-parent-link-resolver.md) | M (5) | P0 | ✅ Done *(Commits a0c6408, 72c3cdb)* |
| E3-S06 | [Parent Synonym Handler](archive/epic-03/EPIC-03-STORY-006-parent-synonym-handler.md) | S (3) | P0 | ✅ Done *(Commit eb96a41)* |
| E3-S07 | [IssueType Resolver (by name)](archive/epic-03/EPIC-03-STORY-007-issuetype-resolver.md) | S (3) | P0 | ✅ Done *(Commits c99f26c, 5c978a4)* |
| E3-S07b | [Refactor IssueType Resolution as Type Converter](archive/epic-03/EPIC-03-STORY-007b-issuetype-converter-refactor.md) | S (3) | P0 | ✅ Done *(GitHub Copilot, 2025-11-05)* |
| E3-S08 | [Project Value Converter (by key or name)](archive/epic-03/EPIC-03-STORY-008-project-resolver.md) | S (3) | P0 | ✅ Done *(Commits e9cd428, a4cde0c, c4932a2, 2bd4213)* |
| E3-S09 | [Integration Tests for Hierarchy & Complex Types](archive/epic-03/EPIC-03-STORY-009-integration-tests.md) | L (8) | P0 | ✅ Done *(Commits 54c555f, bd6bdd0, 0204be4, ee15ae2, cc8ae7e, cda7445)* |
| E3-S10 | [Universal Schema Validator with Ajv](archive/epic-03/EPIC-03-STORY-010-universal-schema-validator.md) | L (8) | P1 | ✅ Done (Archived) |
| E3-S12 | [Migrate Converters to Universal Validator](archive/epic-03/EPIC-03-STORY-012-converter-migration.md) | M (5) | P2 | 🚫 Blocked (Cancelled) |
| E3-S13 | [Unified Integration Suite (Minimal Issues)](archive/epic-03/EPIC-03-STORY-013-unified-integration-suite.md) | M (5) | P1 | ✅ Done *(GitHub Copilot)* |
| E3-S14 | [Hierarchy-Aware Parent Field Resolution](archive/epic-03/EPIC-03-STORY-014-hierarchy-aware-parent-field-resolution.md) | M (5) | P0 | ✅ Done *(GitHub Copilot)* |
| E3-S15 | [Data-Driven Integration Test Suite](archive/epic-03/EPIC-03-STORY-015-data-driven-integration-tests.md) | M (5) | P1 | ✅ Done *(GitHub Copilot)* |
| E3-S16 | [Enhanced Fuzzy Matching with fuse.js](archive/epic-03/EPIC-03-STORY-016-enhanced-fuzzy-matching.md) | M (5) | P1 | ✅ Done *(GitHub Copilot, [current commit])* |

**Total Story Points**: 74 points (updated: +3 for E3-S07b refactor, +3 for E3-S09 expansion, +5 for E3-S14 bug fix, +5 for E3-S15 test refactor, +5 for E3-S16 fuzzy matching, -5 for E3-S11 moved to Epic 6)
**Completed**: 66 points (89%)
**Remaining**: 8 points (E3-S10 archived: 3 pts, E3-S12 cancelled: 5 pts)
**Status**: ✅ Complete (all functional features delivered)

**Notes**:
- All user-facing features complete and tested
- E3-S10 (Universal Validator) was implemented but architecturally rejected and archived
- E3-S12 (Migrate to Validator) cancelled due to E3-S10 not being integrated
- 537 unit tests passing, 25 integration tests passing
- Zero hardcoded abbreviations, pure fuse.js fuzzy matching
- Ready for Epic 4, 5, or 6

**Key Changes from Original Plan (October 2025)**:
- ❌ Removed: File upload (E3-S03), attachments (E3-S04) → Moved to Epic 6
- ❌ Removed: Issue link type discovery (E3-S05), issue links (E3-S06) → Moved to Epic 6
- ✅ Added: JPO hierarchy discovery and caching (E3-S03)
- ✅ Added: Parent field discovery - auto-detect Epic Link/Parent Link (E3-S04)
- ✅ Added: Parent link resolver - key or summary search with hierarchy validation (E3-S05)
- ✅ Added: Parent synonym handler - "Parent"/"Epic Link"/"Epic" all work (E3-S06)
- ✅ Kept: Cascading select (E3-S01) and time tracking (E3-S02) - complex types
- ✅ Updated: IssueType (E3-S07→E3-S07b) and Project (E3-S08) as type converters (not resolvers)
- ⚠️ Architecture Fix (November 2025): Added E3-S07b to refactor IssueTypeResolver to converter pattern (+3 pts)
- ✅ Architecture Enhancement (November 2025): E3-S07b added configurable abbreviations and parent synonyms
- ✅ Expanded: E3-S09 integration tests to cover IssueTypeConverter and configurable options (+3 pts, 5→8)
- ✅ Refocused: Integration tests (E3-S09) on hierarchy features instead of attachments/links
- ✅ Epic renamed: "Complex Field Types" → "Issue Hierarchy & Complex Types"

---

## Epic 4: Bulk Operations

**Goal**: Support bulk issue creation from any input format (CSV/JSON/YAML/arrays) with resume-on-failure and validation as optional separate steps.

**User Value**: Import issues from spreadsheets, arrays, or files without custom scripts. Failed imports can be fixed and resumed without re-creating successful issues. Validation runs separately for live UI feedback.

**Status**: ⏳ In Progress

**Total Story Points**: 66 points  
**Completed**: 39 points (59%)  

**Acceptance Criteria**:
- ✅ Single `create()` method handles single issues, arrays, files, and in-memory data
- ✅ Parse CSV, JSON, YAML (from files, strings, or arrays)
- ✅ Use JIRA bulk API (`/rest/api/2/issue/bulk`) with batching
- ✅ Batch requests (50 issues/batch, 4 concurrent batches)
- ✅ Return per-row success/failure with manifest ID
- ✅ Retry with `{ retry: manifestId }` skips already-created issues
- ✅ Rollback generates JQL search for created issues
- ✅ Optional `validate()` method for pre-flight checks (separate from create)
- ✅ Process all batches even if some fail (no fail-fast)
- ✅ Performance: 100 issues in <10s

**Architecture Components**:
- Bulk Processor → [Architecture Doc §3.6](./architecture/system-architecture.md#6-bulk-processor)
- Issue Operations Module (unified create) → [Architecture Doc §3.5](./architecture/system-architecture.md#5-issue-operations-module)
- JIRA Bulk API: `/rest/api/2/issue/bulk` (tested response format)
- Redis-based manifest storage for resume support

**Key Architectural Decisions**:
- **Unified API**: No separate `createMany()` - `create()` detects input type automatically
- **Explicit Retry**: User passes `{ retry: manifestId }` for clarity and safety
- **Validation Separate**: `validate()` is separate method, not part of `create()` flow
- **Redis Storage**: Manifest tracking uses Redis (24hr TTL, already available from Epic 1)

### Stories

| ID | Story | Size | Priority | Status |
|----|-------|------|----------|--------|
| E4-S01 | [Unified Input Parser (CSV/JSON/YAML)](stories/EPIC-04-STORY-001-unified-input-parser.md) | L (8) | P0 | ✅ Done *(Commits 54f5831, 961f8da)* |
| E4-S02 | [Bulk Result Manifest & Redis Storage](stories/EPIC-04-STORY-002-manifest-storage.md) | M (5) | P0 | ✅ Done *(Commits 021298e, 743b1d5, 483301b)* |
| E4-S03 | [JIRA Bulk API Wrapper](stories/EPIC-04-STORY-003-jira-bulk-api-wrapper.md) | M (5) | P0 | ✅ Done *(Commits 5988ed4, 743b1d5, 483301b)* |
| E4-S04 | [Unified create() Method](stories/EPIC-04-STORY-004-unified-create-method.md) | L (8) | P0 | ✅ Done *(Commits 52f17b1, b7d4096, 9464d30, 674cb82, 158bfa8)* |
| E4-S05 | [Retry with Manifest Support](stories/EPIC-04-STORY-005-retry-with-manifest.md) | L (8) | P0 | ✅ Done *(Commits 83ac58a, 044536f, e2a7f7e)* |
| E4-S06 | [Rollback JQL Generator](stories/EPIC-04-STORY-006-rollback-jql-generator.md) | S (3) | P1 | 📋 Ready |
| E4-S07 | [Schema-Only Validation Method](stories/EPIC-04-STORY-007-schema-validation.md) | M (5) | P1 | ✅ Done *(GitHub Copilot, coverage 98.9%, commit 294b168)* |
| E4-S08 | [Enhanced Dry-Run Mode](stories/EPIC-04-STORY-008-enhanced-dry-run.md) | S (3) | P1 | 📋 Ready |
| E4-S09 | [Full Pipeline Validation](stories/EPIC-04-STORY-009-full-pipeline-validation.md) | M (5) | P2 | 📋 Ready |
| E4-S10 | [Incremental Validation Research](stories/EPIC-04-STORY-010-incremental-validation-research.md) | L (8) | P2 | 📋 Ready |
| E4-S11 | [Performance Testing & Optimization](stories/EPIC-04-STORY-011-performance-testing.md) | M (5) | P1 | 📋 Ready |
| E4-S12 | [Bulk Operations Documentation](stories/EPIC-04-STORY-012-documentation.md) | S (3) | P1 | 📋 Ready |

**Total Story Points**: 66 points  
**Completed**: 34 points (52%)  
**Status**: ⏳ In Progress

---

## Epic 5: Issue Updates & Transitions

**Goal**: Support updating existing issues and transitioning them through workflows.

**User Value**: Modify issues in bulk (e.g., change priority, assignee) or move issues through workflow states.

**Acceptance Criteria**:
- ✅ Update single issue by key
- ✅ Update multiple issues by key list or JQL
- ✅ Transition issue to new status
- ✅ Transition multiple issues with JQL match
- ✅ Validation ensures only editable fields are updated
- ✅ Clear errors if transition is invalid

**Architecture Components**:
- Issue Operations Module (update, transition) → [Architecture Doc §3.5](./architecture/system-architecture.md#5-issue-operations-module)
- Schema discovery for editmeta

### Stories

| ID | Story | Size | Priority |
|----|-------|------|----------|
| E5-S01 | [Get Editable Fields Schema (editmeta)](#) | M | P0 |
| E5-S02 | [Update Single Issue API](#) | M | P0 |
| E5-S03 | [Update Many Issues (by key list)](#) | M | P0 |
| E5-S04 | [Update Many Issues (by JQL)](#) | M | P0 |
| E5-S05 | [Get Available Transitions for Issue](#) | S | P0 |
| E5-S06 | [Transition Single Issue API](#) | M | P0 |
| E5-S07 | [Transition Many Issues (with JQL match)](#) | M | P1 |

**Total Story Points**: ~38

---

## Epic 6: Advanced Features

**Goal**: Support generic issue links (blocks/relates/duplicates), file attachments, security levels, worklogs, and other advanced JIRA enterprise features.

**User Value**: Handle advanced JIRA features for enterprise workflows - link issues with semantic relationships, upload attachments, track security levels and work logs.

**Acceptance Criteria**:
- ✅ Generic issue links (blocks, relates to, duplicates, etc.): `type: "issuelink"` / `type: "issuelinks"`
- ✅ File attachments (upload from paths or buffers): `type: "attachment"`
- ✅ Set security level (by name → ID)
- ✅ Add worklogs (time spent tracking)
- ✅ Handle custom field types not covered in Epic 2-3
- ✅ Support request participants for Service Desk
- ✅ All features tested against real JIRA instance

**Architecture Components**:
- Field Conversion Engine (advanced types) → [Architecture Doc §3.4](./architecture/system-architecture.md#4-field-resolution--conversion-engine)
- JIRA API Client (file upload, worklog) → [Architecture Doc §3.2](./architecture/system-architecture.md#2-jira-api-client)
- Lookup cache for issue link types and security levels

### Stories

| ID | Story | Size | Priority |
|----|-------|------|----------|
| E6-S01 | [API Client File Upload Support](#) | M (5) | P1 |
| E6-S02 | [Attachment Converter (file paths/buffers)](#) | S (3) | P1 |
| E6-S03 | [Issue Link Type Discovery & Caching](#) | M (5) | P1 |
| E6-S04 | [IssueLink/IssueLinks Converter (blocks/relates/etc.)](#) | M (5) | P1 |
| E6-S05 | [Security Level Resolution & Caching](#) | M (5) | P2 |
| E6-S06 | [Worklog Creation API (time spent tracking)](#) | M (5) | P2 |
| E6-S07 | [Request Participants Converter (Service Desk)](#) | M (5) | P2 |
| E6-S08 | [Custom Field Type Fallback Handler](#) | M (5) | P2 |
| E6-S09 | [Universal Validator - Advanced Features (Drift, Enums, Rollout)](stories/EPIC-06-STORY-009-validator-advanced-features.md) | M (5) | P2 |
| E6-S10 | [Integration Tests for Advanced Features](#) | M (5) | P2 |

**Total Story Points**: ~48

**Key Changes from Original Plan (October 2025)**:
- ✅ Added: File upload (E6-S01) and attachments (E6-S02) from Epic 3
- ✅ Added: Issue link type discovery (E6-S03) and generic issue links (E6-S04) from Epic 3
- ✅ Kept: Security level, worklog, request participants, custom field fallback
- ✅ Priority adjusted: Attachments and issue links now P1 (lower priority than hierarchy)
- ✅ Added: Custom field fallback handler for edge cases
- ✅ Reduced scope: Focus on true "advanced" enterprise features not covered in Epic 2-3

---

## Epic 7: CLI Interface

**Goal**: Provide command-line interface for users who prefer terminal workflows.

**User Value**: Create, update, and transition issues from shell scripts or CI/CD pipelines.

**Acceptance Criteria**:
- ✅ `jml create --from <file>` command
- ✅ `jml update --jql <query> --set <fields>` command
- ✅ `jml transition --jql <query> --to <status>` command
- ✅ `--validate` flag for dry-run mode
- ✅ Exit codes for success/failure
- ✅ CLI help documentation

**Architecture Components**:
- CLI wrapper → [Architecture Doc §3.7](./architecture/system-architecture.md#7-cli-interface-epic-7)
- Uses core library modules

### Stories

| ID | Story | Size | Priority |
|----|-------|------|----------|
| E7-S01 | [CLI Argument Parser Setup](#) | S | P0 |
| E7-S02 | [Config Loading from .env or CLI args](#) | M | P0 |
| E7-S03 | [`jml create` Command Implementation](#) | M | P0 |
| E7-S04 | [`jml update` Command Implementation](#) | M | P1 |
| E7-S05 | [`jml transition` Command Implementation](#) | M | P1 |

**Total Story Points**: ~23

---

## Epic 8: Cloud API Support (Future)

**Goal**: Extend library to support JIRA Cloud API v3 alongside Server/DC v2.

**Scope**: Auto-detect API version, adapt field structures, handle Cloud-specific auth (OAuth).

**Status**: 🔮 Future (post-MVP)

---

## Epic 9: Python SDK (Future)

**Goal**: Port library to Python while maintaining identical API surface.

**Scope**: Python package with same config, converters, and operations as Node.js version.

**Status**: 🔮 Future (post-MVP)

---

## Story Sizing Guide

| Size | Story Points | Typical Effort | Can LLM Implement in One Shot? |
|------|--------------|----------------|--------------------------------|
| **S** (Small) | 3 | 2-4 hours | ✅ Yes |
| **M** (Medium) | 5 | 4-8 hours | ✅ Yes (with clear AC) |
| **L** (Large) | 8 | 1-2 days | ⚠️ Maybe (may need breakdown) |

**INVEST Principles**:
- **Independent**: Each story can be developed and tested independently
- **Negotiable**: Story details can be refined during implementation
- **Valuable**: Each story delivers user-facing value or critical infrastructure
- **Estimable**: Story size is clear based on architecture
- **Small**: Stories are 2-8 hours of work (LLM-implementable)
- **Testable**: Clear acceptance criteria for each story

---

## Next Steps

1. Review and prioritize Epic 1 stories
2. Create detailed story files in `/docs/stories/` for Epic 1
3. Set up development environment (Node.js 18+, TypeScript, Redis, JIRA test instance)
4. Begin implementation with E1-S01 (Project Setup)

---

## Notes

- All stories will have detailed acceptance criteria in individual story files
- Prerequisites to architecture components are linked in each epic
- Story estimates assume single developer with LLM assistance
- Integration tests require access to JIRA Server/DC test instance

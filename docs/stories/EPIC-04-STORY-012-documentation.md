# E4-S12: Bulk Operations Documentation

**Epic**: Epic 4 - Bulk Operations  
**Size**: Small (3 points)  
**Priority**: P1  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer using the library  
**I want** comprehensive documentation for bulk operations  
**So that** I understand how to use all bulk features effectively

---

## Acceptance Criteria

### ✅ AC1: Update README with Bulk Examples
- [ ] Add "Bulk Operations" section to README.md
- [ ] Show: Create from CSV file
- [ ] Show: Create from JSON array
- [ ] Show: Create from YAML file
- [ ] Show: Basic single vs bulk usage

**Evidence**: 

### ✅ AC2: Document Retry Pattern
- [ ] Show: Initial bulk create that partially fails
- [ ] Show: Using manifest ID to retry failed issues
- [ ] Show: Multiple retry attempts until all succeed
- [ ] Include: Best practices for handling failures

**Evidence**: 

### ✅ AC3: Document Validation Workflow
- [ ] Show: Fast schema-only validation (E4-S07)
- [ ] Show: Full pipeline validation (E4-S09)
- [ ] Show: Dry-run mode to inspect payloads (E4-S08)
- [ ] Explain: When to use which validation method

**Evidence**: 

### ✅ AC4: Document Error Handling
- [ ] Explain: BulkResult structure
- [ ] Explain: Partial success handling
- [ ] Show: Accessing failed rows and error details
- [ ] Show: Generating rollback JQL

**Evidence**: 

### ✅ AC5: Performance Best Practices
- [ ] Document: Optimal batch sizes from E4-S11
- [ ] Document: Performance expectations (100 issues ~8-10s)
- [ ] Document: When to use validation vs create directly
- [ ] Document: Redis caching benefits

**Evidence**: 

### ✅ AC6: Document Hierarchy with UIDs (E4-S13)
- [ ] Show: Creating Epic → Story → Subtask with UIDs in one call
- [ ] Show: Parent reference formats (UID, key, summary)
- [ ] Show: CSV with numeric UIDs (row numbers)
- [ ] Show: Retry after partial hierarchy failure
- [ ] Explain: UID resolution priority (explicit UID → key → local summary → JIRA summary)
- [ ] Explain: Ambiguity policy configuration for parent references

**Evidence**: 

---

## Technical Notes

### Architecture Prerequisites
- All Epic 4 stories complete (documenting implemented features)

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**N/A** - Documentation story, no tests required.

---

## Related Stories

- **Depends On**: E4-S01 through E4-S13 (documents all bulk operation features including UID hierarchy support)
- **Blocks**: None
- **Related**: None

---

## Testing Strategy

### Documentation Validation
- **Not traditional testing** - verify documentation accuracy
- **Approach**: Run all code examples from docs
- **Focus Areas**:
  - README examples work as written
  - Retry pattern examples valid
  - Validation workflow examples valid
  - Error handling examples accurate

### Reuse Existing Demos
- README examples should reference existing demos
- E4-S04 demo (bulk creation)
- E4-S05 demo (retry pattern)
- E4-S07 demo (validation)
- E4-S08 demo (dry-run)

### Prerequisites
- All Epic 4 stories complete
- All demos from E4-S01 through E4-S11 working

---

## Technical Notes

### Architecture Prerequisites
- E4-S01 through E4-S11: All bulk operation features implemented

### Implementation Guidance

**README structure for bulk operations:**

```markdown
## Bulk Operations

### Basic Bulk Creation

Create multiple issues from arrays, CSV, JSON, or YAML:

```typescript
// From array
const result = await jml.issues.create([
  { Project: 'ENG', 'Issue Type': 'Task', Summary: 'Task 1' },
  { Project: 'ENG', 'Issue Type': 'Task', Summary: 'Task 2' }
]);

console.log(`Created ${result.succeeded} of ${result.total} issues`);

// From CSV file
const result = await jml.issues.create({ from: 'issues.csv' });

// From JSON file
const result = await jml.issues.create({ from: 'issues.json' });

// From CSV string
const csv = `Project,Issue Type,Summary
ENG,Task,Task 1
ENG,Task,Task 2`;
const result = await jml.issues.create({ data: csv, format: 'csv' });
```

### Handling Failures with Retry

If some issues fail, use the manifest ID to retry:

```typescript
// Initial creation
const result = await jml.issues.create('issues.csv');

if (result.failed > 0) {
  console.log(`${result.failed} issues failed`);
  result.errors.forEach(err => {
    console.log(`Row ${err.rowIndex}: ${err.message}`);
  });
  
  // Fix the CSV file, then retry with manifest ID
  const retryResult = await jml.issues.create('issues.csv', {
    retry: result.manifest.id
  });
  
  console.log(`Retry: ${retryResult.succeeded} succeeded, ${retryResult.failed} still failed`);
}
```

### Validation Before Creation

Validate your data before creating issues:

```typescript
// Fast schema-only validation (no API calls)
const validation = await jml.issues.validate('issues.csv');
if (!validation.valid) {
  validation.errors.forEach(err => {
    console.log(`Row ${err.rowIndex}, ${err.field}: ${err.message}`);
  });
  return;  // Fix errors before creating
}

// Full pipeline validation (includes lookups)
const fullValidation = await jml.issues.validateFull('issues.csv');
// Catches ambiguous user names, not-found components, etc.

// Dry-run mode (shows JIRA payload without creating)
const dryRun = await jml.issues.create('issues.csv', { validate: true });
dryRun.payloads.forEach(item => {
  console.log(`Row ${item.index}:`, JSON.stringify(item.payload));
});
```

### Rollback Created Issues

Generate a JIRA search URL to review and delete created issues:

```typescript
const result = await jml.issues.create('issues.csv');

// Generate rollback link
const rollback = await jml.issues.generateRollbackJQL(result.manifest.id);
console.log(`Review and delete at: ${rollback.url}`);
// Opens: https://your-jira.atlassian.net/issues/?jql=key%20IN%20(ENG-123%2CENG-124)
```

### Performance Tips

- **Batch size**: Optimal is 50 issues per batch (default)
- **Expected performance**: 100 issues in ~8-10 seconds
- **Use validation sparingly**: Only validate when you expect errors
- **Enable Redis**: Speeds up field lookups significantly
```

---

## Implementation Example

**File structure after documentation:**
```
README.md
  └── "Bulk Operations" section added

docs/
  ├── performance.md (from E4-S11)
  └── examples/
      ├── bulk-from-csv.md
      ├── bulk-retry-pattern.md
      └── bulk-validation.md
```

**Example README section:**
```markdown
## Bulk Operations

Create hundreds of issues from CSV, JSON, or YAML files in seconds.

### Quick Start

```typescript
// Create 100 issues from CSV
const result = await jml.issues.create('issues.csv');
console.log(`✅ Created ${result.succeeded} issues`);
console.log(`❌ Failed ${result.failed} issues`);

// Retry failures
if (result.failed > 0) {
  const retry = await jml.issues.create('issues.csv', {
    retry: result.manifest.id
  });
}
```

[Full documentation...](docs/bulk-operations.md)
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] README.md updated with "Bulk Operations" section
- [ ] Examples cover: CSV/JSON/YAML, retry, validation, rollback
- [ ] Performance best practices documented
- [ ] Error handling guide included
- [ ] Demo created showing documentation examples work
- [ ] Links from README to detailed docs (if created)
- [ ] Code examples tested and verified
- [ ] Committed with message: `E4-S12: Add bulk operations documentation`

---

## Definition of Done Exceptions

**Demo Exception (Partial):**
Demo can reuse existing demos from E4-S04, E4-S05, E4-S08, E4-S09 rather than creating new demos. The evidence can be links to those demos with a note: "Documentation examples verified against existing demos from [story IDs]."

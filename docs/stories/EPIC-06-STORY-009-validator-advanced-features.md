# E6-S09: Universal Validator - Advanced Features (Drift, Enums, Rollout)

**Epic**: Epic 6 - Advanced Features  
**Size**: Medium (5 points)  
**Priority**: P2  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** JIRA Magic Library developer  
**I want** advanced validation features like drift detection, enum validation, and rollout flags  
**So that** I can safely detect schema changes, handle field value constraints, and gradually adopt strict validation

---

## Context

E3-S10 built the core UniversalValidator with JSON Schema (Ajv) and hybrid type detection. This story adds production-ready features:

**Note**: This story was moved from Epic 3 to Epic 6 (November 2025) as it represents advanced validation infrastructure rather than core hierarchy/complex type functionality.

1. **Drift Detection**: Detect when JIRA schema changes vs. cached validator (e.g., new enum values, field removed)
2. **Enum Validation**: Optionally include `enum` constraints in JSON Schema for stricter validation
3. **Rollout Flags**: Safely rollout validation with log-only mode → enforce mode
4. **Per-Project Toggles**: Enable/disable validation per project or issue type

**Why these features?**
- **Drift**: JIRA schemas change over time (new enum values, deprecated fields). Without detection, cached validators silently become stale.
- **Enums**: Some teams want strict enum validation (reject unknown option IDs), others want permissive (log warnings).
- **Rollout**: Gradual adoption prevents breaking existing code. Start with log-only, observe, then enforce.
- **Toggles**: Different projects have different validation needs. Enable granular control.

---

## Acceptance Criteria

### ✅ AC1: Implement Drift Detection
- [ ] Add `detectDrift(projectSchema): DriftReport` method to UniversalValidator
- [ ] Compare cached schema hash vs. current schema hash
- [ ] If hashes differ, compare field-by-field:
  - Fields added (new fields in current schema)
  - Fields removed (fields in cached schema, not in current)
  - Fields changed (schema.type different, allowedValues changed)
- [ ] Return `DriftReport` with arrays: `fieldsAdded`, `fieldsRemoved`, `fieldsChanged`
- [ ] Log drift events with severity levels (info: added, warn: changed, error: removed)
- [ ] 95% test coverage with unit tests

**Evidence**: TBD


### ✅ AC2: Refresh-Once on Drift
- [ ] Add `autoRefreshOnDrift: boolean` option to UniversalValidator constructor (default: true)
- [ ] When validation fails and drift detected:
  1. Clear cached validator for this project/issueType
  2. Rebuild validator from fresh schema
  3. Retry validation once
  4. If still fails, return validation errors
- [ ] Log drift detection and refresh event
- [ ] Track refresh count to prevent infinite loops (max 1 refresh per validation call)
- [ ] 95% test coverage with unit tests

**Evidence**: TBD


### ✅ AC3: Optional Enum Validation
- [ ] Add `includeEnums: boolean` option to schema builder (default: false)
- [ ] When true, add `enum` constraint to JSON Schema for fields with `allowedValues`:
  ```typescript
  // Without enums (permissive)
  { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }
  
  // With enums (strict)
  { type: 'object', required: ['id'], properties: { id: { type: 'string', enum: ['10001', '10002'] } } }
  ```
- [ ] For cascading select fields, apply enum to both parent and child IDs
- [ ] Test with valid and invalid option IDs
- [ ] 95% test coverage with unit tests

**Evidence**: TBD


### ✅ AC4: Rollout Flags (Log-Only vs Enforce Mode)
- [ ] Add `validationMode: 'log-only' | 'enforce'` option to UniversalValidator constructor (default: 'enforce')
- [ ] In **log-only mode**:
  - Always return `{ ok: true }` (never fail validation)
  - Log validation errors with severity: warn
  - Include field name, error message, payload snippet in log
- [ ] In **enforce mode**:
  - Return `{ ok: false, errors }` on validation failure (existing behavior)
  - Log validation errors with severity: error
- [ ] Add `validationMode` to validation result for observability
- [ ] 95% test coverage with unit tests

**Evidence**: TBD


### ✅ AC5: Per-Project Validation Toggles
- [ ] Add `validationConfig` option to UniversalValidator:
  ```typescript
  interface ValidationConfig {
    enabled: boolean;                 // Global toggle
    projects?: {                      // Per-project override
      [projectKey: string]: {
        enabled: boolean;
        issueTypes?: {                // Per-issueType override
          [issueType: string]: boolean;
        };
      };
    };
  }
  ```
- [ ] Implement `isValidationEnabled(projectKey, issueType): boolean` helper
- [ ] If validation disabled, skip validation and return `{ ok: true }` (shortcut)
- [ ] Log when validation is skipped due to config
- [ ] 95% test coverage with unit tests

**Evidence**: TBD


### ✅ AC6: Unit Tests for Advanced Features
- [ ] **Drift Detection Tests**:
  - Test no drift (hashes match)
  - Test drift: field added (new field in schema)
  - Test drift: field removed (cached field missing in current)
  - Test drift: field changed (type changed, allowedValues changed)
  - Test drift report format
- [ ] **Refresh Tests**:
  - Test refresh on drift (validation succeeds after refresh)
  - Test refresh once only (no infinite loop)
  - Test refresh logging
- [ ] **Enum Validation Tests**:
  - Test with enums enabled (reject unknown option ID)
  - Test with enums disabled (accept unknown option ID)
  - Test cascading select with enums (both parent and child)
- [ ] **Rollout Flag Tests**:
  - Test log-only mode (always returns ok: true)
  - Test enforce mode (returns ok: false on error)
  - Test logging in both modes
- [ ] **Toggle Tests**:
  - Test global enabled=false (validation skipped)
  - Test per-project toggle (enabled for ZUL, disabled for DEV)
  - Test per-issueType toggle (enabled for Bug, disabled for Epic)
- [ ] All tests pass with 95% coverage maintained

**Evidence**: TBD


### ✅ AC7: Integration Tests with Real Schemas
- [ ] Test drift detection with real JIRA schema (change allowedValues)
- [ ] Test refresh-once with simulated drift scenario
- [ ] Test enum validation with real cascading select field (ZUL Level)
- [ ] Test log-only mode with intentionally invalid payload
- [ ] Test per-project toggle with multiple projects
- [ ] All tests pass with 95% coverage maintained

**Evidence**: TBD


### ✅ AC8: Update Demo Script
- [ ] Extend `examples/universal-validator-demo.ts` to show:
  - Drift detection example (compare two schemas)
  - Refresh-once example (simulate drift, show refresh)
  - Enum validation comparison (with/without enums)
  - Log-only mode (show warnings, not errors)
  - Per-project toggle (enable for ZUL, disable for TEST)
- [ ] Include clear console output showing each feature
- [ ] All demos run successfully

**Evidence**: TBD

---

## Technical Notes

### Architecture Prerequisites
- **E3-S10**: UniversalValidator class, schema builder, Ajv configuration
- **SchemaDiscovery**: Provides field schemas with `allowedValues` for enum validation
- **RedisCache**: May integrate drift detection with cache invalidation (future enhancement)

### Drift Detection Strategy

**Problem**: JIRA schemas change over time:
- New fields added (e.g., custom field created)
- Fields removed (e.g., field deprecated)
- Field constraints change (e.g., new option added to dropdown)

**Solution**: Hash-based drift detection
1. Generate schema hash from `createmeta` response
2. Store hash with compiled validator
3. On validation, compare current hash vs. cached hash
4. If different, report drift and optionally refresh

**Hash generation**:
```typescript
import crypto from 'crypto';

function generateSchemaHash(projectSchema: ProjectSchema): string {
  const normalized = JSON.stringify(projectSchema, Object.keys(projectSchema).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

### Enum Validation Trade-offs

**Without enums (default)**:
- ✅ Flexible: Accepts new option values without validator update
- ✅ Fast: Smaller schema, faster compilation
- ❌ Permissive: Allows invalid option IDs (caught by JIRA API later)

**With enums**:
- ✅ Strict: Rejects invalid option IDs early
- ❌ Brittle: Requires validator refresh when JIRA adds new options
- ❌ Slower: Larger schema, slower compilation

**Recommendation**: Use enums=false (default) for most cases. Enable enums for critical fields with stable value sets.

### Rollout Strategy

**Phase 1: Observe (Log-Only)**
```typescript
const validator = new UniversalValidator({
  validationMode: 'log-only',
  autoRefreshOnDrift: true
});

// Validation always succeeds, errors logged to console
const result = validator.validate(schema, payload);
// result.ok === true (always)
```

**Phase 2: Enforce (After Observing)**
```typescript
const validator = new UniversalValidator({
  validationMode: 'enforce',  // Now fail on errors
  autoRefreshOnDrift: true
});

// Validation can fail
const result = validator.validate(schema, payload);
if (!result.ok) {
  console.error('Validation failed:', result.errors);
}
```

**Phase 3: Granular Control**
```typescript
const validator = new UniversalValidator({
  validationMode: 'enforce',
  validationConfig: {
    enabled: true,
    projects: {
      'ZUL': { enabled: true },        // Enforce for ZUL
      'DEV': { enabled: false },       // Skip for DEV (testing)
      'PROD': {
        enabled: true,
        issueTypes: {
          'Bug': true,                 // Enforce for PROD Bugs
          'Epic': false                // Skip for PROD Epics
        }
      }
    }
  }
});
```

### Implementation Structure

```typescript
// src/converters/validation/UniversalValidator.ts

export interface ValidatorOptions {
  cacheSchemas?: boolean;
  metaHash?: string;
  includeEnums?: boolean;              // AC3
  validationMode?: 'log-only' | 'enforce';  // AC4
  autoRefreshOnDrift?: boolean;        // AC2
  validationConfig?: ValidationConfig; // AC5
}

export interface DriftReport {        // AC1
  hasDrift: boolean;
  fieldsAdded: string[];
  fieldsRemoved: string[];
  fieldsChanged: Array<{
    fieldKey: string;
    oldType: string;
    newType: string;
  }>;
}

export class UniversalValidator {
  private options: ValidatorOptions;
  private schemaCache: Map<string, { validator: ValidateFunction, hash: string }>;
  
  constructor(options?: ValidatorOptions) {
    this.options = {
      cacheSchemas: true,
      includeEnums: false,
      validationMode: 'enforce',
      autoRefreshOnDrift: true,
      ...options
    };
    this.schemaCache = new Map();
  }
  
  validate(projectSchema: ProjectSchema, payload: any): ValidationResult {
    // Check if validation enabled for this project/issueType (AC5)
    if (!this.isValidationEnabled(projectSchema.projectKey, payload.fields.issuetype?.name)) {
      return { ok: true, validationSkipped: true };
    }
    
    // Generate current schema hash
    const currentHash = generateSchemaHash(projectSchema);
    
    // Check for drift (AC1)
    const cached = this.schemaCache.get(projectSchema.projectKey);
    if (cached && cached.hash !== currentHash) {
      const drift = this.detectDrift(cached, projectSchema);
      this.logDrift(drift);
      
      // Auto-refresh on drift (AC2)
      if (this.options.autoRefreshOnDrift) {
        this.schemaCache.delete(projectSchema.projectKey);
        return this.validate(projectSchema, payload);  // Retry once
      }
    }
    
    // Build or retrieve validator
    const validator = this.getOrBuildValidator(projectSchema, currentHash);
    
    // Validate
    const valid = validator(payload);
    
    // Handle log-only mode (AC4)
    if (this.options.validationMode === 'log-only') {
      if (!valid) {
        this.logErrors(validator.errors, 'warn');
      }
      return { ok: true, validationMode: 'log-only' };
    }
    
    // Enforce mode
    if (!valid) {
      this.logErrors(validator.errors, 'error');
      return { ok: false, errors: this.normalizeErrors(validator.errors, projectSchema) };
    }
    
    return { ok: true };
  }
  
  detectDrift(cached: any, current: ProjectSchema): DriftReport {
    // AC1: Compare schemas field-by-field
    // ...
  }
  
  isValidationEnabled(projectKey: string, issueType?: string): boolean {
    // AC5: Check validation config
    // ...
  }
}
```

---

## Related Stories

- **Depends On**: E3-S10 (Universal Schema Validator - Done ✅)
- **Blocks**: None (optional enhancement - can be implemented before or after E3-S12)
- **Related**: E1-S04 (Redis Cache - for future cache invalidation on drift), E3-S12 (Converter Migration)

---

## Definition of Done

### Code Complete
- [ ] Drift detection implemented with field-level comparison (AC1)
- [ ] Auto-refresh on drift with max-once safeguard (AC2)
- [ ] Optional enum validation with strict mode (AC3)
- [ ] Rollout flags (log-only vs enforce mode) (AC4)
- [ ] Per-project validation toggles (AC5)
- [ ] Demo script updated with advanced features examples (AC8)

### Testing Complete
- [ ] 95% test coverage maintained (currently 98.66%)
- [ ] All existing unit tests pass (627+ tests)
- [ ] New unit tests for advanced features (50+ tests covering drift, enums, rollout, toggles - AC6)
- [ ] Integration tests with real schemas (AC7)
- [ ] Drift detection tested with schema changes
- [ ] Refresh-once tested with simulated drift
- [ ] Log-only mode tested with invalid payloads

### Documentation Complete
- [ ] JSDoc comments on new methods (detectDrift, isValidationEnabled)
- [ ] Code comments explain drift detection and refresh strategy
- [ ] Testing Strategy section in story file (below)
- [ ] Technical Notes explain rollout strategy and enum trade-offs

### Quality Checks
- [ ] ESLint passes with no warnings
- [ ] TypeScript compiles with no errors
- [ ] No console.log statements left in code (use proper logging)
- [ ] Code follows existing patterns (UniversalValidator class)

### Demo & Validation
- [ ] Demo script runs successfully (examples/universal-validator-demo.ts - AC8)
- [ ] Demo shows drift detection with clear output
- [ ] Demo shows refresh-once behavior
- [ ] Demo shows enum validation comparison (strict vs permissive)
- [ ] Demo shows log-only mode vs enforce mode
- [ ] Workflow validator passes (`npm run validate:workflow`)

---

## Testing Strategy

### Unit Tests (`tests/unit/converters/validation/`)

**Drift Detection Tests** (AC1):
- `detectDrift() with no changes`: Returns `hasDrift: false`
- `detectDrift() with field added`: Returns field in `fieldsAdded`
- `detectDrift() with field removed`: Returns field in `fieldsRemoved`
- `detectDrift() with field type changed`: Returns field in `fieldsChanged` with old/new types
- `detectDrift() with allowedValues changed`: Detects change in option field

**Refresh Tests** (AC2):
- `autoRefreshOnDrift=true`: Clears cache and rebuilds validator on drift
- `autoRefreshOnDrift=false`: Does not refresh, uses stale validator
- `Refresh max once`: Prevents infinite loop if validation still fails after refresh
- `Refresh logging`: Logs drift event with severity warn

**Enum Validation Tests** (AC3):
- `includeEnums=false` (default): Accepts unknown option ID (permissive)
- `includeEnums=true`: Rejects unknown option ID with clear error
- `Cascading select with enums`: Validates both parent and child IDs
- `Schema structure with enums`: Verify `enum` constraint added to JSON Schema

**Rollout Flag Tests** (AC4):
- `validationMode='log-only'`: Always returns `ok: true`, logs errors as warnings
- `validationMode='enforce'`: Returns `ok: false` on validation failure, logs errors
- `Log output format`: Includes field name, error message, payload snippet

**Toggle Tests** (AC5):
- `validationConfig.enabled=false`: Validation skipped globally
- `Per-project toggle`: Enabled for ZUL, disabled for DEV
- `Per-issueType toggle`: Enabled for Bug, disabled for Epic
- `isValidationEnabled()`: Returns correct boolean based on config
- `Shortcut on disabled`: Returns `{ ok: true, validationSkipped: true }` immediately

**Coverage Target**: 95% (all branches, edge cases)

### Integration Tests (`tests/integration/validation/`)

**Real Schema Drift Test**:
- Fetch schema from JIRA (ZUL project)
- Simulate drift by modifying allowedValues
- Verify drift detection reports change
- Verify auto-refresh rebuilds validator

**Real Enum Validation Test**:
- Validate cascading Level field with enums enabled
- Test with valid parent/child IDs (should pass)
- Test with invalid parent/child IDs (should fail)

**Log-Only Mode Test**:
- Create intentionally invalid payload (wrong field type)
- Run validator in log-only mode
- Verify validation returns `ok: true`
- Verify warning logged to console

**Per-Project Toggle Test**:
- Configure validation for multiple projects (ZUL: enabled, TEST: disabled)
- Validate payloads for both projects
- Verify ZUL validation runs, TEST validation skipped

**Coverage Target**: 95% (real JIRA scenarios)

### Testing Prerequisites

**Before running tests, ensure:**
- [ ] Redis running on localhost:6379 (`docker run -d -p 6379:6379 redis`)
- [ ] .env file configured with JIRA credentials
- [ ] JIRA_PROJECT_KEY set (for integration tests)
- [ ] ZUL project accessible with cascading Level field

**Start Prerequisites**:
```bash
# Start Redis
docker run -d -p 6379:6379 --name jml-redis redis:7-alpine

# Verify .env
cat .env | grep JIRA_BASE_URL
cat .env | grep JIRA_PROJECT_KEY

# Run tests
npm test
```

---

## Definition of Done Exceptions

{If requesting exception, use template from [dod-exceptions.md](../workflow/reference/dod-exceptions.md)}

---

## Implementation Notes

**Estimated Effort**:
- AC1 (Drift Detection): 1-2 hours
- AC2 (Refresh-Once): 1 hour
- AC3 (Enum Validation): 1 hour
- AC4 (Rollout Flags): 1 hour
- AC5 (Per-Project Toggles): 1-2 hours
- AC6 (Unit Tests): 2 hours
- AC7 (Integration Tests): 1-2 hours
- AC8 (Demo Update): 30 minutes

**Total**: 8-11 hours (Medium story - 5 points)

**Risk Areas**:
- Drift detection hash collisions (low risk with SHA-256)
- Refresh infinite loop if validation always fails (mitigated with max-once safeguard)
- Enum validation performance with large `allowedValues` arrays (low risk, Ajv is fast)
- Toggle config complexity (mitigated with clear helper method)

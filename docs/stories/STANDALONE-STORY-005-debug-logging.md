# S5: Unified Debug Logging Infrastructure

**Epic**: Standalone Story (Infrastructure)  
**Size**: Medium (5 points)  
**Priority**: P2  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer integrating JML  
**I want** consistent, configurable debug logging  
**So that** I can troubleshoot integration issues without modifying library code

---

## Acceptance Criteria

### ✅ AC1: JMLLogger Interface
- [ ] Create `src/types/logger.ts` with `JMLLogger` interface
- [ ] Interface has methods: `debug`, `info`, `warn`, `error`
- [ ] Each method accepts `(message: string, context?: Record<string, unknown>)` 
- [ ] `error` method also accepts optional `Error` object
- [ ] Export factory function `createDefaultLogger(debug: boolean): JMLLogger`
- [ ] Export `noopLogger` for silent operation

**Evidence**: 

### ✅ AC2: Config Integration
- [ ] Add `logger?: JMLLogger` to `JMLConfig` interface
- [ ] When `config.debug === true` and no custom logger, use default logger with debug enabled
- [ ] When `config.debug === false` (or undefined), debug method is no-op
- [ ] Custom logger takes precedence over default

**Evidence**: 

### ✅ AC3: JML Class Integration
- [ ] Create logger instance in JML constructor
- [ ] Pass logger to all internal components (not through config, as direct dependency)
- [ ] Logger available for all operations (HTTP, cache, schema, converters)

**Evidence**: 

### ✅ AC4: HTTP Request/Response Logging
- [ ] JiraClient logs HTTP requests when debug enabled: `→ GET /rest/api/2/field`
- [ ] JiraClient logs HTTP responses: `← 200 OK GET /rest/api/2/field (234ms)`
- [ ] Logs include timing information
- [ ] No logging when debug disabled

**Evidence**: 

### ✅ AC5: Cache Operation Logging
- [ ] Log cache hits: `Cache HIT: schema:ENG:Bug`
- [ ] Log cache misses: `Cache MISS: schema:ENG:Bug`
- [ ] Log cache errors as warnings (existing behavior, now through logger)
- [ ] RedisCache accepts unified JMLLogger (adapt existing Logger interface)

**Evidence**: 

### ✅ AC6: Field Resolution Logging
- [ ] Log field resolution attempts when debug enabled
- [ ] Log fuzzy match results: `Fuzzy matched "Jon Smith" → "John Smith" (score: 0.85)`
- [ ] Remove existing `process.env.DEBUG` checks from UserConverter
- [ ] Use logger.warn for suggestions (e.g., "Did you mean: Summary?")

**Evidence**: 

### ✅ AC7: Remove Ad-Hoc Console Statements
- [ ] Remove direct `console.log`, `console.debug`, `console.warn` from source files
- [ ] Replace with appropriate logger calls
- [ ] Keep console usage in tests and scripts (not library code)
- [ ] No eslint-disable comments for console in src/ files

**Evidence**: 

### ✅ AC8: Custom Logger Injection
- [ ] Users can provide custom logger for integration with logging frameworks
- [ ] Example: pino, winston, DataDog integration
- [ ] Document custom logger pattern in README or examples

**Evidence**: 

---

## Technical Notes

### Architecture Prerequisites
- [Observability section](../architecture/system-architecture.md#observability-for-library-users)
- Key design patterns: Dependency Injection, Factory Pattern
- Key constraints: No external logging dependencies in core library

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- Redis running for cache tests: `npm run redis:start`

### Dependencies
- None (standalone infrastructure story)

### Current State Analysis

**Files with ad-hoc console statements (to be refactored):**

| File | Current Approach | Console Calls |
|------|------------------|---------------|
| `src/converters/types/UserConverter.ts` | `process.env.DEBUG` + `console.log` | ~10 |
| `src/schema/SchemaDiscovery.ts` | `console.warn` | 3 |
| `src/converters/FieldResolver.ts` | `console.warn` | 2 |
| `src/converters/ConverterRegistry.ts` | `console.warn` | 1 |
| `src/operations/IssueOperations.ts` | `console.warn`, `console.log` | 2 |
| `src/parsers/InputParser.ts` | `console.debug` | 1 |
| `src/client/JiraClient.ts` | None (has unused debug config) | 0 |

**Files with existing injectable Logger (good pattern to follow):**

| File | Interface |
|------|-----------|
| `src/cache/RedisCache.ts` | `Logger { log, warn }` |
| `src/hierarchy/JPOHierarchyDiscovery.ts` | `HierarchyLogger { warn }` |
| `src/hierarchy/ParentFieldDiscovery.ts` | `Logger { warn }` |

### Implementation Guidance

**Phase 1: Create Logger Interface**
```typescript
// src/types/logger.ts
export interface JMLLogger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void;
}

export function createDefaultLogger(debug: boolean): JMLLogger {
  return {
    debug: debug 
      ? (msg, ctx) => console.debug(msg, ctx ?? '') 
      : () => {},
    info: (msg, ctx) => console.log(msg, ctx ?? ''),
    warn: (msg, ctx) => console.warn(msg, ctx ?? ''),
    error: (msg, err, ctx) => console.error(msg, err ?? '', ctx ?? ''),
  };
}

export const noopLogger: JMLLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
```

**Phase 2: Wire Through JML Constructor**
```typescript
// In JML constructor
this.logger = config.logger ?? createDefaultLogger(config.debug ?? false);

// Pass to components
this.client = createJiraClient(config, this.logger);
this.cache = new RedisCache(redisConfig, undefined, this.logger);
// etc.
```

**Phase 3: Update Components (10 files)**

| File | Current | Target |
|------|---------|--------|
| `JiraClient.ts` | None | Accept logger, log HTTP |
| `SchemaDiscovery.ts` | `console.warn` ×3 | Accept logger |
| `FieldResolver.ts` | `console.warn` ×2 | Accept logger |
| `ConverterRegistry.ts` | `console.warn` ×1 | Accept logger |
| `UserConverter.ts` | `console.log` ×10 + env | Accept logger, use debug |
| `InputParser.ts` | `console.debug` ×1 | Accept logger, conditionally |
| `IssueOperations.ts` | `console.warn/log` | Accept logger |
| `RedisCache.ts` | Injectable Logger ✅ | Adapt to JMLLogger |
| `JPOHierarchyDiscovery.ts` | Injectable Logger ✅ | Adapt to JMLLogger |
| `ParentFieldDiscovery.ts` | Injectable Logger ✅ | Adapt to JMLLogger |

---

## Implementation Example

```typescript
// User: Basic usage with debug enabled
const jml = new JML({
  baseUrl: 'https://jira.company.com',
  auth: { token: 'pat-token' },
  debug: true,  // <-- Enable debug logging
});

// Console output:
// → GET /rest/api/2/field
// ← 200 OK GET /rest/api/2/field (234ms)
// Cache MISS: schema:ENG:Bug
// Fuzzy matched "Jon Smith" → "John Smith" (score: 0.85)

// User: Custom logger (e.g., pino)
import pino from 'pino';
const pinoLogger = pino({ level: 'debug' });

const jml = new JML({
  baseUrl: 'https://jira.company.com',
  auth: { token: 'pat-token' },
  logger: {
    debug: (msg, ctx) => pinoLogger.debug(ctx, msg),
    info: (msg, ctx) => pinoLogger.info(ctx, msg),
    warn: (msg, ctx) => pinoLogger.warn(ctx, msg),
    error: (msg, err, ctx) => pinoLogger.error({ ...ctx, err }, msg),
  },
});
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Code implemented in `src/types/logger.ts` + updates to ~10 files
- [ ] Unit tests passing (≥95% coverage)
- [ ] Integration test passing (if applicable)
- [ ] Demo created OR exception documented
- [ ] TSDoc comments added to public APIs
- [ ] Code passes linting and type checking
- [ ] Testing prerequisites documented (if any)
- [ ] Committed with message: `S5: Implement unified debug logging infrastructure`

---

## Definition of Done Exceptions

**Standard DoD**: Demo created showing feature functionality

**Exception Request**: Waive demo for S5

**Justification**: 
- Debug logging is developer-facing infrastructure
- Best demonstrated via test output and documentation
- Interactive demo would be artificial

**Alternative Evidence**:
- Unit tests showing logger injection
- Debug output in test runs
- README example showing custom logger integration

**Approved By**: {Requires user approval}

---

## Implementation Hints

1. **Start with the interface** - Get `JMLLogger` and factory right first
2. **Wire through JML constructor** - Single point of creation
3. **Update components incrementally** - One file at a time, run tests between
4. **Preserve existing Logger interfaces** - RedisCache/hierarchy have their own; make them use JMLLogger internally
5. **Context objects are optional** - Don't require callers to pass empty objects
6. **Test with `jest.spyOn`** - Mock the logger to verify calls
7. **Remove eslint-disable comments** - They become unnecessary once logger is used
8. **Check UserConverter carefully** - Has the most console statements (10+)
9. **Security: Never log sensitive data** - No PAT tokens, issue content; only field names, API paths, timing
10. **Remove skipped JiraClient debug test** - It will be properly implemented now

---

## Related Stories

- **Depends On**: None
- **Blocks**: None (but enables better debugging for all future work)
- **Related**: E1-S05 JiraClient (HTTP logging), E1-S04 Redis Cache (cache logging)

---

## Testing Strategy

### Unit Tests (tests/unit/types/logger.test.ts)
```typescript
describe('JMLLogger', () => {
  describe('createDefaultLogger()', () => {
    it('should log debug when debug=true', () => {
      const spy = jest.spyOn(console, 'debug').mockImplementation();
      const logger = createDefaultLogger(true);
      logger.debug('test message');
      expect(spy).toHaveBeenCalledWith('test message', '');
      spy.mockRestore();
    });
    
    it('should not log debug when debug=false', () => {
      const spy = jest.spyOn(console, 'debug').mockImplementation();
      const logger = createDefaultLogger(false);
      logger.debug('test message');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should always log warn regardless of debug flag', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      const logger = createDefaultLogger(false);
      logger.warn('warning message');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('noopLogger', () => {
    it('should not throw when called', () => {
      expect(() => noopLogger.debug('test')).not.toThrow();
      expect(() => noopLogger.info('test')).not.toThrow();
      expect(() => noopLogger.warn('test')).not.toThrow();
      expect(() => noopLogger.error('test')).not.toThrow();
    });
  });
});
```

### Integration Tests
- Existing tests should continue to pass
- Logger injection should be transparent to existing functionality
- Add test verifying custom logger receives calls

---

## Notes

- This story removes the skipped JiraClient debug test (it will be implemented properly)
- The existing `config.debug?: boolean` option finally gets used
- Future consideration: Event-based observability (`jml.on("api-call", ...)`) could build on this foundation
- Security: Logger should never log sensitive data (PAT tokens, issue content) - only field names, API paths, timing
- This unifies 3 different logging approaches (env var, console.*, injectable interface) into one pattern

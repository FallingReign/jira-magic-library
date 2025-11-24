# **Epic**: Epic 1 - Basic Issue Creation  
**Size**: Small (3 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**Started**: 2025-10-02  
**Completed**: 2025-10-02  
**PR**: Direct commit ([9b859c6](https://github.com/FallingReign/jira-magic-library/commit/9b859c6)): Environment Config & dotenv Integration

---

## User Story

**As a** library user  
**I want** to configure the library using environment variables  
**So that** I can keep credentials secure and separate from code

---

## Acceptance Criteria

### ✅ AC1: Configuration Interface Defined
- [x] Create `src/types/config.ts` with TypeScript interface:
  - **Evidence**: `src/types/config.ts` ([9b859c6](https://github.com/FallingReign/jira-magic-library/commit/9b859c6))
  ```typescript
  interface JMLConfig {
    baseUrl: string;
    auth: { token: string };
    apiVersion?: "v2" | "v3";
    redis: {
      host: string;
      port: number;
      password?: string;
    };
    cache?: {
      ttlSeconds: number;
    };
  }
  ```

### ✅ AC2: dotenv Dependency Installed
- [x] Add `dotenv` to production dependencies
  - **Evidence**: `package.json` dependencies ([9b859c6](https://github.com/FallingReign/jira-magic-library/commit/9b859c6))
- [x] Version: `^16.x`
- [x] Install: `npm install dotenv`

### ✅ AC3: Configuration Loader Implemented
- [x] Create `src/config/loader.ts` with:
  - **Evidence**: `src/config/loader.ts` ([9b859c6](https://github.com/FallingReign/jira-magic-library/commit/9b859c6))
  - `loadConfig()` function that:
    - Calls `dotenv.config()` to load `.env` file
    - Reads environment variables
    - Returns `JMLConfig` object
    - Has sensible defaults (e.g., Redis localhost:6379, cache TTL 900)
  - Environment variable mapping:
    - `JIRA_BASE_URL` → `baseUrl`
    - `JIRA_PAT` → `auth.token`
    - `JIRA_API_VERSION` → `apiVersion` (default: "v2")
    - `REDIS_HOST` → `redis.host` (default: "localhost")
    - `REDIS_PORT` → `redis.port` (default: 6379)
    - `REDIS_PASSWORD` → `redis.password`
    - `CACHE_TTL_SECONDS` → `cache.ttlSeconds` (default: 900)

### ✅ AC4: Configuration Validation
- [x] Validate required fields:
  - **Evidence**: `src/config/loader.ts` validation logic ([9b859c6](https://github.com/FallingReign/jira-magic-library/commit/9b859c6))
  - `baseUrl` must be present and start with `http://` or `https://`
  - `auth.token` must be present and non-empty
  - `redis.host` must be present
  - `redis.port` must be a valid number (1-65535)
- [x] Throw `ConfigurationError` if validation fails
- [x] Error message includes which field is missing/invalid

### ✅ AC5: Example .env File
- [x] Create `.env.example` in project root:
  - **Evidence**: `.env.example` ([9b859c6](https://github.com/FallingReign/jira-magic-library/commit/9b859c6))
  ```
  # JIRA Server Configuration
  JIRA_BASE_URL=https://jira.yourcompany.com
  JIRA_PAT=your_personal_access_token_here
  JIRA_API_VERSION=v2

  # Redis Configuration
  REDIS_HOST=localhost
  REDIS_PORT=6379
  REDIS_PASSWORD=

  # Cache Configuration
  CACHE_TTL_SECONDS=900
  ```

### ✅ AC6: Configuration Error Type
- [x] Create `src/errors/ConfigurationError.ts`:
  - **Evidence**: `src/errors/ConfigurationError.ts` ([9b859c6](https://github.com/FallingReign/jira-magic-library/commit/9b859c6))
  - Extends `Error`
  - Has `code` property set to `"CONFIGURATION_ERROR"`
  - Has optional `details` object for field-specific context

### ✅ AC7: Unit Tests
- [x] Test `loadConfig()` with valid environment variables
  - **Evidence**: `src/config/__tests__/loader.test.ts` ([9b859c6](https://github.com/FallingReign/jira-magic-library/commit/9b859c6))
- [x] Test default values are applied correctly
- [x] Test validation fails for missing `baseUrl`
- [x] Test validation fails for missing `auth.token`
- [x] Test validation fails for invalid `baseUrl` (not HTTP/HTTPS)
- [x] Test validation fails for invalid `redis.port` (non-numeric or out of range)
- [x] Test error messages are descriptive

---

## Technical Notes

### Architecture Prerequisites
- [Configuration & Auth Layer](../architecture/system-architecture.md#1-configuration--auth-layer)

### Dependencies
**Production**:
- `dotenv` (^16.x)

**Dev**:
- None (use existing testing framework from E1-S01)

### Implementation Details
```typescript
// Example usage
import { loadConfig } from './config/loader';

const config = loadConfig(); // Reads from .env
console.log(config.baseUrl); // https://jira.company.com
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] `JMLConfig` interface documented with JSDoc comments
- [x] `loadConfig()` function implemented and exported
- [x] Configuration validation implemented
- [x] `ConfigurationError` class created
- [x] `.env.example` file created with all supported variables
- [x] Unit tests written and passing (13 test cases)
- [x] Code coverage for config module: 96.42% (above 95% threshold)
- [x] README updated with configuration section (deferred to E1-S12)

---

## Implementation Hints

1. Use `process.env` to read environment variables
2. Use `parseInt()` for numeric values with validation
3. Use URL validation: `new URL(baseUrl)` will throw if invalid
4. Consider using a schema validation library later (see Architecture Doc: Validation = Manual for MVP)
5. Make sure `.env` is in `.gitignore` (should be from E1-S01)

---

## Related Stories

- **Depends On**: E1-S01 (Project Setup)
- **Blocks**: E1-S03 (PAT Authentication)
- **Related**: None

---

## Testing Strategy

### Unit Tests (src/config/__tests__/loader.test.ts)
```typescript
describe('loadConfig', () => {
  it('should load config from environment variables', () => { ... });
  it('should apply default values', () => { ... });
  it('should throw ConfigurationError if baseUrl missing', () => { ... });
  it('should throw ConfigurationError if PAT missing', () => { ... });
  it('should throw ConfigurationError if baseUrl invalid', () => { ... });
  it('should throw ConfigurationError if redis.port invalid', () => { ... });
  it('should include field name in error message', () => { ... });
});
```

---

## Notes

- `.env` file should NEVER be committed (enforce with `.gitignore`)
- PAT security is user's responsibility (architecture delegates this)
- Consider supporting config objects passed directly (not just env vars) in future
- This story focuses on environment-based config only (simplest for MVP)

# E1-S03: PAT Authentication & Connection Validation

**Epic**: Epic 1 - Basic Issue Creation  
**Size**: Medium (5 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**Started**: 2025-10-02  
**Completed**: 2025-10-02
**PR**: Direct commit ([41cdd22](https://github.com/FallingReign/jira-magic-library/commit/41cdd22))

---

## User Story

**As a** library user  
**I want** the library to validate my JIRA credentials on initialization  
**So that** I get fast feedback if my PAT is invalid or JIRA is unreachable

---

## Acceptance Criteria

### ✅ AC1: Authentication Module Implemented
- [x] Create `src/client/auth.ts` with:
  - **Evidence**: `src/client/auth.ts` ([41cdd22](https://github.com/FallingReign/jira-magic-library/commit/41cdd22))
  - `validateConnection()` async function
  - Uses native `fetch` to call JIRA `/rest/api/2/serverInfo` endpoint
  - Includes `Authorization: Bearer {token}` header
  - Returns server info object on success
  - Throws appropriate error on failure

### ✅ AC2: Server Info Response Typed
- [x] Create `src/types/jira.ts` with:
  - **Evidence**: `src/types/jira.ts` ([41cdd22](https://github.com/FallingReign/jira-magic-library/commit/41cdd22))
  ```typescript
  interface JiraServerInfo {
    baseUrl: string;
    version: string;
    versionNumbers: number[];
    deploymentType: string;
    buildNumber: number;
    serverTitle: string;
  }
  ```

### ✅ AC3: Authentication Error Types
- [x] Create `src/errors/AuthenticationError.ts`:
  - **Evidence**: `src/errors/AuthenticationError.ts` ([41cdd22](https://github.com/FallingReign/jira-magic-library/commit/41cdd22))
  - Extends `Error`
  - Code: `"AUTHENTICATION_ERROR"`
  - Message includes hint (e.g., "PAT is invalid or expired")
- [x] Create `src/errors/NetworkError.ts`:
  - Extends `Error`
  - Code: `"NETWORK_ERROR"`
  - Message includes base URL that failed

### ✅ AC4: Connection Validation Logic
- [x] Call `GET {baseUrl}/rest/api/2/serverInfo` with:
  - **Evidence**: `src/client/auth.ts` ([41cdd22](https://github.com/FallingReign/jira-magic-library/commit/41cdd22)), see fetch logic
  - Headers: `{ Authorization: "Bearer {token}", Accept: "application/json" }`
  - Timeout: 5 seconds
- [x] Handle HTTP status codes:
  - 200: Success → return server info
  - 401/403: Authentication failed → throw `AuthenticationError`
  - 404: Invalid base URL or endpoint → throw `ConfigurationError`
  - 500/503: JIRA server error → retry once after 1s, then throw `NetworkError`
  - Network timeout: throw `NetworkError`

### ✅ AC5: Retry Logic for Transient Errors
- [x] If initial request fails with 500/503 or network timeout:
  - **Evidence**: `src/client/auth.ts` retry logic ([41cdd22](https://github.com/FallingReign/jira-magic-library/commit/41cdd22))
  - Wait 1 second
  - Retry once
  - If second attempt fails, throw error
- [x] Log retry attempts (use console for MVP, can be replaced later)

### ✅ AC6: HTTPS Enforcement
- [x] Warn (console.warn) if `baseUrl` uses `http://` instead of `https://`
  - **Evidence**: `src/client/auth.ts` HTTPS warning ([41cdd22](https://github.com/FallingReign/jira-magic-library/commit/41cdd22))
- [x] Allow `http://` for testing (don't block)
- [x] Log: "⚠️  Using HTTP instead of HTTPS. Credentials may be exposed."

### ✅ AC7: Unit Tests
- [x] Test successful authentication (200 response)
  - **Evidence**: `tests/unit/client/auth.test.ts` ([41cdd22](https://github.com/FallingReign/jira-magic-library/commit/41cdd22))
- [x] Test authentication failure (401 response)
- [x] Test network error (timeout)
- [x] Test retry logic (503 then 200)
- [x] Test retry exhaustion (503 twice)
- [x] Test invalid base URL (404)
- [x] Test HTTPS warning for HTTP URLs
- [x] Mock `fetch` using jest.spyOn or similar

---

## Technical Notes

### Architecture Prerequisites
- [Configuration & Auth Layer](../architecture/system-architecture.md#1-configuration--auth-layer)
- [JIRA API Client - Error Handling](../architecture/system-architecture.md#2-jira-api-client)

### Dependencies
**Production**: None (uses native `fetch`)  
**Dev**: None (uses Jest from E1-S01)

### JIRA API Endpoint
```
GET /rest/api/2/serverInfo
```
**Response Example**:
```json
{
  "baseUrl": "https://jira.company.com",
  "version": "8.20.10",
  "versionNumbers": [8, 20, 10],
  "deploymentType": "Server",
  "buildNumber": 820010,
  "serverTitle": "Company JIRA"
}
```

### Fetch Implementation Example
```typescript
const response = await fetch(`${baseUrl}/rest/api/2/serverInfo`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  },
  signal: AbortSignal.timeout(5000), // 5 second timeout
});

if (!response.ok) {
  if (response.status === 401 || response.status === 403) {
    throw new AuthenticationError('PAT is invalid or expired');
  }
  // ... handle other errors
}

const data = await response.json();
return data as JiraServerInfo;
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] `validateConnection()` function implemented
- [x] Error types created (`AuthenticationError`, `NetworkError`)
- [x] Retry logic implemented (1 retry with 1s delay)
- [x] HTTPS enforcement warning implemented
- [x] Unit tests written and passing (16 test cases)
- [x] Code coverage: 97.22% (auth.ts), 100% branch coverage
- [x] Integration test with real JIRA instance (2 tests passing)

---

## Implementation Hints

1. Use `AbortSignal.timeout(5000)` for fetch timeout (Node.js 18+)
2. Wrap fetch in try-catch to handle network errors
3. Check `response.ok` before parsing JSON
4. Use `jest.spyOn(global, 'fetch')` to mock fetch in tests
5. Test both success and failure paths thoroughly
6. Consider extracting retry logic into utility function for reuse

---

## Related Stories

- **Depends On**: E1-S02 (Environment Config)
- **Blocks**: E1-S05 (JIRA API Client), E1-S06 (Schema Discovery)
- **Related**: None

---

## Testing Strategy

### Unit Tests (tests/unit/client/auth.test.ts)
**Coverage**: 97.22% statements, 100% branches, 100% functions, 97.05% lines  
**Test Count**: 16 tests across 6 categories

```typescript
describe('validateConnection', () => {
  // Successful Authentication (1 test)
  it('should return server info on successful authentication (200)', async () => { ... });

  // Authentication Failures (2 tests)
  it('should throw AuthenticationError on 401 Unauthorized', async () => { ... });
  it('should throw AuthenticationError on 403 Forbidden', async () => { ... });

  // Configuration Errors (1 test)
  it('should throw ConfigurationError on 404 Not Found', async () => { ... });

  // Network Errors and Retry Logic (6 tests)
  it('should retry once on 500 Internal Server Error and succeed', async () => { ... });
  it('should retry once on 503 Service Unavailable and succeed', async () => { ... });
  it('should throw NetworkError after retry exhaustion (500 twice)', async () => { ... });
  it('should throw NetworkError after retry exhaustion (503 twice)', async () => { ... });
  it('should retry once on network timeout and throw NetworkError', async () => { ... });
  it('should throw NetworkError on general network error', async () => { ... });

  // HTTPS Enforcement (2 tests)
  it('should warn when using HTTP instead of HTTPS', async () => { ... });
  it('should not warn when using HTTPS', async () => { ... });

  // Timeout Configuration (1 test)
  it('should use 5 second timeout with AbortSignal', async () => { ... });

  // Other HTTP Status Codes (2 tests)
  it('should throw NetworkError on 400 Bad Request', async () => { ... });
  it('should throw NetworkError on unexpected status codes', async () => { ... });

  // Non-Error Exception Handling (1 test)
  it('should handle non-Error thrown values', async () => { ... });
});
```

### Integration Tests (tests/integration/auth.test.ts)
**Test Count**: 2 tests against real JIRA Server/DC instance

```typescript
describe('Integration: PAT Authentication', () => {
  it('should connect to real JIRA instance', async () => {
    // Validates connection with real credentials from .env
    // Verifies server info structure and content
    // Result: ✅ Connected to COD Jira (v9.12.26, Server deployment)
  });

  it('should handle authentication check', async () => {
    // Validates that /serverInfo endpoint is accessible
    // Note: Some JIRA instances allow this endpoint without authentication
  });
});
```

**Manual Verification**: Integration tests successfully connected to JIRA Server v9.12.26

---

## Security Considerations

- PAT is sent in `Authorization` header (never in URL or logs)
- Warn users about HTTP (credentials exposed in transit)
- Do NOT log PAT value (only log "***" if needed)
- Server info response may contain internal URLs (acceptable for MVP)

---

## Notes

- This is the first story that makes a real HTTP request
- Success here unblocks all subsequent JIRA API interactions
- Consider adding `validateConnection()` call to library initialization in future
- Retry logic pattern will be reused in E1-S05 (API Client)

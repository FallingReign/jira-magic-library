# E1-S04: Redis Client Setup & Cache Infrastructure

**Epic**: Epic 1 - Basic Issue Creation  
**Size**: Medium (5 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: 2be0a8a  
**Started**: 2025-10-03  
**Completed**: 2025-10-03

---

## User Story

**As a** library developer  
**I want** a Redis client wrapper with TTL support  
**So that** I can cache JIRA schema data and minimize API calls

---

## Acceptance Criteria

### ✅ AC1: ioredis Dependency Installed
- [x] Add `ioredis` to production dependencies
  - **Evidence**: `package.json` ([2be0a8a](https://github.com/FallingReign/jira-magic-library/commit/2be0a8a))
- [x] Version: `^5.x`
- [x] Install: `npm install ioredis`
- [x] Add types: `npm install -D @types/ioredis`

### ✅ AC2: Cache Client Interface Defined
- [x] Create `src/types/cache.ts`:
  - **Evidence**: `src/types/cache.ts` ([2be0a8a](https://github.com/FallingReign/jira-magic-library/commit/2be0a8a))
  ```typescript
  interface CacheClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<void>;
    clear(): Promise<void>;
    ping(): Promise<void>;
  }
  ```

### ✅ AC3: Redis Client Wrapper Implemented
- [x] Create `src/cache/RedisCache.ts` with:
  - **Evidence**: `src/cache/RedisCache.ts` ([2be0a8a](https://github.com/FallingReign/jira-magic-library/commit/2be0a8a))
  - `RedisCache` class implementing `CacheClient` interface
  - Constructor accepts `redis: RedisConfig` from config
  - Connects to Redis on initialization
  - Handles connection errors gracefully

### ✅ AC4: Cache Operations Implemented
- [x] `get(key)`:
  - **Evidence**: `src/cache/RedisCache.ts` ([2be0a8a](https://github.com/FallingReign/jira-magic-library/commit/2be0a8a))
  - Returns cached value as string or `null` if not found
  - Handles Redis errors (return `null` on error, log warning)
- [x] `set(key, value, ttlSeconds)`:
  - Stores value with TTL (uses `SETEX` command)
  - TTL in seconds
  - Handles errors (log warning, don't throw)
- [x] `del(key)`:
  - Deletes key from cache
  - Silent if key doesn't exist
- [x] `clear()`:
  - Deletes all keys matching pattern `jml:*`
  - Uses `SCAN` command to avoid blocking
- [x] `ping()`:
  - Tests Redis connection
  - Throws `CacheError` if Redis unreachable

### ✅ AC5: Cache Key Namespacing
- [x] All cache keys prefixed with `jml:`
  - **Evidence**: `src/cache/RedisCache.ts` ([2be0a8a](https://github.com/FallingReign/jira-magic-library/commit/2be0a8a))
- [x] Key structure: `jml:{type}:{identifier}`
- [x] Examples:
  - `jml:schema:ENG:Bug`
  - `jml:priorities:https://jira.com`
  - `jml:users:alex@example.com`

### ✅ AC6: Error Handling
- [x] Create `src/errors/CacheError.ts`:
  - **Evidence**: `src/errors/CacheError.ts` ([2be0a8a](https://github.com/FallingReign/jira-magic-library/commit/2be0a8a))
  - Extends `Error`
  - Code: `"CACHE_ERROR"`
  - Includes underlying Redis error details
- [x] Cache operations should NOT crash the library:
  - If Redis fails, operations continue without caching (graceful degradation)
  - Log warnings for cache failures
  - Only `ping()` throws error

### ✅ AC7: Connection Management
- [x] Connect to Redis on client initialization
  - **Evidence**: `src/cache/RedisCache.ts` event handlers ([2be0a8a](https://github.com/FallingReign/jira-magic-library/commit/2be0a8a))
- [x] Handle Redis connection events:
  - `connect`: Log "✓ Redis connected"
  - `error`: Log warning "⚠️  Redis error: {message}"
  - `close`: Log "Redis connection closed"
- [x] Implement `disconnect()` method for cleanup

### ✅ AC8: Unit Tests
- [x] Test `get()` returns cached value
  - **Evidence**: `tests/unit/cache/RedisCache.test.ts` ([2be0a8a](https://github.com/FallingReign/jira-magic-library/commit/2be0a8a))
- [x] Test `get()` returns null for missing key
- [x] Test `set()` stores value with TTL
- [x] Test `del()` removes key
- [x] Test `clear()` removes all jml:* keys
- [x] Test `ping()` validates connection
- [x] Test graceful degradation on Redis errors
- [x] Use `ioredis-mock` for testing

---

## Technical Notes

### Architecture Prerequisites
- [Schema Discovery & Caching](../architecture/system-architecture.md#3-schema-discovery--caching)

### Dependencies
**Production**:
- `ioredis` (^5.x)

**Dev**:
- `ioredis-mock` (for testing without real Redis)

### Redis Commands Used
- `SETEX key ttl value` - Set with expiration
- `GET key` - Get value
- `DEL key` - Delete key
- `SCAN cursor MATCH pattern` - Iterate keys (for clear)
- `PING` - Test connection

### Implementation Example
```typescript
import Redis from 'ioredis';

export class RedisCache implements CacheClient {
  private client: Redis;

  constructor(config: RedisConfig) {
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      lazyConnect: false,
    });

    this.client.on('connect', () => console.log('✓ Redis connected'));
    this.client.on('error', (err) => console.warn('⚠️  Redis error:', err.message));
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(`jml:${key}`);
    } catch (err) {
      console.warn('Cache get failed:', err);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.setex(`jml:${key}`, ttlSeconds, value);
    } catch (err) {
      console.warn('Cache set failed:', err);
    }
  }

  // ... other methods
}
```

---

## Definition of Done

- [x] All acceptance criteria met
- [x] `CacheClient` interface defined
- [x] `RedisCache` class implemented
- [x] All cache operations work (get, set, del, clear, ping)
- [x] Cache keys use `jml:` prefix
- [x] Graceful degradation on Redis errors
- [x] Unit tests written and passing (26 test cases)
- [x] Code coverage: 85.71% (uncovered lines are production Redis instantiation paths)
- [x] Integration test with real Redis (manual verification OK)

---

## Implementation Hints

1. Use `ioredis-mock` for unit tests: `import Redis from 'ioredis-mock';`
2. Handle async Redis operations with try-catch
3. Use `SCAN` with `COUNT` option for `clear()` to avoid blocking
4. Consider connection pooling if needed in future
5. TTL is in seconds (Redis uses seconds, not milliseconds)

---

## Related Stories

- **Depends On**: E1-S02 (Environment Config)
- **Blocks**: E1-S06 (Schema Discovery), E2-S04 (Priority Caching)
- **Related**: None

---

## Testing Strategy

### Unit Tests (tests/unit/cache/RedisCache.test.ts)
**26 tests implemented using ioredis-mock**

```typescript
import RedisMock from 'ioredis-mock';

describe('RedisCache', () => {
  // get() tests (4)
  it('should get cached value', async () => { ... });
  it('should return null for missing key', async () => { ... });
  it('should prefix key with jml:', async () => { ... });
  it('should return null on get error', async () => { ... });
  
  // set() tests (4)
  it('should set value with TTL', async () => { ... });
  it('should prefix key with jml:', async () => { ... });
  it('should handle errors gracefully', async () => { ... });
  it('should use custom TTL', async () => { ... });
  
  // del() tests (3)
  it('should delete key', async () => { ... });
  it('should handle missing key', async () => { ... });
  it('should handle errors gracefully', async () => { ... });
  
  // clear() tests (3)
  it('should clear all jml:* keys', async () => { ... });
  it('should handle errors gracefully', async () => { ... });
  it('should work on empty cache', async () => { ... });
  
  // ping() tests (2)
  it('should validate connection', async () => { ... });
  it('should throw CacheError on failure', async () => { ... });
  
  // Connection management (3)
  it('should set up event handlers', () => { ... });
  it('should disconnect', async () => { ... });
  it('should handle double disconnect', async () => { ... });
  
  // Key namespacing (3)
  it('should namespace schema cache keys', async () => { ... });
  it('should namespace priority cache keys', async () => { ... });
  it('should namespace user cache keys', async () => { ... });
  
  // Graceful degradation (4)
  it('should not crash on get error', async () => { ... });
  it('should not crash on set error', async () => { ... });
  it('should not crash on del error', async () => { ... });
  it('should not crash on clear error', async () => { ... });
});
```

**Coverage: 85.71% statements, 60% branches, 70% functions, 85.71% lines**

### Integration Test (manual)
```bash
# Start Redis locally
docker run -d -p 6379:6379 redis:7-alpine

# Run integration test
npm run test:integration
```

---

## Notes

- Redis is required for MVP (architecture decision: no embedded cache yet)
- Graceful degradation means library still works without Redis (slower, more API calls)
- Consider adding cache hit/miss metrics in future (Epic observability)
- TTL of 900 seconds (15 min) is architecture-defined default

# S2: User Directory Ambiguity Spike

**Epic**: None  
**Size**: Medium (5 points)  
**Priority**: P1  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer integrating the JIRA Magic Library  
**I want** a plan for handling ambiguous user lookups beyond the current `/user/search` limitations  
**So that** end users can resolve slight typos or duplicates without manually hunting for account IDs

---

## Acceptance Criteria

### ✅ AC1: Evaluate data sources for richer user matching
- [ ] Document how many users we need to support (per instance/project) and any rate/size limits
- [ ] Compare the existing `/rest/api/2/user/search` usage with alternatives (e.g., `/user/search/query`, `/user/picker`, or `/user/assignable/search`)
- [ ] Assess feasibility of caching or streaming full directories (memory, TTL, scoping) versus incremental autocomplete calls

**Evidence**:

### ✅ AC2: Produce a technical spike outcome
- [ ] Prototype (CLI script or Node snippet) that fetches candidate data for a test instance using at least one alternative strategy
- [ ] Capture timing, payload size, and any auth/permission constraints for each approach
- [ ] Recommend the preferred option (full cache vs autocomplete vs hybrid) with trade-offs and next steps

**Evidence**:

### ✅ AC3: Integration plan for UserConverter + demo-app
- [ ] Outline how the chosen strategy plugs into `UserConverter` (cache interfaces, async flows, error cases)
- [ ] Describe how the demo-app “User Ambiguity Policy Explorer” should surface the richer candidate info
- [ ] Identify follow-up implementation stories (converter changes, cache layer, new config flags)

**Evidence**:

---

## Technical Notes

### Architecture Prerequisites
- Field Resolution & Conversion: [docs/architecture/system-architecture.md#4-field-resolution--conversion-engine](../architecture/system-architecture.md#4-field-resolution--conversion-engine)
- Caching & Redis layer: [docs/architecture/system-architecture.md#3-schema-discovery--caching](../architecture/system-architecture.md#3-schema-discovery--caching)

### Testing Prerequisites

**Before running experimental scripts:**
- Redis running locally (default `redis://localhost:6379`)
- `.env.test` populated with valid JIRA credentials for exploratory calls
- Node 18+ installed

**Start Prerequisites:**
```bash
# Verify Redis
redis-cli ping

# Verify credentials
cat .env.test | grep JIRA_BASE_URL
```

### Dependencies
- S1: User Ambiguity Policy Options (📋) – informs current behavior/config surface

### Implementation Guidance
- Be explicit about API pagination limits (JIRA typically caps at 1000 records per call)
- Consider whether caching should be per-project, global, or user-configurable
- Evaluate security implications of storing full user directories (PII) in Redis; document mitigation (TTL, encryption, opt-in config)

```typescript
// Pseudocode for evaluating autocomplete endpoint
const response = await client.get('/rest/api/2/user/search/query', {
  query: 'jen',
  maxResults: 1000,
});
```

---

## Implementation Example

```typescript
// Example spike script outline
async function fetchDirectory(client) {
  const results = [];
  let start = 0;

  while (true) {
    const batch = await client.get('/rest/api/2/user/search', {
      username: '*',
      startAt: start,
      maxResults: 1000,
    });
    if (!batch.length) break;
    results.push(...batch);
    start += batch.length;
  }

  return results;
}
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Spike findings captured (e.g., `docs/spikes/user-directory-ambiguity.md`)
- [ ] Follow-up user stories listed in backlog
- [ ] Demo-app impact documented
- [ ] No code merged into `src/` except POC scripts (if any) in `spikes/`
- [ ] Testing prerequisites updated if approach requires new infrastructure
- [ ] Committed with message: `S2: Document user directory ambiguity strategy`

---

## Definition of Done Exceptions

None requested.

---

## Implementation Hints

1. Use `jira-magic-library`’s existing `JiraClientImpl` so auth/retry logic is reused.
2. Capture API rate limits—some endpoints require elevated permissions or return partial results.
3. Consider incremental cache warm-up: e.g., fetch assignable users per project vs entire directory.
4. When comparing endpoints, log payload size to estimate Redis storage cost.
5. Explore whether Atlassian Cloud vs Server/DC responses differ (accountId vs username).

---

## Related Stories

- **Depends On**: S1 (📋)
- **Blocks**: TBD follow-up implementation stories (to be added after spike)
- **Related**: E2-S08 (✅) for current user converter implementation

---

## Testing Strategy

### Unit Tests
- Not required (spike). Provide scripts or Postman collections for reproducibility.

### Integration Tests
- Not required yet; note what tests we will need once implementation story is created.

---

## Notes

- Document any privacy/compliance considerations when caching full user directories.
- If autocomplete endpoint requires UI session cookies (not PAT), note authentication blockers.
- Capture how the findings influence the demo-app and workflow validator (if new config flags are needed).


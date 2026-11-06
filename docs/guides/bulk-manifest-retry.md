# Bulk Create with Manifest + Retry

Use manifests to track bulk results, resume failed rows, and keep per-row issue keys.

## Create with manifest
```ts
const run = await jml.issues.create({
  from: './issues.csv',
  manifest: { prefix: 'import-2025-11-19' }, // optional prefix
});

console.log(run.manifest.id);          // bulk-...
console.log(run.manifest.created[0]);  // issue key for row 0
console.log(run.failed, 'failed rows');
console.log(run.results[0]?.outcome);  // created | failed | not_confirmed | not_sent
```

## Groups and progress
Rows are sent to Jira in groups of `bulk.groupSize` (default 10, allowed 1–50),
one group at a time, in row order. Hierarchies run level by level; every
parent key is recorded before the next level starts. Jira Cloud's OpenAPI
description of `POST /rest/api/3/issue/bulk` says it "Creates upto 50 issues",
so groups never exceed 50. Values outside 1–50, or non-integers, throw a
`ConfigurationError` when `JML` is constructed.

```ts
const jml = new JML({ ...config, bulk: { groupSize: 25 } });

await jml.issues.create(rows, {
  onProgress: (p) => console.log(`${p.completed}/${p.total} (created ${p.created}, failed ${p.failed})`),
});
```

`onProgress` is called once after each group returns, with counts taken from
Jira's reply. `completed` = created + failed rows (including validation
failures and blocked children); `inProgress` = `total - completed`. `isStuck` is
always `false` and deprecated. JML adds no labels, runs no searches and edits
no issues to track progress. Passing `onProgress` does not change the HTTP
timeout: every group request uses `timeout.bulk` (default 30s).

## When a request fails
JML never resends a create request on its own. If a group request times out,
loses the network or gets an error status, the run stops and returns a result
(it does not throw):

| Rows | `outcome` | Meaning |
|------|-----------|---------|
| Groups that returned | `created` / `failed` | As Jira reported |
| The group that threw (timeout, abort, network failure, 5xx) | `not_confirmed` | Jira may have processed it; check before resending |
| The group that Jira refused with 401 or 403 | `not_sent` | Jira refused it, nothing was created; safe to resend |
| Every later group and later hierarchy level | `not_sent` | Never sent; safe to resend |

`BulkResult.sendError` holds `{ name, message }` of the error that stopped the run.

## Retry failed rows
```ts
if (run.failed > 0) {
  // Fix your input rows, then:
  const retry = await jml.issues.create(updatedRows, { retry: run.manifest.id });
  console.log('Retry summary:', {
    succeeded: retry.succeeded,
    failed: retry.failed,
    manifestId: retry.manifest.id, // same as original
  });
}
```

Retry resends confirmed failures and `not_sent` rows. Rows in
`manifest.notConfirmed` are deliberately skipped because Jira's response did
not safely identify whether they were created. Check these rows manually before
submitting them again. If returned created issue keys could not be matched to
rows, they are listed in `BulkResult.unmatchedKeys`. A child whose parent has
no confirmed key in a level that ran is reported as `failed` with
`blocked: true`.

## What’s in the manifest?
- `id`: Unique manifest ID (persisted in Redis).
- `total`: Row count.
- `succeeded[]` / `failed[]`: Row indices.
- `notConfirmed[]`: Row indexes that could not be safely matched to an outcome.
- `notSent[]`: Row indexes not created because their request was never sent (an earlier request failed) or Jira refused it with 401/403.
- `created`: Map of `rowIndex -> issueKey`.
- `errors`: Map of `rowIndex -> error details`.
- `results[].outcome`: `created`, `failed`, `not_confirmed` or `not_sent`;
  `success` is false for every outcome except `created`.
- `BulkResult.failed` counts all unsuccessful rows, including unconfirmed and
  unsent rows; `manifest.failed` plus `manifest.notSent` are the rows eligible
  for retry.

## Notes
- Manifests are cached in Redis (default TTL 24h).
- Even if Redis write fails, results are still returned in-memory (graceful degradation).
- Issue keys are preserved across retries; downstream exports (JSON/YAML) should read `manifest.created`.
- Jira's bulk response is mapped by request position using `failedElementNumber`
  (zero-based in this library's existing fixtures/tests). The implementation
  walks request rows and consumes the compact `issues` success array in order
  for non-failed rows. This assumes Jira returns successful issues in request
  order among non-failed rows; Jira Cloud documentation does not guarantee that
  ordering, so this remains an API-contract risk. Inconsistent counts, duplicate
  or out-of-range failure positions, and duplicate created keys trigger
  `not_confirmed` rather than a guessed row assignment.

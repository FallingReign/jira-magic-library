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
console.log(run.results[0]?.outcome);  // created | failed | not_confirmed
```

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

Only confirmed failures are eligible for manifest retry. Rows in
`manifest.notConfirmed` are deliberately skipped because Jira's response did
not safely identify whether they were created. Check these rows manually before
submitting them again. If returned created issue keys could not be matched to
rows, they are listed in `BulkResult.unmatchedKeys`.

## What’s in the manifest?
- `id`: Unique manifest ID (persisted in Redis).
- `total`: Row count.
- `succeeded[]` / `failed[]`: Row indices.
- `notConfirmed[]`: Row indexes that could not be safely matched to an outcome.
- `created`: Map of `rowIndex -> issueKey`.
- `errors`: Map of `rowIndex -> error details`.
- `results[].outcome`: `created`, `failed`, or `not_confirmed`; `success` is
  false for both failed and unconfirmed rows.
- `BulkResult.failed` counts all unsuccessful rows, including unconfirmed rows;
  only `manifest.failed` contains rows eligible for retry.

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

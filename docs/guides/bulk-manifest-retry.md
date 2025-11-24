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

## What’s in the manifest?
- `id`: Unique manifest ID (persisted in Redis).
- `total`: Row count.
- `succeeded[]` / `failed[]`: Row indices.
- `created`: Map of `rowIndex -> issueKey`.
- `errors`: Map of `rowIndex -> error details`.

## Notes
- Manifests are cached in Redis (default TTL 24h).
- Even if Redis write fails, results are still returned in-memory (graceful degradation).
- Issue keys are preserved across retries; downstream exports (JSON/YAML) should read `manifest.created`.

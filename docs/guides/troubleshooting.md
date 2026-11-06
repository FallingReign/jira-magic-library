# Troubleshooting & Common Errors

## Schema / Validation
- **INVALID_PROJECT / INVALID_ISSUE_TYPE**: The project or issue type doesn’t exist in your JIRA instance. Fix the payload or pick a valid issue type (see the error’s `availableTypes` context).
- **REQUIRED_FIELD_MISSING** (from `jml.validate()` only): Summary or other required fields are empty/undefined. Provide a value or remove the row. A blank Reporter is not reported because Jira uses the submitting user.
- **INVALID_TYPE**: Value doesn’t match schema (string/number/array/user/project). Correct the type or adjust parsing.
- **INVALID_ENUM_VALUE**: Value not in allowed options. Use one of the allowed values listed in the error.
- **Warnings (UNKNOWN_FIELD)**: Non-blocking; field will be ignored. Rename/remove if unintended.

## Bulk / Manifest
- **Manifest not found/expired**: TTL elapsed in Redis. Re-run the bulk create to produce a new manifest.
- **Missing issue IDs in output**: Check `manifest.created` map; that is where per-row keys live. If exporting to YAML/JSON, ensure the exporter reads this map.
- **Rows marked `not_confirmed`**: The request for that group failed (timeout, abort, network failure or 5xx) after it may have reached Jira. JML does not resend it. Search Jira for those rows before resending; manifest retry skips them.
- **Rows marked `not_sent`**: Nothing was created. Either an earlier request failed, so these were never sent, or Jira refused their request with 401/403 (check credentials and permissions). Manifest retry resends them. `BulkResult.sendError` shows what failed.
- **Bulk fails on Jira Cloud with large groups**: Cloud accepts up to 50 issues per bulk request. Keep `bulk.groupSize` at 50 or below (JML rejects larger values).
- **Slow groups time out**: Raise `timeout.bulk` (per request, default 30s) or lower `bulk.groupSize`.

## Environment / Setup
- **Redis required**: Provide `REDIS_URL` (e.g., `redis://localhost:6379`). For local dev: `docker run -d --name jml-redis -p 6379:6379 redis:7-alpine`.
- **Auth failures**: Ensure `JIRA_TOKEN` (PAT) and `JIRA_BASE_URL` are set, and the PAT has project access.
- **Coverage/lint gates**: Run `npm test -- --coverage`, `npm run lint`, and `npm run type-check` before committing.
- **Hanging demo spinner**: With `validate()`, spinners now stop on errors; if you see a hang, verify Redis connectivity and that project/issue type values are valid.

## Support checklist
Before reporting an issue, please include:
- JML version (tag/commit), Node version.
- Whether `validate()` passes on the same payload.
- Project key + issue type you’re sending.
- Excerpts of the validation/bulk result (errors + manifest).

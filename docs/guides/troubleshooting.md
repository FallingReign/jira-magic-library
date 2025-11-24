# Troubleshooting & Common Errors

## Schema / Validation
- **INVALID_PROJECT / INVALID_ISSUE_TYPE**: The project or issue type doesn’t exist in your JIRA instance. Fix the payload or pick a valid issue type (see the error’s `availableTypes` context).
- **REQUIRED_FIELD_MISSING**: Summary or other required fields are empty/undefined. Provide a value or remove the row.
- **INVALID_TYPE**: Value doesn’t match schema (string/number/array/user/project). Correct the type or adjust parsing.
- **INVALID_ENUM_VALUE**: Value not in allowed options. Use one of the allowed values listed in the error.
- **Warnings (UNKNOWN_FIELD)**: Non-blocking; field will be ignored. Rename/remove if unintended.

## Bulk / Manifest
- **Manifest not found/expired**: TTL elapsed in Redis. Re-run the bulk create to produce a new manifest.
- **Missing issue IDs in output**: Check `manifest.created` map; that is where per-row keys live. If exporting to YAML/JSON, ensure the exporter reads this map.

## Environment / Setup
- **Redis required**: Provide `REDIS_URL` (e.g., `redis://localhost:6379`). For local dev: `docker run -d --name jml-redis -p 6379:6379 redis:7-alpine`.
- **Auth failures**: Ensure `JIRA_TOKEN` (PAT) and `JIRA_BASE_URL` are set, and the PAT has project access.
- **Coverage/lint gates**: Run `npm test -- --coverage`, `npm run lint`, and `npm run validate:workflow` before committing.
- **Hanging demo spinner**: With `validate()`, spinners now stop on errors; if you see a hang, verify Redis connectivity and that project/issue type values are valid.

## Support checklist
Before reporting an issue, please include:
- JML version (tag/commit), Node version.
- Whether `validate()` passes on the same payload.
- Project key + issue type you’re sending.
- Excerpts of the validation/bulk result (errors + manifest).

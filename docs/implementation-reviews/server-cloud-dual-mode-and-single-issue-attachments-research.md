# Research Note: Server/Cloud Dual-Mode and Single-Issue Attachments

**Date**: 2026-08-05  
**Type**: Investigation only — no code changes made.

## Findings

### 1) Server/Cloud at the same time

The repo already supports a dual-mode Server/Cloud design, but it is **deployment dual-mode**, not **parallel auth**. `src/jml.ts` lazily detects deployment through a shared `EndpointResolver`, caches the in-flight detection promise, and passes the same resolver callback through schema discovery and issue creation paths. `src/client/EndpointResolver.ts` owns the `/rest/api/2` vs `/rest/api/3` routing. `src/client/AuthStrategy.ts` exposes a single active auth strategy at a time (`pat`, `basic`, or `oauth2`), and `src/config/migrateConfig.ts` only migrates legacy `{ token }` config to PAT form.

So the answer to "run two authentication in parallel" is: **not as two auth strategies in one client instance**. The code supports one auth mode per client and one deployment mode per request flow; if both Server and Cloud are needed at once, that is done by creating separate client instances/configurations, not by mixing auth strategies inside one instance.

### 2) Single issue with attachments

Attachment support for issue creation is **not implemented yet**. There is no attachment converter, no multipart upload path in `src/client/JiraClient.ts`, and no attachment endpoint helper in `src/client/EndpointResolver.ts`. The backlog still tracks attachment work as planned stories in Epic 6, which matches the code gap.

Attachments also do not fit the normal field-converter flow: Jira uploads them through a separate `POST /issue/{issueIdOrKey}/attachments` multipart request after the issue exists, so the feature needs a post-create step in `src/operations/IssueOperations.ts`, plus multipart support in `JiraClient`.

## Recommended implementation seam

1. Keep deployment detection in `JML` and path building in `EndpointResolver`.
2. Add multipart upload support to `JiraClient` with the Jira-required `X-Atlassian-Token: no-check` header.
3. Add an attachment endpoint helper to `EndpointResolver`.
4. Extend single-issue create to upload attachments after the issue is created.
5. Reuse the existing file-reading pattern from `src/parsers/InputParser.ts` for path-based attachments.

## Source references

- `src/jml.ts`
- `src/client/EndpointResolver.ts`
- `src/client/AuthStrategy.ts`
- `src/config/migrateConfig.ts`
- `src/client/JiraClient.ts`
- `src/operations/IssueOperations.ts`
- `src/parsers/InputParser.ts`
- `docs/backlog.md`
- Atlassian REST docs for issue attachments


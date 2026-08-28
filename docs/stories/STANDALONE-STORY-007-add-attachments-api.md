# S7: Post-Creation Attachment API (`issues.addAttachments`)

**Epic**: Standalone Story (Public API)  
**Size**: Medium (5 points)  
**Priority**: P1  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: [#1](https://github.com/FallingReign/jira-magic-library/pull/1)  
**Started**: 2026-08-28  
**Completed**: 2026-08-28

---

## User Story

**As a** developer integrating JML into a downstream tool (e.g. `shg-jira-tools`)  
**I want** to attach files to an issue that already exists  
**So that** I can delete my hand-rolled multipart Jira upload code and rely on JML's authentication, retry, and error-normalization pipeline

---

## Context

v2.1.0 shipped attachments, but only as part of **single-issue creation**. The
supporting machinery already exists and must be **reused, not rebuilt**:

| Already exists | Location |
|---|---|
| Multipart normalize/validate/upload | `src/operations/AttachmentUploader.ts` |
| `X-Atlassian-Token: no-check` header | `src/client/JiraClient.ts` (`postMultipart`) |
| Boundary-safe upload (no manual `Content-Type`) | `src/client/JiraClient.ts` (`postMultipart`) |
| Every multipart field named `file` | `src/operations/AttachmentUploader.ts` (`upload`) |
| Cloud/Server endpoint resolution | `src/client/EndpointResolver.ts` (`issueAttachments`) |
| Create-time path already delegates to uploader | `src/operations/IssueOperations.ts` |

**Do not port `src/services/jira-attachment-uploader.js` from `shg-jira-tools`.**
That file duplicates logic JML already owns. This story only closes the gaps below.

---

## Acceptance Criteria

### ✅ AC1: `issues.addAttachments()` public method
- [x] `IssuesAPI` interface declares `addAttachments(issueKey: string, attachments: AttachmentInput[]): Promise<AttachmentRecord[]>`
- [x] `IssueOperations` implements it by delegating to the existing `AttachmentUploader` (no new multipart code)
- [x] TSDoc comment with a usage example on the interface method
- [x] Rejects a blank/whitespace `issueKey` with `ValidationError`

**Evidence**: [interface](../../src/operations/IssueOperations.ts#L127-L165), [implementation](../../src/operations/IssueOperations.ts#L1614-L1636), [test](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L43-L80)

### ✅ AC2: Normalized return shape
- [x] Returns `AttachmentRecord[]` where each record is `{ id: string; filename: string; size: number }`
- [x] Normalization is a single shared helper, reused by both `addAttachments` and the create-time path
- [x] Missing/absent `size` in the Jira response normalizes to `0` rather than `undefined`

**Evidence**: [AttachmentRecord type](../../src/types/attachment.ts#L1-L12), [toAttachmentRecords helper](../../src/operations/AttachmentUploader.ts#L117-L123), [uploadForIssue uses it](../../src/operations/AttachmentUploader.ts#L81-L116), [test](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L62-L70)

### ✅ AC3: Empty array short-circuits
- [x] `addAttachments(key, [])` resolves to `[]`
- [x] No HTTP request is issued (asserted via mock client call count)
- [x] Endpoint resolution is also skipped

**Evidence**: [code](../../src/operations/IssueOperations.ts#L1620-L1622), [test](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L52-L59)

### ✅ AC4: `issueKey` is URL-encoded
- [x] `EndpointResolver.issueAttachments()` encodes the issue key
- [x] The `IssueOperations` fallback endpoint (`/rest/api/2/issue/...`) also encodes
- [x] Test covers a key needing encoding (e.g. `PROJ 1/2`)

**Evidence**: [EndpointResolver](../../src/client/EndpointResolver.ts#L65-L68), [IssueOperations fallback](../../src/operations/IssueOperations.ts#L1696), [EndpointResolver test](../../tests/unit/client/EndpointResolver.test.ts), [addAttachments test](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L73-L80)

### ✅ AC5: Actionable upload errors
- [x] A dedicated error carries HTTP `status` plus Jira's `errorMessages` / `errors` values
- [x] `403` message names the likely causes: attachments disabled for the project, or missing *Create Attachments* permission
- [x] `413` message names the cause: file exceeded the instance attachment size limit
- [x] A bare `HTTP 403` / `HTTP 413` message is never surfaced to callers

**Evidence**: [AttachmentUploadError with status](../../src/errors/AttachmentUploadError.ts), [uploadForIssue enrichment + composeMessage](../../src/operations/AttachmentUploader.ts#L81-L130), [JiraClient 413 case](../../src/client/JiraClient.ts#L364-L369), [403 test + Jira-text assertion](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L108-L128), [413 test + Jira-text assertion](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L130-L151), [empty-message guard test](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L153-L163)

### ✅ AC6: Package exports
- [x] `AttachmentUploader` exported from `src/index.ts`
- [x] `AttachmentInput`, `AttachmentDataInput`, `AttachmentUploadResult`, `AttachmentRecord` exported as types
- [x] Verified by a test that imports from the package index

**Evidence**: [src/index.ts attachment section](../../src/index.ts)

### ✅ AC7: Create-time path unchanged in behaviour
- [x] Existing `IssueOperations-attachments.test.ts` suite still passes
- [x] Create-time uploads share the same normalization helper as `addAttachments`
- [x] Bulk creation still rejects attachments with the existing `ValidationError`

**Evidence**: create path uses [uploadForIssue](../../src/operations/IssueOperations.ts#L656-L665), [IssueOperations-attachments.test.ts](../../tests/unit/operations/IssueOperations-attachments.test.ts) (all 4 tests pass)

### ✅ AC8: Test coverage
- [x] Successful multi-file upload (2+ files, all fields named `file`)
- [x] `X-Atlassian-Token: no-check` header asserted present
- [x] Empty array short-circuits with zero HTTP calls
- [x] Error-body parsing for `403`, `413`, and a generic failure
- [x] Coverage ≥95% on changed files

**Evidence**: [IssueOperations-addAttachments.test.ts](../../tests/unit/operations/IssueOperations-addAttachments.test.ts) (13 tests, all pass); real-client header test: [sends X-Atlassian-Token: no-check](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L62-L80); multipart field-naming test: [names every field "file"](../../tests/unit/operations/IssueOperations-addAttachments.test.ts#L82-L100)

### ✅ AC9: Release documentation
- [x] `package.json` bumped to `2.2.0` (additive API → minor)
- [x] `CHANGELOG.md` entry under `## [2.2.0]` with Added / Fixed sections
- [x] `README.md` documents `jml.issues.addAttachments()` with an example

**Evidence**: [package.json](../../package.json#L3), [CHANGELOG.md](../../CHANGELOG.md#L3-L22), [README.md](../../README.md)

### ✅ AC10: Demo
- [x] Existing `demo-app/src/features/attachment-demo.js` extended with `runAddAttachmentsDemo` (no new file, shared helpers factored out)
- [x] Registered in the demo menu (`demo-app/src/index.js`, `demo-app/src/ui/prompts.js`)
- [x] Surfaces the normalized `{ id, filename, size }` shape and the 403/413 hints

**Evidence**: [demo](../../demo-app/src/features/attachment-demo.js), [menu wiring](../../demo-app/src/index.js)

---

## Technical Notes

### Key constraints (do not regress)
1. **`X-Atlassian-Token: no-check`** — Jira rejects the upload as suspected XSRF without it.
2. **Never set `Content-Type` manually** — the runtime must set it so the multipart boundary matches.
3. **Every multipart field is named `file`**, repeated once per upload.
4. Endpoint: `POST {baseUrl}/rest/api/{apiVersion}/issue/{issueKey}/attachments`.

### Dependencies
- v2.1.0 attachment infrastructure (✅ shipped)

### Implementation Guidance

```typescript
// src/types/attachment.ts
/** Attachment metadata normalized to a stable shape across Jira deployments. */
export interface AttachmentRecord {
  id: string;
  filename: string;
  size: number;
}
```

```typescript
// src/operations/IssueOperations.ts
async addAttachments(
  issueKey: string,
  attachments: AttachmentInput[]
): Promise<AttachmentRecord[]> {
  // 1. validate issueKey is non-blank
  // 2. validate + normalize inputs via this.attachmentUploader.validate()
  // 3. short-circuit on empty BEFORE resolving the endpoint
  // 4. resolve endpoint, upload, map through toAttachmentRecords()
}
```

Error mapping belongs where the status is known. Prefer extending
`src/errors/AttachmentUploadError.ts` (or a sibling) over inventing a parallel
error hierarchy — it already extends `JMLError`.

---

## Definition of Done

- [x] All acceptance criteria met with evidence links
- [x] Code implemented in `src/operations/IssueOperations.ts`, `src/operations/AttachmentUploader.ts`, `src/client/EndpointResolver.ts`, `src/errors/`, `src/types/attachment.ts`, `src/index.ts`
- [x] Unit tests passing (≥95% coverage)
- [x] Integration test passing (if applicable)
- [x] Demo created OR exception documented (see [DoD Exceptions](../workflow/reference/dod-exceptions.md))
- [x] TSDoc comments added to public APIs
- [x] Code passes linting and type checking
- [x] Testing prerequisites documented (if any)
- [x] Committed with message: `S7: Add post-creation attachment API`

---

## Implementation Hints

1. Reuse `AttachmentUploader.validate()` — it already handles paths, `Uint8Array`/`Buffer`, and filename checks.
2. Short-circuit the empty array *before* endpoint resolution, or the test asserting zero HTTP calls will fail.
3. `Buffer` is a `Uint8Array`, so the existing `instanceof Uint8Array` check already accepts it. `Blob` is not — add explicit support if accepting `Blob`.
4. `encodeURIComponent` the issue key, not the whole path.
5. Jira returns an **array** of attachment records; a 2-file upload yields 2 entries.

---

## Related Stories

- **Depends On**: v2.1.0 attachment infrastructure (✅)
- **Related**: E6-S02 Attachment Converter (📋)

---

## Testing Strategy

### Unit Tests (tests/unit/)
```typescript
describe('IssueOperations.addAttachments()', () => {
  it('uploads multiple files and returns normalized records', async () => { ... });
  it('sends X-Atlassian-Token: no-check', async () => { ... });
  it('short-circuits on an empty array without an HTTP call', async () => { ... });
  it('surfaces Jira errorMessages with the HTTP status', async () => { ... });
  it('explains 403 as attachments-disabled or missing permission', async () => { ... });
  it('explains 413 as exceeding the attachment size limit', async () => { ... });
  it('URL-encodes the issue key', async () => { ... });
});
```

---

## Notes

Requested by a downstream consumer (`shg-jira-tools`) that reimplemented the REST
call locally and wants to delete it. The original request asked to "reuse the
uploader internally rather than duplicating multipart logic" and to "make the
create-time path use the same code" — both were **already true** as of v2.1.0, so
no refactor is needed there. The genuine gaps are the public method, the export,
URL encoding, result normalization, and actionable 403/413 errors.

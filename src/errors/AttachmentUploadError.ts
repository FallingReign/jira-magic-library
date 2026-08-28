import { JMLError } from './JMLError.js';

/**
 * Error thrown when an attachment upload fails, either during issue creation
 * or via {@link IssuesAPI.addAttachments}.
 *
 * `status` carries the HTTP status code when the failure originated from
 * a Jira API response (e.g. 403 for permission errors, 413 for size limit).
 */
export class AttachmentUploadError extends JMLError {
  /** HTTP status code from Jira, if the error originated from an API response. */
  readonly status?: number;

  constructor(issueKey: string, message: string, cause?: unknown, status?: number) {
    super(
      `Issue ${issueKey} attachment upload failed: ${message}`,
      'ATTACHMENT_UPLOAD_ERROR',
      {
        issueKey,
        status,
        cause: cause instanceof Error ? cause.message : cause,
      }
    );
    this.status = status;
  }
}

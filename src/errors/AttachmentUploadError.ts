import { JMLError } from './JMLError.js';

/**
 * Error thrown when an issue was created but its attachments could not be uploaded.
 */
export class AttachmentUploadError extends JMLError {
  constructor(issueKey: string, message: string, cause?: unknown) {
    super(
      `Issue ${issueKey} was created, but attachment upload failed: ${message}`,
      'ATTACHMENT_UPLOAD_ERROR',
      {
        issueKey,
        cause: cause instanceof Error ? cause.message : cause,
      }
    );
  }
}

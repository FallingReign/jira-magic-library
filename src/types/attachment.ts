/**
 * Input accepted for a JIRA issue attachment.
 *
 * Callers that already have file bytes must provide a filename so the
 * multipart upload can preserve the attachment's identity.
 */
export interface AttachmentDataInput {
  data: Uint8Array;
  filename: string;
  contentType?: string;
}

/**
 * A local path or in-memory attachment payload.
 */
export type AttachmentInput = string | AttachmentDataInput;

/**
 * Normalized attachment metadata returned to callers after a successful upload.
 *
 * The raw Jira response varies across deployment versions; this stable shape is
 * always returned regardless of which fields Jira omits.
 */
export interface AttachmentRecord {
  id: string;
  filename: string;
  /** File size in bytes. Defaults to `0` when absent from the Jira response. */
  size: number;
}

/**
 * Attachment metadata returned by JIRA after upload.
 */
export interface AttachmentUploadResult {
  id: string;
  filename: string;
  mimeType?: string;
  size?: number;
  content?: string;
  thumbnail?: string;
  created?: string;
  [key: string]: unknown;
}

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

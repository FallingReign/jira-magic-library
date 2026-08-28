import { access, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { JiraClient } from '../client/JiraClient.js';
import { FileNotFoundError } from '../errors/FileNotFoundError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { AttachmentUploadError } from '../errors/AttachmentUploadError.js';
import { JMLError } from '../errors/JMLError.js';
import type {
  AttachmentDataInput,
  AttachmentInput,
  AttachmentUploadResult,
} from '../types/attachment.js';

/**
 * Normalizes, validates, and uploads one issue's attachments.
 */
export class AttachmentUploader {
  constructor(private readonly client: JiraClient) {}

  /**
   * Normalize a single input or an array into the public attachment list.
   */
  normalize(input: unknown): AttachmentInput[] {
    if (input === undefined) {
      return [];
    }
    return (Array.isArray(input) ? input : [input]) as AttachmentInput[];
  }

  /**
   * Validate attachment shapes and verify local paths without reading file data.
   */
  async validate(input: unknown): Promise<AttachmentInput[]> {
    const attachments = this.normalize(input);

    for (const attachment of attachments) {
      if (typeof attachment === 'string') {
        await this.validatePath(attachment);
        continue;
      }

      this.validateDataInput(attachment);
    }

    return attachments;
  }

  /**
   * Upload all attachments in one multipart request.
   */
  async upload(
    endpoint: string,
    input: AttachmentInput[]
  ): Promise<AttachmentUploadResult[]> {
    const form = new FormData();

    for (const attachment of input) {
      const data = await this.load(attachment);
      const blob = new Blob(
        [data.data],
        data.contentType ? { type: data.contentType } : undefined
      );
      form.append('file', blob, data.filename);
    }

    return this.client.postMultipart<AttachmentUploadResult[]>(endpoint, form);
  }

  /**
   * Upload attachments and return raw Jira {@link AttachmentUploadResult} objects.
   *
   * Wraps {@link upload} with attachment-specific error enrichment so callers
   * always receive an {@link AttachmentUploadError} with an actionable message
   * rather than a bare HTTP status string.
   *
   * @param endpoint - Jira attachment endpoint URL.
   * @param input - Validated attachment inputs (from {@link validate}).
   * @param issueKey - Issue the attachments belong to (used in error messages).
   */
  async uploadForIssue(
    endpoint: string,
    input: AttachmentInput[],
    issueKey: string
  ): Promise<AttachmentUploadResult[]> {
    try {
      return await this.upload(endpoint, input);
    } catch (err) {
      const status =
        err instanceof JMLError
          ? (err.details as Record<string, unknown>)?.['status'] as number | undefined
          : undefined;

      if (status === 403) {
        throw new AttachmentUploadError(
          issueKey,
          this.composeMessage(
            'Attachments may be disabled for this project, or the token lacks the "Create Attachments" permission',
            err
          ),
          err,
          403
        );
      }
      if (status === 413) {
        throw new AttachmentUploadError(
          issueKey,
          this.composeMessage(
            'The uploaded file(s) exceeded the instance attachment size limit',
            err
          ),
          err,
          413
        );
      }

      throw new AttachmentUploadError(
        issueKey,
        err instanceof Error ? err.message : String(err),
        err
      );
    }
  }

  private composeMessage(canned: string, cause: unknown): string {
    const underlying = cause instanceof Error ? cause.message : undefined;
    return underlying ? `${canned}. Jira reported: ${underlying}` : canned;
  }

  private async validatePath(filePath: string): Promise<void> {
    if (filePath.trim().length === 0) {
      throw new ValidationError('Attachment file path cannot be empty');
    }

    try {
      await access(filePath);
    } catch (error) {
      throw new FileNotFoundError(
        `Attachment file not found: ${filePath}`,
        { path: filePath, originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private validateDataInput(input: AttachmentDataInput): void {
    if (!input || typeof input !== 'object') {
      throw new ValidationError(
        'Attachment must be a file path or an object with data and filename'
      );
    }

    if (!(input.data instanceof Uint8Array)) {
      throw new ValidationError('Attachment data must be a Uint8Array or Buffer');
    }

    if (typeof input.filename !== 'string' || input.filename.trim().length === 0) {
      throw new ValidationError('Attachment filename is required');
    }

    if (input.contentType !== undefined && typeof input.contentType !== 'string') {
      throw new ValidationError('Attachment contentType must be a string');
    }
  }

  private async load(attachment: AttachmentInput): Promise<AttachmentDataInput> {
    if (typeof attachment !== 'string') {
      this.validateDataInput(attachment);
      return attachment;
    }

    await this.validatePath(attachment);
    return {
      data: await readFile(attachment),
      filename: basename(attachment),
    };
  }
}

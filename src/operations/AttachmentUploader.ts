import { access, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { JiraClient } from '../client/JiraClient.js';
import { FileNotFoundError } from '../errors/FileNotFoundError.js';
import { ValidationError } from '../errors/ValidationError.js';
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

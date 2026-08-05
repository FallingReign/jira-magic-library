import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AttachmentUploader } from '../../../src/operations/AttachmentUploader.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';
import { FileNotFoundError } from '../../../src/errors/FileNotFoundError.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';

describe('AttachmentUploader', () => {
  let client: jest.Mocked<JiraClient>;
  let uploader: AttachmentUploader;

  beforeEach(() => {
    client = {
      postMultipart: jest.fn(),
    } as unknown as jest.Mocked<JiraClient>;
    uploader = new AttachmentUploader(client);
  });

  it('uploads multiple in-memory attachments in one multipart request', async () => {
    client.postMultipart.mockResolvedValue([
      { id: '1', filename: 'one.txt' },
      { id: '2', filename: 'two.txt' },
    ]);

    const attachments = await uploader.validate([
      { data: new Uint8Array([1]), filename: 'one.txt', contentType: 'text/plain' },
      { data: new Uint8Array([2]), filename: 'two.txt' },
    ]);

    const result = await uploader.upload('/rest/api/3/issue/TEST-1/attachments', attachments);

    expect(result).toHaveLength(2);
    expect(client.postMultipart).toHaveBeenCalledTimes(1);
    const form = client.postMultipart.mock.calls[0]?.[1] as FormData;
    expect(form.getAll('file')).toHaveLength(2);
  });

  it('validates local paths without reading them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jml-attachments-'));
    const filePath = join(directory, 'example.txt');
    await writeFile(filePath, 'example');

    try {
      await expect(uploader.validate(filePath)).resolves.toEqual([filePath]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reads local files as binary multipart parts when uploading', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jml-attachments-'));
    const filePath = join(directory, 'example.txt');
    await writeFile(filePath, 'example');
    client.postMultipart.mockResolvedValue([{ id: '1', filename: 'example.txt' }]);

    try {
      const attachments = await uploader.validate(filePath);
      await uploader.upload('/rest/api/3/issue/TEST-1/attachments', attachments);

      const form = client.postMultipart.mock.calls[0]?.[1] as FormData;
      const file = form.get('file') as Blob & { name?: string };
      expect(await file.text()).toBe('example');
      expect(file.name).toBe('example.txt');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('throws FileNotFoundError for a missing local path', async () => {
    await expect(uploader.validate('missing-attachment.txt')).rejects.toBeInstanceOf(
      FileNotFoundError
    );
  });

  it('requires a filename for in-memory data', async () => {
    await expect(
      uploader.validate({ data: new Uint8Array([1]), filename: '' })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

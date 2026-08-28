import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import { JiraClientImpl } from '../../../src/client/JiraClient.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';
import type { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import type { FieldResolver } from '../../../src/converters/FieldResolver.js';
import type { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import { AttachmentUploadError } from '../../../src/errors/AttachmentUploadError.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';
import { AuthenticationError } from '../../../src/errors/AuthenticationError.js';
import { JiraServerError } from '../../../src/errors/JiraServerError.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';

global.fetch = jest.fn();

describe('IssueOperations.addAttachments()', () => {
  let client: jest.Mocked<JiraClient>;
  let ops: IssueOperations;

  const twoResults = [
    { id: '1', filename: 'a.txt', size: 10 },
    { id: '2', filename: 'b.txt', size: 20 },
  ];

  const twoAttachments = [
    { data: new Uint8Array([1]), filename: 'a.txt' },
    { data: new Uint8Array([2]), filename: 'b.txt' },
  ];

  function makeOps(c: JiraClient): IssueOperations {
    return new IssueOperations(
      c,
      {} as jest.Mocked<SchemaDiscovery>,
      {} as jest.Mocked<FieldResolver>,
      {} as jest.Mocked<ConverterRegistry>,
      undefined,
      undefined,
      undefined,
      undefined,
      async () => new EndpointResolver('cloud', 'v3')
    );
  }

  beforeEach(() => {
    client = {
      postMultipart: jest.fn().mockResolvedValue(twoResults),
    } as unknown as jest.Mocked<JiraClient>;

    ops = makeOps(client);
    (global.fetch as jest.MockedFunction<typeof fetch>).mockReset();
  });

  it('uploads multiple files and returns AttachmentUploadResult[]', async () => {
    const records = await ops.addAttachments('ENG-1', twoAttachments);

    expect(records).toEqual([
      { id: '1', filename: 'a.txt', size: 10 },
      { id: '2', filename: 'b.txt', size: 20 },
    ]);
    expect(client.postMultipart).toHaveBeenCalledTimes(1);
  });

  it('sends X-Atlassian-Token: no-check and no manual Content-Type (real client + fetch)', async () => {
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => twoResults,
    } as Response);

    const realClient = new JiraClientImpl({
      baseUrl: 'https://test.atlassian.net',
      auth: { token: 'test-token' },
    });
    const realOps = makeOps(realClient);

    await realOps.addAttachments('ENG-1', twoAttachments);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const req = mockFetch.mock.calls[0]?.[1];
    expect(req?.headers).toHaveProperty('X-Atlassian-Token', 'no-check');
    expect(req?.headers).not.toHaveProperty('Content-Type');
  });

  it('names every multipart field "file" and round-trips filenames', async () => {
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => twoResults,
    } as Response);

    const realClient = new JiraClientImpl({
      baseUrl: 'https://test.atlassian.net',
      auth: { token: 'test-token' },
    });
    const realOps = makeOps(realClient);

    await realOps.addAttachments('ENG-1', twoAttachments);

    const req = mockFetch.mock.calls[0]?.[1];
    const form = req?.body as FormData;
    expect(form).toBeInstanceOf(FormData);

    const files = form.getAll('file') as File[];
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
    expect([...form.keys()]).toEqual(['file', 'file']);
  });

  it('short-circuits on an empty array with zero HTTP calls', async () => {
    const records = await ops.addAttachments('ENG-1', []);

    expect(records).toEqual([]);
    expect(client.postMultipart).not.toHaveBeenCalled();
  });

  it('passes Jira response through without narrowing (extra fields preserved)', async () => {
    const richResult = { id: '9', filename: 'rich.txt', size: 42, mimeType: 'text/plain', author: { name: 'x' } };
    client.postMultipart.mockResolvedValueOnce([richResult]);

    const records = await ops.addAttachments('ENG-1', [{ data: new Uint8Array([1]), filename: 'rich.txt' }]);

    expect(records[0]).toEqual(richResult);
  });

  it('URL-encodes an issue key containing special characters', async () => {
    await ops.addAttachments('PROJ 1/2', [{ data: new Uint8Array([1]), filename: 'f.txt' }]);

    expect(client.postMultipart).toHaveBeenCalledWith(
      '/rest/api/3/issue/PROJ%201%2F2/attachments',
      expect.any(FormData)
    );
  });

  it('throws ValidationError for a blank issueKey', async () => {
    await expect(ops.addAttachments('   ', twoAttachments)).rejects.toBeInstanceOf(ValidationError);
    expect(client.postMultipart).not.toHaveBeenCalled();
  });

  it('throws ValidationError for an empty string issueKey', async () => {
    await expect(ops.addAttachments('', twoAttachments)).rejects.toBeInstanceOf(ValidationError);
  });

  it('surfaces a 403 error with an actionable attachment-permission message', async () => {
    const jiraMsg = 'You do not have permission to create attachments.';
    client.postMultipart
      .mockRejectedValueOnce(
        new AuthenticationError(`Forbidden: ${jiraMsg}`, { status: 403, url: 'https://jira.example.com' })
      )
      .mockRejectedValueOnce(
        new AuthenticationError(`Forbidden: ${jiraMsg}`, { status: 403, url: 'https://jira.example.com' })
      );

    await expect(ops.addAttachments('ENG-1', twoAttachments)).rejects.toMatchObject({
      code: 'ATTACHMENT_UPLOAD_ERROR',
      status: 403,
      message: expect.stringContaining('Create Attachments'),
    });

    await expect(ops.addAttachments('ENG-1', twoAttachments)).rejects.toMatchObject({
      message: expect.stringContaining(jiraMsg),
    });
  });

  it('surfaces a 413 error with a size-limit message including Jira\'s own text', async () => {
    const jiraMsg = 'Request size exceeded 10 MB limit.';
    client.postMultipart.mockRejectedValueOnce(
      new JiraServerError(`Payload too large (413): ${jiraMsg}`, { status: 413, url: 'https://jira.example.com' })
    );
    client.postMultipart.mockRejectedValueOnce(
      new JiraServerError(`Payload too large (413): ${jiraMsg}`, { status: 413, url: 'https://jira.example.com' })
    );

    await expect(ops.addAttachments('ENG-1', twoAttachments)).rejects.toMatchObject({
      code: 'ATTACHMENT_UPLOAD_ERROR',
      status: 413,
      message: expect.stringContaining('size limit'),
    });

    await expect(ops.addAttachments('ENG-1', twoAttachments)).rejects.toMatchObject({
      message: expect.stringContaining(jiraMsg),
    });
  });

  it('omits "Jira reported" clause when the underlying error has an empty message', async () => {
    // Simulate an error whose message is empty string
    const emptyMessageErr = new AuthenticationError('', { status: 403, url: 'https://jira.example.com' });
    client.postMultipart.mockRejectedValueOnce(emptyMessageErr);

    await expect(ops.addAttachments('ENG-1', twoAttachments)).rejects.toMatchObject({
      code: 'ATTACHMENT_UPLOAD_ERROR',
      status: 403,
      message: expect.not.stringContaining('Jira reported'),
    });
  });

  it('surfaces a generic failure wrapped in AttachmentUploadError', async () => {
    client.postMultipart.mockRejectedValueOnce(new Error('network timeout'));

    await expect(ops.addAttachments('ENG-1', twoAttachments)).rejects.toBeInstanceOf(
      AttachmentUploadError
    );
  });
});


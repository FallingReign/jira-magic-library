import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';
import type { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import type { FieldResolver } from '../../../src/converters/FieldResolver.js';
import type { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import type { Issue } from '../../../src/types/issue.js';
import { AttachmentUploadError } from '../../../src/errors/AttachmentUploadError.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';

describe('IssueOperations attachments', () => {
  let client: jest.Mocked<JiraClient>;
  let resolver: jest.Mocked<FieldResolver>;
  let schema: jest.Mocked<SchemaDiscovery>;
  let converter: jest.Mocked<ConverterRegistry>;
  let issueOperations: IssueOperations;

  const createdIssue: Issue = {
    key: 'ENG-123',
    id: '10001',
    self: 'https://jira.example.com/rest/api/3/issue/10001',
  };

  beforeEach(() => {
    client = {
      post: jest.fn().mockResolvedValue(createdIssue),
      postMultipart: jest.fn().mockResolvedValue([
        { id: '20001', filename: 'notes.txt', size: 7 },
      ]),
    } as unknown as jest.Mocked<JiraClient>;
    resolver = {
      resolveFieldsWithExtraction: jest.fn().mockResolvedValue({
        projectKey: 'ENG',
        issueType: 'Task',
        fields: { project: { key: 'ENG' }, issuetype: { name: 'Task' }, summary: 'Test' },
      }),
    } as unknown as jest.Mocked<FieldResolver>;
    schema = {
      getFieldsForIssueType: jest.fn().mockResolvedValue({ fields: {} }),
    } as unknown as jest.Mocked<SchemaDiscovery>;
    converter = {
      convertFields: jest.fn().mockResolvedValue({
        project: { key: 'ENG' },
        issuetype: { name: 'Task' },
        summary: 'Test',
      }),
    } as unknown as jest.Mocked<ConverterRegistry>;
    issueOperations = new IssueOperations(
      client,
      schema,
      resolver,
      converter,
      undefined,
      undefined,
      undefined,
      undefined,
      async () => new EndpointResolver('cloud', 'v3')
    );
  });

  it('creates the issue first and uploads multiple attachments afterward', async () => {
    const result = await issueOperations.create({
      Project: 'ENG',
      'Issue Type': 'Task',
      Summary: 'Test',
      attachments: [
        { data: new Uint8Array([1]), filename: 'one.txt' },
        { data: new Uint8Array([2]), filename: 'two.txt' },
      ],
    });

    expect(client.post).toHaveBeenCalledWith('/rest/api/3/issue', expect.any(Object));
    expect(client.postMultipart).toHaveBeenCalledWith(
      '/rest/api/3/issue/ENG-123/attachments',
      expect.any(FormData)
    );
    expect(result).toMatchObject({
      key: 'ENG-123',
      attachments: [{ id: '20001', filename: 'notes.txt', size: 7 }],
    });
    expect(resolver.resolveFieldsWithExtraction).toHaveBeenCalledWith({
      Project: 'ENG',
      'Issue Type': 'Task',
      Summary: 'Test',
    });
  });

  it('does not upload attachments during validation', async () => {
    const result = await issueOperations.create(
      {
        Project: 'ENG',
        'Issue Type': 'Task',
        Summary: 'Test',
        attachments: { data: new Uint8Array([1]), filename: 'one.txt' },
      },
      { validate: true }
    );

    expect(client.post).not.toHaveBeenCalled();
    expect(client.postMultipart).not.toHaveBeenCalled();
    expect(result).toMatchObject({ key: 'DRY-RUN', id: '0' });
  });

  it('throws an attachment-specific error while preserving the created issue', async () => {
    client.postMultipart.mockRejectedValueOnce(new Error('Jira rejected the files'));

    await expect(
      issueOperations.create({
        Project: 'ENG',
        'Issue Type': 'Task',
        Summary: 'Test',
        attachments: { data: new Uint8Array([1]), filename: 'one.txt' },
      })
    ).rejects.toMatchObject({
      code: 'ATTACHMENT_UPLOAD_ERROR',
      details: { issueKey: 'ENG-123' },
    } satisfies Partial<AttachmentUploadError>);
  });

  it('rejects attachments in bulk input', async () => {
    await expect(
      issueOperations.create([
        {
          Project: 'ENG',
          'Issue Type': 'Task',
          Summary: 'Test',
          attachments: { data: new Uint8Array([1]), filename: 'one.txt' },
        },
      ])
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

import { EndpointResolver } from '../../../src/client/EndpointResolver.js';
import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import type { ProjectSchema } from '../../../src/types/schema.js';

function fixture(withCache = true, deployment?: 'server' | 'cloud', endpointResolverFn?: () => Promise<EndpointResolver>, preprocessQuotes = false) {
  const projectSchema: ProjectSchema = {
    projectKey: 'TEST', issueType: 'Task', fields: {
      summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } },
      description: { id: 'description', name: 'Description', type: 'string', required: false, schema: { type: 'string' } },
    },
  };
  const client = {
    get: jest.fn(async (path: string) => path.includes('createmeta')
      ? { values: [{ id: '1', name: 'Task' }] }
      : [{ id: '1', key: 'TEST', name: 'Test' }]),
    post: jest.fn().mockResolvedValue({ issues: [{ key: 'TEST-1', id: '1', self: '' }], errors: [] }),
    put: jest.fn(), delete: jest.fn(), postMultipart: jest.fn(),
  };
  const schema = { getFieldsForIssueType: jest.fn().mockResolvedValue(projectSchema) };
  const cache = { get: jest.fn().mockResolvedValue({ value: null }), set: jest.fn() };
  const resolver = new FieldResolver(schema as any, undefined, client as any);
  const ops = new IssueOperations(client as any, schema as any, resolver, new ConverterRegistry(),
    withCache ? cache as any : undefined, 'https://jira.test', { baseUrl: 'https://jira.test', preprocessQuotes, timeout: { cleanupMarkers: false } } as any, deployment, endpointResolverFn);
  return { ops, client, cache, projectSchema, resolver };
}

const record = { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Validation only' };

describe('issue validation never submits', () => {
  it.each([
    ['array', [record]],
    ['JSON', { data: JSON.stringify(record), format: 'json' }],
    ['YAML', { data: 'Project: TEST\nIssue Type: Task\nSummary: Validation only', format: 'yaml' }],
    ['CSV', { data: 'Project,Issue Type,Summary\nTEST,Task,Validation only', format: 'csv' }],
    ['wrapped JSON', { data: JSON.stringify({ fields: { project: { key: 'TEST' }, issuetype: { name: 'Task' }, summary: record.Summary } }), format: 'json' }],
  ])('%s prepares fields without writes', async (_name, input) => {
    const { ops, client, cache } = fixture();
    const result: any = await ops.create(input as any, { validate: true });
    expect(result).toMatchObject({ validation: true, valid: true, total: 1 });
    expect(result.results[0]).toMatchObject({ index: 0, valid: true, payload: { fields: { summary: record.Summary } } });
    expect(result).not.toHaveProperty('manifest');
    expect(client.post).not.toHaveBeenCalled();
    expect(client.put).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
    expect(client.postMultipart).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not require bulk storage for validation', async () => {
    const { ops } = fixture(false);
    await expect(ops.create([record], { validate: true })).resolves.toMatchObject({ valid: true });
  });

  it('reports pending parents without creating them or inventing issue keys', async () => {
    const { ops, client } = fixture();
    const result: any = await ops.create([
      { ...record, uid: 'parent-row' },
      { ...record, Parent: 'parent-row' },
    ], { validate: true });
    expect(result.results[1]).toMatchObject({ valid: true, dependencies: [{ field: 'Parent', uid: 'parent-row', index: 0 }] });
    expect(result.results[1].payload.fields).not.toHaveProperty('parent');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('validates retry rows without updating the stored manifest', async () => {
    const { ops, client, cache } = fixture();
    cache.get.mockResolvedValue({ value: JSON.stringify({ id: 'run-1', total: 2, succeeded: [0], failed: [1], created: { 0: 'TEST-1' }, errors: {}, timestamp: 1 }) });
    const result: any = await ops.create([record, record], { validate: true, retry: 'run-1' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].index).toBe(1);
    expect(client.post).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('returns each row error without submitting the valid rows', async () => {
    const { ops, client } = fixture();
    const result: any = await ops.create([record, { Summary: 'Missing project' }], { validate: true });
    expect(result).toMatchObject({ valid: false, total: 2 });
    expect(result.results[1]).toMatchObject({ index: 1, valid: false, error: expect.stringContaining('Project') });
    expect(client.post).not.toHaveBeenCalled();
  });
});

describe('creation and preview use the same preparation', () => {
  it.each(['server', 'cloud'] as const)('prepares the same %s fields in preview, validation and submission', async deployment => {
    const { ops, client, projectSchema } = fixture(true, deployment, () => Promise.resolve(new EndpointResolver(deployment, deployment === 'cloud' ? 'v3' : 'v2')));
    projectSchema.fields.issuetype = { id: 'issuetype', name: 'Issue Type', type: 'issuetype', required: true, schema: { type: 'issuetype' } };
    projectSchema.fields.timetracking = { id: 'timetracking', name: 'Time Tracking', type: 'timetracking', required: false, schema: { type: 'timetracking' } };
    const input = { ...record, Description: '"quoted" C:\\path\nnext line', 'Time Tracking': '2h' };
    const preview: any = await ops.preview(input);
    const validation: any = await ops.create(input, { validate: true });
    expect(preview.valid).toBe(true);
    expect(preview.payload.fields).toEqual(validation.fields);
    expect(client.post).not.toHaveBeenCalled();
    await ops.create(input);
    expect(client.post).toHaveBeenCalledWith(deployment === 'cloud' ? '/rest/api/3/issue' : '/rest/api/2/issue', preview.payload);
    expect((await ops.preview(input) as any).payload).toEqual(preview.payload);
  });
  it.each(['array', 'json'] as const)('previews %s bulk input without writes', async format => {
    const { ops, client } = fixture();
    const input = format === 'array' ? [record] : { data: JSON.stringify(record), format: 'json' as const };
    const preview: any = await ops.preview(input);
    const validation: any = await ops.create(input, { validate: true });
    expect(preview[0].valid).toBe(true);
    expect(preview[0].payload).toEqual(validation.results[0].payload);
    expect(client.post).not.toHaveBeenCalled();
  });
  it.each(['server', 'cloud', 'unavailable'] as const)('uses automatic deployment %s for preview', async deployment => {
    const endpoint = async () => {
      if (deployment === 'unavailable') throw new Error('offline');
      return new EndpointResolver(deployment, deployment === 'cloud' ? 'v3' : 'v2');
    };
    const { ops } = fixture(true, undefined, endpoint);
    const preview: any = await ops.preview({ ...record, Description: 'text' });
    expect(preview.valid).toBe(true);
    expect(preview.deployment).toBe(deployment === 'cloud' ? 'cloud' : 'server');
  });
  it('honors explicit legacy quote repair and per-input overrides', async () => {
    const { ops } = fixture(true, 'server', undefined, true);
    const data = 'Project: TEST\nIssue Type: Task\nSummary: "a "quote" here"';
    expect((await ops.create({ data, format: 'yaml' }, { validate: true }) as any).valid).toBe(true);
    await expect(ops.create({ data, format: 'yaml', preprocessQuotes: false }, { validate: true })).rejects.toThrow();
  });
  it('reports a missing retry manifest without writes', async () => {
    const { ops, client } = fixture();
    await expect(ops.create([record], { validate: true, retry: 'missing' })).rejects.toThrow('not found or expired');
    expect(client.post).not.toHaveBeenCalled();
  });
  it('reports a missing retry row without writes', async () => {
    const { ops, cache, client } = fixture();
    cache.get.mockResolvedValue({ value: JSON.stringify({ id: 'run', total: 2, failed: [1], succeeded: [0] }) });
    const result: any = await ops.create([record], { validate: true, retry: 'run' });
    expect(result.results[0]).toMatchObject({ index: 1, valid: false, error: expect.stringContaining('missing') });
    expect(client.post).not.toHaveBeenCalled();
  });
  it('rejects invalid required fields equally in preview and validation', async () => {
    const { ops, client } = fixture();
    const input = { ...record, Summary: '' };
    expect(await ops.preview(input)).toMatchObject({ valid: false, payload: { fields: {} } });
    await expect(ops.create(input, { validate: true })).rejects.toThrow('Summary');
    expect(client.post).not.toHaveBeenCalled();
  });
});

it('validates a retry parent against the key already stored in the manifest', async () => {
  const { ops, client, cache, resolver } = fixture();
  cache.get.mockResolvedValue({ value: JSON.stringify({ id: 'run', total: 2, failed: [1], succeeded: [0], uidMap: { parent: 'TEST-1' } }) });
  const prepare = jest.spyOn(resolver, 'resolveFieldsWithExtraction').mockResolvedValue({ projectKey: 'TEST', issueType: 'Task', fields: { summary: 'Child', parent: { key: 'TEST-1' } } });
  const result: any = await ops.create([{ ...record, uid: 'parent' }, { ...record, Parent: 'parent' }], { validate: true, retry: 'run' });
  expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ Parent: 'TEST-1' }));
  expect(result.results[0]).toMatchObject({ index: 1, valid: true, dependencies: [], payload: { fields: { parent: { key: 'TEST-1' } } } });
  expect(client.post).not.toHaveBeenCalled();
  expect(client.put).not.toHaveBeenCalled();
  expect(cache.set).not.toHaveBeenCalled();
});
it('reports a non-Error preparation failure without submitting other rows', async () => {
  const { ops, resolver, client } = fixture();
  jest.spyOn(resolver, 'resolveFieldsWithExtraction').mockRejectedValue('offline');
  expect(await ops.create([record], { validate: true })).toMatchObject({ valid: false, results: [{ valid: false, error: 'offline' }] });
  expect(client.post).not.toHaveBeenCalled();
});

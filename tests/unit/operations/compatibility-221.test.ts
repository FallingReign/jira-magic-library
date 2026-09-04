import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import { JiraClientImpl } from '../../../src/client/JiraClient.js';
import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import { convertTimeTrackingType } from '../../../src/converters/types/TimeTrackingConverter.js';
import type { ProjectSchema } from '../../../src/types/schema.js';

// Exercise parsing, resolution, conversion and HTTP serialization. Only Jira and
// metadata/storage are replaced; assertions inspect the actual POST body.
function fixture() {
  const schema: ProjectSchema = {
    projectKey: 'TEST', issueType: 'Task', fields: {
      summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } },
      description: { id: 'description', name: 'Description', type: 'text', required: false, schema: { type: 'string' } },
      timetracking: { id: 'timetracking', name: 'Time Tracking', type: 'timetracking', required: false, schema: { type: 'timetracking' } },
      customfield_1: { id: 'customfield_1', name: 'Sprint', type: 'sprint', required: false, schema: { type: 'array', custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
      customfield_2: { id: 'customfield_2', name: 'Optional Text', type: 'string', required: false, schema: { type: 'string' } },
    },
  };
  const requests: Array<{ url: string; body: any }> = [];
  let rejectCreate = false;
  jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    const address = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (init?.method === 'POST') {
      requests.push({ url: address, body: JSON.parse(init.body as string) });
      if (rejectCreate) return new Response(JSON.stringify({ errors: { summary: 'You must specify a summary of the issue.' } }), { status: 400 });
      const issue = { id: '1', key: 'TEST-1', self: 'https://jira.test/rest/api/2/issue/1' };
      return new Response(JSON.stringify(address.endsWith('/bulk') ? { issues: [issue], errors: [] } : issue), { status: 201 });
    }
    if (address.includes('createmeta')) return new Response(JSON.stringify({ values: [{ id: '1', name: 'Task' }] }));
    if (address.endsWith('/project')) return new Response(JSON.stringify([{ id: '1', key: 'TEST', name: 'Test' }]));
    if (address.endsWith('/project/TEST')) return new Response(JSON.stringify({ id: '1', key: 'TEST', name: 'Test' }));
    throw new Error('Unexpected Jira request: ' + address);
  });
  const config = { baseUrl: 'https://jira.test', auth: { token: 'test-token' }, timeout: { cleanupMarkers: false } };
  const client = new JiraClientImpl(config);
  const discovery = { getFieldsForIssueType: jest.fn().mockResolvedValue(schema) };
  const resolver = new FieldResolver(discovery as any, undefined, client);
  const cache = { get: jest.fn().mockResolvedValue({ value: null }), set: jest.fn() };
  const ops = new IssueOperations(client, discovery as any, resolver, new ConverterRegistry(), cache as any, config.baseUrl, config, 'server');
  return { ops, requests, schema, reject: () => { rejectCreate = true; } };
}

const common = { Project: 'TEST', 'Issue Type': 'Task', Summary: 'Compatibility test' };
const yamlCommon = 'Project: TEST\nIssue Type: Task\nSummary: Compatibility test\n';

describe('2.2.1 final Jira requests', () => {
  it.each(['1d', '"1d"', "'1d'"])('wraps YAML timeTracking: %s in the outgoing request', async duration => {
    const { ops, requests } = fixture();
    await ops.create({ data: yamlCommon + 'timeTracking: ' + duration, format: 'yaml' });
    expect(requests).toHaveLength(1);
    expect(requests[0].body.issueUpdates[0].fields.timetracking).toEqual({ originalEstimate: '1d' });
  });

  it('preserves nested original and remaining estimates', async () => {
    const { ops, requests } = fixture();
    const timetracking = { originalEstimate: '1d', remainingEstimate: '2h' };
    await ops.create({ data: JSON.stringify({ ...common, timetracking }), format: 'json' });
    expect(requests[0].body.issueUpdates[0].fields.timetracking).toEqual(timetracking);
  });

  it('keeps the standalone duration converter return value compatible', () => {
    const { schema } = fixture();
    expect(convertTimeTrackingType('1d', schema.fields.timetracking, { projectKey: 'TEST', issueType: 'Task' })).toBe('1d');
    expect(convertTimeTrackingType(30, schema.fields.timetracking, { projectKey: 'TEST', issueType: 'Task' })).toBe('0m');
  });

  it('preserves the top-level Original Estimate and Remaining Estimate fields', async () => {
    const { ops, requests } = fixture();
    await ops.create({ ...common, 'Original Estimate': '1d', 'Remaining Estimate': '2h' });
    expect(requests[0].body.fields.timetracking).toEqual({ originalEstimate: '1d', remainingEstimate: '2h' });
  });

  it.each([null, '', '  \t  ', undefined])('omits only blank Sprint (%p), retaining other blank text', async Sprint => {
    const { ops, requests } = fixture();
    await ops.create({ data: JSON.stringify({ ...common, Sprint, 'Optional Text': '', Description: '' }), format: 'json' });
    const fields = requests[0].body.issueUpdates[0].fields;
    expect(fields).not.toHaveProperty('customfield_1');
    expect(fields.customfield_2).toBe('');
    expect(fields.description).toBe('');
  });

  it('retains a supplied Sprint ID', async () => {
    const { ops, requests } = fixture();
    await ops.create({ ...common, Sprint: 123 });
    expect(requests[0].body.fields.customfield_1).toBe(123);
  });

  it.each(['json', 'yaml', 'csv'] as const)('%s blocks retain quotes, paths and internal lines, with existing cleanup', async format => {
    for (const wrapper of ['', '"', "'"]) {
      const { ops, requests } = fixture();
      const raw = '  User said "broken". C:\\temp\\file\n\n  Keep internal spaces.\nUnicode: \u200b①\u00a0end  ';
      const expected = 'User said "broken". C:\\temp\\file\n\n  Keep internal spaces.\nUnicode: 1 end';
      const block = wrapper + '<<<\n' + raw + '\n>>>' + wrapper;
      const data = format === 'json' ? JSON.stringify(common).slice(0, -1) + ',"Description":' + block + '}'
        : format === 'yaml' ? yamlCommon + 'Description: ' + block
        : 'Project,Issue Type,Summary,Description\nTEST,Task,Compatibility test,' + block;
      await ops.create({ data, format });
      expect(requests[0].body.issueUpdates[0].fields.description).toBe(expected);
      jest.restoreAllMocks();
    }
  });

  it.each(['json', 'yaml'] as const)('%s escaped quotes and backslashes reach Jira once escaped', async format => {
    const { ops, requests } = fixture();
    const description = 'He said "broken". C:\\work\\file';
    const data = format === 'json' ? JSON.stringify({ ...common, Description: description })
      : yamlCommon + 'Description: ' + JSON.stringify(description);
    await ops.create({ data, format });
    expect(requests[0].body.issueUpdates[0].fields.description).toBe(description);
  });

  it.each(['json', 'yaml'] as const)('%s preserves trailing escaped backslashes', async format => {
    const { ops, requests } = fixture();
    const description = 'Folder "name": C:\\work\\';
    const data = format === 'json' ? JSON.stringify({ ...common, Description: description })
      : yamlCommon + 'Description: ' + JSON.stringify(description);
    await ops.create({ data, format });
    expect(requests[0].body.issueUpdates[0].fields.description).toBe(description);
  });

  it.each(['json', 'yaml'] as const)('%s still repairs unescaped quotes by default', async format => {
    const { ops, requests } = fixture();
    const data = format === 'json' ? JSON.stringify(common).slice(0, -1) + ',"Description":"He said "broken""}'
      : yamlCommon + 'Description: "He said "broken""';
    await ops.create({ data, format });
    expect(requests[0].body.issueUpdates[0].fields.description).toBe('He said "broken"');
  });

  it('retains raw Windows paths and literal backslash-n under existing quote repair', async () => {
    const { ops, requests } = fixture();
    await ops.create({ data: yamlCommon + 'Description: "C:\\temp\\file literal \\n"', format: 'yaml' });
    expect(requests[0].body.issueUpdates[0].fields.description).toBe('C:\\temp\\file literal \\n');
  });

  it('keeps duplicate normalized field behavior and existing text cleanup', async () => {
    const { ops, requests } = fixture();
    await ops.create({ data: JSON.stringify({ ...common, ' Summary ': '  Last \u200b①\u00a0value  ' }), format: 'json' });
    expect(requests[0].body.issueUpdates[0].fields.summary).toBe('Last 1 value');
  });

  it('sends missing required fields to Jira and preserves its error', async () => {
    const { ops, requests, reject } = fixture();
    reject();
    await expect(ops.create({ Project: 'TEST', 'Issue Type': 'Task' })).rejects.toThrow('You must specify a summary');
    expect(requests).toHaveLength(1);
    expect(requests[0].body.fields).not.toHaveProperty('summary');
  });

  it('sends an empty required Summary to Jira and preserves its error', async () => {
    const { ops, requests, reject } = fixture();
    reject();
    await expect(ops.create({ ...common, Summary: '' })).rejects.toThrow('You must specify a summary');
    expect(requests[0].body.fields.summary).toBe('');
  });

  it('retains existing omission of other null fields', async () => {
    const { ops, requests } = fixture();
    await ops.create({ data: JSON.stringify({ ...common, 'Optional Text': null }), format: 'json' });
    expect(requests[0].body.issueUpdates[0].fields).not.toHaveProperty('customfield_2');
  });
});

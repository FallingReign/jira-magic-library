import { PayloadPreview } from '../../../src/operations/PayloadPreview.js';
import { IssueSearch } from '../../../src/operations/IssueSearch.js';
import { MarkerInjector } from '../../../src/operations/bulk/MarkerInjector.js';

function fixture(fields: Record<string, unknown> = {}) {
  const client = { post: jest.fn() };
  const resolver = { resolveFieldsWithExtraction: jest.fn().mockResolvedValue({ projectKey: 'TEST', issueType: 'Task', fields }) };
  const converter = { convertFields: jest.fn().mockResolvedValue(fields) };
  const preview = new PayloadPreview(client as any, { getFieldsForIssueType: jest.fn() } as any,
    resolver as any, converter as any, undefined,
    async () => ({ issueCreate: () => '/rest/api/2/issue' }) as any, async () => 'server');
  return { preview, resolver, converter, client };
}

describe('2.2.0 preview compatibility', () => {
  it.each([
    [null, 'null'], [undefined, 'null'], [0, '0'], [false, 'false'], [[], '[0 items]'],
    [{ value: 'Red' }, '{value: Red}'], [{ type: 'doc' }, '[ADF document]'],
    [{ other: 'value' }, '{"other":"value"}'],
  ])('describes %p without changing the preview result shape', async (value, description) => {
    const { preview, client } = fixture({ customfield_1: value });
    const result = await preview.preview({ customfield_1: 'Original' });
    expect(Object.keys(result).sort()).toEqual(['deployment', 'endpoint', 'payload', 'resolutions', 'warnings']);
    expect(result.resolutions.customfield_1).toEqual({ input: 'Original', resolvedTo: description,
      fieldId: 'customfield_1', confidence: 1, resolvedValue: value });
    expect(client.post).not.toHaveBeenCalled();
  });

  it('retains partial matches and their warning', async () => {
    const { preview } = fixture({ summary: 'Resolved' });
    const result = await preview.preview({ 'Summary Detail': 'Original', Unknown: 'Unused' });
    expect(result.resolutions['Summary Detail']).toMatchObject({ fieldId: 'summary', confidence: 0.7 });
    expect(result.resolutions).not.toHaveProperty('Unknown');
    expect(result.warnings).toEqual([{ field: 'Summary Detail', message: 'Low confidence match (0.70): "Summary Detail" → "summary"' }]);
  });

  it('returns a partial preview when resolution rejects with a string', async () => {
    const { preview, resolver, client } = fixture();
    resolver.resolveFieldsWithExtraction.mockRejectedValue('offline');
    expect(await preview.preview({ Summary: 'Original' })).toEqual({
      payload: { fields: {} }, resolutions: {}, warnings: [{ field: '_resolution', message: 'Field resolution failed: offline' }],
      endpoint: '/rest/api/2/issue', deployment: 'server',
    });
    expect(client.post).not.toHaveBeenCalled();
  });

  it('retains resolved fields when conversion rejects with a string', async () => {
    const { preview, converter } = fixture({ summary: 'Original' });
    converter.convertFields.mockRejectedValue('unavailable');
    const result = await preview.preview({ Summary: 'Original' });
    expect(result.payload.fields).toEqual({ summary: 'Original' });
    expect(result.warnings).toEqual([{ field: '_conversion', message: 'Conversion failed: unavailable' }]);
  });
});

describe('unchanged search and tracking requests', () => {
  it('supports ordering without a filter and retains zero and false criteria', async () => {
    const client = { get: jest.fn().mockResolvedValue({ issues: [] }) };
    const search = new IssueSearch(client as any, {} as any, {} as any, {} as any);
    await search.search({ orderBy: 'created DESC' });
    expect(client.get.mock.calls[0][1].jql).toBe('ORDER BY created DESC');
    await search.search({ votes: 0, flagged: false });
    expect(client.get.mock.calls[1][1].jql).toBe('votes ~ "0" AND flagged ~ "false"');
  });

  it('does not duplicate an existing tracking marker', () => {
    const injector = new MarkerInjector('job');
    const payload = { fields: { labels: ['existing', injector.getMarker()] } };
    expect(injector.injectMarker(payload)).toEqual(payload);
    expect(payload.fields.labels).toHaveLength(2);
  });

  it('reports missing cleanup credentials', async () => {
    await expect(new MarkerInjector('job').removeMarkerFromIssue('TEST-1')).rejects.toThrow('JiraClient is required');
  });
});

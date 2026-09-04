import { IssueSearch } from '../../../src/operations/IssueSearch.js';
import { MarkerInjector } from '../../../src/operations/bulk/MarkerInjector.js';

describe('search input boundaries', () => {
  it('builds number and boolean criteria without losing zero or false', async () => {
    const client = { get: jest.fn().mockResolvedValue({ issues: [] }) };
    const search = new IssueSearch(client as any, {} as any, {} as any, {} as any);
    await search.search({ votes: 0, flagged: false });
    expect(client.get.mock.calls[0][1].jql).toBe('votes ~ "0" AND flagged ~ "false"');
  });
  it('rejects objects as search values before sending a request', async () => {
    const client = { get: jest.fn() };
    const search = new IssueSearch(client as any, {} as any, {} as any, {} as any);
    await expect(search.search({ project: { key: 'TEST' } })).rejects.toThrow('must contain text');
    expect(client.get).not.toHaveBeenCalled();
  });
  it('supports ordering without a filter', async () => {
    const client = { get: jest.fn().mockResolvedValue({ issues: [] }) };
    const search = new IssueSearch(client as any, {} as any, {} as any, {} as any);
    await search.search({ orderBy: 'created DESC' });
    expect(client.get.mock.calls[0][1].jql).toBe('ORDER BY created DESC');
  });
  it('does not duplicate an existing tracking marker', () => {
    const injector = new MarkerInjector('job');
    const payload = { fields: { labels: ['existing', injector.getMarker()] } };
    expect(injector.injectMarker(payload)).toEqual(payload);
    expect(payload.fields.labels).toHaveLength(2);
  });
  it('reports missing cleanup credentials without pretending markers were removed', async () => {
    await expect(new MarkerInjector('job').removeMarkerFromIssue('TEST-1')).rejects.toThrow('JiraClient is required');
  });
});

import { convertProjectType } from '../../../src/converters/types/ProjectConverter.js';
import { convertIssueTypeType } from '../../../src/converters/types/IssueTypeConverter.js';
import { convertUserType, __userConverterInternals } from '../../../src/converters/types/UserConverter.js';
import { convertSprintType } from '../../../src/converters/types/SprintConverter.js';
import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { InMemoryCache } from '../../../src/cache/InMemoryCache.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';
import type { FieldSchema } from '../../../src/types/schema.js';

const field = (type: string): FieldSchema => ({ id: type, name: type, type, required: false, schema: { type } });
const base = { projectKey: 'TEST', issueType: 'Task', baseUrl: 'https://jira.test' };
const project = { id: '1', key: 'TEST', name: 'Testing' };
const type = { id: '2', name: 'Task' };

describe('converter deployment and cache boundaries', () => {
  it.each(['cloud', 'server', 'unavailable'] as const)('resolves project and issue type using %s endpoints', async deployment => {
    const resolverFn = async () => { if (deployment === 'unavailable') throw new Error('offline'); return new EndpointResolver(deployment, deployment === 'cloud' ? 'v3' : 'v2'); };
    const client = { get: jest.fn(async (url: string) => url.includes('issuetypes') ? { values: [type] } : url.endsWith('/TEST') ? project : { values: [project] }) };
    const context = { ...base, client: client as any, endpointResolverFn: resolverFn };
    expect(await convertProjectType('TEST', field('project'), context)).toEqual({ key: 'TEST' });
    expect(await convertProjectType('Testing', field('project'), context)).toEqual({ key: 'TEST' });
    expect(await convertIssueTypeType('Task', field('issuetype'), context)).toMatchObject({ id: '2' });
    const prefix = deployment === 'cloud' ? '/rest/api/3/' : '/rest/api/2/';
    expect(client.get.mock.calls.every(([url]) => url.startsWith(prefix))).toBe(true);
    const schema = { getFieldsForIssueType: async () => ({ projectKey: 'TEST', issueType: 'Task', fields: {} }) };
    const fields = new FieldResolver(schema as any, undefined, client as any, undefined, undefined, resolverFn);
    expect(await fields.resolveFieldsWithExtraction({ Project: 'Testing', 'Issue Type': 'Task' })).toMatchObject({ projectKey: 'TEST', issueType: 'Task' });
  });
  it('reports empty paginated project lists without treating the envelope as a project', async () => {
    const client = { get: async () => ({}) };
    await expect(convertProjectType('Testing', field('project'), { ...base, client: client as any })).rejects.toThrow();
    const resolver = new FieldResolver({} as any, undefined, client as any);
    await expect(resolver.resolveFieldsWithExtraction({ Project: 'Testing', 'Issue Type': 'Task' })).rejects.toThrow('Project');
  });
  it.each(['cloud', 'server', 'unavailable'] as const)('resolves users through %s lookup endpoints', async deployment => {
    const resolverFn = async () => { if (deployment === 'unavailable') throw new Error('offline'); return new EndpointResolver(deployment, deployment === 'cloud' ? 'v3' : 'v2'); };
    const client = { get: jest.fn().mockResolvedValue([{ name: 'alice', accountId: 'a', displayName: 'Alice', active: true, emailAddress: 'alice@example.com' }]) };
    expect(await convertUserType('alice@example.com', field('user'), { ...base, client: client as any, endpointResolverFn: resolverFn })).toBeDefined();
    expect(client.get.mock.calls[0][0]).toBe(deployment === 'cloud' ? '/rest/api/3/user/search' : '/rest/api/2/user/search');
    expect(client.get.mock.calls[0][1]).toHaveProperty(deployment === 'cloud' ? 'query' : 'username', deployment === 'cloud' ? '' : '.');
  });
  it('handles two missing optional user sort fields equally', () => {
    expect(__userConverterInternals.compareStrings()).toBe(0);
  });
  it('preserves the 2.2.0 metadata shape for known and unknown fields', async () => {
    const client = { get: jest.fn(async (url: string) => url.endsWith('/issuetypes') ? { values: [type] } : { values: [{ fieldId: 'summary', name: 'Summary', required: true, hasDefaultValue: true, schema: { type: 'string' } }, { fieldId: 'customfield_1', name: 'Unknown', required: false }] }) };
    const discovery = new SchemaDiscovery(client as any, new InMemoryCache() as any, base.baseUrl, () => Promise.resolve(new EndpointResolver('cloud', 'v3')));
    const schema = await discovery.getFieldsForIssueType('TEST', 'Task');
    expect(schema.fields.summary).not.toHaveProperty('hasDefaultValue');
    expect(schema.fields.customfield_1.type).toBe('unknown');
  });
  it('falls back to Server metadata after deployment lookup fails', async () => {
    const client = { get: jest.fn().mockResolvedValue({ values: [type] }) };
    const discovery = new SchemaDiscovery(client as any, new InMemoryCache() as any, base.baseUrl, () => Promise.reject(new Error('offline')));
    expect(await discovery.getIssueTypesForProject('TEST')).toEqual([type]);
    expect(client.get).toHaveBeenCalledWith('/rest/api/2/issue/createmeta/TEST/issuetypes');
  });
  it('reports a non-Error metadata failure', async () => {
    await expect(convertIssueTypeType('Task', field('issuetype'), { ...base, client: { get: jest.fn().mockRejectedValue('offline') } as any })).rejects.toThrow('offline');
  });
  it.each([true, false])('finishes background Sprint refresh for a %s stale cache', async stale => {
    const sprints = [{ id: 7, name: 'Sprint One', state: 'active' }];
    const refreshes: Promise<void>[] = [];
    const cache = { getLookup: jest.fn().mockResolvedValue({ value: stale ? sprints : null, isStale: stale }), setLookup: jest.fn(), refreshOnce: jest.fn((_key: string, fn: () => Promise<void>) => { const work = fn(); refreshes.push(work); return work; }) };
    const client = { get: jest.fn(async (url: string) => url.endsWith('/board') ? { values: [{ id: 1 }], isLast: true } : { values: sprints, isLast: true }) };
    expect(await convertSprintType('Sprint One', field('sprint'), { ...base, client: client as any, cache: cache as any })).toBe(7);
    await Promise.all(refreshes);
    expect(cache.setLookup).toHaveBeenCalledWith('TEST', 'sprint', sprints, undefined);
  });
  it('resolves a unique partial Sprint name and rejects unsafe numeric IDs', async () => {
    const cache = { getLookup: async () => ({ value: [{ id: 7, name: 'Team Sprint One', state: 'active' }], isStale: false }) };
    expect(await convertSprintType('Sprint One', field('sprint'), { ...base, cache: cache as any })).toBe(7);
    await expect(convertSprintType(Number.MAX_SAFE_INTEGER + 1, field('sprint'), base)).rejects.toThrow('safe integer');
  });
});

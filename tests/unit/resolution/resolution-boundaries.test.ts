import { InMemoryCache } from '../../../src/cache/InMemoryCache.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';
import { EntityResolver } from '../../../src/resolution/EntityResolver.js';
import { FieldOptionResolver } from '../../../src/resolution/FieldOptionResolver.js';
import { UserResolver } from '../../../src/resolution/UserResolver.js';

const endpoints = new EndpointResolver('cloud', 'v3');
const metadata = (allowedValues: unknown[]) => ({ projects: [{ issuetypes: [{ name: 'Task', fields: { customfield_1: { allowedValues } } }] }] });

describe('resolution boundaries', () => {
  it('deduplicates statuses, tolerates missing categories, and reads the cache', async () => {
    const client = { get: jest.fn().mockResolvedValue([{ name: 'Task', statuses: [{ id: '1', name: 'Open' }, { id: '1', name: 'Open' }] }]) };
    const resolver = new EntityResolver(client as any, new InMemoryCache(), endpoints, 'cloud');
    expect(await resolver.getStatuses('TEST', 'Unknown type')).toEqual([{ id: '1', name: 'Open', category: 'unknown' }]);
    expect(await resolver.getStatuses('TEST', 'Task')).toHaveLength(1);
    expect(client.get).toHaveBeenCalledTimes(1);
  });
  it.each(['getPriorities', 'getComponents', 'getVersions'] as const)('%s tolerates missing data and caches an empty result', async method => {
    const client = { get: jest.fn().mockResolvedValue(null) };
    const resolver = new EntityResolver(client as any, new InMemoryCache(), endpoints, 'cloud');
    expect(await resolver[method]('TEST')).toEqual([]);
    expect(await resolver[method]('TEST')).toEqual([]);
    expect(client.get).toHaveBeenCalledTimes(1);
  });
  it('tolerates absent status lists and reports unresolved entities', async () => {
    const resolver = new EntityResolver({ get: async () => null } as any, new InMemoryCache(), endpoints, 'cloud');
    expect(await resolver.getStatuses('TEST')).toEqual([]);
    await expect(resolver.resolvePriority('High')).rejects.toThrow();
  });
  it('reports unresolved entity names', async () => {
    const resolver = new EntityResolver({ get: async () => [{ id: '1', name: 'High' }, { id: '2', name: 'High' }] } as any, new InMemoryCache(), endpoints, 'cloud');
    await expect(resolver.resolvePriority('xxxxxxxx')).rejects.toThrow(/Could not resolve/i);
  });
  it('reuses cascading options and distinguishes missing children from unknown children', async () => {
    const client = { get: jest.fn().mockResolvedValue(metadata([{ id: '1', value: 'Parent', children: [{ id: '2', value: 'Child' }] }, { id: '3', value: 'Empty' }])) };
    const resolver = new FieldOptionResolver(client as any, new InMemoryCache(), endpoints, 'cloud');
    expect(await resolver.resolveCascading('customfield_1', 'Parent', 'Child', 'TEST', 'Task')).toEqual({ id: '1', child: { id: '2' } });
    expect(await resolver.resolveCascading('customfield_1', 'Parent', '', 'TEST', 'Task')).toEqual({ id: '1' });
    await expect(resolver.resolveCascading('customfield_1', 'Empty', 'Child', 'TEST', 'Task')).rejects.toThrow('no child options');
    await expect(resolver.resolveCascading('customfield_1', 'Parent', 'xyzxyz', 'TEST', 'Task')).rejects.toThrow('Could not resolve child');
    expect(client.get).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { values: [] }, { values: [{ id: '10' }] }])('handles missing Cloud contexts/options (%p)', async response => {
    const get = jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(response).mockResolvedValue({});
    const resolver = new FieldOptionResolver({ get } as any, new InMemoryCache(), endpoints, 'cloud');
    expect(await resolver.getOptions('customfield_1', 'TEST', 'Task')).toEqual([]);
    await expect(resolver.resolveCascading('customfield_1', 'Parent', 'Child', 'TEST', 'Task')).rejects.toThrow('Could not resolve parent');
  });
  it('uses a non-global Cloud context when it is the only available context', async () => {
    const get = jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ values: [{ id: '10' }] }).mockResolvedValueOnce({ values: [{ id: '1', value: 'Red' }, { id: '2', value: 'Retired', disabled: true }] });
    const resolver = new FieldOptionResolver({ get } as any, new InMemoryCache(), endpoints, 'cloud');
    expect(await resolver.getOptions('customfield_1', 'TEST', 'Task')).toEqual([{ id: '1', value: 'Red' }]);
  });
  it.each(['cloud', 'server'] as const)('rejects a resolved %s user without its required identity', async deployment => {
    const resolver = new UserResolver({ get: async () => [{ displayName: 'Alice', active: true }] } as any, new InMemoryCache(), new EndpointResolver(deployment), deployment);
    await expect(resolver.resolveForPayload('Alice')).rejects.toThrow(deployment === 'cloud' ? 'no accountId' : 'no name/username');
  });
  it('treats an unexpected user response as no matches', async () => {
    const resolver = new UserResolver({ get: async () => ({}) } as any, new InMemoryCache(), endpoints, 'cloud');
    expect(await resolver.search('Alice')).toEqual([]);
  });
});

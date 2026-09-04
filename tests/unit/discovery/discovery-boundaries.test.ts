import { FieldMetadataDiscovery } from '../../../src/discovery/FieldMetadataDiscovery.js';
import { ProjectDiscovery } from '../../../src/discovery/ProjectDiscovery.js';
import { InMemoryCache } from '../../../src/cache/InMemoryCache.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';

const endpoints = () => Promise.resolve(new EndpointResolver('server'));
describe('discovery response boundaries', () => {
  it('supports fields without schema and context lookup by a fuzzy issue type', async () => {
    const get = jest.fn().mockResolvedValueOnce({ values: [{ id: '1', name: 'Task' }] }).mockResolvedValueOnce({ values: [{ fieldId: 'summary', name: 'Summary', required: true }] });
    const discovery = new FieldMetadataDiscovery({ get } as any, new InMemoryCache(), endpoints);
    expect(await discovery.listAll({ projectKey: 'TEST', issueType: 'Taks' })).toMatchObject([{ id: 'summary', type: 'unknown', schema: undefined }]);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it.each([undefined, {}, { values: [] }, { values: [{ id: '1', name: 'Task' }] }])('reports missing issue types in metadata %p', async response => {
    const discovery = new FieldMetadataDiscovery({ get: async () => response } as any, new InMemoryCache(), endpoints);
    await expect(discovery.getForContext('TEST', 'Not an issue type')).rejects.toThrow('not found');
  });
  it('handles a missing field page and an empty global list', async () => {
    const get = jest.fn().mockResolvedValueOnce({ values: [{ id: '1', name: 'Task' }] }).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const discovery = new FieldMetadataDiscovery({ get } as any, new InMemoryCache(), endpoints);
    expect(await discovery.getForContext('TEST', '1')).toEqual([]);
    expect(await discovery.listAll()).toEqual([]);
  });
  it('maps global fields that omit schema and key', async () => {
    const discovery = new FieldMetadataDiscovery({ get: async () => [{ id: 'summary', name: 'Summary', custom: false }] } as any, new InMemoryCache(), endpoints);
    expect(await discovery.listAll()).toMatchObject([{ key: 'summary', type: 'unknown' }]);
  });
  it.each(['server', 'cloud'] as const)('handles an empty %s project response', async deployment => {
    const discovery = new ProjectDiscovery({ get: async () => undefined } as any, new InMemoryCache(), () => Promise.resolve(new EndpointResolver(deployment)));
    expect(await discovery.list()).toEqual([]);
  });
  it('filters Server projects by type and tolerates a missing lead display name', async () => {
    const discovery = new ProjectDiscovery({ get: async () => [{ id: '1', key: 'TEST', name: 'Test', lead: { name: 'alice' } }, { id: '2', key: 'HELP', name: 'Help', projectTypeKey: 'service_desk' }] } as any, new InMemoryCache(), endpoints);
    expect(await discovery.list({ type: 'software' })).toMatchObject([{ key: 'TEST', lead: { displayName: '' } }]);
  });
});

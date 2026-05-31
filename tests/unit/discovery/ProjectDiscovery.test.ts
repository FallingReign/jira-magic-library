/**
 * ProjectDiscovery unit tests
 */
import { ProjectDiscovery } from '../../../src/discovery/ProjectDiscovery.js';
import { InMemoryCache } from '../../../src/cache/InMemoryCache.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';

function createMockClient(responses: Record<string, unknown> = {}): JiraClient {
  return {
    get: jest.fn(async (endpoint: string) => {
      for (const [key, value] of Object.entries(responses)) {
        if (endpoint.includes(key)) return value;
      }
      return null;
    }),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

const cloudResolver = new EndpointResolver('cloud', 'v3');
const serverResolver = new EndpointResolver('server', 'v2');

describe('ProjectDiscovery', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('list() - Cloud', () => {
    it('should fetch paginated projects from Cloud endpoint', async () => {
      const mockProjects = {
        values: [
          { id: '10001', key: 'PROJ', name: 'Project One', projectTypeKey: 'software', style: 'classic' },
          { id: '10002', key: 'BIZ', name: 'Business App', projectTypeKey: 'business' },
        ],
        maxResults: 50,
        startAt: 0,
        total: 2,
        isLast: true,
      };

      const client = createMockClient({ 'project/search': mockProjects });
      const discovery = new ProjectDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.list();

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('PROJ');
      expect(result[0].style).toBe('classic');
      expect(result[1].projectTypeKey).toBe('business');
      expect(client.get).toHaveBeenCalledWith(
        '/rest/api/3/project/search',
        expect.objectContaining({ maxResults: 50, startAt: 0 })
      );
    });

    it('should pass query and type filter to Cloud', async () => {
      const client = createMockClient({ 'project/search': { values: [], total: 0, isLast: true } });
      const discovery = new ProjectDiscovery(client, cache, async () => cloudResolver);

      await discovery.list({ query: 'test', type: 'software', maxResults: 10 });

      expect(client.get).toHaveBeenCalledWith(
        '/rest/api/3/project/search',
        expect.objectContaining({ query: 'test', typeKey: 'software', maxResults: 10 })
      );
    });
  });

  describe('list() - Server', () => {
    it('should fetch all projects and paginate client-side', async () => {
      const mockProjects = [
        { id: '1', key: 'A', name: 'Alpha', projectTypeKey: 'software' },
        { id: '2', key: 'B', name: 'Beta', projectTypeKey: 'business' },
        { id: '3', key: 'C', name: 'Charlie', projectTypeKey: 'software' },
      ];

      const client = createMockClient({ '/rest/api/2/project': mockProjects });
      const discovery = new ProjectDiscovery(client, cache, async () => serverResolver);

      const result = await discovery.list({ maxResults: 2, startAt: 0 });
      expect(result).toHaveLength(2);

      const page2 = await discovery.list({ maxResults: 2, startAt: 2 });
      expect(page2).toHaveLength(1);
      expect(page2[0].key).toBe('C');
    });

    it('should filter by type on Server', async () => {
      const mockProjects = [
        { id: '1', key: 'A', name: 'Alpha', projectTypeKey: 'software' },
        { id: '2', key: 'B', name: 'Beta', projectTypeKey: 'business' },
      ];

      const client = createMockClient({ '/rest/api/2/project': mockProjects });
      const discovery = new ProjectDiscovery(client, cache, async () => serverResolver);

      const result = await discovery.list({ type: 'business' });
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('B');
    });
  });

  describe('search()', () => {
    it('should fuzzy search Server projects client-side', async () => {
      const mockProjects = [
        { id: '1', key: 'ALPHA', name: 'Alpha Project', projectTypeKey: 'software' },
        { id: '2', key: 'BETA', name: 'Beta Service', projectTypeKey: 'software' },
        { id: '3', key: 'GAMMA', name: 'Gamma Platform', projectTypeKey: 'software' },
      ];

      const client = createMockClient({ '/rest/api/2/project': mockProjects });
      const discovery = new ProjectDiscovery(client, cache, async () => serverResolver);

      const result = await discovery.search('Alpha');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].key).toBe('ALPHA');
    });

    it('should use Cloud server-side query', async () => {
      const client = createMockClient({ 'project/search': { values: [], total: 0, isLast: true } });
      const discovery = new ProjectDiscovery(client, cache, async () => cloudResolver);

      await discovery.search('test');

      expect(client.get).toHaveBeenCalledWith(
        '/rest/api/3/project/search',
        expect.objectContaining({ query: 'test' })
      );
    });
  });

  describe('get()', () => {
    it('should fetch a single project by key', async () => {
      const mockProject = { id: '10001', key: 'PROJ', name: 'My Project', projectTypeKey: 'software' };
      const client = createMockClient({ '/rest/api/3/project/PROJ': mockProject });
      const discovery = new ProjectDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.get('PROJ');
      expect(result.key).toBe('PROJ');
      expect(result.name).toBe('My Project');
    });

    it('should cache single project results', async () => {
      const mockProject = { id: '10001', key: 'PROJ', name: 'My Project', projectTypeKey: 'software' };
      const client = createMockClient({ '/rest/api/3/project/PROJ': mockProject });
      const discovery = new ProjectDiscovery(client, cache, async () => cloudResolver);

      await discovery.get('PROJ');
      await discovery.get('PROJ');

      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError for missing project', async () => {
      const client = createMockClient({ '/rest/api/3/project/NOPE': { key: undefined } });
      const discovery = new ProjectDiscovery(client, cache, async () => cloudResolver);

      await expect(discovery.get('NOPE')).rejects.toThrow('not found');
    });
  });

  describe('caching', () => {
    it('should cache Server project list', async () => {
      const mockProjects = [{ id: '1', key: 'A', name: 'Alpha', projectTypeKey: 'software' }];
      const client = createMockClient({ '/rest/api/2/project': mockProjects });
      const discovery = new ProjectDiscovery(client, cache, async () => serverResolver);

      await discovery.list();
      await discovery.list();

      // Second call should use cache
      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('lead mapping', () => {
    it('should map lead info', async () => {
      const mockProject = {
        id: '10001',
        key: 'PROJ',
        name: 'My Project',
        projectTypeKey: 'software',
        lead: { displayName: 'Alice', accountId: '123', name: 'alice' },
        avatarUrls: { '48x48': 'https://example.com/avatar.png' },
      };
      const client = createMockClient({ '/rest/api/3/project/PROJ': mockProject });
      const discovery = new ProjectDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.get('PROJ');
      expect(result.lead?.displayName).toBe('Alice');
      expect(result.lead?.accountId).toBe('123');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    });
  });
});

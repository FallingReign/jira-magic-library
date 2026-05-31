/**
 * IssueTypeDiscovery unit tests
 */
import { IssueTypeDiscovery } from '../../../src/discovery/IssueTypeDiscovery.js';
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

const mockIssueTypes = {
  values: [
    { id: '10000', name: 'Epic', description: 'Big feature', subtask: false, hierarchyLevel: 1 },
    { id: '10001', name: 'Story', description: 'User story', subtask: false, hierarchyLevel: 0 },
    { id: '10002', name: 'Bug', description: 'Defect', subtask: false },
    { id: '10003', name: 'Sub-task', description: 'Subtask', subtask: true },
    {
      id: '10004',
      name: 'Task',
      description: 'A task',
      subtask: false,
      scope: { type: 'PROJECT', project: { id: '10001' } },
    },
  ],
  total: 5,
};

describe('IssueTypeDiscovery', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('getForProject()', () => {
    it('should return all issue types for a project', async () => {
      const client = createMockClient({ 'createmeta/PROJ/issuetypes': mockIssueTypes });
      const discovery = new IssueTypeDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.getForProject('PROJ');

      expect(result).toHaveLength(5);
      expect(result[0].name).toBe('Epic');
      expect(result[0].hierarchyLevel).toBe(1);
    });

    it('should filter out subtasks when includeSubtasks=false', async () => {
      const client = createMockClient({ 'createmeta/PROJ/issuetypes': mockIssueTypes });
      const discovery = new IssueTypeDiscovery(client, cache, async () => serverResolver);

      const result = await discovery.getForProject('PROJ', { includeSubtasks: false });

      expect(result).toHaveLength(4);
      expect(result.find((t) => t.name === 'Sub-task')).toBeUndefined();
    });

    it('should apply fuzzy query filter', async () => {
      const client = createMockClient({ 'createmeta/PROJ/issuetypes': mockIssueTypes });
      const discovery = new IssueTypeDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.getForProject('PROJ', { query: 'bug' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('Bug');
    });

    it('should cache results for 15 minutes', async () => {
      const client = createMockClient({ 'createmeta/PROJ/issuetypes': mockIssueTypes });
      const discovery = new IssueTypeDiscovery(client, cache, async () => cloudResolver);

      await discovery.getForProject('PROJ');
      await discovery.getForProject('PROJ');

      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it('should detect Cloud team-managed scope', async () => {
      const client = createMockClient({ 'createmeta/PROJ/issuetypes': mockIssueTypes });
      const discovery = new IssueTypeDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.getForProject('PROJ');
      const task = result.find((t) => t.name === 'Task');

      expect(task?.scope).toEqual({ type: 'PROJECT', projectId: '10001' });
    });

    it('should throw NotFoundError when no issue types exist', async () => {
      const client = createMockClient({ 'createmeta/EMPTY/issuetypes': { values: [] } });
      const discovery = new IssueTypeDiscovery(client, cache, async () => cloudResolver);

      await expect(discovery.getForProject('EMPTY')).rejects.toThrow('No issue types found');
    });
  });

  describe('resolve()', () => {
    it('should resolve exact match (case-insensitive)', async () => {
      const client = createMockClient({ 'createmeta/PROJ/issuetypes': mockIssueTypes });
      const discovery = new IssueTypeDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.resolve('PROJ', 'bug');
      expect(result.name).toBe('Bug');
      expect(result.id).toBe('10002');
    });

    it('should resolve fuzzy match', async () => {
      const client = createMockClient({ 'createmeta/PROJ/issuetypes': mockIssueTypes });
      const discovery = new IssueTypeDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.resolve('PROJ', 'stor');
      expect(result.name).toBe('Story');
    });

    it('should throw NotFoundError for no match', async () => {
      const client = createMockClient({ 'createmeta/PROJ/issuetypes': mockIssueTypes });
      const discovery = new IssueTypeDiscovery(client, cache, async () => cloudResolver);

      await expect(discovery.resolve('PROJ', 'zzzzzzz')).rejects.toThrow('not found');
    });
  });
});

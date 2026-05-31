/**
 * EntityResolver unit tests
 */
import { EntityResolver } from '../../../src/resolution/EntityResolver.js';
import { InMemoryCache } from '../../../src/cache/InMemoryCache.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';

function createMockClient(responses: Record<string, unknown> = {}): JiraClient {
  return {
    get: jest.fn(async (endpoint: string) => {
      for (const [key, value] of Object.entries(responses)) {
        if (endpoint.includes(key)) return value;
      }
      return [];
    }),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

const cloudResolver = new EndpointResolver('cloud', 'v3');
const serverResolver = new EndpointResolver('server', 'v2');

describe('EntityResolver', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('resolvePriority()', () => {
    it('should resolve exact priority name', async () => {
      const priorities = [
        { id: '1', name: 'Highest' },
        { id: '2', name: 'High' },
        { id: '3', name: 'Medium' },
        { id: '4', name: 'Low' },
        { id: '5', name: 'Lowest' },
      ];
      const client = createMockClient({ 'priority': priorities });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolvePriority('High');

      expect(result.id).toBe('2');
      expect(result.name).toBe('High');
      expect(result.type).toBe('priority');
      expect(result.confidence).toBe(1.0);
    });

    it('should fuzzy match priority', async () => {
      const priorities = [
        { id: '1', name: 'Critical' },
        { id: '2', name: 'Major' },
        { id: '3', name: 'Minor' },
      ];
      const client = createMockClient({ 'priority': priorities });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolvePriority('Critica');

      expect(result.id).toBe('1');
      expect(result.name).toBe('Critical');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThan(1.0);
    });

    it('should throw with suggestions when no priority match', async () => {
      const priorities = [
        { id: '1', name: 'High' },
        { id: '2', name: 'Medium' },
        { id: '3', name: 'Low' },
      ];
      const client = createMockClient({ 'priority': priorities });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      try {
        await resolver.resolvePriority('Nonexistent');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).message).toContain('Did you mean');
        expect((err as ValidationError).message).toContain('priority');
      }
    });

    it('should cache priorities', async () => {
      const priorities = [{ id: '1', name: 'High' }];
      const client = createMockClient({ 'priority': priorities });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      await resolver.resolvePriority('High');
      await resolver.resolvePriority('High');

      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it('should be case-insensitive', async () => {
      const priorities = [{ id: '1', name: 'Medium' }];
      const client = createMockClient({ 'priority': priorities });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolvePriority('medium');

      expect(result.id).toBe('1');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('resolveStatus()', () => {
    it('should resolve status for a project', async () => {
      const statuses = [
        { id: '10001', name: 'Bug', statuses: [
          { id: '1', name: 'Open', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
          { id: '2', name: 'In Progress', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
          { id: '3', name: 'Done', statusCategory: { id: 3, key: 'done', name: 'Done' } },
        ]},
      ];
      const client = createMockClient({ 'statuses': statuses });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolveStatus('In Progress', 'PROJ');

      expect(result.id).toBe('2');
      expect(result.name).toBe('In Progress');
      expect(result.type).toBe('status');
      expect(result.confidence).toBe(1.0);
    });

    it('should filter statuses by issue type when provided', async () => {
      const statuses = [
        { id: '10001', name: 'Bug', statuses: [
          { id: '1', name: 'Open', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
          { id: '2', name: 'Bug Review', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
        ]},
        { id: '10002', name: 'Task', statuses: [
          { id: '1', name: 'Open', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
          { id: '4', name: 'Task Review', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
        ]},
      ];
      const client = createMockClient({ 'statuses': statuses });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolveStatus('Bug Review', 'PROJ', 'Bug');

      expect(result.id).toBe('2');
      expect(result.name).toBe('Bug Review');
    });

    it('should throw when status not found', async () => {
      const statuses = [
        { id: '10001', name: 'Bug', statuses: [
          { id: '1', name: 'Open', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
        ]},
      ];
      const client = createMockClient({ 'statuses': statuses });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      await expect(resolver.resolveStatus('Nonexistent', 'PROJ')).rejects.toThrow(ValidationError);
    });
  });

  describe('resolveComponent()', () => {
    it('should resolve component by name', async () => {
      const components = [
        { id: '100', name: 'Frontend' },
        { id: '101', name: 'Backend' },
        { id: '102', name: 'Infrastructure' },
      ];
      const client = createMockClient({ 'components': components });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolveComponent('Frontend', 'PROJ');

      expect(result.id).toBe('100');
      expect(result.name).toBe('Frontend');
      expect(result.type).toBe('component');
      expect(result.confidence).toBe(1.0);
    });

    it('should fuzzy match component', async () => {
      const components = [
        { id: '100', name: 'Frontend' },
        { id: '101', name: 'Backend API' },
      ];
      const client = createMockClient({ 'components': components });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolveComponent('front', 'PROJ');

      expect(result.id).toBe('100');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should throw when component not found', async () => {
      const components = [
        { id: '100', name: 'Frontend' },
      ];
      const client = createMockClient({ 'components': components });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      await expect(resolver.resolveComponent('zzzzz', 'PROJ')).rejects.toThrow(ValidationError);
    });
  });

  describe('resolveVersion()', () => {
    it('should resolve version by name', async () => {
      const versions = [
        { id: '200', name: '1.0.0', released: true },
        { id: '201', name: '2.0.0', released: false },
        { id: '202', name: '2.1.0-beta', released: false },
      ];
      const client = createMockClient({ 'versions': versions });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolveVersion('2.0.0', 'PROJ');

      expect(result.id).toBe('201');
      expect(result.name).toBe('2.0.0');
      expect(result.type).toBe('version');
      expect(result.confidence).toBe(1.0);
    });

    it('should fuzzy match version', async () => {
      const versions = [
        { id: '200', name: 'Release 1.0', released: true },
        { id: '201', name: 'Release 2.0', released: false },
      ];
      const client = createMockClient({ 'versions': versions });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolveVersion('Release 2', 'PROJ');

      expect(result.id).toBe('201');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should throw when version not found', async () => {
      const versions = [
        { id: '200', name: '1.0.0', released: true },
      ];
      const client = createMockClient({ 'versions': versions });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      await expect(resolver.resolveVersion('zzzzz', 'PROJ')).rejects.toThrow(ValidationError);
    });
  });

  describe('Cloud deployment', () => {
    it('should use api/3 base for Cloud', async () => {
      const priorities = [{ id: '1', name: 'High' }];
      const client = createMockClient({ 'priority': priorities });
      const resolver = new EntityResolver(client, cache, cloudResolver, 'cloud');

      await resolver.resolvePriority('High');

      expect(client.get).toHaveBeenCalledWith('/rest/api/3/priority');
    });
  });

  describe('getPriorities()', () => {
    it('should return all priorities', async () => {
      const priorities = [
        { id: '1', name: 'High' },
        { id: '2', name: 'Medium' },
      ];
      const client = createMockClient({ 'priority': priorities });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.getPriorities();

      expect(result).toEqual([
        { id: '1', name: 'High' },
        { id: '2', name: 'Medium' },
      ]);
    });
  });

  describe('getVersions()', () => {
    it('should return versions with released flag', async () => {
      const versions = [
        { id: '200', name: '1.0.0', released: true },
        { id: '201', name: '2.0.0', released: false },
      ];
      const client = createMockClient({ 'versions': versions });
      const resolver = new EntityResolver(client, cache, serverResolver, 'server');

      const result = await resolver.getVersions('PROJ');

      expect(result).toEqual([
        { id: '200', name: '1.0.0', released: true },
        { id: '201', name: '2.0.0', released: false },
      ]);
    });
  });
});

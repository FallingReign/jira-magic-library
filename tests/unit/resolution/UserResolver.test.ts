/**
 * UserResolver unit tests
 */
import { UserResolver } from '../../../src/resolution/UserResolver.js';
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

describe('UserResolver', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('Cloud deployment', () => {
    it('should resolve user by email with confidence 1.0', async () => {
      const mockUsers = [
        { accountId: 'abc123', displayName: 'Alice Smith', emailAddress: 'alice@company.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      const result = await resolver.resolve('alice@company.com');

      expect(result.accountId).toBe('abc123');
      expect(result.displayName).toBe('Alice Smith');
      expect(result.confidence).toBe(1.0);
      expect(client.get).toHaveBeenCalledWith('/rest/api/3/user/search', {
        query: 'alice@company.com',
        maxResults: 10,
      });
    });

    it('should resolve user by display name with confidence 0.95', async () => {
      const mockUsers = [
        { accountId: 'def456', displayName: 'Bob Jones', emailAddress: 'bob@company.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      const result = await resolver.resolve('Bob Jones');

      expect(result.accountId).toBe('def456');
      expect(result.confidence).toBe(0.95);
    });

    it('should use fuzzy matching for partial names', async () => {
      const mockUsers = [
        { accountId: 'u1', displayName: 'John Smith', emailAddress: 'john@example.com', active: true },
        { accountId: 'u2', displayName: 'Jane Doe', emailAddress: 'jane@example.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      const result = await resolver.resolve('John');

      expect(result.accountId).toBe('u1');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(0.95);
    });

    it('should throw ValidationError when no match found', async () => {
      const client = createMockClient({ 'user/search': [] });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      await expect(resolver.resolve('nonexistent@example.com')).rejects.toThrow(ValidationError);
    });

    it('should filter inactive users by default', async () => {
      const mockUsers = [
        { accountId: 'u1', displayName: 'Active User', emailAddress: 'user@example.com', active: true },
        { accountId: 'u2', displayName: 'Inactive User', emailAddress: 'inactive@example.com', active: false },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      const results = await resolver.search('user');

      expect(results.every((r) => r.active)).toBe(true);
    });

    it('should include inactive users when activeOnly is false', async () => {
      const mockUsers = [
        { accountId: 'u1', displayName: 'Active User', emailAddress: 'user@example.com', active: true },
        { accountId: 'u2', displayName: 'Inactive User', emailAddress: 'user@example.com', active: false },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      const results = await resolver.search('user', { activeOnly: false });

      expect(results.length).toBe(2);
    });

    it('should return accountId payload for Cloud', async () => {
      const mockUsers = [
        { accountId: 'abc123', displayName: 'Alice Smith', emailAddress: 'alice@company.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      const payload = await resolver.resolveForPayload('alice@company.com');

      expect(payload).toEqual({ accountId: 'abc123' });
    });

    it('should cache user search results', async () => {
      const mockUsers = [
        { accountId: 'u1', displayName: 'John Smith', emailAddress: 'john@example.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      await resolver.search('john');
      await resolver.search('john');

      // Should only call API once due to caching
      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('Server deployment', () => {
    it('should use username param for Server', async () => {
      const mockUsers = [
        { name: 'jsmith', displayName: 'John Smith', emailAddress: 'john.smith@company.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolve('jsmith');

      expect(result.name).toBe('jsmith');
      expect(result.confidence).toBe(0.95);
      expect(client.get).toHaveBeenCalledWith('/rest/api/2/user/search', {
        username: 'jsmith',
        maxResults: 10,
      });
    });

    it('should return name payload for Server', async () => {
      const mockUsers = [
        { name: 'jsmith', displayName: 'John Smith', emailAddress: 'john.smith@company.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, serverResolver, 'server');

      const payload = await resolver.resolveForPayload('jsmith');

      expect(payload).toEqual({ name: 'jsmith' });
    });

    it('should resolve Server user by email', async () => {
      const mockUsers = [
        { name: 'jsmith', displayName: 'John Smith', emailAddress: 'john.smith@company.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolve('john.smith@company.com');

      expect(result.name).toBe('jsmith');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('search()', () => {
    it('should return multiple candidates sorted by confidence', async () => {
      const mockUsers = [
        { accountId: 'u1', displayName: 'John Smith', emailAddress: 'john@example.com', active: true },
        { accountId: 'u2', displayName: 'Johnny Appleseed', emailAddress: 'johnny@example.com', active: true },
        { accountId: 'u3', displayName: 'Jonathan Adams', emailAddress: 'jonathan@example.com', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      const results = await resolver.search('John Smith');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.displayName).toBe('John Smith');
      expect(results[0]!.confidence).toBe(0.95);
      // Results should be sorted descending by confidence
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.confidence).toBeLessThanOrEqual(results[i - 1]!.confidence);
      }
    });

    it('should respect maxResults option', async () => {
      const mockUsers = [
        { accountId: 'u1', displayName: 'User One', active: true },
      ];
      const client = createMockClient({ 'user/search': mockUsers });
      const resolver = new UserResolver(client, cache, cloudResolver, 'cloud');

      await resolver.search('user', { maxResults: 5 });

      expect(client.get).toHaveBeenCalledWith('/rest/api/3/user/search', {
        query: 'user',
        maxResults: 5,
      });
    });
  });
});

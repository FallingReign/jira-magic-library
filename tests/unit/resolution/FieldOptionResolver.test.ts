/**
 * FieldOptionResolver unit tests
 */
import { FieldOptionResolver } from '../../../src/resolution/FieldOptionResolver.js';
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
      return null;
    }),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

const cloudResolver = new EndpointResolver('cloud', 'v3');
const serverResolver = new EndpointResolver('server', 'v2');

const createmetaResponse = (fieldId: string, options: Array<{ id: string; value: string; disabled?: boolean; children?: Array<{ id: string; value: string }> }>) => ({
  projects: [{
    issuetypes: [{
      name: 'Bug',
      fields: {
        [fieldId]: {
          allowedValues: options,
        },
      },
    }],
  }],
});

describe('FieldOptionResolver', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('resolve()', () => {
    it('should resolve exact match with confidence 1.0', async () => {
      const meta = createmetaResponse('customfield_10001', [
        { id: '1', value: 'High' },
        { id: '2', value: 'Medium' },
        { id: '3', value: 'Low' },
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolve('customfield_10001', 'High', 'PROJ', 'Bug');

      expect(result.id).toBe('1');
      expect(result.value).toBe('High');
      expect(result.confidence).toBe(1.0);
    });

    it('should resolve fuzzy match', async () => {
      const meta = createmetaResponse('customfield_10001', [
        { id: '1', value: 'Critical' },
        { id: '2', value: 'Major' },
        { id: '3', value: 'Minor' },
        { id: '4', value: 'Trivial' },
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolve('customfield_10001', 'Critica', 'PROJ', 'Bug');

      expect(result.id).toBe('1');
      expect(result.value).toBe('Critical');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should be case-insensitive for exact match', async () => {
      const meta = createmetaResponse('customfield_10001', [
        { id: '1', value: 'Enhancement' },
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolve('customfield_10001', 'enhancement', 'PROJ', 'Bug');

      expect(result.id).toBe('1');
      expect(result.confidence).toBe(1.0);
    });

    it('should throw ValidationError when no match found', async () => {
      const meta = createmetaResponse('customfield_10001', [
        { id: '1', value: 'Option A' },
        { id: '2', value: 'Option B' },
        { id: '3', value: 'Option C' },
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      await expect(
        resolver.resolve('customfield_10001', 'zzzznonexistent', 'PROJ', 'Bug')
      ).rejects.toThrow(ValidationError);
    });

    it('should include suggestions in error message', async () => {
      const meta = createmetaResponse('customfield_10001', [
        { id: '1', value: 'Apple' },
        { id: '2', value: 'Banana' },
        { id: '3', value: 'Cherry' },
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      try {
        await resolver.resolve('customfield_10001', 'zzzzz', 'PROJ', 'Bug');
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).message).toContain('Did you mean');
      }
    });

    it('should throw when no options available', async () => {
      const meta = createmetaResponse('customfield_10001', []);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      await expect(
        resolver.resolve('customfield_10001', 'anything', 'PROJ', 'Bug')
      ).rejects.toThrow(ValidationError);
    });

    it('should filter disabled options', async () => {
      const meta = createmetaResponse('customfield_10001', [
        { id: '1', value: 'Active', disabled: false },
        { id: '2', value: 'Disabled', disabled: true },
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      const options = await resolver.getOptions('customfield_10001', 'PROJ', 'Bug');

      expect(options).toHaveLength(1);
      expect(options[0]!.value).toBe('Active');
    });
  });

  describe('getOptions()', () => {
    it('should cache options', async () => {
      const meta = createmetaResponse('customfield_10001', [
        { id: '1', value: 'Option A' },
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      await resolver.getOptions('customfield_10001', 'PROJ', 'Bug');
      await resolver.getOptions('customfield_10001', 'PROJ', 'Bug');

      // Should only call API once
      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it('should fallback to field context API for Cloud custom fields', async () => {
      // Empty createmeta, but field context returns options
      const client: JiraClient = {
        get: jest.fn(async (endpoint: string) => {
          if (endpoint.includes('createmeta')) {
            return { projects: [{ issuetypes: [{ name: 'Bug', fields: {} }] }] };
          }
          if (endpoint.includes('/context') && !endpoint.includes('/option')) {
            return { values: [{ id: 'ctx1', name: 'Default', isGlobalContext: true }] };
          }
          if (endpoint.includes('/option')) {
            return { values: [{ id: '10', value: 'Cloud Option' }] };
          }
          return null;
        }),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
      };

      const resolver = new FieldOptionResolver(client, cache, cloudResolver, 'cloud');

      const options = await resolver.getOptions('customfield_10050', 'PROJ', 'Bug');

      expect(options).toHaveLength(1);
      expect(options[0]!.value).toBe('Cloud Option');
    });
  });

  describe('resolveCascading()', () => {
    it('should resolve parent and child options', async () => {
      const meta = createmetaResponse('customfield_10002', [
        { id: 'p1', value: 'Category A', children: [
          { id: 'c1', value: 'Sub A1' },
          { id: 'c2', value: 'Sub A2' },
        ]},
        { id: 'p2', value: 'Category B', children: [
          { id: 'c3', value: 'Sub B1' },
        ]},
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolveCascading(
        'customfield_10002', 'Category A', 'Sub A2', 'PROJ', 'Bug'
      );

      expect(result.id).toBe('p1');
      expect(result.child).toEqual({ id: 'c2' });
    });

    it('should resolve parent only when no child query', async () => {
      const meta = createmetaResponse('customfield_10002', [
        { id: 'p1', value: 'Category A', children: [
          { id: 'c1', value: 'Sub A1' },
        ]},
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      const result = await resolver.resolveCascading(
        'customfield_10002', 'Category A', '', 'PROJ', 'Bug'
      );

      expect(result.id).toBe('p1');
      expect(result.child).toBeUndefined();
    });

    it('should throw when parent not found in cascading', async () => {
      const meta = createmetaResponse('customfield_10002', [
        { id: 'p1', value: 'Category A', children: [] },
      ]);
      const client = createMockClient({ 'createmeta': meta });
      const resolver = new FieldOptionResolver(client, cache, serverResolver, 'server');

      await expect(
        resolver.resolveCascading('customfield_10002', 'Nonexistent', 'Child', 'PROJ', 'Bug')
      ).rejects.toThrow(ValidationError);
    });
  });
});

/**
 * FieldMetadataDiscovery unit tests
 */
import { FieldMetadataDiscovery } from '../../../src/discovery/FieldMetadataDiscovery.js';
import { InMemoryCache } from '../../../src/cache/InMemoryCache.js';
import { EndpointResolver } from '../../../src/client/EndpointResolver.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';

function createMockClient(responses: Record<string, unknown> = {}): JiraClient {
  return {
    get: jest.fn(async (endpoint: string) => {
      // Sort keys by length descending to match most specific first
      const sortedKeys = Object.keys(responses).sort((a, b) => b.length - a.length);
      for (const key of sortedKeys) {
        if (endpoint.includes(key)) return responses[key];
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

const mockGlobalFields = [
  { id: 'summary', key: 'summary', name: 'Summary', custom: false, schema: { type: 'string', system: 'summary' } },
  { id: 'priority', key: 'priority', name: 'Priority', custom: false, schema: { type: 'priority', system: 'priority' } },
  { id: 'customfield_10024', key: 'customfield_10024', name: 'Story Points', custom: true, schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float', customId: 10024 } },
  { id: 'customfield_10030', key: 'customfield_10030', name: 'Sprint', custom: true, schema: { type: 'array', items: 'json', custom: 'com.pyxis.greenhopper.jira:gh-sprint', customId: 10030 } },
];

const mockIssueTypes = {
  values: [
    { id: '10001', name: 'Bug' },
    { id: '10002', name: 'Story' },
  ],
};

const mockContextFields = {
  values: [
    { fieldId: 'summary', name: 'Summary', required: true, schema: { type: 'string', system: 'summary' } },
    { fieldId: 'priority', name: 'Priority', required: false, schema: { type: 'priority', system: 'priority' }, allowedValues: [{ id: '1', name: 'Highest' }, { id: '2', name: 'High' }] },
    { fieldId: 'customfield_10024', name: 'Story Points', required: false, schema: { type: 'number', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float', customId: 10024 } },
  ],
  total: 3,
};

describe('FieldMetadataDiscovery', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('listAll()', () => {
    it('should return all global fields', async () => {
      const client = createMockClient({ '/rest/api/3/field': mockGlobalFields });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.listAll();

      expect(result).toHaveLength(4);
      expect(result[0].id).toBe('summary');
      expect(result[0].custom).toBe(false);
      expect(result[2].id).toBe('customfield_10024');
      expect(result[2].custom).toBe(true);
    });

    it('should filter custom-only', async () => {
      const client = createMockClient({ '/rest/api/2/field': mockGlobalFields });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => serverResolver);

      const result = await discovery.listAll({ customOnly: true });

      expect(result).toHaveLength(2);
      expect(result.every((f) => f.custom)).toBe(true);
    });

    it('should fuzzy search by name', async () => {
      const client = createMockClient({ '/rest/api/3/field': mockGlobalFields });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.listAll({ query: 'story' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('Story Points');
    });

    it('should cache global fields', async () => {
      const client = createMockClient({ '/rest/api/3/field': mockGlobalFields });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      await discovery.listAll();
      await discovery.listAll();

      // Only one API call
      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getForContext()', () => {
    it('should return fields for a project + issue type', async () => {
      const client = createMockClient({
        'createmeta/PROJ/issuetypes': mockIssueTypes,
        'createmeta/PROJ/issuetypes/10001': mockContextFields,
      });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.getForContext('PROJ', 'Bug');

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('summary');
      expect(result[0].required).toBe(true);
      expect(result[1].allowedValues).toHaveLength(2);
    });

    it('should mark customfield_ IDs as custom', async () => {
      const client = createMockClient({
        'createmeta/PROJ/issuetypes': mockIssueTypes,
        'createmeta/PROJ/issuetypes/10001': mockContextFields,
      });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.getForContext('PROJ', 'Bug');
      const storyPoints = result.find((f) => f.id === 'customfield_10024');

      expect(storyPoints?.custom).toBe(true);
      expect(storyPoints?.name).toBe('Story Points');
    });

    it('should cache context fields', async () => {
      const client = createMockClient({
        'createmeta/PROJ/issuetypes': mockIssueTypes,
        'createmeta/PROJ/issuetypes/10001': mockContextFields,
      });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      await discovery.getForContext('PROJ', 'Bug');
      await discovery.getForContext('PROJ', 'Bug');

      // Issue type lookup + fields lookup = 2 calls first time, 0 second time
      expect(client.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('get()', () => {
    it('should find field by ID from context', async () => {
      const client = createMockClient({
        'createmeta/PROJ/issuetypes': mockIssueTypes,
        'createmeta/PROJ/issuetypes/10001': mockContextFields,
      });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.get('summary', 'PROJ', 'Bug');
      expect(result?.id).toBe('summary');
      expect(result?.name).toBe('Summary');
    });

    it('should find field by name (case-insensitive)', async () => {
      const client = createMockClient({
        'createmeta/PROJ/issuetypes': mockIssueTypes,
        'createmeta/PROJ/issuetypes/10001': mockContextFields,
      });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.get('story points', 'PROJ', 'Bug');
      expect(result?.id).toBe('customfield_10024');
    });

    it('should fall back to global fields when no context', async () => {
      const client = createMockClient({ '/rest/api/3/field': mockGlobalFields });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.get('Summary');
      expect(result?.id).toBe('summary');
    });

    it('should return null for non-existent field', async () => {
      const client = createMockClient({ '/rest/api/3/field': mockGlobalFields });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.get('NonExistentField');
      expect(result).toBeNull();
    });
  });

  describe('getCustomFields()', () => {
    it('should return only custom fields', async () => {
      const client = createMockClient({ '/rest/api/3/field': mockGlobalFields });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.getCustomFields();

      expect(result).toHaveLength(2);
      expect(result.every((f) => f.custom)).toBe(true);
    });

    it('should filter custom fields by query', async () => {
      const client = createMockClient({ '/rest/api/3/field': mockGlobalFields });
      const discovery = new FieldMetadataDiscovery(client, cache, async () => cloudResolver);

      const result = await discovery.getCustomFields({ query: 'sprint' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('Sprint');
    });
  });
});

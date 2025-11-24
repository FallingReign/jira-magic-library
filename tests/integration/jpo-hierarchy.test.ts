import { JPOHierarchyDiscovery } from '../../src/hierarchy/JPOHierarchyDiscovery.js';
import { JiraClientImpl } from '../../src/client/JiraClient.js';
import { RedisCache } from '../../src/cache/RedisCache.js';
import { loadConfig } from '../../src/config/loader.js';

describe('Integration: E3-S03 JPO Hierarchy Discovery', () => {
  let discovery: JPOHierarchyDiscovery | undefined;
  let cache: RedisCache | undefined;

  beforeAll(() => {
    if (!process.env.JIRA_BASE_URL) {
      console.warn('⚠️  Skipping JPO hierarchy integration tests (JIRA not configured).');
      return;
    }

    const config = loadConfig();

    const redisConfig = {
      host: config.redis?.host ?? 'localhost',
      port: config.redis?.port ?? 6379,
    };

    const client = new JiraClientImpl(config);
    cache = new RedisCache(redisConfig);
    discovery = new JPOHierarchyDiscovery(client, cache);
  });

  afterAll(async () => {
    if (cache) {
      await cache.disconnect();
    }
  });

  it('fetches hierarchy or degrades gracefully when JPO unavailable', async () => {
    if (!discovery) return;

    const hierarchy = await discovery.getHierarchy({ refresh: true });

    if (hierarchy) {
      expect(Array.isArray(hierarchy)).toBe(true);
      expect(hierarchy.length).toBeGreaterThan(0);
      expect(hierarchy[0]).toHaveProperty('id');
      expect(hierarchy[0]).toHaveProperty('title');
      expect(hierarchy[0]).toHaveProperty('issueTypeIds');
    } else {
      expect(hierarchy).toBeNull();
    }
  });

  it('returns cached hierarchy on subsequent calls', async () => {
    if (!discovery) return;

    const first = await discovery.getHierarchy();
    const second = await discovery.getHierarchy();

    expect(second).toEqual(first);
  });
});

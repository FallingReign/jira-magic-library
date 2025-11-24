import { loadConfig } from '../../src/config/loader.js';
import { RedisCache } from '../../src/cache/RedisCache.js';
import { SchemaDiscovery } from '../../src/schema/SchemaDiscovery.js';
import { ParentFieldDiscovery } from '../../src/hierarchy/ParentFieldDiscovery.js';
import { isJiraConfigured } from './helpers.js';
import { JiraClientImpl } from '../../src/client/JiraClient.js';

describe('Integration: E3-S04 Parent Field Discovery', () => {
  let client: JiraClientImpl | undefined;
  let cache: RedisCache | undefined;
  let schemaDiscovery: SchemaDiscovery | undefined;
  let discovery: ParentFieldDiscovery | undefined;

  beforeAll(() => {
    if (!isJiraConfigured()) {
      console.warn('⚠️  Skipping parent field discovery integration tests (JIRA not configured).');
      return;
    }

    const config = loadConfig();
    client = new JiraClientImpl(config);
    cache = new RedisCache({
      host: config.redis?.host ?? 'localhost',
      port: config.redis?.port ?? 6379,
    });
    schemaDiscovery = new SchemaDiscovery(client, cache, config.baseUrl);
    discovery = new ParentFieldDiscovery(schemaDiscovery, cache);
  });

  afterAll(async () => {
    await cache?.disconnect();
  });

  const ensureReady = (): discovery is ParentFieldDiscovery => {
    if (!discovery) {
      console.warn('⚠️  Parent field discovery integration tests skipped (setup incomplete).');
      return false;
    }
    return true;
  };

  it('AC5.1: resolves parent field for configured project', async () => {
    if (!ensureReady()) return;
    const projectKey = process.env.JIRA_PROJECT_KEY;
    if (!projectKey) {
      console.warn('⚠️  Skipping test: JIRA_PROJECT_KEY not set.');
      return;
    }

    const fieldKey = await discovery.getParentFieldKey(projectKey, 'Story');

    if (fieldKey === null) {
      console.warn(`⚠️  Project ${projectKey} has no parent field configured for Story.`);
      return;
    }

    expect(fieldKey.startsWith('customfield_')).toBe(true);
    // Ensure cached call returns same value
    const cached = await discovery.getParentFieldKey(projectKey, 'Story');
    expect(cached).toBe(fieldKey);
  }, 20000);

  it('AC4.2: returns null when project has no parent field', async () => {
    if (!ensureReady()) return;
    const projectKey = process.env.JIRA_PROJECT_KEY_NO_PARENT;
    if (!projectKey) {
      console.warn('⚠️  Skipping no-parent test: JIRA_PROJECT_KEY_NO_PARENT not set.');
      return;
    }

    const fieldKey = await discovery.getParentFieldKey(projectKey, 'Story');
    expect(fieldKey).toBeNull();
  }, 20000);
});

import { ParentFieldDiscovery } from '../../../src/hierarchy/ParentFieldDiscovery.js';
import type { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import type { CacheClient } from '../../../src/types/cache.js';
import type { FieldSchema, ProjectSchema } from '../../../src/types/schema.js';
import { NotFoundError } from '../../../src/errors/NotFoundError.js';

const createMockCache = (): jest.Mocked<CacheClient> => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  clear: jest.fn(),
  ping: jest.fn(),
});

const createSchema = (
  issueType: string,
  fields: Array<{
    key: string;
    name: string;
    schemaType?: string;
    type?: string;
    customPlugin?: string;
  }>
): ProjectSchema => {
  const fieldEntries = fields.map<FieldSchema>((field) => ({
    id: field.key,
    name: field.name,
    type: field.type ?? 'any',
    required: false,
    schema: {
      type: field.schemaType ?? 'any',
      custom: field.customPlugin,
    },
  }));

  return {
    projectKey: 'TEST',
    issueType,
    fields: Object.fromEntries(fieldEntries.map((field) => [field.id, field])),
  };
};

describe('ParentFieldDiscovery', () => {
  let cache: jest.Mocked<CacheClient>;
  let schemaDiscovery: jest.Mocked<SchemaDiscovery>;
  let logger: { warn: jest.Mock };

  beforeEach(() => {
    cache = createMockCache();
    schemaDiscovery = {
      getFieldsForIssueType: jest.fn(),
    } as unknown as jest.Mocked<SchemaDiscovery>;
    logger = { warn: jest.fn() };
  });

  it('returns cached field key when available', async () => {
    cache.get.mockResolvedValue({ value: 'customfield_123', isStale: false });

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Story');

    expect(result).toBe('customfield_123');
    expect(schemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('returns null when cached sentinel present', async () => {
    cache.get.mockResolvedValue({ value: 'null', isStale: false });

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Story');

    expect(result).toBeNull();
    expect(schemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('discovers parent field and caches result', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('Story', [
        { key: 'customfield_10014', name: 'Epic Link', customPlugin: 'com.pyxis.greenhopper.jira:gh-epic-link' },
        { key: 'summary', name: 'Summary', schemaType: 'string', type: 'string' },
      ])
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Story');

    expect(result).toBe('customfield_10014');
    expect(cache.set).toHaveBeenCalledWith(
      'hierarchy:TEST:Story:parent-field',
      'customfield_10014',
      3600
    );
  });

  it('logs and returns null when no candidates found', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('Story', [
        { key: 'summary', name: 'Summary', schemaType: 'string', type: 'string' },
      ])
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Story');

    expect(result).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(
      'hierarchy:TEST:Story:parent-field',
      'null',
      3600
    );
    expect(logger.warn).toHaveBeenCalledWith('Parent field not found for project TEST, issue type Story');
  });

  it('selects highest priority candidate when multiple matches', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('Story', [
        { key: 'customfield_10015', name: 'Parent Issue' },
        { key: 'customfield_10016', name: 'Parent' },
        { key: 'customfield_10017', name: 'Epic Link', customPlugin: 'com.pyxis.greenhopper.jira:gh-epic-link' },
      ])
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Story');

    // Plugin match (Epic Link) wins over name-only matches
    expect(result).toBe('customfield_10017');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns null when issue type not found', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockRejectedValue(
      new NotFoundError('Issue type not found')
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'NonExistent');

    expect(result).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(
      'hierarchy:TEST:NonExistent:parent-field',
      'null',
      3600
    );
  });

  it('returns null when issue type exists but has no parent field', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('SimpleTask', [
        { key: 'summary', name: 'Summary', schemaType: 'string', type: 'string' },
        { key: 'description', name: 'Description', schemaType: 'string', type: 'string' },
      ])
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'SimpleTask');

    expect(result).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(
      'hierarchy:TEST:SimpleTask:parent-field',
      'null',
      3600
    );
    expect(logger.warn).toHaveBeenCalledWith('Parent field not found for project TEST, issue type SimpleTask');
  });

  it('prefers exact matches over partial matches', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('Task', [
        { key: 'customfield_exact', name: 'Parent' },
        { key: 'customfield_partial', name: 'Task Parent Reference' },
      ])
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Task');

    expect(result).toBe('customfield_exact');
  });

  it('uses default logger when none provided', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('Story', [
        { key: 'customfield_a', name: 'Parent Issue' },
        { key: 'customfield_b', name: 'Parent Link', customPlugin: 'com.atlassian.jpo:jpo-custom-field-parent' },
      ])
    );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache);
    const result = await discovery.getParentFieldKey('TEST', 'Story');

    expect(result).toBe('customfield_b'); // Plugin match wins over name-only match
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('rethrows unknown errors from schema discovery', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    const unknownError = new Error('Database connection failed');
    schemaDiscovery.getFieldsForIssueType.mockRejectedValue(unknownError);

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    
    await expect(discovery.getParentFieldKey('TEST', 'Story')).rejects.toThrow('Database connection failed');
  });

  // AC3: Different issue types return different parent fields
  describe('AC3: Hierarchy-Aware Parent Field Resolution', () => {
    it('returns different parent fields for different issue types in same project', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      
      // Mock Epic schema with customfield_10100 (JPO parent link)
      schemaDiscovery.getFieldsForIssueType.mockResolvedValueOnce(
        createSchema('Epic', [
          { key: 'customfield_10100', name: 'Parent Link', customPlugin: 'com.atlassian.jpo:jpo-custom-field-parent' },
        ])
      );

      // Mock Story schema with customfield_10014 (Epic Link)
      schemaDiscovery.getFieldsForIssueType.mockResolvedValueOnce(
        createSchema('Story', [
          { key: 'customfield_10014', name: 'Epic Link', customPlugin: 'com.pyxis.greenhopper.jira:gh-epic-link' },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      
      const epicParentField = await discovery.getParentFieldKey('PROJ', 'Epic');
      const storyParentField = await discovery.getParentFieldKey('PROJ', 'Story');

      expect(epicParentField).toBe('customfield_10100');
      expect(storyParentField).toBe('customfield_10014');
      expect(epicParentField).not.toBe(storyParentField); // Must be different!
    });

    it('caches parent fields separately per issue type', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('SuperEpic', [
          { key: 'customfield_10102', name: 'Parent Link', customPlugin: 'com.atlassian.jpo:jpo-custom-field-parent' },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      
      const result1 = await discovery.getParentFieldKey('PROJ', 'SuperEpic');
      
      // Clear mocks after first call
      cache.get.mockClear();
      cache.set.mockClear();
      schemaDiscovery.getFieldsForIssueType.mockClear();
      
      // Second call - should use cache
      cache.get.mockResolvedValue({ value: 'customfield_10102', isStale: false }); // Return cached value
      
      const result2 = await discovery.getParentFieldKey('PROJ', 'SuperEpic');

      expect(result1).toBe('customfield_10102');
      expect(result2).toBe('customfield_10102');
      
      // Verify cache key includes issue type
      expect(cache.get).toHaveBeenCalledWith('hierarchy:PROJ:SuperEpic:parent-field');
      
      // Second call should not set cache again (already cached)
      expect(cache.set).not.toHaveBeenCalled();
      
      // Second call should not hit schema discovery (used cache)
      expect(schemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
    });

    it('caches null results per issue type', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('SimpleTask', [
          { key: 'summary', name: 'Summary', schemaType: 'string', type: 'string' },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      
      const result1 = await discovery.getParentFieldKey('PROJ', 'SimpleTask');

      // Clear mocks after first call
      cache.get.mockClear();
      cache.set.mockClear();
      schemaDiscovery.getFieldsForIssueType.mockClear();
      
      // Second call - should use cached null
      cache.get.mockResolvedValue({ value: 'null', isStale: false }); // Return cached null sentinel
      
      const result2 = await discovery.getParentFieldKey('PROJ', 'SimpleTask');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      
      // Verify cache key includes issue type
      expect(cache.get).toHaveBeenCalledWith('hierarchy:PROJ:SimpleTask:parent-field');
      
      // Second call should not set cache again
      expect(cache.set).not.toHaveBeenCalled();
      
      // Second call should not hit schema discovery (used cache)
      expect(schemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
    });
  });

  it('cache TTL is 1 hour (3600 seconds)', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('Task', [
        { key: 'customfield_123', name: 'Parent' },
      ])
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    await discovery.getParentFieldKey('PROJ', 'Task');

    // Verify cache set with 3600 second TTL
    expect(cache.set).toHaveBeenCalledWith(
      'hierarchy:PROJ:Task:parent-field',
      'customfield_123',
      3600
    );
  });

  describe('plugin-based detection', () => {
    it('detects GreenHopper Epic Link by plugin ID', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('Story', [
          { key: 'customfield_epic', name: 'My Custom Epic Field', customPlugin: 'com.pyxis.greenhopper.jira:gh-epic-link' },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldKey('TEST', 'Story');

      expect(result).toBe('customfield_epic');
    });

    it('detects JPO Parent Link by plugin ID', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('Epic', [
          { key: 'customfield_parent', name: 'Custom Parent', customPlugin: 'com.atlassian.jpo:jpo-custom-field-parent' },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldKey('TEST', 'Epic');

      expect(result).toBe('customfield_parent');
    });

    it('prioritizes plugin match over name pattern match', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('Story', [
          { key: 'customfield_name', name: 'Parent' }, // Name pattern match
          { key: 'customfield_plugin', name: 'Some Random Name', customPlugin: 'com.pyxis.greenhopper.jira:gh-epic-link' }, // Plugin match
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldKey('TEST', 'Story');

      // Plugin match should win over name pattern match
      expect(result).toBe('customfield_plugin');
    });

    it('falls back to name pattern when no plugin match', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('Story', [
          { key: 'customfield_custom', name: 'Custom Parent Field' }, // Matches "parent" keyword
          { key: 'customfield_other', name: 'Other Field', customPlugin: 'com.example.unrelated:custom-field' },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldKey('TEST', 'Story');

      // Should fall back to name pattern match
      expect(result).toBe('customfield_custom');
    });
  });

  it('skips fields that do not match parent patterns', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('Story', [
        { key: 'customfield_unrelated', name: 'Sprint' }, // type: any but not parent-related
        { key: 'customfield_parent', name: 'Parent Link', customPlugin: 'com.atlassian.jpo:jpo-custom-field-parent' }, // Should match via plugin
      ])
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Story');

    // Should find parent field and skip unrelated field
    expect(result).toBe('customfield_parent');
  });

  it('uses field name as tie-breaker when priorities are equal', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });
    schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
      createSchema('Story', [
        { key: 'customfield_z', name: 'ZZZ Parent Field' }, // Partial match on 'parent'
        { key: 'customfield_a', name: 'AAA Parent Field' }, // Partial match on 'parent'
      ])
    );

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Story');

    // Should select 'customfield_a' due to alphabetical sorting
    expect(result).toBe('customfield_a');
  });

  it('returns "parent" for Sub-task issue types without querying schema', async () => {
    cache.get.mockResolvedValue({ value: null, isStale: false });

    const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
    const result = await discovery.getParentFieldKey('TEST', 'Sub-task');

    expect(result).toBe('parent');
    expect(logger.warn).toHaveBeenCalledWith(
      'Using standard JIRA parent field for Sub-task: Sub-task'
    );
    expect(schemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith(
      'hierarchy:TEST:Sub-task:parent-field',
      'parent',
      3600
    );
  });

  describe('getParentFieldInfo', () => {
    it('returns cached field info when available', async () => {
      cache.get.mockResolvedValue({ value: JSON.stringify({ key: 'customfield_123', name: 'Parent Link' }), isStale: false });

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldInfo('TEST', 'Story');

      expect(result).toEqual({ key: 'customfield_123', name: 'Parent Link' });
      expect(schemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('returns null when cached sentinel present', async () => {
      cache.get.mockResolvedValue({ value: 'null', isStale: false });

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldInfo('TEST', 'Story');

      expect(result).toBeNull();
      expect(schemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
    });

    it('discovers parent field info and caches result', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('Story', [
          {
            key: 'customfield_10014',
            name: 'Parent Link',
            customPlugin: 'com.atlassian.jpo:jpo-custom-field-parent',
          },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldInfo('TEST', 'Story');

      expect(result).toEqual({ key: 'customfield_10014', name: 'Parent Link', plugin: 'com.atlassian.jpo:jpo-custom-field-parent' });
      expect(cache.set).toHaveBeenCalledWith(
        'hierarchy:TEST:Story:parent-field-info',
        JSON.stringify({ key: 'customfield_10014', name: 'Parent Link', plugin: 'com.atlassian.jpo:jpo-custom-field-parent' }),
        3600
      );
    });

    it('returns parent info with key and name "parent" for Sub-task', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldInfo('TEST', 'Sub-task');

      // Sub-tasks use standard parent field, no plugin
      expect(result).toEqual({ key: 'parent', name: 'parent', plugin: undefined });
      expect(schemaDiscovery.getFieldsForIssueType).not.toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalledWith(
        'hierarchy:TEST:Sub-task:parent-field-info',
        JSON.stringify({ key: 'parent', name: 'parent' }),
        3600
      );
    });

    it('returns null when no parent field found', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('SimpleTask', [
          { key: 'summary', name: 'Summary', schemaType: 'string', type: 'string' },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldInfo('TEST', 'SimpleTask');

      expect(result).toBeNull();
      expect(cache.set).toHaveBeenCalledWith(
        'hierarchy:TEST:SimpleTask:parent-field-info',
        'null',
        3600
      );
    });

    it('recovers from invalid cached JSON', async () => {
      cache.get.mockResolvedValue({ value: 'invalid json', isStale: false });
      schemaDiscovery.getFieldsForIssueType.mockResolvedValue(
        createSchema('Story', [
          {
            key: 'customfield_10014',
            name: 'Epic Link',
            customPlugin: 'com.pyxis.greenhopper.jira:gh-epic-link',
          },
        ])
      );

      const discovery = new ParentFieldDiscovery(schemaDiscovery, cache, logger);
      const result = await discovery.getParentFieldInfo('TEST', 'Story');

      expect(result).toEqual({ key: 'customfield_10014', name: 'Epic Link', plugin: 'com.pyxis.greenhopper.jira:gh-epic-link' });
    });
  });
});

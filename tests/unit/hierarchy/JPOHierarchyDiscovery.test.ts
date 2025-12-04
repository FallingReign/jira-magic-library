import { JPOHierarchyDiscovery, getParentLevel, isValidParent, HIERARCHY_CACHE_KEY } from '../../../src/hierarchy/JPOHierarchyDiscovery.js';
import { HierarchyLevel, HierarchyStructure } from '../../../src/types/hierarchy.js';
import { NotFoundError } from '../../../src/errors/NotFoundError.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';
import type { CacheClient } from '../../../src/types/cache.js';
import { SchemaError } from '../../../src/errors.js';

describe('JPOHierarchyDiscovery', () => {
  let client: jest.Mocked<JiraClient>;
  let cache: jest.Mocked<CacheClient>;
  let discovery: JPOHierarchyDiscovery;
  let warnSpy: jest.SpyInstance;
  const hierarchySample = [
    { id: 2, title: 'Epic', issueTypeIds: ['13301'] },
    { id: 0, title: 'Sub-task', issueTypeIds: ['16101'] },
    { id: 1, title: 'Story', issueTypeIds: ['10001'] },
  ];

  beforeEach(() => {
    client = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<JiraClient>;

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      clear: jest.fn(),
      ping: jest.fn(),
    } as unknown as jest.Mocked<CacheClient>;

    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    discovery = new JPOHierarchyDiscovery(client, cache);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('getHierarchy', () => {
    it('returns cached hierarchy when available', async () => {
      cache.get.mockResolvedValue({ value: JSON.stringify(hierarchySample), isStale: false });

      const result = await discovery.getHierarchy();

      expect(result).toEqual([
        { id: 0, title: 'Sub-task', issueTypeIds: ['16101'] },
        { id: 1, title: 'Story', issueTypeIds: ['10001'] },
        { id: 2, title: 'Epic', issueTypeIds: ['13301'] },
      ]);
      expect(client.get).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('fetches from API on cache miss and caches sorted data', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      client.get.mockResolvedValue(hierarchySample);

      const result = await discovery.getHierarchy();

      expect(client.get).toHaveBeenCalledWith('/rest/jpo-api/1.0/hierarchy');
      expect(result).toEqual([
        { id: 0, title: 'Sub-task', issueTypeIds: ['16101'] },
        { id: 1, title: 'Story', issueTypeIds: ['10001'] },
        { id: 2, title: 'Epic', issueTypeIds: ['13301'] },
      ]);
      expect(cache.set).toHaveBeenCalledWith(
        HIERARCHY_CACHE_KEY,
        JSON.stringify(result),
        3600
      );
    });

    it('forces refresh when requested even if cached', async () => {
      cache.get.mockResolvedValue({ value: JSON.stringify([
        { id: 0, title: 'Sub-task', issueTypeIds: ['16101'] },
      ]), isStale: false });
      client.get.mockResolvedValue(hierarchySample);

      const result = await discovery.getHierarchy({ refresh: true });

      expect(client.get).toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(cache.set).toHaveBeenCalledWith(
        HIERARCHY_CACHE_KEY,
        JSON.stringify(result),
        3600
      );
    });

    it('stores null in cache when API returns 404 (JPO unavailable)', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      client.get.mockRejectedValue(new NotFoundError('Not found'));

      const result = await discovery.getHierarchy();

      expect(result).toBeNull();
      expect(cache.set).toHaveBeenCalledWith(HIERARCHY_CACHE_KEY, 'null', 3600);
      expect(console.warn).toHaveBeenCalled();
    });

    it('treats cached "null" as no hierarchy', async () => {
      cache.get.mockResolvedValue({ value: 'null', isStale: false });

      const result = await discovery.getHierarchy();

      expect(result).toBeNull();
      expect(client.get).not.toHaveBeenCalled();
    });

    it('invalid data from API throws SchemaError', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      client.get.mockResolvedValue([{ title: 'Missing id', issueTypeIds: [] }]);

      await expect(discovery.getHierarchy()).rejects.toBeInstanceOf(SchemaError);
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('warns but succeeds when issueTypeIds array empty', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      client.get.mockResolvedValue([
        { id: 0, title: 'Sub-task', issueTypeIds: [] },
      ]);

      const result = await discovery.getHierarchy();

      expect(result).toEqual([{ id: 0, title: 'Sub-task', issueTypeIds: [] }]);
      expect(console.warn).toHaveBeenCalledWith(
        'JPO hierarchy level 0 (Sub-task) has no issue type ids.'
      );
    });

    it('updates cache when API returns different data', async () => {
      const cached = [
        { id: 0, title: 'Sub-task', issueTypeIds: ['16101'] },
        { id: 1, title: 'Story', issueTypeIds: ['10001'] },
      ];

      cache.get.mockResolvedValueOnce({ value: JSON.stringify(cached), isStale: false });
      cache.get.mockResolvedValueOnce({ value: JSON.stringify(cached), isStale: false });
      client.get.mockResolvedValueOnce(hierarchySample);

      const result = await discovery.getHierarchy({ refresh: true });

      expect(result).toHaveLength(3);
      expect(cache.set).toHaveBeenCalledWith(
        HIERARCHY_CACHE_KEY,
        JSON.stringify(result),
        3600
      );
    });

    it('warns when cache read fails', async () => {
      cache.get.mockRejectedValue(new Error('Redis connection failed'));
      client.get.mockResolvedValue(hierarchySample);

      const result = await discovery.getHierarchy();

      expect(result).toHaveLength(3);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to read JPO hierarchy from cache',
        expect.any(Error)
      );
    });

    it('warns when cached data is malformed JSON', async () => {
      cache.get.mockResolvedValue({ value: '{invalid json', isStale: false });
      client.get.mockResolvedValue(hierarchySample);

      const result = await discovery.getHierarchy();

      expect(result).toHaveLength(3);
      expect(console.warn).toHaveBeenCalledWith(
        'Cached JPO hierarchy data is malformed. Refetching from API.',
        expect.any(Error)
      );
    });

    it('warns when cache write fails', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      cache.set.mockRejectedValue(new Error('Redis write failed'));
      client.get.mockResolvedValue(hierarchySample);

      const result = await discovery.getHierarchy();

      expect(result).toHaveLength(3);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to cache JPO hierarchy data',
        expect.any(Error)
      );
    });

    it('throws SchemaError when API returns non-array', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      client.get.mockResolvedValue({ invalid: 'not an array' });

      await expect(discovery.getHierarchy()).rejects.toThrow(SchemaError);
      await expect(discovery.getHierarchy()).rejects.toThrow('JPO hierarchy response must be an array');
    });

    it('throws SchemaError when level is not an object', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      client.get.mockResolvedValue(['string instead of object']);

      await expect(discovery.getHierarchy()).rejects.toThrow(SchemaError);
      await expect(discovery.getHierarchy()).rejects.toThrow('JPO hierarchy levels must be objects');
    });

    it('throws SchemaError when level has empty title', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      client.get.mockResolvedValue([
        { id: 0, title: '   ', issueTypeIds: ['10001'] }
      ]);

      await expect(discovery.getHierarchy()).rejects.toThrow(SchemaError);
      await expect(discovery.getHierarchy()).rejects.toThrow('must include a title');
    });

    it('throws SchemaError when issueTypeIds is missing', async () => {
      cache.get.mockResolvedValue({ value: null, isStale: false });
      client.get.mockResolvedValue([
        { id: 0, title: 'Story' }
      ]);

      await expect(discovery.getHierarchy()).rejects.toThrow(SchemaError);
      await expect(discovery.getHierarchy()).rejects.toThrow('must include an issueTypeIds array');
    });
  });

  describe('getParentLevel', () => {
    const hierarchy: HierarchyLevel[] = [
      { id: 0, title: 'Sub-task', issueTypeIds: ['sub'] },
      { id: 1, title: 'Story', issueTypeIds: ['story'] },
      { id: 2, title: 'Epic', issueTypeIds: ['epic'] },
    ];

    it('returns the parent level one step above', () => {
      const parent = getParentLevel('story', hierarchy);
      expect(parent).toEqual({ id: 2, title: 'Epic', issueTypeIds: ['epic'] });
    });

    it('returns null for top-level issue type', () => {
      const parent = getParentLevel('epic', hierarchy);
      expect(parent).toBeNull();
    });

    it('returns null when hierarchy is null', () => {
      const parent = getParentLevel('story', null);
      expect(parent).toBeNull();
    });

    it('returns null when issue type not found', () => {
      const parent = getParentLevel('unknown', hierarchy);
      expect(parent).toBeNull();
    });
  });

  describe('isValidParent', () => {
    const hierarchy: HierarchyStructure = [
      { id: 0, title: 'Sub-task', issueTypeIds: ['sub'] },
      { id: 1, title: 'Story', issueTypeIds: ['story'] },
      { id: 2, title: 'Epic', issueTypeIds: ['epic'] },
    ];

    it('returns true when parent is exactly one level above', () => {
      expect(isValidParent('story', 'epic', hierarchy)).toBe(true);
    });

    it('returns false when parent is same level', () => {
      expect(isValidParent('story', 'story', hierarchy)).toBe(false);
    });

    it('returns false when parent is lower level', () => {
      expect(isValidParent('story', 'sub', hierarchy)).toBe(false);
    });

    it('returns false when parent level not found', () => {
      expect(isValidParent('unknown', 'epic', hierarchy)).toBe(false);
    });

    it('returns false when hierarchy is null', () => {
      expect(isValidParent('story', 'epic', null)).toBe(false);
    });
  });
});

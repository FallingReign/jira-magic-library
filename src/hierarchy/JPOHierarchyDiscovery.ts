import type { JiraClient } from '../client/JiraClient.js';
import type { CacheClient } from '../types/cache.js';
import type { HierarchyLevel, HierarchyStructure } from '../types/hierarchy.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { SchemaError } from '../errors/index.js';

export const HIERARCHY_CACHE_KEY = 'hierarchy:jpo-structure';
const CACHE_TTL_SECONDS = 3600;

interface HierarchyLogger {
  warn: (message: string, error?: unknown) => void;
}

const defaultLogger: HierarchyLogger = {
  warn: (message: string, error?: unknown) => {
    if (error) {
      console.warn(message, error);
      return;
    }
    console.warn(message);
  },
};

interface GetHierarchyOptions {
  refresh?: boolean;
}

export class JPOHierarchyDiscovery {
  constructor(
    private readonly client: JiraClient,
    private readonly cache: CacheClient,
    private readonly logger: HierarchyLogger = defaultLogger
  ) {}

  async getHierarchy(options: GetHierarchyOptions = {}): Promise<HierarchyStructure> {
    const { refresh = false } = options;
    let cachedValue: string | null = null;

    try {
      cachedValue = await this.cache.get(HIERARCHY_CACHE_KEY);
    } catch (error) {
      this.logger.warn('Failed to read JPO hierarchy from cache', error);
    }

    if (!refresh && cachedValue) {
      if (cachedValue === 'null') {
        return null;
      }

      try {
        const parsed = JSON.parse(cachedValue) as unknown;
        return this.normalizeHierarchy(parsed);
      } catch (error) {
        this.logger.warn('Cached JPO hierarchy data is malformed. Refetching from API.', error);
      }
    }

    try {
      const response = await this.client.get<unknown>('/rest/jpo-api/1.0/hierarchy');
      const normalized = this.normalizeHierarchy(response);
      const serialized = JSON.stringify(normalized);

      if (cachedValue !== serialized) {
        await this.writeCache(serialized);
      }

      return normalized;
    } catch (error) {
      if (error instanceof NotFoundError) {
        await this.writeCache('null');
        this.logger.warn('JPO hierarchy endpoint returned 404. Caching null hierarchy.');
        return null;
      }

      throw error;
    }
  }

  private async writeCache(value: string): Promise<void> {
    try {
      await this.cache.set(HIERARCHY_CACHE_KEY, value, CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn('Failed to cache JPO hierarchy data', error);
    }
  }

  private normalizeHierarchy(raw: unknown): HierarchyLevel[] {
    if (!Array.isArray(raw)) {
      throw new SchemaError('JPO hierarchy response must be an array.', 'SCHEMA_ERROR');
    }

    const normalized: HierarchyLevel[] = raw.map((level) => this.normalizeLevel(level));
    return normalized.sort((a, b) => a.id - b.id);
  }

  private normalizeLevel(level: unknown): HierarchyLevel {
    if (!level || typeof level !== 'object') {
      throw new SchemaError('JPO hierarchy levels must be objects.', 'SCHEMA_ERROR');
    }

    const { id, title, issueTypeIds } = level as {
      id?: unknown;
      title?: unknown;
      issueTypeIds?: unknown;
    };

    if (typeof id !== 'number' || !Number.isInteger(id) || id < 0) {
      throw new SchemaError('JPO hierarchy level id must be a non-negative integer.', 'SCHEMA_ERROR');
    }

    if (typeof title !== 'string' || title.trim() === '') {
      throw new SchemaError(`JPO hierarchy level ${id} must include a title.`, 'SCHEMA_ERROR');
    }

    if (!Array.isArray(issueTypeIds)) {
      throw new SchemaError(`JPO hierarchy level ${id} must include an issueTypeIds array.`, 'SCHEMA_ERROR');
    }

    const normalizedIssueTypeIds = issueTypeIds
      .map((value) => String(value))
      .sort((a, b) => a.localeCompare(b));

    if (normalizedIssueTypeIds.length === 0) {
      this.logger.warn(`JPO hierarchy level ${id} (${title}) has no issue type ids.`);
    }

    return {
      id,
      title,
      issueTypeIds: normalizedIssueTypeIds,
    };
  }
}

export function getParentLevel(
  issueTypeId: string,
  hierarchy: HierarchyStructure
): HierarchyLevel | null {
  if (!hierarchy || hierarchy.length === 0) {
    return null;
  }

  const childLevel = hierarchy.find((level) => level.issueTypeIds.includes(issueTypeId));
  if (!childLevel) {
    return null;
  }

  const parentLevelId = childLevel.id + 1;
  return hierarchy.find((level) => level.id === parentLevelId) ?? null;
}

export function isValidParent(
  childTypeId: string,
  parentTypeId: string,
  hierarchy: HierarchyStructure
): boolean {
  const parentLevel = getParentLevel(childTypeId, hierarchy);
  if (!parentLevel) {
    return false;
  }

  return parentLevel.issueTypeIds.includes(parentTypeId);
}

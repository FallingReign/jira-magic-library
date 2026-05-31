/**
 * Entity Resolver
 *
 * Resolves priority, status, component, and version text to IDs.
 * Uses fuzzy matching with Fuse.js for confidence scoring.
 */

import Fuse from 'fuse.js';
import type { JiraClient } from '../client/JiraClient.js';
import type { CacheAdapter } from '../cache/CacheAdapter.js';
import type { EndpointResolver } from '../client/EndpointResolver.js';
import type { DeploymentType } from '../types/config.js';
import { ValidationError } from '../errors/ValidationError.js';
import type { ResolvedEntity } from './types.js';

/** Raw priority from JIRA */
interface JiraPriority {
  id: string;
  name: string;
}

/** Raw status from JIRA project statuses response */
interface JiraStatusCategory {
  id: number;
  key: string;
  name: string;
}

interface JiraStatus {
  id: string;
  name: string;
  statusCategory?: JiraStatusCategory;
}

interface JiraProjectStatusesResponse {
  id: string;
  name: string;
  statuses: JiraStatus[];
}

/** Raw component from JIRA */
interface JiraComponent {
  id: string;
  name: string;
}

/** Raw version from JIRA */
interface JiraVersion {
  id: string;
  name: string;
  released: boolean;
}

const PRIORITY_CACHE_TTL = 1800; // 30 minutes
const ENTITY_CACHE_TTL = 900; // 15 minutes

/**
 * Resolves entity text (priority, status, component, version) to IDs.
 */
export class EntityResolver {
  constructor(
    private readonly client: JiraClient,
    private readonly cache: CacheAdapter,
    private readonly endpointResolver: EndpointResolver,
    _deployment: DeploymentType
  ) {}

  /**
   * Resolve priority name to ID.
   */
  async resolvePriority(query: string): Promise<ResolvedEntity> {
    const priorities = await this.getPriorities();
    return this.matchEntity(priorities, query, 'priority');
  }

  /**
   * Resolve status name for a project (optionally filtered by issue type).
   */
  async resolveStatus(query: string, projectKey: string, issueType?: string): Promise<ResolvedEntity> {
    const statuses = await this.getStatuses(projectKey, issueType);
    return this.matchEntity(
      statuses.map((s) => ({ id: s.id, name: s.name })),
      query,
      'status'
    );
  }

  /**
   * Resolve component name for a project.
   */
  async resolveComponent(query: string, projectKey: string): Promise<ResolvedEntity> {
    const components = await this.getComponents(projectKey);
    return this.matchEntity(
      components.map((c) => ({ id: c.id, name: c.name })),
      query,
      'component'
    );
  }

  /**
   * Resolve version/fixVersion name for a project.
   */
  async resolveVersion(query: string, projectKey: string): Promise<ResolvedEntity> {
    const versions = await this.getVersions(projectKey);
    return this.matchEntity(
      versions.map((v) => ({ id: v.id, name: v.name })),
      query,
      'version'
    );
  }

  /**
   * Get all priorities.
   */
  async getPriorities(): Promise<Array<{ id: string; name: string }>> {
    const cacheKey = 'entity:priorities';

    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as Array<{ id: string; name: string }>;
    }

    const endpoint = `${this.endpointResolver.apiBase}/priority`;
    const response = await this.client.get<JiraPriority[]>(endpoint);
    const priorities = (Array.isArray(response) ? response : []).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    await this.cache.set(cacheKey, JSON.stringify(priorities), PRIORITY_CACHE_TTL);

    return priorities;
  }

  /**
   * Get statuses for project, optionally filtered by issue type.
   */
  async getStatuses(projectKey: string, issueType?: string): Promise<Array<{ id: string; name: string; category: string }>> {
    const cacheKey = `entity:statuses:${projectKey}`;

    const cached = await this.cache.get(cacheKey);
    let allStatuses: Array<{ id: string; name: string; category: string; issueTypeName: string }>;

    if (cached.value) {
      allStatuses = JSON.parse(cached.value) as Array<{ id: string; name: string; category: string; issueTypeName: string }>;
    } else {
      const endpoint = `${this.endpointResolver.apiBase}/project/${projectKey}/statuses`;
      const response = await this.client.get<JiraProjectStatusesResponse[]>(endpoint);
      const statusTypes = Array.isArray(response) ? response : [];

      allStatuses = [];
      for (const statusType of statusTypes) {
        for (const status of statusType.statuses) {
          allStatuses.push({
            id: status.id,
            name: status.name,
            category: status.statusCategory?.name ?? 'unknown',
            issueTypeName: statusType.name,
          });
        }
      }

      await this.cache.set(cacheKey, JSON.stringify(allStatuses), ENTITY_CACHE_TTL);
    }

    // Filter by issue type if provided
    let filtered = allStatuses;
    if (issueType) {
      const typeFiltered = allStatuses.filter(
        (s) => s.issueTypeName.toLowerCase() === issueType.toLowerCase()
      );
      if (typeFiltered.length > 0) {
        filtered = typeFiltered;
      }
    }

    // Deduplicate by id
    const seen = new Set<string>();
    const unique: Array<{ id: string; name: string; category: string }> = [];
    for (const s of filtered) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        unique.push({ id: s.id, name: s.name, category: s.category });
      }
    }

    return unique;
  }

  /**
   * Get components for a project.
   */
  async getComponents(projectKey: string): Promise<Array<{ id: string; name: string }>> {
    const cacheKey = `entity:components:${projectKey}`;

    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as Array<{ id: string; name: string }>;
    }

    const endpoint = `${this.endpointResolver.apiBase}/project/${projectKey}/components`;
    const response = await this.client.get<JiraComponent[]>(endpoint);
    const components = (Array.isArray(response) ? response : []).map((c) => ({
      id: c.id,
      name: c.name,
    }));

    await this.cache.set(cacheKey, JSON.stringify(components), ENTITY_CACHE_TTL);

    return components;
  }

  /**
   * Get versions for a project.
   */
  async getVersions(projectKey: string): Promise<Array<{ id: string; name: string; released: boolean }>> {
    const cacheKey = `entity:versions:${projectKey}`;

    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as Array<{ id: string; name: string; released: boolean }>;
    }

    const endpoint = `${this.endpointResolver.apiBase}/project/${projectKey}/versions`;
    const response = await this.client.get<JiraVersion[]>(endpoint);
    const versions = (Array.isArray(response) ? response : []).map((v) => ({
      id: v.id,
      name: v.name,
      released: v.released,
    }));

    await this.cache.set(cacheKey, JSON.stringify(versions), ENTITY_CACHE_TTL);

    return versions;
  }

  /**
   * Match a query against entities using exact + fuzzy matching.
   */
  private matchEntity(
    entities: Array<{ id: string; name: string }>,
    query: string,
    type: ResolvedEntity['type']
  ): ResolvedEntity {
    if (entities.length === 0) {
      throw new ValidationError(
        `No ${type} values available to resolve "${query}".`,
        { field: type, value: query, suggestions: [] }
      );
    }

    // Exact match
    const exactMatch = entities.find(
      (e) => e.name.toLowerCase() === query.toLowerCase()
    );
    if (exactMatch) {
      return { id: exactMatch.id, name: exactMatch.name, type, confidence: 1.0 };
    }

    // Fuzzy match
    const fuse = new Fuse(entities, {
      keys: ['name'],
      includeScore: true,
      threshold: 0.4,
    });

    const results = fuse.search(query);

    if (results.length === 0) {
      const suggestions = entities.slice(0, 3).map((e) => e.name);
      throw new ValidationError(
        `Could not resolve ${type} "${query}". Did you mean: ${suggestions.join(', ')}?`,
        { field: type, value: query, suggestions }
      );
    }

    const best = results[0]!;
    const confidence = Math.max(0, 1 - (best.score ?? 1));

    return { id: best.item.id, name: best.item.name, type, confidence };
  }
}

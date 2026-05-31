/**
 * Project Discovery
 *
 * Discovers and searches Jira projects with Cloud/Server awareness.
 * Cloud uses paginated /project/search, Server uses /project (all at once).
 */

import Fuse from 'fuse.js';
import type { JiraClient } from '../client/JiraClient.js';
import type { CacheAdapter } from '../cache/CacheAdapter.js';
import type { EndpointResolver } from '../client/EndpointResolver.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import type { ProjectInfo, ProjectListOptions } from './types.js';

/** Raw project shape from JIRA REST API */
interface JiraProjectResponse {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  style?: string;
  lead?: {
    displayName?: string;
    accountId?: string;
    name?: string;
  };
  avatarUrls?: Record<string, string>;
}

/** Cloud paginated response wrapper */
interface CloudProjectSearchResponse {
  values: JiraProjectResponse[];
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
}

const PROJECT_CACHE_TTL = 300; // 5 minutes

/**
 * Discovers and searches JIRA projects.
 *
 * Uses deployment-appropriate endpoints:
 * - Cloud: GET /rest/api/3/project/search (paginated, query param)
 * - Server: GET /rest/api/2/project (returns all, client-side filter)
 */
export class ProjectDiscovery {
  constructor(
    private readonly client: JiraClient,
    private readonly cache: CacheAdapter,
    private readonly resolverFn: () => Promise<EndpointResolver>
  ) {}

  /**
   * List all accessible projects with optional filtering.
   */
  async list(options?: ProjectListOptions): Promise<ProjectInfo[]> {
    const resolver = await this.resolverFn();
    const maxResults = options?.maxResults ?? 50;
    const startAt = options?.startAt ?? 0;

    if (resolver.isCloud) {
      return this.listCloud(resolver, options, maxResults, startAt);
    }
    return this.listServer(resolver, options, maxResults, startAt);
  }

  /**
   * Search projects by name/key with fuzzy matching.
   */
  async search(query: string): Promise<ProjectInfo[]> {
    const resolver = await this.resolverFn();

    if (resolver.isCloud) {
      // Cloud supports server-side query
      return this.listCloud(resolver, { query }, 50, 0);
    }

    // Server: fetch all and filter client-side with Fuse.js
    const all = await this.fetchAllServerProjects(resolver);
    return this.fuzzyFilter(all, query);
  }

  /**
   * Get a single project by key.
   */
  async get(projectKey: string): Promise<ProjectInfo> {
    const resolver = await this.resolverFn();
    const cacheKey = `jml:discovery:project:${projectKey}`;

    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as ProjectInfo;
    }

    const endpoint = resolver.projectGet(projectKey);
    const raw = await this.client.get<JiraProjectResponse>(endpoint);

    if (!raw || !raw.key) {
      throw new NotFoundError(`Project '${projectKey}' not found`, { projectKey });
    }

    const project = this.mapProject(raw);
    await this.cache.set(cacheKey, JSON.stringify(project), PROJECT_CACHE_TTL);
    return project;
  }

  // ─── Private ──────────────────────────────────────────────────────

  private async listCloud(
    resolver: EndpointResolver,
    options: ProjectListOptions | undefined,
    maxResults: number,
    startAt: number
  ): Promise<ProjectInfo[]> {
    const endpoint = resolver.projectList();
    const params: Record<string, unknown> = {
      maxResults,
      startAt,
    };
    if (options?.query) params['query'] = options.query;
    if (options?.type) params['typeKey'] = options.type;

    const response = await this.client.get<CloudProjectSearchResponse>(endpoint, params);
    const values = response?.values ?? [];
    let projects = values.map((p) => this.mapProject(p));

    // Apply type filter if Cloud didn't already (double-check)
    if (options?.type) {
      projects = projects.filter((p) => p.projectTypeKey === options.type);
    }

    return projects;
  }

  private async listServer(
    resolver: EndpointResolver,
    options: ProjectListOptions | undefined,
    maxResults: number,
    startAt: number
  ): Promise<ProjectInfo[]> {
    const all = await this.fetchAllServerProjects(resolver);

    let filtered = all;

    // Apply type filter
    if (options?.type) {
      filtered = filtered.filter((p) => p.projectTypeKey === options.type);
    }

    // Apply query filter via fuzzy search
    if (options?.query) {
      filtered = this.fuzzyFilter(filtered, options.query);
    }

    // Apply pagination
    return filtered.slice(startAt, startAt + maxResults);
  }

  private async fetchAllServerProjects(resolver: EndpointResolver): Promise<ProjectInfo[]> {
    const cacheKey = 'jml:discovery:projects:all';
    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as ProjectInfo[];
    }

    const endpoint = resolver.projectList();
    const raw = await this.client.get<JiraProjectResponse[]>(endpoint);
    const projects = (raw ?? []).map((p) => this.mapProject(p));

    await this.cache.set(cacheKey, JSON.stringify(projects), PROJECT_CACHE_TTL);
    return projects;
  }

  private fuzzyFilter(projects: ProjectInfo[], query: string): ProjectInfo[] {
    const fuse = new Fuse(projects, {
      keys: ['key', 'name'],
      threshold: 0.4,
      includeScore: true,
    });
    return fuse.search(query).map((r) => r.item);
  }

  private mapProject(raw: JiraProjectResponse): ProjectInfo {
    return {
      id: raw.id,
      key: raw.key,
      name: raw.name,
      projectTypeKey: raw.projectTypeKey ?? 'software',
      style: raw.style,
      lead: raw.lead
        ? {
            displayName: raw.lead.displayName ?? '',
            accountId: raw.lead.accountId,
            name: raw.lead.name,
          }
        : undefined,
      avatarUrl: raw.avatarUrls?.['48x48'] ?? raw.avatarUrls?.['32x32'],
    };
  }
}

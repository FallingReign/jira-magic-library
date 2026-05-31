/**
 * Issue Type Discovery
 *
 * Discovers issue types for a project with Cloud/Server awareness.
 * Provides fuzzy resolution (e.g., "bug" → "Bug").
 */

import Fuse from 'fuse.js';
import type { JiraClient } from '../client/JiraClient.js';
import type { CacheAdapter } from '../cache/CacheAdapter.js';
import type { EndpointResolver } from '../client/EndpointResolver.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import type { IssueTypeInfo, IssueTypeSearchOptions } from './types.js';

/** Raw issue type from createmeta response */
interface JiraIssueTypeResponse {
  id: string;
  name: string;
  description?: string;
  subtask?: boolean;
  hierarchyLevel?: number;
  scope?: {
    type: string;
    project?: { id: string };
  };
  iconUrl?: string;
}

/** Paginated createmeta issuetypes response */
interface CreateMetaIssueTypesResponse {
  values?: JiraIssueTypeResponse[];
  maxResults?: number;
  startAt?: number;
  total?: number;
}

const ISSUE_TYPE_CACHE_TTL = 900; // 15 minutes

/**
 * Discovers issue types for a project with Cloud-aware features.
 *
 * Uses the createmeta endpoint which works on both Cloud and Server.
 * Provides fuzzy resolution to match user input to correct issue type names.
 */
export class IssueTypeDiscovery {
  constructor(
    private readonly client: JiraClient,
    private readonly cache: CacheAdapter,
    private readonly resolverFn: () => Promise<EndpointResolver>
  ) {}

  /**
   * Get all issue types available for a project.
   */
  async getForProject(
    projectKey: string,
    options?: IssueTypeSearchOptions
  ): Promise<IssueTypeInfo[]> {
    const resolver = await this.resolverFn();
    const cacheKey = `jml:discovery:issuetypes:${projectKey}`;

    const cached = await this.cache.get(cacheKey);
    let issueTypes: IssueTypeInfo[];

    if (cached.value) {
      issueTypes = JSON.parse(cached.value) as IssueTypeInfo[];
    } else {
      issueTypes = await this.fetchIssueTypes(resolver, projectKey);
      await this.cache.set(cacheKey, JSON.stringify(issueTypes), ISSUE_TYPE_CACHE_TTL);
    }

    // Apply filters
    const includeSubtasks = options?.includeSubtasks ?? true;
    if (!includeSubtasks) {
      issueTypes = issueTypes.filter((t) => !t.subtask);
    }

    if (options?.query) {
      issueTypes = this.fuzzyFilter(issueTypes, options.query);
    }

    return issueTypes;
  }

  /**
   * Resolve fuzzy text to a single issue type.
   * E.g., "bug" → Bug, "story" → Story.
   *
   * @throws NotFoundError if no match found
   */
  async resolve(projectKey: string, query: string): Promise<IssueTypeInfo> {
    const all = await this.getForProject(projectKey);

    // Try exact case-insensitive match first
    const exact = all.find((t) => t.name.toLowerCase() === query.toLowerCase());
    if (exact) return exact;

    // Fuzzy match
    const fuse = new Fuse(all, {
      keys: ['name'],
      threshold: 0.3,
      includeScore: true,
    });
    const results = fuse.search(query);
    const topResult = results[0];

    if (!topResult) {
      const available = all.map((t) => t.name);
      throw new NotFoundError(
        `Issue type '${query}' not found in project '${projectKey}'. Available: ${available.join(', ')}`,
        { projectKey, query, available }
      );
    }

    return topResult.item;
  }

  // ─── Private ──────────────────────────────────────────────────────

  private async fetchIssueTypes(
    resolver: EndpointResolver,
    projectKey: string
  ): Promise<IssueTypeInfo[]> {
    // Use createmeta issuetypes endpoint (works on both Cloud and Server)
    const endpoint = `${resolver.apiBase}/issue/createmeta/${projectKey}/issuetypes`;
    const response = await this.client.get<CreateMetaIssueTypesResponse>(endpoint);

    const values = response?.values;
    if (!values || values.length === 0) {
      throw new NotFoundError(
        `No issue types found for project '${projectKey}'`,
        { projectKey }
      );
    }

    return values.map((raw) => this.mapIssueType(raw));
  }

  private mapIssueType(raw: JiraIssueTypeResponse): IssueTypeInfo {
    const info: IssueTypeInfo = {
      id: String(raw.id),
      name: raw.name,
      description: raw.description,
      subtask: raw.subtask ?? false,
      hierarchyLevel: raw.hierarchyLevel,
      iconUrl: raw.iconUrl,
    };

    // Cloud team-managed detection via scope field
    if (raw.scope) {
      info.scope = {
        type: raw.scope.type as 'PROJECT' | 'GLOBAL',
        projectId: raw.scope.project?.id,
      };
    }

    return info;
  }

  private fuzzyFilter(issueTypes: IssueTypeInfo[], query: string): IssueTypeInfo[] {
    const fuse = new Fuse(issueTypes, {
      keys: ['name'],
      threshold: 0.4,
      includeScore: true,
    });
    return fuse.search(query).map((r) => r.item);
  }
}

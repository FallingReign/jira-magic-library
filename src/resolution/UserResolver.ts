/**
 * User Resolver
 *
 * Resolves user text (email, display name) to Cloud accountId or Server username.
 * Uses fuzzy matching with Fuse.js for confidence scoring.
 */

import Fuse from 'fuse.js';
import type { JiraClient } from '../client/JiraClient.js';
import type { CacheAdapter } from '../cache/CacheAdapter.js';
import type { EndpointResolver } from '../client/EndpointResolver.js';
import type { DeploymentType } from '../types/config.js';
import { ValidationError } from '../errors/ValidationError.js';
import type { ResolvedUser, UserResolveOptions } from './types.js';

/** Raw user response from JIRA API */
interface JiraUserResponse {
  accountId?: string;
  name?: string;
  displayName: string;
  emailAddress?: string;
  active: boolean;
}

const USER_CACHE_TTL = 300; // 5 minutes

/**
 * Resolves user text to JIRA user identities.
 *
 * Cloud: GET /rest/api/3/user/search?query={text} → accountId
 * Server: GET /rest/api/2/user/search?username={text} → name
 */
export class UserResolver {
  constructor(
    private readonly client: JiraClient,
    private readonly cache: CacheAdapter,
    private readonly endpointResolver: EndpointResolver,
    private readonly deployment: DeploymentType
  ) {}

  /**
   * Resolve user text to a single best-match JIRA user identity.
   * Throws ValidationError if no match found.
   */
  async resolve(query: string, options?: UserResolveOptions): Promise<ResolvedUser> {
    const results = await this.search(query, options);

    if (results.length === 0) {
      throw new ValidationError(
        `Could not resolve user "${query}". No matching users found.`,
        { field: 'user', value: query, suggestions: [] }
      );
    }

    return results[0]!;
  }

  /**
   * Search for users (returns multiple candidates sorted by confidence).
   */
  async search(query: string, options?: UserResolveOptions): Promise<ResolvedUser[]> {
    const maxResults = options?.maxResults ?? 10;
    const activeOnly = options?.activeOnly ?? true;

    const rawUsers = await this.fetchUsers(query, maxResults);

    // Filter inactive if requested
    const filtered = activeOnly
      ? rawUsers.filter((u) => u.active)
      : rawUsers;

    // Score and sort results
    const scored = this.scoreUsers(filtered, query);

    return scored;
  }

  /**
   * Resolve for issue payload — returns the correct identity field.
   * Cloud: { accountId: string }
   * Server: { name: string }
   */
  async resolveForPayload(query: string): Promise<{ accountId: string } | { name: string }> {
    const user = await this.resolve(query);

    if (this.deployment === 'cloud') {
      if (!user.accountId) {
        throw new ValidationError(
          `Resolved user "${query}" has no accountId (required for Cloud).`,
          { field: 'user', value: query }
        );
      }
      return { accountId: user.accountId };
    }

    if (!user.name) {
      throw new ValidationError(
        `Resolved user "${query}" has no name/username (required for Server).`,
        { field: 'user', value: query }
      );
    }
    return { name: user.name };
  }

  /**
   * Fetch users from JIRA API with caching.
   */
  private async fetchUsers(query: string, maxResults: number): Promise<JiraUserResponse[]> {
    const cacheKey = `user:search:${this.deployment}:${query.toLowerCase()}:${maxResults}`;

    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as JiraUserResponse[];
    }

    const endpoint = this.endpointResolver.userSearch();
    const paramName = this.endpointResolver.userSearchParam;

    const results = await this.client.get<JiraUserResponse[]>(endpoint, {
      [paramName]: query,
      maxResults,
    });

    const users = Array.isArray(results) ? results : [];

    await this.cache.set(cacheKey, JSON.stringify(users), USER_CACHE_TTL);

    return users;
  }

  /**
   * Score users against the query using fuzzy matching.
   */
  private scoreUsers(users: JiraUserResponse[], query: string): ResolvedUser[] {
    if (users.length === 0) return [];

    const queryLower = query.toLowerCase().trim();
    const isEmail = queryLower.includes('@');

    // First pass: check for exact matches
    const results: ResolvedUser[] = [];

    for (const user of users) {
      let confidence = 0;

      // Exact email match → confidence 1.0
      if (isEmail && user.emailAddress?.toLowerCase() === queryLower) {
        confidence = 1.0;
      }
      // Exact display name match → confidence 0.95
      else if (user.displayName.toLowerCase() === queryLower) {
        confidence = 0.95;
      }
      // Exact username match (Server) → confidence 0.95
      else if (user.name?.toLowerCase() === queryLower) {
        confidence = 0.95;
      } else {
        // Will be scored by Fuse.js below
        confidence = -1; // placeholder
      }

      if (confidence > 0) {
        results.push(this.toResolvedUser(user, confidence));
      }
    }

    // If we have a perfect match, return sorted
    if (results.some((r) => r.confidence === 1.0)) {
      return results.sort((a, b) => b.confidence - a.confidence);
    }

    // Fuzzy match remaining users
    const unscored = users.filter(
      (u) =>
        !results.some(
          (r) =>
            r.accountId === u.accountId &&
            r.name === u.name &&
            r.displayName === u.displayName
        )
    );

    if (unscored.length > 0) {
      const fuse = new Fuse(unscored, {
        keys: ['displayName', 'emailAddress', 'name'],
        includeScore: true,
        threshold: 0.6,
      });

      const fuseResults = fuse.search(query);

      for (const result of fuseResults) {
        // Fuse score is 0 (perfect) to 1 (worst), invert to confidence
        const confidence = Math.max(0, 1 - (result.score ?? 1)) * 0.9;
        results.push(this.toResolvedUser(result.item, confidence));
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Convert a raw JIRA user to ResolvedUser.
   */
  private toResolvedUser(user: JiraUserResponse, confidence: number): ResolvedUser {
    return {
      accountId: user.accountId,
      name: user.name,
      displayName: user.displayName,
      emailAddress: user.emailAddress,
      active: user.active,
      confidence,
    };
  }
}

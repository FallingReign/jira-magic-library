/**
 * Field Option Resolver
 *
 * Resolves fuzzy text to select/multiselect option IDs.
 * Uses allowedValues from createmeta as primary source,
 * with Cloud field context API as fallback.
 */

import Fuse from 'fuse.js';
import type { JiraClient } from '../client/JiraClient.js';
import type { CacheAdapter } from '../cache/CacheAdapter.js';
import type { EndpointResolver } from '../client/EndpointResolver.js';
import type { DeploymentType } from '../types/config.js';
import { ValidationError } from '../errors/ValidationError.js';
import type { ResolvedOption } from './types.js';

/** Raw option shape from JIRA */
interface JiraOption {
  id: string;
  value: string;
  disabled?: boolean;
  children?: JiraOption[];
}

/** Cloud field context response */
interface FieldContextResponse {
  values: Array<{
    id: string;
    name: string;
    isGlobalContext: boolean;
  }>;
}

/** Cloud field options response */
interface FieldOptionsResponse {
  values: Array<{
    id: string;
    value: string;
    disabled?: boolean;
  }>;
}

const OPTION_CACHE_TTL = 900; // 15 minutes

/**
 * Resolves field option text to IDs using fuzzy matching.
 */
export class FieldOptionResolver {
  constructor(
    private readonly client: JiraClient,
    private readonly cache: CacheAdapter,
    private readonly endpointResolver: EndpointResolver,
    private readonly deployment: DeploymentType
  ) {}

  /**
   * Resolve option text for a field in a project/issueType context.
   * Throws ValidationError if no match found.
   */
  async resolve(
    fieldId: string,
    query: string,
    projectKey: string,
    issueType: string
  ): Promise<ResolvedOption> {
    const options = await this.getOptions(fieldId, projectKey, issueType);

    if (options.length === 0) {
      throw new ValidationError(
        `No options available for field "${fieldId}" in ${projectKey}/${issueType}.`,
        { field: fieldId, value: query }
      );
    }

    const match = this.fuzzyMatch(options, query);

    if (!match) {
      const suggestions = this.getTopSuggestions(options, query, 3);
      throw new ValidationError(
        `Could not resolve option "${query}" for field "${fieldId}". Did you mean: ${suggestions.join(', ')}?`,
        { field: fieldId, value: query, suggestions }
      );
    }

    return match;
  }

  /**
   * Get all options for a field in a project/issueType context.
   */
  async getOptions(
    fieldId: string,
    projectKey: string,
    issueType: string
  ): Promise<Array<{ id: string; value: string }>> {
    const cacheKey = `field:options:${fieldId}:${projectKey}:${issueType}`;

    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as Array<{ id: string; value: string }>;
    }

    let options = await this.fetchFromCreatemeta(fieldId, projectKey, issueType);

    // Fallback: Cloud field context API for custom fields
    if (options.length === 0 && this.deployment === 'cloud' && fieldId.startsWith('customfield_')) {
      options = await this.fetchFromFieldContext(fieldId);
    }

    await this.cache.set(cacheKey, JSON.stringify(options), OPTION_CACHE_TTL);

    return options;
  }

  /**
   * Resolve cascading select (parent + child).
   */
  async resolveCascading(
    fieldId: string,
    parentQuery: string,
    childQuery: string,
    projectKey: string,
    issueType: string
  ): Promise<{ id: string; child?: { id: string } }> {
    const cacheKey = `field:cascading:${fieldId}:${projectKey}:${issueType}`;

    let allOptions: JiraOption[];
    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      allOptions = JSON.parse(cached.value) as JiraOption[];
    } else {
      allOptions = await this.fetchCascadingOptions(fieldId, projectKey, issueType);
      await this.cache.set(cacheKey, JSON.stringify(allOptions), OPTION_CACHE_TTL);
    }

    // Resolve parent
    const parentOptions = allOptions.map((o) => ({ id: o.id, value: o.value }));
    const parentMatch = this.fuzzyMatch(parentOptions, parentQuery);

    if (!parentMatch) {
      const suggestions = this.getTopSuggestions(parentOptions, parentQuery, 3);
      throw new ValidationError(
        `Could not resolve parent option "${parentQuery}" for cascading field "${fieldId}". Did you mean: ${suggestions.join(', ')}?`,
        { field: fieldId, value: parentQuery, suggestions }
      );
    }

    // Resolve child if provided
    if (childQuery) {
      const parentFull = allOptions.find((o) => o.id === parentMatch.id);
      const childOptions = (parentFull?.children ?? []).map((c) => ({ id: c.id, value: c.value }));

      if (childOptions.length === 0) {
        throw new ValidationError(
          `Parent option "${parentMatch.value}" for field "${fieldId}" has no child options.`,
          { field: fieldId, value: childQuery }
        );
      }

      const childMatch = this.fuzzyMatch(childOptions, childQuery);

      if (!childMatch) {
        const suggestions = this.getTopSuggestions(childOptions, childQuery, 3);
        throw new ValidationError(
          `Could not resolve child option "${childQuery}" for cascading field "${fieldId}". Did you mean: ${suggestions.join(', ')}?`,
          { field: fieldId, value: childQuery, suggestions }
        );
      }

      return { id: parentMatch.id, child: { id: childMatch.id } };
    }

    return { id: parentMatch.id };
  }

  /**
   * Fetch options from createmeta (allowedValues).
   */
  private async fetchFromCreatemeta(
    fieldId: string,
    projectKey: string,
    issueType: string
  ): Promise<Array<{ id: string; value: string }>> {
    try {
      const endpoint = this.endpointResolver.createMeta(projectKey);
      const response = await this.client.get<{
        projects?: Array<{
          issuetypes?: Array<{
            name?: string;
            fields?: Record<string, { allowedValues?: JiraOption[] }>;
          }>;
        }>;
      }>(endpoint);

      const project = response?.projects?.[0];
      const type = project?.issuetypes?.find(
        (t) => t.name?.toLowerCase() === issueType.toLowerCase()
      );
      const field = type?.fields?.[fieldId];
      const allowedValues = field?.allowedValues ?? [];

      return allowedValues
        .filter((v) => !v.disabled)
        .map((v) => ({ id: v.id, value: v.value }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch options from Cloud field context API (fallback).
   */
  private async fetchFromFieldContext(
    fieldId: string
  ): Promise<Array<{ id: string; value: string }>> {
    try {
      // Get contexts for the field
      const contextEndpoint = this.endpointResolver.fieldContext(fieldId);
      const contextResponse = await this.client.get<FieldContextResponse>(contextEndpoint);

      const contexts = contextResponse?.values ?? [];
      if (contexts.length === 0) return [];

      // Use first context (global preferred)
      const context = contexts.find((c) => c.isGlobalContext) ?? contexts[0]!;

      // Get options for context
      const optionsEndpoint = this.endpointResolver.fieldOptions(fieldId, context.id);
      const optionsResponse = await this.client.get<FieldOptionsResponse>(optionsEndpoint);

      return (optionsResponse?.values ?? [])
        .filter((v) => !v.disabled)
        .map((v) => ({ id: v.id, value: v.value }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch cascading options from createmeta (with children).
   */
  private async fetchCascadingOptions(
    fieldId: string,
    projectKey: string,
    issueType: string
  ): Promise<JiraOption[]> {
    try {
      const endpoint = this.endpointResolver.createMeta(projectKey);
      const response = await this.client.get<{
        projects?: Array<{
          issuetypes?: Array<{
            name?: string;
            fields?: Record<string, { allowedValues?: JiraOption[] }>;
          }>;
        }>;
      }>(endpoint);

      const project = response?.projects?.[0];
      const type = project?.issuetypes?.find(
        (t) => t.name?.toLowerCase() === issueType.toLowerCase()
      );
      const field = type?.fields?.[fieldId];

      return field?.allowedValues ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Fuzzy match a query against options. Returns best match or null.
   */
  private fuzzyMatch(
    options: Array<{ id: string; value: string }>,
    query: string
  ): ResolvedOption | null {
    // Exact match first
    const exactMatch = options.find(
      (o) => o.value.toLowerCase() === query.toLowerCase()
    );
    if (exactMatch) {
      return { id: exactMatch.id, value: exactMatch.value, confidence: 1.0 };
    }

    // Fuzzy match with Fuse.js
    const fuse = new Fuse(options, {
      keys: ['value'],
      includeScore: true,
      threshold: 0.4,
    });

    const results = fuse.search(query);
    if (results.length === 0) return null;

    const best = results[0]!;
    const confidence = Math.max(0, 1 - (best.score ?? 1));

    return { id: best.item.id, value: best.item.value, confidence };
  }

  /**
   * Get top N suggestion strings for error messages.
   */
  private getTopSuggestions(
    options: Array<{ id: string; value: string }>,
    query: string,
    n: number
  ): string[] {
    const fuse = new Fuse(options, {
      keys: ['value'],
      includeScore: true,
      threshold: 0.8,
    });

    const results = fuse.search(query);
    if (results.length > 0) {
      return results.slice(0, n).map((r) => r.item.value);
    }

    // If fuse returns nothing, just return first N options
    return options.slice(0, n).map((o) => o.value);
  }
}

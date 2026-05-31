/**
 * Field Metadata Discovery
 *
 * Discovers field metadata (global fields, context-specific fields, custom fields).
 * Supports both Cloud and Server deployments.
 */

import Fuse from 'fuse.js';
import type { JiraClient } from '../client/JiraClient.js';
import type { CacheAdapter } from '../cache/CacheAdapter.js';
import type { EndpointResolver } from '../client/EndpointResolver.js';
import type { FieldInfo, FieldListOptions } from './types.js';

/** Raw field from GET /rest/api/{version}/field */
interface JiraFieldResponse {
  id: string;
  key?: string;
  name: string;
  custom: boolean;
  schema?: {
    type: string;
    items?: string;
    system?: string;
    custom?: string;
    customId?: number;
  };
  clauseNames?: string[];
}

/** Raw field from createmeta fields response */
interface JiraCreateMetaField {
  fieldId: string;
  name: string;
  required: boolean;
  schema?: {
    type: string;
    items?: string;
    system?: string;
    custom?: string;
    customId?: number;
  };
  allowedValues?: Array<{ id: string; name?: string; value?: string }>;
  autoCompleteUrl?: string;
}

/** Paginated response from createmeta fields */
interface CreateMetaFieldsResponse {
  values?: JiraCreateMetaField[];
  maxResults?: number;
  startAt?: number;
  total?: number;
}

const FIELD_CACHE_TTL = 900; // 15 minutes

/**
 * Discovers field metadata from JIRA.
 *
 * - `listAll()`: Global field list (GET /field endpoint)
 * - `getForContext()`: Project+issue type specific fields (createmeta)
 * - `get()`: Single field lookup by ID or name
 * - `getCustomFields()`: Filter to custom fields only
 */
export class FieldMetadataDiscovery {
  constructor(
    private readonly client: JiraClient,
    private readonly cache: CacheAdapter,
    private readonly resolverFn: () => Promise<EndpointResolver>
  ) {}

  /**
   * List all fields (global).
   * Optionally filter by custom-only or search by name.
   */
  async listAll(options?: FieldListOptions): Promise<FieldInfo[]> {
    // If project+issueType specified, delegate to getForContext
    if (options?.projectKey && options?.issueType) {
      return this.getForContext(options.projectKey, options.issueType);
    }

    const resolver = await this.resolverFn();
    let fields = await this.fetchGlobalFields(resolver);

    if (options?.customOnly) {
      fields = fields.filter((f) => f.custom);
    }

    if (options?.query) {
      fields = this.fuzzyFilter(fields, options.query);
    }

    return fields;
  }

  /**
   * Get fields applicable to a specific project + issue type.
   * Uses the createmeta endpoint with pagination.
   */
  async getForContext(projectKey: string, issueType: string): Promise<FieldInfo[]> {
    const resolver = await this.resolverFn();
    const cacheKey = `jml:discovery:fields:context:${projectKey}:${issueType}`;

    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as FieldInfo[];
    }

    const fields = await this.fetchContextFields(resolver, projectKey, issueType);
    await this.cache.set(cacheKey, JSON.stringify(fields), FIELD_CACHE_TTL);
    return fields;
  }

  /**
   * Get a single field by ID or name.
   * If projectKey + issueType provided, searches context-specific fields first.
   */
  async get(
    fieldIdOrName: string,
    projectKey?: string,
    issueType?: string
  ): Promise<FieldInfo | null> {
    // If context provided, search context fields first
    if (projectKey && issueType) {
      const contextFields = await this.getForContext(projectKey, issueType);
      const found = contextFields.find(
        (f) =>
          f.id === fieldIdOrName ||
          f.key === fieldIdOrName ||
          f.name.toLowerCase() === fieldIdOrName.toLowerCase()
      );
      if (found) return found;
    }

    // Fall back to global fields
    const allFields = await this.listAll();
    return (
      allFields.find(
        (f) =>
          f.id === fieldIdOrName ||
          f.key === fieldIdOrName ||
          f.name.toLowerCase() === fieldIdOrName.toLowerCase()
      ) ?? null
    );
  }

  /**
   * Get custom fields only, with optional query filter.
   */
  async getCustomFields(options?: { query?: string }): Promise<FieldInfo[]> {
    return this.listAll({ customOnly: true, query: options?.query });
  }

  // ─── Private ──────────────────────────────────────────────────────

  private async fetchGlobalFields(resolver: EndpointResolver): Promise<FieldInfo[]> {
    const cacheKey = 'jml:discovery:fields:global';
    const cached = await this.cache.get(cacheKey);
    if (cached.value) {
      return JSON.parse(cached.value) as FieldInfo[];
    }

    const endpoint = resolver.fieldList();
    const raw = await this.client.get<JiraFieldResponse[]>(endpoint);
    const fields = (raw ?? []).map((f) => this.mapGlobalField(f));

    await this.cache.set(cacheKey, JSON.stringify(fields), FIELD_CACHE_TTL);
    return fields;
  }

  private async fetchContextFields(
    resolver: EndpointResolver,
    projectKey: string,
    issueType: string
  ): Promise<FieldInfo[]> {
    // First resolve issueType name to ID using createmeta issuetypes
    const issueTypeId = await this.resolveIssueTypeId(resolver, projectKey, issueType);

    // Then fetch fields for that issue type with pagination
    const allFields: FieldInfo[] = [];
    let startAt = 0;
    const maxResults = 1000;
    let total = 0;

    do {
      const endpoint = `${resolver.createMetaFields(projectKey, issueTypeId)}?startAt=${startAt}&maxResults=${maxResults}`;
      const response = await this.client.get<CreateMetaFieldsResponse>(endpoint);

      const values = response?.values ?? [];
      for (const raw of values) {
        allFields.push(this.mapContextField(raw));
      }

      total = response?.total ?? values.length;
      startAt += maxResults;
    } while (allFields.length < total);

    return allFields;
  }

  private async resolveIssueTypeId(
    resolver: EndpointResolver,
    projectKey: string,
    issueType: string
  ): Promise<string> {
    interface IssueTypeEntry { id: string; name: string }
    interface IssueTypesResponse { values?: IssueTypeEntry[] }

    const endpoint = `${resolver.apiBase}/issue/createmeta/${projectKey}/issuetypes`;
    const response = await this.client.get<IssueTypesResponse>(endpoint);
    const values = response?.values ?? [];

    const match = values.find(
      (t) => t.name.toLowerCase() === issueType.toLowerCase() || t.id === issueType
    );

    if (!match) {
      // Try fuzzy match
      const fuse = new Fuse(values, { keys: ['name'], threshold: 0.3 });
      const fuzzyResult = fuse.search(issueType);
      const topMatch = fuzzyResult[0];
      if (topMatch) {
        return String(topMatch.item.id);
      }
      throw new Error(
        `Issue type '${issueType}' not found in project '${projectKey}'. Available: ${values.map((t) => t.name).join(', ')}`
      );
    }

    return String(match.id);
  }

  private mapGlobalField(raw: JiraFieldResponse): FieldInfo {
    return {
      id: raw.id,
      key: raw.key ?? raw.id,
      name: raw.name,
      type: raw.schema?.type ?? 'unknown',
      custom: raw.custom,
      required: false, // Global fields don't carry required info
      schema: raw.schema
        ? {
            type: raw.schema.type,
            items: raw.schema.items,
            system: raw.schema.system,
            custom: raw.schema.custom,
            customId: raw.schema.customId,
          }
        : undefined,
    };
  }

  private mapContextField(raw: JiraCreateMetaField): FieldInfo {
    return {
      id: raw.fieldId,
      key: raw.fieldId,
      name: raw.name,
      type: raw.schema?.type ?? 'unknown',
      custom: raw.fieldId.startsWith('customfield_'),
      required: raw.required,
      schema: raw.schema
        ? {
            type: raw.schema.type,
            items: raw.schema.items,
            system: raw.schema.system,
            custom: raw.schema.custom,
            customId: raw.schema.customId,
          }
        : undefined,
      allowedValues: raw.allowedValues?.map((v) => ({
        id: String(v.id),
        name: v.name,
        value: v.value,
      })),
      autoCompleteUrl: raw.autoCompleteUrl,
    };
  }

  private fuzzyFilter(fields: FieldInfo[], query: string): FieldInfo[] {
    const fuse = new Fuse(fields, {
      keys: ['name', 'id'],
      threshold: 0.4,
      includeScore: true,
    });
    return fuse.search(query).map((r) => r.item);
  }
}

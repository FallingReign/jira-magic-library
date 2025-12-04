import { JiraClient } from '../client/JiraClient.js';
import { CacheClient } from '../types/cache.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { ProjectSchema, FieldSchema } from '../types/schema.js';
import { VirtualFieldRegistry } from './VirtualFieldRegistry.js';
import type { 
  JiraFieldMeta,
  JiraIssueType,
  JiraApiResponse
} from '../types/jira-api.js';

/**
 * Discovers and caches JIRA field schemas for projects and issue types.
 * 
 * Uses the JIRA createmeta API to dynamically discover field definitions,
 * eliminating the need for hardcoded field mappings. Schemas are cached
 * in Redis for 15 minutes to minimize API calls.
 * 
 * @example
 * ```typescript
 * const discovery = new SchemaDiscovery(jiraClient, cache, baseUrl);
 * const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');
 * console.log(schema.fields.summary.required); // true
 * 
 * const fieldId = await discovery.getFieldIdByName('ENG', 'Bug', 'Story Points');
 * console.log(fieldId); // "customfield_10024"
 * ```
 */
export class SchemaDiscovery {
  private readonly cacheTTL = 900; // 15 minutes

  constructor(
    private readonly client: JiraClient,
    private readonly cache: CacheClient,
    private readonly baseUrl: string
  ) {}

  /**
   * Gets all available issue types for a project.
   * 
   * @param projectKey - JIRA project key (e.g., "ENG")
   * @returns Promise resolving to array of issue types with IDs and names
   * @throws {NotFoundError} if the project doesn't exist or has no issue types
   * 
   * @example
   * ```typescript
   * const issueTypes = await discovery.getIssueTypesForProject('ENG');
   * console.log(issueTypes);
   * // [{ id: "10000", name: "Epic" }, { id: "10001", name: "Story" }]
   * ```
   */
  async getIssueTypesForProject(projectKey: string): Promise<Array<{ id: string; name: string }>> {
    const issueTypesData = await this.client.get<JiraApiResponse>(
      `/rest/api/2/issue/createmeta/${projectKey}/issuetypes`
    );

    const values = (issueTypesData as { values?: JiraIssueType[] }).values;
    if (!values || values.length === 0) {
      throw new NotFoundError(
        `No issue types found for project '${projectKey}'`,
        { projectKey }
      );
    }

    return values.map(it => ({
      id: String(it.id),
      name: it.name,
    }));
  }

  /**
   * Gets the field schema for a specific project and issue type.
   * 
   * Uses stale-while-revalidate caching:
   * - Fresh cache: Returns immediately
   * - Stale cache: Returns immediately, refreshes in background
   * - No cache: Fetches from API (blocks)
   * 
   * Uses a two-step process:
   * 1. GET /rest/api/2/issue/createmeta/{projectKey}/issuetypes - Get issue type ID
   * 2. GET /rest/api/2/issue/createmeta/{projectKey}/issuetypes/{issueTypeId} - Get fields
   * 
   * @param projectKey - JIRA project key (e.g., "ENG")
   * @param issueTypeName - Issue type name (e.g., "Bug", "Task")
   * @returns Promise resolving to the project schema
   * @throws {NotFoundError} if the project or issue type doesn't exist
   * 
   * @example
   * ```typescript
   * const schema = await discovery.getFieldsForIssueType('ENG', 'Bug');
   * console.log(Object.keys(schema.fields)); // ["summary", "priority", ...]
   * ```
   */
  async getFieldsForIssueType(
    projectKey: string,
    issueTypeName: string
  ): Promise<ProjectSchema> {
    const cacheKey = this.getCacheKey(projectKey, issueTypeName);

    // Check cache with staleness info (stale-while-revalidate)
    try {
      const cacheResult = await this.cache.get(cacheKey);
      if (cacheResult.value) {
        const schema = JSON.parse(cacheResult.value) as ProjectSchema;
        
        if (cacheResult.isStale) {
          // Return stale value immediately, refresh in background
          this.refreshSchemaInBackground(projectKey, issueTypeName, cacheKey);
        }
        
        return schema;
      }
    } catch (error) {
      // Cache error - log and continue to fetch from API
      console.warn('Cache read error, fetching from API:', error);
    }

    // No cache - fetch from API (blocking)
    return this.fetchAndCacheSchema(projectKey, issueTypeName, cacheKey);
  }

  /**
   * Refresh schema in background (fire-and-forget)
   * Used by stale-while-revalidate pattern
   */
  private refreshSchemaInBackground(
    projectKey: string,
    issueTypeName: string,
    cacheKey: string
  ): void {
    // Fire and forget - don't await, don't block caller
    this.fetchAndCacheSchema(projectKey, issueTypeName, cacheKey).catch(err => {
      console.warn(`Background schema refresh failed for ${projectKey}/${issueTypeName}:`, err);
    });
  }

  /**
   * Fetch schema from JIRA API and cache it
   */
  private async fetchAndCacheSchema(
    projectKey: string,
    issueTypeName: string,
    cacheKey: string
  ): Promise<ProjectSchema> {
    // Step 1: Get available issue types for the project to find the ID
    const issueTypesData = await this.client.get<JiraApiResponse>(
      `/rest/api/2/issue/createmeta/${projectKey}/issuetypes`
    );

    // Validate project exists (404 would be thrown by client)
    // Response format: { values: [...], maxResults, startAt, total, isLast }
    const values = (issueTypesData as { values?: JiraIssueType[] }).values;
    if (!values || values.length === 0) {
      throw new NotFoundError(
        `No issue types found for project '${projectKey}'`,
        { projectKey }
      );
    }

    // Find the issue type by name (case-insensitive)
    const issueType = values.find(
      (it: JiraIssueType) => it.name.toLowerCase() === issueTypeName.toLowerCase()
    );

    if (!issueType) {
      const availableTypes = values.map((it: JiraIssueType) => it.name);
      throw new NotFoundError(
        `Issue type '${issueTypeName}' not found in project '${projectKey}'. Available types: ${availableTypes.join(', ')}`,
        { projectKey, issueTypeName, availableTypes }
      );
    }

    // Step 2: Get the field definitions for this issue type
    // IMPORTANT: JIRA paginates field results (default 50), need to fetch all
    // Using maxResults=1000 to minimize pagination requests for large field sets
    let allFieldValues: JiraFieldMeta[] = [];
    let startAt = 0;
    const maxResults = 1000; // Request up to 1000 fields per page (JIRA supports high limits)
    let total = 0;

    do {
      const fieldsData = await this.client.get<JiraApiResponse>(
        `/rest/api/2/issue/createmeta/${projectKey}/issuetypes/${issueType.id}?startAt=${startAt}&maxResults=${maxResults}`
      );

      const response = fieldsData as { values?: JiraFieldMeta[]; total?: number; maxResults?: number };
      const fieldValues = response.values;
      
      if (!fieldValues) {
        throw new NotFoundError(
          `No fields found for issue type '${issueTypeName}' in project '${projectKey}'`,
          { projectKey, issueTypeName, issueTypeId: issueType.id }
        );
      }

      allFieldValues = allFieldValues.concat(fieldValues);
      total = response.total || fieldValues.length;
      startAt += maxResults;

    } while (allFieldValues.length < total);

    if (allFieldValues.length === 0) {
      throw new NotFoundError(
        `No fields found for issue type '${issueTypeName}' in project '${projectKey}'`,
        { projectKey, issueTypeName, issueTypeId: issueType.id }
      );
    }

    // Parse schema
    const schema = this.parseSchema(projectKey, issueTypeName, allFieldValues);

    // Cache the result
    try {
      await this.cache.set(cacheKey, JSON.stringify(schema), this.cacheTTL);
    } catch (error) {
      // Cache write error - log but don't fail
      console.warn('Cache write error:', error);
    }

    return schema;
  }

  /**
   * Resolves a human-readable field name to its JIRA field ID.
   * 
   * Performs case-insensitive matching against field names in the schema.
   * 
   * @param projectKey - JIRA project key
   * @param issueTypeName - Issue type name
   * @param fieldName - Human-readable field name (e.g., "Summary", "Story Points")
   * @returns Promise resolving to field ID or null if not found
   * 
   * @example
   * ```typescript
   * const id = await discovery.getFieldIdByName('ENG', 'Bug', 'story points');
   * console.log(id); // "customfield_10024"
   * 
   * const invalid = await discovery.getFieldIdByName('ENG', 'Bug', 'NonExistent');
   * console.log(invalid); // null
   * ```
   */
  async getFieldIdByName(
    projectKey: string,
    issueTypeName: string,
    fieldName: string
  ): Promise<string | null> {
    const schema = await this.getFieldsForIssueType(projectKey, issueTypeName);

    const lowerFieldName = fieldName.toLowerCase();

    for (const [fieldId, field] of Object.entries(schema.fields)) {
      if (field.name.toLowerCase() === lowerFieldName) {
        return fieldId;
      }
    }

    return null;
  }

  /**
   * Parses JIRA createmeta field definitions into our internal schema format.
   * 
   * @param projectKey - Project key
   * @param issueTypeName - Issue type name
   * @param jiraFields - Raw field definitions from JIRA API (array of field objects)
   * @returns Parsed project schema
   */
  private parseSchema(
    projectKey: string,
    issueTypeName: string,
    jiraFields: JiraFieldMeta[]
  ): ProjectSchema {
    const fields: Record<string, FieldSchema> = {};

    // JIRA createmeta returns an array of field objects, each with a fieldId property
    for (const fieldDef of jiraFields) {
      const fieldId = (fieldDef as { fieldId?: string }).fieldId;
      if (!fieldId) {
        // Skip fields without fieldId (shouldn't happen in normal API responses)
        continue;
      }
      fields[fieldId] = this.parseField(fieldId, fieldDef);
    }

    // Generate virtual sub-fields for supported field types (E3-S02b)
    // Virtual fields allow users to use natural field names like "Original Estimate"
    // instead of understanding JIRA's internal object structure
    this.generateVirtualFields(fields);

    return {
      projectKey,
      issueType: issueTypeName,
      fields,
    };
  }

  /**
   * Generates virtual sub-fields for parent fields that have properties users want to set directly.
   * 
   * Virtual fields are discovered by VirtualFieldRegistry and generated dynamically.
   * Example: timetracking field gets "Original Estimate" and "Remaining Estimate" virtual sub-fields.
   * 
   * @param fields - Field schema map to augment with virtual fields
   */
  private generateVirtualFields(fields: Record<string, FieldSchema>): void {
    const virtualFieldRegistry = VirtualFieldRegistry.getInstance();

    // For each real field, check if there are virtual sub-fields to generate
    for (const [fieldId, field] of Object.entries(fields)) {
      const virtualFields = virtualFieldRegistry.getByParentField(fieldId);

      for (const virtualDef of virtualFields) {
        // Create virtual field ID: "parentFieldId.propertyPath"
        const virtualFieldId = `${fieldId}.${virtualDef.propertyPath}`;

        // Generate virtual field schema based on parent field
        fields[virtualFieldId] = {
          id: virtualFieldId,
          name: virtualDef.name,
          type: virtualDef.type,
          required: field.required, // Inherit from parent
          schema: {
            type: virtualDef.type,
            system: virtualDef.propertyPath,
            custom: 'virtual', // Mark as virtual for debugging
            customId: undefined, // Virtual fields don't have custom IDs
          },
        };
      }
    }
  }

  /**
   * Parses a single JIRA field definition into our internal format.
   * 
   * @param fieldId - Field identifier
   * @param fieldDef - Raw field definition from JIRA
   * @returns Parsed field schema
   */
  private parseField(fieldId: string, fieldDef: JiraFieldMeta): FieldSchema {
    const schema: FieldSchema = {
      id: fieldId,
      name: fieldDef.name,
      type: this.mapFieldType(fieldDef.schema),
      required: fieldDef.required || false,
      schema: fieldDef.schema,
    };

    // Include allowed values for select fields
    if (fieldDef.allowedValues && Array.isArray(fieldDef.allowedValues)) {
      schema.allowedValues = fieldDef.allowedValues.map((v) => {
        const displayValue = v.value || v.name;
        const option: { id: string; name: string; value: string; children?: Array<{ id: string; value: string }> } = {
          id: String(v.id),
          name: displayValue, // For resolveUniqueName utility
          value: displayValue, // For cascading select converter
        };

        // For cascading selects, convert nested children array to simple format
        if (v.children && Array.isArray(v.children)) {
          option.children = v.children.map((child: { id: string | number; value?: string; name?: string }) => ({
            id: String(child.id),
            value: (child.value || child.name) as string,
          }));
        }

        return option;
      });
    }

    return schema;
  }

  /**
   * Maps JIRA schema types to our internal type system.
   * 
   * @param schema - JIRA schema object
   * @returns Internal field type
   */
  private mapFieldType(schema: JiraFieldMeta['schema']): string {
    if (!schema) return 'unknown';
    
    // Direct type mapping
    const type = schema.type;

    // Handle array types
    if (type === 'array' && schema.items) {
      // Keep array type - converters will handle specific array types
      return 'array';
    }

    // For most types, use the JIRA type directly
    // Converters will handle type-specific logic
    return type || 'unknown';
  }

  /**
   * Generates a cache key for a project + issue type combination.
   * 
   * @param projectKey - Project key
   * @param issueTypeName - Issue type name
   * @returns Cache key
   */
  private getCacheKey(projectKey: string, issueTypeName: string): string {
    return `jml:schema:${this.baseUrl}:${projectKey}:${issueTypeName}`;
  }
}

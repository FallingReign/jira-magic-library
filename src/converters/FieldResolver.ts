import { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import { ConfigurationError } from '../errors/ConfigurationError.js';
import { VirtualFieldRegistry } from '../schema/VirtualFieldRegistry.js';
import { ProjectSchema } from '../types/schema.js';
import type { ParentFieldDiscovery } from '../hierarchy/ParentFieldDiscovery.js';
import type { JiraClient } from '../client/JiraClient.js';
import type { RedisCache } from '../cache/RedisCache.js';
import type { JPOHierarchyDiscovery } from '../hierarchy/JPOHierarchyDiscovery.js';
import { resolveParentLink } from '../hierarchy/ParentLinkResolver.js';
import { DEFAULT_PARENT_SYNONYMS } from '../constants/field-constants.js';

/**
 * Resolves human-readable field names to JIRA field IDs.
 * 
 * Enables users to provide natural field names like "Summary", "Issue Type",
 * "Story Points" instead of JIRA field IDs like "summary", "issuetype", 
 * "customfield_10024".
 * 
 * Features:
 * - Case-insensitive matching ("Summary" = "SUMMARY" = "summary")
 * - Fuzzy matching (ignores spaces, hyphens, underscores)
 * - Special handling for Project and Issue Type fields
 * - Field ID passthrough (if user provides ID, use as-is)
 * - Helpful error messages with suggestions using Levenshtein distance
 * 
 * @example
 * ```typescript
 * const resolver = new FieldResolver(schemaDiscovery);
 * 
 * const resolved = await resolver.resolveFields('ENG', 'Bug', {
 *   'Project': 'ENG',
 *   'Issue Type': 'Bug',
 *   'Summary': 'Login fails',
 *   'Description': 'Steps to reproduce...'
 * });
 * 
 * // Returns:
 * // {
 * //   project: { key: 'ENG' },
 * //   issuetype: { name: 'Bug' },
 * //   summary: 'Login fails',
 * //   description: 'Steps to reproduce...'
 * // }
 * ```
 */
export class FieldResolver {
  private readonly parentSynonyms: string[];

  constructor(
    private readonly schemaDiscovery: SchemaDiscovery,
    private readonly parentFieldDiscovery?: ParentFieldDiscovery,
    private readonly client?: JiraClient,
    private readonly cache?: RedisCache,
    private readonly hierarchyDiscovery?: JPOHierarchyDiscovery,
    customParentSynonyms?: string[]
  ) {
    // Merge custom synonyms with defaults (AC9)
    this.parentSynonyms = customParentSynonyms || DEFAULT_PARENT_SYNONYMS;
  }

  /**
   * Resolves field names to JIRA field IDs.
   * 
   * @param projectKey - JIRA project key (e.g., "ENG")
   * @param issueType - Issue type name (e.g., "Bug", "Task")
   * @param input - User input with human-readable field names
   * @returns Promise resolving to JIRA-compatible field object
   * @remarks Unknown fields are skipped with a console warning (graceful degradation)
   * 
   * @example
   * ```typescript
   * const resolved = await resolver.resolveFields('ENG', 'Bug', {
   *   'Summary': 'Login fails',
   *   'Story Points': 5
   * });
   * // { summary: 'Login fails', customfield_10024: 5 }
   * ```
   */
  async resolveFields(
    projectKey: string,
    issueType: string,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const schema = await this.schemaDiscovery.getFieldsForIssueType(projectKey, issueType);
    const resolved: Record<string, unknown> = {};
    
    // Track virtual fields by parent for grouping (E3-S02b)
    const virtualFieldRegistry = VirtualFieldRegistry.getInstance();
    const virtualFieldGroups = new Map<string, Record<string, unknown>>();

    for (const [fieldName, value] of Object.entries(input)) {
      // E3-S06: Check if this is a parent synonym
      if (this.isParentSynonym(fieldName)) {
        const parentFieldKey = await this.resolveParentSynonym(
          value,
          projectKey,
          issueType
        );
        resolved[parentFieldKey.fieldId] = parentFieldKey.value;
        continue;
      }

      // Special case: Project field
      if (this.normalizeFieldName(fieldName) === 'project') {
        // Check if already resolved to { key: "..." } format (from IssueOperations pre-resolution)
        if (typeof value === 'object' && value !== null && 'key' in value) {
          resolved.project = value; // Already in correct format, use as-is
        } else {
          resolved.project = { key: value }; // Wrap string key in object
        }
        continue;
      }

      // Special case: Issue Type field
      if (this.isIssueTypeField(fieldName)) {
        resolved.issuetype = { name: value };
        continue;
      }
      
      // Check if this is a virtual field (E3-S02b)
      const normalizedName = this.normalizeFieldName(fieldName);
      const virtualDef = virtualFieldRegistry.get(normalizedName);
      if (virtualDef) {
        // Accumulate virtual fields by parent for later grouping
        if (!virtualFieldGroups.has(virtualDef.parentFieldId)) {
          virtualFieldGroups.set(virtualDef.parentFieldId, {});
        }
        virtualFieldGroups.get(virtualDef.parentFieldId)![virtualDef.propertyPath] = value;
        continue; // Don't add to resolved yet
      }

      // Check if already a field ID (customfield_* or exists in schema)
      if (fieldName.startsWith('customfield_') || schema.fields[fieldName]) {
        // Validate field exists in schema
        if (!schema.fields[fieldName]) {
          // Gracefully skip unknown field IDs with warning (consistent with field name handling)
          // eslint-disable-next-line no-console
          console.warn(
            `⚠️  Warning: Field ID '${fieldName}' not found in schema for ${issueType} in ${projectKey}. Skipping this field.`
          );
          continue; // Skip this field and continue with others
        }
        resolved[fieldName] = value;
        continue;
      }

      // Resolve name → ID
      const fieldId = this.findFieldByName(schema, fieldName);
      if (!fieldId) {
        const suggestions = this.findClosestMatches(schema, fieldName);
        // Gracefully skip unknown fields with warning instead of failing
        // eslint-disable-next-line no-console
        console.warn(
          `⚠️  Warning: Field '${fieldName}' not found for ${issueType} in ${projectKey}. Skipping this field.` +
          (suggestions.length > 0 ? `\n   Did you mean: ${suggestions.join(', ')}?` : '')
        );
        continue; // Skip this field and continue with others
      }

      resolved[fieldId] = value;
    }
    
    // Merge virtual field groups into resolved (E3-S02b)
    // After main loop to ensure all virtual fields are collected
    for (const [parentFieldId, properties] of virtualFieldGroups) {
      if (resolved[parentFieldId]) {
        // AC5: Top-level virtual fields override object format
        // Merge with precedence: virtual fields win
        resolved[parentFieldId] = {
          ...(resolved[parentFieldId] as Record<string, unknown>),
          ...properties, // Virtual fields override
        };
      } else {
        // No object format provided, just use virtual fields
        resolved[parentFieldId] = properties;
      }
    }

    return resolved;
  }

  /**
   * Normalizes a field name by removing spaces, hyphens, underscores
   * and converting to lowercase.
   * 
   * @param name - Field name to normalize
   * @returns Normalized field name
   * 
   * @example
   * ```typescript
   * normalizeFieldName('Issue Type')   // 'issuetype'
   * normalizeFieldName('Story_Points') // 'storypoints'
   * normalizeFieldName('SUMMARY')      // 'summary'
   * ```
   */
  private normalizeFieldName(name: string): string {
    return name.toLowerCase().replace(/[\s_\/-]/g, '');
  }

  /**
   * Checks if a field name refers to the Issue Type field.
   * 
   * @param name - Field name to check
   * @returns True if this is an Issue Type field
   */
  private isIssueTypeField(name: string): boolean {
    const normalized = this.normalizeFieldName(name);
    return normalized === 'issuetype' || normalized === 'type';
  }

  /**
   * Finds a field ID by its human-readable name.
   * 
   * Uses normalized matching (case-insensitive, ignores spaces/hyphens/underscores).
   * 
   * @param schema - Project schema to search
   * @param name - Field name to find
   * @returns Field ID if found, null otherwise
   * 
   * @example
   * ```typescript
   * findFieldByName(schema, 'Story Points')    // 'customfield_10024'
   * findFieldByName(schema, 'story_points')    // 'customfield_10024'
   * findFieldByName(schema, 'STORY-POINTS')    // 'customfield_10024'
   * ```
   */
  private findFieldByName(schema: ProjectSchema, name: string): string | null {
    const normalized = this.normalizeFieldName(name);
    const entries = Object.entries(schema.fields).map(([fieldId, field]) => ({
      fieldId,
      normalizedName: this.normalizeFieldName(field.name),
    }));

    // 1) Exact normalized match
    const exact = entries.find((entry) => entry.normalizedName === normalized);
    if (exact) {
      return exact.fieldId;
    }

    // 2) Prefix/containment match (handles plurals like "fix version/s" vs "fix version")
    const prefixMatches = entries.filter((entry) => {
      const lengthDiff = Math.abs(entry.normalizedName.length - normalized.length);
      return (
        lengthDiff <= 2 &&
        (entry.normalizedName.startsWith(normalized) ||
          normalized.startsWith(entry.normalizedName))
      );
    });
    if (prefixMatches.length === 1) {
      return prefixMatches[0]!.fieldId;
    }

    // 3) Containment match (handles shortened inputs like "version" vs "fixversions")
    const containsMatches = entries.filter((entry) => {
      const lengthDiff = Math.abs(entry.normalizedName.length - normalized.length);
      return (
        normalized.length >= 5 &&
        lengthDiff <= 4 &&
        (entry.normalizedName.includes(normalized) ||
          normalized.includes(entry.normalizedName))
      );
    });
    if (containsMatches.length === 1) {
      return containsMatches[0]!.fieldId;
    }

    return null;
  }

  /**
   * Finds closest matching field names using Levenshtein distance.
   * 
   * @param schema - Project schema to search
   * @param name - Field name to match
   * @param maxResults - Maximum number of suggestions (default: 3)
   * @returns Array of closest matching field names
   * 
   * @example
   * ```typescript
   * findClosestMatches(schema, 'Summry')
   * // ['Summary', 'Story Points', 'Summary Note']
   * ```
   */
  private findClosestMatches(
    schema: ProjectSchema,
    name: string,
    maxResults = 3
  ): string[] {
    const matches = Object.values(schema.fields)
      .map((field) => ({
        name: field.name,
        distance: this.levenshtein(name.toLowerCase(), field.name.toLowerCase()),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxResults)
      .map((m) => m.name);

    return matches;
  }

  /**
   * Calculates Levenshtein distance between two strings.
   * 
   * Levenshtein distance is the minimum number of single-character edits
   * (insertions, deletions, or substitutions) required to change one string
   * into another.
   * 
   * @param a - First string
   * @param b - Second string
   * @returns Edit distance between strings
   * 
   * @example
   * ```typescript
   * levenshtein('kitten', 'sitting')  // 3
   * levenshtein('summary', 'summry')  // 1
   * ```
   */
  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = Array.from({ length: b.length + 1 }, () => 
      Array.from({ length: a.length + 1 }, () => 0)
    );

    // Initialize first column (distance from empty string)
    for (let i = 0; i <= b.length; i++) {
      matrix[i]![0] = i;
    }

    // Initialize first row (distance from empty string)
    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          // Characters match, no edit needed
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          // Take minimum of: substitute, insert, delete
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1, // substitute
            matrix[i]![j - 1]! + 1,     // insert
            matrix[i - 1]![j]! + 1      // delete
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }

  /**
   * Checks if a field name is a parent synonym.
   *
   * @param fieldName - Field name to check
   * @returns True if this is a parent synonym
   *
   * @example
   * ```typescript
   * isParentSynonym('Parent')      // true
   * isParentSynonym('Epic Link')   // true
   * isParentSynonym('EPIC')        // true
   * isParentSynonym('Summary')     // false
   * ```
   */
  private isParentSynonym(fieldName: string): boolean {
    const normalized = this.normalizeFieldName(fieldName);
    return this.parentSynonyms.some((synonym: string) => this.normalizeFieldName(synonym) === normalized);
  }

  /**
   * Resolves a parent synonym to the actual field ID and resolved value.
   *
   * @param value - Parent value (issue key or summary)
   * @param projectKey - Project key
   * @param issueTypeId - Child issue type ID
   * @returns Object with fieldId and resolved value
   * @throws {ConfigurationError} if no parent field configured
   *
   * @example
   * ```typescript
   * const result = await resolveParentSynonym('PROJ-123', 'PROJ', '10001');
   * // { fieldId: 'customfield_10014', value: 'PROJ-123' } // JPO field
   * // { fieldId: 'parent', value: { key: 'PROJ-123' } }   // Standard parent field
   * ```
   */
  private async resolveParentSynonym(
    value: unknown,
    projectKey: string,
    issueTypeName: string
  ): Promise<{ fieldId: string; value: string | { key: string } }> {
    // Get the actual parent field key from discovery
    if (!this.parentFieldDiscovery) {
      throw new ConfigurationError(
        'Parent field discovery not configured. Cannot resolve parent synonyms.'
      );
    }

    const parentFieldKey = await this.parentFieldDiscovery.getParentFieldKey(projectKey, issueTypeName);

    if (!parentFieldKey) {
      throw new ConfigurationError(
        `Project ${projectKey} does not have a parent field configured. ` +
          `Please configure a parent field in JIRA or use the exact field ID.`
      );
    }

    // Resolve the parent link (key or summary search)
    if (!this.client || !this.cache || !this.hierarchyDiscovery) {
      throw new ConfigurationError(
        'Required dependencies not configured for parent link resolution'
      );
    }

    // Find issue type ID from JIRA API response
    // We need to fetch it from the API since ProjectSchema doesn't include the issue type ID
    const issueTypesData = await this.client.get<{ values: Array<{ id: string; name: string }> }>(
      `/rest/api/2/issue/createmeta/${projectKey}/issuetypes`
    );
    
    const issueType = issueTypesData.values?.find(
      (it) => it.name.toLowerCase() === issueTypeName.toLowerCase()
    );
    
    if (!issueType) {
      throw new ConfigurationError(
        `Issue type '${issueTypeName}' not found in project '${projectKey}'`
      );
    }

    const resolvedParentKey = await resolveParentLink(
      String(value),
      issueType.id,
      projectKey,
      this.client,
      this.cache,
      this.hierarchyDiscovery,
      this.schemaDiscovery
    );

    // Get field schema to determine how to format the value
    const schema = await this.schemaDiscovery.getFieldsForIssueType(projectKey, issueTypeName);
    const parentField = schema.fields[parentFieldKey];

    // Format value based on field type:
    // - Standard JIRA parent field (type "issuelink"): { key: "ISSUE-123" }
    // - JPO hierarchy custom fields (type "any"): "ISSUE-123" (string)
    let formattedValue: string | { key: string };
    if (parentField && parentField.type === 'issuelink') {
      // Standard JIRA parent field expects object format
      formattedValue = { key: resolvedParentKey };
    } else {
      // JPO hierarchy fields expect string format  
      formattedValue = resolvedParentKey;
    }

    return {
      fieldId: parentFieldKey,
      value: formattedValue,
    };
  }
}

import { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import { ConfigurationError } from '../errors/ConfigurationError.js';
import { VirtualFieldRegistry } from '../schema/VirtualFieldRegistry.js';
import { ProjectSchema } from '../types/schema.js';
import type { ParentFieldDiscovery, ParentFieldInfo } from '../hierarchy/ParentFieldDiscovery.js';
import type { JiraClient } from '../client/JiraClient.js';
import type { RedisCache } from '../cache/RedisCache.js';
import type { JPOHierarchyDiscovery } from '../hierarchy/JPOHierarchyDiscovery.js';
import { resolveParentLink } from '../hierarchy/ParentLinkResolver.js';
import { DEFAULT_PARENT_SYNONYMS } from '../constants/field-constants.js';
import { resolveUniqueName } from '../utils/resolveUniqueName.js';
import { ValidationError } from '../errors/ValidationError.js';
import { findSystemField, isIdOnlyObject } from '../utils/findSystemField.js';
import { normalizeFieldName } from '../utils/normalizeFieldName.js';
import Fuse from 'fuse.js';

/**
 * Fuse.js configuration for fuzzy parent field matching.
 * Uses same threshold as resolveUniqueName for consistency.
 * minMatchCharLength is set higher to avoid false positives on short inputs like "Par".
 */
const PARENT_FUSE_OPTIONS = {
  threshold: 0.3,
  ignoreLocation: true,
  minMatchCharLength: 4,
};

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
  /**
   * Custom parent synonyms (optional) - only used when parentFieldDiscovery is not configured.
   * When parentFieldDiscovery is configured, parent field names are discovered dynamically from JIRA.
   */
  private readonly customParentSynonyms?: string[];

  constructor(
    private readonly schemaDiscovery: SchemaDiscovery,
    private readonly parentFieldDiscovery?: ParentFieldDiscovery,
    private readonly client?: JiraClient,
    private readonly cache?: RedisCache,
    private readonly hierarchyDiscovery?: JPOHierarchyDiscovery,
    customParentSynonyms?: string[]
  ) {
    // Store custom synonyms for fallback when discovery not configured
    this.customParentSynonyms = customParentSynonyms;
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
    
    // Pre-discover parent field info for dynamic synonym matching
    // This enables users to use the actual JIRA field name (e.g., "Container", "Parent Link")
    const parentFieldInfo = await this.discoverParentFieldInfo(projectKey, issueType);
    
    // Track virtual fields by parent for grouping (E3-S02b)
    const virtualFieldRegistry = VirtualFieldRegistry.getInstance();
    const virtualFieldGroups = new Map<string, Record<string, unknown>>();

    for (const [fieldName, value] of Object.entries(input)) {
      // E3-S06: Check if this is a parent synonym (with fuzzy matching)
      if (this.isParentSynonym(fieldName, parentFieldInfo)) {
        // Skip empty/null parent values (treat as no parent provided)
        if (
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '')
        ) {
          continue;
        }

        const parentFieldKey = await this.resolveParentSynonym(
          value,
          projectKey,
          issueType
        );
        resolved[parentFieldKey.fieldId] = parentFieldKey.value;
        continue;
      }

      // Special case: Project field
      if (normalizeFieldName(fieldName) === 'project') {
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
        // Check if already in object format (from JIRA API format passthrough)
        if (typeof value === 'object' && value !== null && ('name' in value || 'id' in value)) {
          resolved.issuetype = value; // Already in correct format, use as-is
        } else {
          resolved.issuetype = { name: value }; // Wrap string name in object
        }
        continue;
      }
      
      // Check if this is a virtual field (E3-S02b)
      const normalizedName = normalizeFieldName(fieldName);
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
   * Resolves field names to JIRA field IDs, extracting project and issueType from input.
   * 
   * This method consolidates project/issueType extraction that was previously in
   * IssueOperations.createSingle(), keeping field knowledge in one place.
   * 
   * Supports all input formats:
   * - String: `{ Project: "ENG", "Issue Type": "Bug" }`
   * - Object with key: `{ project: { key: "ENG" }, issuetype: { name: "Bug" } }`
   * - Object with id: `{ project: { id: "10000" }, issuetype: { id: "10001" } }`
   * 
   * @param input - User input with project, issueType, and other fields
   * @returns Promise resolving to { projectKey, issueType, fields }
   * @throws {Error} If Project or Issue Type is missing or invalid
   * 
   * @example
   * ```typescript
   * const result = await resolver.resolveFieldsWithExtraction({
   *   project: { key: 'ENG' },
   *   issuetype: { name: 'Bug' },
   *   summary: 'Login fails'
   * });
   * // { projectKey: 'ENG', issueType: 'Bug', fields: { project: {...}, issuetype: {...}, summary: '...' } }
   * ```
   */
  async resolveFieldsWithExtraction(
    input: Record<string, unknown>
  ): Promise<{ projectKey: string; issueType: string; fields: Record<string, unknown> }> {
    // 1. Find project field dynamically using normalization
    const projectResult = findSystemField(input, 'project');
    if (!projectResult) {
      throw new ValidationError("Field 'Project' is required", { field: 'project' });
    }
    if (projectResult.extracted === null) {
      // Field found but value can't be extracted - give helpful error
      throw new ValidationError(
        "Project value must be a string or object with key, name, id, or value property",
        { field: 'project', value: projectResult.value }
      );
    }
    
    // 2. Resolve project - handle ID vs key/name differently
    let projectKey: string;
    if (isIdOnlyObject(projectResult.value)) {
      // Object with id only - requires API lookup
      const id = projectResult.value.id;
      if (!this.client) {
        throw new ConfigurationError('Cannot resolve project by ID without JiraClient');
      }
      const projectData = await this.client.get<{ key: string }>(`/rest/api/2/project/${id}`);
      projectKey = projectData.key;
    } else {
      // String or object with key/name - fuzzy match against project list
      projectKey = await this.resolveProject(projectResult.extracted);
    }
    
    // 3. Find issue type field dynamically (supports 'type' alias)
    const issueTypeResult = findSystemField(input, 'issuetype');
    if (!issueTypeResult) {
      throw new ValidationError("Field 'Issue Type' is required", { field: 'issuetype' });
    }
    if (issueTypeResult.extracted === null) {
      // Field found but value can't be extracted - give helpful error
      throw new ValidationError(
        "Issue Type value must be a string or object with key, name, id, or value property",
        { field: 'issuetype', value: issueTypeResult.value }
      );
    }
    
    // 4. Resolve issue type - handle ID vs name differently
    let issueType: string;
    if (isIdOnlyObject(issueTypeResult.value)) {
      // Object with id only - pass through for schema lookup (original behavior)
      issueType = issueTypeResult.value.id;
    } else {
      // String or object with name - fuzzy match against createmeta
      issueType = await this.resolveIssueType(issueTypeResult.extracted, projectKey);
    }
    
    // 5. Resolve remaining fields using existing method
    // Pass resolved project/issueType in JIRA format so they're used directly
    const inputWithResolved = {
      ...input,
      // Override with resolved values in JIRA format
      [projectResult.key]: { key: projectKey },
      [issueTypeResult.key]: { name: issueType },
    };
    const fields = await this.resolveFields(projectKey, issueType, inputWithResolved);
    
    return { projectKey, issueType, fields };
  }

  /**
   * Resolves a project identifier to a canonical project key.
   * 
   * Fetches all projects from JIRA (cached for 15 min), then uses fuzzy
   * matching to find the best match by key or name.
   * 
   * @param input - Project key, name, or ID to resolve
   * @returns Canonical project key (uppercase)
   * @throws {ValidationError} If project not found
   * 
   * @private
   */
  private async resolveProject(input: string): Promise<string> {
    if (!this.client) {
      throw new ConfigurationError('JiraClient required for project resolution');
    }

    // Fetch all projects (cached)
    const projects = await this.fetchAllProjects();
    
    // Build lookup array for fuzzy matching (use key as id, name as name)
    // Also include key as an alias for matching by key
    const projectLookup = projects.flatMap(p => [
      { id: p.key, name: p.name },
      { id: p.key, name: p.key }, // Allow matching by key too
    ]);
    
    try {
      const matched = resolveUniqueName(input, projectLookup, {
        field: 'project',
        fieldName: 'Project'
      });
      return matched.id; // id is the project key
    } catch {
      // Enhance error with available projects
      const availableKeys = projects.map(p => p.key).join(', ');
      throw new ValidationError(
        `Project '${input}' not found. Available projects: ${availableKeys}`,
        { input, availableProjects: projects.map(p => ({ key: p.key, name: p.name })) }
      );
    }
  }

  /**
   * Fetches all projects from JIRA with caching.
   * 
   * @returns Array of projects with id, key, name
   * @private
   */
  private async fetchAllProjects(): Promise<Array<{ id: string; key: string; name: string }>> {
    const cacheKey = `jml:projects:${this.cache ? 'cached' : 'nocache'}`;
    
    // Check cache first
    if (this.cache) {
      try {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as Array<{ id: string; key: string; name: string }>;
        }
      } catch {
        // Cache read error - continue to fetch
      }
    }

    // Fetch from API
    const projects = await this.client!.get<Array<{ id: string; key: string; name: string }>>(
      '/rest/api/2/project'
    );
    
    // Cache for 15 minutes
    if (this.cache) {
      try {
        await this.cache.set(cacheKey, JSON.stringify(projects), 900);
      } catch {
        // Cache write error - non-critical
      }
    }

    return projects;
  }

  /**
   * Resolves an issue type identifier to a canonical issue type name.
   * 
   * Uses the createmeta endpoint for the given project, then fuzzy matches
   * against available issue types.
   * 
   * @param input - Issue type name or ID to resolve
   * @param projectKey - Resolved project key
   * @returns Canonical issue type name
   * @throws {ValidationError} If issue type not found
   * 
   * @private
   */
  private async resolveIssueType(input: string, projectKey: string): Promise<string> {
    if (!this.client) {
      throw new ConfigurationError('JiraClient required for issue type resolution');
    }

    // Fetch issue types from createmeta (already used by schema discovery)
    const issueTypesData = await this.client.get<{ values?: Array<{ id: string; name: string }> }>(
      `/rest/api/2/issue/createmeta/${projectKey}/issuetypes`
    );

    const issueTypes = issueTypesData.values || [];
    if (issueTypes.length === 0) {
      throw new ValidationError(
        `No issue types found for project '${projectKey}'`,
        { projectKey }
      );
    }

    // Build lookup for fuzzy matching
    const issueTypeLookup = issueTypes.map(it => ({ id: it.id, name: it.name }));
    
    try {
      const matched = resolveUniqueName(input, issueTypeLookup, {
        field: 'issuetype',
        fieldName: 'Issue Type'
      });
      return matched.name; // Return name for schema lookup
    } catch {
      // Enhance error with available issue types
      const availableTypes = issueTypes.map(it => it.name).join(', ');
      throw new ValidationError(
        `Issue type '${input}' not found in project '${projectKey}'. Available types: ${availableTypes}`,
        { input, projectKey, availableTypes: issueTypes.map(it => it.name) }
      );
    }
  }

  /**
   * Checks if a field name refers to the Issue Type field.
   * 
   * @param name - Field name to check
   * @returns True if this is an Issue Type field
   */
  private isIssueTypeField(name: string): boolean {
    const normalized = normalizeFieldName(name);
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
    const normalized = normalizeFieldName(name);
    const entries = Object.entries(schema.fields).map(([fieldId, field]) => ({
      fieldId,
      normalizedName: normalizeFieldName(field.name),
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
   * Discovers parent field info for the given project and issue type.
   * Returns null if parentFieldDiscovery is not configured or field not found.
   * 
   * @param projectKey - Project key
   * @param issueTypeName - Issue type name
   * @returns Parent field info or null
   */
  private async discoverParentFieldInfo(
    projectKey: string,
    issueTypeName: string
  ): Promise<ParentFieldInfo | null> {
    if (!this.parentFieldDiscovery) {
      return null;
    }
    return this.parentFieldDiscovery.getParentFieldInfo(projectKey, issueTypeName);
  }

  /**
   * Checks if a field name is a parent synonym using fuzzy matching.
   *
   * Uses dynamically discovered parent field name from JIRA (if available),
   * plus the universal "parent" keyword. Fuzzy matching handles typos like
   * "Praent Link" → "Parent Link".
   *
   * @param fieldName - Field name to check
   * @param parentFieldInfo - Discovered parent field info (null if not available)
   * @returns True if this is a parent synonym
   *
   * @example
   * ```typescript
   * // With discovered field "Parent Link"
   * isParentSynonym('Parent Link', info)  // true (exact match)
   * isParentSynonym('parent', info)       // true (universal keyword)
   * isParentSynonym('Praent Link', info)  // true (fuzzy match)
   * isParentSynonym('Container', info)    // false (different field)
   * ```
   */
  private isParentSynonym(fieldName: string, parentFieldInfo: ParentFieldInfo | null): boolean {
    // Build the list of valid parent synonyms
    const synonyms = this.buildParentSynonyms(parentFieldInfo);
    
    // Fast path: exact match (case-insensitive via normalization)
    const normalized = normalizeFieldName(fieldName);
    const exactMatch = synonyms.some(
      (synonym) => normalizeFieldName(synonym) === normalized
    );
    if (exactMatch) {
      return true;
    }
    
    // Fuzzy matching for typo tolerance
    const fuse = new Fuse(synonyms, PARENT_FUSE_OPTIONS);
    const results = fuse.search(fieldName);
    
    // Consider a match if fuzzy search finds any result
    // (threshold 0.3 is already strict enough)
    return results.length > 0;
  }

  /**
   * Builds the list of valid parent field synonyms.
   * 
   * Priority order:
   * 1. Discovered field name from JIRA (e.g., "Parent Link", "Container")
   * 2. Custom synonyms from JMLConfig.parentFieldSynonyms (if provided)
   * 3. Default synonyms from DEFAULT_PARENT_SYNONYMS (always included)
   * 
   * @param parentFieldInfo - Discovered parent field info (null if not available)
   * @returns Array of valid parent synonyms
   */
  private buildParentSynonyms(parentFieldInfo: ParentFieldInfo | null): string[] {
    const synonyms: string[] = [];
    
    // Add discovered field name (highest priority)
    if (parentFieldInfo && parentFieldInfo.name) {
      synonyms.push(parentFieldInfo.name);
    }
    
    // Add custom synonyms if configured
    if (this.customParentSynonyms) {
      for (const synonym of this.customParentSynonyms) {
        if (!synonyms.includes(synonym)) {
          synonyms.push(synonym);
        }
      }
    }
    
    // Always include default parent synonyms (e.g., "parent") as universal keywords
    for (const defaultSynonym of DEFAULT_PARENT_SYNONYMS) {
      if (!synonyms.some((s) => normalizeFieldName(s) === normalizeFieldName(defaultSynonym))) {
        synonyms.push(defaultSynonym);
      }
    }
    
    return synonyms;
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

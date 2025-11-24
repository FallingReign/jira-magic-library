/**
 * IssueType Type Converter
 * Story: E3-S07b
 * 
 * Converts issue type values for fields with type: "issuetype"
 * 
 * Accepts:
 * - String name: "Bug", "Story", "Task" (case-insensitive)
 * - Abbreviations: "story" → "User Story", "bug" → "Bug"
 * - Object with id: { id: "10001" } (passthrough)
 * - Object with name: { name: "Bug" } (resolves name)
 * - null/undefined for optional fields
 * 
 * Returns: { id: string, name: string, subtask: boolean }
 * 
 * Features:
 * - Exact match (case-insensitive)
 * - Fuzzy matching with common abbreviations
 * - Hierarchy level filtering (via JPO)
 * - Ambiguity detection (multiple matches)
 * - Caching (5-minute TTL)
 * - Silent graceful degradation (no console.warn)
 * 
 * @example
 * ```typescript
 * // By name
 * convertIssueTypeType("Bug", fieldSchema, context)
 * // → { id: "10001", name: "Bug", subtask: false }
 * 
 * // By abbreviation
 * convertIssueTypeType("story", fieldSchema, context)
 * // → { id: "10002", name: "User Story", subtask: false }
 * 
 * // By ID (passthrough)
 * convertIssueTypeType({ id: "10001" }, fieldSchema, context)
 * // → { id: "10001" }
 * 
 * // By name object
 * convertIssueTypeType({ name: "Bug" }, fieldSchema, context)
 * // → { id: "10001", name: "Bug", subtask: false }
 * ```
 */

import type { FieldConverter, GenericCache } from '../../types/converter.js';
import type { JiraIssueType } from '../../types/jira-api.js';
import type { JiraClient } from '../../client/JiraClient.js';
import type { CacheClient } from '../../types/cache.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { AmbiguityError } from '../../errors/AmbiguityError.js';
import { NotFoundError } from '../../errors/NotFoundError.js';
import { JPOHierarchyDiscovery } from '../../hierarchy/JPOHierarchyDiscovery.js';
import { resolveUniqueName } from '../../utils/resolveUniqueName.js';

/**
 * Resolved issue type information
 */
export interface ResolvedIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

/**
 * Converts issue type values to JIRA API format.
 * 
 * Implements FieldConverter interface for automatic conversion through ConverterRegistry.
 * Uses fuse.js for fuzzy matching (no hardcoded abbreviations).
 */
export const convertIssueTypeType: FieldConverter = async (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    if (fieldSchema.required) {
      throw new ValidationError(
        `Field "${fieldSchema.name}" is required`,
        { field: fieldSchema.id, value }
      );
    }
    return value;
  }

  // Handle object input with id (passthrough)
  if (typeof value === 'object' && value !== null && 'id' in value && value.id) {
    return value; // Already resolved with ID
  }

  // Extract name from object or use string value
  let name: string;
  if (typeof value === 'object' && value !== null && 'name' in value) {
    if (typeof value.name !== 'string') {
      throw new ValidationError(
        `Invalid issue type object for field "${fieldSchema.name}": name must be a string`,
        { field: fieldSchema.id, value }
      );
    }
    name = value.name;
  } else if (typeof value === 'string') {
    name = value;
  } else {
    throw new ValidationError(
      `Expected string or object for field "${fieldSchema.name}", got ${typeof value}`,
      { field: fieldSchema.id, value, type: typeof value }
    );
  }

  // Validate name is not empty
  const trimmedName = name.trim();
  if (trimmedName === '') {
    throw new ValidationError(
      `Empty string is not a valid issue type for field "${fieldSchema.name}"`,
      { field: fieldSchema.id, value }
    );
  }

  // Get required context properties
  const projectKey = context.projectKey;
  if (!projectKey) {
    throw new ValidationError(
      `projectKey is required in context for issue type resolution`,
      { field: fieldSchema.id, value }
    );
  }

  const baseUrl = context.baseUrl;
  if (!baseUrl) {
    throw new ValidationError(
      `baseUrl is required in context for issue type resolution`,
      { field: fieldSchema.id, value }
    );
  }

  const hierarchyLevel = context.hierarchyLevel;

  // Check cache
  const cacheKey = getCacheKey(baseUrl, projectKey, trimmedName, hierarchyLevel);
  if (context.cacheClient) {
    try {
      const cached = await context.cacheClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ResolvedIssueType;
      }
    } catch {
      // Cache read error - silent, continue to fetch from API
    }
  }

  // Fetch available issue types
  const issueTypes = await fetchIssueTypes(context.client as JiraClient, projectKey);

  // Apply hierarchy filtering if requested
  let candidateTypes = issueTypes;
  if (hierarchyLevel !== undefined && context.client && context.cacheClient) {
    candidateTypes = await filterByHierarchyLevel(
      issueTypes,
      hierarchyLevel,
      context.client as JiraClient,
      context.cacheClient
    );
  }

  // Try exact match first
  const exactMatches = findExactMatches(trimmedName, candidateTypes);
  if (exactMatches.length === 1 && exactMatches[0]) {
    const resolved = toResolvedType(exactMatches[0]);
    await tryCacheResult(context.cacheClient, cacheKey, resolved);
    return resolved;
  }

  if (exactMatches.length > 1) {
    throw new AmbiguityError(
      `Issue type '${trimmedName}' is ambiguous in project ${projectKey}`,
      {
        field: fieldSchema.id,
        input: trimmedName,
        candidates: exactMatches.map(it => ({ id: it.id, name: it.name })),
      }
    );
  }

  // Use fuzzy matching with fuse.js (replaces old abbreviation-based matching)
  const issueTypeLookup = candidateTypes.map(it => ({ id: it.id, name: it.name }));
  try {
    const matched = resolveUniqueName(trimmedName, issueTypeLookup, {
      field: fieldSchema.id,
      fieldName: fieldSchema.name
    });
    
    const matchedType = candidateTypes.find(it => it.id === matched.id);
    if (matchedType) {
      const resolved = toResolvedType(matchedType);
      await tryCacheResult(context.cacheClient, cacheKey, resolved);
      return resolved;
    }
  } catch (error) {
    // resolveUniqueName throws ValidationError or AmbiguityError
    // Re-throw with more context about hierarchy level if applicable
    if (error instanceof ValidationError || error instanceof AmbiguityError) {
      throw error;
    }
    throw error;
  }

  // Should not reach here (resolveUniqueName handles not found)
  const availableNames = candidateTypes.map(it => it.name).join(', ');
  const hierarchyNote = hierarchyLevel !== undefined 
    ? ` at hierarchy level ${hierarchyLevel}` 
    : '';
  
  throw new NotFoundError(
    `Issue type '${trimmedName}' not found in project ${projectKey}${hierarchyNote}. Available types: ${availableNames}`,
    { 
      field: fieldSchema.id,
      projectKey, 
      issueTypeName: trimmedName, 
      hierarchyLevel,
      availableTypes: candidateTypes.map(it => it.name) 
    }
  );
};

/**
 * Fetches available issue types for a project from JIRA API.
 * 
 * @param client - JIRA API client
 * @param projectKey - JIRA project key
 * @returns Array of issue types
 * @throws {NotFoundError} if project not found or no issue types
 */
async function fetchIssueTypes(client: JiraClient, projectKey: string): Promise<JiraIssueType[]> {
  try {
    const response: { values?: JiraIssueType[] } = await client.get(
      `/rest/api/2/issue/createmeta/${projectKey}/issuetypes`
    );

    const values = response.values;
    if (!values || values.length === 0) {
      throw new NotFoundError(
        `No issue types found for project '${projectKey}'`,
        { projectKey }
      );
    }

    return values;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new NotFoundError(
      `Failed to fetch issue types for project '${projectKey}': ${error instanceof Error ? error.message : String(error)}`,
      { projectKey }
    );
  }
}

/**
 * Filters issue types by hierarchy level using JPO data.
 * 
 * @param issueTypes - All issue types for project
 * @param hierarchyLevel - Hierarchy level to filter by
 * @param client - JIRA API client
 * @param cache - Cache client
 * @returns Filtered issue types
 */
async function filterByHierarchyLevel(
  issueTypes: JiraIssueType[],
  hierarchyLevel: number,
  client: JiraClient,
  cache: GenericCache
): Promise<JiraIssueType[]> {
  try {
    const hierarchyDiscovery = new JPOHierarchyDiscovery(client, cache as CacheClient);
    const hierarchy = await hierarchyDiscovery.getHierarchy();
    
    if (!hierarchy) {
      // JPO not available - return all issue types (graceful degradation)
      return issueTypes;
    }

    // Find the level in hierarchy
    const level = hierarchy.find(l => l.id === hierarchyLevel);
    if (!level) {
      // Invalid level - return all issue types (graceful degradation)
      return issueTypes;
    }

    // Filter issue types that belong to this level
    return issueTypes.filter(it => level.issueTypeIds.includes(it.id));
  } catch {
    // Error fetching hierarchy - continue without filtering (graceful degradation)
    return issueTypes;
  }
}

/**
 * Finds exact matches for issue type name (case-insensitive).
 * 
 * @param name - Issue type name to match
 * @param issueTypes - Available issue types
 * @returns Matching issue types
 */
function findExactMatches(name: string, issueTypes: JiraIssueType[]): JiraIssueType[] {
  const normalized = name.toLowerCase().trim();
  return issueTypes.filter(it => it.name.toLowerCase() === normalized);
}

/**
 * Converts JIRA issue type to resolved format.
 * 
 * @param issueType - JIRA issue type
 * @returns Resolved issue type
 */
function toResolvedType(issueType: JiraIssueType): ResolvedIssueType {
  return {
    id: issueType.id,
    name: issueType.name,
    subtask: issueType.subtask || false,
  };
}

/**
 * Caches a resolved issue type result.
 * 
 * @param cache - Cache client (optional)
 * @param cacheKey - Cache key
 * @param resolved - Resolved issue type
 */
async function tryCacheResult(
  cache: GenericCache | undefined,
  cacheKey: string,
  resolved: ResolvedIssueType
): Promise<void> {
  if (!cache) {
    return;
  }

  try {
    await cache.set(cacheKey, JSON.stringify(resolved), 300); // 5 minutes TTL
  } catch {
    // Cache write error - silent, non-critical failure
  }
}

/**
 * Generates cache key for issue type resolution.
 *
 * @param baseUrl - JIRA base URL
 * @param projectKey - Project key
 * @param name - Issue type name
 * @param hierarchyLevel - Optional hierarchy level
 * @returns Cache key
 */
function getCacheKey(
  baseUrl: string,
  projectKey: string,
  name: string,
  hierarchyLevel?: number
): string {
  const levelPart = hierarchyLevel !== undefined ? `:${hierarchyLevel}` : '';
  const normalizedName = name.toLowerCase().trim();
  return `jml:issuetype:${baseUrl}:${projectKey}:${normalizedName}${levelPart}`;
}

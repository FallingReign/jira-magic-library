/**
 * Parent Link Resolver - Resolves parent issues by key or summary search
 * Story: E3-S05 - Parent Link Resolver (Key or Summary Search)
 * 
 * Accepts two input formats:
 * 1. Exact issue key: "PROJ-1234" → validate and return
 * 2. Summary text: "newsroom - phase 1" → JQL search, validate hierarchy
 */

import type { JiraClient } from '../client/JiraClient.js';
import type { RedisCache } from '../cache/RedisCache.js';
import type { JPOHierarchyDiscovery } from './JPOHierarchyDiscovery.js';
import type { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import { getParentLevel, isValidParent } from './JPOHierarchyDiscovery.js';
import { NotFoundError, AmbiguityError, HierarchyError } from '../errors/index.js';

/**
 * Resolves a parent issue link from either an exact key or summary text search.
 * 
 * @param input - Either exact issue key ("PROJ-123") or summary text ("newsroom - phase 1")
 * @param childIssueTypeId - Issue type ID of the child that will have this parent
 * @param projectKey - Project key to search within
 * @param client - JIRA API client
 * @param cache - Redis cache for resolved summary→key mappings
 * @param hierarchyDiscovery - JPO hierarchy discovery service
 * @param schemaDiscovery - Schema discovery service (not used directly, for future use)
 * @returns Resolved parent issue key (uppercase)
 * @throws {NotFoundError} If issue key doesn't exist or no matches found for summary
 * @throws {AmbiguityError} If multiple issues match the summary search
 * @throws {HierarchyError} If parent is not valid for child type in hierarchy
 * 
 * @example
 * ```typescript
 * // Exact key
 * const key = await resolveParentLink('PROJ-123', '10001', 'PROJ', ...);
 * 
 * // Summary search
 * const key = await resolveParentLink('newsroom - phase 1', '10001', 'PROJ', ...);
 * ```
 */
export async function resolveParentLink(
  input: string,
  childIssueTypeId: string,
  projectKey: string,
  client: JiraClient,
  cache: RedisCache,
  hierarchyDiscovery: JPOHierarchyDiscovery,
  _schemaDiscovery: SchemaDiscovery
): Promise<string> {
  // Check if input is exact issue key format
  if (isIssueKey(input)) {
    return await resolveByKey(input, childIssueTypeId, projectKey, client, hierarchyDiscovery);
  }

  // Search by summary
  return await resolveBySummary(
    input,
    childIssueTypeId,
    projectKey,
    client,
    cache,
    hierarchyDiscovery
  );
}

/**
 * Resolves parent by exact issue key.
 * 
 * @param key - Issue key (e.g., "PROJ-123")
 * @param childIssueTypeId - Child's issue type ID
 * @param projectKey - Project key
 * @param client - JIRA API client
 * @param hierarchyDiscovery - Hierarchy discovery service
 * @returns Uppercase issue key
 * @throws {NotFoundError} If issue doesn't exist
 * @throws {HierarchyError} If parent is not valid for child type
 */
async function resolveByKey(
  key: string,
  childIssueTypeId: string,
  _projectKey: string, // Reserved for future project-specific validation
  client: JiraClient,
  hierarchyDiscovery: JPOHierarchyDiscovery
): Promise<string> {
  // Fetch issue from JIRA to validate it exists
  const issue = await client.get<{
    key: string;
    fields: {
      issuetype: { id: string; name: string };
      summary: string;
    };
  }>(`/rest/api/2/issue/${key}`);

  const parentIssueTypeId = issue.fields.issuetype.id;
  const parentIssueTypeName = issue.fields.issuetype.name;

  // Get hierarchy to validate parent-child relationship
  const hierarchy = await hierarchyDiscovery.getHierarchy();

  if (!hierarchy || hierarchy.length === 0) {
    throw new HierarchyError(
      `Cannot validate parent hierarchy: JPO hierarchy not available`,
      { childIssueTypeId, parentIssueTypeId }
    );
  }

  // Validate parent is exactly 1 level above child
  const valid = isValidParent(childIssueTypeId, parentIssueTypeId, hierarchy);

  if (!valid) {
    throw new HierarchyError(
      `Issue ${key} (${parentIssueTypeName}) is not a valid parent for issue type ${childIssueTypeId}`,
      { parentKey: key, parentIssueTypeId, childIssueTypeId }
    );
  }

  return key.toUpperCase();
}

/**
 * Resolves parent by summary text search using JQL.
 * 
 * @param summaryText - Summary text to search for
 * @param childIssueTypeId - Child's issue type ID
 * @param projectKey - Project key
 * @param client - JIRA API client
 * @param cache - Redis cache
 * @param hierarchyDiscovery - Hierarchy discovery service
 * @returns Resolved parent issue key
 * @throws {NotFoundError} If no matches found
 * @throws {AmbiguityError} If multiple matches found
 * @throws {HierarchyError} If no valid parent types available
 */
async function resolveBySummary(
  summaryText: string,
  childIssueTypeId: string,
  projectKey: string,
  client: JiraClient,
  cache: RedisCache,
  hierarchyDiscovery: JPOHierarchyDiscovery
): Promise<string> {
  // Normalize summary for cache key (lowercase, trim)
  const normalizedSummary = summaryText.trim().toLowerCase();

  // Check cache first
  const cacheKey = `parent-link:${projectKey}:${normalizedSummary}`;
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  } catch {
    // Cache error - continue to API
  }

  // Get hierarchy to determine valid parent level
  const hierarchy = await hierarchyDiscovery.getHierarchy();

  if (!hierarchy || hierarchy.length === 0) {
    throw new HierarchyError(
      `Cannot search for parent: JPO hierarchy not available`,
      { childIssueTypeId, summaryText }
    );
  }

  // Get valid parent level for child type
  const parentLevel = getParentLevel(childIssueTypeId, hierarchy);

  if (!parentLevel) {
    throw new HierarchyError(
      `Issue type ${childIssueTypeId} has no valid parent level in hierarchy`,
      { childIssueTypeId }
    );
  }

  // Get valid parent issue type IDs
  const validParentTypeIds = parentLevel.issueTypeIds;

  if (validParentTypeIds.length === 0) {
    throw new HierarchyError(
      `No valid parent issue types available for issue type ${childIssueTypeId}`,
      { childIssueTypeId, parentLevel: parentLevel.id }
    );
  }

  // Build JQL search query
  // Note: Using ~ operator for text search (case-insensitive phrase matching)
  const jql = `project = ${projectKey} AND summary ~ "${summaryText}" AND issuetype IN (${validParentTypeIds.join(',')})`;

  // Execute search
  const results = await client.post<{
    total: number;
    issues: Array<{
      key: string;
      fields: {
        summary: string;
        issuetype: { id: string; name: string };
      };
    }>;
  }>('/rest/api/2/search', {
    jql,
    fields: ['summary', 'issuetype', 'key'],
    maxResults: 10, // Limit to 10 to detect ambiguity
  });

  // Handle no matches
  if (results.total === 0) {
    throw new NotFoundError(
      `No parent found matching '${summaryText}' in project ${projectKey}`,
      { summaryText, projectKey, validParentTypeIds }
    );
  }

  // Handle multiple matches (ambiguity)
  if (results.total > 1) {
    const candidates = results.issues.map(
      (issue) => `${issue.key} (${issue.fields.issuetype.name}: "${issue.fields.summary}")`
    );

    throw new AmbiguityError(
      `Multiple parents match '${summaryText}': ${candidates.join(', ')}. Please use exact key or more specific summary.`,
      {
        field: 'parent',
        input: summaryText,
        candidates: results.issues.map((issue) => ({
          id: issue.key,
          name: issue.fields.summary,
          issueType: issue.fields.issuetype.name,
        })),
      }
    );
  }

  // Single match - return key and cache it
  const resolvedKey = results.issues[0]!.key;

  // Cache the result (5 minute TTL)
  try {
    await cache.set(cacheKey, resolvedKey, 300);
  } catch {
    // Cache error - don't fail, just log
  }

  return resolvedKey;
}

/**
 * Checks if input matches issue key format.
 * 
 * Format: PROJECT-123 (case-insensitive)
 * - Project key: 1+ uppercase letters
 * - Hyphen separator
 * - Issue number: 1+ digits
 * 
 * @param input - Input string to check
 * @returns True if matches issue key format
 */
function isIssueKey(input: string): boolean {
  return /^[A-Z]+-[0-9]+$/i.test(input);
}

/**
 * Parent Link Resolver - Resolves parent issues by key or summary search
 * Story: E3-S05 - Parent Link Resolver (Key or Summary Search)
 * 
 * Accepts two input formats:
 * 1. Exact issue key: "PROJ-1234" → validate exists, return
 * 2. Summary text: "apartment - phase 1" → Smart endpoint search based on parent field plugin
 * 
 * Smart Resolution Strategy:
 * - GreenHopper (gh-epic-link): Uses /rest/greenhopper/1.0/epics endpoint
 * - JPO (jpo-custom-field-parent): Uses /rest/jpo/1.0/parent/suggest endpoint
 * - Standard/Fallback: Uses JQL search
 */

import type { JiraClient } from '../client/JiraClient.js';
import type { RedisCache } from '../cache/RedisCache.js';
import type { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import { NotFoundError, AmbiguityError } from '../errors/index.js';
import { PARENT_FIELD_PLUGINS } from '../constants/field-constants.js';

/** GreenHopper Epic Link plugin ID */
const GREENHOPPER_PLUGIN = PARENT_FIELD_PLUGINS[0]; // 'com.pyxis.greenhopper.jira:gh-epic-link'
/** JPO Parent Link plugin ID */
const JPO_PLUGIN = PARENT_FIELD_PLUGINS[1]; // 'com.atlassian.jpo:jpo-custom-field-parent'

/** Cache TTL for resolved parent links (5 minutes) */
const CACHE_TTL_SECONDS = 300;

/**
 * Resolves a parent issue link from either an exact key or summary text search.
 * 
 * Uses smart endpoints based on the parent field plugin type:
 * - GreenHopper (Epic Link): `/rest/greenhopper/1.0/epics?searchQuery=X`
 * - JPO (Parent Link): `/rest/jpo/1.0/parent/suggest`
 * - Unknown/Standard: JQL search fallback
 * 
 * @param input - Either exact issue key ("PROJ-123") or summary text ("apartment - phase 1")
 * @param childIssueTypeName - Issue type name of the child (used for JPO suggest)
 * @param projectKey - Project key to search within (used for weighting results)
 * @param client - JIRA API client
 * @param cache - Redis cache for resolved summary→key mappings
 * @param plugin - Parent field plugin ID (determines which endpoint to use)
 * @param _schemaDiscovery - Schema discovery service (kept for API compatibility)
 * @returns Resolved parent issue key (uppercase)
 * @throws {NotFoundError} If issue key doesn't exist or no matches found for summary
 * @throws {AmbiguityError} If multiple issues match the summary search
 * 
 * @example
 * ```typescript
 * // Exact key - just validates existence
 * const key = await resolveParentLink('PROJ-123', 'Story', 'PROJ', client, cache, 'gh-epic-link');
 * 
 * // Summary search with GreenHopper plugin
 * const key = await resolveParentLink('apartment - phase 1', 'Story', 'PROJ', client, cache, 'gh-epic-link');
 * 
 * // Summary search with JPO plugin
 * const key = await resolveParentLink('my super epic', 'Epic', 'PROJ', client, cache, 'jpo-custom-field-parent');
 * ```
 */
export async function resolveParentLink(
  input: string,
  childIssueTypeName: string,
  projectKey: string,
  client: JiraClient,
  cache: RedisCache,
  plugin: string | undefined,
  _schemaDiscovery: SchemaDiscovery
): Promise<string> {
  // Check if input is exact issue key format
  if (isIssueKey(input)) {
    return await resolveByKey(input, client);
  }

  // Search by summary using smart endpoint based on plugin type
  return await resolveBySummary(
    input,
    childIssueTypeName,
    projectKey,
    client,
    cache,
    plugin
  );
}

/**
 * Resolves parent by exact issue key.
 * 
 * Simply validates the issue exists and returns the key.
 * No hierarchy validation - let JIRA validate on create.
 * 
 * @param key - Issue key (e.g., "PROJ-123")
 * @param client - JIRA API client
 * @returns Uppercase issue key
 * @throws {NotFoundError} If issue doesn't exist
 */
async function resolveByKey(
  key: string,
  client: JiraClient
): Promise<string> {
  // Fetch issue from JIRA to validate it exists
  // This will throw NotFoundError (via 404) if issue doesn't exist
  await client.get<{ key: string }>(`/rest/api/2/issue/${key}?fields=key`);

  return key.toUpperCase();
}

/**
 * Resolves parent by summary text search.
 * 
 * Routes to the appropriate endpoint based on plugin type:
 * - GreenHopper: /rest/greenhopper/1.0/epics (for Epic Link fields)
 * - JPO: /rest/jpo/1.0/parent/suggest (for Parent Link fields)
 * - Fallback: JQL search (for unknown or standard fields)
 * 
 * @param summaryText - Summary text to search for
 * @param childIssueTypeName - Child issue type name (for JPO suggest)
 * @param projectKey - Project key (for weighting and fallback)
 * @param client - JIRA API client
 * @param cache - Redis cache
 * @param plugin - Parent field plugin ID
 * @returns Resolved parent issue key
 * @throws {NotFoundError} If no matches found
 * @throws {AmbiguityError} If multiple matches found (with same weight)
 */
async function resolveBySummary(
  summaryText: string,
  childIssueTypeName: string,
  projectKey: string,
  client: JiraClient,
  cache: RedisCache,
  plugin: string | undefined
): Promise<string> {
  // Normalize summary for cache key (lowercase, trim)
  const normalizedSummary = summaryText.trim().toLowerCase();

  // Check cache first
  const cacheKey = `parent-link:${projectKey}:${normalizedSummary}`;
  try {
    const result = await cache.get(cacheKey);
    if (result.value) {
      return result.value;
    }
  } catch {
    // Cache error - continue to API
  }

  let resolvedKey: string;

  // Route to appropriate endpoint based on plugin
  if (plugin === GREENHOPPER_PLUGIN) {
    resolvedKey = await resolveByGreenHopper(summaryText, projectKey, client);
  } else if (plugin === JPO_PLUGIN) {
    resolvedKey = await resolveByJPOSuggest(summaryText, childIssueTypeName, projectKey, client);
  } else {
    // Fallback to JQL search for unknown plugins or standard parent field
    resolvedKey = await resolveByJQL(summaryText, projectKey, client);
  }

  // Cache the result
  try {
    await cache.set(cacheKey, resolvedKey, CACHE_TTL_SECONDS);
  } catch {
    // Cache error - don't fail, just log
  }

  return resolvedKey;
}

/**
 * GreenHopper Epic response structure
 */
interface GreenHopperEpicsResponse {
  epicLists?: Array<{
    listDescriptor: string;
    epicNames: Array<{
      key: string;
      name: string;
      isDone: boolean;
    }>;
  }>;
  total: number;
}

/**
 * Resolves parent using GreenHopper epics endpoint.
 * 
 * This endpoint is specific to Epic Link fields and returns only Epics,
 * making it ideal for Task/Story/Bug → Epic relationships.
 * 
 * @param summaryText - Summary text to search for
 * @param projectKey - Project key to search within
 * @param client - JIRA API client
 * @returns Resolved epic key
 * @throws {NotFoundError} If no epics match
 * @throws {AmbiguityError} If multiple epics match with same weight
 */
async function resolveByGreenHopper(
  summaryText: string,
  projectKey: string,
  client: JiraClient
): Promise<string> {
  const response = await client.get<GreenHopperEpicsResponse>(
    `/rest/greenhopper/1.0/epics?searchQuery=${encodeURIComponent(summaryText)}&projectKey=${projectKey}&maxResults=10&hideDone=false`
  );

  // Flatten epic names from all lists
  const allEpics = response.epicLists?.flatMap(list => list.epicNames) ?? [];

  if (allEpics.length === 0) {
    throw new NotFoundError(
      `No epic found matching '${summaryText}' in project ${projectKey}`,
      { summaryText, projectKey }
    );
  }

  // Weight by project match and exact name match
  const weighted = weightResults(
    allEpics.map(e => ({ key: e.key, summary: e.name })),
    projectKey,
    summaryText
  );

  // Check for ambiguity - if top two have same weight
  const top = weighted[0];
  const second = weighted[1];
  if (top && second && top.weight === second.weight) {
    throw new AmbiguityError(
      `Multiple epics match '${summaryText}': ${weighted.slice(0, 5).map(e => `${e.key} ("${e.summary}")`).join(', ')}. Please use exact key or more specific summary.`,
      {
        field: 'parent',
        input: summaryText,
        candidates: weighted.slice(0, 5).map(e => ({ id: e.key, name: e.summary })),
      }
    );
  }

  // top is guaranteed to exist since we checked allEpics.length > 0 above
  return top!.key;
}

/**
 * JPO parent suggest response structure
 */
interface JPOParentSuggestResponse {
  issues: Array<{
    issueKey: number; // Numeric issue ID, not the full key!
    issueSummary: string;
    issueTypeId: number;
    projectId: number;
  }>;
  projects: Array<{
    id: number;
    key: string;
  }>;
  issueTypes?: Array<{
    id: string;
    iconUrl: string;
  }>;
}

/**
 * Resolves parent using JPO parent suggest endpoint.
 * 
 * This endpoint is specific to Parent Link fields and returns valid parents
 * based on the JPO hierarchy configuration for the given child issue type.
 * 
 * Note: This endpoint returns cross-project results, which we weight by
 * preferring the current project.
 * 
 * @param summaryText - Summary text to search for
 * @param childIssueTypeName - Child issue type name (JPO uses this to determine valid parents)
 * @param projectKey - Project key (for weighting results)
 * @param client - JIRA API client
 * @returns Resolved parent key
 * @throws {NotFoundError} If no parents match
 * @throws {AmbiguityError} If multiple parents match with same weight
 */
async function resolveByJPOSuggest(
  summaryText: string,
  childIssueTypeName: string,
  projectKey: string,
  client: JiraClient
): Promise<string> {
  const response = await client.post<JPOParentSuggestResponse>(
    '/rest/jpo/1.0/parent/suggest',
    {
      query: summaryText,
      issueTypeName: childIssueTypeName,
      maxResults: 10,
    }
  );

  if (!response.issues || response.issues.length === 0) {
    throw new NotFoundError(
      `No parent found matching '${summaryText}' for issue type ${childIssueTypeName}`,
      { summaryText, childIssueTypeName, projectKey }
    );
  }

  // Build project ID → key map
  const projectMap = new Map(response.projects.map(p => [p.id, p.key]));

  // Convert to full issue keys
  const issues = response.issues.map(issue => ({
    key: `${projectMap.get(issue.projectId) ?? '???'}-${issue.issueKey}`,
    summary: issue.issueSummary,
    projectKey: projectMap.get(issue.projectId) ?? '???',
  }));

  // Weight by project match and exact name match
  const weighted = weightResults(issues, projectKey, summaryText);

  // Check for ambiguity - if top two have same weight
  const top = weighted[0];
  const second = weighted[1];
  if (top && second && top.weight === second.weight) {
    throw new AmbiguityError(
      `Multiple parents match '${summaryText}': ${weighted.slice(0, 5).map(e => `${e.key} ("${e.summary}")`).join(', ')}. Please use exact key or more specific summary.`,
      {
        field: 'parent',
        input: summaryText,
        candidates: weighted.slice(0, 5).map(e => ({ id: e.key, name: e.summary })),
      }
    );
  }

  // top is guaranteed to exist since we checked response.issues.length > 0 above
  return top!.key;
}

/**
 * Fallback resolution using JQL search.
 * 
 * Used when:
 * - Plugin is unknown/undefined
 * - Standard parent field (subtasks)
 * - Smart endpoint fails (fallback)
 * 
 * This search is less precise as it doesn't filter by issue type.
 * 
 * @param summaryText - Summary text to search for
 * @param projectKey - Project key to search within
 * @param client - JIRA API client
 * @returns Resolved issue key
 * @throws {NotFoundError} If no matches found
 * @throws {AmbiguityError} If multiple matches found
 */
async function resolveByJQL(
  summaryText: string,
  projectKey: string,
  client: JiraClient
): Promise<string> {
  // Build JQL search query - search within project, match summary
  const jql = `project = ${projectKey} AND summary ~ "${escapeSummaryForJQL(summaryText)}"`;

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
    maxResults: 10,
  });

  if (results.total === 0) {
    throw new NotFoundError(
      `No issue found matching '${summaryText}' in project ${projectKey}`,
      { summaryText, projectKey }
    );
  }

  // Weight by exact name match (project is already filtered)
  const weighted = weightResults(
    results.issues.map(i => ({ key: i.key, summary: i.fields.summary })),
    projectKey,
    summaryText
  );

  // Check for ambiguity - if top two have same weight
  const top = weighted[0];
  const second = weighted[1];
  if (top && second && top.weight === second.weight) {
    throw new AmbiguityError(
      `Multiple issues match '${summaryText}': ${weighted.slice(0, 5).map(e => `${e.key} ("${e.summary}")`).join(', ')}. Please use exact key or more specific summary.`,
      {
        field: 'parent',
        input: summaryText,
        candidates: weighted.slice(0, 5).map(e => ({ id: e.key, name: e.summary })),
      }
    );
  }

  // top is guaranteed to exist since we checked results.total > 0 above
  return top!.key;
}

/**
 * Result with weight for sorting
 */
interface WeightedResult {
  key: string;
  summary: string;
  weight: number;
}

/**
 * Weight results by project match and summary match.
 * 
 * Weighting:
 * - Same project: +100 weight
 * - Exact summary match (case-insensitive): +50 weight
 * - Summary starts with search: +25 weight
 * 
 * Higher weight = better match.
 * 
 * @param results - Results to weight
 * @param preferredProjectKey - Project key to prefer
 * @param searchText - Original search text for matching
 * @returns Sorted results with weights (highest first)
 */
function weightResults(
  results: Array<{ key: string; summary: string; projectKey?: string }>,
  preferredProjectKey: string,
  searchText: string
): WeightedResult[] {
  const searchLower = searchText.trim().toLowerCase();

  const weighted = results.map(result => {
    let weight = 0;

    // Project match bonus
    const resultProject = result.projectKey ?? result.key.split('-')[0];
    if (resultProject?.toUpperCase() === preferredProjectKey.toUpperCase()) {
      weight += 100;
    }

    // Exact summary match bonus
    const summaryLower = result.summary.toLowerCase();
    if (summaryLower === searchLower) {
      weight += 50;
    } else if (summaryLower.startsWith(searchLower)) {
      weight += 25;
    }

    return { key: result.key, summary: result.summary, weight };
  });

  // Sort by weight descending
  return weighted.sort((a, b) => b.weight - a.weight);
}

/**
 * Escapes special characters for JQL summary search.
 * 
 * @param text - Text to escape
 * @returns Escaped text safe for JQL
 */
function escapeSummaryForJQL(text: string): string {
  // Escape quotes and backslashes for JQL string
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

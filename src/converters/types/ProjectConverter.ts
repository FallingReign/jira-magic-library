/**
 * Project Type Converter
 * Story: E3-S08
 * 
 * Converts project values for fields with type: "project"
 * 
 * Accepts:
 * - String key: "PROJ", "DEMO", "TEST" (uppercase, validated)
 * - String name: "My Project", "Demo Project" (case-insensitive)
 * - Object with key: { key: "PROJ" } (passthrough)
 * - Object with name: { name: "My Project" } (resolves name)
 * - null/undefined for optional fields
 * 
 * Returns: { key: string } (JIRA format)
 * 
 * Features:
 * - Key vs name resolution
 * - Case-insensitive name matching
 * - Ambiguity detection (duplicate names)
 * - Caching (15-minute TTL)
 * - Silent graceful degradation (no console.warn)
 * - Performance: Try key first (single API call) before fetching all projects
 * 
 * @example
 * ```typescript
 * // By key (fast - single API call)
 * convertProjectType("PROJ", fieldSchema, context)
 * // → { key: "PROJ" }
 * 
 * // By name (requires fetching all projects)
 * convertProjectType("My Project", fieldSchema, context)
 * // → { key: "PROJ" }
 * 
 * // By key object (passthrough)
 * convertProjectType({ key: "PROJ" }, fieldSchema, context)
 * // → { key: "PROJ" }
 * 
 * // By name object (resolves to key)
 * convertProjectType({ name: "My Project" }, fieldSchema, context)
 * // → { key: "PROJ" }
 * ```
 */

import type { FieldConverter, ConversionContext } from '../../types/converter.js';
import type { JiraClient } from '../../client/JiraClient.js';
import type { CacheClient } from '../../types/cache.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { resolveUniqueName } from '../../utils/resolveUniqueName.js';
import { extractFieldValue } from '../../utils/extractFieldValue.js';

/**
 * JIRA project object from API
 */
interface JiraProject {
  id: string;
  key: string;
  name: string;
}

/**
 * Project object format that JIRA accepts
 */
interface ProjectValue {
  key: string;
}

/**
 * Converts project values to JIRA API format.
 * 
 * Implements FieldConverter interface for automatic conversion through ConverterRegistry.
 */
export const convertProjectType: FieldConverter = async (value, fieldSchema, context) => {
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

  // Extract value from JIRA API object formats (e.g., { name: "My Project" })
  // Returns unchanged if already id/accountId/key, or complex/nested structure
  value = extractFieldValue(value);

  // Handle object input with key (passthrough)
  if (typeof value === 'object' && value !== null && 'key' in value && value.key) {
    return { key: value.key }; // Already resolved with key
  }

  // Must be string at this point
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Invalid project value for field "${fieldSchema.name}": expected string or object, got ${typeof value}`,
      { field: fieldSchema.id, value, type: typeof value }
    );
  }

  const keyOrName = value.trim();

  // Check cache first
  const cache = context.cache as CacheClient | undefined;
  // istanbul ignore next - baseUrl is always provided in practice
  const cacheKey = getCacheKey(context.baseUrl || '', keyOrName);
  const cached = await tryGetCache(cache, cacheKey);
  if (cached) {
    return cached as ProjectValue;
  }

  // Try as key first (faster - single API call)
  if (looksLikeProjectKey(keyOrName)) {
    try {
      const project = await fetchProjectByKey(context, keyOrName);
      const result = { key: project.key };
      await tryCacheResult(cache, cacheKey, result, 900); // 15 min
      return result;
    } catch (error: unknown) {
      // Check if 404 error (key not found)
      const is404 = typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
      if (!is404) {
        // Re-throw non-404 errors (network errors, auth errors, etc.)
        throw error;
      }
      // Fall through to try as name if 404
    }
  }

  // Try as name (requires fetching all projects)
  // istanbul ignore next - baseUrl is always provided in practice
  const projects = await fetchAllProjects(context, cache, context.baseUrl || '');
  
  // Use fuzzy matching for project names
  const projectLookup = projects.map(p => ({ id: p.key, name: p.name }));
  const matched = resolveUniqueName(keyOrName, projectLookup, {
    field: fieldSchema.id,
    fieldName: fieldSchema.name
  });

  const result = { key: matched.id }; // id is actually the project key
  await tryCacheResult(cache, cacheKey, result, 900);
  return result;
};

/**
 * Checks if value looks like a project key (uppercase letters + optional numbers)
 */
function looksLikeProjectKey(value: string): boolean {
  return /^[A-Z][A-Z0-9]{0,10}$/.test(value.trim());
}

async function resolveProjectGetEndpoint(context: ConversionContext, key: string): Promise<string> {
  if (context.endpointResolverFn) {
    try {
      const resolver = await context.endpointResolverFn();
      return resolver.projectGet(key);
    } catch {
      // Fall back to Server/DC default when auto-detection is unavailable
    }
  }
  return `/rest/api/2/project/${key}`;
}

async function resolveProjectListEndpoint(context: ConversionContext): Promise<string> {
  if (context.endpointResolverFn) {
    try {
      const resolver = await context.endpointResolverFn();
      return resolver.projectList();
    } catch {
      // Fall back to Server/DC default when auto-detection is unavailable
    }
  }
  return '/rest/api/2/project';
}

/**
 * Fetches project by key from JIRA API
 */
async function fetchProjectByKey(context: ConversionContext, key: string): Promise<JiraProject> {
  const endpoint = await resolveProjectGetEndpoint(context, key);
  return await (context.client as JiraClient).get(endpoint);
}

/**
 * Fetches all projects from JIRA API, with caching
 */
async function fetchAllProjects(
  context: ConversionContext,
  cache: CacheClient | undefined,
  baseUrl: string
): Promise<JiraProject[]> {
  // Check cache first
  const cacheKey = `jml:projects:${baseUrl}`;
  const cached = await tryGetCache(cache, cacheKey);
  if (cached) {
    return cached as JiraProject[];
  }

  // Fetch from API
  const endpoint = await resolveProjectListEndpoint(context);
  const response = await (context.client as JiraClient).get<JiraProject[] | { values?: JiraProject[] }>(endpoint);
  const projects = Array.isArray(response) ? response : (response.values ?? []);
  await tryCacheResult(cache, cacheKey, projects, 900); // 15 min
  return projects;
}

/**
 * Generates cache key for project lookup
 */
function getCacheKey(baseUrl: string, keyOrName: string): string {
  return `jml:project:${baseUrl}:${keyOrName.toLowerCase()}`;
}

/**
 * Attempts to retrieve value from cache, returns null on failure (graceful degradation)
 */
async function tryGetCache(cache: CacheClient | undefined, key: string): Promise<unknown> {
  if (!cache) return null;
  
  try {
    const result = await cache.get(key);
    return result.value ? JSON.parse(result.value) : null;
  } catch {
    return null; // Silent failure - graceful degradation
  }
}

/**
 * Attempts to cache result, silent failure on error (non-critical)
 */
async function tryCacheResult(
  cache: CacheClient | undefined,
  key: string,
  value: unknown,
  ttl: number
): Promise<void> {
  if (!cache) return;
  
  try {
    await cache.set(key, JSON.stringify(value), ttl);
  } catch {
    // Silent failure - non-critical
  }
}

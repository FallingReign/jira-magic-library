import { FieldSchema } from './schema.js';

// Re-export FieldSchema for converter implementations
export type { FieldSchema };

/**
 * Minimal registry interface to avoid circular dependency
 */
export interface ConverterRegistryLike {
  get(type: string): FieldConverter | undefined;
  getTypes(): string[];
}

/**
 * Result from getLookup - includes staleness info for stale-while-revalidate
 */
export interface LookupCacheResult {
  /** The cached value, or null if not found */
  value: unknown[] | null;
  /** True if the value exists but is past its soft expiry (stale) */
  isStale: boolean;
}

/**
 * Minimal cache interface for lookup converters
 */
export interface LookupCache {
  getLookup(projectKey: string, fieldType: string, issueType?: string): Promise<LookupCacheResult>;
  setLookup(projectKey: string, fieldType: string, data: unknown[], issueType?: string): Promise<void>;
  
  /**
   * Execute a refresh function with deduplication
   * 
   * If a refresh is already in progress for this key, returns the existing
   * promise instead of starting a new one. This prevents duplicate API calls
   * when multiple stale cache hits occur for the same data.
   * 
   * @param key Unique key identifying this refresh operation
   * @param refreshFn Async function that fetches fresh data and updates cache
   * @returns Promise that resolves when refresh is complete
   */
  refreshOnce(key: string, refreshFn: () => Promise<void>): Promise<void>;
}

/**
 * Minimal generic cache interface for converters
 */
export interface GenericCache {
  get(key: string): Promise<{ value: string | null; isStale: boolean }>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/**
 * Context provided to field converters during conversion
 */
export interface ConversionContext {
  /** JIRA project key (e.g., "ENG") */
  projectKey: string;

  /** Issue type name (e.g., "Bug", "Task") */
  issueType: string;

  /** JIRA base URL (for cache keys and API calls) */
  baseUrl?: string;

  /** Hierarchy level (0=subtask, 1=story, 2=epic) for filtering issue types */
  hierarchyLevel?: number;

  /** Converter registry (for array converter to look up item converters) */
  registry?: ConverterRegistryLike;

  /** Lookup cache (for priority, user, component, version converters) */
  cache?: LookupCache;

  /** Generic cache (for issue type converter) */
  cacheClient?: GenericCache;

  /** JIRA HTTP client (for user converter to query user API) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any; // Use 'any' to avoid circular dependency with JiraClient

  /** JML configuration (for converter customization like abbreviations, synonyms) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any; // Use 'any' to avoid circular dependency with JMLConfig
}

/**
 * Function that converts a user-provided value to JIRA's expected format
 * 
 * @param value - User-provided value (any type)
 * @param fieldSchema - Schema information for the field
 * @param context - Conversion context (project, issue type)
 * @returns Converted value in JIRA's expected format
 * 
 * @example
 * ```typescript
 * // String converter
 * const convertString: FieldConverter = (value) => {
 *   if (value === null || value === undefined) return '';
 *   return String(value).trim();
 * };
 * 
 * // Priority converter (Epic 2)
 * const convertPriority: FieldConverter = async (value, fieldSchema) => {
 *   const priority = await lookupPriority(String(value));
 *   return { id: priority.id };
 * };
 * ```
 */
export type FieldConverter = (
  value: unknown,
  fieldSchema: FieldSchema,
  context: ConversionContext
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
) => unknown | Promise<unknown>;

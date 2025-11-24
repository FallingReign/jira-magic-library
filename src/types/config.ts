/**
 * Configuration types for JIRA Magic Library
 */

/**
 * Available ambiguity handling strategies for lookup-based converters.
 */
export type AmbiguityPolicy = 'first' | 'error' | 'score';

/**
 * Fine-grained ambiguity policy configuration.
 */
export interface AmbiguityPolicyConfig {
  /**
   * Policy for resolving ambiguous user lookups.
   * - `first` (default): return the first candidate JIRA provides
   * - `error`: throw AmbiguityError (legacy behavior)
   * - `score`: pick the highest-confidence candidate deterministically
   */
  user?: AmbiguityPolicy;
}

/**
 * Main configuration interface for the JIRA Magic Library
 */
export interface JMLConfig {
  /** Base URL of the JIRA instance (e.g., "https://jira.company.com") */
  baseUrl: string;

  /** Authentication configuration */
  auth: {
    /** Personal Access Token (PAT) for authentication */
    token: string;
  };

  /** JIRA API version to use */
  apiVersion?: 'v2' | 'v3';

  /** Redis connection configuration */
  redis?: RedisConfig;

  /** Cache configuration */
  cache?: {
    /** Cache time-to-live in seconds */
    ttlSeconds?: number;
  };

  /** Enable debug logging (HTTP requests, cache operations, etc.) */
  debug?: boolean;

  /** 
   * Custom abbreviations for issue type resolution (E3-S07b AC8)
   * @example { 'defect': ['bug'], 'feature': ['story', 'user story'] }
   */
  issueTypeAbbreviations?: Record<string, string[]>;

  /**
   * Custom synonyms for parent field names (E3-S07b AC9)
   * @example ['Superior', 'ParentTask', 'Owner']
   * Default: ['Parent', 'Parent Link', 'Epic Link', 'Portfolio Parent']
   */
  parentFieldSynonyms?: string[];

  /**
   * Optional ambiguity policy overrides for lookup converters.
   * Defaults applied per converter if not provided.
   */
  ambiguityPolicy?: AmbiguityPolicyConfig;
}

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  /** Redis server hostname */
  host?: string;
  /** Redis server port */
  port?: number;
  /** Optional Redis password */
  password?: string;
}

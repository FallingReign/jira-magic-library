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

  /**
   * Policy for resolving ambiguous parent references (E4-S13 AC7).
   * Applies only when summary search in JIRA returns multiple matches.
   * - `error` (default): throw AmbiguityError if multiple matches
   * - `first`: use first match from JIRA search results
   * - `score`: rank matches by relevance (exact match, issue type, project, recency)
   */
  parent?: AmbiguityPolicy;
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
   * Custom synonyms for parent field names (E3-S07b AC9)
   * 
   * These patterns are used for:
   * 1. Schema discovery - finding parent fields in JIRA when plugin detection fails
   * 2. Input recognition - additional keywords users can use besides the discovered field name
   * 
   * The library automatically discovers the actual parent field name from JIRA 
   * (e.g., "Parent Link", "Container", "Epic Link") and uses that for input matching.
   * The "parent" keyword always works. This config adds additional patterns.
   * 
   * @example ['Superior', 'Initiative', 'Portfolio Item']
   * @default ['parent'] - The universal "parent" keyword
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

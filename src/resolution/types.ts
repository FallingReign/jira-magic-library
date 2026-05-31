/**
 * Resolution Layer Types
 *
 * Types for the resolution APIs that convert human-friendly text
 * into JIRA IDs (users, field options, priorities, statuses, etc.)
 */

/**
 * A resolved JIRA user identity.
 * Cloud returns accountId; Server returns name (username).
 */
export interface ResolvedUser {
  /** Cloud user identifier */
  accountId?: string;
  /** Server username */
  name?: string;
  /** Display name (always present) */
  displayName: string;
  /** Email address if available */
  emailAddress?: string;
  /** Whether the user is active */
  active: boolean;
  /** Confidence of the match (0-1) */
  confidence: number;
}

/**
 * Options for user resolution/search.
 */
export interface UserResolveOptions {
  /** Max results for search (default 10) */
  maxResults?: number;
  /** Only active users (default true) */
  activeOnly?: boolean;
}

/**
 * A resolved select/multiselect field option.
 */
export interface ResolvedOption {
  /** Option ID */
  id: string;
  /** Display value */
  value: string;
  /** Confidence of the match (0-1) */
  confidence: number;
}

/**
 * A resolved entity (priority, status, component, version).
 */
export interface ResolvedEntity {
  /** Entity ID */
  id: string;
  /** Entity name */
  name: string;
  /** Entity type */
  type: 'priority' | 'status' | 'component' | 'version';
  /** Confidence of the match (0-1) */
  confidence: number;
}

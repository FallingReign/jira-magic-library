/**
 * Bulk operations types
 * Story: E4-S02
 */

/**
 * Payload for a single issue in bulk creation
 */
export interface BulkIssuePayload {
  fields: Record<string, unknown>;
}

/** Validation results contain prepared requests, never creation results or a stored manifest. */
export interface BulkValidationResult {
  validation: true;
  valid: boolean;
  total: number;
  results: Array<{
    index: number;
    valid: boolean;
    payload?: BulkIssuePayload;
    error?: string;
    /** Parent rows whose real Jira keys will only be available during creation. */
    dependencies: Array<{ field: string; uid: string; index: number }>;
  }>;
}

/**
 * Manifest tracking bulk operation results
 *
 * Structure aligns with E4-S03 JIRA bulk API response format for zero-conversion storage.
 */
export interface BulkManifest {
  /** Unique manifest ID (format: bulk-{uuid}) */
  id: string;
  
  /** Creation timestamp (milliseconds since epoch) */
  timestamp: number;
  
  /** Total number of rows processed */
  total: number;
  
  /** Array of row indices that succeeded */
  succeeded: number[];
  
  /** Array of row indices that failed */
  failed: number[];

  /** Rows whose create outcome could not be safely matched to the response */
  notConfirmed?: number[];

  /**
   * Rows that were never sent because an earlier request threw.
   * They were definitely not created and are safe to resend (retry includes them).
   */
  notSent?: number[];

  /** Map of row index to created issue key */
  created: Record<number, string>;
  
  /** 
   * Map of row index to error details
   * Format matches JIRA bulk API response (E4-S03) for direct storage
   */
  errors: Record<number, {
    /** HTTP status code from JIRA */
    status: number;
    /** Map of field name to error message */
    errors: Record<string, string>;
  }>;

  /**
   * Map of UID to created issue key (E4-S13: Hierarchy Support)
   * 
   * Tracks UID→Key mappings for hierarchy creation and retry support.
   * When retrying with a manifest, these mappings allow child issues
   * to reference parents created in previous attempts.
   */
  uidMap?: Record<string, string>;
}

/**
 * User-facing bulk operation result
 * Returned by create() method when processing multiple issues
 */
export interface BulkResult {
  /** Manifest containing all bulk operation details */
  manifest: BulkManifest;
  
  /** Total number of issues processed */
  total: number;
  
  /** Number of issues successfully created */
  succeeded: number;
  
  /** Number of issues that failed, were not confirmed, or were not sent */
  failed: number;
  
  /** Per-row results */
  results: Array<{
    /** Original row index */
    index: number;
    /** Whether creation succeeded */
    success: boolean;
    /**
     * Outcome for this row:
     * - `created`: Jira created it (`key` is set)
     * - `failed`: Jira or validation rejected it (`error` is set)
     * - `not_confirmed`: sent, but no usable reply; it may exist, check Jira before resending
     * - `not_sent`: not created: never sent because an earlier request threw,
     *   or Jira refused its request with 401/403; safe to resend
     */
    outcome?: BulkRowOutcome;
    /** Issue key if succeeded */
    key?: string;
    /** Error details if failed */
    error?: {
      status: number;
      errors: Record<string, string>;
    };
    /** Present when the row was not submitted because its parent was not confirmed */
    blocked?: boolean;
  }>;

  /** Created Jira keys that could not be matched to request rows */
  unmatchedKeys?: string[];

  /**
   * Set when a bulk create request threw (network error, timeout, 5xx, 401/403, ...).
   * Rows in that request are `not_confirmed`, or `not_sent` for 401/403
   * (Jira refused it, nothing was created). Rows after it are `not_sent`.
   */
  sendError?: { name: string; message: string };
}

/** Per-row outcome of a bulk create. */
export type BulkRowOutcome = 'created' | 'failed' | 'not_confirmed' | 'not_sent';

/**
 * Progress update passed to `onProgress` after each bulk create group returns.
 * Counts come from Jira's bulk replies and span every hierarchy level.
 */
export interface ProgressUpdate {
  /** Total rows in the operation (all levels) */
  total: number;
  /** Rows with a final answer so far: `created + failed` */
  completed: number;
  /** Rows still waiting for an answer: `total - completed` */
  inProgress: number;
  /** True when this update finished at least one more row */
  progressMade: boolean;
  /** Milliseconds since the last update that made progress (0 when this one did) */
  timeSinceProgress: number;
  /** @deprecated Always false since 3.1.0; there is no progress timeout. */
  isStuck: boolean;
  /** Rows Jira created so far */
  created?: number;
  /** Rows rejected so far (by Jira, validation, or a blocked parent) */
  failed?: number;
}

/**
 * Partial result data for manifest updates (retry operations)
 */
export interface ManifestUpdateData {
  /** New succeeded row indices */
  succeeded: number[];
  /** New failed row indices */
  failed: number[];
  /** New created issue keys */
  created: Record<number, string>;
  /** New/updated error details */
  errors: Record<number, {
    status: number;
    errors: Record<string, string>;
  }>;
}

/**
 * Result from JIRA Bulk API wrapper (E4-S03)
 * Normalized response from /rest/api/2/issue/bulk endpoint
 */
export interface BulkApiResult {
  /** Successfully created issues */
  created: Array<{
    /** Original row index (0-based) */
    index: number;
    /** Created issue key (e.g., "PROJ-123") */
    key: string;
    /** Issue ID */
    id: string;
    /** Self URL */
    self: string;
  }>;
  
  /** Failed issues with error details */
  failed: Array<{
    /** Original row index (0-based) */
    index: number;
    /** HTTP status code */
    status: number;
    /** Field-level errors (field name → error message) */
    errors: Record<string, string>;
  }>;

  /** Request rows whose outcomes could not be safely matched to the response */
  notConfirmed?: number[];

  /** Created Jira keys that could not be matched to request rows */
  unmatchedKeys?: string[];
}

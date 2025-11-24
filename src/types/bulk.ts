/**
 * Bulk operations types
 * Story: E4-S02
 */

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
  
  /** Number of issues that failed */
  failed: number;
  
  /** Per-row results */
  results: Array<{
    /** Original row index */
    index: number;
    /** Whether creation succeeded */
    success: boolean;
    /** Issue key if succeeded */
    key?: string;
    /** Error details if failed */
    error?: {
      status: number;
      errors: Record<string, string>;
    };
  }>;
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
    /** Created issue key (e.g., "ZUL-123") */
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
}

/**
 * JIRA Issue response from the REST API
 */
export interface Issue {
  /** Issue key (e.g., "ENG-123") */
  key: string;

  /** Issue ID (e.g., "10050") */
  id: string;

  /** Full URL to the issue */
  self: string;

  /** Optional fields returned by JIRA (for dry-run mode or expanded responses) */
  fields?: Record<string, unknown>;
}

/**
 * Options for issue creation
 */
export interface CreateIssueOptions {
  /** If true, perform validation without creating the issue */
  validate?: boolean;
}

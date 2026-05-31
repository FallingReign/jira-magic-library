/**
 * Discovery API Types
 *
 * Shared interfaces for the discovery namespace (projects, fields, issue types).
 */

/**
 * Project information returned by the discovery API
 */
export interface ProjectInfo {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  /** Cloud only: 'classic' (company-managed) or 'next-gen' (team-managed) */
  style?: string;
  lead?: { displayName: string; accountId?: string; name?: string };
  avatarUrl?: string;
}

/**
 * Options for listing projects
 */
export interface ProjectListOptions {
  /** Filter by name/key (fuzzy) */
  query?: string;
  /** Filter by project type */
  type?: 'software' | 'business' | 'service_desk';
  /** Max results (default 50) */
  maxResults?: number;
  /** Starting index for pagination */
  startAt?: number;
}

/**
 * Issue type information returned by the discovery API
 */
export interface IssueTypeInfo {
  id: string;
  name: string;
  description?: string;
  subtask: boolean;
  /** Cloud: from hierarchy API */
  hierarchyLevel?: number;
  /** Cloud: team-managed vs company-managed scope */
  scope?: {
    type: 'PROJECT' | 'GLOBAL';
    projectId?: string;
  };
  iconUrl?: string;
}

/**
 * Options for searching issue types
 */
export interface IssueTypeSearchOptions {
  /** Include subtask types (default true) */
  includeSubtasks?: boolean;
  /** Fuzzy match query */
  query?: string;
}

/**
 * Field metadata information
 */
export interface FieldInfo {
  id: string;
  key: string;
  name: string;
  type: string;
  custom: boolean;
  required: boolean;
  schema?: {
    type: string;
    items?: string;
    system?: string;
    custom?: string;
    customId?: number;
  };
  allowedValues?: Array<{ id: string; name?: string; value?: string }>;
  autoCompleteUrl?: string;
}

/**
 * Options for listing fields
 */
export interface FieldListOptions {
  /** Filter by project + issue type (gets applicable fields) */
  projectKey?: string;
  issueType?: string;
  /** Only custom fields */
  customOnly?: boolean;
  /** Search by name */
  query?: string;
}

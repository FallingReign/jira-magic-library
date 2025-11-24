/**
 * JIRA API response types - properly typed alternatives to 'any'
 */

/**
 * Base JIRA API response structure
 */
export interface JiraApiResponse {
  [key: string]: unknown;
}

/**
 * JIRA error response structure
 */
export interface JiraErrorResponse {
  errorMessages?: string[];
  errors?: Record<string, string | string[]>;
  warningMessages?: string[];
  status?: number;
  [key: string]: unknown;
}

/**
 * JIRA field schema from API
 */
export interface JiraFieldSchema {
  type: string;
  items?: string;
  system?: string;
  custom?: string;
  customId?: number;
  allowedValues?: JiraAllowedValue[];
  configuration?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * JIRA allowed value (for select fields, etc.)
 */
export interface JiraAllowedValue {
  id: string;
  name: string;
  value?: string;
  description?: string;
  iconUrl?: string;
  avatarId?: number;
  [key: string]: unknown;
}

/**
 * JIRA field definition from API
 */
export interface JiraFieldDefinition {
  id: string;
  name: string;
  custom: boolean;
  orderable: boolean;
  navigable: boolean;
  searchable: boolean;
  clauseNames: string[];
  schema: JiraFieldSchema;
  [key: string]: unknown;
}

/**
 * JIRA project from API
 */
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  simplified: boolean;
  style: string;
  isPrivate: boolean;
  properties?: Record<string, unknown>;
  entityId?: string;
  uuid?: string;
  [key: string]: unknown;
}

/**
 * JIRA issue type from API
 */
export interface JiraIssueType {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  subtask: boolean;
  statuses?: JiraStatus[];
  [key: string]: unknown;
}

/**
 * JIRA status from API
 */
export interface JiraStatus {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  statusColor: string;
  statusCategory: JiraStatusCategory;
  [key: string]: unknown;
}

/**
 * JIRA status category from API
 */
export interface JiraStatusCategory {
  id: number;
  key: string;
  colorName: string;
  name: string;
  [key: string]: unknown;
}

/**
 * JIRA create meta response
 */
export interface JiraCreateMeta {
  expand: string;
  projects: Array<{
    id: string;
    key: string;
    name: string;
    avatarUrls: Record<string, string>;
    issuetypes: Array<{
      id: string;
      name: string;
      description: string;
      iconUrl: string;
      subtask: boolean;
      expand: string;
      fields: Record<string, JiraFieldMeta>;
    }>;
  }>;
  [key: string]: unknown;
}

/**
 * JIRA field metadata from create meta
 */
export interface JiraFieldMeta {
  required: boolean;
  schema: JiraFieldSchema;
  name: string;
  key?: string;
  hasDefaultValue?: boolean;
  operations?: string[];
  allowedValues?: JiraAllowedValue[];
  autoCompleteUrl?: string;
  defaultValue?: unknown;
  [key: string]: unknown;
}

/**
 * JIRA issue from API
 */
export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  expand: string;
  fields: Record<string, unknown>;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * JIRA search results
 */
export interface JiraSearchResults {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
  [key: string]: unknown;
}

/**
 * Generic JIRA API error details that can contain various structures
 */
export type JiraApiErrorDetails = 
  | Record<string, unknown>
  | string
  | string[]
  | null
  | undefined;

/**
 * Type guard to check if a value is a JIRA error response
 */
export function isJiraErrorResponse(value: unknown): value is JiraErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('errorMessages' in value || 'errors' in value)
  );
}

/**
 * Type guard to check if a value is a JIRA API response
 */
export function isJiraApiResponse(value: unknown): value is JiraApiResponse {
  return typeof value === 'object' && value !== null;
}
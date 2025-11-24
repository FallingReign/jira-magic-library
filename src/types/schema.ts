/**
 * Schema information for a JIRA field
 */
export interface FieldSchema {
  /** Field identifier (e.g., "summary", "customfield_10024") */
  id: string;

  /** Human-readable field name (e.g., "Summary", "Story Points") */
  name: string;

  /** Field type (e.g., "string", "number", "user", "priority", "array") */
  type: string;

  /** Whether this field is required when creating issues */
  required: boolean;

  /** Allowed values for select fields, priorities, etc. */
  allowedValues?: Array<{
    id: string;
    name: string; // Used by resolveUniqueName utility and most converters
    value?: string; // Used by cascading select converter (OptionWithChild)
    children?: Array<{ id: string; value: string }>; // For cascading selects (nested structure)
  }>;

  /** Original JIRA schema object */
  schema: {
    type: string;
    system?: string;
    custom?: string;
    customId?: number;
    items?: string;
  };
}

/**
 * Complete schema for a project + issue type combination
 */
export interface ProjectSchema {
  /** JIRA project key (e.g., "ENG") */
  projectKey: string;

  /** Issue type name (e.g., "Bug", "Task") */
  issueType: string;

  /** Map of field ID to field schema */
  fields: Record<string, FieldSchema>;
}

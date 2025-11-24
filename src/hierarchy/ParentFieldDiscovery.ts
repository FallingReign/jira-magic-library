import { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import type { CacheClient } from '../types/cache.js';
import type { FieldSchema, ProjectSchema } from '../types/schema.js';
import { NotFoundError } from '../errors/NotFoundError.js';
import { DEFAULT_PARENT_SYNONYMS } from '../constants/field-constants.js';

const CACHE_TTL_SECONDS = 3600;
const CACHE_PREFIX = 'hierarchy';
const NULL_CACHE_VALUE = 'null';

interface ParentFieldDiscoveryLogger {
  warn: (message: string, context?: Record<string, unknown>) => void;
}

const defaultLogger: ParentFieldDiscoveryLogger = {
  // eslint-disable-next-line no-console
  warn: (message: string, context?: Record<string, unknown>) => console.warn(message, context),
};

interface FieldCandidate {
  fieldKey: string;
  fieldName: string;
  priority: number;
  sourceIssueType: string;
}

/**
 * Discovers and caches the parent field key for a project.
 *
 * Parent fields are custom fields (type "any") whose display names typically
 * include "Parent" or "Epic Link". We apply heuristics to select the most
 * appropriate field and cache the result for subsequent lookups.
 */
export class ParentFieldDiscovery {
  private readonly logger: ParentFieldDiscoveryLogger;
  private readonly parentFieldPatterns: string[];

  constructor(
    private readonly schemaDiscovery: SchemaDiscovery,
    private readonly cache: CacheClient,
    logger: ParentFieldDiscoveryLogger = defaultLogger,
    customParentSynonyms?: string[]
  ) {
    this.logger = logger;
    // Use custom synonyms or defaults (AC9)
    this.parentFieldPatterns = customParentSynonyms || DEFAULT_PARENT_SYNONYMS;
  }

  /**
   * Discovers the parent field key for a given project and issue type.
   *
   * For Sub-tasks, returns the standard JIRA "parent" field.
   * For other issue types, searches for JPO hierarchy custom fields (type "any") that 
   * match common parent field patterns like "Parent", "Epic Link", "Parent Link".
   * Results are cached for 1 hour to minimize API calls.
   *
   * Different hierarchy levels can have different parent fields, so this method
   * must be called with the specific issue type to get the correct parent field.
   *
   * @param projectKey - The JIRA project key (e.g., "PROJ", "ENG")
   * @param issueTypeName - The issue type name (e.g., "SuperEpic", "Epic", "Story", "Sub-task")
   * @returns The parent field key (e.g., "customfield_10014" for JPO, "parent" for Sub-tasks) or null if not found
   *
   * @example
   * ```typescript
   * const discovery = new ParentFieldDiscovery(schemaDiscovery, cache);
   * const fieldKey = await discovery.getParentFieldKey('PROJ', 'SuperEpic');
   * console.log(fieldKey); // "customfield_10014" (JPO Parent Link for SuperEpic)
   * 
   * const subtaskFieldKey = await discovery.getParentFieldKey('PROJ', 'Sub-task');
   * console.log(subtaskFieldKey); // "parent" (standard JIRA parent field for Sub-tasks)
   * ```
   */
  async getParentFieldKey(projectKey: string, issueTypeName: string): Promise<string | null> {
    const cacheKey = this.getCacheKey(projectKey, issueTypeName);

    const cachedValue = await this.cache.get(cacheKey);
    if (cachedValue) {
      return cachedValue === NULL_CACHE_VALUE ? null : cachedValue;
    }

    // Sub-tasks use standard JIRA parent field, not JPO hierarchy custom fields
    if (this.isSubtaskIssueType(issueTypeName)) {
      this.logger.warn(`Using standard JIRA parent field for Sub-task: ${issueTypeName}`);
      await this.cache.set(cacheKey, 'parent', CACHE_TTL_SECONDS);
      return 'parent';
    }

    // For non-Sub-tasks, search for JPO hierarchy custom fields
    const candidates = await this.findCandidatesForIssueType(projectKey, issueTypeName);

    if (candidates.length === 0) {
      await this.cache.set(cacheKey, NULL_CACHE_VALUE, CACHE_TTL_SECONDS);
      this.logger.warn(`Parent field not found for project ${projectKey}, issue type ${issueTypeName}`);
      return null;
    }

    if (candidates.length > 1) {
      this.logger.warn(`Multiple parent field candidates for project ${projectKey}, issue type ${issueTypeName}`, {
        candidates: candidates.map((candidate) => candidate.fieldName),
      });
    }

    const selected = this.selectCandidate(candidates);
    await this.cache.set(cacheKey, selected.fieldKey, CACHE_TTL_SECONDS);
    return selected.fieldKey;
  }

  /**
   * Finds parent field candidates for a specific issue type.
   * 
   * @param projectKey - Project key
   * @param issueTypeName - Issue type to search in
   * @returns Array of parent field candidates found in the issue type's schema
   */
  private async findCandidatesForIssueType(
    projectKey: string,
    issueTypeName: string
  ): Promise<FieldCandidate[]> {
    const candidatesByField: Map<string, FieldCandidate> = new Map();

    try {
      const schema = await this.schemaDiscovery.getFieldsForIssueType(projectKey, issueTypeName);
      this.collectCandidatesFromSchema(schema, candidatesByField);
    } catch (error) {
      // If issue type doesn't exist, return empty array
      if (error instanceof NotFoundError) {
        return [];
      }
      throw error;
    }

    return Array.from(candidatesByField.values());
  }

  private collectCandidatesFromSchema(
    schema: ProjectSchema,
    candidatesByField: Map<string, FieldCandidate>
  ): void {
    for (const [fieldKey, field] of Object.entries(schema.fields)) {
      if (field.schema?.type !== 'any') {
        continue;
      }

      const evaluation = this.evaluateField(field);
      if (!evaluation) {
        continue;
      }

      const existing = candidatesByField.get(fieldKey);
      if (!existing || evaluation.priority < existing.priority) {
        candidatesByField.set(fieldKey, {
          fieldKey,
          fieldName: field.name,
          priority: evaluation.priority,
          sourceIssueType: schema.issueType,
        });
      }
    }
  }

  private evaluateField(field: FieldSchema): { priority: number } | null {
    const fieldName = field.name.toLowerCase().trim();
    for (let i = 0; i < this.parentFieldPatterns.length; i += 1) {
      const pattern = this.parentFieldPatterns[i]?.toLowerCase();
      if (pattern && fieldName === pattern) {
        return { priority: i };
      }
    }

    for (let i = 0; i < this.parentFieldPatterns.length; i += 1) {
      const pattern = this.parentFieldPatterns[i]?.toLowerCase();
      if (pattern && fieldName.includes(pattern)) {
        return { priority: i + this.parentFieldPatterns.length };
      }
    }

    return null;
  }

  private selectCandidate(candidates: FieldCandidate[]): FieldCandidate {
    return candidates.slice().sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.fieldName.localeCompare(b.fieldName);
    })[0]!;
  }

  /**
   * Determines if an issue type is a Sub-task based on its name.
   * 
   * Checks for common Sub-task issue type names that are used across different JIRA instances.
   * This approach works without requiring additional API calls to check the subtask flag.
   * 
   * @param issueTypeName - The issue type name to check
   * @returns true if the issue type is likely a Sub-task
   */
  private isSubtaskIssueType(issueTypeName: string): boolean {
    const lowerName = issueTypeName.toLowerCase();
    return lowerName === 'sub-task' || 
           lowerName === 'subtask' || 
           lowerName === 'sub task' ||
           lowerName.includes('sub-task') ||
           lowerName.includes('subtask');
  }

  private getCacheKey(projectKey: string, issueTypeName: string): string {
    return `${CACHE_PREFIX}:${projectKey}:${issueTypeName}:parent-field`;
  }
}




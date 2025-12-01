/**
 * JIRA Magic Library - Main Class
 *
 * The primary entry point for interacting with JIRA.
 * Provides a simple, human-friendly API for creating issues.
 */

import { JiraClientImpl } from './client/JiraClient.js';
import { RedisCache } from './cache/RedisCache.js';
import { SchemaDiscovery } from './schema/SchemaDiscovery.js';
import type { ProjectSchema } from './types/schema.js';
import { FieldResolver } from './converters/FieldResolver.js';
import { ConverterRegistry } from './converters/ConverterRegistry.js';
import { IssueOperations } from './operations/IssueOperations.js';
import type { IssuesAPI } from './operations/IssueOperations.js';
import { ConnectionError } from './errors/index.js';
import type { JMLConfig } from './types/config.js';
import { ParentFieldDiscovery } from './hierarchy/ParentFieldDiscovery.js';
import { JPOHierarchyDiscovery } from './hierarchy/JPOHierarchyDiscovery.js';
import type { HierarchyLevel } from './types/hierarchy.js';
import { ValidationService } from './validation/ValidationService.js';
import type { ValidationResult } from './validation/types.js';
import type { ParseInputOptions } from './parsers/InputParser.js';

/**
 * Server information returned by JIRA
 */
export interface ServerInfo {
  version: string;
  versionNumbers: number[];
  deploymentType: string;
  buildNumber: number;
  buildDate: string;
  serverTime: string;
  scmInfo: string;
  serverTitle: string;
}

/**
 * JIRA Magic Library - Main Class
 * 
 * @example
 * ```typescript
 * const jml = new JML({
 *   baseUrl: 'https://jira.company.com',
 *   auth: { token: 'your-pat-token' },
 *   apiVersion: 'v2',
 * });
 * 
 * const result = await jml.issues.create({
 *   Project: 'PROJ',
 *   'Issue Type': 'Bug',
 *   Summary: 'Example issue',
 * });
 * ```
 */
export class JML {
  /**
   * Issue operations entry point.
   *
   * Provides high-level helpers such as {@link IssueOperations.create}
   * which back the public API `jml.issues.create(...)`. All bulk batching,
   * manifest handling, and hierarchy routing flows live behind this property.
   */
  public readonly issues: IssuesAPI;

  private readonly client: JiraClientImpl;
  private readonly cache: RedisCache;
  private readonly schemaDiscovery: SchemaDiscovery;
  private readonly hierarchyDiscovery: JPOHierarchyDiscovery;
  private readonly validationService: ValidationService;
  private readonly config: JMLConfig;

  /**
   * Create a new JML instance
   * 
   * @param config - Configuration options
   */
  constructor(config: JMLConfig) {
    this.config = config;
    const redisConfig = {
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
    };

    // Initialize client
    this.client = new JiraClientImpl({
      baseUrl: config.baseUrl,
      auth: config.auth,
      redis: redisConfig,
    });

    // Initialize cache
    this.cache = new RedisCache(redisConfig);

    // Initialize schema discovery
    this.schemaDiscovery = new SchemaDiscovery(
      this.client,
      this.cache,
      config.baseUrl
    );

    // Initialize validation service (E4-S07)
    this.validationService = new ValidationService(this.schemaDiscovery);

    // Initialize hierarchy components (E3-S03, E3-S04, E3-S06)
    this.hierarchyDiscovery = new JPOHierarchyDiscovery(this.client, this.cache);
    const parentFieldDiscovery = new ParentFieldDiscovery(
      this.schemaDiscovery, 
      this.cache,
      undefined, // logger
      config.parentFieldSynonyms // AC9: custom parent synonyms
    );

    // Initialize field resolver with parent synonym support (E3-S06, AC9)
    const fieldResolver = new FieldResolver(
      this.schemaDiscovery,
      parentFieldDiscovery,
      this.client,
      this.cache,
      this.hierarchyDiscovery,
      config.parentFieldSynonyms // AC9: custom parent synonyms
    );

    // Initialize converter registry
    const converterRegistry = new ConverterRegistry();

    // Initialize issue operations
    this.issues = new IssueOperations(
      this.client,
      this.schemaDiscovery,
      fieldResolver,
      converterRegistry,
      this.cache,
      config.baseUrl,
      this.config // Pass full config for converter customization
    );
  }

  /**
   * Validate connection to JIRA
   * 
   * Tests the connection by fetching server info.
   * Useful for verifying credentials and connectivity before making requests.
   * 
   * @returns Server information from JIRA
   * @throws {ConnectionError} if JIRA is unreachable
   * @throws {AuthenticationError} if credentials are invalid
   * 
   * @example
   * ```typescript
   * const jml = new JML(config);
   * const serverInfo = await jml.validateConnection();
   * console.log(`Connected to JIRA ${serverInfo.version}`);
   * ```
   */
  async validateConnection(): Promise<ServerInfo> {
    try {
      const response = await this.client.get('/rest/api/2/serverInfo');
      return response as ServerInfo;
    } catch (error: unknown) {
      throw new ConnectionError(
        `Failed to connect to JIRA: ${error instanceof Error ? error.message : String(error)}`,
        { baseUrl: this.client['baseUrl'], originalError: error }
      );
    }
  }

  /**
   * Get field schema for a specific project and issue type
   * 
   * Returns all available fields with their types, whether they're required,
   * and allowed values (for option/multi-option fields).
   * 
   * @param projectKey - JIRA project key (e.g., "ENG")
   * @param issueTypeName - Issue type name (e.g., "Bug", "Task")
   * @returns Promise resolving to the project schema
   * @throws {NotFoundError} if the project or issue type doesn't exist
   * 
   * @example
   * ```typescript
   * const schema = await jml.getFieldSchema('ENG', 'Bug');
   * console.log(Object.keys(schema.fields)); // ["summary", "priority", "customfield_10024", ...]
   * ```
   */
  async getFieldSchema(projectKey: string, issueTypeName: string): Promise<ProjectSchema> {
    return await this.schemaDiscovery.getFieldsForIssueType(projectKey, issueTypeName);
  }

  /**
   * Get available issue types for a project
   * 
   * Returns all issue types that can be created in the specified project,
   * with their IDs and names. Useful for building UIs or validating
   * parent-child relationships with the hierarchy structure.
   * 
   * Delegates to SchemaDiscovery which already fetches this data.
   * 
   * @param projectKey - JIRA project key (e.g., "ENG")
   * @returns Promise resolving to array of issue type metadata
   * @throws {NotFoundError} if the project doesn't exist
   * 
   * @example
   * ```typescript
   * const issueTypes = await jml.getIssueTypes('ENG');
   * console.log(issueTypes);
   * // [
   * //   { id: "10000", name: "Epic" },
   * //   { id: "10001", name: "Story" },
   * //   { id: "10002", name: "Bug" },
   * //   { id: "10003", name: "Task" },
   * //   { id: "10004", name: "Sub-task" }
   * // ]
   * 
   * // Combine with hierarchy to validate parent-child relationships
   * const hierarchy = await jml.getHierarchy();
   * const storyType = issueTypes.find(t => t.name === 'Story');
   * const epicLevel = hierarchy?.find(l => l.issueTypeIds.includes(storyType.id));
   * ```
   */
  async getIssueTypes(projectKey: string): Promise<Array<{ id: string; name: string }>> {
    // Delegate to SchemaDiscovery's existing logic
    return await this.schemaDiscovery.getIssueTypesForProject(projectKey);
  }

  /**
   * Get issue type hierarchy configuration
   * 
   * Returns the JPO (JIRA Portfolio) hierarchy structure if available,
   * showing which issue types can be parents of other issue types.
   * Returns null if JPO is not installed (use standard parent fields instead).
   * 
   * Note: Hierarchy is global across all projects in the JIRA instance.
   * 
   * @param options - Optional settings (refresh: force cache refresh)
   * @returns Promise resolving to array of hierarchy levels or null if JPO not installed
   * 
   * @example
   * ```typescript
   * const hierarchy = await jml.getHierarchy();
   * if (hierarchy) {
   *   // JPO installed - hierarchy is an array of levels
   *   console.log(hierarchy); // [{ id: 0, title: "Subtask", issueTypeIds: [...] }, ...]
   *   
   *   // Find issue types at each level
   *   const epicLevel = hierarchy.find(l => l.title === 'Epic');
   *   console.log(`Epic issue type IDs: ${epicLevel.issueTypeIds}`);
   * } else {
   *   // Standard JIRA - use built-in parent field
   *   console.log('No JPO hierarchy - use Parent/Epic Link fields');
   * }   * ```
   */
  async getHierarchy(options?: { refresh?: boolean }): Promise<HierarchyLevel[] | null> {
    return await this.hierarchyDiscovery.getHierarchy(options);
  }

  /**
   * Validate issue data against JIRA schema without creating issues
   * 
   * Performs fast, schema-only validation:
   * - Required fields present
   * - Field types match schema
   * - Enum values valid
   * 
   * Does NOT perform field name→ID lookups or value conversions.
   * Performance target: <100ms for 100 rows.
   * 
   * @param options - Input options (same as create())
   * @returns Validation result with errors array
   * 
   * @example
   * ```typescript
   * // Validate before creating
   * const result = await jml.validate({
   *   data: [
   *     { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Test' }
   *   ]
   * });
   * 
   * if (!result.valid) {
   *   result.errors.forEach(err => {
   *     console.error(`Row ${err.rowIndex}: ${err.field} - ${err.message}`);
   *   });
   * } else {
   *   // Validation passed, safe to create
   *   await jml.issues.create({ data: [...] });
   * }
   * 
   * // Validate from file
   * const csvResult = await jml.validate({ from: 'issues.csv' });
   * ```
   */
  async validate(options: ParseInputOptions): Promise<ValidationResult> {
    return await this.validationService.validate(options);
  }

  /**
   * Disconnect and clean up resources
   * 
   * Closes Redis connection and cleans up any other resources.
   * Call this when you're done using the library.
   */
  async disconnect(): Promise<void> {
    await this.cache.disconnect();
  }
}

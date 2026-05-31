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
import type { JMLConfig, DeploymentType } from './types/config.js';
import { ParentFieldDiscovery } from './hierarchy/ParentFieldDiscovery.js';
import type { ParentFieldInfo } from './hierarchy/ParentFieldDiscovery.js';
import { JPOHierarchyDiscovery } from './hierarchy/JPOHierarchyDiscovery.js';
import type { HierarchyLevel } from './types/hierarchy.js';
import { ValidationService } from './validation/ValidationService.js';
import type { ValidationResult } from './validation/types.js';
import type { ParseInputOptions } from './parsers/InputParser.js';
import { DeploymentDetector } from './client/DeploymentDetector.js';
import type { DeploymentInfo } from './client/DeploymentDetector.js';
import { EndpointResolver } from './client/EndpointResolver.js';
import { ProjectDiscovery } from './discovery/ProjectDiscovery.js';
import { IssueTypeDiscovery } from './discovery/IssueTypeDiscovery.js';
import { FieldMetadataDiscovery } from './discovery/FieldMetadataDiscovery.js';
import type { ProjectInfo, ProjectListOptions, FieldInfo, FieldListOptions, IssueTypeInfo, IssueTypeSearchOptions } from './discovery/types.js';
import { InMemoryCache } from './cache/InMemoryCache.js';
import { UserResolver } from './resolution/UserResolver.js';
import { FieldOptionResolver } from './resolution/FieldOptionResolver.js';
import { EntityResolver } from './resolution/EntityResolver.js';
import type { ResolvedUser, UserResolveOptions, ResolvedOption, ResolvedEntity } from './resolution/types.js';

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
 * Projects namespace API
 */
export interface ProjectsAPI {
  list(options?: ProjectListOptions): Promise<ProjectInfo[]>;
  search(query: string): Promise<ProjectInfo[]>;
  get(projectKey: string): Promise<ProjectInfo>;
}

/**
 * Fields namespace API
 */
export interface FieldsAPI {
  list(options?: FieldListOptions): Promise<FieldInfo[]>;
  getForContext(projectKey: string, issueType: string): Promise<FieldInfo[]>;
  get(fieldIdOrName: string, projectKey?: string, issueType?: string): Promise<FieldInfo | null>;
  getCustomFields(options?: { query?: string }): Promise<FieldInfo[]>;
}

/**
 * Issue Types namespace API
 */
export interface IssueTypesAPI {
  getForProject(projectKey: string, options?: IssueTypeSearchOptions): Promise<IssueTypeInfo[]>;
  resolve(projectKey: string, query: string): Promise<IssueTypeInfo>;
}

/**
 * Users namespace API
 */
export interface UsersAPI {
  resolve(query: string, options?: UserResolveOptions): Promise<ResolvedUser>;
  search(query: string, options?: UserResolveOptions): Promise<ResolvedUser[]>;
}

/**
 * Resolve namespace API — resolves human-friendly text to JIRA IDs
 */
export interface ResolveAPI {
  priority(query: string): Promise<ResolvedEntity>;
  status(query: string, projectKey: string, issueType?: string): Promise<ResolvedEntity>;
  component(query: string, projectKey: string): Promise<ResolvedEntity>;
  version(query: string, projectKey: string): Promise<ResolvedEntity>;
  fieldOption(fieldId: string, query: string, projectKey: string, issueType: string): Promise<ResolvedOption>;
  user(query: string): Promise<ResolvedUser>;
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

  /**
   * Projects discovery namespace.
   * List, search, and get project metadata.
   */
  public readonly projects: ProjectsAPI;

  /**
   * Fields discovery namespace.
   * List fields globally or per context, find custom fields.
   */
  public readonly fields: FieldsAPI;

  /**
   * Issue types discovery namespace.
   * Get issue types for a project, resolve fuzzy names.
   */
  public readonly issueTypes: IssueTypesAPI;

  /**
   * Users namespace.
   * Resolve and search users by email/display name.
   */
  public readonly users: UsersAPI;

  /**
   * Resolve namespace.
   * Resolve human-friendly text to JIRA IDs (priority, status, component, version, fieldOption, user).
   */
  public readonly resolve: ResolveAPI;

  private readonly client: JiraClientImpl;
  private readonly cache: RedisCache;
  private readonly schemaDiscovery: SchemaDiscovery;
  private readonly hierarchyDiscovery: JPOHierarchyDiscovery;
  private readonly parentFieldDiscovery: ParentFieldDiscovery;
  private readonly validationService: ValidationService;
  private readonly config: JMLConfig;
  private readonly deploymentDetector: DeploymentDetector;
  private endpointResolver: EndpointResolver | null = null;
  private deploymentDetectionPromise: Promise<DeploymentInfo> | null = null;

  /**
   * Builds a resolved RedisConfig from optional user input.
   *
   * If `redis.url` is provided it is parsed to extract host, port and password.
   * Explicit `host`, `port`, and `password` fields always override URL-derived values.
   *
   * @param redis - Optional redis config from JMLConfig
   * @returns Resolved config with host, port and optional password
   */
  private static buildRedisConfig(redis?: { url?: string; host?: string; port?: number; password?: string }): { host: string; port: number; password?: string } {
    let host = 'localhost';
    let port = 6379;
    let password: string | undefined;

    if (redis?.url) {
      try {
        const parsed = new URL(redis.url);
        host = parsed.hostname || host;
        port = parsed.port ? parseInt(parsed.port, 10) : port;
        password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
      } catch {
        // Invalid URL - fall through to defaults / explicit fields below
      }
    }

    return {
      host: redis?.host ?? host,
      port: redis?.port ?? port,
      password: redis?.password ?? password,
    };
  }

  /**
   * Create a new JML instance
   * 
   * @param config - Configuration options
   */
  constructor(config: JMLConfig) {
    this.config = config;
    const redisConfig = JML.buildRedisConfig(this.config.redis);

    // Initialize client (uses AuthStrategy internally based on config.auth)
    this.client = new JiraClientImpl(this.config);

    // Initialize deployment detector for lazy detection
    this.deploymentDetector = new DeploymentDetector(this.client);

    // If deployment is explicitly set (not 'auto'), create EndpointResolver immediately
    const deploymentSetting: DeploymentType = this.config.deployment ?? 'auto';
    if (deploymentSetting !== 'auto') {
      const apiVersion = this.config.apiVersion ?? (deploymentSetting === 'cloud' ? 'v3' : 'v2');
      this.endpointResolver = new EndpointResolver(deploymentSetting, apiVersion);
    }

    // Initialize cache
    this.cache = new RedisCache(redisConfig, undefined, undefined, this.config.debug);

    // Initialize schema discovery
    this.schemaDiscovery = new SchemaDiscovery(
      this.client,
      this.cache,
      this.config.baseUrl
    );

    // Initialize validation service (E4-S07)
    this.validationService = new ValidationService(this.schemaDiscovery);

    // Initialize hierarchy components (E3-S03, E3-S04, E3-S06)
    this.hierarchyDiscovery = new JPOHierarchyDiscovery(this.client, this.cache);
    this.parentFieldDiscovery = new ParentFieldDiscovery(
      this.schemaDiscovery, 
      this.cache,
      undefined, // logger
      this.config.parentFieldSynonyms // AC9: custom parent synonyms
    );

    // Initialize field resolver with parent synonym support (E3-S06, AC9)
    const fieldResolver = new FieldResolver(
      this.schemaDiscovery,
      this.parentFieldDiscovery,
      this.client,
      this.cache,
      this.config.parentFieldSynonyms // AC9: custom parent synonyms
    );

    // Initialize converter registry
    const converterRegistry = new ConverterRegistry(this.config.debug);

    // Initialize issue operations
    this.issues = new IssueOperations(
      this.client,
      this.schemaDiscovery,
      fieldResolver,
      converterRegistry,
      this.cache,
      this.config.baseUrl,
      this.config // Pass full config for converter customization
    );

    // Initialize discovery APIs with in-memory cache (lightweight, no Redis dependency)
    const discoveryCache = new InMemoryCache();
    const resolverFn = () => this.getEndpointResolver();

    const projectDiscovery = new ProjectDiscovery(this.client, discoveryCache, resolverFn);
    const issueTypeDiscovery = new IssueTypeDiscovery(this.client, discoveryCache, resolverFn);
    const fieldMetadataDiscovery = new FieldMetadataDiscovery(this.client, discoveryCache, resolverFn);

    this.projects = {
      list: (options) => projectDiscovery.list(options),
      search: (query) => projectDiscovery.search(query),
      get: (projectKey) => projectDiscovery.get(projectKey),
    };

    this.fields = {
      list: (options) => fieldMetadataDiscovery.listAll(options),
      getForContext: (projectKey, issueType) => fieldMetadataDiscovery.getForContext(projectKey, issueType),
      get: (fieldIdOrName, projectKey?, issueType?) => fieldMetadataDiscovery.get(fieldIdOrName, projectKey, issueType),
      getCustomFields: (options) => fieldMetadataDiscovery.getCustomFields(options),
    };

    this.issueTypes = {
      getForProject: (projectKey, options) => issueTypeDiscovery.getForProject(projectKey, options),
      resolve: (projectKey, query) => issueTypeDiscovery.resolve(projectKey, query),
    };

    // Initialize resolution APIs (lazy — resolvers created on first call after deployment detection)
    this.users = {
      resolve: async (query, options) => {
        const resolver = await this.createUserResolver();
        return resolver.resolve(query, options);
      },
      search: async (query, options) => {
        const resolver = await this.createUserResolver();
        return resolver.search(query, options);
      },
    };

    this.resolve = {
      priority: async (query) => {
        const resolver = await this.createEntityResolver();
        return resolver.resolvePriority(query);
      },
      status: async (query, projectKey, issueType?) => {
        const resolver = await this.createEntityResolver();
        return resolver.resolveStatus(query, projectKey, issueType);
      },
      component: async (query, projectKey) => {
        const resolver = await this.createEntityResolver();
        return resolver.resolveComponent(query, projectKey);
      },
      version: async (query, projectKey) => {
        const resolver = await this.createEntityResolver();
        return resolver.resolveVersion(query, projectKey);
      },
      fieldOption: async (fieldId, query, projectKey, issueType) => {
        const resolver = await this.createFieldOptionResolver();
        return resolver.resolve(fieldId, query, projectKey, issueType);
      },
      user: async (query) => {
        const resolver = await this.createUserResolver();
        return resolver.resolve(query);
      },
    };
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
  // istanbul ignore next - wrapper method, tested via integration tests
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
  // istanbul ignore next - wrapper method, tested via integration tests
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
  // istanbul ignore next - wrapper method, tested via integration tests
  async getHierarchy(options?: { refresh?: boolean }): Promise<HierarchyLevel[] | null> {
    return await this.hierarchyDiscovery.getHierarchy(options);
  }

  /**
   * Discover the parent field for a specific project and issue type
   * 
   * Returns information about the parent field used for linking issues
   * in a hierarchy. The library uses this to determine which field name
   * users can use for parent references (e.g., "Parent Link", "Epic Link").
   * 
   * Detection priority:
   * 1. Plugin-based detection (most reliable) - JPO or GreenHopper plugins
   * 2. Name pattern matching - fields matching "parent" patterns
   * 3. Returns null if no parent field found
   * 
   * Results are cached for 1 hour to minimize API calls.
   * 
   * @param projectKey - JIRA project key (e.g., "ENG")
   * @param issueTypeName - Issue type name (e.g., "Story", "Epic")
   * @returns Promise resolving to parent field info or null if not found
   * 
   * @example
   * ```typescript
   * // Discover parent field for Stories
   * const parentField = await jml.getParentField('ENG', 'Story');
   * if (parentField) {
   *   console.log(`Parent field: ${parentField.name} (${parentField.key})`);
   *   // "Parent field: Parent Link (customfield_10014)"
   *   
   *   // Now you know you can use this in issue creation:
   *   await jml.issues.create({
   *     Project: 'ENG',
   *     'Issue Type': 'Story',
   *     Summary: 'My Story',
   *     [parentField.name]: 'EPIC-123',  // Use discovered field name
   *     // OR
   *     Parent: 'EPIC-123',               // "Parent" always works
   *   });
   * }
   * 
   * // Discover parent fields for all issue types
   * const issueTypes = await jml.getIssueTypes('ENG');
   * for (const type of issueTypes) {
   *   const parent = await jml.getParentField('ENG', type.name);
   *   console.log(`${type.name}: ${parent?.name ?? 'No parent field'}`);
   * }
   * ```
   */
  // istanbul ignore next - wrapper method, tested via integration tests
  async getParentField(projectKey: string, issueTypeName: string): Promise<ParentFieldInfo | null> {
    return await this.parentFieldDiscovery.getParentFieldInfo(projectKey, issueTypeName);
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
  // istanbul ignore next - wrapper method, tested via integration tests
  async validate(options: ParseInputOptions): Promise<ValidationResult> {
    return await this.validationService.validate(options);
  }

  /**
   * Detect deployment type (Cloud vs Server/DC).
   *
   * Lazily called on first API usage when `config.deployment` is 'auto'.
   * Result is cached for instance lifetime.
   *
   * @returns Deployment information including type, version, and build number
   */
  async detectDeployment(): Promise<DeploymentInfo> {
    // If already resolved, return cached
    if (this.endpointResolver) {
      const info = await this.deploymentDetector.detect();
      return info;
    }

    // Deduplicate concurrent detection calls
    if (!this.deploymentDetectionPromise) {
      this.deploymentDetectionPromise = this.deploymentDetector.detect().then((info) => {
        const apiVersion = this.config.apiVersion ?? (info.deployment === 'cloud' ? 'v3' : 'v2');
        this.endpointResolver = new EndpointResolver(info.deployment, apiVersion);
        return info;
      });
    }

    return this.deploymentDetectionPromise;
  }

  /**
   * Get the EndpointResolver, triggering deployment detection if needed.
   *
   * @returns EndpointResolver configured for the detected/configured deployment
   */
  async getEndpointResolver(): Promise<EndpointResolver> {
    if (this.endpointResolver) {
      return this.endpointResolver;
    }
    await this.detectDeployment();
    return this.endpointResolver!;
  }

  /**
   * Create a UserResolver with lazy deployment detection.
   */
  private async createUserResolver(): Promise<UserResolver> {
    const resolver = await this.getEndpointResolver();
    const info = await this.detectDeployment();
    const discoveryCache = new InMemoryCache();
    return new UserResolver(this.client, discoveryCache, resolver, info.deployment);
  }

  /**
   * Create a FieldOptionResolver with lazy deployment detection.
   */
  private async createFieldOptionResolver(): Promise<FieldOptionResolver> {
    const resolver = await this.getEndpointResolver();
    const info = await this.detectDeployment();
    const discoveryCache = new InMemoryCache();
    return new FieldOptionResolver(this.client, discoveryCache, resolver, info.deployment);
  }

  /**
   * Create an EntityResolver with lazy deployment detection.
   */
  private async createEntityResolver(): Promise<EntityResolver> {
    const resolver = await this.getEndpointResolver();
    const info = await this.detectDeployment();
    const discoveryCache = new InMemoryCache();
    return new EntityResolver(this.client, discoveryCache, resolver, info.deployment);
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

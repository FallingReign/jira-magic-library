/**
 * Endpoint Resolver
 *
 * Centralizes all JIRA API path generation based on deployment type
 * and API version. Cloud and Server sometimes use different endpoints.
 */

/**
 * Resolves JIRA REST API endpoint paths based on deployment and version.
 *
 * Key differences between Cloud and Server:
 * - User search: Cloud uses `query` param, Server uses `username` param
 * - Project list: Cloud uses `/project/search` (paginated), Server uses `/project`
 */
export class EndpointResolver {
  private readonly _apiBase: string;

  constructor(
    private readonly deployment: 'server' | 'cloud',
    private readonly apiVersion: 'v2' | 'v3'
  ) {
    this._apiBase = `/rest/api/${this.apiVersion === 'v3' ? '3' : '2'}`;
  }

  /** Base API path (e.g., /rest/api/2 or /rest/api/3) */
  get apiBase(): string {
    return this._apiBase;
  }

  /** Server info endpoint (always uses v2, works on both) */
  serverInfo(): string {
    return '/rest/api/2/serverInfo';
  }

  /** Create metadata endpoint (project-level) */
  createMeta(projectKey: string): string {
    return `${this._apiBase}/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`;
  }

  /** Create metadata fields for a specific issue type (Cloud v3 style) */
  createMetaFields(projectKey: string, issueTypeId: string): string {
    return `${this._apiBase}/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`;
  }

  /** Issue creation endpoint */
  issueCreate(): string {
    return `${this._apiBase}/issue`;
  }

  /** Bulk issue creation endpoint */
  issueBulkCreate(): string {
    return `${this._apiBase}/issue/bulk`;
  }

  /** Get/update a single issue */
  issueGet(issueKey: string): string {
    return `${this._apiBase}/issue/${issueKey}`;
  }

  /** Update a single issue */
  issueUpdate(issueKey: string): string {
    return `${this._apiBase}/issue/${issueKey}`;
  }

  /** Issue search (JQL) */
  search(): string {
    return `${this._apiBase}/search`;
  }

  /**
   * User search endpoint.
   * Cloud: /rest/api/3/user/search (uses `query` param)
   * Server: /rest/api/2/user/search (uses `username` param)
   */
  userSearch(): string {
    return `${this._apiBase}/user/search`;
  }

  /**
   * User search query parameter name.
   * Cloud uses 'query', Server uses 'username'.
   */
  get userSearchParam(): string {
    return this.deployment === 'cloud' ? 'query' : 'username';
  }

  /**
   * Project list endpoint.
   * Cloud: /rest/api/3/project/search (paginated)
   * Server: /rest/api/2/project (returns all)
   */
  projectList(): string {
    if (this.deployment === 'cloud') {
      return `${this._apiBase}/project/search`;
    }
    return `${this._apiBase}/project`;
  }

  /** Get a single project */
  projectGet(projectKey: string): string {
    return `${this._apiBase}/project/${projectKey}`;
  }

  /** List all fields */
  fieldList(): string {
    return `${this._apiBase}/field`;
  }

  /** Field contexts (Cloud custom field config) */
  fieldContext(fieldId: string): string {
    return `${this._apiBase}/field/${fieldId}/context`;
  }

  /** Field options for a given context */
  fieldOptions(fieldId: string, contextId: string): string {
    return `${this._apiBase}/field/${fieldId}/context/${contextId}/option`;
  }

  /** Whether this resolver is for a Cloud deployment */
  get isCloud(): boolean {
    return this.deployment === 'cloud';
  }

  /** Whether this resolver is for a Server/DC deployment */
  get isServer(): boolean {
    return this.deployment === 'server';
  }
}

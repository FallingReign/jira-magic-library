/**
 * JIRA API type definitions
 * Story: E1-S03
 */

/**
 * JIRA Server information returned from /rest/api/2/serverInfo endpoint
 */
export interface JiraServerInfo {
  baseUrl: string;
  version: string;
  versionNumbers: number[];
  deploymentType: string;
  buildNumber: number;
  serverTitle: string;
}

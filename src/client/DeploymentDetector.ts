/**
 * Deployment Detector
 *
 * Detects whether a JIRA instance is Cloud or Server/DC
 * by calling the /rest/api/2/serverInfo endpoint.
 */

import type { JiraClient } from './JiraClient.js';

/**
 * Result of deployment detection
 */
export interface DeploymentInfo {
  /** Detected deployment type */
  deployment: 'server' | 'cloud';
  /** JIRA version string (e.g., "9.4.0") */
  version: string;
  /** JIRA build number */
  buildNumber: number;
}

/**
 * Raw serverInfo response shape (subset of fields we care about)
 */
interface ServerInfoResponse {
  version: string;
  versionNumbers: number[];
  deploymentType?: string;
  buildNumber: number;
}

/**
 * Detects whether a JIRA instance is Cloud or Server/DC.
 *
 * Calls /rest/api/2/serverInfo (works on both Cloud and Server) and
 * checks the `deploymentType` field. Result is cached for the lifetime
 * of this instance (single detection per JML instance).
 */
export class DeploymentDetector {
  private cachedResult: DeploymentInfo | null = null;

  constructor(private readonly client: JiraClient) {}

  /**
   * Detect the deployment type of the connected JIRA instance.
   * Result is cached after first successful call.
   */
  async detect(): Promise<DeploymentInfo> {
    if (this.cachedResult) {
      return this.cachedResult;
    }

    const response = await this.client.get<ServerInfoResponse>('/rest/api/2/serverInfo');

    const deployment: 'server' | 'cloud' =
      response.deploymentType === 'Cloud' ? 'cloud' : 'server';

    this.cachedResult = {
      deployment,
      version: response.version,
      buildNumber: response.buildNumber,
    };

    return this.cachedResult;
  }

  /**
   * Reset cached detection result. Useful for testing.
   */
  reset(): void {
    this.cachedResult = null;
  }
}

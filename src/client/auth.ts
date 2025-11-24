/**
 * PAT Authentication & Connection Validation
 * Story: E1-S03
 */

import { JiraServerInfo } from '../types/jira.js';
import { AuthenticationError } from '../errors/AuthenticationError.js';
import { NetworkError } from '../errors/NetworkError.js';
import { ConfigurationError } from '../errors/ConfigurationError.js';

/**
 * Sleep utility for retry delays
 * @param ms Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validates connection to JIRA by testing the server info endpoint.
 * Implements retry logic for transient errors (500, 503, timeouts).
 * 
 * @param baseUrl JIRA base URL (e.g., https://jira.company.com)
 * @param token Personal Access Token (PAT)
 * @returns Promise resolving to JIRA server info object
 * @throws {AuthenticationError} if PAT is invalid (401/403)
 * @throws {ConfigurationError} if base URL is invalid (404)
 * @throws {NetworkError} if JIRA is unreachable or returns server errors after retry
 * 
 * @example
 * ```typescript
 * const serverInfo = await validateConnection('https://jira.company.com', 'my-pat-token');
 * console.log(`✅ Connected to ${serverInfo.serverTitle} (${serverInfo.version})`);
 * ```
 */
export async function validateConnection(
  baseUrl: string,
  token: string
): Promise<JiraServerInfo> {
  // Warn if using HTTP instead of HTTPS
  if (baseUrl.startsWith('http://')) {
    console.warn('⚠️  Using HTTP instead of HTTPS. Credentials may be exposed.');
  }

  const url = `${baseUrl}/rest/api/2/serverInfo`;
  const maxRetries = 1; // Retry once (2 total attempts)
  const retryDelayMs = 1000; // 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      // Handle HTTP status codes
      if (!response.ok) {
        // Authentication errors - don't retry
        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError(
            'Authentication failed: PAT is invalid or expired. Check JIRA_PAT in .env file and regenerate if needed.',
            { status: response.status, baseUrl }
          );
        }

        // Configuration errors - don't retry
        if (response.status === 404) {
          throw new ConfigurationError(
            'Invalid base URL or JIRA endpoint not found',
            { field: 'baseUrl', value: baseUrl }
          );
        }

        // Server errors - retry once
        if (response.status === 500 || response.status === 503) {
          if (attempt < maxRetries) {
            await sleep(retryDelayMs);
            continue; // Retry
          }
          throw new NetworkError(
            `JIRA server error (${response.status}): ${response.statusText}`,
            { baseUrl, status: response.status }
          );
        }

        // Other errors - don't retry
        throw new NetworkError(
          `HTTP error (${response.status}): ${response.statusText}`,
          { baseUrl, status: response.status }
        );
      }

      // Success - parse and return server info
      const serverInfo = (await response.json()) as JiraServerInfo;
      return serverInfo;
    } catch (error) {
      // Re-throw known errors immediately (don't retry)
      if (
        error instanceof AuthenticationError ||
        error instanceof ConfigurationError
      ) {
        throw error;
      }

      // Network errors (timeout, connection refused, etc.) - retry once
      if (attempt < maxRetries) {
        await sleep(retryDelayMs);
        continue; // Retry
      }

      // After retry exhaustion, throw NetworkError
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      throw new NetworkError(
        `Failed to connect to JIRA at ${baseUrl}: ${message}`,
        { baseUrl, originalError: message }
      );
    }
  }

  // Should never reach here
  throw new NetworkError(
    `Failed to validate connection after ${maxRetries} retries. Check network connection and JIRA_BASE_URL in .env file.`,
    { baseUrl, attempts: maxRetries }
  );
}

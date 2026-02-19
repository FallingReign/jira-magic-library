/**
 * JIRA Bulk API Wrapper
 * Story: E4-S03
 * 
 * Wrapper around JIRA's /rest/api/2/issue/bulk endpoint for creating
 * multiple issues in a single API call with proper error handling.
 */

import type { JiraClient } from '../client/JiraClient.js';
import type { BulkApiResult } from '../types/bulk.js';
import { ValidationError } from '../errors/ValidationError.js';

/**
 * JIRA bulk API response structure (tested format)
 */
interface JiraBulkApiResponse {
  issues?: Array<{
    id: string;
    key: string;
    self: string;
  }>;
  errors?: Array<{
    status: number;
    elementErrors: {
      errorMessages?: string[];
      errors: Record<string, string>;
    };
    failedElementNumber: number;
  }>;
}

/**
 * Payload format for bulk issue creation
 */
interface BulkIssuePayload {
  fields: Record<string, unknown>;
}

/**
 * Wrapper for JIRA bulk issue creation API
 * 
 * Handles both partial success (HTTP 201) and full failure (HTTP 400) responses,
 * normalizing them into a consistent BulkApiResult format.
 * 
 * @example
 * ```typescript
 * const wrapper = new JiraBulkApiWrapper(jiraClient);
 * 
 * const payloads = [
 *   { fields: { project: { key: 'ENG' }, issuetype: { name: 'Task' }, summary: 'Issue 1' } },
 *   { fields: { project: { key: 'ENG' }, issuetype: { name: 'Bug' }, summary: 'Issue 2' } }
 * ];
 * 
 * const result = await wrapper.createBulk(payloads);
 * 
 * console.log(`Created: ${result.created.length}`);
 * console.log(`Failed: ${result.failed.length}`);
 * ```
 */
export class JiraBulkApiWrapper {
  private readonly bulkTimeout: number;

  /**
   * Creates a new JiraBulkApiWrapper instance
   *
   * @param client - JIRA API client from E1-S05
   * @param bulkTimeout - Optional timeout for bulk operations in milliseconds (default: 30000)
   */
  constructor(
    private readonly client: JiraClient,
    bulkTimeout?: number
  ) {
    this.bulkTimeout = bulkTimeout ?? 30000; // Default 30s for bulk operations
  }

  /**
   * Create multiple issues using JIRA bulk API
   * 
   * Calls POST /rest/api/2/issue/bulk with payload format:
   * `{ issueUpdates: [{ fields: {...} }, ...] }`
   * 
   * Handles both:
   * - Partial success (HTTP 201): Some issues created, some failed
   * - Full failure (HTTP 400): All issues failed
   * 
   * @param payloads - Array of issue payloads with fields
   * @returns Normalized result with created and failed issues
   * 
   * @example
   * ```typescript
   * const result = await wrapper.createBulk([
   *   { fields: { summary: 'Task 1', issuetype: { name: 'Task' } } },
   *   { fields: { summary: 'Task 2', issuetype: { name: 'Task' } } }
   * ]);
   * 
   * result.created.forEach(item => {
   *   console.log(`Row ${item.index}: Created ${item.key}`);
   * });
   * 
   * result.failed.forEach(item => {
   *   console.log(`Row ${item.index}: Failed with errors:`, item.errors);
   * });
   * ```
   */
  async createBulk(
    payloads: BulkIssuePayload[],
    timeoutOverride?: number  // Optional timeout override
  ): Promise<BulkApiResult> {
    try {
      // Use override if provided, else use configured bulkTimeout
      const effectiveTimeout = timeoutOverride ?? this.bulkTimeout;

      // Call JIRA bulk API with effective timeout
      const response = await this.client.post<JiraBulkApiResponse>(
        '/rest/api/2/issue/bulk',
        { issueUpdates: payloads },
        effectiveTimeout // Pass effective timeout to client
      );

      // Normalize response to BulkApiResult
      return this.normalizeResponse(response);
    } catch (error) {
      // Handle HTTP 400 (full failure) - JIRA returns structured response in error
      if (error instanceof ValidationError && error.jiraResponse) {
        // Extract bulk API response from error (HTTP 400 is valid for bulk API)
        const bulkResponse = error.jiraResponse as JiraBulkApiResponse;
        return this.normalizeResponse(bulkResponse);
      }
      // Re-throw other errors (network, auth, etc.)
      throw error;
    }
  }

  /**
   * Normalize JIRA bulk API response to consistent BulkApiResult format
   * 
   * Handles:
   * - HTTP 201 (partial success): Both `issues` and `errors` arrays
   * - HTTP 400 (full failure): Only `errors` array
   * - Maps `failedElementNumber` to row indices
   * - Extracts error details from `elementErrors.errors`
   * 
   * @param response - Raw JIRA bulk API response
   * @returns Normalized BulkApiResult
   * @private
   */
  private normalizeResponse(response: JiraBulkApiResponse): BulkApiResult {
    const created: BulkApiResult['created'] = [];
    const failed: BulkApiResult['failed'] = [];

    // Process successful creations
    if (response.issues) {
      response.issues.forEach((issue, index) => {
        created.push({
          index,
          key: issue.key,
          id: issue.id,
          self: issue.self,
        });
      });
    }

    // Process failures
    if (response.errors) {
      response.errors.forEach((error) => {
        failed.push({
          index: error.failedElementNumber,
          status: error.status,
          errors: error.elementErrors.errors,
        });
      });
    }

    return { created, failed };
  }
}

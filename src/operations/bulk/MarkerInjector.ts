/**
 * Marker Injector
 * Feature: Phase 2.2 - Progress Tracking via Label Markers
 *
 * Injects temporary tracking labels into bulk operations to enable
 * progress detection during long-running operations.
 */

import type { JiraClient } from '../../client/JiraClient.js';
import type { BulkIssuePayload } from '../../types/bulk.js';
import type { Issue } from '../../types/index.js';

/**
 * Options for marker cleanup
 */
export interface MarkerCleanupOptions {
  batchSize?: number;
}

/**
 * Marker Injector
 * Manages tracking labels for bulk operations
 */
export class MarkerInjector {
  private readonly marker: string;

  constructor(
    jobId: string,
    private readonly client?: JiraClient
  ) {
    this.marker = this.generateMarker(jobId);
  }

  /**
   * Get the tracking marker
   */
  getMarker(): string {
    return this.marker;
  }

  /**
   * Generate unique tracking marker
   * Format: jml-job-{jobId}-{timestamp}
   */
  private generateMarker(jobId: string): string {
    // Sanitize job ID to be URL-safe
    const sanitizedJobId = jobId.replace(/[^a-zA-Z0-9-_]/g, '-');

    // Add timestamp for uniqueness
    const timestamp = Date.now();

    // Build marker
    const marker = `jml-job-${sanitizedJobId}-${timestamp}`;

    // Ensure marker fits within JIRA label length limit (255 chars)
    if (marker.length > 255) {
      // Truncate job ID portion if needed
      const maxJobIdLength = 255 - 'jml-job-'.length - String(timestamp).length - 1;
      const truncatedJobId = sanitizedJobId.substring(0, maxJobIdLength);
      return `jml-job-${truncatedJobId}-${timestamp}`;
    }

    return marker;
  }

  /**
   * Inject marker into a single payload
   * Does not mutate original payload
   */
  injectMarker(payload: BulkIssuePayload): BulkIssuePayload {
    // Get existing labels (type-safe)
    const existingLabels = Array.isArray(payload.fields.labels)
      ? payload.fields.labels as string[]
      : [];

    // Deep clone to avoid mutation
    const injected: BulkIssuePayload = {
      ...payload,
      fields: {
        ...payload.fields,
        labels: [...existingLabels]
      }
    };

    // Add marker if not already present
    const labels = injected.fields.labels as string[];
    if (!labels.includes(this.marker)) {
      labels.push(this.marker);
    }

    return injected;
  }

  /**
   * Inject marker into multiple payloads
   */
  injectMarkers(payloads: BulkIssuePayload[]): BulkIssuePayload[] {
    return payloads.map((payload) => this.injectMarker(payload));
  }

  /**
   * Remove marker from a single issue
   */
  async removeMarkerFromIssue(issueKey: string): Promise<void> {
    if (!this.client) {
      throw new Error('JiraClient is required for marker cleanup');
    }

    try {
      await this.client.put(`/rest/api/2/issue/${issueKey}`, {
        update: {
          labels: [
            {
              remove: this.marker
            }
          ]
        }
      });
    } catch (error) {
      // Log error but don't throw - cleanup is best-effort
      console.warn(`Failed to remove marker from ${issueKey}:`, error);
    }
  }

  /**
   * Remove markers from multiple issues
   * Processes in batches to avoid overwhelming API
   */
  async removeMarkersFromIssues(
    issueKeys: string[],
    options: MarkerCleanupOptions = {}
  ): Promise<void> {
    const { batchSize = 10 } = options;

    // Process in batches
    for (let i = 0; i < issueKeys.length; i += batchSize) {
      const batch = issueKeys.slice(i, i + batchSize);

      // Process batch in parallel (within batch)
      await Promise.all(
        batch.map((key) => this.removeMarkerFromIssue(key))
      );
    }
  }

  /**
   * Check if issue has the marker
   */
  hasMarker(issue: Issue): boolean {
    const labels = issue.fields?.labels;

    if (!labels || !Array.isArray(labels)) {
      return false;
    }

    return labels.includes(this.marker);
  }
}

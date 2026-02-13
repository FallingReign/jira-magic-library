/**
 * Bulk Progress Tracker
 * Feature: Phase 2.2 - Progress Tracking via Label Markers
 *
 * Tracks progress of bulk operations by polling JIRA for issues
 * with tracking markers. Uses progress-based timeout (time since
 * last issue created) rather than total operation time.
 */

import type { IssueSearch } from '../IssueSearch.js';
import type { MarkerInjector } from './MarkerInjector.js';

/**
 * Progress tracking configuration
 */
export interface ProgressTrackingConfig {
  totalIssues: number;
  progressTimeout?: number; // Time with no new issues (default: 120s)
  pollingInterval?: number; // Polling frequency (default: 2000ms)
  commonProject?: string; // Scope search by project
  commonIssueType?: string; // Scope search by issue type
}

/**
 * Progress update
 */
export interface ProgressUpdate {
  total: number;
  completed: number;
  inProgress: number;
  progressMade: boolean;
  timeSinceProgress: number;
  isStuck: boolean;
}

/**
 * Progress tracking callback
 */
export type ProgressCallback = (progress: ProgressUpdate) => void;

/**
 * Bulk Progress Tracker
 * Monitors bulk operation progress via label markers
 */
export class BulkProgressTracker {
  private readonly totalIssues: number;
  private readonly progressTimeout: number;
  private readonly pollingInterval: number;
  private readonly commonProject?: string;
  private readonly commonIssueType?: string;
  private readonly startTime: Date;

  private lastKnownCount = 0;
  private lastProgressTime: number;
  private isTracking = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    private readonly issueSearch: IssueSearch,
    private readonly markerInjector: MarkerInjector,
    config: ProgressTrackingConfig
  ) {
    this.totalIssues = config.totalIssues;
    this.progressTimeout = config.progressTimeout ?? 120000; // 120s default
    this.pollingInterval = config.pollingInterval ?? 2000; // 2s default
    this.commonProject = config.commonProject;
    this.commonIssueType = config.commonIssueType;
    this.startTime = new Date();
    this.lastProgressTime = Date.now();
  }

  /**
   * Get current progress without polling
   */
  getProgress(): ProgressUpdate {
    const timeSinceProgress = Date.now() - this.lastProgressTime;
    const isStuck = timeSinceProgress > this.progressTimeout;

    return {
      total: this.totalIssues,
      completed: this.lastKnownCount,
      inProgress: Math.max(0, this.totalIssues - this.lastKnownCount),
      progressMade: false, // Only set during active tracking
      timeSinceProgress,
      isStuck
    };
  }

  /**
   * Check current progress by polling JIRA
   */
  async trackProgress(): Promise<ProgressUpdate> {
    try {
      // Build search criteria
      const searchCriteria: Record<string, unknown> = {
        labels: [this.markerInjector.getMarker()],
        createdSince: this.startTime
      };

      // Scope by common fields if provided
      if (this.commonProject) {
        searchCriteria.project = this.commonProject;
      }

      if (this.commonIssueType) {
        searchCriteria.issueType = this.commonIssueType;
      }

      // Search for issues with marker
      const foundIssues = await this.issueSearch.search(searchCriteria);
      const currentCount = foundIssues.length;

      // Detect progress
      const progressMade = currentCount > this.lastKnownCount;

      if (progressMade) {
        this.lastKnownCount = currentCount;
        this.lastProgressTime = Date.now();
      }

      const timeSinceProgress = Date.now() - this.lastProgressTime;
      const isStuck = timeSinceProgress > this.progressTimeout;

      return {
        total: this.totalIssues,
        completed: currentCount,
        inProgress: Math.max(0, this.totalIssues - currentCount),
        progressMade,
        timeSinceProgress,
        isStuck
      };
    } catch (error) {
      // Handle search errors gracefully - return last known state
      console.warn('Failed to track progress:', error);

      return this.getProgress();
    }
  }

  /**
   * Start continuous tracking with callback
   */
  async startTracking(onProgress: ProgressCallback): Promise<void> {
    if (this.isTracking) {
      return;
    }

    this.isTracking = true;

    // Initial check
    const initialProgress = await this.trackProgress();
    onProgress(initialProgress);

    // Start polling loop
    this.intervalId = setInterval(async () => {
      if (!this.isTracking) {
        return;
      }

      const progress = await this.trackProgress();
      onProgress(progress);

      // Stop if complete or stuck
      if (progress.completed >= this.totalIssues || progress.isStuck) {
        this.stopTracking();
      }
    }, this.pollingInterval);
  }

  /**
   * Stop tracking
   */
  stopTracking(): void {
    this.isTracking = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}

/**
 * Reports bulk create progress from Jira's real bulk replies.
 * No polling: one update per finished group.
 */

import type { ProgressUpdate } from '../../types/bulk.js';

export class BulkProgressReporter {
  private created = 0;
  private failed = 0;
  private lastEmittedCompleted = 0;
  private lastProgressTime = Date.now();

  constructor(
    private readonly total: number,
    private readonly onProgress?: (progress: ProgressUpdate) => void
  ) {}

  /** Count finished rows without notifying (e.g. rows rejected before sending). */
  record(created: number, failed: number): void {
    this.created += created;
    this.failed += failed;
  }

  /** Count finished rows and notify the caller. */
  report(created: number, failed: number): void {
    this.record(created, failed);
    this.emit();
  }

  /** Notify the caller only if rows finished since the last update. */
  flush(): void {
    if (this.created + this.failed > this.lastEmittedCompleted) this.emit();
  }

  private emit(): void {
    if (!this.onProgress) return;
    const completed = this.created + this.failed;
    const progressMade = completed > this.lastEmittedCompleted;
    const now = Date.now();
    if (progressMade) this.lastProgressTime = now;
    this.lastEmittedCompleted = completed;

    try {
      this.onProgress({
        total: this.total,
        completed,
        inProgress: Math.max(0, this.total - completed),
        progressMade,
        timeSinceProgress: now - this.lastProgressTime,
        isStuck: false,
        created: this.created,
        failed: this.failed,
      });
    } catch (error) {
      // A failing callback must not stop the create run.
      console.warn('onProgress callback threw (ignored):', error);
    }
  }
}

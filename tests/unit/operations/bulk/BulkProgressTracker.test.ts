/**
 * Unit tests for Bulk Progress Tracker
 * Feature: Phase 2.2 - Progress Tracking via Label Markers
 *
 * TDD Phase: RED - Tests written first, implementation comes after
 */

import { BulkProgressTracker } from '../../../../src/operations/bulk/BulkProgressTracker.js';
import type { IssueSearch } from '../../../../src/operations/IssueSearch.js';
import type { MarkerInjector } from '../../../../src/operations/bulk/MarkerInjector.js';
import type { Issue } from '../../../../src/types/jira-issue.js';

describe('BulkProgressTracker', () => {
  let mockIssueSearch: jest.Mocked<IssueSearch>;
  let mockMarkerInjector: jest.Mocked<MarkerInjector>;
  let progressTracker: BulkProgressTracker;

  const mockMarker = 'jml-job-test-123-1234567890';

  beforeEach(() => {
    mockIssueSearch = {
      search: jest.fn(),
    } as unknown as jest.Mocked<IssueSearch>;

    mockMarkerInjector = {
      getMarker: jest.fn().mockReturnValue(mockMarker),
      hasMarker: jest.fn(),
    } as unknown as jest.Mocked<MarkerInjector>;
  });

  describe('Initialization', () => {
    it('should initialize with total count and start time', () => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        { totalIssues: 100 }
      );

      const progress = progressTracker.getProgress();

      expect(progress.total).toBe(100);
      expect(progress.completed).toBe(0);
      expect(progress.inProgress).toBe(100);
      expect(progress.progressMade).toBe(false);
      expect(progress.isStuck).toBe(false);
    });

    it('should accept custom configuration', () => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        {
          totalIssues: 50,
          progressTimeout: 60000,
          pollingInterval: 1000
        }
      );

      const progress = progressTracker.getProgress();

      expect(progress.total).toBe(50);
    });

    it('should use default timeouts if not provided', () => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        { totalIssues: 100 }
      );

      // Should not throw and should have reasonable defaults
      expect(progressTracker).toBeDefined();
    });
  });

  describe('Progress Detection', () => {
    beforeEach(() => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        {
          totalIssues: 100,
          progressTimeout: 120000,
          pollingInterval: 2000
        }
      );
    });

    it('should detect progress by counting issues with marker', async () => {
      // Arrange
      const mockIssues: Issue[] = Array.from({ length: 25 }, (_, i) => ({
        key: `TEST-${i + 1}`,
        fields: {
          summary: `Test ${i + 1}`,
          labels: [mockMarker]
        }
      }));

      mockIssueSearch.search.mockResolvedValue(mockIssues);

      // Act
      const progress = await progressTracker.trackProgress();

      // Assert
      expect(progress.completed).toBe(25);
      expect(progress.inProgress).toBe(75);
      expect(progress.progressMade).toBe(true);
      expect(progress.isStuck).toBe(false);
    });

    it('should detect when no progress is made', async () => {
      // First check: 10 issues
      mockIssueSearch.search.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          key: `TEST-${i + 1}`,
          fields: { summary: `Test ${i}`, labels: [mockMarker] }
        }))
      );

      await progressTracker.trackProgress();

      // Second check: Still 10 issues (no progress)
      mockIssueSearch.search.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          key: `TEST-${i + 1}`,
          fields: { summary: `Test ${i}`, labels: [mockMarker] }
        }))
      );

      const progress = await progressTracker.trackProgress();

      expect(progress.completed).toBe(10);
      expect(progress.progressMade).toBe(false);
    });

    it('should track time since last progress', async () => {
      // Initial progress
      mockIssueSearch.search.mockResolvedValue([
        { key: 'TEST-1', fields: { summary: 'Test', labels: [mockMarker] } }
      ]);

      await progressTracker.trackProgress();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check again (no new progress)
      const progress = await progressTracker.trackProgress();

      expect(progress.timeSinceProgress).toBeGreaterThan(90);
      expect(progress.timeSinceProgress).toBeLessThan(200);
    });

    it('should detect stuck state when progress timeout exceeded', async () => {
      // Use short timeout for testing
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        {
          totalIssues: 100,
          progressTimeout: 100 // 100ms
        }
      );

      // Initial state: no issues found
      mockIssueSearch.search.mockResolvedValue([]);

      await progressTracker.trackProgress();

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check again
      const progress = await progressTracker.trackProgress();

      expect(progress.isStuck).toBe(true);
      expect(progress.timeSinceProgress).toBeGreaterThan(100);
    });

    it('should reset progress timer when new issues found', async () => {
      // First check: 10 issues
      mockIssueSearch.search.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          key: `TEST-${i + 1}`,
          fields: { summary: `Test ${i}`, labels: [mockMarker] }
        }))
      );

      await progressTracker.trackProgress();

      // Wait
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second check: 20 issues (progress made!)
      mockIssueSearch.search.mockResolvedValueOnce(
        Array.from({ length: 20 }, (_, i) => ({
          key: `TEST-${i + 1}`,
          fields: { summary: `Test ${i}`, labels: [mockMarker] }
        }))
      );

      const progress = await progressTracker.trackProgress();

      expect(progress.progressMade).toBe(true);
      expect(progress.timeSinceProgress).toBeLessThan(50);
    });
  });

  describe('Scoped Search', () => {
    beforeEach(() => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        {
          totalIssues: 100,
          commonProject: 'TEST',
          commonIssueType: 'Task'
        }
      );
    });

    it('should scope search by common project', async () => {
      mockIssueSearch.search.mockResolvedValue([]);

      await progressTracker.trackProgress();

      expect(mockIssueSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'TEST',
          labels: [mockMarker]
        })
      );
    });

    it('should scope search by common issue type', async () => {
      mockIssueSearch.search.mockResolvedValue([]);

      await progressTracker.trackProgress();

      expect(mockIssueSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          issueType: 'Task',
          labels: [mockMarker]
        })
      );
    });

    it('should include createdSince filter', async () => {
      mockIssueSearch.search.mockResolvedValue([]);

      await progressTracker.trackProgress();

      const searchCall = mockIssueSearch.search.mock.calls[0]?.[0];
      expect(searchCall).toHaveProperty('createdSince');
      expect(searchCall?.createdSince).toBeInstanceOf(Date);
    });
  });

  describe('Continuous Tracking', () => {
    beforeEach(() => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        {
          totalIssues: 100,
          pollingInterval: 50 // Fast for testing
        }
      );
    });

    it('should start continuous tracking with callback', async () => {
      const onProgress = jest.fn();

      // Mock gradual progress
      mockIssueSearch.search
        .mockResolvedValueOnce([
          { key: 'TEST-1', fields: { summary: 'Test 1', labels: [mockMarker] } }
        ])
        .mockResolvedValueOnce([
          { key: 'TEST-1', fields: { summary: 'Test 1', labels: [mockMarker] } },
          { key: 'TEST-2', fields: { summary: 'Test 2', labels: [mockMarker] } }
        ]);

      await progressTracker.startTracking(onProgress);

      // Wait for a few polls
      await new Promise((resolve) => setTimeout(resolve, 150));

      progressTracker.stopTracking();

      // Should have called callback multiple times
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls.length).toBeGreaterThan(1);
    });

    it('should stop tracking when requested', async () => {
      const onProgress = jest.fn();

      mockIssueSearch.search.mockResolvedValue([]);

      await progressTracker.startTracking(onProgress);

      // Stop immediately
      progressTracker.stopTracking();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have minimal calls (just initial)
      expect(onProgress.mock.calls.length).toBeLessThan(3);
    });

    it('should stop tracking when all issues complete', async () => {
      const onProgress = jest.fn();

      // Mock completing all issues
      mockIssueSearch.search.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) => ({
          key: `TEST-${i + 1}`,
          fields: { summary: `Test ${i}`, labels: [mockMarker] }
        }))
      );

      await progressTracker.startTracking(onProgress);

      // Wait for completion detection
      await new Promise((resolve) => setTimeout(resolve, 150));

      const finalProgress = progressTracker.getProgress();

      expect(finalProgress.completed).toBe(100);
      expect(finalProgress.inProgress).toBe(0);
    });

    it('should stop tracking when stuck', async () => {
      const onProgress = jest.fn();

      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        {
          totalIssues: 100,
          pollingInterval: 50,
          progressTimeout: 100 // Short timeout for testing
        }
      );

      // Mock no progress
      mockIssueSearch.search.mockResolvedValue([]);

      await progressTracker.startTracking(onProgress);

      // Wait for stuck detection
      await new Promise((resolve) => setTimeout(resolve, 200));

      const finalProgress = progressTracker.getProgress();

      expect(finalProgress.isStuck).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        { totalIssues: 100 }
      );
    });

    it('should handle search errors gracefully', async () => {
      mockIssueSearch.search.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(progressTracker.trackProgress()).resolves.toBeDefined();

      const progress = progressTracker.getProgress();

      // Should maintain last known state
      expect(progress.completed).toBe(0);
    });

    it('should retry search on transient errors', async () => {
      mockIssueSearch.search
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce([
          { key: 'TEST-1', fields: { summary: 'Test', labels: [mockMarker] } }
        ]);

      // First attempt fails, should retry
      await progressTracker.trackProgress();
      const progress = await progressTracker.trackProgress();

      expect(progress.completed).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero total issues', () => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        { totalIssues: 0 }
      );

      const progress = progressTracker.getProgress();

      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.inProgress).toBe(0);
    });

    it('should handle more issues found than expected', async () => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        { totalIssues: 10 }
      );

      // Mock finding 15 issues (more than expected)
      mockIssueSearch.search.mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({
          key: `TEST-${i + 1}`,
          fields: { summary: `Test ${i}`, labels: [mockMarker] }
        }))
      );

      const progress = await progressTracker.trackProgress();

      expect(progress.completed).toBe(15);
      expect(progress.inProgress).toBe(0); // Can't be negative
    });

    it('should handle very large batch sizes', () => {
      progressTracker = new BulkProgressTracker(
        mockIssueSearch,
        mockMarkerInjector,
        { totalIssues: 10000 }
      );

      const progress = progressTracker.getProgress();

      expect(progress.total).toBe(10000);
    });
  });
});

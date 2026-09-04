import { BulkProgressTracker } from '../../../../src/operations/bulk/BulkProgressTracker.js';

describe('progress tracking lifecycle', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('does not start a timer after being stopped during the initial search', async () => {
    jest.useFakeTimers();
    let finish!: (issues: never[]) => void;
    const search = { search: jest.fn(() => new Promise<never[]>(resolve => { finish = resolve; })) };
    const tracker = new BulkProgressTracker(search as any, { getMarker: () => 'test' } as any, { totalIssues: 1 });
    const callback = jest.fn();
    const starting = tracker.startTracking(callback);
    tracker.stopTracking();
    finish([]);
    await starting;
    expect(jest.getTimerCount()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not poll an already completed operation', async () => {
    jest.useFakeTimers();
    const tracker = new BulkProgressTracker({ search: async () => [{ key: 'TEST-1' }] } as any,
      { getMarker: () => 'test' } as any, { totalIssues: 1 });
    await tracker.startTracking(jest.fn());
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('progress callbacks and pending searches', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  const marker = { getMarker: () => 'test' };
  it('does not start duplicate polling loops', async () => {
    const search = { search: jest.fn().mockResolvedValue([]) };
    const tracker = new BulkProgressTracker(search as any, marker as any, { totalIssues: 1 });
    await tracker.startTracking(jest.fn());
    await tracker.startTracking(jest.fn());
    expect(jest.getTimerCount()).toBe(1);
    tracker.stopTracking();
  });
  it('allows the initial callback to stop tracking', async () => {
    const tracker = new BulkProgressTracker({ search: async () => [] } as any, marker as any, { totalIssues: 1 });
    await tracker.startTracking(() => tracker.stopTracking());
    expect(jest.getTimerCount()).toBe(0);
  });
  it('releases tracking when the initial callback throws', async () => {
    const tracker = new BulkProgressTracker({ search: async () => [] } as any, marker as any, { totalIssues: 1 });
    await expect(tracker.startTracking(() => { throw new Error('callback'); })).rejects.toThrow('callback');
    expect(jest.getTimerCount()).toBe(0);
    await tracker.startTracking(jest.fn());
    expect(jest.getTimerCount()).toBe(1);
    tracker.stopTracking();
  });
  it('stops polling when a later callback fails', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation();
    const callback = jest.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('callback'); });
    const tracker = new BulkProgressTracker({ search: async () => [] } as any, marker as any, { totalIssues: 1, pollingInterval: 10 });
    await tracker.startTracking(callback);
    await jest.advanceTimersByTimeAsync(10);
    expect(jest.getTimerCount()).toBe(0);
    expect(warning).toHaveBeenCalledWith('Progress callback failed:', expect.any(Error));
  });
  it('does not overlap slow searches or deliver a callback after stop', async () => {
    let finish!: (value: never[]) => void;
    const search = { search: jest.fn().mockResolvedValueOnce([]).mockImplementation(() => new Promise<never[]>(resolve => { finish = resolve; })) };
    const callback = jest.fn();
    const tracker = new BulkProgressTracker(search as any, marker as any, { totalIssues: 1, pollingInterval: 10 });
    await tracker.startTracking(callback);
    await jest.advanceTimersByTimeAsync(50);
    expect(search.search).toHaveBeenCalledTimes(2);
    tracker.stopTracking();
    finish([]);
    await jest.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

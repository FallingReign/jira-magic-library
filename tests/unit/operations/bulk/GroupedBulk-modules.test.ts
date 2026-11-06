import { createBulkInGroups } from '../../../../src/operations/bulk/GroupedBulkSender.js';
import { BulkProgressReporter } from '../../../../src/operations/bulk/BulkProgressReporter.js';
import {
  cloneManifest,
  manifestResults,
  markCreated,
  markFailed,
  markNotSent,
  retryableRows,
  unsuccessfulCount,
} from '../../../../src/operations/bulk/ManifestRows.js';
import type { JiraBulkApiWrapper } from '../../../../src/operations/JiraBulkApiWrapper.js';
import type { BulkManifest } from '../../../../src/types/bulk.js';

const payload = { fields: {} };

describe('createBulkInGroups', () => {
  it('offsets group indices and keeps unmatched keys from unconfirmed groups', async () => {
    const createBulk = jest.fn()
      .mockResolvedValueOnce({
        created: [{ index: 0, key: 'T-1', id: '1', self: '' }],
        failed: [{ index: 1, status: 400, errors: { summary: 'bad' } }],
      })
      .mockResolvedValueOnce({ created: [], failed: [], notConfirmed: [0], unmatchedKeys: ['T-9'] });
    const onGroup = jest.fn();

    const result = await createBulkInGroups({ createBulk } as unknown as JiraBulkApiWrapper, [payload, payload, payload], {
      groupSize: 2,
      endpoint: '/bulk',
      onGroup,
    });

    expect(createBulk).toHaveBeenNthCalledWith(1, [payload, payload], undefined, '/bulk');
    expect(result.created).toEqual([{ index: 0, key: 'T-1', id: '1', self: '' }]);
    expect(result.failed[0]!.index).toBe(1);
    expect(result.notConfirmed).toEqual([2]);
    expect(result.unmatchedKeys).toEqual(['T-9']);
    expect(onGroup).toHaveBeenCalledTimes(2);
  });

  it('wraps a non-Error throw and stops sending', async () => {
    const createBulk = jest.fn().mockRejectedValue('boom');

    const result = await createBulkInGroups({ createBulk } as unknown as JiraBulkApiWrapper, [payload, payload, payload], {
      groupSize: 1,
    });

    expect(createBulk).toHaveBeenCalledTimes(1);
    expect(result.notConfirmed).toEqual([0]);
    expect(result.notSent).toEqual([1, 2]);
    expect(result.sendError?.message).toBe('boom');
  });
});

describe('BulkProgressReporter', () => {
  it('keeps going when the progress callback throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reporter = new BulkProgressReporter(2, () => {
      throw new Error('ui crashed');
    });

    expect(() => reporter.report(1, 0)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('flushes only when rows finished since the last update', () => {
    const onProgress = jest.fn();
    const reporter = new BulkProgressReporter(3, onProgress);

    reporter.flush();
    reporter.record(0, 1);
    reporter.flush();
    reporter.flush();

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls[0][0]).toMatchObject({ completed: 1, inProgress: 2, failed: 1 });
  });

  it('reports no progress when a group adds nothing', () => {
    const onProgress = jest.fn();
    const reporter = new BulkProgressReporter(2, onProgress);

    reporter.report(0, 0);

    expect(onProgress.mock.calls[0][0]).toMatchObject({ progressMade: false, isStuck: false });
  });
});

describe('ManifestRows', () => {
  const base = (): BulkManifest => ({
    id: 'm',
    timestamp: 1,
    total: 4,
    succeeded: [0],
    failed: [1],
    notConfirmed: [2],
    created: { 0: 'T-1' },
    errors: { 1: { status: 400, errors: { summary: 'bad' } } },
  });

  it('moves a row to not_sent and resends failed and not_sent rows', () => {
    const manifest = cloneManifest(base());
    markNotSent(manifest, 3);
    markNotSent(manifest, 1);

    expect(manifest.failed).toEqual([]);
    expect(manifest.errors[1]).toBeUndefined();
    expect(manifest.notSent).toEqual([3, 1]);
    expect(retryableRows(manifest)).toEqual([1, 3]);
    expect(unsuccessfulCount(manifest)).toBe(3);
    expect(manifestResults(manifest).map(row => row.outcome)).toEqual(['created', 'not_sent', 'not_confirmed', 'not_sent']);
  });

  it('marks blocked failures and replaces earlier outcomes', () => {
    const manifest = cloneManifest(base());
    markFailed(manifest, 3, { status: 400, errors: { validation: 'Blocked: parent "p" has no confirmed created Jira key' } });
    markCreated(manifest, 2, 'T-3');

    expect(manifest.notConfirmed).toEqual([]);
    expect(manifestResults(manifest)).toEqual([
      { index: 0, success: true, outcome: 'created', key: 'T-1' },
      { index: 1, success: false, outcome: 'failed', error: { status: 400, errors: { summary: 'bad' } } },
      { index: 2, success: true, outcome: 'created', key: 'T-3' },
      {
        index: 3,
        success: false,
        outcome: 'failed',
        error: { status: 400, errors: { validation: 'Blocked: parent "p" has no confirmed created Jira key' } },
        blocked: true,
      },
    ]);
  });
});

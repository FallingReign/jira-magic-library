/**
 * Grouped bulk create (3.1.0): groups are sent one at a time, progress comes
 * from Jira's real replies, and a failed request never gets resent.
 */

import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import { NetworkError } from '../../../src/errors/NetworkError.js';
import { AuthenticationError } from '../../../src/errors/AuthenticationError.js';
import { ConfigurationError } from '../../../src/errors/ConfigurationError.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';
import type { JMLConfig } from '../../../src/types/config.js';
import type { BulkResult, ProgressUpdate } from '../../../src/types/bulk.js';

type Fields = Record<string, unknown>;
type Post = jest.Mock<Promise<unknown>, [string, { issueUpdates: Array<{ fields: Fields }> }, number?]>;

function setup(config?: JMLConfig, failOnCall?: number, failWith: () => Error = () => new NetworkError('socket hang up')): {
  ops: IssueOperations;
  client: { get: jest.Mock; post: Post; put: jest.Mock };
} {
  let nextKey = 1;
  let calls = 0;
  const post: Post = jest.fn(async (_endpoint, body) => {
    calls += 1;
    if (calls === failOnCall) throw failWith();
    return {
      issues: body.issueUpdates.map(() => {
        const id = String(nextKey++);
        return { id, key: `TEST-${id}`, self: `https://jira/rest/api/2/issue/${id}` };
      }),
      errors: [],
    };
  });
  const client = { get: jest.fn(), post, put: jest.fn() };
  const cache = { get: jest.fn().mockResolvedValue({ value: null }), set: jest.fn().mockResolvedValue(undefined) };
  const ops = new IssueOperations(
    client as unknown as JiraClient,
    {} as never,
    {} as never,
    {} as never,
    cache as never,
    undefined,
    config,
  );
  jest.spyOn(ops, 'createSingle').mockImplementation(async (record: Fields) => ({
    fields: {
      summary: record.Summary,
      ...(record.Parent ? { parent: { key: record.Parent } } : {}),
    },
  }) as never);
  return { ops, client };
}

function rows(count: number): Fields[] {
  return Array.from({ length: count }, (_, i) => ({ Project: 'TEST', 'Issue Type': 'Task', Summary: `Row ${i}` }));
}

function epicWithStories(stories: number): Fields[] {
  return [
    { uid: 'epic', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Epic' },
    ...Array.from({ length: stories }, (_, i) => ({
      uid: `story-${i}`,
      Project: 'TEST',
      'Issue Type': 'Story',
      Summary: `Story ${i}`,
      Parent: 'epic',
    })),
  ];
}

function groupSizes(post: Post): number[] {
  return post.mock.calls.map(call => call[1].issueUpdates.length);
}

describe('IssueOperations - grouped bulk create', () => {
  it('creates 1 epic + 25 stories in one epic request and three story requests', async () => {
    const { ops, client } = setup();
    const onProgress = jest.fn<void, [ProgressUpdate]>();

    const result = await ops.create(epicWithStories(25), { onProgress }) as BulkResult;

    expect(groupSizes(client.post)).toEqual([1, 10, 10, 5]);
    expect(result.succeeded).toBe(26);
    expect(result.failed).toBe(0);
    const storyParents = client.post.mock.calls.slice(1)
      .flatMap(call => call[1].issueUpdates.map(update => update.fields.parent));
    expect(storyParents).toHaveLength(25);
    storyParents.forEach(parent => expect(parent).toEqual({ key: 'TEST-1' }));

    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(onProgress.mock.calls.map(([update]) => update.completed)).toEqual([1, 11, 21, 26]);
    expect(onProgress.mock.calls[3]![0]).toMatchObject({
      total: 26,
      completed: 26,
      inProgress: 0,
      created: 26,
      failed: 0,
      progressMade: true,
      isStuck: false,
    });
  });

  it('stops after a failed story group: created, not_confirmed, then not_sent', async () => {
    const { ops, client } = setup(undefined, 3);
    const onProgress = jest.fn<void, [ProgressUpdate]>();

    const result = await ops.create(epicWithStories(25), { onProgress }) as BulkResult;

    // Epic, story group 1, story group 2 (throws). Group 3 is never sent and nothing is resent.
    expect(groupSizes(client.post)).toEqual([1, 10, 10]);
    const outcome = (index: number): string | undefined =>
      result.results.find(row => row.index === index)?.outcome;
    expect(outcome(0)).toBe('created');
    for (let i = 1; i <= 10; i++) expect(outcome(i)).toBe('created');
    for (let i = 11; i <= 20; i++) expect(outcome(i)).toBe('not_confirmed');
    for (let i = 21; i <= 25; i++) expect(outcome(i)).toBe('not_sent');

    expect(result.succeeded).toBe(11);
    expect(result.failed).toBe(15);
    expect(result.manifest.notConfirmed).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(result.manifest.notSent).toEqual([21, 22, 23, 24, 25]);
    expect(result.sendError).toEqual({ name: 'NetworkError', message: 'socket hang up' });
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, 'Authentication failed: Unauthorized'],
    [403, 'Forbidden: no permission'],
  ])('marks a story group refused with %i not_sent, not not_confirmed', async (status, message) => {
    const { ops, client } = setup(undefined, 3, () => new AuthenticationError(message, { status }));

    const result = await ops.create(epicWithStories(25)) as BulkResult;

    expect(groupSizes(client.post)).toEqual([1, 10, 10]);
    const outcome = (index: number): string | undefined =>
      result.results.find(row => row.index === index)?.outcome;
    for (let i = 0; i <= 10; i++) expect(outcome(i)).toBe('created');
    for (let i = 11; i <= 25; i++) expect(outcome(i)).toBe('not_sent');

    expect(result.succeeded).toBe(11);
    expect(result.failed).toBe(15);
    expect(result.manifest.notConfirmed).toBeUndefined();
    expect(result.manifest.notSent).toEqual(Array.from({ length: 15 }, (_, i) => i + 11));
    expect(result.sendError).toEqual({ name: 'AuthenticationError', message });
  });

  it.each([401, 403])('marks a flat group refused with %i and all later groups not_sent', async status => {
    const { ops, client } = setup(undefined, 2, () => new AuthenticationError('refused', { status }));

    const result = await ops.create(rows(25)) as BulkResult;

    expect(groupSizes(client.post)).toEqual([10, 10]);
    expect(result.succeeded).toBe(10);
    expect(result.manifest.notConfirmed).toBeUndefined();
    expect(result.manifest.notSent).toEqual(Array.from({ length: 15 }, (_, i) => i + 10));
    expect(result.results.filter(row => row.outcome === 'not_sent')).toHaveLength(15);
    expect(result.sendError?.name).toBe('AuthenticationError');
  });

  it('marks every later level not_sent when a parent level request fails', async () => {
    const { ops, client } = setup(undefined, 1);

    const result = await ops.create(epicWithStories(3)) as BulkResult;

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(result.manifest.notConfirmed).toEqual([0]);
    expect(result.manifest.notSent).toEqual([1, 2, 3]);
    expect(result.results.filter(row => row.outcome === 'not_sent')).toHaveLength(3);
  });

  it('splits a flat batch into groups of the default size 10', async () => {
    const { ops, client } = setup();
    const onProgress = jest.fn<void, [ProgressUpdate]>();

    const result = await ops.create(rows(23), { onProgress }) as BulkResult;

    expect(groupSizes(client.post)).toEqual([10, 10, 3]);
    expect(result.succeeded).toBe(23);
    expect(onProgress.mock.calls.map(([update]) => update.completed)).toEqual([10, 20, 23]);
  });

  it('uses the configured group size', async () => {
    const { ops, client } = setup({ bulk: { groupSize: 4 } } as JMLConfig);

    await ops.create(rows(9));

    expect(groupSizes(client.post)).toEqual([4, 4, 1]);
  });

  it('marks later flat groups not_sent after a request throws', async () => {
    const { ops, client } = setup(undefined, 2);

    const result = await ops.create(rows(25)) as BulkResult;

    expect(groupSizes(client.post)).toEqual([10, 10]);
    expect(result.manifest.succeeded).toHaveLength(10);
    expect(result.manifest.notConfirmed).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(result.manifest.notSent).toEqual([20, 21, 22, 23, 24]);
    expect(result.results.find(row => row.index === 24)).toEqual({
      index: 24,
      success: false,
      outcome: 'not_sent',
    });
  });

  it.each([0, 51, 2.5, -1])('rejects group size %p', (groupSize) => {
    expect(() => setup({ bulk: { groupSize } } as JMLConfig)).toThrow(ConfigurationError);
  });

  it('accepts the Jira Cloud maximum of 50', async () => {
    const { ops, client } = setup({ bulk: { groupSize: 50 } } as JMLConfig);

    await ops.create(rows(51));

    expect(groupSizes(client.post)).toEqual([50, 1]);
  });

  it('adds no labels, runs no searches and edits no issues', async () => {
    const { ops, client } = setup();

    await ops.create(epicWithStories(12), { onProgress: jest.fn() });

    client.post.mock.calls.forEach(call => {
      expect(call[0]).toBe('/rest/api/2/issue/bulk');
      call[1].issueUpdates.forEach(update => expect(update.fields.labels).toBeUndefined());
    });
    expect(client.get).not.toHaveBeenCalled();
    expect(client.put).not.toHaveBeenCalled();
  });

  it('uses timeout.bulk for every group whether or not onProgress is passed', async () => {
    const { ops, client } = setup({ timeout: { bulk: 12345 } } as JMLConfig);

    await ops.create(rows(12), { onProgress: jest.fn() });
    await ops.create(rows(3));

    client.post.mock.calls.forEach(call => expect(call[2]).toBe(12345));
  });

  it('counts validation failures as completed in progress', async () => {
    const { ops } = setup();
    (ops.createSingle as jest.Mock).mockImplementation(async (record: Fields) => {
      if (record.Summary === 'Row 1') throw new Error('bad row');
      return { fields: { summary: record.Summary } };
    });
    const onProgress = jest.fn<void, [ProgressUpdate]>();

    await ops.create(rows(3), { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls[0]![0]).toMatchObject({ total: 3, completed: 3, created: 2, failed: 1 });
  });

  it('marks retried child levels not_sent when the retried parent request fails', async () => {
    const { ops, client } = setup(undefined, 2);
    let storyAttempts = 0;
    (ops.createSingle as jest.Mock).mockImplementation(async (record: Fields) => {
      if (record.Summary === 'Story' && storyAttempts++ === 0) throw new Error('bad story');
      return { fields: { summary: record.Summary } };
    });
    const input = [
      { uid: 'epic', Project: 'TEST', 'Issue Type': 'Epic', Summary: 'Epic' },
      { uid: 'story', Project: 'TEST', 'Issue Type': 'Story', Summary: 'Story', Parent: 'epic' },
      { uid: 'task', Project: 'TEST', 'Issue Type': 'Sub-task', Summary: 'Task', Parent: 'story' },
    ];
    const first = await ops.create(input) as BulkResult;
    expect(first.results.find(row => row.index === 2)).toMatchObject({ outcome: 'failed', blocked: true });
    const storage = (ops as unknown as { manifestStorage: { getManifest: jest.Mock } }).manifestStorage;
    jest.spyOn(storage, 'getManifest').mockResolvedValue(first.manifest);

    const retried = await ops.create(input, { retry: first.manifest.id }) as BulkResult;

    expect(client.post).toHaveBeenCalledTimes(2);
    expect(retried.manifest.notConfirmed).toEqual([1]);
    expect(retried.manifest.notSent).toEqual([2]);
    expect(retried.sendError?.name).toBe('NetworkError');
  });

  it('resends only failed and not_sent rows on retry', async () => {
    const { ops, client } = setup(undefined, 2);
    const first = await ops.create(rows(25)) as BulkResult;
    const cache = (ops as unknown as { manifestStorage: { getManifest: jest.Mock } }).manifestStorage;
    jest.spyOn(cache, 'getManifest').mockResolvedValue(first.manifest);
    client.post.mockClear();

    const retried = await ops.create(rows(25), { retry: first.manifest.id }) as BulkResult;

    expect(groupSizes(client.post)).toEqual([5]);
    expect(retried.manifest.succeeded).toHaveLength(15);
    expect(retried.manifest.notConfirmed).toHaveLength(10);
    expect(retried.manifest.notSent).toBeUndefined();
  });
});

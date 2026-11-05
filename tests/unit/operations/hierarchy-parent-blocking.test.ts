import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import type { HierarchyLevel } from '../../../src/operations/bulk/HierarchyLevels.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';

describe('bulk hierarchy parent confirmation', () => {
  it('handles an unconfirmed bulk result without an unmatchedKeys field', async () => {
    const client = {
      get: jest.fn(),
      post: jest.fn(),
    } as unknown as JiraClient;
    const cache = { get: jest.fn(), set: jest.fn().mockResolvedValue(undefined) };
    const operations = new IssueOperations(
      client,
      {} as never,
      {} as never,
      {} as never,
      cache as never,
      undefined,
      { timeout: { cleanupMarkers: false } } as never,
    );
    (operations as any).bulkApiWrapper = {
      createBulk: jest.fn().mockResolvedValue({
        created: [],
        failed: [],
        notConfirmed: [0],
      }),
    };
    jest.spyOn(operations, 'createSingle').mockResolvedValue({
      fields: { project: { key: 'TEST' }, summary: 'Issue' },
    } as never);

    const result = await operations.createBulkHierarchy([
      { depth: 0, issues: [{ index: 0, record: { uid: 'root' } }] },
    ], { root: 0 });

    expect(result.manifest.notConfirmed).toEqual([0]);
    expect(result.unmatchedKeys).toEqual([]);
  });

  it('blocks descendants and retains unmatched keys when a parent is not confirmed', async () => {
    const client = {
      get: jest.fn(),
      post: jest.fn().mockResolvedValue({
        issues: [
          { id: '90', key: 'TEST-90', self: 'https://jira/rest/api/2/issue/90' },
          { id: '91', key: 'TEST-91', self: 'https://jira/rest/api/2/issue/91' },
        ],
        errors: [],
      }),
    } as unknown as JiraClient;
    const cache = { get: jest.fn(), set: jest.fn().mockResolvedValue(undefined) };
    const operations = new IssueOperations(
      client,
      {} as never,
      {} as never,
      {} as never,
      cache as never,
      undefined,
      { timeout: { cleanupMarkers: false } } as never,
    );
    const createSingle = jest.spyOn(operations, 'createSingle').mockResolvedValue({
      fields: { project: { key: 'TEST' }, summary: 'Issue' },
    } as never);

    const result = await operations.createBulkHierarchy([
      { depth: 0, issues: [{ index: 0, record: { uid: 'parent' } }] },
      { depth: 1, issues: [{ index: 1, record: { uid: 'child', Parent: 'parent' } }] },
    ], { parent: 0, child: 1 });

    expect(client.post).toHaveBeenCalledTimes(1);
    expect(createSingle).toHaveBeenCalledTimes(1);
    expect(result.manifest.notConfirmed).toEqual([0]);
    expect(result.unmatchedKeys).toEqual(['TEST-90', 'TEST-91']);
    expect(result.results.find(row => row.index === 1)).toMatchObject({
      success: false,
      outcome: 'failed',
      blocked: true,
    });
  });

  it('blocks descendants when an internal parent fails and does not submit them', async () => {
    const client = {
      get: jest.fn(),
      post: jest.fn().mockResolvedValue({
        issues: [],
        errors: [{
          status: 400,
          failedElementNumber: 0,
          elementErrors: { errors: { summary: 'Summary is required' } },
        }],
      }),
    } as unknown as JiraClient;
    const cache = {
      get: jest.fn().mockResolvedValue({ value: null, isStale: false }),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const operations = new IssueOperations(
      client,
      {} as never,
      {} as never,
      {} as never,
      cache as never,
      undefined,
      { timeout: { cleanupMarkers: false } } as never,
    );
    const createSingle = jest.spyOn(operations, 'createSingle').mockResolvedValue({
      fields: { project: { key: 'TEST' }, summary: 'Parent' },
    } as never);
    const levels: HierarchyLevel[] = [
      { depth: 0, issues: [{ index: 0, record: { uid: 'parent', Summary: 'Parent' } }] },
      { depth: 1, issues: [{ index: 1, record: { uid: 'child', Parent: 'parent', Summary: 'Child' } }] },
      { depth: 2, issues: [{ index: 2, record: { uid: 'grandchild', Parent: 'child', Summary: 'Grandchild' } }] },
    ];

    const result = await operations.createBulkHierarchy(
      levels,
      { parent: 0, child: 1, grandchild: 2 },
    );

    expect(client.post).toHaveBeenCalledTimes(1);
    expect((client.post as jest.Mock).mock.calls[0][1].issueUpdates).toHaveLength(1);
    expect(createSingle).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toMatchObject({ index: 0, success: false, outcome: 'failed' });
    expect(result.results[1]).toMatchObject({ index: 1, success: false, outcome: 'failed', blocked: true });
    expect(result.results[2]).toMatchObject({ index: 2, success: false, outcome: 'failed', blocked: true });
    expect(result.results[1].error?.errors.validation).toContain('Blocked: parent "parent"');
    expect(result.results[2].error?.errors.validation).toContain('Blocked: parent "child"');
  });
});

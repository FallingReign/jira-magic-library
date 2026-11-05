import { ErrorNormalizer } from '../../../src/operations/ErrorNormalizer.js';
import { JiraBulkApiWrapper } from '../../../src/operations/JiraBulkApiWrapper.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';

const issue = (key: string): { id: string; key: string; self: string } => ({
  id: key.replace(/\D/g, ''),
  key,
  self: `https://jira.example.test/rest/api/2/issue/${key}`,
});

const failure = (failedElementNumber: number): {
  status: number;
  failedElementNumber: number;
  elementErrors: { errors: Record<string, string>; errorMessages: string[] };
} => ({
  status: 400,
  failedElementNumber,
  elementErrors: { errors: { summary: 'Summary is required' }, errorMessages: [] },
});

const payloads = (count: number): Array<{ fields: Record<string, unknown> }> =>
  Array.from({ length: count }, () => ({ fields: {} }));

describe('shared Jira bulk row mapping', () => {
  let post: jest.Mock;
  let wrapper: JiraBulkApiWrapper;

  beforeEach(() => {
    post = jest.fn();
    wrapper = new JiraBulkApiWrapper({ post } as unknown as JiraClient);
  });

  it.each([
    { failedIndex: 0, successIndices: [1, 2] },
    { failedIndex: 1, successIndices: [0, 2] },
    { failedIndex: 2, successIndices: [0, 1] },
  ])('maps a failure at request row $failedIndex', async ({ failedIndex, successIndices }) => {
    post.mockResolvedValue({
      issues: successIndices.map(index => issue(`TEST-${index + 1}`)),
      errors: [failure(failedIndex)],
    });

    const result = await wrapper.createBulk(payloads(3));
    expect(result.created.map(row => row.index)).toEqual(successIndices);
    expect(result.failed.map(row => row.index)).toEqual([failedIndex]);
    expect(result.notConfirmed).toBeUndefined();
  });

  it('maps multiple failures while consuming successes in request order', async () => {
    post.mockResolvedValue({
      issues: [issue('TEST-2'), issue('TEST-4')],
      errors: [failure(0), failure(2)],
    });

    const result = await wrapper.createBulk(payloads(4));
    expect(result.created.map(row => [row.index, row.key])).toEqual([[1, 'TEST-2'], [3, 'TEST-4']]);
    expect(result.failed.map(row => row.index)).toEqual([0, 2]);
  });

  it('maps all-success responses', async () => {
    post.mockResolvedValue({ issues: [issue('TEST-1'), issue('TEST-2')], errors: [] });
    const result = await wrapper.createBulk(payloads(2));
    expect(result.created.map(row => row.index)).toEqual([0, 1]);
    expect(result.failed).toEqual([]);
  });

  it('maps an all-failure HTTP 400 response', async () => {
    const response = { issues: [], errors: [failure(0), failure(1)] };
    post.mockRejectedValue(new ValidationError('Bulk create failed', undefined, response));

    const result = await wrapper.createBulk(payloads(2));
    expect(result.created).toEqual([]);
    expect(result.failed.map(row => row.index)).toEqual([0, 1]);
    expect(result.notConfirmed).toBeUndefined();
  });

  it('does not assign successes when response counts mismatch', async () => {
    post.mockResolvedValue({ issues: [issue('TEST-1')], errors: [failure(1)] });
    const result = await wrapper.createBulk(payloads(3));

    expect(result.created).toEqual([]);
    expect(result.failed.map(row => row.index)).toEqual([1]);
    expect(result.notConfirmed).toEqual([0, 2]);
    expect(result.unmatchedKeys).toEqual(['TEST-1']);
  });

  it('does not assign rows for an out-of-range failure position', async () => {
    post.mockResolvedValue({ issues: [issue('TEST-1')], errors: [failure(4)] });
    const result = await wrapper.createBulk(payloads(2));

    expect(result.created).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.notConfirmed).toEqual([0, 1]);
    expect(result.unmatchedKeys).toEqual(['TEST-1']);
  });

  it('does not assign rows for duplicate failure positions', async () => {
    post.mockResolvedValue({
      issues: [issue('TEST-1')],
      errors: [failure(1), failure(1)],
    });
    const result = await wrapper.createBulk(payloads(3));

    expect(result.created).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.notConfirmed).toEqual([0, 1, 2]);
    expect(result.unmatchedKeys).toEqual(['TEST-1']);
  });

  it('preserves a known failure but does not assign duplicate created keys', async () => {
    post.mockResolvedValue({
      issues: [issue('TEST-1'), issue('TEST-1')],
      errors: [failure(2)],
    });
    const result = await wrapper.createBulk(payloads(3));

    expect(result.created).toEqual([]);
    expect(result.failed.map(row => row.index)).toEqual([2]);
    expect(result.notConfirmed).toEqual([0, 1]);
    expect(result.unmatchedKeys).toEqual(['TEST-1', 'TEST-1']);
  });

  it('uses the same row mapping in JiraBulkApiWrapper and ErrorNormalizer', async () => {
    const response = {
      issues: [issue('TEST-1'), issue('TEST-3')],
      errors: [failure(1)],
    };
    post.mockResolvedValue(response);

    const wrapped = await wrapper.createBulk(payloads(3));
    const normalized = new ErrorNormalizer('https://jira.example.test').normalizeBulk(response, 3);

    expect(normalized.successes.map(row => row.rowIndex)).toEqual(wrapped.created.map(row => row.index));
    expect(normalized.errors.map(row => row.rowIndex)).toEqual(wrapped.failed.map(row => row.index));
  });
});

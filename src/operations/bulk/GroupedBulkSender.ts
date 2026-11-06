/**
 * Sends bulk create payloads in fixed-size groups, one request at a time,
 * in row order. Stops at the first request that throws.
 */

import { AuthenticationError } from '../../errors/AuthenticationError.js';
import type { JiraBulkApiWrapper } from '../JiraBulkApiWrapper.js';
import type { BulkApiResult, BulkIssuePayload } from '../../types/bulk.js';

/** Combined result of all groups. Indices refer to the `payloads` array. */
export interface GroupedBulkResult {
  created: BulkApiResult['created'];
  failed: BulkApiResult['failed'];
  /** Rows sent but not safely confirmed (unmatched reply, or the request threw) */
  notConfirmed: number[];
  /** Rows never sent because an earlier group threw */
  notSent: number[];
  /** Keys Jira returned that could not be matched to rows */
  unmatchedKeys?: string[];
  /** The error that stopped sending, if any */
  sendError?: Error;
}

export interface GroupedBulkOptions {
  groupSize: number;
  endpoint?: string;
  /** Called after each group that returned a reply, with that group's offset result */
  onGroup?: (group: BulkApiResult) => void;
}

function offsetResult(result: BulkApiResult, offset: number): BulkApiResult {
  return {
    created: result.created.map(item => ({ ...item, index: item.index + offset })),
    failed: result.failed.map(item => ({ ...item, index: item.index + offset })),
    ...(result.notConfirmed ? { notConfirmed: result.notConfirmed.map(index => index + offset) } : {}),
    ...(result.unmatchedKeys ? { unmatchedKeys: result.unmatchedKeys } : {}),
  };
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
}

/**
 * Create issues in groups of `groupSize`, sequentially. If a request throws,
 * its rows become `notConfirmed` (or `notSent` when Jira refused it with
 * 401/403), later rows become `notSent`, and no more requests are sent.
 */
export async function createBulkInGroups(
  wrapper: JiraBulkApiWrapper,
  payloads: BulkIssuePayload[],
  options: GroupedBulkOptions
): Promise<GroupedBulkResult> {
  const result: GroupedBulkResult = { created: [], failed: [], notConfirmed: [], notSent: [] };

  for (let start = 0; start < payloads.length; start += options.groupSize) {
    const end = Math.min(start + options.groupSize, payloads.length);
    let group: BulkApiResult;
    try {
      group = offsetResult(
        await wrapper.createBulk(payloads.slice(start, end), undefined, options.endpoint),
        start
      );
    } catch (error) {
      // 401/403: Jira refused the request, so nothing in this group was created.
      if (error instanceof AuthenticationError) {
        result.notSent.push(...range(start, payloads.length));
      } else {
        result.notConfirmed.push(...range(start, end));
        result.notSent.push(...range(end, payloads.length));
      }
      result.sendError = error instanceof Error ? error : new Error(String(error));
      return result;
    }

    result.created.push(...group.created);
    result.failed.push(...group.failed);
    result.notConfirmed.push(...(group.notConfirmed ?? []));
    if (group.notConfirmed) {
      result.unmatchedKeys = [...(result.unmatchedKeys ?? []), ...(group.unmatchedKeys ?? [])];
    }
    options.onGroup?.(group);
  }

  return result;
}

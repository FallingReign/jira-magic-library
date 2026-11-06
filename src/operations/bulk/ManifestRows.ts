/**
 * Row bookkeeping for bulk manifests: moves a row between outcome lists and
 * rebuilds per-row results. Shared by create and retry paths so every path
 * treats `created`, `failed`, `not_confirmed` and `not_sent` the same way.
 */

import type { BulkManifest, BulkResult } from '../../types/bulk.js';

type RowError = BulkManifest['errors'][number];

export function cloneManifest(manifest: BulkManifest): BulkManifest {
  return {
    ...manifest,
    succeeded: [...manifest.succeeded],
    failed: [...manifest.failed],
    ...(manifest.notConfirmed?.length ? { notConfirmed: [...manifest.notConfirmed] } : { notConfirmed: undefined }),
    ...(manifest.notSent?.length ? { notSent: [...manifest.notSent] } : { notSent: undefined }),
    created: { ...manifest.created },
    errors: { ...manifest.errors },
    ...(manifest.uidMap ? { uidMap: { ...manifest.uidMap } } : {}),
  };
}

function removeFromLists(manifest: BulkManifest, index: number): void {
  manifest.succeeded = manifest.succeeded.filter(i => i !== index);
  manifest.failed = manifest.failed.filter(i => i !== index);
  if (manifest.notConfirmed) manifest.notConfirmed = manifest.notConfirmed.filter(i => i !== index);
  if (manifest.notSent) manifest.notSent = manifest.notSent.filter(i => i !== index);
  delete manifest.errors[index];
}

export function markCreated(manifest: BulkManifest, index: number, key: string): void {
  removeFromLists(manifest, index);
  manifest.succeeded.push(index);
  manifest.created[index] = key;
}

export function markFailed(manifest: BulkManifest, index: number, error: RowError): void {
  removeFromLists(manifest, index);
  manifest.failed.push(index);
  manifest.errors[index] = error;
}

export function markNotConfirmed(manifest: BulkManifest, index: number): void {
  removeFromLists(manifest, index);
  (manifest.notConfirmed ??= []).push(index);
}

export function markNotSent(manifest: BulkManifest, index: number): void {
  removeFromLists(manifest, index);
  (manifest.notSent ??= []).push(index);
}

/** Drop empty optional lists so stored manifests stay compact. */
export function compactManifest(manifest: BulkManifest): BulkManifest {
  if (!manifest.notConfirmed?.length) delete manifest.notConfirmed;
  if (!manifest.notSent?.length) delete manifest.notSent;
  return manifest;
}

/** Rows a retry should resend: confirmed failures plus rows never sent. */
export function retryableRows(manifest: BulkManifest): number[] {
  const rows = new Set([...manifest.failed, ...(manifest.notSent ?? [])]);
  for (const index of [...manifest.succeeded, ...(manifest.notConfirmed ?? [])]) rows.delete(index);
  return [...rows].sort((a, b) => a - b);
}

/** Per-row results for every row in the manifest, in row order. */
export function manifestResults(manifest: BulkManifest): BulkResult['results'] {
  const results: BulkResult['results'] = [];
  for (let i = 0; i < manifest.total; i++) {
    if (manifest.succeeded.includes(i)) {
      results.push({ index: i, success: true, outcome: 'created', key: manifest.created[i] });
    } else if (manifest.notConfirmed?.includes(i)) {
      results.push({ index: i, success: false, outcome: 'not_confirmed' });
    } else if (manifest.failed.includes(i)) {
      const error = manifest.errors[i];
      if (error) {
        results.push({
          index: i,
          success: false,
          outcome: 'failed',
          error: { status: error.status, errors: error.errors },
          ...(error.errors.validation?.startsWith('Blocked:') ? { blocked: true } : {}),
        });
      }
    } else if (manifest.notSent?.includes(i)) {
      results.push({ index: i, success: false, outcome: 'not_sent' });
    }
  }
  return results;
}

/** Rows that did not end as created. */
export function unsuccessfulCount(manifest: BulkManifest): number {
  return manifest.failed.length + (manifest.notConfirmed?.length ?? 0) + (manifest.notSent?.length ?? 0);
}

export function toSendError(error?: Error): BulkResult['sendError'] {
  return error ? { name: error.name, message: error.message } : undefined;
}

export interface BulkResponseIssue {
  id?: string;
  key?: string;
  self?: string;
  errors?: Record<string, string>;
  errorMessages?: string[];
  status?: number;
}

export interface BulkResponseFailure {
  status: number;
  failedElementNumber: number;
  elementErrors?: {
    errors?: Record<string, string>;
    errorMessages?: string[];
  };
}

export interface MappedBulkRow {
  index: number;
  outcome: 'created' | 'failed' | 'not_confirmed';
  issue?: BulkResponseIssue;
  failure?: BulkResponseFailure;
}

export interface MappedBulkResponse {
  rows: MappedBulkRow[];
  invariantFailed: boolean;
  unmatchedKeys?: string[];
}

/**
 * Maps Jira's compact success list back to request positions using its indexed
 * failures. Jira's success list is assumed to retain request order.
 */
export function mapBulkResponseRows(
  response: { issues?: BulkResponseIssue[]; errors?: BulkResponseFailure[] },
  rowCount: number
): MappedBulkResponse {
  const issues = Array.isArray(response.issues) ? response.issues : [];
  const errors = Array.isArray(response.errors) ? response.errors : [];
  const cloudFailures = issues.flatMap((issue, index) => {
    if (!issue.errors || Object.keys(issue.errors).length === 0) return [];
    return [{
      status: issue.status ?? 400,
      failedElementNumber: index,
      elementErrors: {
        errors: issue.errors,
        errorMessages: issue.errorMessages,
      },
    }];
  });
  const positionalCloudResponse = cloudFailures.length > 0 && errors.length === 0;
  const failures = [...errors, ...(positionalCloudResponse ? cloudFailures : [])];
  const failureIndexes = new Map<number, BulkResponseFailure[]>();

  for (const failure of failures) {
    const index = failure.failedElementNumber;
    if (!Number.isInteger(index) || index < 0 || index >= rowCount) continue;
    const indexed = failureIndexes.get(index) ?? [];
    indexed.push(failure);
    failureIndexes.set(index, indexed);
  }

  const createdIssues = issues.filter(issue =>
    (!issue.errors || Object.keys(issue.errors).length === 0) &&
    typeof issue.key === 'string' &&
    issue.key.length > 0
  );
  const createdKeys = createdIssues.map(issue => issue.key!);
  const uniqueFailures = failures.every(failure =>
    Number.isInteger(failure.failedElementNumber) &&
    failure.failedElementNumber >= 0 &&
    failure.failedElementNumber < rowCount &&
    failureIndexes.get(failure.failedElementNumber)?.length === 1
  );
  const uniqueCreatedKeys = new Set(createdKeys).size === createdKeys.length;
  const responseCountsMatch = createdIssues.length + failures.length === rowCount;
  const cloudPositionsMatch = !positionalCloudResponse || issues.length === rowCount;
  const invariantsHold = uniqueFailures && uniqueCreatedKeys && responseCountsMatch && cloudPositionsMatch;

  if (!invariantsHold) {
    const rows: MappedBulkRow[] = [];
    for (let index = 0; index < rowCount; index++) {
      const rowFailures = failureIndexes.get(index) ?? [];
      if (rowFailures.length === 1) {
        rows.push({ index, outcome: 'failed', failure: rowFailures[0] });
      } else {
        rows.push({ index, outcome: 'not_confirmed' });
      }
    }
    return {
      rows,
      invariantFailed: true,
      unmatchedKeys: createdKeys,
    };
  }

  const rows: MappedBulkRow[] = [];
  let createdPosition = 0;
  for (let index = 0; index < rowCount; index++) {
    const failure = failureIndexes.get(index)?.[0];
    if (failure) {
      rows.push({ index, outcome: 'failed', failure });
    } else {
      const issue = positionalCloudResponse ? issues[index] : createdIssues[createdPosition++];
      rows.push({ index, outcome: 'created', issue });
    }
  }
  return { rows, invariantFailed: false };
}

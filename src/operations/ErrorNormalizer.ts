/**
 * Error Normalizer
 *
 * Normalizes Jira error responses (Cloud and Server) into a consistent
 * structure for user-facing error reporting.
 */

export interface NormalizedError {
  rowIndex: number;
  field?: string;
  code: 'REQUIRED_FIELD' | 'INVALID_VALUE' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'SERVER_ERROR';
  message: string;
  jiraMessage?: string;
  suggestion?: string;
}

export interface NormalizedBulkResult {
  successes: Array<{ rowIndex: number; issueKey: string; issueUrl: string }>;
  errors: NormalizedError[];
  summary: { total: number; created: number; failed: number };
}

/**
 * Cloud bulk API response structure
 */
interface CloudBulkApiResponse {
  issues?: Array<{
    id?: string;
    key?: string;
    self?: string;
    status?: number;
    errors?: Record<string, string>;
    errorMessages?: string[];
  }>;
  errors?: Array<{
    status: number;
    elementErrors: {
      errorMessages?: string[];
      errors: Record<string, string>;
    };
    failedElementNumber: number;
  }>;
}

/**
 * Server bulk API response structure (matches JiraBulkApiWrapper)
 */
interface ServerBulkApiResponse {
  issues?: Array<{
    id: string;
    key: string;
    self: string;
  }>;
  errors?: Array<{
    status: number;
    elementErrors: {
      errorMessages?: string[];
      errors: Record<string, string>;
    };
    failedElementNumber: number;
  }>;
}

export type BulkApiResponse = CloudBulkApiResponse | ServerBulkApiResponse;

export class ErrorNormalizer {
  constructor(private readonly baseUrl: string) {}

  /** Normalize a single create error */
  normalizeSingle(error: unknown, rowIndex: number): NormalizedError[] {
    const errors: NormalizedError[] = [];

    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;

      // HTTP status-based classification
      const status = (err.status as number) || (err.statusCode as number) || 0;
      if (status === 403) {
        errors.push({
          rowIndex,
          code: 'PERMISSION_DENIED',
          message: 'Permission denied to create issue',
          jiraMessage: this.extractMessage(error),
        });
        return errors;
      }
      if (status === 404) {
        errors.push({
          rowIndex,
          code: 'NOT_FOUND',
          message: 'Project or issue type not found',
          jiraMessage: this.extractMessage(error),
        });
        return errors;
      }
      if (status >= 500) {
        errors.push({
          rowIndex,
          code: 'SERVER_ERROR',
          message: 'Jira server error',
          jiraMessage: this.extractMessage(error),
        });
        return errors;
      }

      // Field-level errors
      const fieldErrors = (err.errors as Record<string, string>) || {};
      for (const [field, message] of Object.entries(fieldErrors)) {
        const parsed = this.parseFieldError(field, message);
        errors.push({ rowIndex, ...parsed });
      }

      // Error messages array
      const errorMessages = (err.errorMessages as string[]) || [];
      for (const msg of errorMessages) {
        errors.push({
          rowIndex,
          code: this.classifyMessage(msg),
          message: msg,
          jiraMessage: msg,
        });
      }

      // If we got an Error instance
      if (err.message && typeof err.message === 'string' && errors.length === 0) {
        const parsed = this.parseJiraError(error);
        errors.push({ rowIndex, ...parsed });
      }
    } else if (error instanceof Error) {
      errors.push({
        rowIndex,
        code: this.classifyMessage(error.message),
        message: error.message,
      });
    }

    // Fallback if nothing parsed
    if (errors.length === 0) {
      errors.push({
        rowIndex,
        code: 'SERVER_ERROR',
        message: String(error),
      });
    }

    return errors;
  }

  /** Normalize a bulk create response (which can have partial success) */
  normalizeBulk(response: BulkApiResponse, rowCount: number): NormalizedBulkResult {
    const successes: NormalizedBulkResult['successes'] = [];
    const errors: NormalizedError[] = [];

    // Process successful issues
    if (response.issues && Array.isArray(response.issues)) {
      response.issues.forEach((issue, index) => {
        const issueObj = issue as Record<string, unknown>;
        const issueErrors = issueObj.errors as Record<string, string> | undefined;
        if (issueErrors && Object.keys(issueErrors).length > 0) {
          // This issue failed (Cloud per-issue error)
          for (const [field, message] of Object.entries(issueErrors)) {
            const parsed = this.parseFieldError(field, message as string);
            errors.push({ rowIndex: index, ...parsed });
          }
        } else if (issueObj.key) {
          // Success
          successes.push({
            rowIndex: index,
            issueKey: issueObj.key as string,
            issueUrl: `${this.baseUrl}/browse/${issueObj.key}`,
          });
        }
      });
    }

    // Process error entries (Server format and Cloud fallback)
    if (response.errors && Array.isArray(response.errors)) {
      for (const errorEntry of response.errors) {
        const rowIndex = errorEntry.failedElementNumber;
        const fieldErrors = errorEntry.elementErrors?.errors || {};
        const errorMessages = errorEntry.elementErrors?.errorMessages || [];

        for (const [field, message] of Object.entries(fieldErrors)) {
          const parsed = this.parseFieldError(field, message);
          errors.push({ rowIndex, ...parsed });
        }

        for (const msg of errorMessages) {
          errors.push({
            rowIndex,
            code: this.classifyMessage(msg),
            message: msg,
            jiraMessage: msg,
          });
        }

        // If no specific errors parsed, add generic one
        if (Object.keys(fieldErrors).length === 0 && errorMessages.length === 0) {
          errors.push({
            rowIndex,
            code: 'SERVER_ERROR',
            message: `Issue creation failed with status ${errorEntry.status}`,
          });
        }
      }
    }

    return {
      successes,
      errors,
      summary: {
        total: rowCount,
        created: successes.length,
        failed: rowCount - successes.length,
      },
    };
  }

  /** Normalize Cloud vs Server error differences */
  private parseJiraError(error: unknown): { field?: string; message: string; code: NormalizedError['code'] } {
    if (!error || typeof error !== 'object') {
      return { message: String(error), code: 'SERVER_ERROR' };
    }

    const err = error as Record<string, unknown>;
    const message = (err.message as string) || String(error);

    // Check for ambiguity errors
    if (message.includes('ambiguous') || message.includes('Ambiguous') || (err.name === 'AmbiguityError')) {
      return { message, code: 'AMBIGUOUS' };
    }

    return { message, code: this.classifyMessage(message) };
  }

  private parseFieldError(field: string, message: string): { field: string; message: string; code: NormalizedError['code']; jiraMessage: string; suggestion?: string } {
    const code = this.classifyFieldMessage(message);
    const suggestion = this.getSuggestion(code, field, message);
    return {
      field,
      message: `${field}: ${message}`,
      code,
      jiraMessage: message,
      suggestion,
    };
  }

  private classifyFieldMessage(message: string): NormalizedError['code'] {
    const lower = message.toLowerCase();
    if (lower.includes('required') || lower.includes('is required')) {
      return 'REQUIRED_FIELD';
    }
    if (lower.includes('not valid') || lower.includes('invalid') || lower.includes('does not exist') || lower.includes('not allowed')) {
      return 'INVALID_VALUE';
    }
    if (lower.includes('permission') || lower.includes('not authorized')) {
      return 'PERMISSION_DENIED';
    }
    if (lower.includes('not found') || lower.includes('does not exist')) {
      return 'NOT_FOUND';
    }
    return 'INVALID_VALUE';
  }

  private classifyMessage(message: string): NormalizedError['code'] {
    const lower = message.toLowerCase();
    if (lower.includes('required')) return 'REQUIRED_FIELD';
    if (lower.includes('permission') || lower.includes('forbidden')) return 'PERMISSION_DENIED';
    if (lower.includes('not found')) return 'NOT_FOUND';
    if (lower.includes('ambiguous')) return 'AMBIGUOUS';
    if (lower.includes('server error') || lower.includes('internal')) return 'SERVER_ERROR';
    return 'INVALID_VALUE';
  }

  private getSuggestion(code: NormalizedError['code'], field: string, _message: string): string | undefined {
    switch (code) {
      case 'REQUIRED_FIELD':
        return `Provide a value for the "${field}" field`;
      case 'INVALID_VALUE':
        return `Check that the value for "${field}" is valid for this field type`;
      case 'PERMISSION_DENIED':
        return 'Check your permissions for this project/issue type';
      case 'NOT_FOUND':
        return `Verify that "${field}" exists in this project context`;
      default:
        return undefined;
    }
  }

  private extractMessage(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const err = error as Record<string, unknown>;
    if (typeof err.message === 'string') return err.message;
    if (err.errorMessages && Array.isArray(err.errorMessages)) {
      return (err.errorMessages as string[]).join('; ');
    }
    return undefined;
  }
}

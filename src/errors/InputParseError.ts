import { JMLError } from './JMLError.js';
import type { JiraApiErrorDetails, JiraApiResponse } from '../types/jira-api.js';

/**
 * Error thrown when input parsing fails (CSV, JSON, or YAML).
 * 
 * Indicates malformed input data that cannot be parsed.
 * Includes context about the parsing failure location and cause.
 * 
 * @example
 * ```typescript
 * throw new InputParseError(
 *   'Invalid CSV format at row 5',
 *   { format: 'csv', row: 5, originalError: err }
 * );
 * ```
 */
export class InputParseError extends JMLError {
  constructor(message: string, details?: JiraApiErrorDetails, jiraResponse?: JiraApiResponse) {
    super(message, 'INPUT_PARSE_ERROR', details, jiraResponse);
  }
}

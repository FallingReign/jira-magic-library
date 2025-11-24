import { JMLError } from './JMLError.js';
import type { JiraApiErrorDetails, JiraApiResponse } from '../types/jira-api.js';

/**
 * Error thrown when a file cannot be found.
 * 
 * Indicates that a file path provided to the parser does not exist.
 * 
 * @example
 * ```typescript
 * throw new FileNotFoundError(
 *   'File not found: tickets.csv',
 *   { path: 'tickets.csv' }
 * );
 * ```
 */
export class FileNotFoundError extends JMLError {
  constructor(message: string, details?: JiraApiErrorDetails, jiraResponse?: JiraApiResponse) {
    super(message, 'FILE_NOT_FOUND_ERROR', details, jiraResponse);
  }
}

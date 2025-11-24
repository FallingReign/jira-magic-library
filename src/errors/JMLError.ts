/**
 * Base error class for all JIRA Magic Library errors
 * Story: E1-S10
 * 
 * Provides consistent structure for all library errors:
 * - Unique error code for programmatic handling
 * - Structured details for debugging
 * - Original JIRA response preservation
 * - Proper stack traces
 */

import type { JiraApiResponse, JiraApiErrorDetails } from '../types/jira-api.js';

export class JMLError extends Error {
  /**
   * Unique error code (e.g., "AUTHENTICATION_ERROR", "VALIDATION_ERROR")
   */
  readonly code: string;

  /**
   * Structured details about the error (field names, values, etc.)
   */
  readonly details?: JiraApiErrorDetails;

  /**
   * Original JIRA API response (if applicable) for debugging
   */
  readonly jiraResponse?: JiraApiResponse;

  constructor(
    message: string,
    code: string,
    details?: JiraApiErrorDetails,
    jiraResponse?: JiraApiResponse
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.jiraResponse = jiraResponse;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when JIRA rejects request due to validation (400)
 * Story: E1-S05, E1-S10
 */

import { JMLError } from './JMLError.js';
import type { JiraApiErrorDetails, JiraApiResponse } from '../types/jira-api.js';

export class ValidationError extends JMLError {
  constructor(message: string, details?: JiraApiErrorDetails, jiraResponse?: JiraApiResponse) {
    super(message, 'VALIDATION_ERROR', details, jiraResponse);
  }
}

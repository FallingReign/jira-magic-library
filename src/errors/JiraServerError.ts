/**
 * Error thrown when JIRA server returns 5xx error
 * Story: E1-S05, E1-S10
 */

import { JMLError } from './JMLError.js';

export class JiraServerError extends JMLError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'JIRA_SERVER_ERROR', details);
  }
}

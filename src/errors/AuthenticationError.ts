/**
 * Error thrown when authentication fails
 * Story: E1-S03, E1-S10
 */

import { JMLError } from './JMLError.js';
import type { JiraApiErrorDetails } from '../types/jira-api.js';

export class AuthenticationError extends JMLError {
  constructor(message: string, details?: JiraApiErrorDetails) {
    super(message, 'AUTHENTICATION_ERROR', details);
  }
}

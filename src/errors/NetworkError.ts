/**
 * Error thrown when network requests fail
 * Story: E1-S03, E1-S05, E1-S10
 */

import { JMLError } from './JMLError.js';
import type { JiraApiErrorDetails } from '../types/jira-api.js';

export class NetworkError extends JMLError {
  constructor(message: string, details?: JiraApiErrorDetails) {
    super(message, 'NETWORK_ERROR', details);
  }
}

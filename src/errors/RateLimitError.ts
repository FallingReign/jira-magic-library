/**
 * Error thrown when JIRA rate limit is exceeded (429)
 * Story: E1-S05, E1-S10
 */

import { JMLError } from './JMLError.js';

export class RateLimitError extends JMLError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'RATE_LIMIT_ERROR', details);
  }
}

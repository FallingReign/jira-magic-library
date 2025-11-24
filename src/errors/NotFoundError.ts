/**
 * Error thrown when a JIRA resource is not found (404)
 * Story: E1-S05, E1-S10
 */

import { JMLError } from './JMLError.js';

export class NotFoundError extends JMLError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND_ERROR', details);
  }
}

/**
 * Cache Error
 * Story: E1-S04, E1-S10
 * 
 * Error thrown when cache operations fail critically
 */

import { JMLError } from './JMLError.js';
import type { JiraApiErrorDetails } from '../types/jira-api.js';

export class CacheError extends JMLError {
  constructor(message: string, details?: JiraApiErrorDetails) {
    super(message, 'CACHE_ERROR', details);
  }
}

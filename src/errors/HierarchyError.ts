/**
 * Error thrown when parent-child hierarchy validation fails
 * Story: E3-S05 - Parent Link Resolver
 * 
 * Example: Trying to set a Story as parent of an Epic
 */

import { JMLError } from './JMLError.js';

export class HierarchyError extends JMLError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'HIERARCHY_ERROR', details);
  }
}
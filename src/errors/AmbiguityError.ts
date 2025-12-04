/**
 * Error thrown when multiple matches are found for an ambiguous input
 * Story: E1-S10
 * 
 * Example: Multiple components named "Backend" in a project
 */

import { JMLError } from './JMLError.js';

export interface AmbiguityCandidate {
  /** Display name of the candidate */
  displayName?: string;
  /** Username or account ID of the candidate */
  username?: string;
  /** Legacy fields for backward compatibility */
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface AmbiguityDetails extends Record<string, unknown> {
  field: string;
  input: string;
  candidates: AmbiguityCandidate[];
}

export class AmbiguityError extends JMLError {
  constructor(
    message: string,
    details: AmbiguityDetails
  ) {
    super(message, 'AMBIGUITY_ERROR', details);
  }
}

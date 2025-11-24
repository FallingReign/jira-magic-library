/**
 * Configuration Error
 *
 * Thrown when configuration is invalid or missing required values.
 * Story: E1-S02, E1-S10
 */

import { JMLError } from './JMLError.js';

export class ConfigurationError extends JMLError {
  constructor(message: string, details?: { field?: string; value?: unknown }) {
    super(message, 'CONFIGURATION_ERROR', details);
  }
}

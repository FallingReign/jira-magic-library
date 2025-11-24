/**
 * Validation result types
 * 
 * Story: E4-S07 - Schema-Only Validation Method
 */

/**
 * Result of validation operation
 */
export interface ValidationResult {
  /** Whether all rows passed validation */
  valid: boolean;

  /** Array of validation errors (empty if valid) */
  errors: ValidationError[];

  /** Array of validation warnings (non-blocking issues) */
  warnings?: ValidationWarning[];
}

/**
 * Individual validation warning (non-blocking)
 */
export interface ValidationWarning {
  /** Zero-based row index */
  rowIndex: number;

  /** Field name that triggered warning */
  field: string;

  /** Warning code for programmatic handling */
  code: 'UNKNOWN_FIELD';

  /** Human-readable warning message */
  message: string;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Individual validation error
 */
export interface ValidationError {
  /** Zero-based row index */
  rowIndex: number;

  /** Field name that failed validation */
  field: string;

  /** Error code for programmatic handling */
  code:
    | 'REQUIRED_FIELD_MISSING'
    | 'INVALID_TYPE'
    | 'INVALID_ENUM_VALUE'
    | 'INVALID_PROJECT'
    | 'INVALID_ISSUE_TYPE';

  /** Human-readable error message */
  message: string;

  /** Additional context (e.g., allowed values for enums) */
  context?: Record<string, unknown>;
}

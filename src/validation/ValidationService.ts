/**
 * Schema Validation Service
 * 
 * Story: E4-S07 - Schema-Only Validation Method
 * 
 * Provides fast, schema-only validation of issue data WITHOUT:
 * - Creating issues
 * - Performing field name → ID lookups
 * - Converting values
 * - Making API calls
 * 
 * Only validates:
 * - Required fields present
 * - Field types match schema
 * - Enum values are in allowedValues
 * 
 * Performance target: <100ms for 100 rows (no API calls)
 * 
 * @example
 * ```typescript
 * const validator = new ValidationService(schemaDiscovery, inputParser);
 * 
 * const result = await validator.validate({
 *   data: [
 *     { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Test' }
 *   ]
 * });
 * 
 * if (!result.valid) {
 *   result.errors.forEach(err => {
 *     console.error(`Row ${err.rowIndex}: ${err.field} - ${err.message}`);
 *   });
 * }
 * ```
 */

import { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import { parseInput, ParseInputOptions } from '../parsers/InputParser.js';
import { ProjectSchema, FieldSchema } from '../types/schema.js';
import { ValidationResult, ValidationError, ValidationWarning } from './types.js';
import { NotFoundError } from '../errors/NotFoundError.js';

type SchemaLookupErrorMeta = Omit<ValidationError, 'rowIndex'>;

export class ValidationService {
  constructor(
    private readonly schemaDiscovery: SchemaDiscovery
  ) {}

  /**
   * Validate issue data against JIRA schema without creating issues.
   * 
   * Performs schema-only validation:
   * - Required fields present
   * - Field types match schema
   * - Enum values valid
   * 
   * Does NOT perform:
   * - Field name → ID lookups
   * - Value conversions
   * - API calls (uses cached schema only)
   * 
   * @param options - Input options (same as create())
   * @returns Validation result with errors array
   * 
   * @example
   * ```typescript
   * // Validate from array
   * const result = await validator.validate({
   *   data: [{ Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Test' }]
   * });
   * 
   * // Validate from file
   * const result = await validator.validate({
   *   from: 'issues.csv'
   * });
   * ```
   */
  async validate(options: ParseInputOptions): Promise<ValidationResult> {
    // Parse input using parseInput function
    const parsed = await parseInput(options);
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const schemaCache = new Map<string, ProjectSchema>();
    const schemaErrorCache = new Map<string, SchemaLookupErrorMeta>();

    // Validate each row
    for (let rowIndex = 0; rowIndex < parsed.data.length; rowIndex++) {
      const row = parsed.data[rowIndex] as Record<string, unknown>;
      
      // Extract Project and Issue Type (required for schema lookup)
      const projectKey = this.extractFieldValue(row, ['Project', 'project']);
      const issueType = this.extractFieldValue(row, ['Issue Type', 'issue type', 'IssueType', 'issuetype']);

      if (!projectKey || !issueType) {
        if (!projectKey) {
          errors.push({
            rowIndex,
            field: 'Project',
            code: 'REQUIRED_FIELD_MISSING',
            message: 'Project field is required'
          });
        }
        if (!issueType) {
          errors.push({
            rowIndex,
            field: 'Issue Type',
            code: 'REQUIRED_FIELD_MISSING',
            message: 'Issue Type field is required'
          });
        }
        continue; // Skip further validation for this row
      }

      if (typeof projectKey !== 'string' || typeof issueType !== 'string') {
        errors.push({
          rowIndex,
          field: 'Project / Issue Type',
          code: 'INVALID_TYPE',
          message: 'Project and Issue Type must be strings',
        });
        continue;
      }

      const normalizedProjectKey = projectKey.trim();
      const normalizedIssueType = issueType.trim();

      const schemaKey = `${normalizedProjectKey.toUpperCase()}::${normalizedIssueType.toUpperCase()}`;

      const cachedSchemaError = schemaErrorCache.get(schemaKey);
      if (cachedSchemaError) {
        errors.push({ rowIndex, ...cachedSchemaError });
        continue;
      }

      let schema = schemaCache.get(schemaKey);

      if (!schema) {
        try {
          schema = await this.schemaDiscovery.getFieldsForIssueType(
            normalizedProjectKey,
            normalizedIssueType
          );
          schemaCache.set(schemaKey, schema);
        } catch (error) {
          if (this.isSchemaLookupNotFoundError(error)) {
            const schemaError = this.createSchemaLookupValidationError(error);
            schemaErrorCache.set(schemaKey, schemaError);
            errors.push({ rowIndex, ...schemaError });
            continue;
          }

          throw error;
        }
      }

      if (!schema) {
        continue;
      }

      // Validate row against schema (collects both errors and warnings)
      const validation = this.validateRow(row, schema, rowIndex);
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate a single row against schema
   */
  private validateRow(
    row: Record<string, unknown>,
    schema: ProjectSchema,
    rowIndex: number
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check all required fields in schema
    for (const fieldSchema of Object.values(schema.fields)) {
      if (fieldSchema.required) {
        const value = this.findFieldValue(row, fieldSchema);

        if (this.isEmptyValue(value)) {
          errors.push({
            rowIndex,
            field: fieldSchema.name,
            code: 'REQUIRED_FIELD_MISSING',
            message: `Required field "${fieldSchema.name}" is missing or empty`
          });
        }
      }
    }

    // Validate types and enums for all present fields
    for (const [key, value] of Object.entries(row)) {
      // Skip Project and Issue Type (already validated)
      if (this.isMetaField(key)) {
        continue;
      }

      // Skip empty values (handled by required check above)
      if (this.isEmptyValue(value)) {
        continue;
      }

      // Find matching field schema (case-insensitive)
      const fieldSchema = this.findFieldSchema(schema, key);
      
      if (!fieldSchema) {
        // Unknown field - add warning
        warnings.push({
          rowIndex,
          field: key,
          code: 'UNKNOWN_FIELD',
          message: `Field "${key}" not found in schema for this issue type and will be ignored`,
          context: {
            issueType: schema.issueType
          }
        });
        continue;
      }

      // Validate type
      const typeError = this.validateType(value, fieldSchema, rowIndex);
      if (typeError) {
        errors.push(typeError);
        continue; // Skip enum validation if type is wrong
      }

      // Validate enum (if applicable)
      const enumError = this.validateEnum(value, fieldSchema, rowIndex);
      if (enumError) {
        errors.push(enumError);
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate field type matches schema
   */
  private validateType(
    value: unknown,
    fieldSchema: FieldSchema,
    rowIndex: number
  ): ValidationError | null {
    const { type, name } = fieldSchema;

    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            rowIndex,
            field: name,
            code: 'INVALID_TYPE',
            message: `Field "${name}" must be a string, got ${typeof value}`
          };
        }
        break;

      case 'number':
        // Accept numbers or numeric strings
        if (typeof value === 'number') {
          if (!Number.isFinite(value)) {
            return {
              rowIndex,
              field: name,
              code: 'INVALID_TYPE',
              message: `Field "${name}" must be a finite number`
            };
          }
        } else if (typeof value === 'string') {
          const parsed = Number(value);
          if (Number.isNaN(parsed)) {
            return {
              rowIndex,
              field: name,
              code: 'INVALID_TYPE',
              message: `Field "${name}" must be a number or numeric string, got "${value}"`
            };
          }
        } else {
          return {
            rowIndex,
            field: name,
            code: 'INVALID_TYPE',
            message: `Field "${name}" must be a number, got ${typeof value}`
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            rowIndex,
            field: name,
            code: 'INVALID_TYPE',
            message: `Field "${name}" must be an array, got ${typeof value}`
          };
        }
        break;

      // For complex types (user, priority, etc.), just check they're not primitives where objects expected
      case 'user':
      case 'priority':
      case 'issuetype':
      case 'project':
        // Accept strings (will be converted later) or objects
        if (typeof value !== 'string' && typeof value !== 'object') {
          return {
            rowIndex,
            field: name,
            code: 'INVALID_TYPE',
            message: `Field "${name}" must be a string or object, got ${typeof value}`
          };
        }
        break;

      // Other types - no validation needed at schema level
      default:
        break;
    }

    return null;
  }

  /**
   * Validate enum value is in allowedValues
   */
  private validateEnum(
    value: unknown,
    fieldSchema: FieldSchema,
    rowIndex: number
  ): ValidationError | null {
    if (!fieldSchema.allowedValues || fieldSchema.allowedValues.length === 0) {
      return null; // No enum constraint
    }

    // Extract string value for comparison
    let stringValue: string;
    if (typeof value === 'string') {
      stringValue = value;
    } else if (typeof value === 'object' && value !== null) {
      // If object, check name or id property
      const obj = value as Record<string, unknown>;
      const candidate = obj.name ?? obj.id ?? '';
      if (typeof candidate === 'string') {
        stringValue = candidate;
      } else if (typeof candidate === 'number' || typeof candidate === 'boolean') {
        stringValue = String(candidate);
      } else {
        stringValue = '';
      }
    } else {
      stringValue = String(value);
    }

    // Check if value matches any allowed value (name or id)
    const isValid = fieldSchema.allowedValues.some(allowed => 
      allowed.name.toLowerCase() === stringValue.toLowerCase() ||
      allowed.id === stringValue
    );

    if (!isValid) {
      const allowedNames = fieldSchema.allowedValues.map(v => v.name).join(', ');
      return {
        rowIndex,
        field: fieldSchema.name,
        code: 'INVALID_ENUM_VALUE',
        message: `Field "${fieldSchema.name}" has invalid value "${stringValue}". Allowed values: ${allowedNames}`,
        context: {
          allowedValues: fieldSchema.allowedValues.map(v => v.name)
        }
      };
    }

    return null;
  }

  private isSchemaLookupNotFoundError(error: unknown): error is NotFoundError {
    return error instanceof NotFoundError;
  }

  private createSchemaLookupValidationError(error: NotFoundError): SchemaLookupErrorMeta {
    const context =
      error.details && typeof error.details === 'object'
        ? (error.details as Record<string, unknown>)
        : undefined;

    if (context && 'issueTypeName' in context) {
      return {
        field: 'Issue Type',
        code: 'INVALID_ISSUE_TYPE',
        message: error.message,
        context,
      };
    }

    return {
      field: 'Project',
      code: 'INVALID_PROJECT',
      message: error.message,
      context,
    };
  }

  /**
   * Find field value in row (case-insensitive)
   */
  private findFieldValue(
    row: Record<string, unknown>,
    fieldSchema: FieldSchema
  ): unknown {
    // Try exact match first
    if (fieldSchema.name in row) {
      return row[fieldSchema.name];
    }

    // Try case-insensitive match
    const lowerName = fieldSchema.name.toLowerCase();
    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Find field schema by name (case-insensitive)
   */
  private findFieldSchema(
    schema: ProjectSchema,
    fieldName: string
  ): FieldSchema | undefined {
    const lowerFieldName = fieldName.toLowerCase();
    
    for (const fieldSchema of Object.values(schema.fields)) {
      if (fieldSchema.name.toLowerCase() === lowerFieldName) {
        return fieldSchema;
      }
    }

    return undefined;
  }

  /**
   * Extract field value by trying multiple key variants
   */
  private extractFieldValue(
    row: Record<string, unknown>,
    keys: string[]
  ): unknown {
    for (const key of keys) {
      // Try exact match
      if (key in row) {
        return row[key];
      }

      // Try case-insensitive match
      const lowerKey = key.toLowerCase();
      for (const [rowKey, value] of Object.entries(row)) {
        if (rowKey.toLowerCase() === lowerKey) {
          return value;
        }
      }
    }

    return undefined;
  }

  /**
   * Check if value is empty (null, undefined, empty string)
   */
  private isEmptyValue(value: unknown): boolean {
    return value === null || value === undefined || value === '';
  }

  /**
   * Check if field is a meta field (Project, Issue Type)
   */
  private isMetaField(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return lowerKey === 'project' || 
           lowerKey === 'issue type' || 
           lowerKey === 'issuetype' ||
           lowerKey === 'issue_type';
  }
}

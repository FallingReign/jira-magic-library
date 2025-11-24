import { FieldSchema, ProjectSchema } from '../types/schema.js';
import { FieldConverter, ConversionContext } from '../types/converter.js';
import { convertNumber } from './types/NumberConverter.js';
import { convertDate } from './types/DateConverter.js';
import { convertDateTimeType } from './types/DateTimeConverter.js';
import { convertArrayType } from './types/ArrayConverter.js';
import { convertPriorityType } from './types/PriorityConverter.js';
import { convertUserType } from './types/UserConverter.js';
import { convertOptionType } from './types/OptionConverter.js';
import { convertOptionWithChildType } from './types/OptionWithChildConverter.js';
import { convertComponentType } from './types/ComponentConverter.js';
import { convertVersionType } from './types/VersionConverter.js';
import { convertTimeTrackingType } from './types/TimeTrackingConverter.js';
import { convertIssueTypeType } from './types/IssueTypeConverter.js';
import { convertProjectType } from './types/ProjectConverter.js';

/**
 * Registry for field type converters.
 * 
 * Manages conversion of user-provided values to JIRA's expected formats
 * based on field types. Comes with built-in converters for string and text
 * fields, and allows registration of custom converters.
 * 
 * Features:
 * - Built-in string converter (trims whitespace)
 * - Built-in text converter (preserves newlines, trims edges)
 * - Extensible via register() method
 * - Graceful degradation (passthrough for unknown types)
 * - Null/undefined handling (skips fields)
 * 
 * @example
 * ```typescript
 * const registry = new ConverterRegistry();
 * 
 * // Convert a single field
 * const value = registry.convert('  test  ', stringField, context);
 * // Returns: 'test'
 * 
 * // Convert all fields
 * const converted = registry.convertFields(schema, resolvedFields, context);
 * // Returns: { summary: 'Test', description: 'Line 1\nLine 2' }
 * 
 * // Register custom converter
 * registry.register('priority', (value, fieldSchema) => {
 *   // Look up priority ID...
 *   return { id: '1' };
 * });
 * ```
 */
export class ConverterRegistry {
  private converters: Map<string, FieldConverter> = new Map();

  constructor() {
    // Register built-in converters
    this.register('string', this.convertString.bind(this));
    this.register('text', this.convertText.bind(this));
    this.register('number', convertNumber);
    this.register('date', convertDate);
    this.register('datetime', convertDateTimeType);
    this.register('array', convertArrayType);
    this.register('priority', convertPriorityType);
    this.register('user', convertUserType);
    this.register('option', convertOptionType);
    this.register('option-with-child', convertOptionWithChildType);
    this.register('component', convertComponentType);
    this.register('version', convertVersionType);
    this.register('timetracking', convertTimeTrackingType);
    this.register('issuetype', convertIssueTypeType); // E3-S07b
    this.register('project', convertProjectType); // E3-S08
  }

  /**
   * Register a converter for a specific field type.
   * 
   * @param type - Field type (e.g., "string", "number", "priority")
   * @param converter - Converter function
   * 
   * @example
   * ```typescript
   * registry.register('number', (value) => {
   *   return Number(value);
   * });
   * ```
   */
  register(type: string, converter: FieldConverter): void {
    this.converters.set(type, converter);
  }

  /**
   * Get converter for a specific type.
   * 
   * @param type - Field type (e.g., "string", "number", "component")
   * @returns Converter function or undefined if not registered
   * 
   * @example
   * ```typescript
   * const converter = registry.get('string');
   * if (converter) {
   *   const result = converter(' test ', fieldSchema, context);
   * }
   * ```
   */
  get(type: string): FieldConverter | undefined {
    return this.converters.get(type);
  }

  /**
   * Get all registered converter types.
   * 
   * @returns Array of registered type names
   * 
   * @example
   * ```typescript
   * const types = registry.getTypes();
   * // Returns: ['string', 'text', 'number', 'date', 'datetime', 'array']
   * ```
   */
  getTypes(): string[] {
    return Array.from(this.converters.keys());
  }

  /**
   * Convert a single field value based on its type.
   * 
   * Supports both synchronous and asynchronous converters. For lookup-based
   * converters (priority, user, component, version), this method performs
   * async cache lookups to resolve names to IDs.
   * 
   * @param value - User-provided value
   * @param fieldSchema - Field schema information
   * @param context - Conversion context (may include cache for lookups)
   * @returns Promise resolving to converted value in JIRA's expected format
   * 
   * @example
   * ```typescript
   * const converted = await registry.convert('  test  ', {
   *   id: 'summary',
   *   type: 'string',
   *   ...
   * }, context);
   * // Returns: 'test'
   * ```
   */
  async convert(value: unknown, fieldSchema: FieldSchema, context: ConversionContext): Promise<unknown> {
    const converter = this.converters.get(fieldSchema.type);

    if (!converter) {
      // eslint-disable-next-line no-console
      console.warn(`No converter for type '${fieldSchema.type}', passing value through`);
      return value;
    }

    return await converter(value, fieldSchema, context);
  }

  /**
   * Convert all fields in a resolved field object.
   * 
   * Iterates over all fields, looks up their schema, and applies the
   * appropriate converter based on field type. Special fields (project,
   * issuetype) are passed through unchanged. Null/undefined values are
   * skipped. Supports async converters for lookup-based fields.
   * 
   * @param schema - Project schema containing field definitions
   * @param resolvedFields - Fields with resolved IDs (from FieldResolver)
   * @param context - Conversion context (may include cache for lookups)
   * @returns Promise resolving to object with converted field values
   * 
   * @example
   * ```typescript
   * const resolvedFields = {
   *   summary: '  Test Issue  ',
   *   description: '  Line 1\nLine 2  ',
   *   priority: { id: '1' }  // Not yet supported, passes through
   * };
   * 
   * const converted = registry.convertFields(schema, resolvedFields, context);
   * // Returns: {
   * //   summary: 'Test Issue',
   * //   description: 'Line 1\nLine 2',
   * //   priority: { id: '1' }
   * // }
   * ```
   */
  async convertFields(
    schema: ProjectSchema,
    resolvedFields: Record<string, unknown>,
    context: ConversionContext
  ): Promise<Record<string, unknown>> {
    const converted: Record<string, unknown> = {};

    // Add registry to context for array converter to look up item converters
    const contextWithRegistry = {
      ...context,
      registry: this,
    };

    for (const [fieldId, value] of Object.entries(resolvedFields)) {
      // Skip null/undefined fields
      if (value === null || value === undefined) {
        continue;
      }

      const fieldSchema = schema.fields[fieldId];

      // Special fields (project, issuetype) or fields not in schema - pass through
      if (!fieldSchema) {
        converted[fieldId] = value;
        continue;
      }

      // Convert based on field type (await in case converter is async)
      converted[fieldId] = await this.convert(value, fieldSchema, contextWithRegistry);
    }

    return converted;
  }

  /**
   * Built-in converter for string fields.
   * 
   * Converts value to string, trims whitespace, returns empty string for null/undefined.
   * 
   * @param value - User-provided value
   * @returns Trimmed string
   */
  private convertString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value).trim();
  }

  /**
   * Built-in converter for text fields (paragraphs).
   * 
   * Converts value to string, preserves internal newlines and spaces,
   * trims only leading/trailing whitespace.
   * 
   * @param value - User-provided value
   * @returns String with preserved internal formatting
   */
  private convertText(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const text = String(value);
    // Trim only leading/trailing whitespace, preserve internal newlines/spaces
    return text.replace(/^\s+|\s+$/g, '');
  }
}

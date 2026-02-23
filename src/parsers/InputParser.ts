/**
 * Unified Input Parser for CSV, JSON, and YAML formats
 * 
 * Parses issue data from various input sources and formats:
 * - CSV: From file, string, or array of arrays
 * - JSON: From file, string, array of objects, or single object
 * - YAML: From file or string (supports both array and document stream formats)
 * 
 * All inputs are normalized to an array of objects for consistent processing.
 * 
 * YAML Document Stream Format (User-Friendly):
 * Use `---` separators between objects - no indentation required!
 * 
 * @example
 * ```typescript
 * // Parse CSV from file
 * const result = await parseInput({ from: 'tickets.csv' });
 * 
 * // Parse JSON from string
 * const result = await parseInput({ 
 *   data: '[{"Project":"ENG","Summary":"Test"}]', 
 *   format: 'json' 
 * });
 * 
 * // Parse YAML document stream (user-friendly, no indentation)
 * const result = await parseInput({
 *   data: 'Project: ENG\nSummary: Test 1\n---\nProject: ENG\nSummary: Test 2',
 *   format: 'yaml'
 * });
 * 
 * // Parse array of objects (pass-through)
 * const result = await parseInput({ 
 *   data: [{ Project: 'ENG', Summary: 'Test' }] 
 * });
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as parseCSV } from 'csv-parse/sync';
import * as yaml from 'js-yaml';
import { InputParseError, FileNotFoundError } from '../errors/index.js';
import { preprocessQuotes, escapeAllBackslashes } from './quote-preprocessor.js';
import { preprocessCustomBlocks } from './custom-block-preprocessor.js';

/**
 * Parsed input with normalized data array
 */
export interface ParsedInput {
  /** Normalized array of objects */
  data: Record<string, unknown>[];
  /** Detected or specified format */
  format: 'csv' | 'json' | 'yaml';
  /** Source type of the input */
  source: 'file' | 'string' | 'array' | 'object';
}

/**
 * Input options for the parser
 *
 * Common ways to call:
 * - `from: 'tickets.csv'` (auto-detect by extension)
 * - `data: 'Project,Summary\nENG,Set up CI', format: 'csv'` (inline CSV string)
 * - `data: [{ Project: 'ENG', Summary: 'Create board' }]` (already-parsed JSON array)
 * - `data: [['Project','Summary'], ['ENG','Do X']], format: 'csv'` (array-of-arrays as CSV)
 *
 * Notes:
 * - Strings require `format` to be set.
 * - YAML supports document streams with `---` separators (no indentation needed).
 * - In CSV, empty unquoted cells become `null`; quote them to keep empty strings.
 *
 * CSV string (requires `format: 'csv'`)
 * @example
 * ```ts
 * { data: 'Project,Summary\\nENG,Set up CI', format: 'csv' }
 * ```
 *
 * JSON array string
 * @example
 * ```ts
 * { data: '[{\"Project\":\"ENG\",\"Summary\":\"Create board\"}]', format: 'json' }
 * ```
 *
 * YAML document stream string (no indentation needed)
 * @example
 * ```ts
 * {
 *   data: 'Project: ENG\\nSummary: Epic parent\\n---\\nProject: ENG\\nSummary: Child story',
 *   format: 'yaml'
 * }
 * ```
 */
export interface ParseInputOptions {
  /** File path to read from */
  from?: string;
  /** Data to parse (string, array, or object) */
  data?: string | unknown[] | Record<string, unknown>;
  /** Explicit format (required for string data without file extension) */
  format?: 'csv' | 'json' | 'yaml';
  /**
   * Whether to preprocess custom blocks (<<< >>>) in the input.
   * When enabled, custom block syntax is converted to properly quoted strings.
   * @default true
   */
  preprocessCustomBlocks?: boolean;
  /**
   * Whether to preprocess quotes in the input to fix common copy/paste issues.
   * When enabled, the parser will automatically escape unescaped quotes in string values.
   * @default true
   */
  preprocessQuotes?: boolean;
}

/**
 * Parse input data from various sources and formats.
 * 
 * Supports:
 * - CSV: Files, strings, array of arrays
 * - JSON: Files, strings, arrays, single objects
 * - YAML: Files, strings
 * 
 * Auto-detects format from file extension (.csv, .json, .yaml, .yml)
 * Requires explicit `format` parameter for string/array data.
 * 
 * @param options - Input options
 * @returns Parsed input with normalized data array
 * @throws {InputParseError} If parsing fails or format cannot be determined
 * @throws {FileNotFoundError} If file path does not exist
 * 
 * @example
 * ```typescript
 * // From file (auto-detect format)
 * const result = await parseInput({ from: 'tickets.csv' });
 * 
 * // From string (explicit format)
 * const result = await parseInput({ 
 *   data: 'Project,Summary\nENG,Test', 
 *   format: 'csv' 
 * });
 * 
 * // From array (pass-through)
 * const result = await parseInput({ 
 *   data: [{ Project: 'ENG' }] 
 * });
 * ```
 */
export async function parseInput(options: ParseInputOptions): Promise<ParsedInput> {
  // Validate input
  if (!options.from && options.data === undefined) {
    throw new InputParseError(
      'No input provided - specify either "from" (file path) or "data"',
      { options }
    );
  }

  // Default both preprocessing options to true if not specified
  const shouldPreprocessCustomBlocks = options.preprocessCustomBlocks !== false;
  const shouldPreprocessQuotes = options.preprocessQuotes !== false;

  // Case 1: File path provided
  if (options.from) {
    return parseFromFile(options.from, options.format, shouldPreprocessCustomBlocks, shouldPreprocessQuotes);
  }

  // Case 2: Data provided (string, array, or object)
  if (options.data === undefined) {
    throw new InputParseError(
      'No data provided',
      { options }
    );
  }
  return parseFromData(options.data, options.format, shouldPreprocessCustomBlocks, shouldPreprocessQuotes);
}

/**
 * Parse input from a file path
 */
async function parseFromFile(
  filePath: string,
  explicitFormat?: 'csv' | 'json' | 'yaml',
  shouldPreprocessCustomBlocks = true,
  shouldPreprocessQuotes = true
): Promise<ParsedInput> {
  // Check if file exists
  try {
    await fs.access(filePath);
  } catch {
    throw new FileNotFoundError(
      `File not found: ${filePath}`,
      { path: filePath }
    );
  }

  // Detect format from file extension
  const ext = path.extname(filePath).toLowerCase();
  let format: 'csv' | 'json' | 'yaml';

  if (explicitFormat) {
    format = explicitFormat;
  } else {
    switch (ext) {
      case '.csv':
        format = 'csv';
        break;
      case '.json':
        format = 'json';
        break;
      case '.yaml':
      case '.yml':
        format = 'yaml';
        break;
      default:
        throw new InputParseError(
          `Unsupported file extension: ${ext}. Supported: .csv, .json, .yaml, .yml`,
          { path: filePath, extension: ext }
        );
    }
  }

  // Read file
  const content = await fs.readFile(filePath, 'utf-8');

  // Parse based on format
  const data = parseContent(content, format, shouldPreprocessCustomBlocks, shouldPreprocessQuotes);

  return {
    data,
    format,
    source: 'file',
  };
}

/**
 * Parse input from data (string, array, or object)
 */
function parseFromData(
  data: string | unknown[] | Record<string, unknown>,
  explicitFormat?: 'csv' | 'json' | 'yaml',
  shouldPreprocessCustomBlocks = true,
  shouldPreprocessQuotes = true
): ParsedInput {
  // Case 1: Array of objects (pass-through)
  if (Array.isArray(data)) {
    // If explicit CSV format requested, treat as array of arrays
    if (explicitFormat === 'csv') {
      return parseCSVFromArray(data as unknown[][]);
    }

    // Check if array of arrays (CSV format by structure)
    if (data.length > 0 && Array.isArray(data[0])) {
      return parseCSVFromArray(data as unknown[][]);
    }

    // Array of objects (already parsed JSON) - sanitize in case values have whitespace
    return {
      data: sanitizeValues(data as Record<string, unknown>[]),
      format: 'json',
      source: 'array',
    };
  }

  // Case 2: Single object (normalize to array) - sanitize in case values have whitespace
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return {
      data: [sanitizeValues(data)],
      format: 'json',
      source: 'object',
    };
  }

  // Case 3: String (requires explicit format)
  if (typeof data === 'string') {
    if (!explicitFormat) {
      throw new InputParseError(
        'Cannot determine input format for string data - provide "format" parameter (csv, json, or yaml)',
        { data: data.substring(0, 100) } // Include snippet
      );
    }

    const parsed = parseContent(data, explicitFormat, shouldPreprocessCustomBlocks, shouldPreprocessQuotes);
    return {
      data: parsed,
      format: explicitFormat,
      source: 'string',
    };
  }

  // Invalid input type
  throw new InputParseError(
    `Invalid input data type: ${typeof data}. Expected string, array, or object`,
    { type: typeof data }
  );
}

/**
 * Parse content string based on format
 * @param content - The raw content string to parse
 * @param format - The format of the content (csv, json, yaml)
 * @param shouldPreprocessCustomBlocks - Whether to run custom block preprocessing (default: true)
 * @param shouldPreprocessQuotes - Whether to run quote preprocessing (default: true)
 */
function parseContent(
  content: string,
  format: 'csv' | 'json' | 'yaml',
  shouldPreprocessCustomBlocks = true,
  shouldPreprocessQuotes = true
): Record<string, unknown>[] {
  let processedContent = content;

  // Step 1: Escape quotes and backslashes in user-typed values (regular quoted strings).
  // Custom block markers (<<<) are unquoted content — this step leaves them untouched.
  if (shouldPreprocessQuotes) {
    const preprocessed = preprocessQuotes(content, format);
    if (preprocessed !== content) {
      // eslint-disable-next-line no-console
      console.debug(`Input required quote preprocessing for ${format} format`);
    }
    processedContent = preprocessed;
  }

  // Step 2: Convert custom blocks (<<< >>>) into fully-escaped quoted strings.
  // Runs AFTER quote preprocessing so there is no double-escaping:
  // the output of this step is already payload-ready and won't be touched again.
  if (shouldPreprocessCustomBlocks) {
    const preprocessed = preprocessCustomBlocks(processedContent, format);
    if (preprocessed !== processedContent) {
      // eslint-disable-next-line no-console
      console.debug(`Input required custom block preprocessing for ${format} format`);
    }
    processedContent = preprocessed;
  }

  try {
    switch (format) {
      case 'csv':
        return parseCSVContent(processedContent);
      case 'json':
        return parseJSONContent(processedContent);
      case 'yaml':
        return parseYAMLContent(processedContent);
      default: {
        // Exhaustiveness check
        const _exhaustive: never = format;
        throw new InputParseError(`Unsupported format: ${String(_exhaustive)}`, { format });
      }
    }
  } catch (error) {
    if (error instanceof InputParseError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new InputParseError(
      `Failed to parse ${format.toUpperCase()}: ${errorMessage}`,
      { format, originalError: errorMessage }
    );
  }
}

/**
 * Parse CSV content using csv-parse library
 */
function parseCSVContent(content: string): Record<string, unknown>[] {
  try {
    const records = parseCSV(content, {
      columns: true, // Use first row as headers
      skip_empty_lines: true,
      trim: false, // Preserve whitespace in fields
      relax_quotes: false, // Strict quote handling
      relax_column_count: false, // All rows must have same column count
      raw: true,
    }) as Array<{ record: Record<string, unknown>; raw?: string }>;

    const processed = records.map((entry) => {
      const rowRecord = entry.record;
      const rawRow = entry.raw;
      if (!rawRow) {
        return rowRecord;
      }

      const columnNames = Object.keys(rowRecord);
      const quotedFlags = getCsvQuotedFlags(rawRow, columnNames.length);

      columnNames.forEach((column, index) => {
        const value = rowRecord[column];
        if (typeof value === 'string' && value === '' && !quotedFlags[index]) {
          rowRecord[column] = null;
        }
      });

      return rowRecord;
    });

    // Sanitize all string values (trim whitespace from keys and values)
    return sanitizeValues(processed);
  } catch (error) {
    throw new InputParseError(
      `Invalid CSV format: ${(error as Error).message}`,
      { format: 'csv', originalError: (error as Error).message }
    );
  }
}

/**
 * Parse CSV from array of arrays
 */
function parseCSVFromArray(data: unknown[][]): ParsedInput {
  if (data.length === 0) {
    return { data: [], format: 'csv', source: 'array' };
  }

  const headers = data[0];
  if (!headers || !Array.isArray(headers)) {
    throw new InputParseError(
      'Invalid CSV array: first row must be an array of headers',
      { format: 'csv' }
    );
  }

  const rows = data.slice(1);

  const parsed = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    if (Array.isArray(row)) {
      headers.forEach((header, index) => {
        obj[String(header)] = row[index];
      });
    }
    return obj;
  });

  // Sanitize all string values (trim whitespace from keys and values)
  return {
    data: sanitizeValues(parsed),
    format: 'csv',
    source: 'array',
  };
}

/**
 * Parse JSON content
 */
/**
 * Parse JSON content.
 *
 * Single-pass in the common case: the quote preprocessor (Step 2 of the
 * pipeline) now fixes invalid backslash sequences and unescaped quotes before
 * we reach JSON.parse, so valid content parses first time.
 *
 * Two-pass fallback: if JSON.parse still throws (e.g. the preprocessor
 * could not parse the JSON structure to identify values), we run a more
 * aggressive backslash fix across all double-quoted strings and retry once.
 * This is a genuine last-resort safety net, not the primary path.
 */
function parseJSONContent(content: string): Record<string, unknown>[] {
  const tryParse = (src: string): Record<string, unknown>[] => {
    const parsed: unknown = JSON.parse(src);
    if (Array.isArray(parsed)) {
      return sanitizeValues(parsed as Record<string, unknown>[]);
    } else if (typeof parsed === 'object' && parsed !== null) {
      return [sanitizeValues(parsed as Record<string, unknown>)];
    } else {
      throw new Error('JSON must be an object or array of objects');
    }
  };

  try {
    return tryParse(content);
  } catch (error) {
    const msg = (error as Error).message ?? '';

    // Retry: if the failure looks like a bad escape sequence, aggressively escape
    // all backslashes inside double-quoted strings and try once more.
    if (msg.toLowerCase().includes('escape') || msg.includes('Unexpected token')) {
      try {
        const fixed = fixInvalidJsonEscapes(content);
        if (fixed !== content) {
          return tryParse(fixed);
        }
      } catch {
        // Fall through to the original error
      }
    }

    throw new InputParseError(
      `Invalid JSON format: ${msg}`,
      { format: 'json', originalError: msg }
    );
  }
}

/**
 * Parse YAML content
 * 
 * Supports two formats:
 * 1. Array format: `- key: value` (YAML array of objects)
 * 2. Document stream format: `key: value\n---\nkey: value` (multiple YAML documents)
 * 
 * Document stream is more user-friendly as it doesn't require indentation.
 *
 * Two-pass strategy:
 * 1. Attempt normal parse (quote preprocessor should handle most backslash issues).
 * 2. If js-yaml reports an "escape sequence" error, run a more aggressive backslash
 *    fix across all double-quoted strings and retry once. This is a safety net for
 *    content that the quote preprocessor may not have caught (e.g., edge-case quoting).
 */
function parseYAMLContent(content: string): Record<string, unknown>[] {
  /** Load, flatten, and sanitize all YAML documents in `src`. */
  const tryLoad = (src: string): Record<string, unknown>[] => {
    const documents: unknown[] = yaml.loadAll(src);
    const result: Record<string, unknown>[] = [];
    for (const doc of documents) {
      if (doc === null || doc === undefined) {
        // Empty document, skip
        continue;
      } else if (Array.isArray(doc)) {
        // Document is an array, add all items
        result.push(...(doc as Record<string, unknown>[]));
      } else if (typeof doc === 'object') {
        // Document is a single object, add it
        result.push(doc as Record<string, unknown>);
      } else {
        throw new Error('YAML documents must be objects or arrays of objects');
      }
    }
    return sanitizeValues(result);
  };

  try {
    return tryLoad(content);
  } catch (error) {
    const msg = (error as Error).message ?? '';

    // Retry: if the failure was an invalid escape sequence, aggressively escape
    // all backslashes inside double-quoted strings and try once more.
    if (msg.includes('escape')) {
      try {
        const fixed = fixInvalidYamlEscapes(content);
        if (fixed !== content) {
          return tryLoad(fixed);
        }
      } catch {
        // Fall through to the original error
      }
    }

    throw new InputParseError(
      `Invalid YAML format: ${msg}`,
      { format: 'yaml', originalError: msg }
    );
  }
}

/**
 * Aggressive fallback: double all backslashes inside double-quoted YAML strings.
 *
 * Called only when the initial `yaml.loadAll` throws an "escape" error and the
 * quote preprocessor was not able to fix the content before it reached us.
 *
 * Strategy: match each `"..."` (including multiline) and double all backslashes
 * so the YAML parser interprets them as literal characters.
 */
function fixInvalidYamlEscapes(content: string): string {
  // (?:[^"\\]|\\.)* — any non-quote, non-backslash OR any escape sequence
  // 's' flag — dotAll so matches across newlines (handles multiline quoted values)
  return content.replace(/"((?:[^"\\]|\\.)*)"/gs, (_match, inner: string) => {
    const fixed = escapeAllBackslashes(inner, 'yaml');
    return `"${fixed}"`;
  });
}

/**
 * Aggressive fallback: double all backslashes inside double-quoted JSON strings.
 *
 * Called only when the initial JSON.parse throws and the quote preprocessor was
 * not able to fix the content before it reached us.
 */
function fixInvalidJsonEscapes(content: string): string {
  return content.replace(/"((?:[^"\\]|\\.)*)"/gs, (_match, inner: string) => {
    const fixed = escapeAllBackslashes(inner, 'json');
    return `"${fixed}"`;
  });
}

/**
 * Determines which CSV fields were quoted (used to differentiate "" vs empty cell)
 */
function getCsvQuotedFlags(rawRow: string, expectedFieldCount: number): boolean[] {
  const flags: boolean[] = [];
  let inQuotes = false;
  let fieldIndex = 0;
  let fieldStarted = false;
  const row = rawRow.replace(/[\r\n]+$/, '');

  for (let i = 0; i < row.length; i++) {
    const char = row[i]!;

    if (!fieldStarted) {
      fieldStarted = true;
      flags[fieldIndex] = char === '"';
    }

    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fieldIndex++;
      fieldStarted = false;
    }
  }

  while (flags.length < expectedFieldCount) {
    flags.push(false);
  }

  return flags;
}

/**
 * Recursively sanitize string values in parsed data.
 * 
 * - Trims leading/trailing whitespace from all string values (including array elements)
 * - Trims whitespace from object keys (keys should never be multiline)
 * - Preserves internal newlines in string values (for multiline fields like description)
 * - Handles nested objects and arrays recursively
 * 
 * This fixes issues where input sources (e.g., Slack) insert accidental
 * line breaks in field values like:
 *   issue type: "
 *   Bug"
 * 
 * @param data - Parsed data to sanitize
 * @returns Sanitized data with trimmed string values and keys
 */
function sanitizeValues<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Normalize Unicode variations (NFKC handles compatibility forms)
    // Remove invisible characters that can cause matching failures:
    // - U+200B: Zero-width space
    // - U+200C: Zero-width non-joiner
    // - U+200D: Zero-width joiner
    // - U+FEFF: Zero-width no-break space (BOM)
    // - U+00A0: Non-breaking space
    const normalized = data
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
    // Trim leading/trailing whitespace but preserve internal newlines
    return normalized.replace(/^\s+|\s+$/g, '') as T;
  }

  if (Array.isArray(data)) {
    // Recursively sanitize array elements
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return data.map((item) => sanitizeValues(item)) as T;
  }

  if (typeof data === 'object') {
    // Recursively sanitize object values and trim keys
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Sanitize keys the same way as values (remove invisible chars + trim)
      const sanitizedKey = key
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
        .trim();
      result[sanitizedKey] = sanitizeValues(value);
    }
    return result as T;
  }

  // Non-string primitives (numbers, booleans) pass through unchanged
  return data;
}

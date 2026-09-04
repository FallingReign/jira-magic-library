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
import { protectCustomBlocks } from './custom-block-preprocessor.js';

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
   * Opt in to legacy quote repair for malformed input only.
   * Valid input and literal blocks are never rewritten. Prefer <<< blocks for pasted text.
   * @default false
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

  // Literal blocks are enabled by default; legacy quote repair is opt-in.
  const shouldPreprocessCustomBlocks = options.preprocessCustomBlocks !== false;
  const shouldPreprocessQuotes = options.preprocessQuotes === true;

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
  shouldPreprocessQuotes = false
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
  shouldPreprocessQuotes = false
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

    // Array of objects: normalize field names without editing values.
    return {
      data: normalizeKeys(data as Record<string, unknown>[]),
      format: 'json',
      source: 'array',
    };
  }

  // Case 2: Single object (normalize to array and normalize field names).
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return {
      data: [normalizeKeys(data)],
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
  shouldPreprocessQuotes = false
): Record<string, unknown>[] {
  const protectedInput = shouldPreprocessCustomBlocks ? protectCustomBlocks(content, format)
    : { content, restore: (records: Record<string, unknown>[]) => records };
  const parseFormat = (text: string, compatibility = false): Record<string, unknown>[] => {
    switch (format) {
      case 'csv': return parseCSVContent(text);
      case 'json': return parseJSONContent(text, compatibility);
      case 'yaml': return parseYAMLContent(text, compatibility);
      default: throw new InputParseError(`Unsupported format: ${String(format)}`, { format });
    }
  };
  let records: Record<string, unknown>[];
  try {
    // Valid input always follows the format's normal rules, even in compatibility mode.
    records = parseFormat(protectedInput.content);
  } catch (error) {
    if (!shouldPreprocessQuotes) throw error;
    records = parseFormat(preprocessQuotes(protectedInput.content, format), true);
  }
  return protectedInput.restore(records);
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

    // Normalize field names, preserving values.
    return normalizeKeys(processed);
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

  // Normalize field names, preserving values.
  return {
    data: normalizeKeys(parsed),
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
function parseJSONContent(content: string, compatibility = false): Record<string, unknown>[] {
  const tryParse = (src: string): Record<string, unknown>[] => {
    const parsed: unknown = JSON.parse(src);
    if (Array.isArray(parsed)) {
      return normalizeKeys(parsed as Record<string, unknown>[]);
    } else if (typeof parsed === 'object' && parsed !== null) {
      return [normalizeKeys(parsed as Record<string, unknown>)];
    } else {
      throw new Error('JSON must be an object or array of objects');
    }
  };

  try {
    return tryParse(content);
  } catch (error) {
    const msg = (error as Error).message ?? '';

    // Retry: if the failure looks like a bad escape sequence or literal control
    // characters (e.g. Slack-injected newlines), fix and try once more.
    if (compatibility && (
      msg.toLowerCase().includes('escape') ||
      msg.includes('Unexpected token') ||
      msg.toLowerCase().includes('control character')
    )) {
      try {
        let fixed = fixInvalidJsonEscapes(content);
        fixed = fixLiteralControlCharsInJson(fixed);
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
function parseYAMLContent(content: string, compatibility = false): Record<string, unknown>[] {
  /** Load, flatten, and normalize field names in YAML documents in `src`. */
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
    return normalizeKeys(result);
  };

  try {
    return tryLoad(content);
  } catch (error) {
    const msg = (error as Error).message ?? '';

    // Retry: if the failure was an invalid escape sequence, aggressively escape
    // all backslashes inside double-quoted strings and try once more.
    if (compatibility && msg.includes('escape')) {
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
 * Pre-processing fix: escape literal control characters inside JSON string values.
 *
 * Some sources (e.g. Slack Workflow Builder) inject raw newlines or tabs directly
 * inside a JSON string literal, producing content like:
 *
 *   "assignee": {"name": "\n   username\n   "}
 *
 * This is invalid JSON ("Bad control character in string literal"). This function
 * escapes those control characters so JSON.parse can succeed, after which the
 * field-name normalization leaves the resulting string unchanged.
 *
 * Called as a retry when JSON.parse throws a "control character" error.
 */
function fixLiteralControlCharsInJson(content: string): string {
  return content.replace(/"((?:[^"\\]|\\.)*)"/gs, (_match, inner: string) => {
    const fixed = inner
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
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

/** Normalize field names while preserving all field values. */
function normalizeKeys<T>(data: T): T {
  if (Array.isArray(data)) {
    return (data as unknown[]).map(item => normalizeKeys(item)) as T;
  }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    const seen = new Set<string>();
    return Object.fromEntries(Object.entries(data).map(([key, value]) => {
      const normalizedKey = key.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
      if (seen.has(normalizedKey)) throw new InputParseError(`Duplicate field after name normalization: "${normalizedKey}"`);
      seen.add(normalizedKey);
      return [normalizedKey, normalizeKeys(value)];
    })) as T;
  }
  return data;
}

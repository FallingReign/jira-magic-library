/**
 * Unified Input Parser for CSV, JSON, and YAML formats
 * 
 * Story: E4-S01 - Unified Input Parser
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
 */
export interface ParseInputOptions {
  /** File path to read from */
  from?: string;
  /** Data to parse (string, array, or object) */
  data?: string | unknown[] | Record<string, unknown>;
  /** Explicit format (required for string data without file extension) */
  format?: 'csv' | 'json' | 'yaml';
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

  // Case 1: File path provided
  if (options.from) {
    return parseFromFile(options.from, options.format);
  }

  // Case 2: Data provided (string, array, or object)
  if (options.data === undefined) {
    throw new InputParseError(
      'No data provided',
      { options }
    );
  }
  return parseFromData(options.data, options.format);
}

/**
 * Parse input from a file path
 */
async function parseFromFile(
  filePath: string,
  explicitFormat?: 'csv' | 'json' | 'yaml'
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
  const data = parseContent(content, format);

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
  explicitFormat?: 'csv' | 'json' | 'yaml'
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

    // Array of objects (already parsed JSON)
    return {
      data: data as Record<string, unknown>[],
      format: 'json',
      source: 'array',
    };
  }

  // Case 2: Single object (normalize to array)
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return {
      data: [data],
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

    const parsed = parseContent(data, explicitFormat);
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
 */
function parseContent(content: string, format: 'csv' | 'json' | 'yaml'): Record<string, unknown>[] {
  try {
    switch (format) {
      case 'csv':
        return parseCSVContent(content);
      case 'json':
        return parseJSONContent(content);
      case 'yaml':
        return parseYAMLContent(content);
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

    return records.map((entry) => {
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

  return {
    data: parsed,
    format: 'csv',
    source: 'array',
  };
}

/**
 * Parse JSON content
 */
function parseJSONContent(content: string): Record<string, unknown>[] {
  try {
    const parsed: unknown = JSON.parse(content);

    // Normalize to array
    if (Array.isArray(parsed)) {
      return parsed as Record<string, unknown>[];
    } else if (typeof parsed === 'object' && parsed !== null) {
      return [parsed as Record<string, unknown>];
    } else {
      throw new Error('JSON must be an object or array of objects');
    }
  } catch (error) {
    throw new InputParseError(
      `Invalid JSON format: ${(error as Error).message}`,
      { format: 'json', originalError: (error as Error).message }
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
 */
function parseYAMLContent(content: string): Record<string, unknown>[] {
  try {
    // Try to load all documents (supports document stream with --- separators)
    const documents: unknown[] = yaml.loadAll(content);

    // Flatten and normalize all documents
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

    return result;
  } catch (error) {
    throw new InputParseError(
      `Invalid YAML format: ${(error as Error).message}`,
      { format: 'yaml', originalError: (error as Error).message }
    );
  }
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

/**
 * Custom Block Preprocessor for YAML, JSON, and CSV Input
 *
 * Converts custom block syntax (<<< >>>) into properly quoted strings
 * before format-specific parsing. This allows users to paste multiline
 * content with quotes, colons, and special characters without escaping.
 *
 * **Key behaviors:**
 * - Detects both bare `<<<` and quoted `"<<<` patterns
 * - YAML/JSON: Escapes all backslashes (raw content), `"` as `\"`, newlines as `\n`
 * - CSV: Escapes internal `"` as `""` (RFC 4180)
 * - Preserves content exactly (no dedent)
 * - Preserves line ending style (CRLF/LF/CR)
 * - Never throws errors - returns input unchanged on failure
 * - Fast path: Returns immediately if no `<<<` found
 *
 * **Processing order:** Custom blocks → Quote preprocessor → Format parser
 *
 * @example
 * ```typescript
 * // YAML with custom block
 * const input = 'description: <<<\nMultiline with "quotes"\n>>>';
 * const output = preprocessCustomBlocks(input, 'yaml');
 * // output: 'description: "Multiline with \\"quotes\\""'
 * ```
 *
 * @module parsers/custom-block-preprocessor
 */

/** Supported input formats */
export type Format = 'yaml' | 'json' | 'csv';

/**
 * Preprocess custom blocks in input content.
 *
 * Converts `<<<\n...content...\n>>>` blocks into properly quoted strings
 * with format-specific escaping. Handles both bare and quoted blocks.
 *
 * @param content - The raw input content to preprocess
 * @param format - The format of the input ('yaml', 'json', or 'csv')
 * @returns The preprocessed content with blocks converted, or original input if unchanged/error
 *
 * @example
 * ```typescript
 * // YAML bare block
 * preprocessCustomBlocks('desc: <<<\nText\n>>>', 'yaml');
 * // Returns: 'desc: "Text"'
 *
 * // JSON with quotes inside
 * preprocessCustomBlocks('{"a": <<<\nSay "hi"\n>>>}', 'json');
 * // Returns: '{"a": "Say \\"hi\\""}'
 *
 * // CSV cell
 * preprocessCustomBlocks('A,B\n1,<<<\nLine 1\n>>>', 'csv');
 * // Returns: 'A,B\n1,"Line 1"'
 * ```
 */
export function preprocessCustomBlocks(content: string, format: Format): string {
  try {
    // Fast path: Return immediately if no blocks present
    if (!content.includes('<<<')) {
      return content;
    }

    // Detect line ending style to preserve it
    const lineEnding = detectLineEnding(content);

    // Process quoted blocks FIRST (so outer quotes are removed before bare block processing)
    // Then process bare blocks
    let processed = processQuotedBlocks(content, format, lineEnding);
    processed = processBareBlocks(processed, format, lineEnding);

    return processed;
  } catch {
    // Never throw - return input unchanged on failure
    return content;
  }
}

/**
 * Detect the line ending style used in the content
 */
function detectLineEnding(content: string): string {
  if (content.includes('\r\n')) {
    return '\r\n';
  } else if (content.includes('\r')) {
    return '\r';
  } else {
    return '\n';
  }
}

/**
 * Process bare blocks (<<<\n...content...\n>>>)
 */
function processBareBlocks(content: string, format: Format, lineEnding: string): string {
  // Match bare blocks: <<< followed by newline, content, newline, >>>
  // Special case: handle empty blocks (<<< followed immediately by >>>)
  // (?!>) ensures we only match exactly >>> and not >>>>+ (e.g. >>>>>> some text)
  const emptyBlockPattern = new RegExp(`<<<\\s*${escapeRegex(lineEnding)}\\s*>>>(?!>)`, 'g');
  let processed = content.replace(emptyBlockPattern, '""');

  // Match non-empty bare blocks
  // Use [\s\S] to match any character including newlines
  // Non-greedy match to handle multiple blocks
  // (?!>) ensures we only match exactly >>> and not >>>>+ (e.g. >>>>>> some text)
  const bareBlockPattern = new RegExp(`<<<\\s*${escapeRegex(lineEnding)}([\\s\\S]*?)${escapeRegex(lineEnding)}\\s*>>>(?!>)`, 'g');

  processed = processed.replace(bareBlockPattern, (_match, blockContent: string) => {
    return convertBlockToQuotedString(blockContent, format, lineEnding);
  });

  return processed;
}

/**
 * Process quoted blocks ("<<<\n...content...\n>>>" or '<<<\n...content...\n>>>')
 */
function processQuotedBlocks(content: string, format: Format, lineEnding: string): string {
  // Match quoted blocks: " or ' followed by <<<, content, >>>, closing quote
  // We need to capture and replace the entire quoted block including the outer quotes
  // (?!>) ensures we only match exactly >>> and not >>>>+ (e.g. >>>>>> some text)
  const quotedBlockPattern = new RegExp(`["']<<<\\s*${escapeRegex(lineEnding)}([\\s\\S]*?)${escapeRegex(lineEnding)}\\s*>>>(?!>)["']`, 'g');

  return content.replace(quotedBlockPattern, (_match, blockContent: string) => {
    // Return just the converted quoted string (outer quotes are removed and replaced)
    return convertBlockToQuotedString(blockContent, format, lineEnding);
  });
}

/**
 * Convert block content to properly quoted and escaped string
 */
function convertBlockToQuotedString(content: string, format: Format, lineEnding: string): string {
  // Trim leading/trailing empty lines only
  const trimmed = trimEmptyLines(content, lineEnding);

  // Escape internal quotes and handle newlines based on format
  let escaped: string;
  switch (format) {
    case 'yaml':
    case 'json': {
      // Block content is raw/literal text — double ALL backslashes first so they
      // survive being placed inside a double-quoted YAML/JSON string.
      // (Actual newlines are handled separately below; \n escape sequences
      // typed literally by the user will also be preserved as-is.)
      const withEscapedBackslashes = trimmed.replace(/\\/g, '\\\\');
      // YAML/JSON parsers require \n escape sequences (not real newlines)
      const withEscapedNewlines = withEscapedBackslashes.replace(new RegExp(escapeRegex(lineEnding), 'g'), '\\n');
      // Escape " as \"
      escaped = withEscapedNewlines.replace(/"/g, '\\"');
      break;
    }
    case 'csv':
      // CSV preserves real newlines in quoted cells (RFC 4180)
      // Escape " as ""
      escaped = trimmed.replace(/"/g, '""');
      break;
  }

  // Return quoted string
  return `"${escaped}"`;
}

/**
 * Trim empty first and last lines only (preserve content exactly)
 */
function trimEmptyLines(content: string, lineEnding: string): string {
  const lines = content.split(lineEnding);

  // Trim first line if empty
  if (lines.length > 0 && lines[0]!.trim() === '') {
    lines.shift();
  }

  // Trim last line if empty
  if (lines.length > 0 && lines[lines.length - 1]!.trim() === '') {
    lines.pop();
  }

  return lines.join(lineEnding);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

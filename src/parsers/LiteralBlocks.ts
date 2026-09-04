import { InputParseError } from '../errors/InputParseError.js';

export type Format = 'yaml' | 'json' | 'csv';

interface Block {
  start: number;
  end: number;
  value: string;
}

function quote(value: string, format: Format): string {
  return format === 'csv' ? `"${value.replace(/"/g, '""')}"` : JSON.stringify(value);
}

/** Skip a regular quoted value without interpreting its contents. */
function skipQuoted(content: string, start: number, format: Format): number {
  const wrapper = content[start]!;
  for (let i = start + 1; i < content.length; i++) {
    if (content[i] === '\\' && format !== 'csv' && wrapper === '"') { i++; continue; }
    if (content[i] !== wrapper) continue;
    if ((format === 'csv' || wrapper === "'") && content[i + 1] === wrapper) { i++; continue; }
    return i + 1;
  }
  return content.length;
}

/** Standard YAML block scalars already own their indented text. */
function skipYamlScalar(content: string, start: number): number {
  const header = /^(?:[|>])(?:[1-9][+-]?|[+-][1-9]?)?[ \t]*(?:#[^\r\n]*)?(?:\r\n|\r|\n|$)/.exec(content.slice(start));
  if (!header) return start + 1;
  const lineStart = Math.max(content.lastIndexOf('\n', start - 1), content.lastIndexOf('\r', start - 1)) + 1;
  const indent = /^[ \t]*/.exec(content.slice(lineStart))![0].length;
  let cursor = start + header[0].length;
  while (cursor < content.length) {
    const line = /^[^\r\n]*(?:\r\n|\r|\n|$)/.exec(content.slice(cursor))![0];
    if (line.trim() && /^[ \t]*/.exec(line)![0].length <= indent) break;
    cursor += line.length;
  }
  return cursor;
}

function readBlock(content: string, start: number, opening: RegExpExecArray, format: Format): Block {
  const wrapper = opening[1]!;
  const bodyStart = start + opening[0].length;
  let cursor = bodyStart;
  while (cursor <= content.length) {
    const line = /^[^\r\n]*/.exec(content.slice(cursor))![0];
    const closing = /^([ \t]*)>>>(?!>)(["']?)/.exec(line);
    if (closing && closing[2] === wrapper) {
      const suffix = line.slice(closing[0].length);
      const allowed = format === 'csv' ? /^[ \t]*(?:,.*)?$/
        : format === 'yaml' ? /^[ \t]*(?:#.*|[,}\]].*)?$/ : /^[ \t]*(?:[,}\]].*)?$/;
      if (allowed.test(suffix)) {
        return {
          start, end: cursor + closing[0].length,
          // Only the newline introducing the closing marker belongs to the delimiter.
          value: content.slice(bodyStart, cursor).replace(/(?:\r\n|\r|\n)$/, ''),
        };
      }
    }
    const ending = /^(?:\r\n|\r|\n)/.exec(content.slice(cursor + line.length));
    if (!ending) break;
    cursor += line.length + ending[0].length;
  }
  const before = content.slice(0, start);
  const line = before.split(/\r\n|\r|\n/).length;
  const column = start - Math.max(before.lastIndexOf('\r'), before.lastIndexOf('\n'));
  throw new InputParseError(`Unclosed <<< block at line ${line}, column ${column}. Add a matching >>> on its own line.`, { format, line, column });
}

/** Detect field-value blocks outside strings, comments, and YAML scalars. */
function findBlocks(content: string, format: Format): Block[] {
  const blocks: Block[] = [];
  let previous = '';
  let lineStart = true;
  for (let i = 0; i < content.length;) {
    const char = content[i]!;
    if (char === '\n' || char === '\r') { lineStart = true; i++; continue; }
    if (char === ' ' || char === '\t') { i++; continue; }
    const valuePosition = format === 'csv' ? lineStart || previous === ','
      : previous === ':' || previous === '[' || previous === ',' || (format === 'yaml' && (lineStart || previous === '-'));
    const opening = valuePosition ? /^(["']?)<<<[ \t]*(?:\r\n|\r|\n)/.exec(content.slice(i)) : null;
    if (opening) {
      const block = readBlock(content, i, opening, format);
      blocks.push(block);
      i = block.end;
      previous = '"';
      lineStart = false;
      continue;
    }
    if (format === 'yaml' && char === '#' && (lineStart || /\s/.test(content[i - 1] ?? ''))) {
      i += /^[^\r\n]*/.exec(content.slice(i))![0].length;
      continue;
    }
    if (format === 'yaml' && valuePosition && (char === '|' || char === '>')) {
      i = skipYamlScalar(content, i);
      lineStart = true;
      previous = '';
      continue;
    }
    if ((char === '"' || char === "'") && (format === 'json' || valuePosition || lineStart || previous === '{')) {
      i = skipQuoted(content, i, format);
      previous = char;
      lineStart = false;
      continue;
    }
    previous = char;
    lineStart = false;
    i++;
  }
  return blocks;
}

function replaceBlocks(content: string, blocks: Block[], replacement: (block: Block, index: number) => string): string {
  let output = '';
  let cursor = 0;
  blocks.forEach((block, index) => {
    output += content.slice(cursor, block.start) + replacement(block, index);
    cursor = block.end;
  });
  return output + content.slice(cursor);
}

/** Expand <<< blocks once. All content between the delimiter lines is literal. */
export function preprocessCustomBlocks(content: string, format: Format): string {
  return replaceBlocks(content, findBlocks(content, format), block => quote(block.value, format));
}

/** Keep literal text out of compatibility quote repair, restoring it after parsing. */
export function protectCustomBlocks(content: string, format: Format): {
  content: string;
  restore: (records: Record<string, unknown>[]) => Record<string, unknown>[];
} {
  const blocks = findBlocks(content, format);
  let prefix = '__JML_LITERAL_';
  while (content.includes(prefix)) prefix += '_';
  const values = new Map(blocks.map((block, index) => [`${prefix}${index}__`, block.value]));
  const restoreValue = (value: unknown): unknown => {
    if (typeof value === 'string') return values.get(value) ?? value;
    if (Array.isArray(value)) return value.map(restoreValue);
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreValue(item)]));
    }
    return value;
  };
  return {
    content: replaceBlocks(content, blocks, (_block, index) => quote(`${prefix}${index}__`, format)),
    restore: records => records.map(record => restoreValue(record) as Record<string, unknown>),
  };
}

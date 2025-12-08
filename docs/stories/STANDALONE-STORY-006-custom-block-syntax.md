# S6: Custom Block Syntax for Multiline Content

**Epic**: Standalone Story (Backlog)  
**Size**: Medium (5 points)  
**Priority**: P1  
**Status**: 📋 Ready for Development  
**Assignee**: -  
**PR**: -  
**Started**: -  
**Completed**: -

---

## User Story

**As a** developer creating JIRA issues from copied content  
**I want** a custom block syntax (`<<<` / `>>>`) for multiline text  
**So that** I can paste content with quotes, colons, and special characters without any escaping

---

## Acceptance Criteria

### ✅ AC1: Custom Block Preprocessor Module
- [ ] Create `src/parsers/custom-block-preprocessor.ts`
- [ ] Export `preprocessCustomBlocks(content: string, format: Format): string`
- [ ] Support YAML, JSON, and CSV formats
- [ ] Never throw errors - return input unchanged on failure

**Evidence**: 

### ✅ AC2: Bare Block Detection (`<<<` / `>>>`)
- [ ] Detect bare blocks: `key: <<<\ncontent\n>>>`
- [ ] Extract content between delimiters
- [ ] Convert to properly quoted string for target format
- [ ] Handle blocks at start, middle, and end of document

**Evidence**: 

### ✅ AC3: Quoted Block Detection (`"<<<` / `>>>"`)
- [ ] Detect quoted blocks: `key: "<<<\ncontent\n>>>"`
- [ ] Strip outer quotes before processing content
- [ ] Convert to properly quoted string (removes redundant wrapper)
- [ ] Handle both single and double quote wrappers

**Evidence**: 

### ✅ AC4: Format-Specific Escaping
- [ ] YAML: Escape internal `"` as `\"`, output double-quoted string
- [ ] JSON: Escape internal `"` as `\"`, output double-quoted string
- [ ] CSV: Escape internal `"` as `""` (RFC 4180), output double-quoted cell
- [ ] Preserve all other content literally (no YAML/JSON interpretation)

**Evidence**: 

### ✅ AC5: Indentation Handling
- [ ] Strip common leading whitespace from block content (dedent)
- [ ] Preserve relative indentation within block
- [ ] Trim first line if empty (after `<<<`)
- [ ] Trim last line if empty (before `>>>`)

**Evidence**: 

### ✅ AC6: Integration with InputParser
- [ ] Modify `parseContent()` to call `preprocessCustomBlocks()` first
- [ ] Run before `preprocessQuotes()` (custom blocks first, then quote fixing)
- [ ] Maintain backward compatibility (no breaking changes)
- [ ] Add `preprocessCustomBlocks` option to `ParseInputOptions` (default: true)

**Evidence**: 

### ✅ AC7: Multiple Blocks in Single Document
- [ ] Handle multiple custom blocks in same document
- [ ] Each block processed independently
- [ ] Blocks can be in different fields
- [ ] Works with mixed regular quotes and custom blocks

**Evidence**: 

### ✅ AC8: Edge Cases and Error Handling
- [ ] Unclosed blocks: Return original input unchanged
- [ ] Empty blocks (`<<< >>>`): Convert to empty string `""`
- [ ] Blocks at EOF without final `>>>`
- [ ] Mixed line endings (CRLF/LF/CR) preserved
- [ ] Pass-through: Input without `<<<` returns unchanged (fast path)

**Evidence**: 

---

## Technical Notes

### Architecture Prerequisites
- [InputParser architecture](../architecture/system-architecture.md#input-parsing)
- Key design patterns: Preprocessor pipeline, format-specific handlers
- Key constraints: Never throw, preserve line endings, fast path for no-op

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- Node.js and npm available
- `npm install` completed
- No external services required (pure string transformation)

### Dependencies
- E4-S01: Unified Input Parser (provides InputParser infrastructure) ✅
- E4-S14: Quote Preprocessor (provides quote escaping infrastructure) ✅

### Implementation Guidance

**Processing Pipeline (order matters):**
```typescript
function parseContent(content: string, format, shouldPreprocess) {
  let processed = content;
  
  // Step 1: Expand custom blocks FIRST (not valid syntax otherwise)
  if (shouldPreprocessCustomBlocks) {
    processed = preprocessCustomBlocks(processed, format);
  }
  
  // Step 2: Fix remaining quote issues
  if (shouldPreprocessQuotes) {
    processed = preprocessQuotes(processed, format);
  }
  
  // Step 3: Parse with format-specific parser
  return parseFormat(processed, format);
}
```

**Block Detection Patterns:**
```typescript
// Bare block (most common)
const bareBlockPattern = /<<<\s*\n([\s\S]*?)\n\s*>>>/g;

// Quoted block (user wrapped it)
const quotedBlockPattern = /"<<<\s*\n([\s\S]*?)\n\s*>>>"/g;
```

**Format-Specific Conversion:**
```typescript
function convertBlockToQuotedString(content: string, format: Format): string {
  // Dedent content (strip common leading whitespace)
  const dedented = dedent(content);
  
  // Trim leading/trailing empty lines
  const trimmed = trimEmptyLines(dedented);
  
  // Escape internal quotes based on format
  switch (format) {
    case 'yaml':
    case 'json':
      return `"${trimmed.replace(/"/g, '\\"')}"`;
    case 'csv':
      return `"${trimmed.replace(/"/g, '""')}"`;
  }
}
```

**Dedent Algorithm:**
```typescript
function dedent(text: string): string {
  const lines = text.split('\n');
  
  // Find minimum indentation (ignoring empty lines)
  const minIndent = lines
    .filter(line => line.trim().length > 0)
    .reduce((min, line) => {
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      return Math.min(min, indent);
    }, Infinity);
  
  // Strip common prefix from all lines
  return lines
    .map(line => line.slice(minIndent))
    .join('\n');
}
```

---

## Implementation Example

```typescript
// YAML input with custom block
const yamlInput = `project: PROJ
summary: Bug report
description: <<<
  This is a multiline description.
  It contains "quotes" and special: characters.
  
  No escaping needed!
>>>
priority: High`;

// After preprocessCustomBlocks():
const processed = `project: PROJ
summary: Bug report
description: "This is a multiline description.\\nIt contains \\"quotes\\" and special: characters.\\n\\nNo escaping needed!"
priority: High`;

// JSON input with custom block
const jsonInput = `{
  "description": <<<
    First line with "quotes"
    Second line with colons: everywhere
  >>>
}`;

// After preprocessCustomBlocks():
const processedJson = `{
  "description": "First line with \\"quotes\\"\\nSecond line with colons: everywhere"
}`;

// CSV input with custom block
const csvInput = `Project,Summary,Description
PROJ,Test,"<<<
Line 1 with "quotes"
Line 2
>>>"`;

// After preprocessCustomBlocks():
const processedCsv = `Project,Summary,Description
PROJ,Test,"Line 1 with ""quotes""
Line 2"`;
```

---

## Definition of Done

- [ ] All acceptance criteria met with evidence links
- [ ] Code implemented in `src/parsers/custom-block-preprocessor.ts`
- [ ] Unit tests passing (≥95% coverage)
- [ ] Integration with InputParser tested
- [ ] Demo created OR exception documented (see [DoD Exceptions](../workflow/reference/dod-exceptions.md))
- [ ] TSDoc comments added to public APIs
- [ ] Code passes linting and type checking
- [ ] Export added to `src/index.ts`
- [ ] Committed with message: `S6: Add custom block syntax for multiline content`

---

## Definition of Done Exceptions

{None expected - demo should show before/after transformation}

---

## Implementation Hints

1. **Fast Path First**: Check for `<<<` at start; if not found, return immediately
2. **Regex with `g` flag**: Multiple blocks possible, use global matching
3. **Preserve Line Endings**: Detect CRLF/LF/CR at start, use same throughout
4. **Test Real-World Input**: Use actual Slack payloads in tests
5. **Boundary Detection**: Handle `<<<` at EOF, `>>>` at start of line
6. **Quoted vs Bare**: Process both patterns, quoted blocks strip wrapper quotes
7. **Integration Order**: Custom blocks BEFORE quote preprocessor (critical!)
8. **Performance**: ~500K ops/sec target (similar to quote-preprocessor)

---

## Related Stories

- **Depends On**: E4-S01 (Unified Input Parser) ✅, E4-S14 (Quote Preprocessor) ✅
- **Blocks**: None
- **Related**: S5 (Debug Logging) 📋 - may want debug output for block detection

---

## Testing Strategy

### Unit Tests (tests/unit/parsers/custom-block-preprocessor.test.ts)
```typescript
describe('CustomBlockPreprocessor', () => {
  describe('preprocessCustomBlocks()', () => {
    describe('YAML format', () => {
      it('should convert bare block to quoted string', () => { ... });
      it('should convert quoted block to quoted string', () => { ... });
      it('should escape internal double quotes', () => { ... });
      it('should dedent content (strip common indent)', () => { ... });
      it('should handle multiple blocks in document', () => { ... });
    });
    
    describe('JSON format', () => {
      it('should convert block in JSON object', () => { ... });
      it('should convert block in JSON array', () => { ... });
      it('should escape internal quotes', () => { ... });
    });
    
    describe('CSV format', () => {
      it('should convert block in CSV cell', () => { ... });
      it('should double internal quotes (RFC 4180)', () => { ... });
      it('should handle multiline cells', () => { ... });
    });
    
    describe('edge cases', () => {
      it('should return unchanged if no blocks', () => { ... });
      it('should handle unclosed block gracefully', () => { ... });
      it('should handle empty block', () => { ... });
      it('should preserve line endings (CRLF/LF)', () => { ... });
    });
    
    describe('real-world scenarios', () => {
      it('should handle Slack-copied content with quotes', () => { ... });
      it('should handle content with YAML-like keys inside', () => { ... });
    });
  });
});
```

### Integration Tests (tests/unit/parsers/InputParser.test.ts)
```typescript
describe('InputParser with custom blocks', () => {
  it('should process custom blocks before quote preprocessing', () => { ... });
  it('should parse YAML with custom blocks end-to-end', () => { ... });
  it('should parse JSON with custom blocks end-to-end', () => { ... });
  it('should parse CSV with custom blocks end-to-end', () => { ... });
});
```

---

## Notes

### Design Decisions

1. **Delimiter Choice (`<<<` / `>>>`)**: 
   - Clear visual boundary
   - Not valid YAML/JSON/CSV syntax (won't conflict)
   - Not commonly used in natural text
   - Similar to shell heredoc syntax (familiar to developers)

2. **Dedent by Default**:
   - Users naturally indent content inside blocks for readability
   - Stripping common indent prevents unwanted leading spaces
   - Matches Python's `textwrap.dedent()` behavior

3. **Support Quoted Wrappers**:
   - Some tools may auto-wrap values in quotes
   - `"<<<content>>>"` should work same as `<<<content>>>`
   - Prevents user confusion

4. **Never Throw**:
   - Follows same pattern as quote-preprocessor
   - Malformed input returns unchanged (best effort)
   - Graceful degradation preferred

### Future Considerations

- **Nested Blocks**: Not supported in v1 (simple implementation)
- **Custom Delimiters**: Could allow `<<<EOF` / `EOF` style (like bash heredoc)
- **Escape Sequence**: Could support `\<<<` to literally include `<<<`

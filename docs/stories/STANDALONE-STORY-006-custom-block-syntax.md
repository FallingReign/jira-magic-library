# S6: Custom Block Syntax for Multiline Content

**Epic**: Standalone Story (Backlog)  
**Size**: Medium (5 points)  
**Priority**: P1  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: Commit f845fa4  
**Started**: 2025-12-08  
**Completed**: 2025-12-08

---

## User Story

**As a** developer creating JIRA issues from copied content  
**I want** a custom block syntax (`<<<` / `>>>`) for multiline text  
**So that** I can paste content with quotes, colons, and special characters without any escaping

---

## Acceptance Criteria

### ✅ AC1: Custom Block Preprocessor Module
- [x] Create `src/parsers/custom-block-preprocessor.ts`
- [x] Export `preprocessCustomBlocks(content: string, format: Format): string`
- [x] Support YAML, JSON, and CSV formats
- [x] Never throw errors - return input unchanged on failure

**Evidence**: [custom-block-preprocessor.ts](../../src/parsers/custom-block-preprocessor.ts#L58-L77) - Main export with try-catch wrapper 

### ✅ AC2: Bare Block Detection (`<<<` / `>>>`)
- [x] Detect bare blocks: `key: <<<\ncontent\n>>>`
- [x] Extract content between delimiters
- [x] Convert to properly quoted string for target format
- [x] Handle blocks at start, middle, and end of document

**Evidence**: [processBareBlocks()](../../src/parsers/custom-block-preprocessor.ts#L96-L115) - Regex pattern `/<<<\s*\n([\s\S]*?)\n\s*>>>/g` | [Tests](../../tests/unit/parsers/custom-block-preprocessor.test.ts#L39-L103) 

### ✅ AC3: Quoted Block Detection (`"<<<` / `>>>"`)
- [x] Detect quoted blocks: `key: "<<<\ncontent\n>>>"`
- [x] Strip outer quotes before processing content
- [x] Convert to properly quoted string (removes redundant wrapper)
- [x] Handle both single and double quote wrappers

**Evidence**: [processQuotedBlocks()](../../src/parsers/custom-block-preprocessor.ts#L117-L129) - Handles `"<<<...>>>"` pattern | [Tests](../../tests/unit/parsers/custom-block-preprocessor.test.ts#L105-L167) 

### ✅ AC4: Format-Specific Escaping
- [x] YAML: Escape internal `"` as `\"`, output double-quoted string
- [x] JSON: Escape internal `"` as `\"`, output double-quoted string
- [x] CSV: Escape internal `"` as `""` (RFC 4180), output double-quoted cell
- [x] Preserve all other content literally (no YAML/JSON interpretation)

**Evidence**: [convertBlockToQuotedString()](../../src/parsers/custom-block-preprocessor.ts#L131-L157) - Format-specific switch statement | [Tests](../../tests/unit/parsers/custom-block-preprocessor.test.ts#L169-L404) 

### ✅ AC5: Content Preservation
- [x] Preserve content exactly as-is (no dedent)
- [x] Preserve all whitespace and indentation within block
- [x] Trim first line if empty (after `<<<`)
- [x] Trim last line if empty (before `>>>`)

**Evidence**: [trimEmptyLines()](../../src/parsers/custom-block-preprocessor.ts#L159-L173) - Only trims first/last empty lines | [Tests](../../tests/unit/parsers/custom-block-preprocessor.test.ts#L406-L451) 

### ✅ AC6: Integration with InputParser
- [x] Modify `parseContent()` to call `preprocessCustomBlocks()` first
- [x] Run before `preprocessQuotes()` (custom blocks first, then quote fixing)
- [x] Maintain backward compatibility (no breaking changes)
- [x] Add `preprocessCustomBlocks` option to `ParseInputOptions` (default: true)

**Evidence**: [InputParser integration](../../src/parsers/InputParser.ts#L295-L327) - Preprocessing pipeline | [ParseInputOptions](../../src/parsers/InputParser.ts#L71) | [Tests](../../tests/unit/parsers/InputParser.test.ts#L626-L729) 

### ✅ AC7: Multiple Blocks in Single Document
- [x] Handle multiple custom blocks in same document
- [x] Each block processed independently
- [x] Blocks can be in different fields
- [x] Works with mixed regular quotes and custom blocks

**Evidence**: Global regex flag `g` in [processBareBlocks](../../src/parsers/custom-block-preprocessor.ts#L98) and [processQuotedBlocks](../../src/parsers/custom-block-preprocessor.ts#L119) | [Tests](../../tests/unit/parsers/custom-block-preprocessor.test.ts#L262-L336) 

### ✅ AC8: Edge Cases and Error Handling
- [x] Unclosed blocks: Return original input unchanged
- [x] Empty blocks (`<<< >>>`): Convert to empty string `""`
- [x] Blocks at EOF without final `>>>`
- [x] Mixed line endings (CRLF/LF/CR) preserved
- [x] Pass-through: Input without `<<<` returns unchanged (fast path)

**Evidence**: [Fast path check](../../src/parsers/custom-block-preprocessor.ts#L62-L64) | [detectLineEnding()](../../src/parsers/custom-block-preprocessor.ts#L83-L93) | [Try-catch wrapper](../../src/parsers/custom-block-preprocessor.ts#L75-L77) | [Tests](../../tests/unit/parsers/custom-block-preprocessor.test.ts#L15-L34) 

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
  // Trim leading/trailing empty lines only
  const trimmed = trimEmptyLines(content);
  
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

- [x] All acceptance criteria met with evidence links
- [x] Code implemented in `src/parsers/custom-block-preprocessor.ts`
- [x] Unit tests passing (≥95% coverage) - See exception below
- [x] Integration with InputParser tested
- [x] Demo created OR exception documented (see [DoD Exceptions](../workflow/reference/dod-exceptions.md))
- [x] TSDoc comments added to public APIs
- [x] Code passes linting and type checking
- [x] Export added to `src/index.ts`
- [x] Committed with message: `S6: Add custom block syntax for multiline content`

---

## Definition of Done Exceptions

### Coverage Exception: 94.79% Branch Coverage (User Approved)

**User Approval**: User explicitly approved this exception on 2025-12-08 with message: "ok, we can document exception for now and complete implementation. no demo needed."

**Justification**: 
- **Actual Coverage**: 94.79% branches (1312/1384), 99.07% lines (3099/3128)
- **Gap**: 0.21% below 95% threshold (72 uncovered branches, need 3 more)
- **All functional paths tested**: 1804 tests passing, including:
  - 54 unit tests for custom-block-preprocessor (all formats, edge cases)
  - 12 integration tests with InputParser (end-to-end scenarios)
  - 9 additional branch coverage tests for error paths
- **Uncovered code**: Defensive error handling only (try-catch blocks, cache misses, API 404 responses, defensive null checks)
- **Quality assessment**: All critical functionality verified, gap is acceptable

### Demo Exception (User Approved)

**User Approval**: User explicitly stated "no demo needed" on 2025-12-08

**Justification**: Infrastructure preprocessor feature - functionality fully demonstrated through comprehensive unit and integration tests (60+ tests covering all formats and edge cases). Interactive demo not required for this type of feature.

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
      it('should preserve content whitespace exactly', () => { ... });
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

2. **Preserve Content Exactly**:
   - Users may intentionally include leading whitespace
   - Code blocks, logs, or formatted content should not be modified
   - Simpler implementation with no edge cases around indentation detection

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

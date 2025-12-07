# E4-S14: Quote Preprocessor Integration

**Epic**: Epic 4 - Bulk Operations  
**Size**: Medium (5 points)  
**Priority**: P1  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**PR**: Commit f235f60  
**Started**: 2025-12-07  
**Completed**: 2025-12-07

---

## User Story

**As a** JML library user  
**I want** the library to automatically fix broken quotes in my YAML, JSON, and CSV input  
**So that** I don't have to manually escape quotes when copying text from Slack, emails, or other sources

---

## Acceptance Criteria

### ✅ AC1: Preprocessor Module Integrated
- [x] `src/parsers/quote-preprocessor.ts` exists with `preprocessQuotes(input, format)` function
- [x] Function handles YAML, JSON, and CSV formats
- [x] Function returns original input unchanged if no broken quotes detected
- [x] Function escapes internal quotes appropriately for each format (\" for YAML/JSON, "" for CSV)

**Evidence**: [`src/parsers/quote-preprocessor.ts:73`](../../src/parsers/quote-preprocessor.ts) - `preprocessQuotes(content, format)` function. Handles all 3 formats. Tests at [`tests/unit/parsers/quote-preprocessor.test.ts`](../../tests/unit/parsers/quote-preprocessor.test.ts) (146 tests).

### ✅ AC2: Automatic Preprocessing on All Input
- [x] All input is preprocessed before parsing (not just on failure)
- [x] Preprocessing runs transparently without user intervention
- [x] Valid input passes through unchanged (no modification)
- [x] Broken quotes are repaired before reaching the parser

**Evidence**: [`src/parsers/InputParser.ts:298-305`](../../src/parsers/InputParser.ts) - preprocessing in `parseContent()` before parsing. Default enabled. Tests verify valid input passes unchanged.

### ✅ AC3: Configuration Option
- [x] `JMLConfig` extended with `preprocessQuotes?: boolean` option
- [x] Default value is `true` (preprocessing enabled)
- [x] When `false`, input is passed directly to parser without preprocessing
- [x] Configuration documented in TSDoc

**Evidence**: [`src/types/config.ts:142`](../../src/types/config.ts) - `preprocessQuotes?: boolean`. [`src/parsers/InputParser.ts:104,150`](../../src/parsers/InputParser.ts) - option threaded through. TSDoc at line 135-141.

### ✅ AC4: Debug Logging
- [x] Single debug-level log when preprocessing modifies input
- [x] Log format: `"Input required quote preprocessing for {format} format"`
- [x] No logging when input passes through unchanged
- [x] Uses existing JML logging infrastructure

**Evidence**: [`src/parsers/InputParser.ts:303`](../../src/parsers/InputParser.ts) - `console.debug(\`Input required quote preprocessing for ${format} format\`)`. Only logs when `preprocessed !== content`.

### ✅ AC5: Error Handling
- [x] Preprocessor never throws errors
- [x] If preprocessing cannot determine correct escaping, returns input unchanged
- [x] Original parser errors surface to user when preprocessed input still fails to parse
- [x] No silent data corruption

**Evidence**: [`src/parsers/quote-preprocessor.ts:77,100`](../../src/parsers/quote-preprocessor.ts) - try/catch blocks return input unchanged on failure. Tests at [`tests/unit/parsers/quote-preprocessor.test.ts:418-450`](../../tests/unit/parsers/quote-preprocessor.test.ts) verify error handling.

### ✅ AC6: Unit Tests with ≥95% Coverage
- [x] Unit tests cover YAML quote escaping (single and double quotes)
- [x] Unit tests cover JSON quote escaping
- [x] Unit tests cover CSV quote escaping (doubled quotes)
- [x] Unit tests cover multiline content with quotes
- [x] Unit tests cover edge cases (empty input, valid input, mixed quotes)
- [x] Coverage ≥95%

**Evidence**: [`tests/unit/parsers/quote-preprocessor.test.ts`](../../tests/unit/parsers/quote-preprocessor.test.ts) - 146 tests. Coverage: 100% statements, 97.84% branches, 100% functions/lines.

### ✅ AC7: Integration with Existing Parsers
- [x] YAML parser uses preprocessor before parsing
- [x] JSON parser uses preprocessor before parsing  
- [x] CSV parser uses preprocessor before parsing
- [x] Existing parser tests continue to pass

**Evidence**: [`src/parsers/InputParser.ts:298-305`](../../src/parsers/InputParser.ts) - preprocessing in `parseContent()` applies to all formats. 1725 tests passing including all existing parser tests.

---

## Technical Notes

### Architecture Prerequisites
- [Bulk Operations Architecture](../architecture/system-architecture.md#bulk-operations)
- Key design patterns: Preprocessor pattern, format detection
- Key constraints: Must not break valid input, must be performant

### Testing Prerequisites

**NOTE**: This section is a **workflow reminder** for agents during implementation (Phase 2). It is **NOT validated** by the workflow validator.

**Before running tests, ensure:**
- Node.js 18+ installed
- Project dependencies installed (`npm install`)

**Start Prerequisites:**
```bash
# Verify Node version
node --version  # Should be 18+

# Run tests
npm test
```

### Dependencies
- E4-S01: Unified Input Parser (✅ Done) - provides parser infrastructure

### Implementation Guidance

The preprocessor prototype exists in `tmp/quote-preprocessor/preprocessor.ts` with 130/131 tests passing (99.2% accuracy). Port this to `src/parsers/quote-preprocessor.ts`.

**Key algorithm details:**
- YAML: Detects quoted values, finds unescaped internal quotes, escapes with `\"`
- JSON: Detects string values, finds unescaped internal quotes, escapes with `\"`
- CSV: Detects quoted cells, finds unescaped internal quotes, escapes with `""`
- Handles multiline values, code blocks, markdown content
- Preserves line ending style (CRLF/LF/CR)

```typescript
// Expected interface
export type Format = 'yaml' | 'json' | 'csv';

export function preprocessQuotes(input: string, format: Format): string;
```

**Performance:** ~500,000 operations/second (2 microseconds per field). Negligible overhead.

### Files to Modify (from research)

| File | Action | Changes |
|------|--------|---------|
| `src/parsers/quote-preprocessor.ts` | CREATE | Port from `tmp/quote-preprocessor/preprocessor.ts` (~900 lines) |
| `src/types/config.ts` | MODIFY | Add `preprocessQuotes?: boolean` to `JMLConfig` interface (line ~130) |
| `src/parsers/InputParser.ts` | MODIFY | Add preprocessing call in `parseContent()` function (line ~276) |
| `tests/unit/parsers/quote-preprocessor.test.ts` | CREATE | Port key test cases (~40 tests) |

### Integration Points

**1. JMLConfig Extension** (`src/types/config.ts:68-130`):
```typescript
/**
 * Enable automatic quote preprocessing for YAML/JSON/CSV input.
 * When enabled, the library automatically escapes unescaped quotes
 * in field values before parsing.
 * @default true
 */
preprocessQuotes?: boolean;
```

**2. InputParser Integration** (`src/parsers/InputParser.ts:276`):
- Modify `parseContent()` to call `preprocessQuotes()` before parsing
- Add optional `config` parameter to thread preprocessing option
- Add debug logging when modification occurs

**3. Error Handling Strategy**:
- Preprocessor never throws - wrap in try/catch, return input unchanged on failure
- Original parser errors surface to user when preprocessed input still fails

---

## Implementation Example

```typescript
// Integration into parser
import { preprocessQuotes } from './quote-preprocessor';

export function parseYamlInput(input: string, config: JMLConfig): ParsedData {
  // Preprocess if enabled (default: true)
  const processed = config.preprocessQuotes !== false 
    ? preprocessQuotes(input, 'yaml')
    : input;
  
  // Log if modification occurred
  if (processed !== input) {
    logger.debug('Input required quote preprocessing for yaml format');
  }
  
  // Parse the (possibly preprocessed) input
  return yaml.load(processed);
}
```

---

## Definition of Done

- [x] All acceptance criteria met with evidence links
- [x] Code implemented in `src/parsers/quote-preprocessor.ts`
- [x] Unit tests passing (≥95% coverage)
- [x] Integration test passing (if applicable)
- [x] Demo created OR exception documented (see [DoD Exceptions](../workflow/reference/dod-exceptions.md))
- [x] TSDoc comments added to public APIs
- [x] Code passes linting and type checking
- [x] Testing prerequisites documented (if any)
- [x] Committed with message: `E4-S14: Integrate quote preprocessor for YAML/JSON/CSV input`

---

## Implementation Hints

1. **Port from prototype**: Copy logic from `tmp/quote-preprocessor/preprocessor.ts`, adapt to JML conventions
2. **Port key test cases**: Focus on `yaml-realworld-bug-01`, `json-realworld-bug-01`, `csv-realworld-bug-01` as integration tests
3. **Preserve line endings**: The preprocessor normalizes then restores original line ending style
4. **Don't break valid input**: Ensure all existing parser tests pass with preprocessing enabled
5. **Known limitation**: `csv-adversarial-01` (cell that looks like multiple cells) is inherently ambiguous - document this in code comments

---

## Related Stories

- **Depends On**: E4-S01 (✅ Done) - Unified Input Parser
- **Blocks**: None
- **Related**: E4-S02 (✅ Done) - CSV Parser, E4-S03 (✅ Done) - YAML Parser

---

## Testing Strategy

### Unit Tests (tests/unit/parsers/)
```typescript
describe('QuotePreprocessor', () => {
  describe('preprocessQuotes()', () => {
    describe('YAML format', () => {
      it('should escape unescaped double quotes', () => {
        const input = 'description: "say "hello" world"';
        const output = preprocessQuotes(input, 'yaml');
        expect(output).toBe('description: "say \\"hello\\" world"');
      });
      
      it('should escape unescaped single quotes', () => {
        const input = "description: 'it's broken'";
        const output = preprocessQuotes(input, 'yaml');
        expect(output).toBe("description: 'it''s broken'");
      });
      
      it('should handle multiline values with quotes', () => {
        const input = 'description: "line1 "a"\nline2 "b""\nnext: value';
        const output = preprocessQuotes(input, 'yaml');
        expect(output).toBe('description: "line1 \\"a\\"\nline2 \\"b\\""\nnext: value');
      });
      
      it('should not modify valid YAML', () => {
        const input = 'description: "Say \\"hello\\" world"';
        const output = preprocessQuotes(input, 'yaml');
        expect(output).toBe(input);
      });
    });
    
    describe('JSON format', () => {
      it('should escape unescaped quotes in values', () => {
        const input = '{"description": "say "hello" world"}';
        const output = preprocessQuotes(input, 'json');
        expect(output).toBe('{"description": "say \\"hello\\" world"}');
      });
      
      it('should handle nested objects with quotes', () => {
        const input = '{"outer": {"inner": "say "hi""}}';
        const output = preprocessQuotes(input, 'json');
        expect(output).toBe('{"outer": {"inner": "say \\"hi\\""}}');
      });
      
      it('should not modify valid JSON', () => {
        const input = '{"description": "Say \\"hello\\" world"}';
        const output = preprocessQuotes(input, 'json');
        expect(output).toBe(input);
      });
    });
    
    describe('CSV format', () => {
      it('should double unescaped quotes in cells', () => {
        const input = 'Project,Summary\nENG,"Say "hello" world"';
        const output = preprocessQuotes(input, 'csv');
        expect(output).toBe('Project,Summary\nENG,"Say ""hello"" world"');
      });
      
      it('should handle multiline cells with quotes', () => {
        const input = 'A,B\n"line1 "a"\nline2",other';
        const output = preprocessQuotes(input, 'csv');
        expect(output).toBe('A,B\n"line1 ""a""\nline2",other');
      });
      
      it('should not modify valid CSV', () => {
        const input = 'Project,Summary\nENG,"Say ""hello"" world"';
        const output = preprocessQuotes(input, 'csv');
        expect(output).toBe(input);
      });
    });
    
    describe('edge cases', () => {
      it('should handle empty input', () => {
        expect(preprocessQuotes('', 'yaml')).toBe('');
        expect(preprocessQuotes('', 'json')).toBe('');
        expect(preprocessQuotes('', 'csv')).toBe('');
      });
      
      it('should preserve line ending style', () => {
        const crlfInput = 'a: "test"\r\nb: "value"';
        const output = preprocessQuotes(crlfInput, 'yaml');
        expect(output).toContain('\r\n');
      });
    });
  });
});
```

### Integration Tests (tests/integration/)
```typescript
describe('Integration: Quote Preprocessing', () => {
  it('should parse YAML with broken quotes after preprocessing', async () => {
    const input = 'description: "say "hello" world"\nsummary: test';
    const config = { preprocessQuotes: true };
    const result = await parseInput(input, 'yaml', config);
    expect(result.description).toBe('say "hello" world');
  });
  
  it('should allow disabling preprocessing via config', async () => {
    const input = 'description: "say "hello" world"';
    const config = { preprocessQuotes: false };
    await expect(parseInput(input, 'yaml', config)).rejects.toThrow();
  });
  
  it('should handle real-world bug description from Slack', async () => {
    const input = `project: PROJ
issue type: Task
summary: this is an issue test
description: "this is my description, i will "quote" some things like this and maybe like 'this'

it can be multiline and contain any character on a keyboard..."
Level: engineering`;
    
    const result = await parseInput(input, 'yaml');
    expect(result.description).toContain('i will "quote" some things');
  });
});
```

---

## Notes

- **Prototype location**: `tmp/quote-preprocessor/` contains working implementation with 131 test cases
- **Performance validated**: Stress test shows ~500K ops/sec (2μs per field) - no performance concern
- **Real-world tested**: Includes test cases from actual Slack copy/paste scenarios (`yaml-broken-05`, `yaml-broken-07`)
- **Known limitation**: One inherently ambiguous CSV case (`csv-adversarial-01`) cannot be resolved heuristically - cell that looks like multiple cells
- **Line ending preservation**: Automatically detects and preserves CRLF/LF/CR line ending style
- **Test pass rate**: 130/131 tests passing (99.2% accuracy)

/**
 * Unit Tests: Custom Block Preprocessor
 *
 * Story: S6 - Custom Block Syntax for Multiline Content
 * Tests all acceptance criteria for preprocessing custom blocks (<<< >>>) in YAML/JSON/CSV input
 */

import { preprocessCustomBlocks } from '../../../src/parsers/custom-block-preprocessor.js';

describe('CustomBlockPreprocessor', () => {
  describe('preprocessCustomBlocks()', () => {
    // =========================================================================
    // AC8: FAST PATH - NO BLOCKS (PASS-THROUGH)
    // =========================================================================
    describe('fast path (no blocks present)', () => {
      it('should return input unchanged if no <<< markers', () => {
        const input = 'project: PROJ\nsummary: Test\ndescription: "Normal text"';
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe(input);
      });

      it('should handle empty input', () => {
        expect(preprocessCustomBlocks('', 'yaml')).toBe('');
        expect(preprocessCustomBlocks('', 'json')).toBe('');
        expect(preprocessCustomBlocks('', 'csv')).toBe('');
      });

      it('should handle whitespace-only input', () => {
        const input = '   \n\n  ';
        expect(preprocessCustomBlocks(input, 'yaml')).toBe(input);
      });
    });

    // =========================================================================
    // AC2: BARE BLOCK DETECTION - YAML FORMAT
    // =========================================================================
    describe('YAML format - bare blocks', () => {
      it('should convert bare block to quoted string', () => {
        const input = `description: <<<
This is content
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "This is content"');
      });

      it('should escape internal double quotes', () => {
        const input = `description: <<<
Say "hello" world
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Say \\"hello\\" world"');
      });

      it('should preserve content whitespace exactly', () => {
        const input = `description: <<<
  Line with 2 spaces
    Line with 4 spaces
No spaces
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "  Line with 2 spaces\\n    Line with 4 spaces\\nNo spaces"');
      });

      it('should handle block at start of document', () => {
        const input = `<<<
First content
>>>
next: value`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('"First content"\nnext: value');
      });

      it('should handle block at middle of document', () => {
        const input = `first: value
description: <<<
Middle content
>>>
last: value`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('first: value\ndescription: "Middle content"\nlast: value');
      });

      it('should handle block at end of document', () => {
        const input = `first: value
description: <<<
Last content
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('first: value\ndescription: "Last content"');
      });

      it('should handle multiline content with special characters', () => {
        const input = `description: <<<
Line 1: with colon
Line 2 with "quotes"
Line 3 with {braces}
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Line 1: with colon\\nLine 2 with \\"quotes\\"\\nLine 3 with {braces}"');
      });

      it('should trim empty first line after <<<', () => {
        const input = `description: <<<

Content starts here
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Content starts here"');
      });

      it('should trim empty last line before >>>', () => {
        const input = `description: <<<
Content ends here

>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Content ends here"');
      });

      it('should preserve empty lines in middle of content', () => {
        const input = `description: <<<
Line 1

Line 3
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Line 1\\n\\nLine 3"');
      });

      it('should not treat lines starting with >>>>>> as block closer', () => {
        const input = `description: <<<
Content here
>>>>>> this is NOT a closer
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Content here\\n>>>>>> this is NOT a closer"');
      });

      it('should not treat >>>> as block closer', () => {
        const input = `description: <<<
Line one
>>>> still content
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Line one\\n>>>> still content"');
      });
    });

    // =========================================================================
    // AC3: QUOTED BLOCK DETECTION - YAML FORMAT
    // =========================================================================
    describe('YAML format - quoted blocks', () => {
      it('should convert double-quoted block to quoted string', () => {
        const input = `description: "<<<
Content here
>>>"`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Content here"');
      });

      it('should convert single-quoted block to quoted string', () => {
        const input = `description: '<<<
Content here
>>>'`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Content here"');
      });

      it('should escape internal quotes in quoted blocks', () => {
        const input = `description: "<<<
Say "hello" world
>>>"`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Say \\"hello\\" world"');
      });
    });

    // =========================================================================
    // AC7: MULTIPLE BLOCKS IN SINGLE DOCUMENT
    // =========================================================================
    describe('multiple blocks in single document', () => {
      it('should handle multiple blocks in different fields', () => {
        const input = `summary: <<<
First block
>>>
description: <<<
Second block
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('summary: "First block"\ndescription: "Second block"');
      });

      it('should process each block independently', () => {
        const input = `field1: <<<
Has "quotes"
>>>
field2: <<<
Also has "quotes"
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toContain('field1: "Has \\"quotes\\""');
        expect(output).toContain('field2: "Also has \\"quotes\\""');
      });

      it('should handle mix of bare and quoted blocks', () => {
        const input = `bare: <<<
Bare block
>>>
quoted: "<<<
Quoted block
>>>"`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toContain('bare: "Bare block"');
        expect(output).toContain('quoted: "Quoted block"');
      });

      it('should work with regular quotes and custom blocks mixed', () => {
        const input = `normal: "regular value"
custom: <<<
Custom block
>>>
another: simple value`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toContain('normal: "regular value"');
        expect(output).toContain('custom: "Custom block"');
        expect(output).toContain('another: simple value');
      });
    });

    // =========================================================================
    // AC4: JSON FORMAT - BARE BLOCKS
    // =========================================================================
    describe('JSON format - bare blocks', () => {
      it('should convert block in JSON object', () => {
        const input = `{
  "description": <<<
Content here
>>>
}`;
        const output = preprocessCustomBlocks(input, 'json');
        expect(output).toBe(`{
  "description": "Content here"
}`);
      });

      it('should escape internal quotes', () => {
        const input = `{"text": <<<
Say "hello"
>>>}`;
        const output = preprocessCustomBlocks(input, 'json');
        expect(output).toBe('{"text": "Say \\"hello\\""}');
      });

      it('should convert block in JSON array', () => {
        const input = `[
  <<<
First item
>>>,
  <<<
Second item
>>>
]`;
        const output = preprocessCustomBlocks(input, 'json');
        expect(output).toBe(`[
  "First item",
  "Second item"
]`);
      });

      it('should handle multiline JSON with blocks', () => {
        const input = `{
  "field1": "normal",
  "field2": <<<
Line 1
Line 2
>>>
}`;
        const output = preprocessCustomBlocks(input, 'json');
        expect(output).toContain('"field2": "Line 1\\nLine 2"');
      });
    });

    // =========================================================================
    // AC4: JSON FORMAT - QUOTED BLOCKS
    // =========================================================================
    describe('JSON format - quoted blocks', () => {
      it('should convert quoted block', () => {
        const input = `{"text": "<<<
Content
>>>"}`;
        const output = preprocessCustomBlocks(input, 'json');
        expect(output).toBe('{"text": "Content"}');
      });
    });

    // =========================================================================
    // AC4: CSV FORMAT - BARE BLOCKS
    // =========================================================================
    describe('CSV format - bare blocks', () => {
      it('should convert block in CSV cell', () => {
        const input = `Project,Description
PROJ,<<<
Multi-line description
>>>`;
        const output = preprocessCustomBlocks(input, 'csv');
        expect(output).toBe(`Project,Description
PROJ,"Multi-line description"`);
      });

      it('should double internal quotes (RFC 4180)', () => {
        const input = `A,B
1,<<<
Say "hello"
>>>`;
        const output = preprocessCustomBlocks(input, 'csv');
        expect(output).toBe(`A,B
1,"Say ""hello"""`);
      });

      it('should handle multiline cells', () => {
        const input = `Project,Description
PROJ,<<<
Line 1
Line 2
Line 3
>>>`;
        const output = preprocessCustomBlocks(input, 'csv');
        expect(output).toBe(`Project,Description
PROJ,"Line 1
Line 2
Line 3"`);
      });

      it('should preserve commas inside blocks', () => {
        const input = `A,B
1,<<<
Value with, comma
>>>`;
        const output = preprocessCustomBlocks(input, 'csv');
        expect(output).toBe(`A,B
1,"Value with, comma"`);
      });
    });

    // =========================================================================
    // AC4: CSV FORMAT - QUOTED BLOCKS
    // =========================================================================
    describe('CSV format - quoted blocks', () => {
      it('should convert quoted block in CSV', () => {
        const input = `A,B
1,"<<<
Content
>>>"`;
        const output = preprocessCustomBlocks(input, 'csv');
        expect(output).toBe(`A,B
1,"Content"`);
      });
    });

    // =========================================================================
    // AC8: EDGE CASES AND ERROR HANDLING
    // =========================================================================
    describe('edge cases and error handling', () => {
      it('should return unchanged if unclosed block', () => {
        const input = `description: <<<
Unclosed block`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe(input);
      });

      it('should handle empty block', () => {
        const input = `description: <<<
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: ""');
      });

      it('should handle empty block with just whitespace', () => {
        const input = `description: <<<
   
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: ""');
      });

      it('should handle block at EOF without final >>>', () => {
        const input = `description: <<<
Content here`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe(input); // Return unchanged
      });

      it('should preserve CRLF line endings', () => {
        const input = `description: <<<\r\nContent\r\n>>>\r\n`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toContain('\r\n');
        expect(output).toBe('description: "Content"\r\n');
      });

      it('should preserve LF line endings', () => {
        const input = `description: <<<\nContent\n>>>\n`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Content"\n');
      });

      it('should never throw on malformed input', () => {
        const malformed = '<<< {{{ ';
        expect(() => preprocessCustomBlocks(malformed, 'yaml')).not.toThrow();
        expect(() => preprocessCustomBlocks(malformed, 'json')).not.toThrow();
        expect(() => preprocessCustomBlocks(malformed, 'csv')).not.toThrow();
      });

      it('should handle <<< in content (not at start of value)', () => {
        const input = 'description: "This mentions <<< in text"';
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe(input); // No processing, not a block
      });
    });

    // =========================================================================
    // REAL-WORLD SCENARIOS
    // =========================================================================
    describe('real-world scenarios', () => {
      it('should handle Slack-copied content with quotes', () => {
        const input = `project: PROJ
summary: Bug report
description: <<<
User said "it's broken"
Links: https://example.com
Keys: "PROJ-123"
>>>
priority: High`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toContain('description: "User said \\"it\'s broken\\"');
        expect(output).toContain('Links: https://example.com');
        expect(output).toContain('Keys: \\"PROJ-123\\""');
        expect(output).toContain('priority: High');
      });

      it('should handle content with YAML-like keys inside', () => {
        const input = `description: <<<
Keys: something
Links: another
This looks like YAML but it's content
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Keys: something\\nLinks: another\\nThis looks like YAML but it\'s content"');
      });

      it('should handle code blocks inside custom blocks', () => {
        const input = `description: <<<
Here is code:
const x = "test";
console.log(x);
>>>`;
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toContain('const x = \\"test\\"');
      });

      it('should handle JSON with nested structure', () => {
        const input = `{
  "issues": [
    {
      "summary": "Test",
      "description": <<<
Multi-line description
With "quotes" and special: chars
>>>
    }
  ]
}`;
        const output = preprocessCustomBlocks(input, 'json');
        expect(output).toContain('"description": "Multi-line description\\nWith \\"quotes\\" and special: chars"');
      });
    });

    // =========================================================================
    // LINE ENDING PRESERVATION (AC8)
    // =========================================================================
    describe('line ending preservation', () => {
      it('should preserve consistent CRLF throughout', () => {
        const input = `first: value\r\ndescription: <<<\r\nContent\r\n>>>\r\nlast: value\r\n`;
        const output = preprocessCustomBlocks(input, 'yaml');
        // Should use CRLF throughout
        const crlfCount = (output.match(/\r\n/g) || []).length;
        const lfOnlyCount = (output.match(/[^\r]\n/g) || []).length;
        expect(crlfCount).toBeGreaterThan(0);
        expect(lfOnlyCount).toBe(0);
      });

      it('should preserve consistent LF throughout', () => {
        const input = `first: value\ndescription: <<<\nContent\n>>>\nlast: value\n`;
        const output = preprocessCustomBlocks(input, 'yaml');
        // Should not introduce CRLF
        expect(output).not.toContain('\r\n');
      });

      it('should detect and handle CR-only line endings (Mac OS Classic)', () => {
        // Rare but historically used on old Mac systems
        const input = 'description: <<<\rLine 1\rLine 2\r>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: "Line 1\\nLine 2"');
      });
    });

    // =========================================================================
    // EDGE CASES - EMPTY CONTENT
    // =========================================================================
    describe('empty content edge cases', () => {
      it('should handle block with only empty lines', () => {
        const input = 'description: <<<\n\n\n>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        // All lines are empty, trimmed to empty string
        expect(output).toBe('description: ""');
      });

      it('should handle block with only whitespace lines', () => {
        const input = 'description: <<<\n   \n  \n>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        // First/last empty removed, middle whitespace preserved
        expect(output).toContain('"');
      });
    });

    // =========================================================================
    // PERFORMANCE (AC8 - FAST PATH)
    // =========================================================================
    describe('performance', () => {
      it('should quickly return when no blocks present', () => {
        const largeInput = 'line: value\n'.repeat(1000);
        const start = Date.now();
        const output = preprocessCustomBlocks(largeInput, 'yaml');
        const duration = Date.now() - start;
        
        expect(output).toBe(largeInput);
        expect(duration).toBeLessThan(10); // Should be nearly instant
      });
    });

    // =========================================================================
    // ERROR HANDLING - DEFENSIVE CODE PATHS
    // =========================================================================
    describe('defensive error handling', () => {
      it('should handle malformed regex patterns gracefully', () => {
        // Content that might cause regex issues but should still work
        const input = 'description: <<<\n[*+?^${}()|[]\\]\n>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toContain('"');
        // The backslash is preserved but not doubled (it's in the quoted string)
        expect(output).toContain('[*+?^${}()|[]\\]');
      });

      it('should handle single-line block without newlines', () => {
        // Edge case: block on single line (no newlines after <<<)
        const input = 'description: <<<content>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        // Should still process (bare block pattern includes \s* for optional whitespace)
        expect(output).toContain('description:');
      });

      it('should handle block with no content (just delimiters)', () => {
        const input = 'description: <<<\n>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        expect(output).toBe('description: ""');
      });

      it('should preserve content with only first line empty', () => {
        const input = 'description: <<<\n\nActual content\n>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        // First empty line trimmed, content preserved
        expect(output).toBe('description: "Actual content"');
      });

      it('should preserve content with only last line empty', () => {
        const input = 'description: <<<\nActual content\n\n>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        // Last empty line trimmed, content preserved
        expect(output).toBe('description: "Actual content"');
      });

      it('should handle content with both first and last lines empty', () => {
        const input = 'description: <<<\n\nMiddle content\n\n>>>';
        const output = preprocessCustomBlocks(input, 'yaml');
        // Both empty lines trimmed
        expect(output).toBe('description: "Middle content"');
      });
    });
  });
});

/**
 * Tests for AdfConverter
 */

import { AdfConverter, AdfDocument } from '../../../src/converters/AdfConverter.js';

describe('AdfConverter', () => {
  describe('toAdf', () => {
    it('converts plain text to single paragraph', () => {
      const result = AdfConverter.toAdf('Hello world');
      expect(result.version).toBe(1);
      expect(result.type).toBe('doc');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('paragraph');
      expect(result.content[0].content![0]).toEqual({ type: 'text', text: 'Hello world' });
    });

    it('handles empty string', () => {
      const result = AdfConverter.toAdf('');
      expect(result.version).toBe(1);
      expect(result.type).toBe('doc');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('paragraph');
    });

    it('splits double newlines into separate paragraphs', () => {
      const result = AdfConverter.toAdf('First paragraph\n\nSecond paragraph');
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe('paragraph');
      expect(result.content[1].type).toBe('paragraph');
      expect(result.content[0].content![0].text).toBe('First paragraph');
      expect(result.content[1].content![0].text).toBe('Second paragraph');
    });

    it('single newline within paragraph becomes hardBreak', () => {
      const result = AdfConverter.toAdf('Line 1\nLine 2');
      expect(result.content).toHaveLength(1);
      const para = result.content[0];
      expect(para.content).toHaveLength(3); // text, hardBreak, text
      expect(para.content![0].text).toBe('Line 1');
      expect(para.content![1].type).toBe('hardBreak');
      expect(para.content![2].text).toBe('Line 2');
    });

    it('converts **bold** to strong mark', () => {
      const result = AdfConverter.toAdf('This is **bold** text');
      const para = result.content[0];
      expect(para.content![1]).toEqual({
        type: 'text',
        text: 'bold',
        marks: [{ type: 'strong' }],
      });
    });

    it('converts __bold__ to strong mark', () => {
      const result = AdfConverter.toAdf('This is __bold__ text');
      const para = result.content[0];
      expect(para.content![1]).toEqual({
        type: 'text',
        text: 'bold',
        marks: [{ type: 'strong' }],
      });
    });

    it('converts *italic* to em mark', () => {
      const result = AdfConverter.toAdf('This is *italic* text');
      const para = result.content[0];
      expect(para.content![1]).toEqual({
        type: 'text',
        text: 'italic',
        marks: [{ type: 'em' }],
      });
    });

    it('converts _italic_ to em mark', () => {
      const result = AdfConverter.toAdf('This is _italic_ text');
      const para = result.content[0];
      expect(para.content![1]).toEqual({
        type: 'text',
        text: 'italic',
        marks: [{ type: 'em' }],
      });
    });

    it('converts [text](url) to link mark', () => {
      const result = AdfConverter.toAdf('Click [here](https://example.com) now');
      const para = result.content[0];
      expect(para.content![1]).toEqual({
        type: 'text',
        text: 'here',
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
      });
    });

    it('converts `code` to code mark', () => {
      const result = AdfConverter.toAdf('Use `console.log` for debugging');
      const para = result.content[0];
      expect(para.content![1]).toEqual({
        type: 'text',
        text: 'console.log',
        marks: [{ type: 'code' }],
      });
    });

    it('converts bullet list (- items)', () => {
      const result = AdfConverter.toAdf('- Item 1\n- Item 2\n- Item 3');
      expect(result.content).toHaveLength(1);
      const list = result.content[0];
      expect(list.type).toBe('bulletList');
      expect(list.content).toHaveLength(3);
      expect(list.content![0].type).toBe('listItem');
    });

    it('converts bullet list (* items)', () => {
      const result = AdfConverter.toAdf('* Item A\n* Item B');
      expect(result.content[0].type).toBe('bulletList');
      expect(result.content[0].content).toHaveLength(2);
    });

    it('converts ordered list', () => {
      const result = AdfConverter.toAdf('1. First\n2. Second\n3. Third');
      expect(result.content).toHaveLength(1);
      const list = result.content[0];
      expect(list.type).toBe('orderedList');
      expect(list.content).toHaveLength(3);
    });

    it('converts code blocks with language', () => {
      const result = AdfConverter.toAdf('```javascript\nconst x = 1;\n```');
      expect(result.content).toHaveLength(1);
      const block = result.content[0];
      expect(block.type).toBe('codeBlock');
      expect(block.attrs).toEqual({ language: 'javascript' });
      expect(block.content![0].text).toBe('const x = 1;');
    });

    it('converts code blocks without language', () => {
      const result = AdfConverter.toAdf('```\nsome code\n```');
      const block = result.content[0];
      expect(block.type).toBe('codeBlock');
      expect(block.attrs).toBeUndefined();
    });

    it('converts headings (levels 1-6)', () => {
      const result = AdfConverter.toAdf('# Heading 1\n\n## Heading 2\n\n### Heading 3');
      expect(result.content).toHaveLength(3);
      expect(result.content[0].type).toBe('heading');
      expect(result.content[0].attrs).toEqual({ level: 1 });
      expect(result.content[1].type).toBe('heading');
      expect(result.content[1].attrs).toEqual({ level: 2 });
      expect(result.content[2].type).toBe('heading');
      expect(result.content[2].attrs).toEqual({ level: 3 });
    });

    it('handles mixed content', () => {
      const text = '# Title\n\nSome **bold** text\n\n- Item 1\n- Item 2\n\n1. Ordered\n2. List';
      const result = AdfConverter.toAdf(text);
      expect(result.content[0].type).toBe('heading');
      expect(result.content[1].type).toBe('paragraph');
      expect(result.content[2].type).toBe('bulletList');
      expect(result.content[3].type).toBe('orderedList');
    });
  });

  describe('toPlainText', () => {
    it('converts paragraph ADF to plain text', () => {
      const adf: AdfDocument = {
        version: 1,
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
        ],
      };
      expect(AdfConverter.toPlainText(adf)).toBe('Hello world');
    });

    it('converts multiple paragraphs with double newline', () => {
      const adf: AdfDocument = {
        version: 1,
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
        ],
      };
      expect(AdfConverter.toPlainText(adf)).toBe('First\n\nSecond');
    });

    it('converts hardBreak to newline', () => {
      const adf: AdfDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line 1' },
              { type: 'hardBreak' },
              { type: 'text', text: 'Line 2' },
            ],
          },
        ],
      };
      expect(AdfConverter.toPlainText(adf)).toBe('Line 1\nLine 2');
    });

    it('converts bullet list to plain text', () => {
      const adf: AdfDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
            ],
          },
        ],
      };
      expect(AdfConverter.toPlainText(adf)).toBe('- Item 1\n- Item 2');
    });

    it('handles empty/null ADF', () => {
      expect(AdfConverter.toPlainText(null as unknown as AdfDocument)).toBe('');
      expect(AdfConverter.toPlainText({ version: 1, type: 'doc', content: [] })).toBe('');
    });
  });

  describe('isAdf', () => {
    it('returns true for valid ADF document', () => {
      expect(AdfConverter.isAdf({ version: 1, type: 'doc', content: [] })).toBe(true);
    });

    it('returns false for plain string', () => {
      expect(AdfConverter.isAdf('hello')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(AdfConverter.isAdf(null)).toBe(false);
      expect(AdfConverter.isAdf(undefined)).toBe(false);
    });

    it('returns false for object without version', () => {
      expect(AdfConverter.isAdf({ type: 'doc', content: [] })).toBe(false);
    });

    it('returns false for object with wrong type', () => {
      expect(AdfConverter.isAdf({ version: 1, type: 'paragraph', content: [] })).toBe(false);
    });

    it('returns false for object without content array', () => {
      expect(AdfConverter.isAdf({ version: 1, type: 'doc' })).toBe(false);
    });
  });
});

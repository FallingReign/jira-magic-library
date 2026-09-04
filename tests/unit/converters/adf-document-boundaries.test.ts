import { AdfConverter } from '../../../src/converters/AdfConverter.js';
import { CloudCreateAdapter } from '../../../src/operations/CloudCreateAdapter.js';

describe('ADF documents from Jira', () => {
  it.each(['text', 'paragraph', 'heading', 'bulletList', 'orderedList', 'codeBlock', 'listItem', 'extension'])('handles an empty %s node', type => {
    expect(AdfConverter.toPlainText({ version: 1, type: 'doc', content: [{ type }] })).toBe('');
  });
  it.each([null, {}])('handles absent document content %p', document => {
    expect(AdfConverter.toPlainText(document as any)).toBe('');
  });
  it.each(['heading', 'codeBlock', 'listItem', 'extension'])('extracts nested %s text', type => {
    expect(AdfConverter.toPlainText({ version: 1, type: 'doc', content: [{ type, content: [{ type: 'text', text: 'preserved' }] }] })).toBe('preserved');
  });
  it('extracts ordered and unordered list contents including empty items', () => {
    const item = { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }] };
    expect(AdfConverter.toPlainText({ version: 1, type: 'doc', content: [{ type: 'orderedList', content: [item, { type: 'listItem' }] }] })).toBe('1. Text\n2. ');
    expect(AdfConverter.toPlainText({ version: 1, type: 'doc', content: [{ type: 'bulletList', content: [item, { type: 'listItem' }] }] })).toBe('- Text\n- ');
  });
  it('preserves structured fields while adapting known Cloud fields', () => {
    const fields = { description: { type: 'other' }, environment: AdfConverter.toAdf('Text'), reporter: { name: 'legacy' }, assignee: {} };
    expect(new CloudCreateAdapter('cloud').adaptPayload({ fields })).toEqual({ fields });
    expect(new CloudCreateAdapter('server').adaptRichTextFields(fields)).toBe(fields);
  });
});

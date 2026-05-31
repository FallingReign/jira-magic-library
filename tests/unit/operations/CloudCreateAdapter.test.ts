/**
 * Tests for CloudCreateAdapter
 */

import { CloudCreateAdapter } from '../../../src/operations/CloudCreateAdapter.js';

describe('CloudCreateAdapter', () => {
  describe('Cloud deployment', () => {
    const adapter = new CloudCreateAdapter('cloud');

    it('converts description string to ADF', () => {
      const payload = {
        fields: {
          summary: 'Test issue',
          description: 'A plain text description',
          project: { key: 'TEST' },
          issuetype: { id: '10001', name: 'Bug' },
        },
      };

      const result = adapter.adaptPayload(payload);
      const fields = result.fields as Record<string, unknown>;
      expect(fields.description).toHaveProperty('version', 1);
      expect(fields.description).toHaveProperty('type', 'doc');
    });

    it('passes through description that is already ADF', () => {
      const adfDoc = { version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] };
      const payload = {
        fields: {
          summary: 'Test',
          description: adfDoc,
          project: { key: 'TEST' },
          issuetype: { id: '10001' },
        },
      };

      const result = adapter.adaptPayload(payload);
      const fields = result.fields as Record<string, unknown>;
      expect(fields.description).toEqual(adfDoc);
    });

    it('strips name from user fields, keeping accountId', () => {
      const payload = {
        fields: {
          summary: 'Test',
          assignee: { accountId: '12345', name: 'john.doe' },
          reporter: { accountId: '67890', name: 'jane.doe' },
          project: { key: 'TEST' },
          issuetype: { id: '10001' },
        },
      };

      const result = adapter.adaptPayload(payload);
      const fields = result.fields as Record<string, unknown>;
      expect(fields.assignee).toEqual({ accountId: '12345' });
      expect(fields.reporter).toEqual({ accountId: '67890' });
    });

    it('reduces issuetype to id-only for Cloud', () => {
      const payload = {
        fields: {
          summary: 'Test',
          project: { key: 'TEST' },
          issuetype: { id: '10001', name: 'Bug', description: 'A bug' },
        },
      };

      const result = adapter.adaptPayload(payload);
      const fields = result.fields as Record<string, unknown>;
      expect(fields.issuetype).toEqual({ id: '10001' });
    });

    it('converts environment field to ADF', () => {
      const payload = {
        fields: {
          summary: 'Test',
          environment: 'Production server',
          project: { key: 'TEST' },
          issuetype: { id: '10001' },
        },
      };

      const result = adapter.adaptPayload(payload);
      const fields = result.fields as Record<string, unknown>;
      expect(fields.environment).toHaveProperty('version', 1);
      expect(fields.environment).toHaveProperty('type', 'doc');
    });
  });

  describe('Server deployment', () => {
    const adapter = new CloudCreateAdapter('server');

    it('passes payload through unchanged', () => {
      const payload = {
        fields: {
          summary: 'Test',
          description: 'Plain text',
          assignee: { name: 'john.doe' },
          project: { key: 'TEST' },
          issuetype: { name: 'Bug' },
        },
      };

      const result = adapter.adaptPayload(payload);
      expect(result).toEqual(payload);
    });

    it('strips accountId from user fields on server', () => {
      const fields = {
        assignee: { name: 'john.doe', accountId: '12345' },
      };

      const result = adapter.adaptUserFields(fields);
      expect(result.assignee).toEqual({ name: 'john.doe' });
    });
  });

  describe('adaptRichTextFields', () => {
    it('returns fields unchanged for server deployment', () => {
      const adapter = new CloudCreateAdapter('server');
      const fields = { description: 'plain text' };
      expect(adapter.adaptRichTextFields(fields)).toEqual(fields);
    });

    it('converts string description to ADF for cloud', () => {
      const adapter = new CloudCreateAdapter('cloud');
      const fields = { description: 'Hello world', summary: 'keep this' };
      const result = adapter.adaptRichTextFields(fields);
      expect(result.summary).toBe('keep this');
      expect((result.description as Record<string, unknown>).version).toBe(1);
    });
  });

  describe('adaptUserFields', () => {
    it('keeps user field with name only for server (no-op)', () => {
      const adapter = new CloudCreateAdapter('server');
      const fields = { assignee: { name: 'john.doe' } };
      const result = adapter.adaptUserFields(fields);
      expect(result.assignee).toEqual({ name: 'john.doe' });
    });

    it('preserves non-user fields untouched', () => {
      const adapter = new CloudCreateAdapter('cloud');
      const fields = { summary: 'Test', priority: { name: 'High' } };
      const result = adapter.adaptUserFields(fields);
      expect(result.summary).toBe('Test');
      expect(result.priority).toEqual({ name: 'High' });
    });
  });
});

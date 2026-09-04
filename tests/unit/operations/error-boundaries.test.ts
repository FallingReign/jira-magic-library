import { ErrorNormalizer } from '../../../src/operations/ErrorNormalizer.js';
import { AttachmentUploader } from '../../../src/operations/AttachmentUploader.js';
import { AttachmentUploadError } from '../../../src/errors/AttachmentUploadError.js';
import { HierarchyError } from '../../../src/errors/HierarchyError.js';

const normalizer = new ErrorNormalizer('https://jira.test');
describe('actionable failure messages', () => {
  it.each([
    ['required', 'REQUIRED_FIELD'], ['permission', 'PERMISSION_DENIED'], ['forbidden', 'PERMISSION_DENIED'],
    ['not found', 'NOT_FOUND'], ['ambiguous', 'AMBIGUOUS'], ['server error', 'SERVER_ERROR'], ['internal', 'SERVER_ERROR'],
  ])('classifies global message %s', (message, code) => {
    expect(normalizer.normalizeSingle({ errorMessages: [message] }, 0)[0]).toMatchObject({ code, message });
  });
  it.each([
    ['invalid', 'INVALID_VALUE'], ['does not exist', 'INVALID_VALUE'], ['not allowed', 'INVALID_VALUE'],
    ['permission', 'PERMISSION_DENIED'], ['not authorized', 'PERMISSION_DENIED'], ['not found', 'NOT_FOUND'], ['unknown failure', 'INVALID_VALUE'],
  ])('classifies field message %s and provides a suggestion', (message, code) => {
    expect(normalizer.normalizeSingle({ errors: { customfield_1: message } }, 0)[0]).toMatchObject({ field: 'customfield_1', code, suggestion: expect.any(String) });
  });
  it('keeps status-only bulk failures visible', () => {
    expect(normalizer.normalizeBulk({ errors: [{ failedElementNumber: 0, status: 400 }] }, 1)).toMatchObject({ errors: [{ rowIndex: 0, code: 'SERVER_ERROR', message: 'Issue creation failed with status 400' }] });
  });
  it('extracts messages from a status error without an Error instance', () => {
    expect(normalizer.normalizeSingle({ status: 403, errorMessages: ['Forbidden', 'Role missing'] }, 0)[0].jiraMessage).toBe('Forbidden; Role missing');
    expect(normalizer.normalizeSingle({ status: 403 }, 0)[0].jiraMessage).toBeUndefined();
  });
  it('preserves error identity when no optional details are supplied', () => {
    expect(new AttachmentUploadError('TEST-1', 'Upload failed')).toBeInstanceOf(Error);
    expect(new HierarchyError('Invalid parent')).toBeInstanceOf(Error);
  });
  it.each([' ', 0, null, { data: 'text', filename: 'file.txt' }, { data: new Uint8Array(), filename: '' }, { data: new Uint8Array(), filename: 'file.txt', contentType: 1 }])('rejects invalid attachment %p before upload', async attachment => {
    const client = { postMultipart: jest.fn() };
    await expect(new AttachmentUploader(client as any).validate([attachment] as any)).rejects.toThrow();
    expect(client.postMultipart).not.toHaveBeenCalled();
  });
});

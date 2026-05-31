/**
 * Tests for ErrorNormalizer
 */

import { ErrorNormalizer, BulkApiResponse } from '../../../src/operations/ErrorNormalizer.js';

describe('ErrorNormalizer', () => {
  const normalizer = new ErrorNormalizer('https://jira.example.com');

  describe('normalizeSingle', () => {
    it('maps "is required" to REQUIRED_FIELD', () => {
      const error = {
        status: 400,
        errors: { summary: 'Summary is required' },
      };
      const result = normalizer.normalizeSingle(error, 0);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('REQUIRED_FIELD');
      expect(result[0].field).toBe('summary');
      expect(result[0].rowIndex).toBe(0);
    });

    it('maps "not valid" to INVALID_VALUE', () => {
      const error = {
        status: 400,
        errors: { priority: 'Value is not valid' },
      };
      const result = normalizer.normalizeSingle(error, 1);
      expect(result[0].code).toBe('INVALID_VALUE');
      expect(result[0].field).toBe('priority');
    });

    it('maps HTTP 403 to PERMISSION_DENIED', () => {
      const error = { status: 403, message: 'Forbidden' };
      const result = normalizer.normalizeSingle(error, 2);
      expect(result[0].code).toBe('PERMISSION_DENIED');
      expect(result[0].rowIndex).toBe(2);
    });

    it('maps HTTP 404 to NOT_FOUND', () => {
      const error = { status: 404, message: 'Not found' };
      const result = normalizer.normalizeSingle(error, 3);
      expect(result[0].code).toBe('NOT_FOUND');
    });

    it('maps HTTP 500 to SERVER_ERROR', () => {
      const error = { status: 500, message: 'Internal Server Error' };
      const result = normalizer.normalizeSingle(error, 4);
      expect(result[0].code).toBe('SERVER_ERROR');
    });

    it('handles Error instance', () => {
      const error = new Error('Something went wrong');
      const result = normalizer.normalizeSingle(error, 5);
      expect(result[0].rowIndex).toBe(5);
      expect(result[0].message).toContain('Something went wrong');
    });

    it('handles ambiguity errors', () => {
      const error = { message: 'Ambiguous match for user field', name: 'AmbiguityError' };
      const result = normalizer.normalizeSingle(error, 6);
      expect(result[0].code).toBe('AMBIGUOUS');
    });

    it('handles multiple field errors', () => {
      const error = {
        status: 400,
        errors: {
          summary: 'Summary is required',
          priority: 'Priority is not valid',
        },
      };
      const result = normalizer.normalizeSingle(error, 0);
      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('REQUIRED_FIELD');
      expect(result[1].code).toBe('INVALID_VALUE');
    });

    it('provides suggestion for REQUIRED_FIELD', () => {
      const error = { status: 400, errors: { summary: 'Field is required' } };
      const result = normalizer.normalizeSingle(error, 0);
      expect(result[0].suggestion).toContain('summary');
    });

    it('handles unknown error formats gracefully', () => {
      const result = normalizer.normalizeSingle('unexpected string error', 7);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('SERVER_ERROR');
    });
  });

  describe('normalizeBulk', () => {
    it('normalizes successful bulk response (Server format)', () => {
      const response: BulkApiResponse = {
        issues: [
          { id: '1001', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1001' },
          { id: '1002', key: 'TEST-2', self: 'https://jira.example.com/rest/api/2/issue/1002' },
        ],
        errors: [],
      };

      const result = normalizer.normalizeBulk(response, 2);
      expect(result.successes).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toEqual({ total: 2, created: 2, failed: 0 });
      expect(result.successes[0].issueKey).toBe('TEST-1');
      expect(result.successes[0].issueUrl).toBe('https://jira.example.com/browse/TEST-1');
    });

    it('normalizes partial failure response (Server format)', () => {
      const response: BulkApiResponse = {
        issues: [
          { id: '1001', key: 'TEST-1', self: 'https://jira.example.com/rest/api/2/issue/1001' },
        ],
        errors: [
          {
            status: 400,
            elementErrors: { errors: { summary: 'Summary is required' } },
            failedElementNumber: 1,
          },
        ],
      };

      const result = normalizer.normalizeBulk(response, 2);
      expect(result.successes).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rowIndex).toBe(1);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD');
      expect(result.summary).toEqual({ total: 2, created: 1, failed: 1 });
    });

    it('normalizes full failure response', () => {
      const response: BulkApiResponse = {
        issues: [],
        errors: [
          {
            status: 400,
            elementErrors: { errors: { summary: 'Summary is required' } },
            failedElementNumber: 0,
          },
          {
            status: 400,
            elementErrors: { errors: { priority: 'Value is not valid' } },
            failedElementNumber: 1,
          },
        ],
      };

      const result = normalizer.normalizeBulk(response, 2);
      expect(result.successes).toHaveLength(0);
      expect(result.errors).toHaveLength(2);
      expect(result.summary.created).toBe(0);
      expect(result.summary.failed).toBe(2);
    });

    it('handles Cloud per-issue error format', () => {
      const response: BulkApiResponse = {
        issues: [
          { key: 'TEST-1', id: '1001', self: '' },
          { key: undefined, errors: { summary: 'Required field' } } as unknown as BulkApiResponse['issues'] extends Array<infer T> ? T : never,
        ],
      };

      const result = normalizer.normalizeBulk(response, 2);
      expect(result.successes).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rowIndex).toBe(1);
    });

    it('handles errorMessages in bulk response', () => {
      const response: BulkApiResponse = {
        issues: [],
        errors: [
          {
            status: 403,
            elementErrors: { errorMessages: ['Permission denied for this project'], errors: {} },
            failedElementNumber: 0,
          },
        ],
      };

      const result = normalizer.normalizeBulk(response, 1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PERMISSION_DENIED');
    });

    it('handles empty response', () => {
      const response: BulkApiResponse = {};
      const result = normalizer.normalizeBulk(response, 3);
      expect(result.successes).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toEqual({ total: 3, created: 0, failed: 3 });
    });
  });
});

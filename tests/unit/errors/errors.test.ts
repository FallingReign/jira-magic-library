/**
 * Tests for JMLError base class and error hierarchy
 * Story: E1-S10
 */

import { JMLError } from '../../../src/errors/JMLError.js';
import { AuthenticationError } from '../../../src/errors/AuthenticationError.js';
import { NetworkError } from '../../../src/errors/NetworkError.js';
import { ConfigurationError } from '../../../src/errors/ConfigurationError.js';
import { CacheError } from '../../../src/errors/CacheError.js';
import { RateLimitError } from '../../../src/errors/RateLimitError.js';
import { NotFoundError } from '../../../src/errors/NotFoundError.js';
import { JiraServerError } from '../../../src/errors/JiraServerError.js';
import { ValidationError } from '../../../src/errors/ValidationError.js';
import { AmbiguityError } from '../../../src/errors/AmbiguityError.js';

describe('Error Hierarchy', () => {
  describe('JMLError (Base Class)', () => {
    it('should create error with code and message', () => {
      const error = new JMLError('Test error', 'TEST_ERROR');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(JMLError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('JMLError');
    });

    it('should include details when provided', () => {
      const details = { field: 'username', value: 'invalid' };
      const error = new JMLError('Test error', 'TEST_ERROR', details);
      
      expect(error.details).toEqual(details);
    });

    it('should include jiraResponse when provided', () => {
      const jiraResponse = { errorMessages: ['Server error'], errors: {} };
      const error = new JMLError('Test error', 'TEST_ERROR', {}, jiraResponse);
      
      expect(error.jiraResponse).toEqual(jiraResponse);
    });

    it('should capture stack trace', () => {
      const error = new JMLError('Test error', 'TEST_ERROR');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('JMLError');
    });
  });

  describe('AuthenticationError', () => {
    it('should create with correct code', () => {
      const error = new AuthenticationError('Invalid PAT');
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Invalid PAT');
      expect(error.name).toBe('AuthenticationError');
    });

    it('should include details when provided', () => {
      const error = new AuthenticationError('Invalid PAT', { status: 401 });
      
      expect(error.details).toEqual({ status: 401 });
    });

    it('should have actionable error message', () => {
      const error = new AuthenticationError(
        'Authentication failed: PAT is invalid or expired. Check JIRA_PAT in .env file.',
        { status: 401 }
      );
      
      expect(error.message).toContain('Authentication failed');
      expect(error.message).toContain('Check JIRA_PAT');
      expect(error.message).toContain('.env');
    });
  });

  describe('NetworkError', () => {
    it('should create with correct code', () => {
      const error = new NetworkError('Connection failed');
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.name).toBe('NetworkError');
    });

    it('should include context', () => {
      const error = new NetworkError('Connection failed', { url: 'https://jira.com', attempts: 3 });
      
      expect(error.details).toEqual({ url: 'https://jira.com', attempts: 3 });
    });

    it('should have actionable message for max retries', () => {
      const error = new NetworkError(
        'Max retries (3) exceeded for GET request. Check network connection and JIRA server availability.',
        { method: 'GET', attempts: 3 }
      );
      
      expect(error.message).toContain('Max retries');
      expect(error.message).toContain('Check network connection');
    });
  });

  describe('ConfigurationError', () => {
    it('should create with correct code', () => {
      const error = new ConfigurationError('Missing baseUrl');
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.name).toBe('ConfigurationError');
    });

    it('should include field details', () => {
      const error = new ConfigurationError('Missing baseUrl', { field: 'baseUrl' });
      
      expect(error.details).toEqual({ field: 'baseUrl' });
    });
  });

  describe('CacheError', () => {
    it('should create with correct code', () => {
      const error = new CacheError('Redis connection failed');
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('CACHE_ERROR');
      expect(error.name).toBe('CacheError');
    });
  });

  describe('RateLimitError', () => {
    it('should create with correct code', () => {
      const error = new RateLimitError('Rate limit exceeded');
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.name).toBe('RateLimitError');
    });

    it('should include retry information', () => {
      const error = new RateLimitError('Rate limit exceeded', { 
        status: 429, 
        retryAfter: 60 
      });
      
      expect(error.details).toMatchObject({ status: 429, retryAfter: 60 });
    });
  });

  describe('NotFoundError', () => {
    it('should create with correct code', () => {
      const error = new NotFoundError('Project not found');
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('NOT_FOUND_ERROR');
      expect(error.name).toBe('NotFoundError');
    });

    it('should have actionable message', () => {
      const error = new NotFoundError(
        'Resource not found: Project ENG does not exist. Check project key, issue type, or field names.',
        { status: 404 }
      );
      
      expect(error.message).toContain('Check project key');
    });
  });

  describe('JiraServerError', () => {
    it('should create with correct code', () => {
      const error = new JiraServerError('Internal server error');
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('JIRA_SERVER_ERROR');
      expect(error.name).toBe('JiraServerError');
    });

    it('should have actionable message', () => {
      const error = new JiraServerError(
        'JIRA server error (500): Internal server error. Try again later or contact JIRA administrator.',
        { status: 500 }
      );
      
      expect(error.message).toContain('Try again later');
      expect(error.message).toContain('contact JIRA administrator');
    });
  });

  describe('ValidationError', () => {
    it('should create with correct code', () => {
      const error = new ValidationError('Validation failed');
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should include field-level details', () => {
      const details = {
        fields: {
          priority: 'Priority is required',
          summary: 'Summary cannot be empty'
        }
      };
      const error = new ValidationError('Validation failed', details);
      
      expect(error.details).toEqual(details);
    });

    it('should preserve original JIRA response', () => {
      const jiraResponse = {
        errorMessages: ['Validation failed'],
        errors: {
          priority: 'Priority is required',
          summary: 'Summary cannot be empty'
        }
      };
      const error = new ValidationError(
        'Validation failed',
        { fields: jiraResponse.errors },
        jiraResponse
      );
      
      expect(error.jiraResponse).toEqual(jiraResponse);
    });

    it('should combine multiple error messages', () => {
      const error = new ValidationError(
        'priority: Priority is required; summary: Summary cannot be empty'
      );
      
      expect(error.message).toContain('priority:');
      expect(error.message).toContain('summary:');
    });
  });

  describe('AmbiguityError', () => {
    it('should create with correct code', () => {
      const error = new AmbiguityError(
        'Multiple components named "Backend" found',
        {
          field: 'Component',
          input: 'Backend',
          candidates: [
            { id: '10001', name: 'Backend' },
            { id: '10002', name: 'Backend' }
          ]
        }
      );
      
      expect(error).toBeInstanceOf(JMLError);
      expect(error.code).toBe('AMBIGUITY_ERROR');
      expect(error.name).toBe('AmbiguityError');
    });

    it('should include field name and candidates', () => {
      const candidates = [
        { id: '10001', name: 'Backend', description: 'Core backend' },
        { id: '10002', name: 'Backend', description: 'Legacy backend' }
      ];
      const error = new AmbiguityError(
        'Multiple components found',
        {
          field: 'Component',
          input: 'Backend',
          candidates
        }
      );
      
      expect(error.details).toMatchObject({
        field: 'Component',
        input: 'Backend',
        candidates
      });
    });

    it('should have descriptive message', () => {
      const error = new AmbiguityError(
        'Multiple components named "Backend" found in project ENG',
        {
          field: 'Component',
          input: 'Backend',
          candidates: [
            { id: '10001', name: 'Backend' },
            { id: '10002', name: 'Backend' }
          ]
        }
      );
      
      expect(error.message).toContain('Multiple components');
      expect(error.message).toContain('Backend');
    });
  });

  describe('Error Hierarchy', () => {
    it('should allow catching all library errors with JMLError', () => {
      const errors: JMLError[] = [
        new AuthenticationError('auth error'),
        new NetworkError('network error'),
        new ValidationError('validation error'),
        new AmbiguityError('ambiguity', { field: 'test', input: 'test', candidates: [] })
      ];
      
      errors.forEach(error => {
        expect(error).toBeInstanceOf(JMLError);
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
      });
    });

    it('should allow type narrowing based on error code', () => {
      const error: JMLError = new ValidationError('test');
      
      if (error.code === 'VALIDATION_ERROR') {
        expect(error).toBeInstanceOf(ValidationError);
      }
    });
  });

  describe('Error Best Practices', () => {
    it('should include what, why, and how in error messages', () => {
      // What: Authentication failed
      // Why: PAT is invalid or expired
      // How: Check JIRA_PAT in .env file
      const error = new AuthenticationError(
        'Authentication failed: PAT is invalid or expired. Check JIRA_PAT in .env file.'
      );
      
      expect(error.message).toMatch(/failed.*invalid.*Check/i);
    });

    it('should provide actionable suggestions', () => {
      const error = new NotFoundError(
        'Resource not found: Project ENG does not exist. Check project key, issue type, or field names.',
        { project: 'ENG' }
      );
      
      expect(error.message).toContain('Check');
      expect(error.details).toBeDefined();
    });
  });
});

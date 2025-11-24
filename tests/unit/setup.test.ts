/**
 * Tests for module exports and Jest configuration
 */

import * as indexModule from '../../src/index.js';
import * as errorsModule from '../../src/errors.js';

describe('Project Setup', () => {
  it('should have Jest configured correctly', () => {
    expect(true).toBe(true);
  });

  it('should have TypeScript compilation working', () => {
    // Import from src to verify build works
    expect(typeof indexModule).toBe('object');
  });

  describe('Main exports (src/index.ts)', () => {
    it('should export JML class', () => {
      expect(indexModule.JML).toBeDefined();
      expect(typeof indexModule.JML).toBe('function');
    });

    it('should export loadConfig function', () => {
      expect(indexModule.loadConfig).toBeDefined();
      expect(typeof indexModule.loadConfig).toBe('function');
    });

    it('should export all error types', () => {
      expect(indexModule.JMLError).toBeDefined();
      expect(indexModule.ValidationError).toBeDefined();
      expect(indexModule.AmbiguityError).toBeDefined();
      expect(indexModule.JIRAApiError).toBeDefined();
      expect(indexModule.ConnectionError).toBeDefined();
      expect(indexModule.AuthenticationError).toBeDefined();
      expect(indexModule.SchemaError).toBeDefined();
      expect(indexModule.CacheError).toBeDefined();
      expect(indexModule.ConversionError).toBeDefined();
    });
  });

  describe('Error exports (src/errors/index.ts)', () => {
    it('should export all error classes with correct aliases', () => {
      // Direct exports
      expect(errorsModule.JMLError).toBeDefined();
      expect(errorsModule.ConfigurationError).toBeDefined();
      expect(errorsModule.ValidationError).toBeDefined();
      expect(errorsModule.AmbiguityError).toBeDefined();
      expect(errorsModule.NotFoundError).toBeDefined();
      expect(errorsModule.AuthenticationError).toBeDefined();
      expect(errorsModule.RateLimitError).toBeDefined();
      expect(errorsModule.CacheError).toBeDefined();
      
      // Aliased exports
      expect(errorsModule.JIRAApiError).toBeDefined();
      expect(errorsModule.ConnectionError).toBeDefined();
      expect(errorsModule.ConversionError).toBeDefined();
      expect(errorsModule.SchemaError).toBeDefined();
    });

    it('should create error instances correctly', () => {
      const error1 = new errorsModule.ConfigurationError('test');
      const error2 = new errorsModule.NotFoundError('test');
      const error3 = new errorsModule.RateLimitError('test');
      const error4 = new errorsModule.JIRAApiError('test');
      const error5 = new errorsModule.ConnectionError('test');
      
      expect(error1).toBeInstanceOf(Error);
      expect(error2).toBeInstanceOf(Error);
      expect(error3).toBeInstanceOf(Error);
      expect(error4).toBeInstanceOf(Error);
      expect(error5).toBeInstanceOf(Error);
    });
  });
});

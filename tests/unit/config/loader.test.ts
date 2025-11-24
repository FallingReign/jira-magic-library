/**
 * Unit tests for configuration loader
 */

import { loadConfig } from '../../../src/config/loader.js';
import { ConfigurationError } from '../../../src/errors/ConfigurationError.js';

describe('Configuration Loader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadConfig()', () => {
    it('should load config from environment variables', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token-123';
      process.env.REDIS_HOST = 'redis.example.com';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'secret';
      process.env.CACHE_TTL_SECONDS = '1800';

      const config = loadConfig();

      expect(config.baseUrl).toBe('https://jira.example.com');
      expect(config.auth.token).toBe('test-token-123');
      expect(config.redis.host).toBe('redis.example.com');
      expect(config.redis.port).toBe(6380);
      expect(config.redis.password).toBe('secret');
      expect(config.cache?.ttlSeconds).toBe(1800);
    });

    it('should apply default values for optional fields', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token-123';

      const config = loadConfig();

      expect(config.apiVersion).toBe('v2');
      expect(config.redis.host).toBe('localhost');
      expect(config.redis.port).toBe(6379);
      expect(config.redis.password).toBeUndefined();
      expect(config.cache?.ttlSeconds).toBe(900);
    });

    it('should accept v3 API version', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token-123';
      process.env.JIRA_API_VERSION = 'v3';

      const config = loadConfig();

      expect(config.apiVersion).toBe('v3');
    });

    it('should throw ConfigurationError if baseUrl is missing', () => {
      process.env.JIRA_PAT = 'test-token-123';
      delete process.env.JIRA_BASE_URL;

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/baseUrl is required/i);
    });

    it('should throw ConfigurationError if PAT is missing', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      delete process.env.JIRA_PAT;

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/auth\.token is required/i);
    });

    it('should throw ConfigurationError if baseUrl is not HTTP/HTTPS', () => {
      process.env.JIRA_BASE_URL = 'ftp://jira.example.com';
      process.env.JIRA_PAT = 'test-token-123';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/baseUrl must start with/i);
    });

    it('should throw ConfigurationError if baseUrl is invalid URL', () => {
      process.env.JIRA_BASE_URL = 'not-a-valid-url';
      process.env.JIRA_PAT = 'test-token-123';

      expect(() => loadConfig()).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError if redis.port is not a number', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token-123';
      process.env.REDIS_PORT = 'not-a-number';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/redis\.port must be a valid number/i);
    });

    it('should throw ConfigurationError if redis.port is out of range', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token-123';
      process.env.REDIS_PORT = '70000';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/redis\.port must be between 1 and 65535/i);
    });

    it('should throw ConfigurationError if redis.port is zero', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token-123';
      process.env.REDIS_PORT = '0';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/redis\.port must be between 1 and 65535/i);
    });

    it('should include field name in error message', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      delete process.env.JIRA_PAT;

      try {
        loadConfig();
        fail('Should have thrown ConfigurationError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ConfigurationError);
        const configError = error as ConfigurationError;
        expect(configError.message).toContain('auth.token');
        expect(configError.details).toBeDefined();
        expect(configError.details?.field).toBe('auth.token');
      }
    });

    it('should trim whitespace from string values', () => {
      process.env.JIRA_BASE_URL = '  https://jira.example.com  ';
      process.env.JIRA_PAT = '  test-token-123  ';
      process.env.REDIS_HOST = '  localhost  ';

      const config = loadConfig();

      expect(config.baseUrl).toBe('https://jira.example.com');
      expect(config.auth.token).toBe('test-token-123');
      expect(config.redis.host).toBe('localhost');
    });

    it('should handle empty string as missing value', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = '   '; // Just whitespace

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/auth\.token is required/i);
    });

    it('should handle redis password when explicitly set to empty string', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.REDIS_PASSWORD = '';

      const config = loadConfig();
      
      // Empty string after trim becomes undefined
      expect(config.redis.password).toBeUndefined();
    });

    it('should handle invalid cache TTL gracefully', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.CACHE_TTL_SECONDS = 'not-a-number';

      const config = loadConfig();
      
      // NaN from parseInt gets stored as-is (no validation on cacheTtl)
      expect(config.cache?.ttlSeconds).toBeNaN();
    });

    it('should handle baseUrl that starts with http:// (not https)', () => {
      process.env.JIRA_BASE_URL = 'http://jira.internal.com';
      process.env.JIRA_PAT = 'test-token';

      const config = loadConfig();
      
      expect(config.baseUrl).toBe('http://jira.internal.com');
    });

    it('should handle redis port at maximum valid value', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.REDIS_PORT = '65535';

      const config = loadConfig();
      
      expect(config.redis.port).toBe(65535);
    });

    it('should throw ConfigurationError if redis.port is above maximum', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.REDIS_PORT = '65536';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/redis\.port must be between 1 and 65535/i);
    });

    it('should handle v3 API version explicitly', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.JIRA_API_VERSION = 'v3';

      const config = loadConfig();
      
      expect(config.apiVersion).toBe('v3');
    });

    it('should trim all string environment variables', () => {
      process.env.JIRA_BASE_URL = '  https://jira.example.com  ';
      process.env.JIRA_PAT = '  test-token  ';
      process.env.REDIS_HOST = '  redis.example.com  ';
      process.env.REDIS_PASSWORD = '  secret-pass  ';

      const config = loadConfig();
      
      expect(config.baseUrl).toBe('https://jira.example.com');
      expect(config.auth.token).toBe('test-token');
      expect(config.redis.host).toBe('redis.example.com');
      expect(config.redis.password).toBe('secret-pass');
    });

    it('should handle CACHE_TTL_SECONDS with whitespace', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.CACHE_TTL_SECONDS = '  1800  ';

      const config = loadConfig();
      
      expect(config.cache?.ttlSeconds).toBe(1800);
    });

    it('should handle REDIS_PORT with whitespace', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.REDIS_PORT = '  6380  ';

      const config = loadConfig();
      
      expect(config.redis.port).toBe(6380);
    });

    it('should apply user ambiguity policy when environment variable set', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.JIRA_USER_AMBIGUITY_POLICY = 'score';

      const config = loadConfig();

      expect(config.ambiguityPolicy?.user).toBe('score');
    });

    it('should throw ConfigurationError for invalid ambiguity policy', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      process.env.JIRA_USER_AMBIGUITY_POLICY = 'maybe';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/JIRA_USER_AMBIGUITY_POLICY/);
    });

    it('should throw ConfigurationError for malformed URL with correct protocol', () => {
      // URL constructor throws for malformed URLs even if they start with http://
      process.env.JIRA_BASE_URL = 'http://[invalid url structure]';
      process.env.JIRA_PAT = 'test-token';

      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow(/baseUrl is not a valid URL/i);
    });

    it('should accept various valid URL formats', () => {
      // Test with port
      process.env.JIRA_BASE_URL = 'https://jira.example.com:8080';
      process.env.JIRA_PAT = 'test-token';

      let config = loadConfig();
      expect(config.baseUrl).toBe('https://jira.example.com:8080');

      // Test with path
      process.env.JIRA_BASE_URL = 'https://company.atlassian.net/jira';
      config = loadConfig();
      expect(config.baseUrl).toBe('https://company.atlassian.net/jira');
    });

    it('should handle all environment variables set explicitly', () => {
      // Set every single environment variable explicitly
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'explicit-token';
      process.env.JIRA_API_VERSION = 'v2';
      process.env.REDIS_HOST = 'redis-explicit.example.com';
      process.env.REDIS_PORT = '7000';
      process.env.REDIS_PASSWORD = 'explicit-password';
      process.env.CACHE_TTL_SECONDS = '3600';

      const config = loadConfig();

      // All should use explicit values, not defaults
      expect(config.baseUrl).toBe('https://jira.example.com');
      expect(config.auth.token).toBe('explicit-token');
      expect(config.apiVersion).toBe('v2');
      expect(config.redis.host).toBe('redis-explicit.example.com');
      expect(config.redis.port).toBe(7000);
      expect(config.redis.password).toBe('explicit-password');
      expect(config.cache?.ttlSeconds).toBe(3600);
    });

    it('should handle undefined vs empty string for optional fields', () => {
      process.env.JIRA_BASE_URL = 'https://jira.example.com';
      process.env.JIRA_PAT = 'test-token';
      
      // Explicitly unset optional fields (not even empty string)
      delete process.env.JIRA_API_VERSION;
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;
      delete process.env.CACHE_TTL_SECONDS;

      const config = loadConfig();

      // Should get defaults
      expect(config.apiVersion).toBe('v2');
      expect(config.redis.host).toBe('localhost');
      expect(config.redis.port).toBe(6379);
      expect(config.redis.password).toBeUndefined();
      expect(config.cache?.ttlSeconds).toBe(900);
    });
  });
});

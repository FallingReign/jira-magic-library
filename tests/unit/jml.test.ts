/**
 * Unit tests for JML main class
 * Story: E1-S12 (completion validation), E1-S13
 * 
 * Tests the main entry point for the library.
 */

import { JML } from '../../src/jml.js';
import { JiraClientImpl } from '../../src/client/JiraClient.js';
import { RedisCache } from '../../src/cache/RedisCache.js';
import { ConnectionError } from '../../src/errors.js';

// Mock dependencies
jest.mock('../../src/client/JiraClient');
jest.mock('../../src/cache/RedisCache');
jest.mock('../../src/schema/SchemaDiscovery');
jest.mock('../../src/converters/FieldResolver');
jest.mock('../../src/converters/ConverterRegistry');
jest.mock('../../src/operations/IssueOperations');

describe('JML', () => {
  let mockClient: jest.Mocked<JiraClientImpl>;
  let mockCache: jest.Mocked<RedisCache>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock instances
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      request: jest.fn(),
    } as any;

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      disconnect: jest.fn(),
    } as any;

    // Mock constructors
    (JiraClientImpl as jest.MockedClass<typeof JiraClientImpl>).mockImplementation(() => mockClient);
    (RedisCache as jest.MockedClass<typeof RedisCache>).mockImplementation(() => mockCache);
  });

  describe('constructor', () => {
    it('should create JML instance with required config', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      const jml = new JML(config);

      expect(jml).toBeInstanceOf(JML);
      expect(jml.issues).toBeDefined();
      expect(JiraClientImpl).toHaveBeenCalledWith({
        baseUrl: config.baseUrl,
        auth: config.auth,
        redis: {
          host: 'localhost',
          port: 6379,
        },
      });
    });

    it('should use default Redis config if not provided', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      new JML(config);

      expect(RedisCache).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
      });
    });

    it('should use custom Redis config if provided', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
        redis: {
          host: 'redis.example.com',
          port: 6380,
        },
      };

      new JML(config);

      expect(RedisCache).toHaveBeenCalledWith({
        host: 'redis.example.com',
        port: 6380,
      });
    });

    it('should use partial Redis config with defaults', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
        redis: {
          host: 'redis.example.com',
        },
      };

      new JML(config);

      expect(RedisCache).toHaveBeenCalledWith({
        host: 'redis.example.com',
        port: 6379,
      });
    });

    it('should initialize all required components', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      const jml = new JML(config);

      // Verify all components initialized
      expect(JiraClientImpl).toHaveBeenCalled();
      expect(RedisCache).toHaveBeenCalled();
      expect(jml.issues).toBeDefined();
    });
  });

  describe('validateConnection', () => {
    it('should validate connection and return server info', async () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      const serverInfo = {
        version: '9.12.0',
        versionNumbers: [9, 12, 0],
        deploymentType: 'Server',
        buildNumber: 9120000,
        buildDate: '2024-01-01',
        serverTime: '2024-01-01T00:00:00.000Z',
        scmInfo: 'abc123',
        serverTitle: 'JIRA',
      };

      mockClient.get.mockResolvedValue(serverInfo);

      const jml = new JML(config);
      const result = await jml.validateConnection();

      expect(result).toEqual(serverInfo);
      expect(mockClient.get).toHaveBeenCalledWith('/rest/api/2/serverInfo');
    });

    it('should throw ConnectionError on network failure', async () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      const networkError = new Error('ECONNREFUSED');
      mockClient.get.mockRejectedValue(networkError);

      const jml = new JML(config);

      await expect(jml.validateConnection()).rejects.toThrow(ConnectionError);
      await expect(jml.validateConnection()).rejects.toThrow('Failed to connect to JIRA');
    });

    it('should include original error details in ConnectionError', async () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      const originalError = new Error('Connection timeout');
      mockClient.get.mockRejectedValue(originalError);

      const jml = new JML(config);

      try {
        await jml.validateConnection();
        fail('Should have thrown ConnectionError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConnectionError);
        expect(error.details).toBeDefined();
        expect(error.details.originalError).toBe(originalError);
      }
    });

    it('should handle authentication errors', async () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'invalid-token' },
        apiVersion: 'v2',
      };

      const authError = new Error('401 Unauthorized');
      mockClient.get.mockRejectedValue(authError);

      const jml = new JML(config);

      await expect(jml.validateConnection()).rejects.toThrow(ConnectionError);
      await expect(jml.validateConnection()).rejects.toThrow('401 Unauthorized');
    });

    it('should handle non-Error objects in catch block', async () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      // Throw a non-Error object (string) to test the String(error) branch
      mockClient.get.mockRejectedValue('Connection failed with non-error object');

      const jml = new JML(config);

      await expect(jml.validateConnection()).rejects.toThrow(ConnectionError);
      await expect(jml.validateConnection()).rejects.toThrow('Connection failed with non-error object');
    });
  });

  describe('disconnect', () => {
    it('should disconnect Redis cache', async () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      mockCache.disconnect.mockResolvedValue();

      const jml = new JML(config);
      await jml.disconnect();

      expect(mockCache.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle disconnect errors gracefully', async () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      const disconnectError = new Error('Redis already disconnected');
      mockCache.disconnect.mockRejectedValue(disconnectError);

      const jml = new JML(config);

      // Should propagate error (caller handles it)
      await expect(jml.disconnect()).rejects.toThrow('Redis already disconnected');
    });

    it('should be callable multiple times', async () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      mockCache.disconnect.mockResolvedValue();

      const jml = new JML(config);
      await jml.disconnect();
      await jml.disconnect();

      expect(mockCache.disconnect).toHaveBeenCalledTimes(2);
    });
  });

  describe('issues property', () => {
    it('should expose IssueOperations instance', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      const jml = new JML(config);

      expect(jml.issues).toBeDefined();
      expect(typeof jml.issues).toBe('object');
    });

    it('should be readonly (TypeScript compile-time check)', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
      };

      const jml = new JML(config);
      const originalIssues = jml.issues;

      // readonly is a TypeScript compile-time check
      // At runtime, the property can be reassigned, but TypeScript prevents it
      // This test just verifies the property exists and is accessible
      expect(jml.issues).toBe(originalIssues);
      expect(jml.issues).toBeDefined();
    });
  });

  describe('configuration edge cases', () => {
    it('should handle empty Redis config object', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
        redis: {},
      };

      new JML(config);

      expect(RedisCache).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
      });
    });

    it('should handle Redis port as number', () => {
      const config = {
        baseUrl: 'https://jira.example.com',
        auth: { token: 'test-token' },
        apiVersion: 'v2',
        redis: {
          port: 9000,
        },
      };

      new JML(config);

      expect(RedisCache).toHaveBeenCalledWith({
        host: 'localhost',
        port: 9000,
      });
    });

    it('should handle various baseUrl formats', () => {
      const configs = [
        'https://jira.example.com',
        'https://jira.example.com/',
        'http://localhost:8080',
        'https://subdomain.jira.example.com/context',
      ];

      configs.forEach((baseUrl) => {
        const config = {
          baseUrl,
          auth: { token: 'test-token' },
          apiVersion: 'v2',
        };

        const jml = new JML(config);
        expect(jml).toBeInstanceOf(JML);
      });
    });
  });
});

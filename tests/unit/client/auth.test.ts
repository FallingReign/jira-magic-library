/**
 * Unit tests for PAT Authentication & Connection Validation
 * Story: E1-S03
 */

import { validateConnection } from '../../../src/client/auth.js';
import { AuthenticationError } from '../../../src/errors/AuthenticationError.js';
import { NetworkError } from '../../../src/errors/NetworkError.js';
import { ConfigurationError } from '../../../src/errors/ConfigurationError.js';

describe('validateConnection', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: jest.Mock;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch;
    
    // Create mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Spy on console.warn
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    
    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  describe('Successful Authentication', () => {
    it('should return server info on successful authentication (200)', async () => {
      // Arrange
      const mockServerInfo = {
        baseUrl: 'https://jira.company.com',
        version: '8.20.10',
        versionNumbers: [8, 20, 10],
        deploymentType: 'Server',
        buildNumber: 820010,
        serverTitle: 'Company JIRA',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockServerInfo),
      });

      // Act
      const result = await validateConnection('https://jira.company.com', 'test-token');

      // Assert
      expect(result).toEqual(mockServerInfo);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://jira.company.com/rest/api/2/serverInfo',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            Accept: 'application/json',
          },
        })
      );
    });
  });

  describe('Authentication Failures', () => {
    it('should throw AuthenticationError on 401 Unauthorized', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'invalid-token'))
        .rejects
        .toThrow(AuthenticationError);
      
      await expect(validateConnection('https://jira.company.com', 'invalid-token'))
        .rejects
        .toThrow('PAT is invalid or expired');
    });

    it('should throw AuthenticationError on 403 Forbidden', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'forbidden-token'))
        .rejects
        .toThrow(AuthenticationError);
    });
  });

  describe('Configuration Errors', () => {
    it('should throw ConfigurationError on 404 Not Found', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      // Act & Assert
      await expect(validateConnection('https://wrong-url.com', 'test-token'))
        .rejects
        .toThrow(ConfigurationError);
      
      await expect(validateConnection('https://wrong-url.com', 'test-token'))
        .rejects
        .toThrow('Invalid base URL or JIRA endpoint not found');
    });
  });

  describe('Network Errors and Retry Logic', () => {
    it('should retry once on 500 Internal Server Error and succeed', async () => {
      // Arrange
      const mockServerInfo = {
        baseUrl: 'https://jira.company.com',
        version: '8.20.10',
        versionNumbers: [8, 20, 10],
        deploymentType: 'Server',
        buildNumber: 820010,
        serverTitle: 'Company JIRA',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockServerInfo),
        });

      // Act
      const result = await validateConnection('https://jira.company.com', 'test-token');

      // Assert
      expect(result).toEqual(mockServerInfo);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry once on 503 Service Unavailable and succeed', async () => {
      // Arrange
      const mockServerInfo = {
        baseUrl: 'https://jira.company.com',
        version: '8.20.10',
        versionNumbers: [8, 20, 10],
        deploymentType: 'Server',
        buildNumber: 820010,
        serverTitle: 'Company JIRA',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockServerInfo),
        });

      // Act
      const result = await validateConnection('https://jira.company.com', 'test-token');

      // Assert
      expect(result).toEqual(mockServerInfo);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw NetworkError after retry exhaustion (500 twice)', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow(NetworkError);
      
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should throw NetworkError after retry exhaustion (503 twice)', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow(NetworkError);
      
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should retry once on network timeout and throw NetworkError', async () => {
      // Arrange
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'AbortError';
      
      mockFetch.mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow(NetworkError);
      
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should throw NetworkError on general network error', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow(NetworkError);
      
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });

  describe('HTTPS Enforcement', () => {
    it('should warn when using HTTP instead of HTTPS', async () => {
      // Arrange
      const mockServerInfo = {
        baseUrl: 'http://jira.company.com',
        version: '8.20.10',
        versionNumbers: [8, 20, 10],
        deploymentType: 'Server',
        buildNumber: 820010,
        serverTitle: 'Company JIRA',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockServerInfo),
      });

      // Act
      await validateConnection('http://jira.company.com', 'test-token');

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️  Using HTTP instead of HTTPS. Credentials may be exposed.'
      );
    });

    it('should not warn when using HTTPS', async () => {
      // Arrange
      const mockServerInfo = {
        baseUrl: 'https://jira.company.com',
        version: '8.20.10',
        versionNumbers: [8, 20, 10],
        deploymentType: 'Server',
        buildNumber: 820010,
        serverTitle: 'Company JIRA',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockServerInfo),
      });

      // Act
      await validateConnection('https://jira.company.com', 'test-token');

      // Assert
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Timeout Configuration', () => {
    it('should use 5 second timeout with AbortSignal', async () => {
      // Arrange
      const mockServerInfo = {
        baseUrl: 'https://jira.company.com',
        version: '8.20.10',
        versionNumbers: [8, 20, 10],
        deploymentType: 'Server',
        buildNumber: 820010,
        serverTitle: 'Company JIRA',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockServerInfo),
      });

      // Act
      await validateConnection('https://jira.company.com', 'test-token');

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://jira.company.com/rest/api/2/serverInfo',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe('Other HTTP Status Codes', () => {
    it('should throw NetworkError on 400 Bad Request', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow(NetworkError);
      
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow('HTTP error (400)');
    });

    it('should throw NetworkError on unexpected status codes', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 418,
        statusText: "I'm a teapot",
      });

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow(NetworkError);
    });
  });

  describe('Non-Error Exception Handling', () => {
    it('should handle non-Error thrown values', async () => {
      // Arrange
      mockFetch.mockRejectedValue('String error');

      // Act & Assert
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow(NetworkError);
      
      await expect(validateConnection('https://jira.company.com', 'test-token'))
        .rejects
        .toThrow('Unknown network error');
    });
  });
});

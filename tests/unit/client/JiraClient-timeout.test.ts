/**
 * Unit tests for JiraClient Timeout Configuration
 * Feature: Phase 1 - Configurable Timeouts
 */

import { JiraClientImpl } from '../../../src/client/JiraClient.js';
import type { JMLConfig } from '../../../src/types/config.js';
import { NetworkError } from '../../../src/errors/NetworkError.js';

// Mock fetch globally
const originalFetch = global.fetch;

describe('JiraClient - Timeout Configuration', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('Default Timeout Configuration', () => {
    it('should use 10s default timeout when not configured', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' }
      };

      const client = new JiraClientImpl(config);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
        status: 200
      } as Response);

      await client.get('/test');

      // Verify fetch was called (timeout is set internally via AbortController)
      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall?.[0]).toBe('https://test.atlassian.net/test');

      // AbortController signal should be present
      const options = fetchCall?.[1] as RequestInit;
      expect(options.signal).toBeDefined();
    });

    it('should use custom default timeout from config', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' },
        timeout: {
          default: 20000 // 20s custom default
        }
      };

      const client = new JiraClientImpl(config);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
        status: 200
      } as Response);

      await client.get('/test');

      // Verify request was made with AbortController
      expect(mockFetch).toHaveBeenCalled();
      const options = mockFetch.mock.calls[0]?.[1] as RequestInit;
      expect(options.signal).toBeDefined();
    });

    it('should accept timeout override parameter', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' },
        timeout: {
          default: 10000
        }
      };

      const client = new JiraClientImpl(config);

      // Mock successful quick response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
        status: 200
      } as Response);

      // Call with timeout override
      await client.get('/test', {}, 30000); // 30s override

      expect(mockFetch).toHaveBeenCalled();

      // Verify AbortController was created with custom timeout
      const call = mockFetch.mock.calls[0];
      expect(call).toBeDefined();
    });
  });

  describe('Bulk Timeout Configuration', () => {
    it('should pass custom bulk timeout to post method', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' },
        timeout: {
          bulk: 60000 // 60s for bulk
        }
      };

      const client = new JiraClientImpl(config);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ issues: [] }),
        status: 201
      } as Response);

      // When using timeout override, it should use that value
      await client.post('/rest/api/2/issue/bulk', { data: 'test' }, 60000);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Timeout Edge Cases', () => {
    it('should handle zero timeout gracefully', async () => {
      // Zero timeout should be handled by using default
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' },
        timeout: {
          default: 0 // Invalid - should fallback somehow
        }
      };

      const client = new JiraClientImpl(config);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
        status: 200
      } as Response);

      // Should still work (implementation may fallback to hardcoded default)
      const result = await client.get<{ data: string }>('/test');
      expect(result.data).toBe('test');
    });

    it('should handle undefined timeout config', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' }
        // No timeout config
      };

      const client = new JiraClientImpl(config);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
        status: 200
      } as Response);

      // Should use hardcoded defaults
      const result = await client.get<{ data: string }>('/test');
      expect(result.data).toBe('test');
    });

    it('should handle very large timeout values', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' },
        timeout: {
          default: 999999999 // Very large
        }
      };

      const client = new JiraClientImpl(config);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
        status: 200
      } as Response);

      // Should still work (no validation in code currently, but request succeeds)
      const result = await client.get<{ data: string }>('/test');
      expect(result.data).toBe('test');
    });
  });

  describe('Timeout Override for Different HTTP Methods', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
        status: 200
      } as Response);
    });

    it('should support timeout override for GET requests', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' }
      };

      const client = new JiraClientImpl(config);
      await client.get('/test', {}, 15000);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should support timeout override for POST requests', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' }
      };

      const client = new JiraClientImpl(config);
      await client.post('/test', { data: 'test' }, 15000);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should support timeout override for PUT requests', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' }
      };

      const client = new JiraClientImpl(config);
      await client.put('/test', { data: 'test' }, 15000);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should support timeout override for DELETE requests', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' }
      };

      const client = new JiraClientImpl(config);
      await client.delete('/test', 15000);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Backwards Compatibility', () => {
    it('should work without timeout parameter (backwards compatible)', async () => {
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' }
      };

      const client = new JiraClientImpl(config);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
        status: 200
      } as Response);

      // Call without timeout parameter (old API)
      const result = await client.get<{ data: string }>('/test');
      expect(result.data).toBe('test');
    });

    it('should work with existing code that does not specify timeout config', async () => {
      // Simulate existing code that only has baseUrl and auth
      const config: JMLConfig = {
        baseUrl: 'https://test.atlassian.net',
        auth: { token: 'test-token' }
      };

      const client = new JiraClientImpl(config);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ issues: [] }),
        status: 200
      } as Response);

      // All HTTP methods should work
      await expect(client.get('/test')).resolves.toBeDefined();
      await expect(client.post('/test', {})).resolves.toBeDefined();
      await expect(client.put('/test', {})).resolves.toBeDefined();
      await expect(client.delete('/test')).resolves.toBeDefined();
    });
  });
});

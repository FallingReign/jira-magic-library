/**
 * Unit tests for AuthStrategy
 * Tests header generation for PAT, Basic, and OAuth2 authentication.
 */

import {
  PatAuthStrategy,
  BasicAuthStrategy,
  OAuth2AuthStrategy,
  OAuthTokenManager,
  createAuthStrategy,
  isLegacyAuth,
} from '../../../src/client/AuthStrategy.js';

// Mock global fetch for OAuth2 token refresh tests
global.fetch = jest.fn();

describe('AuthStrategy', () => {
  describe('PatAuthStrategy', () => {
    it('should generate Bearer header with token', async () => {
      const strategy = new PatAuthStrategy('my-pat-token');
      const headers = await strategy.getHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer my-pat-token' });
    });

    it('should return false on handleUnauthorized (cannot refresh)', async () => {
      const strategy = new PatAuthStrategy('my-pat-token');
      const result = await strategy.handleUnauthorized();
      expect(result).toBe(false);
    });
  });

  describe('BasicAuthStrategy', () => {
    it('should generate Basic header with base64-encoded email:apiToken', async () => {
      const strategy = new BasicAuthStrategy('user@example.com', 'api-token-123');
      const headers = await strategy.getHeaders();

      const expected = Buffer.from('user@example.com:api-token-123').toString('base64');
      expect(headers).toEqual({ Authorization: `Basic ${expected}` });
    });

    it('should return false on handleUnauthorized (cannot refresh)', async () => {
      const strategy = new BasicAuthStrategy('user@example.com', 'api-token-123');
      const result = await strategy.handleUnauthorized();
      expect(result).toBe(false);
    });

    it('should handle special characters in email and token', async () => {
      const strategy = new BasicAuthStrategy('user+tag@example.com', 'token/with=chars');
      const headers = await strategy.getHeaders();

      const expected = Buffer.from('user+tag@example.com:token/with=chars').toString('base64');
      expect(headers).toEqual({ Authorization: `Basic ${expected}` });
    });
  });

  describe('OAuth2AuthStrategy', () => {
    it('should generate Bearer header with access token', async () => {
      const strategy = new OAuth2AuthStrategy({
        type: 'oauth2',
        accessToken: 'oauth-access-token',
      });
      const headers = await strategy.getHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer oauth-access-token' });
    });

    it('should return false on handleUnauthorized when no refresh token', async () => {
      const strategy = new OAuth2AuthStrategy({
        type: 'oauth2',
        accessToken: 'oauth-access-token',
      });
      const result = await strategy.handleUnauthorized();
      expect(result).toBe(false);
    });

    it('should return false on handleUnauthorized when no clientId', async () => {
      const strategy = new OAuth2AuthStrategy({
        type: 'oauth2',
        accessToken: 'token',
        refreshToken: 'refresh',
        clientSecret: 'secret',
      });
      const result = await strategy.handleUnauthorized();
      expect(result).toBe(false);
    });

    it('should refresh token on handleUnauthorized when credentials complete', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        }),
      } as Response);

      const strategy = new OAuth2AuthStrategy({
        type: 'oauth2',
        accessToken: 'old-token',
        refreshToken: 'my-refresh',
        clientId: 'my-client-id',
        clientSecret: 'my-client-secret',
      });

      const result = await strategy.handleUnauthorized();
      expect(result).toBe(true);

      // Verify new token is used
      const headers = await strategy.getHeaders();
      expect(headers).toEqual({ Authorization: 'Bearer new-access-token' });

      // Verify correct endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.atlassian.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
    });

    it('should use custom tokenUrl when provided', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed',
        }),
      } as Response);

      const strategy = new OAuth2AuthStrategy({
        type: 'oauth2',
        accessToken: 'old',
        refreshToken: 'refresh',
        clientId: 'id',
        clientSecret: 'secret',
        tokenUrl: 'https://custom.auth.com/token',
      });

      await strategy.handleUnauthorized();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.auth.com/token',
        expect.anything()
      );
    });

    it('should throw AuthenticationError when refresh fails', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const strategy = new OAuth2AuthStrategy({
        type: 'oauth2',
        accessToken: 'token',
        refreshToken: 'refresh',
        clientId: 'id',
        clientSecret: 'secret',
      });

      await expect(strategy.handleUnauthorized()).rejects.toThrow(
        'OAuth2 token refresh failed'
      );
    });
  });

  describe('OAuthTokenManager', () => {
    it('should emit tokensRefreshed event on successful refresh', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        }),
      } as Response);

      const manager = new OAuthTokenManager({
        type: 'oauth2',
        accessToken: 'old',
        refreshToken: 'refresh',
        clientId: 'id',
        clientSecret: 'secret',
      });

      const listener = jest.fn();
      manager.on('tokensRefreshed', listener);

      await manager.refresh();

      expect(listener).toHaveBeenCalledWith({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
    });

    it('should deduplicate concurrent refresh calls', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed',
        }),
      } as Response);

      const manager = new OAuthTokenManager({
        type: 'oauth2',
        accessToken: 'old',
        refreshToken: 'refresh',
        clientId: 'id',
        clientSecret: 'secret',
      });

      // Call refresh concurrently
      const [result1, result2] = await Promise.all([
        manager.refresh(),
        manager.refresh(),
      ]);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // Only one fetch call should be made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('isLegacyAuth', () => {
    it('should return true for legacy format', () => {
      expect(isLegacyAuth({ token: 'test' })).toBe(true);
    });

    it('should return false for PAT auth', () => {
      expect(isLegacyAuth({ type: 'pat', token: 'test' })).toBe(false);
    });

    it('should return false for Basic auth', () => {
      expect(isLegacyAuth({ type: 'basic', email: 'user@example.com', apiToken: 'x' })).toBe(false);
    });

    it('should return false for OAuth2 auth', () => {
      expect(isLegacyAuth({ type: 'oauth2', accessToken: 'x' })).toBe(false);
    });
  });

  describe('createAuthStrategy', () => {
    it('should create PatAuthStrategy for legacy format', () => {
      const strategy = createAuthStrategy({ token: 'legacy-token' });
      expect(strategy).toBeInstanceOf(PatAuthStrategy);
    });

    it('should create PatAuthStrategy for PAT type', () => {
      const strategy = createAuthStrategy({ type: 'pat', token: 'pat-token' });
      expect(strategy).toBeInstanceOf(PatAuthStrategy);
    });

    it('should create BasicAuthStrategy for Basic type', () => {
      const strategy = createAuthStrategy({ type: 'basic', email: 'user@example.com', apiToken: 'x' });
      expect(strategy).toBeInstanceOf(BasicAuthStrategy);
    });

    it('should create OAuth2AuthStrategy for OAuth2 type', () => {
      const strategy = createAuthStrategy({ type: 'oauth2', accessToken: 'x' });
      expect(strategy).toBeInstanceOf(OAuth2AuthStrategy);
    });
  });
});

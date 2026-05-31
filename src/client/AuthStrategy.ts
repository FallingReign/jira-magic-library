/**
 * Authentication Strategy Pattern
 *
 * Generates correct Authorization headers based on auth type:
 * - PAT: Bearer {token}
 * - Basic: Basic {base64(email:apiToken)}
 * - OAuth2: Bearer {accessToken} with token refresh
 */

import { EventEmitter } from 'node:events';
import type { AuthConfig, LegacyAuthConfig, OAuth2AuthConfig } from '../types/config.js';
import { AuthenticationError } from '../errors/AuthenticationError.js';

/**
 * Auth headers required for JIRA API requests
 */
export interface AuthHeaders {
  Authorization: string;
}

/**
 * Interface for authentication strategies
 */
export interface AuthStrategy {
  /** Generate authorization headers for an HTTP request */
  getHeaders(): Promise<AuthHeaders>;

  /** Handle a 401 response - returns true if credentials were refreshed and request should retry */
  handleUnauthorized(): Promise<boolean>;
}

/**
 * PAT (Personal Access Token) authentication strategy.
 * Used for JIRA Server/Data Center.
 */
export class PatAuthStrategy implements AuthStrategy {
  constructor(private readonly token: string) {}

  async getHeaders(): Promise<AuthHeaders> {
    return { Authorization: `Bearer ${this.token}` };
  }

  async handleUnauthorized(): Promise<boolean> {
    // PAT cannot be refreshed
    return false;
  }
}

/**
 * Basic authentication strategy.
 * Used for JIRA Cloud with email + API token.
 */
export class BasicAuthStrategy implements AuthStrategy {
  private readonly encoded: string;

  constructor(email: string, apiToken: string) {
    this.encoded = Buffer.from(`${email}:${apiToken}`).toString('base64');
  }

  async getHeaders(): Promise<AuthHeaders> {
    return { Authorization: `Basic ${this.encoded}` };
  }

  async handleUnauthorized(): Promise<boolean> {
    // Basic auth cannot be refreshed
    return false;
  }
}

/**
 * Events emitted by OAuthTokenManager
 */
export interface OAuthTokenEvents {
  /** Emitted when tokens are refreshed. Consumers should persist the new tokens. */
  tokensRefreshed: (tokens: { accessToken: string; refreshToken?: string }) => void;
}

/**
 * Default Atlassian OAuth2 token endpoint
 */
const DEFAULT_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';

/**
 * OAuth2 token manager that handles token refresh.
 * Emits 'tokensRefreshed' events so consumers can persist updated tokens.
 */
export class OAuthTokenManager extends EventEmitter {
  private accessToken: string;
  private refreshToken: string | undefined;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly tokenUrl: string;
  private refreshInProgress: Promise<void> | null = null;

  constructor(config: OAuth2AuthConfig) {
    super();
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenUrl = config.tokenUrl ?? DEFAULT_TOKEN_URL;
  }

  /** Get the current access token */
  getAccessToken(): string {
    return this.accessToken;
  }

  /**
   * Refresh the OAuth2 access token using the refresh token.
   * Deduplicates concurrent refresh attempts.
   *
   * @returns true if refresh succeeded, false if not possible
   * @throws {AuthenticationError} if refresh fails
   */
  async refresh(): Promise<boolean> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      return false;
    }

    // Deduplicate concurrent refresh attempts
    if (this.refreshInProgress) {
      await this.refreshInProgress;
      return true;
    }

    this.refreshInProgress = this.doRefresh();
    try {
      await this.refreshInProgress;
      return true;
    } finally {
      this.refreshInProgress = null;
    }
  }

  private async doRefresh(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      refresh_token: this.refreshToken!,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new AuthenticationError(
        `OAuth2 token refresh failed (${response.status}): ${response.statusText}`,
        { status: response.status, url: this.tokenUrl }
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    this.accessToken = data.access_token;
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }

    this.emit('tokensRefreshed', {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
    });
  }
}

/**
 * OAuth2 authentication strategy.
 * Used for JIRA Cloud with OAuth 2.0 (3LO).
 */
export class OAuth2AuthStrategy implements AuthStrategy {
  readonly tokenManager: OAuthTokenManager;

  constructor(config: OAuth2AuthConfig) {
    this.tokenManager = new OAuthTokenManager(config);
  }

  async getHeaders(): Promise<AuthHeaders> {
    return { Authorization: `Bearer ${this.tokenManager.getAccessToken()}` };
  }

  async handleUnauthorized(): Promise<boolean> {
    return this.tokenManager.refresh();
  }
}

/**
 * Determine if an auth config is the legacy format (no 'type' discriminator)
 */
export function isLegacyAuth(auth: AuthConfig | LegacyAuthConfig): auth is LegacyAuthConfig {
  return !('type' in auth) && 'token' in auth;
}

/**
 * Create the appropriate AuthStrategy from a config's auth field.
 * Handles both new AuthConfig and legacy { token } format.
 */
export function createAuthStrategy(auth: AuthConfig | LegacyAuthConfig): AuthStrategy {
  // Legacy format: { token: 'x' } without 'type' discriminator
  if (!('type' in auth)) {
    return new PatAuthStrategy(auth.token);
  }

  // New format with 'type' discriminator
  switch (auth.type) {
    case 'pat':
      return new PatAuthStrategy(auth.token);
    case 'basic':
      return new BasicAuthStrategy(auth.email, auth.apiToken);
    case 'oauth2':
      return new OAuth2AuthStrategy(auth);
  }
}

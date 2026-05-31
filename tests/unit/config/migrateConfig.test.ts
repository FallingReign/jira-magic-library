/**
 * Unit tests for migrateConfig
 * Tests migration from legacy auth format to new format.
 */

import { migrateConfig, resetMigrationWarnings } from '../../../src/config/migrateConfig.js';
import type { JMLConfig } from '../../../src/types/config.js';

describe('migrateConfig', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    resetMigrationWarnings();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should migrate legacy auth format to PAT format', () => {
    const config: JMLConfig = {
      baseUrl: 'https://jira.example.com',
      auth: { token: 'my-token' },
    };

    const migrated = migrateConfig(config);

    expect(migrated.auth).toEqual({ type: 'pat', token: 'my-token' });
  });

  it('should emit deprecation warning for legacy format', () => {
    const config: JMLConfig = {
      baseUrl: 'https://jira.example.com',
      auth: { token: 'my-token' },
    };

    migrateConfig(config);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('DEPRECATION')
    );
  });

  it('should only emit warning once per process', () => {
    const config: JMLConfig = {
      baseUrl: 'https://jira.example.com',
      auth: { token: 'my-token' },
    };

    migrateConfig(config);
    migrateConfig(config);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it('should pass through PAT auth config unchanged', () => {
    const config: JMLConfig = {
      baseUrl: 'https://jira.example.com',
      auth: { type: 'pat', token: 'my-token' },
    };

    const migrated = migrateConfig(config);

    expect(migrated.auth).toEqual({ type: 'pat', token: 'my-token' });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should pass through Basic auth config unchanged', () => {
    const config: JMLConfig = {
      baseUrl: 'https://jira.example.com',
      auth: { type: 'basic', email: 'user@example.com', apiToken: 'token' },
    };

    const migrated = migrateConfig(config);

    expect(migrated.auth).toEqual({ type: 'basic', email: 'user@example.com', apiToken: 'token' });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should pass through OAuth2 auth config unchanged', () => {
    const config: JMLConfig = {
      baseUrl: 'https://jira.example.com',
      auth: {
        type: 'oauth2',
        accessToken: 'access',
        refreshToken: 'refresh',
        clientId: 'id',
        clientSecret: 'secret',
      },
    };

    const migrated = migrateConfig(config);

    expect(migrated.auth).toEqual({
      type: 'oauth2',
      accessToken: 'access',
      refreshToken: 'refresh',
      clientId: 'id',
      clientSecret: 'secret',
    });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should preserve other config fields during migration', () => {
    const config: JMLConfig = {
      baseUrl: 'https://jira.example.com',
      auth: { token: 'my-token' },
      deployment: 'cloud',
      apiVersion: 'v3',
      debug: true,
    };

    const migrated = migrateConfig(config);

    expect(migrated.baseUrl).toBe('https://jira.example.com');
    expect(migrated.deployment).toBe('cloud');
    expect(migrated.apiVersion).toBe('v3');
    expect(migrated.debug).toBe(true);
  });
});

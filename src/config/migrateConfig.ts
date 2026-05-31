/**
 * Configuration Migration Utility
 *
 * Migrates legacy config formats to the current format with deprecation warnings.
 * Ensures backward compatibility with old `auth: { token: 'x' }` format.
 */

import type { JMLConfig, AuthConfig, LegacyAuthConfig } from '../types/config.js';

/**
 * Whether the deprecation warning has been logged this process.
 * Only warn once to avoid spamming logs.
 */
let hasWarnedLegacyAuth = false;

/**
 * Reset warning state (for testing)
 */
export function resetMigrationWarnings(): void {
  hasWarnedLegacyAuth = false;
}

/**
 * Check if an auth config object is in legacy format (no 'type' discriminator).
 */
function isLegacyAuthFormat(auth: unknown): auth is LegacyAuthConfig {
  return (
    auth !== null &&
    typeof auth === 'object' &&
    'token' in auth &&
    !('type' in auth)
  );
}

/**
 * Migrate a configuration object from any supported format to the current JMLConfig.
 *
 * Handles:
 * - Legacy `auth: { token: 'x' }` → `auth: { type: 'pat', token: 'x' }` with deprecation warning
 * - Already-migrated configs pass through unchanged
 *
 * @param config - Configuration object (possibly in legacy format)
 * @returns Properly typed JMLConfig with migrated auth
 */
export function migrateConfig(config: JMLConfig): JMLConfig {
  const auth = config.auth as AuthConfig | LegacyAuthConfig;

  if (isLegacyAuthFormat(auth)) {
    if (!hasWarnedLegacyAuth) {
      console.warn(
        '[JML DEPRECATION] auth: { token: "..." } format is deprecated. ' +
        'Use auth: { type: "pat", token: "..." } instead. ' +
        'The legacy format will be removed in a future major version.'
      );
      hasWarnedLegacyAuth = true;
    }

    return {
      ...config,
      auth: { type: 'pat', token: auth.token },
    };
  }

  // Already in new format, return as-is
  return config;
}

/**
 * Configuration Loader
 *
 * Loads and validates configuration from environment variables.
 */

import * as dotenv from 'dotenv';
import { AmbiguityPolicy, JMLConfig } from '../types/config.js';
import { ConfigurationError } from '../errors/ConfigurationError.js';

// Load .env file
dotenv.config();

const USER_AMBIGUITY_POLICIES: AmbiguityPolicy[] = ['first', 'error', 'score'];

/**
 * Loads configuration from environment variables with validation.
 *
 * @returns Validated JML configuration object
 * @throws {ConfigurationError} if required configuration is missing or invalid
 *
 * @example
 * ```typescript
 * // Set environment variables first (or use .env file)
 * process.env.JIRA_BASE_URL = 'https://jira.company.com';
 * process.env.JIRA_PAT = 'your-token';
 *
 * const config = loadConfig();
 * console.log(config.baseUrl); // https://jira.company.com
 * ```
 */
export function loadConfig(): JMLConfig {
  // Read and trim environment variables
  const baseUrl = process.env.JIRA_BASE_URL?.trim();
  const token = process.env.JIRA_PAT?.trim();
  const apiVersion = (process.env.JIRA_API_VERSION?.trim() || 'v2') as 'v2' | 'v3';
  const redisHost = process.env.REDIS_HOST?.trim() || 'localhost';
  const redisPortStr = process.env.REDIS_PORT?.trim() || '6379';
  const redisPassword = process.env.REDIS_PASSWORD?.trim();
  const cacheTtlStr = process.env.CACHE_TTL_SECONDS?.trim() || '900';
  const userAmbiguityPolicy = process.env.JIRA_USER_AMBIGUITY_POLICY?.trim().toLowerCase();

  // Validate required fields
  if (!baseUrl) {
    throw new ConfigurationError('baseUrl is required', { field: 'baseUrl' });
  }

  if (!token) {
    throw new ConfigurationError('auth.token is required', { field: 'auth.token' });
  }

  // Validate baseUrl format
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    throw new ConfigurationError(
      'baseUrl must start with http:// or https://',
      { field: 'baseUrl', value: baseUrl }
    );
  }

  // Validate baseUrl is a valid URL
  try {
    new URL(baseUrl);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    throw new ConfigurationError(
      `baseUrl is not a valid URL: ${baseUrl}`,
      { field: 'baseUrl', value: baseUrl }
    );
  }

  // Parse and validate Redis port
  const redisPort = parseInt(redisPortStr, 10);
  if (isNaN(redisPort)) {
    throw new ConfigurationError(
      'redis.port must be a valid number',
      { field: 'redis.port', value: redisPortStr }
    );
  }

  if (redisPort < 1 || redisPort > 65535) {
    throw new ConfigurationError(
      'redis.port must be between 1 and 65535',
      { field: 'redis.port', value: redisPort }
    );
  }

  // Parse cache TTL
  const cacheTtl = parseInt(cacheTtlStr, 10);

  // Validate ambiguity policy if provided
  let parsedUserPolicy: AmbiguityPolicy | undefined;
  if (userAmbiguityPolicy) {
    if (!USER_AMBIGUITY_POLICIES.includes(userAmbiguityPolicy as AmbiguityPolicy)) {
      throw new ConfigurationError(
        'JIRA_USER_AMBIGUITY_POLICY must be one of: first, error, score',
        { field: 'ambiguityPolicy.user', value: userAmbiguityPolicy }
      );
    }
    parsedUserPolicy = userAmbiguityPolicy as AmbiguityPolicy;
  }

  // Build configuration object
  const config: JMLConfig = {
    baseUrl,
    auth: { token },
    apiVersion,
    redis: {
      host: redisHost,
      port: redisPort,
      password: redisPassword || undefined,
    },
    cache: {
      ttlSeconds: cacheTtl,
    },
  };

  if (parsedUserPolicy) {
    config.ambiguityPolicy = {
      user: parsedUserPolicy,
    };
  }

  return config;
}

/**
 * Helper to load configuration from .env file
 * Simplified wrapper for examples
 */

import * as dotenv from 'dotenv';
import { JMLConfig } from '../src';

dotenv.config();

export function getConfig(): JMLConfig {
  return {
    baseUrl: process.env.JIRA_BASE_URL!,
    auth: { token: process.env.JIRA_PAT! },
    apiVersion: 'v2',
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : undefined,
    },
  };
}

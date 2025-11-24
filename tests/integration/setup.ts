/**
 * Integration Test Setup
 * 
 * Loads test configuration from .env.test (preferred) or .env (fallback).
 * This ensures integration tests use the correct JIRA endpoint for testing.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Resolve paths relative to project root
const testEnvPath = path.resolve(__dirname, '../../.env.test');
const defaultEnvPath = path.resolve(__dirname, '../../.env');

// Load .env.test if it exists, otherwise fall back to .env
if (fs.existsSync(testEnvPath)) {
  console.log('📁 Loading test config from .env.test');
  dotenv.config({ path: testEnvPath });
} else if (fs.existsSync(defaultEnvPath)) {
  console.log('📁 Loading test config from .env (fallback)');
  dotenv.config({ path: defaultEnvPath });
} else {
  console.warn('⚠️  No .env or .env.test found - integration tests will be skipped');
}

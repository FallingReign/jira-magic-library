#!/usr/bin/env node
/**
 * Install Git Hooks Script
 * 
 * Installs the PII-detection pre-commit hook.
 * 
 * Run: npm run install:hooks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOOKS_DIR = path.join(__dirname, '..', '.git', 'hooks');
const SOURCE_HOOK = path.join(__dirname, 'pre-commit');
const TARGET_HOOK = path.join(HOOKS_DIR, 'pre-commit');

console.log('🔧 Installing Git hooks...\n');

// Check if .git exists
if (!fs.existsSync(HOOKS_DIR)) {
  console.error('❌ Error: .git/hooks directory not found');
  console.error('   Are you in a Git repository?');
  process.exit(1);
}

// Check if source hook exists
if (!fs.existsSync(SOURCE_HOOK)) {
  console.error('❌ Error: scripts/pre-commit not found');
  console.error('   Source hook is missing');
  process.exit(1);
}

// Backup existing hook if present
if (fs.existsSync(TARGET_HOOK)) {
  const backupPath = TARGET_HOOK + '.backup';
  console.log('⚠️  Existing pre-commit hook found');
  console.log(`   Backing up to: ${backupPath}`);
  fs.copyFileSync(TARGET_HOOK, backupPath);
}

// Copy hook
try {
  fs.copyFileSync(SOURCE_HOOK, TARGET_HOOK);
  
  // Make executable (Unix/Mac)
  if (process.platform !== 'win32') {
    fs.chmodSync(TARGET_HOOK, 0o755);
  }
  
  console.log('✅ Pre-commit hook installed successfully!\n');
  console.log('PII detection now runs before each commit and blocks commits that contain PII.\n');
  
} catch (err) {
  console.error('❌ Error installing hook:', err.message);
  process.exit(1);
}

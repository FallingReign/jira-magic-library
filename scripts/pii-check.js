#!/usr/bin/env node

/**
 * PII Detection Script for Pre-Commit Hook
 * 
 * Scans staged files for Personally Identifiable Information (PII) patterns
 * and custom blacklisted terms. Blocks commits if PII is detected.
 * 
 * Configuration:
 * - .pii-patterns.json: Default regex patterns (committed)
 * - .pii-config.json: User/project whitelist and blacklist (not committed)
 * 
 * Usage:
 *   node scripts/pii-check.js [--all]
 * 
 * Options:
 *   --all    Scan all tracked files (not just staged)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI colors
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m'; // No Color

// File paths
const PATTERNS_FILE = path.join(__dirname, '..', '.pii-patterns.json');
const CONFIG_FILE = path.join(__dirname, '..', '.pii-config.json');

/**
 * Load JSON config file with fallback
 */
function loadConfig(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`${YELLOW}⚠️  Warning: Could not parse ${path.basename(filePath)}: ${err.message}${NC}`);
  }
  return fallback;
}

/**
 * Get list of staged files (or all tracked files with --all)
 */
function getStagedFiles() {
  const scanAll = process.argv.includes('--all');
  
  try {
    const cmd = scanAll 
      ? 'git ls-files'
      : 'git diff --cached --name-only --diff-filter=ACM';
    
    const output = execSync(cmd, { encoding: 'utf8' });
    return output.trim().split('\n').filter(f => f.length > 0);
  } catch {
    return [];
  }
}

/**
 * Check if file is binary (skip binary files)
 */
function isBinaryFile(filePath) {
  const binaryExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.mp3', '.mp4', '.avi', '.mov', '.wav',
    '.db', '.sqlite', '.lock'
  ];
  
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
}

/**
 * Check if file should be ignored based on path patterns
 */
function shouldIgnoreFile(filePath, ignorePatterns) {
  // Always ignore the config files themselves
  const alwaysIgnore = [
    '.pii-config.json',
    '.pii-config.example.json',
    '.pii-patterns.json',
    'package-lock.json',
    'pii-check.js' // Don't scan ourselves
  ];
  
  const basename = path.basename(filePath);
  if (alwaysIgnore.includes(basename)) {
    return true;
  }
  
  // Check user-defined ignore patterns
  for (const pattern of ignorePatterns) {
    if (filePath.includes(pattern) || basename === pattern) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a match should be whitelisted (false positive)
 */
function isWhitelisted(match, whitelist) {
  const lowerMatch = match.toLowerCase();
  
  for (const term of whitelist) {
    if (lowerMatch.includes(term.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Scan a single file for PII patterns
 */
function scanFile(filePath, patterns, config) {
  const findings = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Check each pattern
    for (const [patternName, patternConfig] of Object.entries(patterns)) {
      // Skip metadata fields and disabled patterns
      if (patternName.startsWith('$')) continue;
      if (patternConfig.disabled) continue;
      
      lines.forEach((line, lineIndex) => {
        // Create fresh regex for each line to avoid lastIndex issues
        const regex = new RegExp(patternConfig.pattern, patternConfig.flags || 'gi');
        let match;
        
        while ((match = regex.exec(line)) !== null) {
          const matchedText = match[0];
          
          // Skip if whitelisted
          if (isWhitelisted(matchedText, config.whitelist || [])) {
            continue;
          }
          
          findings.push({
            file: filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            pattern: patternName,
            match: matchedText,
            context: line.trim().substring(0, 100)
          });
        }
      });
    }
    
    // Check custom blacklist terms
    for (const term of (config.blacklist || [])) {
      const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
      
      lines.forEach((line, lineIndex) => {
        let match;
        while ((match = regex.exec(line)) !== null) {
          findings.push({
            file: filePath,
            line: lineIndex + 1,
            column: match.index + 1,
            pattern: 'BLACKLIST',
            match: match[0],
            context: line.trim().substring(0, 100)
          });
        }
      });
    }
    
  } catch (err) {
    // Skip files that can't be read (binary, permissions, etc.)
    if (err.code !== 'ENOENT') {
      // Only warn for unexpected errors
      if (!err.message.includes('EISDIR')) {
        console.error(`${YELLOW}⚠️  Could not read ${filePath}: ${err.message}${NC}`);
      }
    }
  }
  
  return findings;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Main function
 */
function main() {
  console.log(`\n${BLUE}🔍 Running PII detection...${NC}\n`);
  
  // Load configurations
  const defaultPatterns = loadConfig(PATTERNS_FILE, {});
  const userConfig = loadConfig(CONFIG_FILE, { whitelist: [], blacklist: [], ignoreFiles: [] });
  
  if (Object.keys(defaultPatterns).length === 0) {
    console.error(`${RED}❌ Error: .pii-patterns.json not found or empty${NC}`);
    console.error(`   Run: npm run install:hooks to set up PII detection`);
    process.exit(1);
  }
  
  // Get files to scan
  const files = getStagedFiles();
  
  if (files.length === 0) {
    console.log(`${GREEN}✅ No staged files to scan${NC}\n`);
    process.exit(0);
  }
  
  // Filter files
  const filesToScan = files.filter(f => {
    if (isBinaryFile(f)) return false;
    if (shouldIgnoreFile(f, userConfig.ignoreFiles || [])) return false;
    return true;
  });
  
  console.log(`${CYAN}   Scanning ${filesToScan.length} file(s)...${NC}`);
  
  // Scan all files
  const allFindings = [];
  
  for (const file of filesToScan) {
    const findings = scanFile(file, defaultPatterns, userConfig);
    allFindings.push(...findings);
  }
  
  // Report results
  if (allFindings.length === 0) {
    console.log(`${GREEN}✅ No PII detected${NC}\n`);
    process.exit(0);
  }
  
  // Group findings by file
  const byFile = {};
  for (const finding of allFindings) {
    if (!byFile[finding.file]) {
      byFile[finding.file] = [];
    }
    byFile[finding.file].push(finding);
  }
  
  // Print findings
  console.log(`\n${RED}${BOLD}❌ PII DETECTED - COMMIT BLOCKED${NC}\n`);
  console.log(`${RED}Found ${allFindings.length} potential PII occurrence(s) in ${Object.keys(byFile).length} file(s):${NC}\n`);
  
  for (const [file, findings] of Object.entries(byFile)) {
    console.log(`${YELLOW}📄 ${file}${NC}`);
    
    for (const finding of findings) {
      const patternLabel = finding.pattern === 'BLACKLIST' 
        ? `${RED}[BLACKLIST]${NC}` 
        : `${CYAN}[${finding.pattern}]${NC}`;
      
      console.log(`   Line ${finding.line}: ${patternLabel} "${finding.match}"`);
      console.log(`   ${BLUE}→ ${finding.context}${NC}`);
    }
    console.log('');
  }
  
  // Instructions
  console.log(`${YELLOW}${BOLD}To fix this:${NC}`);
  console.log(`${YELLOW}  1. Remove the PII from your code, OR${NC}`);
  console.log(`${YELLOW}  2. Add false positives to .pii-config.json whitelist:${NC}`);
  console.log(`${CYAN}     {`);
  console.log(`       "whitelist": ["example@domain.com", "test-value"],`);
  console.log(`       "blacklist": ["your-project-key"],`);
  console.log(`       "ignoreFiles": ["path/to/ignore"]`);
  console.log(`     }${NC}\n`);
  
  process.exit(1);
}

// Run
main();

#!/usr/bin/env node
/**
 * Workflow Validator
 * 
 * Validates that all stories and backlog follow the workflow rules defined in AGENTS.md
 * 
 * Run in CI:
 *   node scripts/validate-workflow.js
 * 
 * Run locally:
 *   npm run validate:workflow
 * 
 * Exit codes:
 *   0 - All checks passed
 *   1 - Validation errors found
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const errors = [];
const warnings = [];

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message, file = null) {
  const msg = file ? `${file}: ${message}` : message;
  errors.push(msg);
  log(`❌ ERROR: ${msg}`, colors.red);
}

function warn(message, file = null) {
  const msg = file ? `${file}: ${message}` : message;
  warnings.push(msg);
  log(`⚠️  WARNING: ${msg}`, colors.yellow);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.cyan);
}

// ============================================================================
// File Utilities
// ============================================================================

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    error(`Cannot read file: ${err.message}`, filePath);
    return null;
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function getStoryFiles(includeArchived = false) {
  const storyFiles = [];
  
  // Scan active stories
  const storiesDir = path.join(__dirname, '../docs/stories');
  if (fs.existsSync(storiesDir)) {
    const activeStories = fs.readdirSync(storiesDir)
      .filter(f => f.match(/^EPIC-\d{2}-STORY-\d{3}-.+\.md$/))
      .map(f => path.join(storiesDir, f));
    storyFiles.push(...activeStories);
  }
  
  // Scan archived stories (only if requested)
  if (includeArchived) {
    const archiveDir = path.join(__dirname, '../docs/archive');
    if (fs.existsSync(archiveDir)) {
      const epicDirs = fs.readdirSync(archiveDir)
        .filter(d => fs.statSync(path.join(archiveDir, d)).isDirectory());
      
      for (const epicDir of epicDirs) {
        const epicPath = path.join(archiveDir, epicDir);
        const archivedStories = fs.readdirSync(epicPath)
          .filter(f => f.match(/^EPIC-\d{2}-STORY-\d{3}-.+\.md$/))
          .map(f => path.join(epicPath, f));
        storyFiles.push(...archivedStories);
      }
    }
  }
  
  return storyFiles;
}

// ============================================================================
// Story File Validation
// ============================================================================

function validateStoryFile(filePath) {
  const fileName = path.basename(filePath);
  const content = readFile(filePath);
  if (!content) return;

  info(`Validating ${fileName}...`);

  // Extract metadata from header
  const statusMatch = content.match(/\*\*Status\*\*:\s*([^\n]+)/);
  const assigneeMatch = content.match(/\*\*Assignee\*\*:\s*([^\n]+)/);
  const prMatch = content.match(/\*\*PR\*\*:\s*([^\n]+)/);
  const startedMatch = content.match(/\*\*Started\*\*:\s*([^\n]+)/);
  const completedMatch = content.match(/\*\*Completed\*\*:\s*([^\n]+)/);
  const sizeMatch = content.match(/\*\*Size\*\*:\s*(Small|Medium|Large)\s*\((\d+)\s*points?\)/);
  const priorityMatch = content.match(/\*\*Priority\*\*:\s*(P0|P1|P2|P3)/);

  if (!statusMatch) {
    error('Missing **Status** field', fileName);
  } else {
    const status = statusMatch[1].trim();
    validateStatus(status, fileName, {
      assignee: assigneeMatch?.[1]?.trim(),
      pr: prMatch?.[1]?.trim(),
      started: startedMatch?.[1]?.trim(),
      completed: completedMatch?.[1]?.trim(),
      content
    });
  }

  if (!sizeMatch) {
    error('Missing or invalid **Size** field (must be Small/Medium/Large with points)', fileName);
  } else {
    const [, size, points] = sizeMatch;
    const expectedPoints = { Small: '3', Medium: '5', Large: '8' };
    if (expectedPoints[size] !== points) {
      error(`Size ${size} should be ${expectedPoints[size]} points, not ${points}`, fileName);
    }
  }

  if (!priorityMatch) {
    error('Missing or invalid **Priority** field (must be P0, P1, P2, or P3)', fileName);
  }

  // Validate User Story section
  if (!content.includes('## User Story')) {
    error('Missing "## User Story" section', fileName);
  } else {
    const userStoryMatch = content.match(/\*\*As a\*\*.*\*\*I want\*\*.*\*\*So that\*\*/s);
    if (!userStoryMatch) {
      error('User Story must include "As a", "I want", "So that" format', fileName);
    }
  }

  // Validate Acceptance Criteria
  if (!content.includes('## Acceptance Criteria')) {
    error('Missing "## Acceptance Criteria" section', fileName);
  } else {
    const acMatches = content.match(/###\s+(?:✅\s+)?AC\d+:/g);
    if (!acMatches || acMatches.length < 3) {
      warn('Story should have at least 3 Acceptance Criteria', fileName);
    }
    if (acMatches && acMatches.length > 12) {
      warn('Story has >12 Acceptance Criteria - consider splitting', fileName);
    }
  }

  // Validate Definition of Done section
  if (!content.includes('## Definition of Done')) {
    error('Missing "## Definition of Done" section', fileName);
  }

  // Validate Related Stories section
  if (!content.includes('## Related Stories')) {
    warn('Missing "## Related Stories" section', fileName);
  }

  // Validate Testing Strategy section
  if (!content.includes('## Testing Strategy')) {
    warn('Missing "## Testing Strategy" section', fileName);
  }

  // Check for template placeholders
  if (content.includes('{EPIC}') || content.includes('{STORY}') || content.includes('{role/persona}')) {
    error('Story contains template placeholders - replace with actual values', fileName);
  }
}

function validateStatus(status, fileName, metadata) {
  const validStatuses = ['📋 Ready for Development', '⏳ In Progress', '✅ Done', '🚫 Blocked'];
  
  if (!validStatuses.some(s => status.startsWith(s))) {
    error(`Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}`, fileName);
    return;
  }

  // Status-specific validations
  if (status.startsWith('⏳ In Progress')) {
    if (metadata.assignee === '-' || !metadata.assignee) {
      error('Story marked "In Progress" must have an assignee', fileName);
    }
    if (metadata.started === '-' || !metadata.started) {
      error('Story marked "In Progress" must have a started date', fileName);
    }
    if (metadata.completed !== '-') {
      error('Story marked "In Progress" should not have a completed date', fileName);
    }
  }

  if (status.startsWith('✅ Done')) {
    if (!metadata.pr || metadata.pr === '-') {
      warn('Story marked "Done" should have a PR/commit link (can be added after commit)', fileName);
    }
    if (metadata.completed === '-' || !metadata.completed) {
      error('Story marked "Done" must have a completed date', fileName);
    }
    
    // Check all ACs are completed
    const uncheckedACs = (metadata.content.match(/- \[ \]/g) || []).length;
    if (uncheckedACs > 0) {
      error(`Story marked "Done" has ${uncheckedACs} unchecked acceptance criteria`, fileName);
    }

    // NEW: Check all ACs have evidence links
    validateEvidenceLinks(metadata.content, fileName);

    // Check Definition of Done
    const dodMatch = metadata.content.match(/## Definition of Done([\s\S]*?)(?=##|$)/);
    if (dodMatch) {
      const dodUnchecked = (dodMatch[1].match(/- \[ \]/g) || []).length;
      if (dodUnchecked > 0) {
        error(`Story marked "Done" has ${dodUnchecked} unchecked Definition of Done items`, fileName);
      }
    }
  }

  if (status.startsWith('🚫 Blocked')) {
    // Should have explanation in the status or notes
    if (!status.includes('-') && !metadata.content.includes('**Blocked By**')) {
      warn('Story marked "Blocked" should explain blocker in status or notes', fileName);
    }
  }
}

// ============================================================================
// Backlog Validation
// ============================================================================

function validateBacklog() {
  const backlogPath = path.join(__dirname, '../docs/backlog.md');
  info('Validating backlog.md...');

  if (!fileExists(backlogPath)) {
    error('backlog.md not found', 'docs/backlog.md');
    return;
  }

  const content = readFile(backlogPath);
  if (!content) return;

  // Extract all story references from backlog (list format)
  const listStoryRefs = [...content.matchAll(/- ([📋⏳✅🚫])\s*\[([^\]]+)\]\(stories\/(EPIC-\d{2}-STORY-\d{3}-[^)]+\.md)\)/g)];
  
  // Extract all story references from backlog (table format)
  // Format: | E1-S01 | [Story Name](stories/EPIC-01-STORY-001-name.md) | ... | ✅ Done |
  const tableStoryRefs = [...content.matchAll(/\|\s*E\d+-S\d+\s*\|\s*\[([^\]]+)\]\(stories\/(EPIC-\d{2}-STORY-\d{3}-[^)]+\.md)\)[^\|]*\|[^\|]*\|[^\|]*\|\s*([📋⏳✅🚫])/g)];
  
  const storyRefs = [...listStoryRefs, ...tableStoryRefs];

  if (storyRefs.length === 0) {
    warn('No story references found in backlog.md', 'docs/backlog.md');
    return;
  }

  for (const match of storyRefs) {
    // Handle both list and table formats
    // List: [full_match, emoji, title, storyFile]
    // Table: [full_match, title, storyFile, emoji]
    let emoji, title, storyFile;
    
    if (match[0].startsWith('-')) {
      // List format
      [, emoji, title, storyFile] = match;
    } else {
      // Table format
      [, title, storyFile, emoji] = match;
    }
    
    const storyPath = path.join(__dirname, '../docs/stories', storyFile);

    // Check story file exists
    if (!fileExists(storyPath)) {
      error(`Story file referenced in backlog does not exist: ${storyFile}`, 'docs/backlog.md');
      continue;
    }

    // Check status matches between backlog and story file
    const storyContent = readFile(storyPath);
    if (!storyContent) continue;

    const statusMatch = storyContent.match(/\*\*Status\*\*:\s*([📋⏳✅🚫])/);
    if (statusMatch) {
      const storyEmoji = statusMatch[1];
      if (emoji !== storyEmoji) {
        error(`Status mismatch: backlog.md shows "${emoji}" but story file shows "${storyEmoji}"`, storyFile);
      }
    }
  }

  // Check for points calculation
  const epicMatches = [...content.matchAll(/### Epic \d+:.*?\(.*?(\d+)\/(\d+) points\)/g)];
  for (const match of epicMatches) {
    const [fullMatch, completed, total] = match;
    if (parseInt(completed) > parseInt(total)) {
      error(`Epic shows more completed points (${completed}) than total (${total})`, 'docs/backlog.md');
    }
  }

  success(`Backlog validation complete (${storyRefs.length} stories referenced)`);
}

// ============================================================================
// Cross-Reference Validation
// ============================================================================

function validateDependencies() {
  info('Validating story dependencies...');
  
  // Get all stories (including archived) for dependency resolution
  const storyFiles = getStoryFiles(true);
  const storyStatuses = new Map();

  // First pass: collect all story IDs and statuses
  for (const filePath of storyFiles) {
    const content = readFile(filePath);
    if (!content) continue;

    const fileName = path.basename(filePath);
    const idMatch = fileName.match(/EPIC-(\d{2})-STORY-(\d{3})/);
    if (!idMatch) continue;

    const storyId = `E${idMatch[1]}-S${idMatch[2]}`;
    const statusMatch = content.match(/\*\*Status\*\*:\s*([📋⏳✅🚫])/);
    const status = statusMatch?.[1] || '❓';

    storyStatuses.set(storyId, { status, file: fileName });
  }

  // Helper function to normalize story IDs
  const normalizeStoryId = (id) => {
    const match = id.match(/E(\d+)-S(\d+)/);
    if (!match) return id;
    return `E${match[1].padStart(2, '0')}-S${match[2].padStart(3, '0')}`;
  };

  // Second pass: validate dependencies
  for (const filePath of storyFiles) {
    const content = readFile(filePath);
    if (!content) continue;

    const fileName = path.basename(filePath);
    const idMatch = fileName.match(/EPIC-(\d{2})-STORY-(\d{3})/);
    if (!idMatch) continue;

    const storyId = `E${idMatch[1]}-S${idMatch[2]}`;
    const currentStatus = storyStatuses.get(storyId)?.status;

    // Extract dependencies
    const dependsOnMatch = content.match(/- \*\*Depends On\*\*:\s*([^\n]+)/);
    if (dependsOnMatch) {
      const dependencies = dependsOnMatch[1].split(',').map(d => {
        const match = d.trim().match(/E\d+-S\d+/)?.[0];
        return match ? normalizeStoryId(match) : null;
      }).filter(Boolean);

      for (const depId of dependencies) {
        const depInfo = storyStatuses.get(depId);
        
        if (!depInfo) {
          error(`Story ${storyId} depends on ${depId}, but that story doesn't exist`, fileName);
          continue;
        }

        // If current story is In Progress or Done, dependencies must be Done
        if ((currentStatus === '⏳' || currentStatus === '✅') && depInfo.status !== '✅') {
          error(`Story ${storyId} (${currentStatus}) depends on ${depId} which is not Done (${depInfo.status})`, fileName);
        }
      }
    }
  }

  success('Dependency validation complete');
}

// ============================================================================
// File Naming Validation
// ============================================================================

function validateFileNaming() {
  info('Validating file naming conventions...');
  
  const storyFiles = getStoryFiles();

  for (const filePath of storyFiles) {
    const fileName = path.basename(filePath);
    
    // Check naming format
    if (!fileName.match(/^EPIC-\d{2}-STORY-\d{3}-[a-z0-9-]+\.md$/)) {
      error('File name must match format: EPIC-XX-STORY-YYY-kebab-case-name.md', fileName);
    }

    // Check epic/story numbers match content
    const content = readFile(filePath);
    if (!content) continue;

    const fileMatch = fileName.match(/EPIC-(\d{2})-STORY-(\d{3})/);
    const headerMatch = content.match(/^#\s*E(\d+)-S(\d+):/m);

    if (fileMatch && headerMatch) {
      const [, fileEpic, fileStory] = fileMatch;
      const [, headerEpic, headerStory] = headerMatch;

      if (parseInt(fileEpic) !== parseInt(headerEpic)) {
        error(`File name epic (${fileEpic}) doesn't match header (E${headerEpic})`, fileName);
      }
      if (parseInt(fileStory) !== parseInt(headerStory)) {
        error(`File name story (${fileStory}) doesn't match header (S${headerStory})`, fileName);
      }
    }
  }

  success('File naming validation complete');
}

// ============================================================================
// Evidence Links Validation (Audit Action #6)
// ============================================================================

function validateEvidenceLinks(content, fileName) {
  // Strategy: Check for evidence at the AC section level, not individual checkboxes
  // Rationale: An AC section (e.g., "AC1: Configuration Loading") is the acceptance unit
  //            Individual checkboxes are implementation details
  //            One evidence link per AC section is sufficient
  
  // Find all AC sections (### ✅ AC\d+:)
  const acSectionRegex = /### ✅ (AC\d+):([^\n]*)\n([\s\S]*?)(?=###|##|$)/g;
  const acSections = [...content.matchAll(acSectionRegex)];
  
  if (acSections.length === 0) {
    // No ACs found, skip validation
    return;
  }
  
  for (const match of acSections) {
    const [fullMatch, acId, acTitle, acContent] = match;
    const acHeader = `${acId}:${acTitle}`;
    
    // Check if this AC section has any checked items
    const hasCheckedItems = acContent.match(/- \[x\]/);
    if (!hasCheckedItems) {
      // AC not completed yet, skip evidence check
      continue;
    }
    
    // Check if this is a "deferred" AC (evidence will be in another story)
    const isDeferred = acContent.toLowerCase().includes('deferred') || 
                       acContent.toLowerCase().includes('defer to');
    if (isDeferred) {
      // Deferred ACs don't need evidence in this story
      continue;
    }
    
    // Check if AC section has **Evidence**: anywhere in its content
    const hasEvidence = acContent.includes('**Evidence**:');
    if (!hasEvidence) {
      error(`${acId} is checked but missing **Evidence**: link in section`, fileName);
      continue;
    }
    
    // Check if evidence is not empty (not just "**Evidence**: -")
    const evidenceLines = acContent.match(/\*\*Evidence\*\*:\s*(.+)/g) || [];
    let hasValidEvidence = false;
    
    for (const evidenceLine of evidenceLines) {
      // Check if evidence has actual content (not just "-")
      if (evidenceLine.match(/\*\*Evidence\*\*:\s*[^-\n]/)) {
        hasValidEvidence = true;
        break;
      }
    }
    
    if (!hasValidEvidence) {
      error(`${acId} has empty evidence (all entries are just "-")`, fileName);
    }
    
    // Optional: Warn if no markdown links found (but don't fail)
    const hasMarkdownLinks = acContent.match(/\[.*?\]\(.*?\)/);
    if (hasValidEvidence && !hasMarkdownLinks) {
      warn(`${acId} evidence should include markdown links to code/tests`, fileName);
    }
  }
}

// ============================================================================
// Demo Verification (Audit Action #6)
// ============================================================================

function validateDemoRequirement(content, fileName) {
  // Check if story has demo requirement in DoD
  const dodMatch = content.match(/## Definition of Done([\s\S]*?)(?=##|$)/);
  if (!dodMatch) return;

  const dodContent = dodMatch[1];
  const hasDemoRequirement = dodContent.includes('Demo created') || dodContent.includes('demo works');

  if (!hasDemoRequirement) return; // No demo required

  // Check if demo exists or exception documented
  const demoCompleted = dodContent.match(/- \[x\].*[Dd]emo/);
  const exceptionDocumented = content.includes('## Definition of Done Exceptions');

  if (!demoCompleted && !exceptionDocumented) {
    error('Story requires demo but has no demo checked and no DoD exception documented', fileName);
  }

  // If exception documented, verify it follows the template
  if (exceptionDocumented) {
    const exceptionSection = content.match(/## Definition of Done Exceptions([\s\S]*?)(?=##|$)/);
    if (exceptionSection) {
      const exceptionContent = exceptionSection[1];
      
      // Check required fields
      if (!exceptionContent.includes('**Standard DoD**:')) {
        error('DoD Exception missing **Standard DoD** field', fileName);
      }
      if (!exceptionContent.includes('**Exception Request**:')) {
        error('DoD Exception missing **Exception Request** field', fileName);
      }
      if (!exceptionContent.includes('**Justification**:')) {
        error('DoD Exception missing **Justification** field', fileName);
      }
      if (!exceptionContent.includes('**Alternative Evidence**:')) {
        error('DoD Exception missing **Alternative Evidence** field', fileName);
      }
      if (!exceptionContent.includes('**Approved By**:')) {
        error('DoD Exception missing **Approved By** field', fileName);
      }
    }
  }
}

// ============================================================================
// Testing Prerequisites Validation (Audit Action #6)
// ============================================================================

function validateTestingPrerequisites(content, fileName) {
  // NOTE: Testing prerequisites are a WORKFLOW reminder (Phase 2 & 3),
  // not a story file requirement. Stories don't need this section.
  // Prerequisites are documented in workflow files instead.
  
  // No validation needed - this is handled by workflow process, not story structure
  return;
}

// ============================================================================
// Duplicate Detection (Audit Action #6)
// ============================================================================

function detectDuplicateContent() {
  info('Checking for duplicate content blocks in story files...');
  
  // Only check active stories (not archived)
  const storyFiles = getStoryFiles(false);
  const MIN_BLOCK_SIZE = 5; // Minimum consecutive lines to flag as duplicate
  
  // Extract story-specific sections (skip common boilerplate)
  function extractStorySpecificContent(content) {
    // Extract sections that should be unique per story
    const sections = [];
    
    // User Story section
    const userStoryMatch = content.match(/## User Story\n([\s\S]*?)(?=\n##|$)/);
    if (userStoryMatch) sections.push(userStoryMatch[1]);
    
    // Acceptance Criteria sections (the actual ACs, not just checkboxes)
    const acMatches = content.matchAll(/### ✅ AC\d+:([^\n]*)\n([\s\S]*?)(?=###|##|$)/g);
    for (const match of acMatches) {
      const acTitle = match[1].trim();
      const acContent = match[2].trim();
      // Include title + first substantive content (skip checkboxes)
      const substantive = acContent.split('\n')
        .filter(line => !line.match(/^- \[[ x]\]/))
        .slice(0, 3) // First 3 non-checkbox lines
        .join('\n');
      sections.push(acTitle + '\n' + substantive);
    }
    
    // Technical Notes
    const techNotesMatch = content.match(/## Technical Notes\n([\s\S]*?)(?=\n##|$)/);
    if (techNotesMatch) sections.push(techNotesMatch[1]);
    
    return sections.join('\n\n').trim();
  }
  
  // Build content fingerprints (hash of story-specific content)
  const contentMap = new Map(); // fingerprint -> [files]
  
  for (const filePath of storyFiles) {
    const content = readFile(filePath);
    if (!content) continue;
    
    const fileName = path.basename(filePath);
    const storyContent = extractStorySpecificContent(content);
    
    // Create blocks of N consecutive lines for comparison
    const lines = storyContent.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 20); // Skip short lines
    
    // Check blocks of consecutive lines
    for (let i = 0; i <= lines.length - MIN_BLOCK_SIZE; i++) {
      const block = lines.slice(i, i + MIN_BLOCK_SIZE).join('|');
      
      if (contentMap.has(block)) {
        contentMap.get(block).push(fileName);
      } else {
        contentMap.set(block, [fileName]);
      }
    }
  }
  
  // Report duplicates
  let duplicateCount = 0;
  for (const [block, files] of contentMap.entries()) {
    if (files.length > 1) {
      // Only report if files are in different epics (same epic = expected similarity)
      const epics = new Set(files.map(f => f.match(/EPIC-(\d+)/)?.[1]));
      if (epics.size > 1) {
        duplicateCount++;
        const preview = block.split('|')[0].substring(0, 60);
        warn(`Substantial duplicate content across epics in: ${files.join(', ')}\n   Preview: "${preview}..."`, files[0]);
      }
    }
  }
  
  if (duplicateCount === 0) {
    success('No substantial duplicate content found across different epics');
  } else {
    success(`Duplicate detection complete (${duplicateCount} potential issues)`);
  }
}

// ============================================================================
// Coverage Check (Audit Action #6)
// ============================================================================

function validateCoverage() {
  info('Checking test coverage requirement...');
  
  const coveragePath = path.join(__dirname, '../coverage/coverage-summary.json');
  
  if (!fileExists(coveragePath)) {
    warn('No coverage report found (coverage/coverage-summary.json). Run `npm run test:coverage` to generate.');
    return;
  }

  try {
    // Read thresholds from jest.config.js
    const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
    let thresholds = { statements: 95, branches: 95, functions: 95, lines: 95 };
    
    if (fileExists(jestConfigPath)) {
      try {
        const jestConfig = require(jestConfigPath);
        if (jestConfig.coverageThreshold && jestConfig.coverageThreshold.global) {
          thresholds = jestConfig.coverageThreshold.global;
        }
      } catch (err) {
        warn(`Could not read jest.config.js, using default 95% thresholds: ${err.message}`);
      }
    }
    
    const coverageData = JSON.parse(readFile(coveragePath));
    const total = coverageData.total;

    const metrics = ['statements', 'branches', 'functions', 'lines'];
    let failed = false;

    for (const metric of metrics) {
      const pct = total[metric].pct;
      const threshold = thresholds[metric] || 95;
      
      if (pct < threshold) {
        error(`Coverage ${metric}: ${pct}% < ${threshold}% requirement`);
        failed = true;
      } else {
        success(`Coverage ${metric}: ${pct}% ✅`);
      }
    }

    if (failed) {
      error('Test coverage below threshold. Either fix coverage or document DoD exception.');
    }
  } catch (err) {
    error(`Failed to parse coverage report: ${err.message}`);
  }
}

// ============================================================================
// Helper: Detect if coverage validation is needed
// ============================================================================

function shouldValidateCoverage() {
  // Try to get staged files from git
  let stagedFiles = [];
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    stagedFiles = output.trim().split('\n').filter(f => f);
  } catch (err) {
    // Not in a git commit context (e.g., running manually)
    // In this case, always validate coverage
    return true;
  }

  // If no staged files, we're running manually - validate coverage
  if (stagedFiles.length === 0) {
    return true;
  }

  // Check if any code files are being committed
  const codeFiles = stagedFiles.filter(f => 
    f.match(/^(src|tests|examples)\//) && !f.match(/\.(md|txt)$/)
  );

  if (codeFiles.length > 0) {
    info('Code files detected in commit, coverage validation enabled\n');
    return true;
  }

  // Check if any story files being committed are marked "Done"
  const storyFiles = stagedFiles.filter(f => f.match(/docs\/stories\/.*\.md$/));
  
  for (const filePath of storyFiles) {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!fileExists(fullPath)) continue;
    
    const content = readFile(fullPath);
    if (!content) continue;
    
    const statusMatch = content.match(/\*\*Status\*\*:\s*([^\n]+)/);
    const status = statusMatch?.[1]?.trim();
    
    if (status && status.includes('✅')) {
      info('Story marked "Done" detected, coverage validation enabled\n');
      return true;
    }
  }

  // Only doc files being committed, and no "Done" stories
  info('Only documentation changes detected (no code, no Done stories)\n');
  info('Coverage validation skipped (will validate when code is committed)\n');
  return false;
}

// ============================================================================
// Main Execution
// ============================================================================

function main() {
  log('\n==========================================================', colors.blue);
  log('  JIRA Magic Library - Workflow Validator', colors.blue);
  log('==========================================================\n', colors.blue);

  // Automatically detect if coverage validation is needed
  const shouldCheckCoverage = shouldValidateCoverage();

  // Run all validations
  validateBacklog();
  log('');

  // Only validate active stories (not archived)
  const storyFiles = getStoryFiles(false);
  if (storyFiles.length === 0) {
    warn('No story files found to validate');
  } else {
    info(`Found ${storyFiles.length} story files\n`);
    
    for (const filePath of storyFiles) {
      validateStoryFile(filePath);
      log('');
    }
  }

  validateFileNaming();
  log('');

  validateDependencies();
  log('');

  // NEW VALIDATIONS (Audit Action #6)
  detectDuplicateContent();
  log('');

  // Only validate coverage if needed (code changes or Done stories)
  if (shouldCheckCoverage) {
    validateCoverage();
    log('');
  }

  // Also validate demos for Done stories
  info('Running additional story validations...\n');
  for (const filePath of storyFiles) {
    const content = readFile(filePath);
    if (!content) continue;

    const fileName = path.basename(filePath);
    const statusMatch = content.match(/\*\*Status\*\*:\s*([^\n]+)/);
    const status = statusMatch?.[1]?.trim();

    // Only validate demos for Done stories
    if (status && status.startsWith('✅ Done')) {
      validateDemoRequirement(content, fileName);
    }
  }
  log('');

  // Summary
  log('==========================================================', colors.blue);
  log('  Validation Summary', colors.blue);
  log('==========================================================\n', colors.blue);

  if (errors.length === 0 && warnings.length === 0) {
    success('All checks passed! ✨');
    log('');
    return 0;
  }

  if (warnings.length > 0) {
    log(`\n${colors.yellow}Warnings (${warnings.length}):${colors.reset}`);
    warnings.forEach(w => log(`  ⚠️  ${w}`, colors.yellow));
  }

  if (errors.length > 0) {
    log(`\n${colors.red}Errors (${errors.length}):${colors.reset}`);
    errors.forEach(e => log(`  ❌ ${e}`, colors.red));
    log('');
    log('❌ Validation failed. Please fix errors above.', colors.red);
    log('');
    log('🔒 STRICT MODE: Blocking commit due to validation errors.', colors.red);
    log('');
    return 1;
  }

  log('');
  success('Validation complete with warnings only');
  log('⚠️  Warnings do not block commits, but should be addressed.');
  log('');
  return 0;
}

// Run and exit with appropriate code
const exitCode = main();
process.exit(exitCode);

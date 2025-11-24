#!/usr/bin/env node
/**
 * Epic Archiver
 * 
 * Archives completed epic stories to keep active workspace clean while preserving history.
 * 
 * Usage:
 *   npm run archive:epic -- epic-01
 *   node scripts/archive-epic.js epic-01
 * 
 * What it does:
 *   1. Moves all EPIC-XX-STORY-*.md files to docs/archive/epic-XX/
 *   2. Creates EPIC-SUMMARY.md with key outcomes and metrics
 *   3. Updates backlog.md to reference archive location
 *   4. Commits changes with appropriate message
 * 
 * Prerequisites:
 *   - Epic must be marked ✅ Complete in backlog.md
 *   - All epic stories must be ✅ Done with evidence
 *   - Epic validation story (E*-S*13) must be complete
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ERROR: ${message}`, colors.red);
}

function warn(message) {
  log(`⚠️  WARNING: ${message}`, colors.yellow);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

// Helper functions
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return null;
  }
}

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function moveFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.renameSync(src, dest);
}

function getEpicNumber(epicId) {
  const match = epicId.match(/epic-(\d+)/i);
  return match ? match[1] : null;
}

function getStoryFiles(epicNumber) {
  const storiesDir = path.join(__dirname, '../docs/stories');
  if (!fs.existsSync(storiesDir)) return [];
  
  return fs.readdirSync(storiesDir)
    .filter(file => file.startsWith(`EPIC-${epicNumber.padStart(2, '0')}-STORY-`))
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(storiesDir, file));
}

function validateEpicReady(epicId, epicNumber) {
  info(`Validating epic ${epicId} is ready for archiving...`);
  
  // Check if backlog exists
  const backlogPath = path.join(__dirname, '../docs/backlog.md');
  if (!fileExists(backlogPath)) {
    error('backlog.md not found');
    return false;
  }
  
  const backlogContent = readFile(backlogPath);
  if (!backlogContent) {
    error('Cannot read backlog.md');
    return false;
  }
  
  // Check if epic is marked complete in backlog
  // Look for the epic in the summary table first  
  const tablePattern = new RegExp(`\\*\\*Epic ${parseInt(epicNumber)}\\*\\*.*?\\|.*?✅ Complete`, 'i');
  const tableMatch = backlogContent.match(tablePattern);
  
  if (!tableMatch) {
    error(`Epic ${parseInt(epicNumber)} is not marked as ✅ Complete in backlog.md summary table`);
    warn('Please complete the epic before archiving');
    return false;
  }
  
  // Check story files exist
  const storyFiles = getStoryFiles(epicNumber);
  if (storyFiles.length === 0) {
    error(`No story files found for epic ${epicNumber}`);
    return false;
  }
  
  info(`Found ${storyFiles.length} story files for epic ${epicNumber}`);
  
  // Check if epic validation story exists and is complete
  const validationStory = storyFiles.find(file => 
    path.basename(file).match(/-013-.*epic.*validation/i) ||
    path.basename(file).match(/-\d{3}-.*epic.*closure/i)
  );
  
  if (!validationStory) {
    warn(`No epic validation/closure story found for epic ${epicNumber}`);
    warn('Consider creating one to validate epic completion');
  } else {
    const validationContent = readFile(validationStory);
    if (validationContent && !validationContent.includes('**Status**: ✅ Done')) {
      error(`Epic validation story ${path.basename(validationStory)} is not marked as Done`);
      warn('Please complete epic validation before archiving');
      return false;
    }
  }
  
  success(`Epic ${epicNumber} is ready for archiving`);
  return true;
}

function generateEpicSummary(epicNumber, storyFiles) {
  info('Generating epic summary...');
  
  const stories = [];
  let totalPoints = 0;
  let completedStories = 0;
  
  for (const filePath of storyFiles) {
    const content = readFile(filePath);
    if (!content) continue;
    
    const fileName = path.basename(filePath);
    const storyId = fileName.match(/EPIC-\d+-STORY-(\d+)/)?.[1];
    
    // Extract metadata
    const sizeMatch = content.match(/\*\*Size\*\*:\s*([^(\n]*)\((\d+)\s*points?\)/);
    const statusMatch = content.match(/\*\*Status\*\*:\s*([^\n]+)/);
    const titleMatch = content.match(/^# (.+)/m);
    
    const story = {
      id: storyId,
      fileName,
      title: titleMatch?.[1] || fileName,
      size: sizeMatch?.[1]?.trim() || 'Unknown',
      points: parseInt(sizeMatch?.[2]) || 0,
      status: statusMatch?.[1]?.trim() || 'Unknown',
      isDone: statusMatch?.[1]?.includes('✅ Done') || false
    };
    
    stories.push(story);
    totalPoints += story.points;
    if (story.isDone) completedStories++;
  }
  
  // Sort by story ID
  stories.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  
  const now = new Date().toISOString().split('T')[0];
  
  const summary = `# Epic ${epicNumber} - Completion Summary

**Archived**: ${now}  
**Total Stories**: ${stories.length}  
**Completed Stories**: ${completedStories}/${stories.length}  
**Total Points**: ${totalPoints}  
**Completion Rate**: ${Math.round(completedStories / stories.length * 100)}%

---

## Epic Overview

This epic has been archived to keep the active workspace clean while preserving historical context.

**Archive Location**: \`docs/archive/epic-${epicNumber.padStart(2, '0')}/\`  
**Original Location**: \`docs/stories/\` (moved on ${now})

---

## Story Summary

| Story | Title | Size | Points | Status |
|-------|-------|------|--------|--------|
${stories.map(s => `| E${epicNumber}-S${s.id.padStart(2, '0')} | ${s.title.replace(/^E\d+-S\d+:\s*/, '')} | ${s.size} | ${s.points} | ${s.status} |`).join('\n')}

**Total Points**: ${totalPoints}

---

## Key Outcomes

${completedStories === stories.length ? 
  '✅ **Epic Successfully Completed** - All stories delivered with evidence' : 
  `⚠️ **Partial Completion** - ${completedStories}/${stories.length} stories completed`}

### Delivered Features
${stories.filter(s => s.isDone).map(s => `- ✅ ${s.title.replace(/^E\d+-S\d+:\s*/, '')}`).join('\n')}

${stories.filter(s => !s.isDone).length > 0 ? `
### Incomplete Items
${stories.filter(s => !s.isDone).map(s => `- ❌ ${s.title.replace(/^E\d+-S\d+:\s*/, '')}`).join('\n')}
` : ''}

---

## Archive Contents

This archive contains all story files for Epic ${epicNumber}:

${stories.map(s => `- \`${s.fileName}\``).join('\n')}

---

## Restoration

To restore this epic to active development:

\`\`\`bash
# Move files back to active stories
mv docs/archive/epic-${epicNumber.padStart(2, '0')}/*.md docs/stories/

# Update backlog status
# (manually edit docs/backlog.md to change status back to "In Progress")

# Remove archive
rm -rf docs/archive/epic-${epicNumber.padStart(2, '0')}/
\`\`\`

---

*Archived by Epic Archiver - Generated on ${now}*
`;

  return summary;
}

function updateBacklog(epicNumber, archiveDate) {
  info('Updating backlog.md...');
  
  const backlogPath = path.join(__dirname, '../docs/backlog.md');
  const content = readFile(backlogPath);
  if (!content) {
    error('Cannot read backlog.md');
    return false;
  }
  
  // Update the summary table 
  const tablePattern = new RegExp(`(\\| \\*\\*Epic ${parseInt(epicNumber)}\\*\\*.*?\\|.*?)✅ Complete(.*?\\|)`, 'g');
  let updatedContent = content.replace(
    tablePattern, 
    `$1📁 Archived ${archiveDate}$2`
  );
  
  // Update all story links for this epic to point to archive
  const storyLinkPattern = new RegExp(`\\[([^\\]]*?)\\]\\(stories/EPIC-${epicNumber.padStart(2, '0')}-STORY-([^\\)]*?)\\)`, 'g');
  updatedContent = updatedContent.replace(
    storyLinkPattern,
    `[$1](archive/epic-${epicNumber.padStart(2, '0')}/EPIC-${epicNumber.padStart(2, '0')}-STORY-$2)`
  );
  
  // Add archive reference to the epic section header
  const headerPattern = new RegExp(`(## Epic ${parseInt(epicNumber)}: Basic Issue Creation\n\n)`, 's');
  updatedContent = updatedContent.replace(
    headerPattern,
    `$1**📁 Archive**: [docs/archive/epic-${epicNumber.padStart(2, '0')}/](archive/epic-${epicNumber.padStart(2, '0')}/) - Archived ${archiveDate}\n\n`
  );
  
  writeFile(backlogPath, updatedContent);
  success('Updated backlog.md with archive reference');
  return true;
}

function archiveEpic(epicId) {
  const epicNumber = getEpicNumber(epicId);
  if (!epicNumber) {
    error(`Invalid epic ID format: ${epicId}. Use format: epic-01, epic-02, etc.`);
    return false;
  }
  
  log(`\n${'='.repeat(60)}`, colors.blue);
  log(`  Epic Archiver - Epic ${epicNumber}`, colors.blue);
  log(`${'='.repeat(60)}\n`, colors.blue);
  
  // Validate epic is ready
  if (!validateEpicReady(epicId, epicNumber)) {
    return false;
  }
  
  // Get story files
  const storyFiles = getStoryFiles(epicNumber);
  
  // Create archive directory
  const archiveDir = path.join(__dirname, `../docs/archive/epic-${epicNumber.padStart(2, '0')}`);
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
    success(`Created archive directory: ${archiveDir}`);
  }
  
  // Move story files
  info('Moving story files to archive...');
  const movedFiles = [];
  
  for (const filePath of storyFiles) {
    const fileName = path.basename(filePath);
    const destPath = path.join(archiveDir, fileName);
    
    try {
      moveFile(filePath, destPath);
      movedFiles.push(fileName);
      info(`  Moved: ${fileName}`);
    } catch (err) {
      error(`Failed to move ${fileName}: ${err.message}`);
      return false;
    }
  }
  
  success(`Moved ${movedFiles.length} story files to archive`);
  
  // Generate epic summary
  const summary = generateEpicSummary(epicNumber, storyFiles.map(f => 
    path.join(archiveDir, path.basename(f))
  ));
  
  const summaryPath = path.join(archiveDir, 'EPIC-SUMMARY.md');
  writeFile(summaryPath, summary);
  success('Generated EPIC-SUMMARY.md');
  
  // Update backlog
  const archiveDate = new Date().toISOString().split('T')[0];
  if (!updateBacklog(epicNumber, archiveDate)) {
    return false;
  }
  
  // Summary
  log(`\n${'='.repeat(60)}`, colors.green);
  log(`  Archive Complete!`, colors.green);
  log(`${'='.repeat(60)}`, colors.green);
  log(`Epic ${epicNumber} archived successfully`, colors.green);
  log(`Archive location: docs/archive/epic-${epicNumber.padStart(2, '0')}/`, colors.cyan);
  log(`Files archived: ${movedFiles.length}`, colors.cyan);
  log('', colors.reset);
  
  warn('Don\'t forget to commit these changes:');
  log(`git add docs/archive/ docs/backlog.md`, colors.yellow);
  log(`git commit -m "Archive Epic ${epicNumber}: Move completed stories to archive"`, colors.yellow);
  log('');
  
  return true;
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    error('Epic ID required');
    log('Usage: node scripts/archive-epic.js <epic-id>');
    log('Example: node scripts/archive-epic.js epic-01');
    process.exit(1);
  }
  
  const epicId = args[0];
  const success = archiveEpic(epicId);
  
  process.exit(success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { archiveEpic };
/**
 * Progress Tracking Demo
 *
 * Demonstrates Phase 2.2 progress tracking features:
 * - Real-time progress callbacks during bulk operations
 * - Progress bar visualization
 * - Time-since-progress monitoring
 * - Works with both flat and hierarchical bulk operations
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, showCode, warning } from '../ui/display.js';
import { confirm } from '../ui/prompts.js';

export async function runProgressTrackingDemo(config) {
  showHeader('Progress Tracking Demo (Phase 2.2)');

  info('Real-time progress monitoring during bulk JIRA operations.');
  info('Watch as issues are created and tracked via marker labels.\n');

  // Prompt for project key
  const { projectKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectKey',
      message: 'Enter the JIRA project key:',
      default: config.defaultProjectKey || config.projectKey || 'PROJ',
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'Project key is required';
        }
        if (!/^[A-Z][A-Z0-9]*$/.test(input.trim())) {
          return 'Project key must start with a letter and contain only uppercase letters and numbers';
        }
        return true;
      },
    },
  ]);

  // Choose demo type
  const { demoType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'demoType',
      message: 'Select operation type:',
      choices: [
        { name: '📥 Flat Bulk (no parent-child relationships)', value: 'flat' },
        { name: '🏗️  Hierarchy (with parent-child relationships)', value: 'hierarchy' },
      ],
    },
  ]);

  // Choose issue count
  const { issueCount } = await inquirer.prompt([
    {
      type: 'number',
      name: 'issueCount',
      message: 'How many issues to create?',
      default: 10,
      validate: (input) => {
        if (!input || input < 1) {
          return 'Must create at least 1 issue';
        }
        if (input > 100) {
          return 'Maximum 100 issues for demo (JIRA rate limits)';
        }
        return true;
      },
    },
  ]);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Build issue data
  let issues;
  if (demoType === 'hierarchy') {
    // Create 1 epic + (issueCount - 1) tasks
    issues = [
      {
        uid: 'epic-1',
        Project: projectKey,
        'Issue Type': 'Epic',
        Summary: `Progress Demo Epic ${timestamp}`,
        Description: 'Parent epic for progress tracking demo'
      }
    ];

    // Add child tasks
    for (let i = 1; i < issueCount; i++) {
      issues.push({
        uid: `task-${i}`,
        Project: projectKey,
        'Issue Type': 'Task',
        Summary: `Progress Demo Task ${i}/${issueCount - 1} ${timestamp}`,
        Description: `Task ${i} for progress tracking demo`,
        Parent: 'epic-1'
      });
    }
  } else {
    // Flat bulk - all tasks
    issues = Array.from({ length: issueCount }, (_, i) => ({
      Project: projectKey,
      'Issue Type': 'Task',
      Summary: `Progress Demo ${i + 1}/${issueCount} ${timestamp}`,
      Description: `Task ${i + 1} for progress tracking demo`
    }));
  }

  console.log('\n📋 Sample data:\n');
  if (demoType === 'hierarchy') {
    console.log('  1 Epic (parent)');
    console.log(`  ${issueCount - 1} Tasks (children, linked via Parent field)`);
  } else {
    console.log(`  ${issueCount} Tasks (flat, no hierarchy)`);
  }
  console.log('');

  // Show code example
  showCode('API call with progress tracking:',
    `const result = await jml.issues.create(issues, {\n  onProgress: (status) => {\n    console.log(\`\${status.completed}/\${status.total} completed\`);\n    console.log(\`Time since progress: \${status.timeSinceProgress}ms\`);\n  }\n});`
  );

  // Confirm before creating
  const shouldCreate = await confirm('\nCreate these issues in JIRA?', true);
  if (!shouldCreate) {
    info('Operation cancelled\n');
    return;
  }

  console.log('');

  // Initialize JML
  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    redis: config.redis,
  });

  // Track progress updates
  const progressUpdates = [];
  let progressBar = null;
  let lastCompleted = 0;

  try {
    const startTime = Date.now();

    // Create issues with progress tracking
    const result = await jml.issues.create(issues, {
      onProgress: (status) => {
        progressUpdates.push({
          ...status,
          timestamp: Date.now() - startTime
        });

        // Initialize progress bar on first update
        if (!progressBar) {
          progressBar = ora({
            text: `Creating issues: 0/${status.total}`,
            spinner: 'dots'
          }).start();
        }

        // Update progress bar
        const percentage = Math.round((status.completed / status.total) * 100);
        const bar = createProgressBar(status.completed, status.total, 30);

        progressBar.text = `${bar} ${status.completed}/${status.total} (${percentage}%) | ` +
                          `In progress: ${status.inProgress} | ` +
                          `Time since last: ${(status.timeSinceProgress / 1000).toFixed(1)}s`;

        // Show milestone updates
        if (status.completed > lastCompleted) {
          lastCompleted = status.completed;

          // Log significant milestones
          if (status.completed === Math.ceil(status.total * 0.25)) {
            console.log(`\n   ✓ 25% complete (${status.completed}/${status.total})`);
          } else if (status.completed === Math.ceil(status.total * 0.5)) {
            console.log(`\n   ✓ 50% complete (${status.completed}/${status.total})`);
          } else if (status.completed === Math.ceil(status.total * 0.75)) {
            console.log(`\n   ✓ 75% complete (${status.completed}/${status.total})`);
          }
        }
      }
    });

    if (progressBar) {
      progressBar.succeed(`Created ${result.succeeded}/${result.total} issues in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    }

    const duration = Date.now() - startTime;

    console.log('');
    success('✓ Bulk operation complete!\n');

    // Display results
    console.log('📊 Results:');
    console.log(`   Total:     ${result.total}`);
    console.log(`   Succeeded: ${result.succeeded}`);
    console.log(`   Failed:    ${result.failed}`);
    console.log(`   Duration:  ${(duration / 1000).toFixed(2)}s`);
    console.log(`   Throughput: ${(result.succeeded / (duration / 1000)).toFixed(2)} issues/sec`);
    console.log('');

    // Display progress tracking stats
    if (progressUpdates.length > 0) {
      console.log('📈 Progress Tracking Stats:');
      console.log(`   Updates received: ${progressUpdates.length}`);
      console.log(`   Polling frequency: ~${(duration / progressUpdates.length / 1000).toFixed(1)}s between updates`);

      const maxTimeSinceProgress = Math.max(...progressUpdates.map(u => u.timeSinceProgress));
      console.log(`   Max time between progress: ${(maxTimeSinceProgress / 1000).toFixed(1)}s`);
      console.log('');
    }

    // Show manifest
    console.log('💾 Manifest:');
    console.log(`   ID: ${result.manifest.id}`);
    console.log(`   Created: ${Object.keys(result.manifest.created).length} issues`);
    console.log(`   Errors: ${result.manifest.errors.length} issues`);
    console.log('');

    // Show created issue keys
    if (result.succeeded > 0) {
      const createdKeys = result.results
        .filter(r => r.success && r.key)
        .map(r => r.key)
        .slice(0, 10); // Show first 10

      console.log('✅ Created Issues:');
      createdKeys.forEach(key => {
        console.log(`   • ${key}`);
      });

      if (result.succeeded > 10) {
        console.log(`   ... and ${result.succeeded - 10} more`);
      }
      console.log('');
    }

    info('Progress tracking features demonstrated:');
    info('  ✓ Real-time progress callbacks fired during operation');
    info('  ✓ Progress bar visualization with live updates');
    info('  ✓ Time-since-progress monitoring (prevents false timeouts)');
    info('  ✓ Marker label injection and automatic cleanup');
    console.log('');

  } catch (err) {
    if (progressBar) {
      progressBar.fail('Operation failed');
    }
    error(`Error: ${err.message}`);
    console.log('');
  } finally {
    await jml.disconnect();
  }

  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(current, total, width = 30) {
  const percentage = current / total;
  const filled = Math.round(width * percentage);
  const empty = width - filled;

  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

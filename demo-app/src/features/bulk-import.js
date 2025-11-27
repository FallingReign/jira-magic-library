/**
 * Bulk Import Demo (E4-S04 + E4-S13)
 * 
 * Demonstrates the unified create() method:
 * - Parse CSV, JSON, or YAML data
 * - Create issues in bulk using jml.issues.create()
 * - Show manifest with success/failure tracking
 * - Demonstrate both single issue and bulk creation paths
 * - NEW (E4-S13): Hierarchy creation with UIDs and level-based batching
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { parseInput } from 'jira-magic-library';
import { showHeader, success, error, info, showCode, pause, warning } from '../ui/display.js';
import { confirm } from '../ui/prompts.js';
import { getExampleData, getHierarchyExampleData } from '../fixtures/test-data.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runBulkImportDemo(config) {
  showHeader('Bulk Import Demo (E4-S04 + E4-S13)');

  info('Parse CSV, JSON, or YAML data and create issues in bulk.');
  info('The unified create() method handles both single and bulk creation.\n');

  // Choose between flat bulk or hierarchy demo
  const { demoType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'demoType',
      message: 'Select demo type:',
      choices: [
        { name: '📥 Flat Bulk Import (no parent-child)', value: 'flat' },
        { name: '🏗️  Hierarchy Import with UIDs (E4-S13)', value: 'hierarchy' },
      ],
    },
  ]);

  if (demoType === 'hierarchy') {
    await runHierarchyBulkDemo(config);
    return;
  }

  // Original flat bulk import demo continues below...

  // Prompt user for project key with default from config
  const { projectKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectKey',
      message: 'Enter the JIRA project key to create issues in:',
      default: config.defaultProjectKey || config.projectKey || 'ZUL',
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
  
  // Get shared example data with reporter from config
  const EXAMPLES = getExampleData(projectKey, config.username);

  try {
    // Step 1: Select format
    const { format } = await inquirer.prompt([
      {
        type: 'list',
        name: 'format',
        message: 'Select input format:',
        choices: [
          { name: '📄 CSV (Comma-Separated Values)', value: 'csv' },
          { name: '📦 JSON (JavaScript Object Notation)', value: 'json' },
          { name: '📝 YAML (YAML Ain\'t Markup Language)', value: 'yaml' },
        ],
      },
    ]);

    // Step 2: Show example data
    console.log('\n📋 Example ' + format.toUpperCase() + ' data:\n');
    console.log('```' + format);
    console.log(EXAMPLES[format]);
    console.log('```\n');

    // Step 3: Choose data source
    const { dataSource } = await inquirer.prompt([
      {
        type: 'list',
        name: 'dataSource',
        message: 'Select data source:',
        choices: [
          { name: '✨ Use example data above', value: 'example' },
          { name: '📁 Provide file path', value: 'file' },
          { name: '✍️  Paste data manually', value: 'manual' },
        ],
      },
    ]);

    let parseResult;

    if (dataSource === 'example') {
      // Use example data
      info('\n✨ Using example data...\n');
      
      showCode('parseInput() call:',
        `const result = await jml.parseInput({\n  data: exampleData,\n  format: '${format}'\n});`
      );

      const parseSpinner = ora('Parsing data...').start();
      
      // Import parseInput from the library
      // Note: This assumes parseInput is exported from the library's public API
      const { parseInput } = await import('jira-magic-library');
      
      parseResult = await parseInput({ data: EXAMPLES[format], format });
      
      parseSpinner.succeed(`Parsed ${parseResult.data.length} issues from ${format.toUpperCase()}`);

    } else if (dataSource === 'file') {
      // Get file path from user
      const { filePath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'filePath',
          message: `Enter path to ${format.toUpperCase()} file:`,
          validate: (input) => {
            if (!input || input.trim().length === 0) {
              return 'File path is required';
            }
            return true;
          },
        },
      ]);

      showCode('parseInput() call:',
        `const result = await jml.parseInput({\n  from: '${filePath}'\n});\n// Format auto-detected from .${format} extension`
      );

      const parseSpinner = ora('Reading and parsing file...').start();
      
      try {
        const { parseInput } = await import('jira-magic-library');
        parseResult = await parseInput({ from: filePath });
        
        parseSpinner.succeed(`Parsed ${parseResult.data.length} issues from file`);
      } catch (err) {
        parseSpinner.fail('Parse failed');
        error(`\n❌ Error: ${err.message}`);
        
        if (err.name === 'FileNotFoundError') {
          warning('\n💡 Tip: Make sure the file path is correct and the file exists');
        } else if (err.name === 'InputParseError') {
          warning('\n💡 Tip: Check that your file has valid ' + format.toUpperCase() + ' syntax');
        }
        
        await pause();
        return;
      }

    } else {
      // Manual input
      const { manualData } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'manualData',
          message: `Paste your ${format.toUpperCase()} data (will open editor):`,
        },
      ]);

      showCode('parseInput() call:',
        `const result = await jml.parseInput({\n  data: userInput,\n  format: '${format}'\n});`
      );

      const parseSpinner = ora('Parsing data...').start();
      
      try {
        const { parseInput } = await import('jira-magic-library');
        parseResult = await parseInput({ data: manualData, format });
        
        parseSpinner.succeed(`Parsed ${parseResult.data.length} issues`);
      } catch (err) {
        parseSpinner.fail('Parse failed');
        error(`\n❌ Error: ${err.message}`);
        warning('\n💡 Tip: Check your ' + format.toUpperCase() + ' syntax');
        await pause();
        return;
      }
    }

    // Step 4: Show parsed results
    console.log('\n📊 Parsed Data:\n');
    
    parseResult.data.forEach((row, idx) => {
      console.log(`Row ${idx + 1}:`);
      Object.keys(row).forEach(key => {
        const value = row[key];
        const displayValue = Array.isArray(value) 
          ? `[${value.join(', ')}]` 
          : typeof value === 'object' 
            ? JSON.stringify(value) 
            : value;
        console.log(`  ${key}: ${displayValue}`);
      });
      console.log('');
    });

    success(`✅ Successfully parsed ${parseResult.data.length} row(s)`);
    info(`📍 Format: ${parseResult.format.toUpperCase()}`);
    info(`📍 Source: ${parseResult.source}\n`);

    // Step 5: Ask if user wants to create issues
    const { shouldCreate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldCreate',
        message: `Create ${parseResult.data.length} issue(s) in JIRA?`,
        default: false,
      },
    ]);

    if (!shouldCreate) {
      info('\n✋ Skipping issue creation. Demo complete.\n');
      await pause();
      return;
    }

    // Step 6: Create issues using unified create() method
    showCode('Unified create() call:',
      `const result = await jml.issues.create(parsedData);\n// Works with single object or array`
    );

    const createSpinner = ora('Creating issues in bulk...').start();
    
    try {
      // Import JML class and create instance
      const { JML } = await import('jira-magic-library');
      const jml = new JML({
        baseUrl: config.baseUrl,
        auth: { token: config.token },
        apiVersion: config.apiVersion || 'v2',
        redis: config.redis,
      });
      
      // Call unified create() - automatically detects bulk vs single
      const createResult = await jml.issues.create(parseResult.data);
      
      createSpinner.succeed(`Created ${createResult.succeeded}/${createResult.total} issues`);

      // Step 7: Show results
      console.log('\n� Creation Results:\n');
      
      success(`✅ Succeeded: ${createResult.succeeded}`);
      if (createResult.failed > 0) {
        error(`❌ Failed: ${createResult.failed}`);
      }
      info(`📊 Total: ${createResult.total}`);
      info(`📂 Manifest ID: ${createResult.manifest.id}\n`);

      // Show created issue keys
      if (createResult.succeeded > 0) {
        console.log('✅ Created Issues:');
        createResult.results.forEach((result, idx) => {
          if (result.success) {
            console.log(`  ${idx + 1}. ${result.key} - ${parseResult.data[idx].Summary}`);
          }
        });
        console.log('');
      }

      // Show failures if any
      if (createResult.failed > 0) {
        console.log('❌ Failed Issues:');
        createResult.results.forEach((result, idx) => {
          if (!result.success) {
            console.log(`  ${idx + 1}. ${parseResult.data[idx].Summary}`);
            if (result.error) {
              // Display validation errors or API errors properly
              const errorMsg = result.error.errors?.validation 
                || Object.values(result.error.errors || {}).join(', ')
                || JSON.stringify(result.error);
              console.log(`     Error: ${errorMsg}`);
            }
          }
        });
        console.log('');

        // E4-S05: Offer retry option
        const { shouldRetry } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldRetry',
            message: `\n🔧 Some issues failed. Would you like to fix errors and retry?`,
            default: true,
          },
        ]);

        if (shouldRetry) {
          await retryFailedIssues(jml, createResult, parseResult.data, config);
        }
      }

      // Show manifest details
      showCode('Manifest (for retry/resume):', JSON.stringify({
        id: createResult.manifest.id,
        timestamp: new Date(createResult.manifest.timestamp).toISOString(),
        total: createResult.manifest.total,
        succeeded: createResult.manifest.succeeded,
        failed: createResult.manifest.failed,
        created: Object.fromEntries(
          Object.entries(createResult.manifest.created).slice(0, 3)
        ),
        note: Object.keys(createResult.manifest.created).length > 3 
          ? `... and ${Object.keys(createResult.manifest.created).length - 3} more`
          : ''
      }, null, 2));

      // E4-S05: Generate JQL search link
      if (createResult.succeeded > 0) {
        const createdKeys = Object.values(createResult.manifest.created);
        const jqlQuery = `key in (${createdKeys.join(', ')})`;
        const jqlLink = `${config.baseUrl}/issues/?jql=${encodeURIComponent(jqlQuery)}`;
        
        info('\n🔍 View all created issues:');
        info(`   ${jqlLink}\n`);
      }

      info('\n💡 What just happened:');
      info('  • Parsed ' + format.toUpperCase() + ' data into normalized format');
      info('  • Called jml.issues.create() with array of objects');
      info('  • Library automatically used bulk API for efficiency');
      info('  • Manifest stored in Redis for retry/resume capability');
      info('  • Each issue tracked with success/failure status\n');

      success('✅ Bulk import demo complete!');

    } catch (err) {
      createSpinner.fail('Issue creation failed');
      error(`\n❌ Error: ${err.message}`);
      
      if (err.name === 'ConfigurationError') {
        warning('\n💡 Tip: Check your JIRA connection settings');
      } else if (err.name === 'AuthenticationError') {
        warning('\n💡 Tip: Verify your JIRA credentials and permissions');
      } else if (err.name === 'ValidationError') {
        warning('\n💡 Tip: Check that field names and values are valid for your project');
      }
      
      console.error(err);
    }

    await pause();

  } catch (err) {
    error(`\n❌ Error: ${err.message}`);
    console.error(err);
    await pause();
  }
}

/**
 * Retry failed issues with interactive editing (E4-S05)
 * 
 * @param {object} jml JML instance
 * @param {object} previousResult Previous creation result with manifest
 * @param {array} originalData Original parsed data
 * @param {object} config Configuration object with baseUrl
 */
async function retryFailedIssues(jml, previousResult, originalData, config) {
  info('\n🔧 Retry Failed Issues');
  info('═══════════════════════════════════════════════════════════\n');

  let currentResult = previousResult;
  let currentData = [...originalData]; // Clone to avoid mutating original
  let retryAttempt = 1;

  while (currentResult.failed > 0) {
    info(`\n📋 Retry Attempt #${retryAttempt}`);
    info(`   Failed rows: ${currentResult.failed}`);
    info(`   Manifest ID: ${currentResult.manifest.id}\n`);

    // Show each failed issue with error
    console.log('❌ Failed Issues:\n');
    currentResult.results.forEach((result, idx) => {
      if (!result.success) {
        console.log(`Row ${idx + 1}: ${currentData[idx].Summary || '(no summary)'}`);
        
        // Extract and display error message
        const errorDetail = result.error?.errors || result.error || 'Unknown error';
        let errorMsg = '';
        
        if (typeof errorDetail === 'string') {
          errorMsg = errorDetail;
        } else if (errorDetail.validation) {
          errorMsg = errorDetail.validation;
        } else if (typeof errorDetail === 'object') {
          // Extract field errors
          const fieldErrors = [];
          for (const [field, msg] of Object.entries(errorDetail)) {
            if (field !== 'status') {
              fieldErrors.push(`${field}: ${msg}`);
            }
          }
          errorMsg = fieldErrors.join(', ') || JSON.stringify(errorDetail);
        }
        
        console.log(`   Error: ${errorMsg}`);
        
        // Show current field values
        console.log('   Current values:');
        Object.entries(currentData[idx]).forEach(([key, value]) => {
          const displayValue = Array.isArray(value) ? `[${value.join(', ')}]` : value;
          console.log(`     ${key}: ${displayValue}`);
        });
        console.log('');
      }
    });

    // Ask if user wants to edit and retry
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '✏️  Edit failed rows and retry', value: 'edit' },
          { name: '❌ Cancel (keep partial results)', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'cancel') {
      warning('\n✋ Retry cancelled. Partial results preserved in manifest.\n');
      return;
    }

    // Edit each failed row interactively
    for (const [idx, result] of currentResult.results.entries()) {
      if (!result.success) {
        console.log(`\n📝 Editing Row ${idx + 1}: ${currentData[idx].Summary || '(no summary)'}\n`);

        // Get list of fields to edit
        const currentRow = currentData[idx];
        const fields = Object.keys(currentRow);

        // Prompt for which field to change
        const { fieldsToEdit } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'fieldsToEdit',
            message: 'Select fields to edit (space to select, enter to confirm):',
            choices: fields.map(field => ({
              name: `${field}: ${currentRow[field]}`,
              value: field,
              checked: false,
            })),
          },
        ]);

        if (fieldsToEdit.length === 0) {
          warning('  No fields selected, keeping current values');
          continue;
        }

        // Edit selected fields
        for (const field of fieldsToEdit) {
          const { newValue } = await inquirer.prompt([
            {
              type: 'input',
              name: 'newValue',
              message: `  ${field}:`,
              default: currentRow[field],
              validate: (input) => {
                if (!input || input.trim().length === 0) {
                  return 'Value cannot be empty (press Ctrl+C to skip this field)';
                }
                return true;
              },
            },
          ]);

          currentData[idx][field] = newValue.trim();
          success(`  ✓ Updated ${field} to: ${newValue.trim()}`);
        }

        console.log('');
      }
    }

    // Show updated data summary
    console.log('\n📊 Updated Data (failed rows only):\n');
    currentResult.results.forEach((result, idx) => {
      if (!result.success) {
        console.log(`Row ${idx + 1}:`);
        Object.entries(currentData[idx]).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
        console.log('');
      }
    });

    // Retry with manifest ID
    showCode('Retry with manifest:',
      `const retryResult = await jml.issues.create(updatedData, {\n  retry: '${currentResult.manifest.id}'\n});\n// Same manifest ID, accumulated results`
    );

    const retrySpinner = ora('Retrying failed issues...').start();
    
    try {
      // Call create() with retry option and same manifest ID
      currentResult = await jml.issues.create(currentData, {
        retry: currentResult.manifest.id
      });
      
      retrySpinner.succeed(`Retry complete: ${currentResult.succeeded}/${currentResult.total} succeeded`);

      // Show retry results
      console.log('\n📊 Retry Results:\n');
      success(`✅ Total Succeeded: ${currentResult.succeeded} (${currentResult.succeeded - previousResult.succeeded} new)`);
      
      if (currentResult.failed > 0) {
        error(`❌ Still Failed: ${currentResult.failed}`);
      } else {
        success('🎉 All issues created successfully!');
      }
      
      info(`📂 Manifest ID: ${currentResult.manifest.id} (same manifest)\n`);

      // Show newly created issues
      if (currentResult.succeeded > previousResult.succeeded) {
        console.log('✅ Newly Created Issues:');
        currentResult.results.forEach((result, idx) => {
          if (result.success && !previousResult.results[idx]?.success) {
            console.log(`  ${idx + 1}. ${result.key} - ${currentData[idx].Summary}`);
          }
        });
        console.log('');
      }

      // Update for next iteration
      retryAttempt++;

      if (currentResult.failed === 0) {
        // All succeeded, show final summary and JQL link
        success('\n🎉 Success! All issues created.\n');
        
        const allCreatedKeys = Object.values(currentResult.manifest.created);
        const jqlQuery = `key in (${allCreatedKeys.join(', ')})`;
        const jqlLink = `${config.baseUrl}/issues/?jql=${encodeURIComponent(jqlQuery)}`;
        
        info('🔍 View all created issues:');
        info(`   ${jqlLink}\n`);
        
        showCode('Final Manifest:', JSON.stringify({
          id: currentResult.manifest.id,
          total: currentResult.manifest.total,
          succeeded: currentResult.manifest.succeeded.length,
          failed: currentResult.manifest.failed.length,
          retryAttempts: retryAttempt - 1,
        }, null, 2));
        
        break;
      }

    } catch (err) {
      retrySpinner.fail('Retry failed');
      error(`\n❌ Retry Error: ${err.message}\n`);
      
      const { continueRetry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueRetry',
          message: 'Error occurred. Try again?',
          default: false,
        },
      ]);

      if (!continueRetry) {
        warning('Retry cancelled.');
        break;
      }
    }
  }
}

/**
 * Hierarchy Bulk Import Demo (E4-S13)
 * 
 * Demonstrates level-based batching for parent-child hierarchies:
 * - Use uid field for temporary identifiers
 * - Parent field references UIDs (not JIRA keys)
 * - Library creates parents first, then children
 * - All issues created in 2-3 API calls (not N sequential calls)
 * 
 * @param {object} config Configuration with baseUrl, token, etc.
 */
async function runHierarchyBulkDemo(config) {
  console.log('\n');
  info('🏗️  Hierarchy Bulk Import (E4-S13)\n');
  info('Create parent-child hierarchies in bulk using temporary UIDs.');
  info('The library automatically:');
  info('  • Groups issues by hierarchy level (Epic → Task → Sub-task)');
  info('  • Creates parents first, then children');
  info('  • Replaces UID references with real JIRA keys');
  info('  • Uses level-based batching (2-3 API calls, not N sequential)\n');

  // Prompt user for project key
  const { projectKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectKey',
      message: 'Enter the JIRA project key:',
      default: config.defaultProjectKey || config.projectKey || 'ZUL',
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

  // Get hierarchy example data
  const HIERARCHY_EXAMPLES = getHierarchyExampleData(projectKey);

  // Step 1: Select format
  const { format } = await inquirer.prompt([
    {
      type: 'list',
      name: 'format',
      message: 'Select input format:',
      choices: [
        { name: '📄 CSV (Comma-Separated Values)', value: 'csv' },
        { name: '📦 JSON (JavaScript Object Notation)', value: 'json' },
        { name: '📝 YAML (YAML Ain\'t Markup Language)', value: 'yaml' },
      ],
    },
  ]);

  // Step 2: Show example hierarchy data
  console.log('\n📋 Example ' + format.toUpperCase() + ' data with UIDs:\n');
  console.log('```' + format);
  console.log(HIERARCHY_EXAMPLES[format]);
  console.log('```\n');

  info('📍 Key fields:');
  info('  • uid: Temporary identifier (e.g., "epic-1", "task-1")');
  info('  • Parent: UID reference to parent issue (not JIRA key)\n');

  // Step 3: Parse the example data
  showCode('parseInput() call:',
    `const result = await jml.parseInput({\n  data: hierarchyData,\n  format: '${format}'\n});`
  );

  const parseSpinner = ora('Parsing hierarchy data...').start();
  
  const { parseInput } = await import('jira-magic-library');
  const parseResult = await parseInput({ data: HIERARCHY_EXAMPLES[format], format });
  
  parseSpinner.succeed(`Parsed ${parseResult.data.length} issues with hierarchy`);

  // Step 4: Show parsed structure
  console.log('\n📊 Parsed Hierarchy Structure:\n');
  
  // Group by level for display
  const epics = parseResult.data.filter(r => !r.Parent);
  const children = parseResult.data.filter(r => r.Parent);
  
  epics.forEach(epic => {
    console.log(`📦 ${epic.uid}: ${epic['Issue Type']} - "${epic.Summary}"`);
    
    const directChildren = children.filter(c => c.Parent === epic.uid);
    directChildren.forEach(child => {
      console.log(`   └── ${child.uid}: ${child['Issue Type']} - "${child.Summary}"`);
      
      const grandchildren = children.filter(gc => gc.Parent === child.uid);
      grandchildren.forEach(gc => {
        console.log(`       └── ${gc.uid}: ${gc['Issue Type']} - "${gc.Summary}"`);
      });
    });
  });
  console.log('');

  info('🔄 Level-based batching will create:');
  info('   Level 0: Epics (no parents) - 1 API call');
  info('   Level 1: Tasks (parent = epic-1) - 1 API call');
  info('   Level 2: Sub-tasks (parent = task-1) - 1 API call');
  info('   Total: 3 API calls for 5 issues (not 5 sequential calls)\n');

  // Step 5: Ask if user wants to create
  warning('⚠️  This will create real issues in your JIRA instance!\n');
  
  const { shouldCreate } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldCreate',
      message: `Create ${parseResult.data.length} hierarchical issues in JIRA?`,
      default: false,
    },
  ]);

  if (!shouldCreate) {
    info('\n✋ Skipping issue creation. Demo complete.\n');
    
    // Show code example anyway
    showCode('How it would work:',
      `// Your hierarchy data with UIDs
const data = [
  { uid: 'epic-1', Project: '${projectKey}', 'Issue Type': 'Epic', Summary: 'My Epic' },
  { uid: 'task-1', Project: '${projectKey}', 'Issue Type': 'Task', Summary: 'My Task', Parent: 'epic-1' },
  { uid: 'subtask-1', Project: '${projectKey}', 'Issue Type': 'Sub-task', Summary: 'My Subtask', Parent: 'task-1' },
];

// Just call create() - library handles everything!
const result = await jml.issues.create(data);

// Result includes:
// - result.succeeded / result.failed counts
// - result.results[] with success/failure per issue
// - result.manifest.uidMap mapping UIDs to JIRA keys:
//   { 'epic-1': 'PROJ-100', 'task-1': 'PROJ-101', 'subtask-1': 'PROJ-102' }`
    );
    
    await pause();
    return;
  }

  // Step 6: Create hierarchy using unified create()
  showCode('Unified create() with hierarchy:',
    `const result = await jml.issues.create(parsedData);
// Library auto-detects UIDs and uses level-based batching`
  );

  const createSpinner = ora('Creating hierarchy (level-based batching)...').start();
  
  try {
    const { JML } = await import('jira-magic-library');
    const jml = new JML({
      baseUrl: config.baseUrl,
      auth: { token: config.token },
      apiVersion: config.apiVersion || 'v2',
      redis: config.redis,
    });
    
    const startTime = Date.now();
    const createResult = await jml.issues.create(parseResult.data);
    const duration = Date.now() - startTime;
    
    createSpinner.succeed(`Created ${createResult.succeeded}/${createResult.total} issues in ${duration}ms`);

    // Step 7: Show results
    console.log('\n📊 Creation Results:\n');
    
    success(`✅ Succeeded: ${createResult.succeeded}`);
    if (createResult.failed > 0) {
      error(`❌ Failed: ${createResult.failed}`);
    }
    info(`📊 Total: ${createResult.total}`);
    info(`⏱️  Duration: ${duration}ms`);
    info(`📂 Manifest ID: ${createResult.manifest.id}\n`);

    // Show UID → Key mappings
    if (createResult.manifest.uidMap && Object.keys(createResult.manifest.uidMap).length > 0) {
      console.log('🔗 UID → JIRA Key Mappings:\n');
      for (const [uid, key] of Object.entries(createResult.manifest.uidMap)) {
        console.log(`   ${uid} → ${key}`);
      }
      console.log('');
    }

    // Show created hierarchy
    if (createResult.succeeded > 0) {
      console.log('✅ Created Hierarchy:\n');
      
      // Rebuild hierarchy display with real keys
      const uidMap = createResult.manifest.uidMap || {};
      const resultsMap = new Map(createResult.results.map((r, i) => [i, r]));
      
      parseResult.data.forEach((record, idx) => {
        const result = resultsMap.get(idx);
        if (result?.success) {
          const indent = record.Parent ? (children.find(c => c.uid === record.Parent)?.Parent ? '       ' : '   ') : '';
          const prefix = record.Parent ? '└── ' : '';
          console.log(`${indent}${prefix}${result.key}: ${record['Issue Type']} - "${record.Summary}"`);
        }
      });
      console.log('');
    }

    // Show failures if any
    if (createResult.failed > 0) {
      console.log('❌ Failed Issues:\n');
      createResult.results.forEach((result, idx) => {
        if (!result.success) {
          const record = parseResult.data[idx];
          console.log(`  ${record.uid || idx + 1}. ${record.Summary}`);
          if (result.error) {
            const errorMsg = result.error.errors?.validation 
              || Object.values(result.error.errors || {}).join(', ')
              || JSON.stringify(result.error);
            console.log(`     Error: ${errorMsg}`);
          }
        }
      });
      console.log('');
    }

    // Show manifest with uidMap
    showCode('Manifest with UID mappings:', JSON.stringify({
      id: createResult.manifest.id,
      total: createResult.manifest.total,
      succeeded: createResult.manifest.succeeded,
      failed: createResult.manifest.failed,
      uidMap: createResult.manifest.uidMap || {},
      note: 'uidMap enables retry with partial hierarchy - failed children can find their parents'
    }, null, 2));

    // Generate JQL link
    if (createResult.succeeded > 0) {
      const createdKeys = Object.values(createResult.manifest.created || {});
      if (createdKeys.length > 0) {
        const jqlQuery = `key in (${createdKeys.join(', ')})`;
        const jqlLink = `${config.baseUrl}/issues/?jql=${encodeURIComponent(jqlQuery)}`;
        
        info('\n🔍 View all created issues:');
        info(`   ${jqlLink}\n`);
      }
    }

    info('\n💡 What just happened:');
    info('  • Library detected uid fields and Parent UID references');
    info('  • Grouped issues by hierarchy level using BFS algorithm');
    info('  • Created Level 0 (Epics) first → Got real JIRA keys');
    info('  • Replaced UID references with real keys → Created Level 1 (Tasks)');
    info('  • Repeated for Level 2 (Sub-tasks)');
    info('  • Total: 3 API calls instead of 5 sequential calls');
    info('  • Manifest includes uidMap for retry/resume capability\n');

    success('✅ Hierarchy bulk import demo complete!');

  } catch (err) {
    createSpinner.fail('Hierarchy creation failed');
    error(`\n❌ Error: ${err.message}`);
    
    if (err.name === 'ValidationError' && err.message.includes('Circular')) {
      warning('\n💡 Tip: Check for circular parent references (A → B → C → A)');
    } else if (err.name === 'ConfigurationError') {
      warning('\n💡 Tip: Check your JIRA connection settings');
    } else if (err.name === 'AuthenticationError') {
      warning('\n💡 Tip: Verify your JIRA credentials and permissions');
    }
    
    console.error(err);
  }

  await pause();
}

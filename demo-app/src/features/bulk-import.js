/**
 * Bulk Import Demo (E4-S04)
 * 
 * Demonstrates the unified create() method:
 * - Parse CSV, JSON, or YAML data
 * - Create issues in bulk using jml.issues.create()
 * - Show manifest with success/failure tracking
 * - Demonstrate both single issue and bulk creation paths
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { parseInput } from 'jira-magic-library';
import { showHeader, success, error, info, showCode, pause, warning } from '../ui/display.js';
import { confirm } from '../ui/prompts.js';
import { getExampleData } from '../fixtures/test-data.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runBulkImportDemo(config) {
  showHeader('Bulk Import Demo (E4-S04)');

  info('Parse CSV, JSON, or YAML data and create issues in bulk.');
  info('The unified create() method handles both single and bulk creation.\n');

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

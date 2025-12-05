/**
 * Schema Validation Demo (E4-S07)
 * 
 * Demonstrates schema-only validation WITHOUT creating issues:
 * - Validate CSV, JSON, or YAML data against JIRA schema
 * - Check required fields, data types, and enum values
 * - No API calls during validation (fast, schema-only)
 * - Uses same test data as bulk-import demo
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { showHeader, success, error, info, showCode, pause } from '../ui/display.js';
import { getExampleData } from '../fixtures/test-data.js';

export async function runSchemaValidationDemo(config) {
  showHeader('Schema Validation Demo (E4-S07)');

  info('Validate issue data against JIRA schema WITHOUT creating issues.');
  info('Fast, schema-only validation - no API lookups or conversions.\n');

  // Prompt user for project key
  const { projectKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectKey',
      message: 'Enter the JIRA project key:',
      default: config.defaultProjectKey || config.projectKey || 'PROJ',
    },
  ]);

  const EXAMPLES = getExampleData(projectKey);

  // Step 1: Select format
  const { format } = await inquirer.prompt([
    {
      type: 'list',
      name: 'format',
      message: 'Select input format to validate:',
      choices: [
        { name: '📄 CSV (Comma-Separated Values)', value: 'csv' },
        { name: '📦 JSON (JavaScript Object Notation)', value: 'json' },
        { name: '📝 YAML (YAML Ain\'t Markup Language)', value: 'yaml' },
      ],
    },
  ]);

  // Step 2: Show data
  console.log('\n📋 Example ' + format.toUpperCase() + ' data:\n');
  console.log('```' + format);
  console.log(EXAMPLES[format]);
  console.log('```\n');

  // Step 3: Choose validation demo
  const { demo } = await inquirer.prompt([
    {
      type: 'list',
      name: 'demo',
      message: 'Choose a validation demo:',
      choices: [
        { name: '✅ Valid Data - All checks pass', value: 'valid-data' },
        { name: '❌ Missing Required - Detect missing Summary', value: 'missing-required' },
        { name: '❌ Type Errors - Detect wrong types', value: 'type-errors' },
        { name: '❌ Invalid Enum - Detect invalid Priority', value: 'enum-errors' },
        { name: '🚀 Performance - Validate 100 rows', value: 'performance' },
      ],
    },
  ]);

  // Initialize JML
  const { JML } = await import('jira-magic-library');
  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis,
  });

  try {
    // Run selected demo
    switch (demo) {
      case 'valid-data':
        await demoValidData(jml, format, EXAMPLES[format]);
        break;
      case 'missing-required':
        await demoMissingRequired(jml, projectKey);
        break;
      case 'type-errors':
        await demoTypeErrors(jml, projectKey);
        break;
      case 'enum-errors':
        await demoEnumErrors(jml, projectKey);
        break;
      case 'performance':
        await demoPerformance(jml, projectKey);
        break;
    }
  } catch (err) {
    error('\n❌ Demo Error:\n');
    if (err.code === 'NOT_FOUND_ERROR' && err.details?.issueTypeName) {
      error(`Issue type '${err.details.issueTypeName}' not found in project '${err.details.projectKey}'.\n`);
      info('Available issue types:');
      err.details.availableTypes?.forEach(type => console.log(`  - ${type}`));
      info('\nUpdate test-data.js to use valid issue types for your project.');
    } else {
      console.log(err.message);
      if (err.details) {
        showCode('Details:', JSON.stringify(err.details, null, 2));
      }
    }
  } finally {
    await jml.disconnect();
  }

  await pause();
}

/**
 * Demo 1: Valid data - all checks pass
 */
async function demoValidData(jml, format, exampleData) {
  info('\n📋 Demo: Valid Data\n');

  const spinner = ora('Validating...').start();
  const startTime = Date.now();
  
  let result;
  try {
    result = await jml.validate({ data: exampleData, format });
    spinner.stop();
  } catch (err) {
    spinner.fail('Validation failed');
    throw err;
  }
  const duration = Date.now() - startTime;

  if (result.valid) {
    success(`\n✅ Validation Passed! (${duration}ms)\n`);
  } else {
    error(`\n❌ Validation Failed (${duration}ms)\n`);
    result.errors.forEach(err => {
      console.log(`Row ${err.rowIndex + 1}: ${err.field} - ${err.message}`);
    });
  }

  // Show warnings if present
  if (result.warnings && result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:\n');
    result.warnings.forEach(warn => {
      console.log(`Row ${warn.rowIndex + 1}: ${warn.field} - ${warn.message}`);
    });
  }

  showCode('Result:', JSON.stringify(result, null, 2));
}

/**
 * Demo 2: Missing required fields
 */
async function demoMissingRequired(jml, projectKey) {
  info('\n📋 Demo: Missing Required Fields\n');

  const testData = [
    {
      Project: projectKey,
      'Issue Type': 'Task',
      // Missing Summary - REQUIRED!
      Description: 'This will fail validation',
      Reporter: 'currentUser()'
    },
    {
      Project: projectKey,
      'Issue Type': 'Task',
      Summary: 'This one is valid',
      Reporter: 'currentUser()'
    },
    {
      Project: projectKey,
      'Issue Type': 'Task',
      Summary: '',  // Empty string - also invalid!
      Reporter: 'currentUser()'
    }
  ];

  showCode('Test Data:', JSON.stringify(testData, null, 2));

  const spinner = ora('Validating...').start();
  const startTime = Date.now();
  
  let result;
  try {
    result = await jml.validate({ data: testData });
    spinner.stop();
  } catch (err) {
    spinner.fail('Validation failed');
    throw err;
  }
  const duration = Date.now() - startTime;

  if (!result.valid) {
    error(`\n❌ Validation Failed (${duration}ms)\n`);
    result.errors.forEach(err => {
      console.log(`Row ${err.rowIndex + 1}: ${err.field} - ${err.message}`);
    });
  }

  showCode('Result:', JSON.stringify(result, null, 2));
}

/**
 * Demo 3: Type errors
 */
async function demoTypeErrors(jml, projectKey) {
  info('\n📋 Demo: Type Errors\n');

  const testData = [
    {
      Project: projectKey,
      'Issue Type': 'Task',
      Summary: 12345,  // Should be string!
      Reporter: 'currentUser()',
      Labels: 'single-label'  // Should be array!
    },
    {
      Project: projectKey,
      'Issue Type': 'Task',
      Summary: 'Valid summary',
      Reporter: 'currentUser()',
      Priority: 123  // Should be string!
    }
  ];

  showCode('Test Data:', JSON.stringify(testData, null, 2));

  const spinner = ora('Validating...').start();
  const startTime = Date.now();
  
  let result;
  try {
    result = await jml.validate({ data: testData });
    spinner.stop();
  } catch (err) {
    spinner.fail('Validation failed');
    throw err;
  }
  const duration = Date.now() - startTime;

  if (!result.valid) {
    error(`\n❌ Validation Failed (${duration}ms)\n`);
    result.errors.forEach(err => {
      console.log(`Row ${err.rowIndex + 1}: ${err.field} - ${err.message}`);
    });
  }

  showCode('Result:', JSON.stringify(result, null, 2));
}

/**
 * Demo 4: Invalid enum values
 */
async function demoEnumErrors(jml, projectKey) {
  info('\n📋 Demo: Invalid Enum Values\n');

  const testData = [
    {
      Project: projectKey,
      'Issue Type': 'Task',
      Summary: 'Test issue',
      Reporter: 'currentUser()',
      Priority: 'SUPER_CRITICAL'  // Invalid priority!
    },
    {
      Project: projectKey,
      'Issue Type': 'InvalidType',  // Invalid issue type!
      Summary: 'Another test',
      Reporter: 'currentUser()'
    }
  ];

  showCode('Test Data:', JSON.stringify(testData, null, 2));

  const spinner = ora('Validating...').start();
  const startTime = Date.now();
  
  let result;
  try {
    result = await jml.validate({ data: testData });
    spinner.stop();
  } catch (err) {
    spinner.fail('Validation failed');
    throw err;
  }
  const duration = Date.now() - startTime;

  if (!result.valid) {
    error(`\n❌ Validation Failed (${duration}ms)\n`);
    result.errors.forEach(err => {
      console.log(`Row ${err.rowIndex + 1}: ${err.field} - ${err.message}`);
    });
  }

  showCode('Result:', JSON.stringify(result, null, 2));
}

/**
 * Demo 5: Performance test
 */
async function demoPerformance(jml, projectKey) {
  info('\n📋 Demo: Performance Test (100 rows)\n');

  // Generate 100 rows of valid data
  const testData = Array.from({ length: 100 }, (_, i) => ({
    Project: projectKey,
    'Issue Type': 'Task',
    Summary: `Performance test issue ${i + 1}`,
    Description: `This is test issue number ${i + 1}`,
    Reporter: 'currentUser()',
    Priority: 'P3 - Medium'
  }));

  info(`Generated ${testData.length} rows for performance testing.\n`);

  const spinner = ora('Validating...').start();
  const startTime = Date.now();
  
  let result;
  try {
    result = await jml.validate({ data: testData });
    spinner.stop();
  } catch (err) {
    spinner.fail('Validation failed');
    throw err;
  }
  const duration = Date.now() - startTime;

  if (result.valid) {
    success(`\n✅ Validation Passed! (${duration}ms)\n`);
    if (duration < 100) {
      success(`🚀 Performance target met! (< 100ms)\n`);
    } else {
      info(`⚠️  Performance target missed (expected < 100ms)\n`);
    }
  } else {
    error(`\n❌ Validation Failed (${duration}ms)\n`);
    result.errors.forEach(err => {
      console.log(`Row ${err.rowIndex + 1}: ${err.field} - ${err.message}`);
    });
  }

  showCode('Result Summary:', JSON.stringify({
    valid: result.valid,
    rowCount: testData.length,
    errorCount: result.errors.length,
    duration: `${duration}ms`
  }, null, 2));
}

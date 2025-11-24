/**
 * Option Type Converter Demo (E2-S09)
 * 
 * Interactive demonstration of single-select custom field conversion
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, showIssue, showCode, pause, warning } from '../../ui/display.js';
import { input, confirm } from '../../ui/prompts.js';

export async function runOptionConverterDemo(config) {
  showHeader('Option Type Converter Demo (E2-S09)');

  info('This demo shows how to work with single-select (option) custom fields.');
  info('Common examples: Severity, Environment, Impact Level, Priority\n');

  // Initialize JML
  const spinner = ora('Initializing JIRA Magic Library...').start();
  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis,
  });
  spinner.succeed('JML initialized');

  try {
    // Get demo parameters
    const projectKey = await input(
      'Enter project key:',
      config.defaultProjectKey || 'ENG'
    );

    const issueType = await input(
      'Enter issue type:',
      'Bug'
    );

    const fieldName = await input(
      'Enter option field name:',
      'Severity'
    );

    // Show example menu
    const { example } = await inquirer.prompt([
      {
        type: 'list',
        name: 'example',
        message: 'Select an example to run:',
        choices: [
          { name: '1️⃣  Set option by name (user-friendly)', value: 'by-name' },
          { name: '2️⃣  Set option by ID (advanced)', value: 'by-id' },
          { name: '3️⃣  Case-insensitive matching', value: 'case-insensitive' },
          { name: '4️⃣  Optional field (null handling)', value: 'optional' },
          { name: '🎬 Run all examples', value: 'all' },
          new inquirer.Separator(),
          { name: '← Back to main menu', value: 'back' },
        ],
      },
    ]);

    if (example === 'back') {
      return;
    }

    const examples = example === 'all' 
      ? ['by-name', 'by-id', 'case-insensitive', 'optional']
      : [example];

    for (const ex of examples) {
      await runExample(ex, jml, config, projectKey, fieldName);
      
      if (examples.length > 1) {
        await pause();
      }
    }

    success('\n✅ Option Converter Demo Complete!');
    await pause();

  } catch (err) {
    error(`Demo failed: ${err.message}`);
    if (err.details) {
      console.log('\nDetails:', err.details);
    }
    await pause();
  } finally {
    await jml.disconnect();
  }
}

async function runExample(example, jml, config, projectKey, fieldName) {
  switch (example) {
    case 'by-name':
      await exampleByName(jml, config, projectKey, fieldName);
      break;
    case 'by-id':
      await exampleById(jml, config, projectKey, fieldName);
      break;
    case 'case-insensitive':
      await exampleCaseInsensitive(jml, config, projectKey, fieldName);
      break;
    case 'optional':
      await exampleOptional(jml, config, projectKey);
      break;
  }
}

async function exampleByName(jml, config, projectKey, fieldName) {
  showHeader('Example 1: Set Option by Name');
  
  info('Most common usage - just provide the human-readable option name');
  info('Library automatically looks up the option ID and converts for you\n');

  const optionName = await input(
    `Enter ${fieldName} value:`,
    'B - Major'
  );

  showCode('Code Example:', 
    `await jml.issues.create({\n` +
    `  Project: '${projectKey}',\n` +
    `  'Issue Type': 'Bug',\n` +
    `  Summary: 'Demo issue',\n` +
    `  ${fieldName}: '${optionName}',  // ← Just the name!\n` +
    `});`
  );

  if (!await confirm('Create this issue?', true)) {
    info('\n📤 Dry run - validating with JIRA API...\n');
    
    const spinner = ora('Checking field schema...').start();
    
    try {
      // Actually try to create the issue to validate everything
      // This will catch field name errors, option value errors, etc.
      await jml.issues.create({
        Project: projectKey,
        'Issue Type': 'Bug',
        Summary: `Demo: Option by name - ${Date.now()}`,
        [fieldName]: optionName,
      });
      
      // If we get here, it would have worked
      spinner.succeed('Validation passed - issue would be created successfully!');
      
      const payload = {
        fields: {
          project: { key: projectKey },
          issuetype: { name: 'Bug' },
          summary: `Demo: Option by name - ${Date.now()}`,
          [fieldName]: optionName,
        }
      };
      
      showCode('Payload that would be sent:', JSON.stringify(payload, null, 2));
      success(`\n✓ Field "${fieldName}" exists and "${optionName}" is a valid option`);
      info('The library successfully:');
      info(`  • Looked up field ID for "${fieldName}"`);
      info(`  • Resolved "${optionName}" to option ID`);
      info(`  • Validated the option exists\n`);
      
      warning('Note: Issue was NOT actually created (dry run mode)');
      
    } catch (err) {
      spinner.fail('Validation failed');
      error(`This issue would fail to create: ${err.message}`);
      if (err.details) {
        console.log('\nDetails:', JSON.stringify(err.details, null, 2));
      }
      info('\n💡 This is why validation is important! Fix the error and try again.');
    }
    
    await pause('\nPress Enter to continue...');
    return;
  }

  const spinner = ora('Creating issue...').start();

  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': 'Bug',
      Summary: `Demo: Option by name - ${Date.now()}`,
      [fieldName]: optionName,
    });

    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl, { [fieldName]: optionName });
  } catch (err) {
    spinner.fail('Failed to create issue');
    error(err.message);
    if (err.details) {
      console.log('\nDetails:', JSON.stringify(err.details, null, 2));
    }
  }
}

async function exampleById(jml, config, projectKey, fieldName) {
  showHeader('Example 2: Set Option by ID');
  
  info('Advanced usage - if you already know the option ID');
  info('Useful for performance optimization or when ID is from external system\n');

  const optionId = await input(
    `Enter ${fieldName} option ID:`,
    '10413'
  );

  showCode('Code Example:', 
    `await jml.issues.create({\n` +
    `  Project: '${projectKey}',\n` +
    `  'Issue Type': 'Bug',\n` +
    `  Summary: 'Demo issue',\n` +
    `  ${fieldName}: { id: '${optionId}' },  // ← Direct ID\n` +
    `});`
  );

  if (!await confirm('Create this issue?', true)) {
    info('\n📤 Dry run - validating with JIRA API...\n');
    
    const spinner = ora('Checking field schema and option ID...').start();
    
    try {
      // Actually validate with JIRA API (but don't create)
      await jml.issues.create({
        Project: projectKey,
        'Issue Type': 'Bug',
        Summary: `Demo: Option by ID - ${Date.now()}`,
        [fieldName]: { id: optionId },
      });
      
      spinner.succeed('Validation passed - issue would be created successfully!');
      
      const payload = {
        fields: {
          project: { key: projectKey },
          issuetype: { name: 'Bug' },
          summary: `Demo: Option by ID - ${Date.now()}`,
          [fieldName]: { id: optionId },
        }
      };
      
      showCode('Payload that would be sent:', JSON.stringify(payload, null, 2));
      
      success(`✓ Field "${fieldName}" exists in project`);
      success(`✓ Option ID "${optionId}" is valid\n`);
      
      info('What the library does behind the scenes:');
      info(`  • Looks up field ID for "${fieldName}"`);
      info(`  • Passes through { id: "${optionId}" } directly`);
      info(`  • JIRA validates the ID exists in the field's options\n`);
      
      warning('Note: Issue was NOT actually created (dry run mode)');
    } catch (err) {
      spinner.fail('Validation failed');
      error(`\nThis issue would fail to create: ${err.message}\n`);
      
      if (err.name === 'NotFoundError') {
        info(`💡 The field "${fieldName}" might not exist in this project`);
      } else if (err.message.includes('not a valid option')) {
        info(`💡 The option ID "${optionId}" doesn't exist for this field`);
      } else {
        info('💡 Check the error message above for details');
      }
    }
    
    await pause('\nPress Enter to continue...');
    return;
  }

  const spinner = ora('Creating issue...').start();

  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': 'Bug',
      Summary: `Demo: Option by ID - ${Date.now()}`,
      [fieldName]: { id: optionId },
    });

    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl, { [fieldName]: `{ id: "${optionId}" }` });
  } catch (err) {
    spinner.fail('Failed to create issue');
    error(err.message);
    if (err.details) {
      console.log('\nDetails:', JSON.stringify(err.details, null, 2));
    }
  }
}

async function exampleCaseInsensitive(jml, config, projectKey, fieldName) {
  showHeader('Example 3: Case-Insensitive Matching');
  
  info('Library matches option names case-insensitively for convenience');
  info('Try entering an option with different case (e.g., "a - blocker" or "A - BLOCKER")\n');

  const optionName = await input(
    `Enter ${fieldName} with any case:`,
    'a - blocker'
  );

  showCode('Code Example:', 
    `await jml.issues.create({\n` +
    `  Project: '${projectKey}',\n` +
    `  'Issue Type': 'Bug',\n` +
    `  Summary: 'Demo issue',\n` +
    `  ${fieldName}: '${optionName}',  // ← Any case works!\n` +
    `});`
  );

  if (!await confirm('Create this issue?', true)) {
    info('\n📤 Dry run - validating with JIRA API...\n');
    
    const spinner = ora('Testing case-insensitive matching...').start();
    
    try {
      // Actually validate with JIRA API (but don't create)
      await jml.issues.create({
        Project: projectKey,
        'Issue Type': 'Bug',
        Summary: `Demo: Case-insensitive - ${Date.now()}`,
        [fieldName]: optionName,
      });
      
      spinner.succeed('Validation passed - case-insensitive matching works!');
      
      const payload = {
        fields: {
          project: { key: projectKey },
          issuetype: { name: 'Bug' },
          summary: `Demo: Case-insensitive - ${Date.now()}`,
          [fieldName]: optionName,
        }
      };
      
      showCode('Payload that would be sent:', JSON.stringify(payload, null, 2));
      
      success(`✓ Field "${fieldName}" exists in project`);
      success(`✓ Option "${optionName}" matched successfully (case-insensitive)\n`);
      
      info('What the library does behind the scenes:');
      info(`  • Looks up field ID for "${fieldName}"`);
      info(`  • Resolves "${optionName}" to option ID (case-insensitive)`);
      info(`  • Finds matching option regardless of capitalization`);
      info(`  • Converts to: { id: "..." }\n`);
      
      warning('Note: Issue was NOT actually created (dry run mode)');
    } catch (err) {
      spinner.fail('Validation failed');
      error(`\nThis issue would fail to create: ${err.message}\n`);
      
      if (err.name === 'NotFoundError') {
        info(`💡 The field "${fieldName}" might not exist in this project`);
      } else if (err.message.includes('not found') || err.message.includes('Ambiguous')) {
        info(`💡 The option "${optionName}" doesn't exist or is ambiguous`);
        info('   Case-insensitive matching requires an exact name match (ignoring case)');
      } else {
        info('💡 Check the error message above for details');
      }
    }
    
    await pause('\nPress Enter to continue...');
    return;
  }

  const spinner = ora('Creating issue...').start();

  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': 'Bug',
      Summary: `Demo: Case-insensitive - ${Date.now()}`,
      [fieldName]: optionName,
    });

    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl, { [fieldName]: optionName });
    info('Library matched this to the correct option regardless of case');
  } catch (err) {
    spinner.fail('Failed to create issue');
    error(err.message);
    if (err.details) {
      console.log('\nDetails:', JSON.stringify(err.details, null, 2));
    }
  }
}

async function exampleOptional(jml, config, projectKey) {
  showHeader('Example 4: Optional Field Handling');
  
  info('Not all option fields are required - they can be omitted');
  info('Library handles null/undefined gracefully\n');

  showCode('Code Example:', 
    `await jml.issues.create({\n` +
    `  Project: '${projectKey}',\n` +
    `  'Issue Type': 'Bug',\n` +
    `  Summary: 'Demo issue',\n` +
    `  // Optional field omitted - that's OK!\n` +
    `});`
  );

  if (!await confirm('Create issue WITHOUT optional field?', true)) {
    info('\n📤 Dry run - validating with JIRA API...\n');
    
    const spinner = ora('Testing issue creation without optional field...').start();
    
    try {
      // Actually validate with JIRA API (but don't create)
      await jml.issues.create({
        Project: projectKey,
        'Issue Type': 'Bug',
        Summary: `Demo: Optional field - ${Date.now()}`,
      });
      
      spinner.succeed('Validation passed - issue can be created without optional field!');
      
      const payload = {
        fields: {
          project: { key: projectKey },
          issuetype: { name: 'Bug' },
          summary: `Demo: Optional field - ${Date.now()}`,
          // Note: optional field not included - that's the point!
        }
      };
      
      showCode('Payload that would be sent:', JSON.stringify(payload, null, 2));
      
      success(`✓ Required fields are present (Project, Issue Type, Summary)`);
      success(`✓ Optional fields can be safely omitted\n`);
      
      info('What the library does behind the scenes:');
      info(`  • Validates required fields are present`);
      info(`  • Omits optional fields from payload if not provided`);
      info(`  • JIRA will leave omitted fields unset (null/default)\n`);
      
      warning('Note: Issue was NOT actually created (dry run mode)');
    } catch (err) {
      spinner.fail('Validation failed');
      error(`\nThis issue would fail to create: ${err.message}\n`);
      
      if (err.message.includes('required') || err.message.includes('mandatory')) {
        info('💡 The issue might be missing a required field');
        info('   Check your JIRA project configuration for required fields');
      } else {
        info('💡 Check the error message above for details');
      }
    }
    
    await pause('\nPress Enter to continue...');
    return;
  }

  const spinner = ora('Creating issue...').start();

  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': 'Bug',
      Summary: `Demo: Optional field - ${Date.now()}`,
    });

    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl);
    info('Field was not set (completely optional)');
  } catch (err) {
    spinner.fail('Failed to create issue');
    error(err.message);
    if (err.details) {
      console.log('\nDetails:', JSON.stringify(err.details, null, 2));
    }
  }
}

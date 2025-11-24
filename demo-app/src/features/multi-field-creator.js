/**
 * Multi-Field Issue Creator Demo
 * 
 * Demonstrates the library's core value proposition:
 * Set multiple fields by name in one request, library handles all conversions
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, showIssue, showCode, pause, warning } from '../ui/display.js';
import { input, confirm } from '../ui/prompts.js';

/**
 * Available field types that can be demonstrated
 */
const AVAILABLE_FIELDS = [
  { name: '🏗️  Project (required)', value: 'project', type: 'project', required: true },
  { name: '🎫 Issue Type (required)', value: 'issuetype', type: 'issuetype', required: true },
  { name: '📝 Summary (required)', value: 'summary', type: 'string', required: true },
  { name: '📄 Description', value: 'description', type: 'text', required: false },
  { name: '🧩 Component/s', value: 'components', type: 'array[component]', required: false },
  { name: '🔖 Fix Version/s', value: 'fixversions', type: 'array[version]', required: false },
  { name: '🎯 Priority', value: 'priority', type: 'option', required: false },
  { name: '🏷️  Labels', value: 'labels', type: 'array[string]', required: false },
  { name: '👤 Assignee', value: 'assignee', type: 'user', required: false },
  { name: '📅 Due Date', value: 'duedate', type: 'date', required: false },
  { name: '⏱️  Time Tracking', value: 'timetracking', type: 'timetracking', required: false },
  { name: '🗂️  Level (cascading)', value: 'level', type: 'option-with-child', required: false },
];

export async function runMultiFieldCreator(config) {
  showHeader('Multi-Field Issue Creator');

  info('Create issues with multiple fields at once - the library handles all conversions!\n');

  const spinner = ora('Initializing JIRA Magic Library...').start();
  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis,
  });
  spinner.succeed('JML initialized');

  try {
    // Let user select which fields to set
    const { selectedFields } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedFields',
        message: 'Select fields to set (space to select, enter to continue):',
        choices: AVAILABLE_FIELDS,
        default: ['project', 'issuetype', 'summary'], // Required fields
        validate: (selected) => {
          if (!selected.includes('project')) {
            return 'Project is required';
          }
          if (!selected.includes('issuetype')) {
            return 'Issue Type is required';
          }
          if (!selected.includes('summary')) {
            return 'Summary is required';
          }
          if (selected.length === 0) {
            return 'Select at least one field';
          }
          return true;
        },
      },
    ]);

    // Ask if user wants to add custom fields via CSV
    const { addCustomFields } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addCustomFields',
        message: 'Add custom fields via CSV? (e.g., "Epic Link, Story Points, Custom Field")',
        default: false,
      },
    ]);

    let customFields = [];
    if (addCustomFields) {
      const customFieldsInput = await input(
        'Enter field names (comma-separated):',
        'Epic Link, Story Points'
      );
      customFields = customFieldsInput.split(',').map(f => f.trim()).filter(f => f);
      
      if (customFields.length > 0) {
        info(`\n✨ Will also test: ${customFields.join(', ')}`);
      }
    }

    // Collect values for each selected field
    const fieldValues = {};
    
    for (const fieldId of selectedFields) {
      const field = AVAILABLE_FIELDS.find(f => f.value === fieldId);
      
      info(`\n${field.name} (${field.type})`);
      
      const value = await promptForField(field, config);
      
      if (value !== null && value !== undefined && value !== '') {
        // Map demo field names to JIRA field names
        const jiraFieldName = getJiraFieldName(fieldId);
        fieldValues[jiraFieldName] = value;
      }
    }

    // Collect values for custom fields (free-form testing)
    for (const customFieldName of customFields) {
      info(`\n🔧 ${customFieldName} (custom field)`);
      
      const value = await input(
        `Enter value for "${customFieldName}" (free-form):`,
        ''
      );
      
      if (value !== null && value !== undefined && value !== '') {
        fieldValues[customFieldName] = value;
      }
    }

    // Show code example
    showCode('Code:', 
      `await jml.issues.create(${JSON.stringify(fieldValues, null, 2)});`
    );

    if (!await confirm('Create this issue?', true)) {
      warning('\n⚠️  Dry run - no issue created');
      info('The library would have:');
      info('  • Resolved all field names to IDs');
      info('  • Converted all values to JIRA format');
      info('  • Validated the payload');
      info('  • Created the issue\n');
      await pause();
      return;
    }

    // Create the issue
    const createSpinner = ora('Creating issue...').start();
    
    try {
      const result = await jml.issues.create(fieldValues);

      createSpinner.succeed('Issue created!');
      showIssue(result.key, config.baseUrl, fieldValues);
      
      success('\n✨ The library automatically:');
      info('  • Looked up field IDs from names');
      info('  • Converted component names to IDs');
      info('  • Resolved priority/user values');
      info('  • Formatted dates correctly');
      info('  • Validated everything before sending\n');

    } catch (err) {
      createSpinner.fail('Failed to create issue');
      error(`\n${err.message}\n`);
      
      if (err.details) {
        info('Error details:');
        console.log(JSON.stringify(err.details, null, 2));
      }
    }

    // Ask if user wants to create another
    const { again } = await inquirer.prompt([
      {
        type: 'list',
        name: 'again',
        message: 'What next?',
        choices: [
          { name: '🔄 Create another issue', value: 'again' },
          { name: '← Back to main menu', value: 'back' },
        ],
      },
    ]);

    if (again === 'again') {
      await pause();
      // Recursively run again
      await runMultiFieldCreator(config);
    }

  } catch (err) {
    error(`\nDemo failed: ${err.message}`);
    if (err.details) {
      console.log('\nDetails:', err.details);
    }
    await pause();
  } finally {
    await jml.disconnect();
  }
}

/**
 * Prompt user for value based on field type
 */
async function promptForField(field, config) {
  switch (field.value) {
    case 'project':
      info('  Accepts project key OR name:');
      info('  • "ENG" (key)');
      info('  • "Engineering Project" (name)');
      info('  • Library will resolve automatically\n');
      return await input(
        'Enter project (key or name):',
        config.defaultProjectKey || 'ENG'
      );
    
    case 'issuetype':
      info('  Accepts issue type name or abbreviation:');
      info('  • "Bug", "Story", "Task", "Epic"');
      info('  • "bug", "story" (case-insensitive)');
      info('  • Library will resolve to ID automatically\n');
      return await input(
        'Enter issue type:',
        'Bug'
      );
    
    case 'summary':
      return await input('Enter summary:', `Demo issue - ${new Date().toLocaleString()}`);
    
    case 'description':
      return await input(
        'Enter description (use \\n for newlines):',
        'This is a demo issue created by JIRA Magic Library.\\n\\nIt demonstrates multi-field conversion.'
      ).then(val => val.replace(/\\n/g, '\n'));
    
    case 'components':
      const components = await input(
        'Enter components (comma-separated):',
        'Backend, Frontend'
      );
      return components.split(',').map(c => c.trim()).filter(c => c);
    
    case 'fixversions':
      const versions = await input(
        'Enter fix versions (comma-separated):',
        'v1.0, v1.1'
      );
      return versions.split(',').map(v => v.trim()).filter(v => v);
    
    case 'priority':
      return await input(
        'Enter priority (e.g., Highest, High, Medium, Low, Lowest):',
        'Medium'
      );
    
    case 'labels':
      const labels = await input(
        'Enter labels (comma-separated):',
        'demo, test'
      );
      return labels.split(',').map(l => l.trim()).filter(l => l);
    
    case 'assignee':
      return await input(
        'Enter assignee (username or email):',
        ''
      );
    
    case 'duedate':
      return await input(
        'Enter due date (YYYY-MM-DD):',
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      );
    
    case 'timetracking':
      info('  Time tracking supports multiple formats:');
      info('  • "2h" (2 hours)');
      info('  • "30m" (30 minutes)');
      info('  • "1d" (1 day = 8 hours)');
      info('  • "1w" (1 week = 5 days = 40 hours)');
      info('  • "1h 30m" (compound format)');
      info('  • "1w 2d 4h" (complex compound)');
      info('  • 7200 (numeric seconds)\n');
      
      const originalEstimate = await input(
        'Enter original estimate (e.g., "2d", "1w 2d 4h"):',
        '1w'
      );
      
      const { addRemaining } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addRemaining',
          message: 'Add remaining estimate?',
          default: false,
        },
      ]);
      
      if (addRemaining) {
        const remainingEstimate = await input(
          'Enter remaining estimate:',
          '3d'
        );
        return {
          originalEstimate,
          remainingEstimate,
        };
      }
      
      return { originalEstimate };
    
    case 'level':
      info('  Cascading select supports multiple formats:');
      info('  • "MP -> mp_zul_trainyard_01" (parent arrow child)');
      info('  • "MP, mp_zul_trainyard_01" (parent comma child)');
      info('  • "MP / mp_zul_trainyard_01" (parent slash child)');
      info('  • "MP" (parent only)');
      info('  • "mp_zul_newsroom" (child only, auto-detects parent)\n');
      return await input(
        'Enter level value:',
        'MP -> mp_zul_trainyard_01'
      );
    
    default:
      return await input(`Enter ${field.name}:`);
  }
}

/**
 * Map demo field IDs to JIRA field names
 */
function getJiraFieldName(fieldId) {
  const mapping = {
    'project': 'Project',
    'issuetype': 'Issue Type',
    'summary': 'Summary',
    'description': 'Description',
    'components': 'Component/s',
    'fixversions': 'Fix Version/s',
    'priority': 'Priority',
    'labels': 'Labels',
    'assignee': 'Assignee',
    'duedate': 'Due Date',
    'timetracking': 'Time Tracking',
    'level': 'Level',
  };
  return mapping[fieldId] || fieldId;
}

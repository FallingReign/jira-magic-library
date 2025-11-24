/**
 * Component Type Converter Demo (E2-S10)
 * 
 * Interactive demonstration of component array field conversion
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, showIssue, showCode, pause, warning } from '../../ui/display.js';
import { input, confirm } from '../../ui/prompts.js';

export async function runComponentConverterDemo(config) {
  showHeader('Component Type Converter Demo (E2-S10)');

  info('This demo shows how to work with component array fields.');
  info('Components help organize issues by functional area or module.\n');

  const spinner = ora('Initializing JIRA Magic Library...').start();
  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis,
  });
  spinner.succeed('JML initialized');

  try {
    const projectKey = await input(
      'Enter project key:',
      config.defaultProjectKey || 'ENG'
    );

    const issueType = await input(
      'Enter issue type:',
      'Bug'
    );

    const { example } = await inquirer.prompt([
      {
        type: 'list',
        name: 'example',
        message: 'Select an example to run:',
        choices: [
          { name: '1️⃣  Set components by name (array)', value: 'by-name' },
          { name: '2️⃣  Set components from CSV string', value: 'csv' },
          { name: '3️⃣  Case-insensitive matching', value: 'case' },
          { name: '4️⃣  Mix names and IDs', value: 'mixed' },
          { name: '5️⃣  Optional field', value: 'optional' },
          new inquirer.Separator(),
          { name: '← Back to main menu', value: 'back' },
        ],
      },
    ]);

    if (example === 'back') {
      return;
    }

    switch (example) {
      case 'by-name':
        await exampleByName(jml, config, projectKey, issueType);
        break;
      case 'csv':
        await exampleCsv(jml, config, projectKey, issueType);
        break;
      case 'case':
        await exampleCase(jml, config, projectKey, issueType);
        break;
      case 'mixed':
        await exampleMixed(jml, config, projectKey, issueType);
        break;
      case 'optional':
        await exampleOptional(jml, config, projectKey, issueType);
        break;
    }

    success('\n✅ Component Converter Demo Complete!');
    await pause();

  } catch (err) {
    error(`Demo failed: ${err.message}`);
    await pause();
  } finally {
    await jml.disconnect();
  }
}

async function exampleByName(jml, config, projectKey, issueType) {
  showHeader('Example 1: Set Components by Name');
  
  info('Provide component names as an array - library looks up IDs\n');

  const components = await input('Enter components (comma-separated):', 'Backend, Frontend');
  const arr = components.split(',').map(c => c.trim());

  showCode('Code:', 
    `await jml.issues.create({\n` +
    `  Project: '${projectKey}',\n` +
    `  'Issue Type': '${issueType}',\n` +
    `  Summary: 'Demo',\n` +
    `  'Component/s': ${JSON.stringify(arr)}\n` +
    `});`
  );

  if (!await confirm('Create issue?', false)) {
    warning('Dry run - no issue created');
    return;
  }

  const spinner = ora('Creating...').start();
  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': issueType,
      Summary: `Demo: Components - ${Date.now()}`,
      'Component/s': arr,
    });
    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl, { 'Component/s': arr });
  } catch (err) {
    spinner.fail('Failed');
    error(err.message);
  }
}

async function exampleCsv(jml, config, projectKey, issueType) {
  showHeader('Example 2: CSV String');
  
  info('Provide CSV string - library parses and converts\n');

  const csv = await input('Enter CSV:', 'Backend, API, Mobile');

  showCode('Code:', 
    `await jml.issues.create({\n` +
    `  'Component/s': '${csv}'\n` +
    `});`
  );

  if (!await confirm('Create issue?', false)) {
    warning('Dry run - no issue created');
    return;
  }

  const spinner = ora('Creating...').start();
  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': issueType,
      Summary: `Demo: CSV - ${Date.now()}`,
      'Component/s': csv,
    });
    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl, { 'Component/s': csv });
  } catch (err) {
    spinner.fail('Failed');
    error(err.message);
  }
}

async function exampleCase(jml, config, projectKey, issueType) {
  showHeader('Example 3: Case-Insensitive');
  
  info('Component names match case-insensitively\n');

  const components = await input('Enter (any case):', 'backend, FRONTEND');
  const arr = components.split(',').map(c => c.trim());

  if (!await confirm('Create issue?', false)) {
    warning('Dry run - no issue created');
    return;
  }

  const spinner = ora('Creating...').start();
  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': issueType,
      Summary: `Demo: Case - ${Date.now()}`,
      'Component/s': arr,
    });
    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl, { 'Component/s': arr });
  } catch (err) {
    spinner.fail('Failed');
    error(err.message);
  }
}

async function exampleMixed(jml, config, projectKey, issueType) {
  showHeader('Example 4: Mix Names and IDs');
  
  info('Mix component names and ID objects\n');

  const name = await input('Component name:', 'Backend');
  const id = await input('Component ID:', '10002');

  showCode('Code:', 
    `'Component/s': ['${name}', { id: '${id}' }]`
  );

  if (!await confirm('Create issue?', false)) {
    warning('Dry run - no issue created');
    return;
  }

  const spinner = ora('Creating...').start();
  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': issueType,
      Summary: `Demo: Mixed - ${Date.now()}`,
      'Component/s': [name, { id }],
    });
    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl, { 'Component/s': `['${name}', { id: '${id}' }]` });
  } catch (err) {
    spinner.fail('Failed');
    error(err.message);
  }
}

async function exampleOptional(jml, config, projectKey, issueType) {
  showHeader('Example 5: Optional Field');
  
  info('Components can be omitted\n');

  if (!await confirm('Create issue WITHOUT components?', false)) {
    warning('Dry run - no issue created');
    return;
  }

  const spinner = ora('Creating...').start();
  try {
    const result = await jml.issues.create({
      Project: projectKey,
      'Issue Type': issueType,
      Summary: `Demo: No components - ${Date.now()}`,
    });
    spinner.succeed('Issue created!');
    showIssue(result.key, config.baseUrl);
  } catch (err) {
    spinner.fail('Failed');
    error(err.message);
  }
}
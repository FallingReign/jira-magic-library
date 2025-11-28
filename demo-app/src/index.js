#!/usr/bin/env node
/**
 * JIRA Magic Library - Interactive Demo Application
 * 
 * A standalone application that demonstrates library features
 * with a beautiful, interactive terminal UI.
 */

import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showWelcome, success, error, info, clear, showHeader } from './ui/display.js';
import { promptSetup, showMainMenu, showCredentialMenu, confirm } from './ui/prompts.js';
import { saveConfig, loadConfig, hasConfig, deleteConfig } from './config/manager.js';
import { runOptionConverterDemo } from './features/deprecated/option-converter.js';
import { runComponentConverterDemo } from './features/deprecated/component-converter.js';
import { runMultiFieldCreator } from './features/multi-field-creator.js';
import { runFieldReference } from './features/field-reference.js';
import { runHierarchyDemo } from './features/hierarchy-demo.js';
import { runBulkImportDemo } from './features/bulk-import.js';
import { runBulkImportCsvQuickDemo, runBulkImportYamlQuickDemo } from './features/bulk-import-quick.js';
import { runHierarchyCsvQuickDemo, runHierarchyYamlQuickDemo } from './features/hierarchy-bulk-quick.js';
import { runSchemaValidationDemo } from './features/schema-validation.js';
import { runManifestStorageDemo } from './features/manifest-storage-demo.js';
import { runBulkApiWrapperDemo } from './features/bulk-api-wrapper-demo.js';
import { runUserAmbiguityDemo } from './features/user-ambiguity-demo.js';
import { runIntegrationTests } from './features/integration-tests.js';
import { runHierarchyBulkUidDemo } from './features/hierarchy-bulk-uids.js';

async function main() {
  clear();
  showWelcome();

  let config;

  // Check for saved credentials
  if (hasConfig()) {
    info('Found saved credentials');
    const useSaved = await confirm('Use saved credentials?', true);

    if (useSaved) {
      config = loadConfig();
      success('Loaded saved credentials');
    } else {
      config = await setupCredentials();
    }
  } else {
    info('First time setup - let\'s configure your JIRA connection\n');
    config = await setupCredentials();
  }

  // Test connection
  const spinner = ora('Testing connection to JIRA...').start();
  try {
    const jml = new JML({
      baseUrl: config.baseUrl,
      auth: { token: config.token },
      apiVersion: config.apiVersion || 'v2',
      redis: config.redis,
    });

    const serverInfo = await jml.validateConnection();
    await jml.disconnect();

    spinner.succeed(`Connected to JIRA ${serverInfo.version} (${serverInfo.deploymentType})`);
    success(`Base URL: ${config.baseUrl}\n`);
  } catch (err) {
    spinner.fail('Connection failed');
    error(err.message);
    console.log('\nPlease check your credentials and try again.\n');
    process.exit(1);
  }

  // Main application loop
  let running = true;
  while (running) {
    const choice = await showMainMenu();

    switch (choice) {
      case 'multi-field':
        clear();
        await runMultiFieldCreator(config);
        clear();
        break;

      case 'bulk-import':
        clear();
        await runBulkImportDemo(config);
        clear();
        break;

      case 'bulk-import-csv':
        clear();
        await runBulkImportCsvQuickDemo(config);
        clear();
        break;

      case 'bulk-import-yaml':
        clear();
        await runBulkImportYamlQuickDemo(config);
        clear();
        break;

      case 'schema-validation':
        clear();
        await runSchemaValidationDemo(config);
        clear();
        break;

      case 'manifest-storage':
        clear();
        await runManifestStorageDemo(config);
        clear();
        break;

      case 'bulk-api-wrapper':
        clear();
        await runBulkApiWrapperDemo(config);
        clear();
        break;

      case 'hierarchy':
        clear();
        await runHierarchyDemo(config);
        clear();
        break;

      case 'hierarchy-bulk-uids':
        clear();
        await runHierarchyBulkUidDemo(config);
        clear();
        break;

      case 'hierarchy-csv':
        clear();
        await runHierarchyCsvQuickDemo(config);
        clear();
        break;

      case 'hierarchy-yaml':
        clear();
        await runHierarchyYamlQuickDemo(config);
        clear();
        break;

      case 'field-reference':
        await runFieldReference();
        clear();
        break;

      case 'user-ambiguity':
        clear();
        await runUserAmbiguityDemo(config);
        clear();
        break;

      case 'integration-hierarchy':
        clear();
        await runIntegrationTests(config);
        clear();
        break;

      case 'option-converter':
        clear();
        await runOptionConverterDemo(config);
        clear();
        break;

      case 'component-converter':
        clear();
        await runComponentConverterDemo(config);
        clear();
        break;

      case 'text-converter':
      case 'number-converter':
      case 'datetime-converter':
      case 'user-converter':
        info('This demo is coming soon! Check back later.\n');
        await new Promise(resolve => setTimeout(resolve, 1500));
        break;

      case 'manage-credentials':
        clear();
        await manageCredentials();
        // Reload config if it was changed
        if (hasConfig()) {
          config = loadConfig();
        } else {
          info('No credentials found. Please set up again.\n');
          config = await setupCredentials();
        }
        clear();
        break;

      case 'exit':
        running = false;
        break;
    }
  }

  console.log('\n👋 Thanks for trying JIRA Magic Library!\n');
  console.log('Learn more: https://github.com/your-org/jira-magic-library\n');
  process.exit(0);
}

async function setupCredentials() {
  const config = await promptSetup();

  const { saveConfig: shouldSave, ...configData } = config;

  if (shouldSave) {
    saveConfig(configData);
    success('Credentials saved securely to .demo-config.json\n');
  }

  return configData;
}

async function manageCredentials() {
  showHeader('Credential Management');

  const choice = await showCredentialMenu();

  switch (choice) {
    case 'reenter':
      const newConfig = await setupCredentials();
      success('Credentials updated!');
      await new Promise(resolve => setTimeout(resolve, 1000));
      break;

    case 'delete':
      const confirmDelete = await confirm(
        'Are you sure you want to delete saved credentials?',
        false
      );

      if (confirmDelete) {
        deleteConfig();
        success('Credentials deleted');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      break;

    case 'back':
      // Just return
      break;
  }
}

// Run the application
main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});

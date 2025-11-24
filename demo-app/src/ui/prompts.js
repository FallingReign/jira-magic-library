/**
 * Interactive Prompts
 * User input collection with inquirer
 */

import inquirer from 'inquirer';

/**
 * Prompt for initial setup
 */
export async function promptSetup() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'JIRA Instance URL:',
      default: 'https://your-instance.atlassian.net',
      validate: (input) => {
        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          return 'URL must start with http:// or https://';
        }
        return true;
      },
    },
    {
      type: 'password',
      name: 'token',
      message: 'Personal Access Token:',
      mask: '*',
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'Token is required';
        }
        return true;
      },
    },
    {
      type: 'list',
      name: 'apiVersion',
      message: 'JIRA API Version:',
      choices: ['v2', 'v3'],
      default: 'v2',
    },
    {
      type: 'input',
      name: 'defaultProjectKey',
      message: 'Default Project Key (optional):',
      default: 'ENG',
    },
    {
      type: 'confirm',
      name: 'saveConfig',
      message: 'Save credentials for future sessions?',
      default: true,
    },
  ]);

  return {
    baseUrl: answers.baseUrl.trim(),
    token: answers.token.trim(),
    apiVersion: answers.apiVersion,
    defaultProjectKey: answers.defaultProjectKey?.trim() || undefined,
    saveConfig: answers.saveConfig,
  };
}

/**
 * Main menu selection
 */
export async function showMainMenu() {
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Select a feature to demo:',
      choices: [
        { name: '🧪 Multi-Field Issue Creator (Full Demo)', value: 'multi-field' },
        { name: '📥 Bulk Import (CSV/JSON/YAML) (E4-S04)', value: 'bulk-import' },
        { name: '✅ Schema Validation (E4-S07)', value: 'schema-validation' },
        { name: '🏗️  Issue Hierarchy & Parent Links (E3-S09)', value: 'hierarchy' },
        { name: '📚 Field Type Reference (Browse Converters)', value: 'field-reference' },
        { name: '💡 User Ambiguity Policy Explorer', value: 'user-ambiguity' },
        new inquirer.Separator(),
        { name: '🔧 Infrastructure Demos', value: null, disabled: true },
        { name: '   💾 Bulk Manifest Storage (E4-S02)', value: 'manifest-storage' },
        { name: '   🔗 JIRA Bulk API Wrapper (E4-S03)', value: 'bulk-api-wrapper' },
        new inquirer.Separator(),
        { name: '🧩 Legacy Demos (deprecated)', value: null, disabled: true },
        { name: '   🎯 Option Type Converter (E2-S09)', value: 'option-converter' },
        { name: '   🧩 Component Type Converter (E2-S10)', value: 'component-converter' },
        new inquirer.Separator(),
        { name: '🔧 Manage Credentials', value: 'manage-credentials' },
        { name: '❌ Exit', value: 'exit' },
      ],
      pageSize: 15,
    },
  ]);

  return choice;
}

/**
 * Credential management menu
 */
export async function showCredentialMenu() {
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Credential Management:',
      choices: [
        { name: '🔄 Re-enter Credentials', value: 'reenter' },
        { name: '🗑️  Delete Saved Credentials', value: 'delete' },
        { name: '← Back to Main Menu', value: 'back' },
      ],
    },
  ]);

  return choice;
}

/**
 * Generic confirmation
 */
export async function confirm(message, defaultValue = false) {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);

  return confirmed;
}

/**
 * Generic text input
 */
export async function input(message, defaultValue) {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
    },
  ]);

  return value;
}

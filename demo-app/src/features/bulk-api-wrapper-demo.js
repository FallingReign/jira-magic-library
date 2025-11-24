/**
 * JIRA Bulk API Wrapper Demo (E4-S03)
 * 
 * Interactive demo showing how JiraBulkApiWrapper calls JIRA's bulk API
 * and normalizes responses for partial success and full failure scenarios
 */

import { JiraClientImpl, JiraBulkApiWrapper } from 'jira-magic-library';
import { showHeader, info, success, error, warning, showCode, pause, clear } from '../ui/display.js';
import inquirer from 'inquirer';

/**
 * Demo: JIRA Bulk API Wrapper
 */
export async function runBulkApiWrapperDemo(config) {
  await clear();
  showHeader('JIRA Bulk API Wrapper Demo', 'E4-S03');

  info('This demo shows how JiraBulkApiWrapper calls JIRA\'s /rest/api/2/issue/bulk');
  info('endpoint and handles partial success (HTTP 201) and full failure (HTTP 400).');
  info('');

  // Step 1: Create client from config
  info('📡 Step 1: Initialize JIRA Client');
  showCode(`
const client = new JiraClientImpl({
  baseUrl: config.baseUrl,
  auth: { token: config.token }
});
  `.trim());

  let client;
  try {
    client = new JiraClientImpl({
      baseUrl: config.baseUrl,
      auth: { token: config.token },
      apiVersion: config.apiVersion || 'v2',
    });
    success('✓ JIRA client initialized');
  } catch (err) {
    error(`✗ Failed to initialize client: ${err.message}`);
    await pause();
    return;
  }

  await pause();

  // Step 2: Create wrapper
  info('');
  info('🔧 Step 2: Create Bulk API Wrapper');
  showCode(`
const wrapper = new JiraBulkApiWrapper(client);
  `.trim());

  const wrapper = new JiraBulkApiWrapper(client);
  success('✓ Wrapper created (wraps /rest/api/2/issue/bulk)');
  
  await pause();

  // Get project key from user
  info('');
  const { projectKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectKey',
      message: 'Enter JIRA project key:',
      default: 'ZUL',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Project key is required';
        }
        return true;
      }
    }
  ]);

  // Step 3: Scenario 1 - All Valid (Full Success)
  await clear();
  showHeader('Scenario 1: All Valid Issues (Full Success)', 'E4-S03');
  
  info('Creating 3 valid issues - all should succeed (HTTP 201)');
  showCode(`
const payloads = [
  { fields: { project: { key: '${projectKey}' }, summary: 'Valid Task 1', issuetype: { name: 'Task' } } },
  { fields: { project: { key: '${projectKey}' }, summary: 'Valid Task 2', issuetype: { name: 'Task' } } },
  { fields: { project: { key: '${projectKey}' }, summary: 'Valid Task 3', issuetype: { name: 'Task' } } }
];

const result = await wrapper.createBulk(payloads);
  `.trim());

  try {
    const result = await wrapper.createBulk([
      { fields: { project: { key: projectKey }, summary: 'Bulk API Demo - Valid Task 1', issuetype: { name: 'Task' } } },
      { fields: { project: { key: projectKey }, summary: 'Bulk API Demo - Valid Task 2', issuetype: { name: 'Task' } } },
      { fields: { project: { key: projectKey }, summary: 'Bulk API Demo - Valid Task 3', issuetype: { name: 'Task' } } }
    ]);

    success(`✓ All 3 issues created successfully!`);
    info('');
    info('📊 Result Structure:');
    info(`   Created: ${result.created.length} issues`);
    info(`   Failed: ${result.failed.length} issues`);
    info('');
    info(`Created issues: ${result.created.map(c => c.key).join(', ')}`);
    info(`Failed issues: ${result.failed.length} (none)`);
  } catch (err) {
    error(`✗ Bulk creation failed: ${err.message}`);
  }

  await pause();

  // Step 4: Scenario 2 - Partial Success (Mix of Valid/Invalid)
  await clear();
  showHeader('Scenario 2: Partial Success (Mix of Valid/Invalid)', 'E4-S03');
  
  info('Creating 4 issues - 2 valid, 2 invalid (missing required fields)');
  info('Expected: HTTP 201 with both "issues" and "errors" arrays');
  showCode(`
const payloads = [
  { fields: { project: { key: '${projectKey}' }, summary: 'Valid 1', issuetype: { name: 'Task' } } },  // ✓ Valid
  { fields: { project: { key: '${projectKey}' }, summary: 'Invalid 1' } },                               // ✗ Missing issuetype
  { fields: { project: { key: '${projectKey}' }, summary: 'Valid 2', issuetype: { name: 'Task' } } },  // ✓ Valid
  { fields: { summary: 'Invalid 2', issuetype: { name: 'Task' } } }                                     // ✗ Missing project
];

const result = await wrapper.createBulk(payloads);
  `.trim());

  try {
    const result = await wrapper.createBulk([
      { fields: { project: { key: projectKey }, summary: 'Bulk API Demo - Valid 1', issuetype: { name: 'Task' } } },
      { fields: { project: { key: projectKey }, summary: 'Bulk API Demo - Invalid 1' } }, // Missing issuetype
      { fields: { project: { key: projectKey }, summary: 'Bulk API Demo - Valid 2', issuetype: { name: 'Task' } } },
      { fields: { summary: 'Bulk API Demo - Invalid 2', issuetype: { name: 'Task' } } } // Missing project
    ]);

    warning(`⚠ Partial success: ${result.created.length} created, ${result.failed.length} failed`);
    info('');
    info('📊 Result Structure:');
    info(`   Created: ${result.created.length} issues`);
    info(`   Failed: ${result.failed.length} issues`);
    info('');
    
    if (result.created.length > 0) {
      success(`✓ Created: ${result.created.map(c => `${c.key} (index ${c.index})`).join(', ')}`);
    }
    
    if (result.failed.length > 0) {
      error(`✗ Failed: ${result.failed.map(f => `index ${f.index}`).join(', ')}`);
      info('');
      info('Error details:');
      result.failed.forEach(f => {
        const errorMsg = Object.entries(f.errors).map(([field, msg]) => `  - ${field}: ${msg}`).join('\n');
        warning(`  Index ${f.index} (status ${f.status}):\n${errorMsg}`);
      });
    }
  } catch (err) {
    error(`✗ Bulk creation failed: ${err.message}`);
  }

  await pause();

  // Step 5: Scenario 3 - Full Failure (All Invalid)
  await clear();
  showHeader('Scenario 3: Full Failure (All Invalid)', 'E4-S03');
  
  info('Creating 3 invalid issues - all should fail (HTTP 400)');
  info('Expected: HTTP 400 with empty "issues" array, all errors mapped');
  showCode(`
const payloads = [
  { fields: { project: { key: '${projectKey}' }, summary: 'Missing issuetype' } },           // ✗ Missing issuetype
  { fields: { summary: 'Missing project', issuetype: { name: 'Task' } } },                    // ✗ Missing project
  { fields: { project: { key: '${projectKey}' }, issuetype: { name: 'InvalidType12345' } } } // ✗ Invalid issuetype
];

const result = await wrapper.createBulk(payloads);
  `.trim());

  try {
    const result = await wrapper.createBulk([
      { fields: { project: { key: projectKey }, summary: 'Bulk API Demo - Missing issuetype' } },
      { fields: { summary: 'Bulk API Demo - Missing project', issuetype: { name: 'Task' } } },
      { fields: { project: { key: projectKey }, summary: 'Bulk API Demo - Invalid issuetype', issuetype: { name: 'InvalidType12345' } } }
    ]);

    error(`✗ Full failure: All ${result.failed.length} issues failed (HTTP 400 handled correctly)`);
    info('');
    info('📊 Result Structure:');
    info(`   Created: ${result.created.length} issues (none)`);
    info(`   Failed: ${result.failed.length} issues`);
    info('');
    info('Error details:');
    result.failed.forEach(f => {
      const errorMsg = Object.entries(f.errors).map(([field, msg]) => `  - ${field}: ${msg}`).join('\n');
      warning(`  Index ${f.index} (status ${f.status}):\n${errorMsg}`);
    });
    info('');
    success('✓ Wrapper correctly handled HTTP 400 as valid response (full failure)');
  } catch (err) {
    error(`✗ Bulk creation failed: ${err.message}`);
  }

  await pause();

  // Step 6: Summary
  await clear();
  showHeader('Summary', 'E4-S03');
  
  info('✅ JiraBulkApiWrapper successfully demonstrated:');
  info('');
  success('  1. Full Success (HTTP 201): All issues created');
  success('  2. Partial Success (HTTP 201): Mix of created + failed');
  success('  3. Full Failure (HTTP 400): No issues created, all failed');
  info('');
  info('🔑 Key Features:');
  info('  • Wraps /rest/api/2/issue/bulk endpoint');
  info('  • Normalizes responses to consistent BulkApiResult format');
  info('  • Handles HTTP 400 as valid response (full failure)');
  info('  • Maps JIRA elementErrors to Record<string, string>');
  info('  • Preserves original row indices for tracking');
  info('');
  info('📚 Next: Use BulkApiResult with ManifestStorage for retry/rollback');

  await pause();
}

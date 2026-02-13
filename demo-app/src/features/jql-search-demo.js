/**
 * JQL Search Demo
 *
 * Demonstrates Phase 2.1 search API features:
 * - Raw JQL queries (power user mode)
 * - Object-based searches (convenience mode)
 * - Custom fields and complex operators support
 * - createdSince filtering and ordering
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, showCode, warning } from '../ui/display.js';
import { confirm } from '../ui/prompts.js';

export async function runJqlSearchDemo(config) {
  showHeader('JQL Search API Demo (Phase 2.1)');

  info('Search for JIRA issues using raw JQL or simple object-based queries.');
  info('Supports custom fields, complex operators, and advanced JQL syntax.\n');

  // Choose search mode
  const { searchMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'searchMode',
      message: 'Select search mode:',
      choices: [
        { name: '🔍 Raw JQL (power user - full control)', value: 'raw' },
        { name: '📋 Object-based (convenience - simple queries)', value: 'object' },
      ],
    },
  ]);

  // Initialize JML
  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    redis: config.redis,
  });

  try {
    if (searchMode === 'raw') {
      await runRawJqlSearch(jml, config);
    } else {
      await runObjectBasedSearch(jml, config);
    }
  } catch (err) {
    error(`Search failed: ${err.message}`);
    console.log('');
  } finally {
    await jml.disconnect();
  }

  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Raw JQL search mode (power users)
 */
async function runRawJqlSearch(jml, config) {
  console.log('\n💡 Raw JQL Examples:');
  console.log('   • project = PROJ AND issuetype = Task');
  console.log('   • project = PROJ AND status = "In Progress" AND assignee = currentUser()');
  console.log('   • project = PROJ AND cf[10306] = value AND labels in (backend, urgent)');
  console.log('   • project = PROJ AND created >= -7d ORDER BY created DESC');
  console.log('');

  // Get JQL from user
  const { jql } = await inquirer.prompt([
    {
      type: 'input',
      name: 'jql',
      message: 'Enter JQL query:',
      default: `project = ${config.defaultProjectKey || 'PROJ'} AND issuetype = Task`,
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'JQL query is required';
        }
        return true;
      },
    },
  ]);

  // Choose options
  const { maxResults, orderBy, includeCreatedSince } = await inquirer.prompt([
    {
      type: 'number',
      name: 'maxResults',
      message: 'Maximum results to return:',
      default: 10,
      validate: (input) => {
        if (input < 1) return 'Must return at least 1 result';
        if (input > 100) return 'Maximum 100 results for demo';
        return true;
      },
    },
    {
      type: 'input',
      name: 'orderBy',
      message: 'ORDER BY clause (optional, press Enter to skip):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'includeCreatedSince',
      message: 'Filter by creation date (last 7 days)?',
      default: false,
    },
  ]);

  // Build search criteria
  const searchCriteria = {
    jql: jql.trim(),
    maxResults
  };

  if (orderBy && orderBy.trim()) {
    searchCriteria.orderBy = orderBy.trim();
  }

  if (includeCreatedSince) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    searchCriteria.createdSince = sevenDaysAgo;
  }

  // Show code example
  showCode('API call:',
    `const issues = await jml.issues.search(${JSON.stringify(searchCriteria, null, 2)});`
  );

  // Execute search
  const spinner = ora('Searching JIRA...').start();

  const issues = await jml.issues.search(searchCriteria);

  spinner.succeed(`Found ${issues.length} issue(s)`);
  console.log('');

  // Display results
  displaySearchResults(issues, maxResults);
}

/**
 * Object-based search mode (convenience)
 */
async function runObjectBasedSearch(jml, config) {
  console.log('\n💡 Object-based search builds JQL automatically from fields.');
  console.log('   Simpler than raw JQL but less powerful (no custom fields in MVP).\n');

  info('Note: This mode uses field names directly (no friendly name resolution yet).');
  info('      Use exact JIRA field names like "project", "issuetype", "status".\n');

  // Prompt for project key
  const { projectKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectKey',
      message: 'Project key:',
      default: config.defaultProjectKey || config.projectKey || 'PROJ',
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'Project key is required';
        }
        return true;
      },
    },
  ]);

  // Additional filters
  const { issueType, statusFilter, summarySearch, includeLabels } = await inquirer.prompt([
    {
      type: 'input',
      name: 'issueType',
      message: 'Issue type (optional, press Enter to skip):',
      default: '',
    },
    {
      type: 'input',
      name: 'statusFilter',
      message: 'Status (optional, press Enter to skip):',
      default: '',
    },
    {
      type: 'input',
      name: 'summarySearch',
      message: 'Summary contains text (optional, press Enter to skip):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'includeLabels',
      message: 'Filter by labels?',
      default: false,
    },
  ]);

  // Build search criteria
  const searchCriteria = {
    project: projectKey.trim()
  };

  if (issueType && issueType.trim()) {
    searchCriteria.issuetype = issueType.trim();
  }

  if (statusFilter && statusFilter.trim()) {
    searchCriteria.status = statusFilter.trim();
  }

  if (summarySearch && summarySearch.trim()) {
    searchCriteria.summary = summarySearch.trim();
  }

  // Handle labels
  if (includeLabels) {
    const { labels } = await inquirer.prompt([
      {
        type: 'input',
        name: 'labels',
        message: 'Labels (comma-separated):',
        default: '',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'At least one label is required';
          }
          return true;
        },
      },
    ]);

    searchCriteria.labels = labels.split(',').map(l => l.trim()).filter(l => l);
  }

  // Options
  const { maxResults, orderBy, includeCreatedSince } = await inquirer.prompt([
    {
      type: 'number',
      name: 'maxResults',
      message: 'Maximum results to return:',
      default: 10,
      validate: (input) => {
        if (input < 1) return 'Must return at least 1 result';
        if (input > 100) return 'Maximum 100 results for demo';
        return true;
      },
    },
    {
      type: 'input',
      name: 'orderBy',
      message: 'ORDER BY clause (optional, press Enter to skip):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'includeCreatedSince',
      message: 'Filter by creation date (last 7 days)?',
      default: false,
    },
  ]);

  searchCriteria.maxResults = maxResults;

  if (orderBy && orderBy.trim()) {
    searchCriteria.orderBy = orderBy.trim();
  }

  if (includeCreatedSince) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    searchCriteria.createdSince = sevenDaysAgo;
  }

  // Show code example
  showCode('API call:',
    `const issues = await jml.issues.search(${JSON.stringify(searchCriteria, null, 2)});`
  );

  // Show generated JQL (note: this is approximate since we don't have access to the actual JQL)
  console.log('\n📋 Generated JQL (approximate):');
  const jqlParts = [];
  if (searchCriteria.project) jqlParts.push(`project ~ "${searchCriteria.project}"`);
  if (searchCriteria.issuetype) jqlParts.push(`issuetype ~ "${searchCriteria.issuetype}"`);
  if (searchCriteria.status) jqlParts.push(`status ~ "${searchCriteria.status}"`);
  if (searchCriteria.summary) jqlParts.push(`summary ~ "${searchCriteria.summary}"`);
  if (searchCriteria.labels) jqlParts.push(`labels IN (${searchCriteria.labels.map(l => `"${l}"`).join(', ')})`);
  if (searchCriteria.createdSince) jqlParts.push(`created >= "${searchCriteria.createdSince.toISOString().split('T')[0]}"`);
  if (searchCriteria.orderBy) jqlParts.push(`ORDER BY ${searchCriteria.orderBy}`);

  console.log(`   ${jqlParts.join(' AND ')}`);
  console.log('');

  // Execute search
  const spinner = ora('Searching JIRA...').start();

  const issues = await jml.issues.search(searchCriteria);

  spinner.succeed(`Found ${issues.length} issue(s)`);
  console.log('');

  // Display results
  displaySearchResults(issues, maxResults);
}

/**
 * Display search results in a nice format
 */
function displaySearchResults(issues, maxResults) {
  if (issues.length === 0) {
    warning('No issues found matching the search criteria.');
    console.log('');
    return;
  }

  console.log('🔍 Search Results:\n');

  const displayCount = Math.min(issues.length, 20); // Show max 20

  issues.slice(0, displayCount).forEach((issue, index) => {
    const summary = issue.fields?.summary || '(no summary)';
    const status = issue.fields?.status?.name || '(no status)';
    const issueType = issue.fields?.issuetype?.name || '(no type)';
    const assignee = issue.fields?.assignee?.displayName || 'Unassigned';
    const created = issue.fields?.created ? new Date(issue.fields.created).toLocaleDateString() : 'Unknown';

    console.log(`${index + 1}. ${issue.key}`);
    console.log(`   Summary:  ${summary}`);
    console.log(`   Type:     ${issueType}`);
    console.log(`   Status:   ${status}`);
    console.log(`   Assignee: ${assignee}`);
    console.log(`   Created:  ${created}`);
    console.log('');
  });

  if (issues.length > displayCount) {
    info(`... and ${issues.length - displayCount} more (limited to ${displayCount} for display)`);
    console.log('');
  }

  if (issues.length === maxResults) {
    warning(`⚠️  Results limited to ${maxResults}. There may be more matches.`);
    info('   Increase maxResults to see more, or refine your search criteria.');
    console.log('');
  }

  success(`✓ Search complete: ${issues.length} issue(s) found\n`);

  info('Search features demonstrated:');
  if (issues[0]?.fields?.labels) {
    info('  ✓ Labels search (IN clause with array)');
  }
  info('  ✓ Field filtering with JQL generation');
  info('  ✓ Result limiting with maxResults');
  info('  ✓ Structured issue data returned (key, fields, etc.)');
  console.log('');
}

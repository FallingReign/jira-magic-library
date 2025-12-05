/**
 * Hierarchy Bulk Quick Demos (CSV / YAML)
 *
 * Demonstrates UID-based hierarchy batching using the sample
 * CSV/YAML payloads from getHierarchyExampleData().
 */

import ora from 'ora';
import { JML, parseInput } from 'jira-magic-library';
import { getHierarchyExampleData } from '../fixtures/test-data.js';
import { showHeader, info, warning, success, error, showCode } from '../ui/display.js';
import { confirm } from '../ui/prompts.js';

export async function runHierarchyCsvQuickDemo(config) {
  await runHierarchyQuickDemo(config, 'csv');
}

export async function runHierarchyYamlQuickDemo(config) {
  await runHierarchyQuickDemo(config, 'yaml');
}

async function runHierarchyQuickDemo(config, format) {
  const projectKey = config.defaultProjectKey || config.projectKey || 'PROJ';
  const examples = getHierarchyExampleData(projectKey);
  const exampleData = examples[format];

  if (!exampleData) {
    warning(`No hierarchy example data found for ${format.toUpperCase()}`);
    await confirm('Return to main menu?', true);
    return;
  }

  showHeader(`Hierarchy Bulk Demo (${format.toUpperCase()})`);
  info(`Project: ${projectKey}`);
  info('Payload contains uid + Parent references for a 3-level hierarchy.\n');

  console.log(`Example ${format.toUpperCase()} payload:\n`);
  console.log('```' + format);
  console.log(exampleData);
  console.log('```\n');

  showCode('parseInput() call:',
    `const result = await parseInput({\n  data: hierarchyData,\n  format: '${format}'\n});`
  );

  const parseSpinner = ora('Parsing hierarchy data...').start();
  let parseResult;
  try {
    parseResult = await parseInput({ data: exampleData, format });
    parseSpinner.succeed(`Parsed ${parseResult.data.length} issue(s)`);
  } catch (err) {
    parseSpinner.fail('Parse failed');
    error(err.message);
    await confirm('Return to main menu?', true);
    return;
  }

  console.log('\nParsed Hierarchy:');
  const rows = parseResult.data;
  rows.forEach((row, idx) => {
    const indent = row.Parent ? '  ' : '';
    console.log(`${indent}${idx + 1}. uid=${row.uid || '(none)'} | Type=${row['Issue Type']} | Summary=${row.Summary}`);
    if (row.Parent) {
      console.log(`${indent}   Parent: ${row.Parent}`);
    }
  });
  console.log('');

  const proceed = await confirm(`Create ${rows.length} hierarchical issue(s) in ${projectKey}?`, false);
  if (!proceed) {
    info('\nDemo complete without creating issues.');
    await confirm('Return to main menu?', true);
    return;
  }

  showCode('Unified create() call:',
    `const result = await jml.issues.create(parsedData);\n// UID + Parent references handled automatically`
  );

  const createSpinner = ora('Creating hierarchy with level-based batching...').start();
  try {
    const jml = new JML({
      baseUrl: config.baseUrl,
      auth: { token: config.token },
      apiVersion: config.apiVersion || 'v2',
      redis: config.redis,
    });

    const start = Date.now();
    const result = await jml.issues.create(rows);
    const duration = Date.now() - start;
    await jml.disconnect();

    createSpinner.succeed(`Created ${result.succeeded}/${result.total} issues in ${duration}ms`);
    summarizeHierarchyResult(result, rows, config);
  } catch (err) {
    createSpinner.fail('Hierarchy creation failed');
    error(err.message);
  }

  await confirm('Return to main menu?', true);
}

function summarizeHierarchyResult(result, rows, config) {
  console.log('\nResults:');
  success(`Succeeded: ${result.succeeded}`);
  if (result.failed > 0) {
    warning(`Failed: ${result.failed}`);
  }
  info(`Total: ${result.total}`);
  if (result.manifest?.id) {
    info(`Manifest ID: ${result.manifest.id}`);
  }

  if (result.manifest?.uidMap) {
    showCode('UID -> Key mappings (manifest.uidMap)', JSON.stringify(result.manifest.uidMap, null, 2));
  }

  result.results.forEach((entry, idx) => {
    const row = rows[idx];
    if (entry.success) {
      success(`  ${entry.key} <- ${row.uid || row.Summary}`);
    } else {
      warning(`  Failed ${row.uid || row.Summary}: ${JSON.stringify(entry.error)}`);
    }
  });

  if (result.succeeded > 0 && result.manifest?.created) {
    const keys = Object.values(result.manifest.created);
    const jql = `key in (${keys.join(', ')})`;
    const link = `${config.baseUrl}/issues/?jql=${encodeURIComponent(jql)}`;
    info('\nView created issues:');
    info(`   ${link}`);
  }
}

/**
 * Bulk Import Quick Demos (CSV / YAML)
 *
 * Provides one-click demos that parse built-in example data and
 * use the unified create() method without extra prompts.
 */

import ora from 'ora';
import { JML, parseInput } from 'jira-magic-library';
import { showHeader, info, warning, success, error, showCode } from '../ui/display.js';
import { confirm } from '../ui/prompts.js';
import { getExampleData } from '../fixtures/test-data.js';

export async function runBulkImportCsvQuickDemo(config) {
  await runBulkImportQuickDemo(config, 'csv');
}

export async function runBulkImportYamlQuickDemo(config) {
  await runBulkImportQuickDemo(config, 'yaml');
}

async function runBulkImportQuickDemo(config, format) {
  const projectKey = config.defaultProjectKey || config.projectKey || 'PROJ';
  const examples = getExampleData(projectKey, config.username);
  const exampleData = examples[format];

  if (!exampleData) {
    warning(`No example data found for ${format.toUpperCase()}`);
    await confirm('Return to main menu?', true);
    return;
  }

  showHeader(`Bulk Import Quick Demo (${format.toUpperCase()})`);
  info(`Project: ${projectKey}`);
  info('Using built-in example data (no file path or manual input required).\n');

  console.log(`📋 Example ${format.toUpperCase()} data:\n`);
  console.log('```' + format);
  console.log(exampleData);
  console.log('```\n');

  showCode('parseInput() call:',
    `const result = await parseInput({\n  data: exampleData,\n  format: '${format}'\n});`
  );

  const parseSpinner = ora('Parsing example data...').start();
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

  console.log('\n📊 Parsed Rows:\n');
  parseResult.data.forEach((row, idx) => {
    console.log(`Row ${idx + 1}:`);
    Object.entries(row).forEach(([key, value]) => {
      const displayValue = Array.isArray(value)
        ? `[${value.join(', ')}]`
        : typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : value;
      console.log(`  ${key}: ${displayValue}`);
    });
    console.log('');
  });

  const proceed = await confirm(`Create ${parseResult.data.length} issue(s) in ${projectKey}?`, false);
  if (!proceed) {
    info('\n👋 Demo complete without creating issues.');
    await confirm('Return to main menu?', true);
    return;
  }

  showCode('Unified create() call:',
    `const result = await jml.issues.create(parsedData);`
  );

  const createSpinner = ora('Creating issues...').start();
  try {
    const jml = new JML({
      baseUrl: config.baseUrl,
      auth: { token: config.token },
      apiVersion: config.apiVersion || 'v2',
      redis: config.redis,
    });

    const result = await jml.issues.create(parseResult.data);
    await jml.disconnect();

    createSpinner.succeed(`Created ${result.succeeded}/${result.total} issues`);
    summarizeBulkResult(result, parseResult.data, config);
  } catch (err) {
    createSpinner.fail('Issue creation failed');
    error(err.message);
  }

  await confirm('Return to main menu?', true);
}

function summarizeBulkResult(result, originalRows, config) {
  console.log('\n📈 Creation Summary:\n');
  success(`Succeeded: ${result.succeeded}`);
  if (result.failed > 0) {
    warning(`Failed: ${result.failed}`);
  }
  info(`Total: ${result.total}`);
  if (result.manifest?.id) {
    info(`Manifest ID: ${result.manifest.id}`);
  }
  console.log('');

  if (result.succeeded > 0) {
    console.log('✅ Created Issues:');
    result.results.forEach((entry, idx) => {
      if (entry.success) {
        console.log(`  ${entry.key} - ${originalRows[idx].Summary || '(no summary)'}`);
      }
    });
    console.log('');
  }

  if (result.failed > 0) {
    console.log('❌ Failed Rows:');
    result.results.forEach((entry, idx) => {
      if (!entry.success) {
        console.log(`  Row ${idx + 1}: ${originalRows[idx].Summary || '(no summary)'}`);
        if (entry.error) {
          const errorMsg = entry.error.errors?.validation
            || Object.values(entry.error.errors || {}).join(', ')
            || JSON.stringify(entry.error);
          console.log(`     Error: ${errorMsg}`);
        }
      }
    });
    console.log('');
  }

  if (result.manifest?.created) {
    showCode('Manifest snapshot:', JSON.stringify({
      id: result.manifest.id,
      total: result.manifest.total,
      succeeded: result.manifest.succeeded,
      failed: result.manifest.failed,
      createdSample: Object.entries(result.manifest.created).slice(0, 3),
    }, null, 2));
  }

  if (result.succeeded > 0 && result.manifest?.created) {
    const keys = Object.values(result.manifest.created);
    const jql = `key in (${keys.join(', ')})`;
    const link = `${config.baseUrl}/issues/?jql=${encodeURIComponent(jql)}`;
    info('\n🔍 View created issues:');
    info(`   ${link}`);
  }
}

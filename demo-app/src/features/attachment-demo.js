/**
 * Single-issue attachment demo.
 *
 * Demonstrates the public JML API using one or more local files.
 */

import path from 'node:path';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, showIssue, showCode, pause, warning } from '../ui/display.js';
import { input, confirm } from '../ui/prompts.js';

export async function runAttachmentDemo(config) {
  showHeader('Single-Issue Attachments');
  info('Create one issue and upload one or more local files after creation.\n');

  const project = await input('Project key:', config.defaultProjectKey || 'ENG');
  const issueType = await input('Issue type:', 'Task');
  const summary = await input(
    'Summary:',
    `Attachment demo - ${new Date().toLocaleString()}`
  );
  const defaultPath = path.resolve(process.cwd(), 'fixtures', 'attachment-demo.txt');
  const fileInput = await input(
    'Local attachment path(s), comma-separated:',
    defaultPath
  );
  const attachments = fileInput
    .split(',')
    .map((filePath) => filePath.trim())
    .filter(Boolean);

  if (attachments.length === 0) {
    warning('At least one local attachment path is required.');
    await pause();
    return;
  }

  const payload = {
    Project: project,
    'Issue Type': issueType,
    Summary: summary,
    attachments,
  };

  showCode('Code:', `await jml.issues.create(${JSON.stringify(payload, null, 2)});`);

  if (!await confirm('Create the issue and upload these files?', true)) {
    warning('Cancelled - no issue created.');
    await pause();
    return;
  }

  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis,
  });

  const spinner = ora('Creating issue and uploading attachments...').start();

  try {
    const result = await jml.issues.create(payload);
    spinner.succeed('Issue and attachments created!');
    showIssue(result.key, config.baseUrl, payload);

    if (result.attachments) {
      success(`Uploaded ${result.attachments.length} attachment(s).`);
      for (const attachment of result.attachments) {
        info(`  • ${attachment.filename}`);
      }
    }
  } catch (err) {
    spinner.fail('Attachment demo failed');
    error(err instanceof Error ? err.message : String(err));
    if (err?.details?.issueKey) {
      info(`The issue was created and remains available as ${err.details.issueKey}.`);
    }
  } finally {
    await jml.disconnect();
  }

  await pause();
}

/**
 * Attachment demos.
 *
 * runAttachmentDemo    – create an issue and upload files at creation time.
 * runAddAttachmentsDemo – upload files to an already-existing issue via
 *                         jml.issues.addAttachments().
 */

import path from 'node:path';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, showIssue, showCode, pause, warning } from '../ui/display.js';
import { input, confirm } from '../ui/prompts.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parse a comma-separated file-path string into a trimmed, non-empty array. */
function parseFilePaths(raw) {
  return raw.split(',').map((p) => p.trim()).filter(Boolean);
}

/** Build a JML instance from the shared demo config object. */
function buildJml(config) {
  return new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis,
  });
}

/**
 * Print a list of normalized attachment records returned by addAttachments().
 * Expected shape: { id, filename, size }
 */
function printAttachmentRecords(attachments) {
  success(`Uploaded ${attachments.length} attachment(s).`);
  for (const a of attachments) {
    info(`  • ${a.filename}${a.size != null ? ` (${a.size} bytes)` : ''} [id: ${a.id}]`);
  }
}

// ---------------------------------------------------------------------------
// Demo: create issue + upload at creation time
// ---------------------------------------------------------------------------

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
  const attachments = parseFilePaths(fileInput);

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

  const jml = buildJml(config);
  const spinner = ora('Creating issue and uploading attachments...').start();

  try {
    const result = await jml.issues.create(payload);
    spinner.succeed('Issue and attachments created!');
    showIssue(result.key, config.baseUrl, payload);

    if (result.attachments) {
      printAttachmentRecords(result.attachments);
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

// ---------------------------------------------------------------------------
// Demo: attach files to an already-existing issue
// ---------------------------------------------------------------------------

export async function runAddAttachmentsDemo(config) {
  showHeader('Attach Files to an Existing Issue');
  info('Upload one or more local files to an issue that already exists in JIRA.\n');

  const issueKey = await input('Issue key (e.g. ENG-42):');
  if (!issueKey || !issueKey.trim()) {
    warning('An issue key is required.');
    await pause();
    return;
  }

  const defaultPath = path.resolve(process.cwd(), 'fixtures', 'attachment-demo.txt');
  const fileInput = await input(
    'Local attachment path(s), comma-separated:',
    defaultPath
  );
  const attachments = parseFilePaths(fileInput);

  if (attachments.length === 0) {
    warning('At least one local attachment path is required.');
    await pause();
    return;
  }

  showCode(
    'Code:',
    `await jml.issues.addAttachments('${issueKey.trim()}', ${JSON.stringify(attachments, null, 2)});`
  );

  if (!await confirm(`Upload ${attachments.length} file(s) to ${issueKey.trim()}?`, true)) {
    warning('Cancelled - no files uploaded.');
    await pause();
    return;
  }

  const jml = buildJml(config);
  const spinner = ora(`Uploading attachments to ${issueKey.trim()}...`).start();

  try {
    const result = await jml.issues.addAttachments(issueKey.trim(), attachments);
    spinner.succeed('Attachments uploaded!');
    printAttachmentRecords(result);
  } catch (err) {
    spinner.fail('Upload failed');
    error(err instanceof Error ? err.message : String(err));
    if (err?.status === 403 || err?.status === 413) {
      info('Hint: the error message above describes the likely cause.');
    }
  } finally {
    await jml.disconnect();
  }

  await pause();
}

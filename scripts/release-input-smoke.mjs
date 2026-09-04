// Creates and deletes test issues in the project configured by .env.test.
// Run after npm run build: node scripts/release-input-smoke.mjs --live
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { JML, loadConfig, JiraClientImpl } from '../dist/index.js';
if (!process.argv.includes('--live')) throw new Error('Pass --live to create temporary Jira test issues');
dotenv.config({ path: '.env.test' });
const config = { ...loadConfig(), redis: { host: '127.0.0.1', port: Number(process.env.JML_SMOKE_REDIS_PORT || 16379) }, deployment: 'server', timeout: { cleanupMarkers: false } };
const jml = new JML(config);
const client = new JiraClientImpl(config);
const created = [];
try {
  const myself = await client.get('/rest/api/2/myself');
  const description = '  User said "broken". C:\\temp\\file\n\nUnicode: Café \u200B\n  Keep these spaces  ';
  const common = { Project: process.env.JIRA_PROJECT_KEY, 'Issue Type': 'Task', Reporter: { name: myself.name }, Summary: 'JML 3.0 release acceptance ' + Date.now() };
  const cases = [
    ['yaml', 'unquoted estimate', 'Time Tracking: 2h'],
    ['yaml', 'quoted estimate', 'Time Tracking: "2h"'],
    ['yaml', 'nested estimate', 'Time Tracking:\n  originalEstimate: "2h"'],
    ['json', 'nested estimate and quoted literal block', ''],
  ];
  for (const [format, name, estimate] of cases) {
    const data = format === 'yaml'
      ? Object.entries(common).map(([k, v]) => k + ': ' + JSON.stringify(v)).join('\n') + '\n' + estimate + '\nSprint: ""\nDescription: <<<\n' + description + '\n>>>'
      : JSON.stringify({ ...common, 'Time Tracking': { originalEstimate: '2h' }, Sprint: '' }).slice(0, -1) + ',"Description": "<<<\n' + description + '\n>>>"}';
    const input = { data, format };
    const preview = await jml.issues.preview(input);
    const validation = await jml.issues.create(input, { validate: true });
    assert.equal(validation.valid, true, JSON.stringify(validation));
    assert.equal(preview[0].valid, true, JSON.stringify(preview[0].warnings));
    assert.deepEqual(preview[0].payload, validation.results[0].payload);
    assert.equal(preview[0].payload.fields.description, description);
    assert.equal(preview[0].payload.fields.customfield_10101, undefined);
    const result = await jml.issues.create(input);
    created.push(...Object.values(result.manifest?.created || {}));
    assert.equal(result.failed, 0, JSON.stringify(result));
    const key = result.results[0].key;
    const saved = await client.get('/rest/api/2/issue/' + key + '?fields=description,timetracking,customfield_10101');
    assert.equal(saved.fields.description, description);
    assert.equal(saved.fields.timetracking.originalEstimateSeconds, 7200);
    assert.ok(!saved.fields.customfield_10101?.length);
    console.log(JSON.stringify({ format, name, key, previewMatchesValidation: true, descriptionExact: true, originalEstimateSeconds: 7200, sprintOmitted: true }));
  }
} finally {
  try {
    for (const key of created) {
      try {
        await client.delete('/rest/api/2/issue/' + key);
        console.log('Deleted test issue ' + key);
      } catch (error) {
        console.warn('Test issue remains:', key, error.message);
        if (error.details?.status !== 403) process.exitCode = 1;
      }
    }
  } finally { await jml.disconnect(); }
}


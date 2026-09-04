// Uses the configured test Jira and leaves the created issues for inspection.
// Build first, then run: node scripts/acceptance-2.2.1.mjs --live
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { JML, loadConfig, JiraClientImpl } from '../dist/index.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to create Jira acceptance issues');
dotenv.config({ path: '.env.test' });
const config = { ...loadConfig(), timeout: { cleanupMarkers: false } };
const jml = new JML(config);
const client = new JiraClientImpl(config);
const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (url, options) => {
  if (options?.method === 'POST' && String(url).includes('/issue')) {
    requests.push(JSON.parse(options.body));
  }
  return originalFetch(url, options);
};

try {
  const project = process.env.JIRA_PROJECT_KEY;
  const types = await client.get(`/rest/api/2/issue/createmeta/${project}/issuetypes`);
  const task = types.values.find(type => type.name === 'Task');
  assert.ok(task, 'Configured project must have Task issue type');
  const metadata = await client.get(`/rest/api/2/issue/createmeta/${project}/issuetypes/${task.id}`);
  const sprint = metadata.values.find(field => field.schema?.custom === 'com.pyxis.greenhopper.jira:gh-sprint');
  assert.ok(sprint, 'Configured Task must expose Sprint');
  const sprintId = sprint.fieldId;
  const settings = await client.get('/rest/api/2/configuration');
  const hoursPerDay = settings.timeTrackingConfiguration.workingHoursPerDay;
  assert.ok(Number(hoursPerDay) > 0, 'Jira must report its working hours per day');
  const expectedSeconds = Number(hoursPerDay) * 3600;
  const myself = await client.get('/rest/api/2/myself');
  const common = { Project: project, 'Issue Type': 'Task', Reporter: { name: myself.name } };
  const description = 'User said "broken". C:\\work\\file\n\n  Keep internal spaces.';

  for (const [format, name, quoted] of [
    ['yaml', 'unquoted scalar and empty Sprint', false],
    ['yaml', 'quoted scalar and null Sprint', true],
    ['json', 'nested estimate and quoted literal block', true],
    ['json', 'escaped quotes and backslashes', false],
  ]) {
    const fields = { ...common, Summary: 'JML 2.2.1 acceptance ' + name + ' ' + Date.now() };
    const expectedDescription = format === 'json' && !quoted ? 'User said "broken". C:\\work\\file' : description;
    let data;
    if (format === 'yaml') {
      data = Object.entries(fields).map(([key, value]) => key + ': ' + JSON.stringify(value)).join('\n')
        + '\ntimeTracking: ' + (quoted ? '"1d"' : '1d')
        + '\nSprint: ' + (quoted ? 'null' : '""')
        + '\nDescription: <<<\n  ' + description + '  \n>>>';
    } else if (quoted) {
      data = JSON.stringify({ ...fields, timeTracking: { originalEstimate: '1d' }, Sprint: '' }).slice(0, -1)
        + ',"Description":"<<<\n  ' + description + '  \n>>>"}';
    } else {
      data = JSON.stringify({ ...fields, timeTracking: '1d', Sprint: '', Description: expectedDescription });
    }
    const start = requests.length;
    const result = await jml.issues.create({ data, format });
    assert.equal(result.failed, 0, JSON.stringify(result));
    assert.equal(requests.length, start + 1);
    const sent = requests[start].issueUpdates[0].fields;
    assert.deepEqual(sent.timetracking, { originalEstimate: '1d' });
    assert.equal(Object.hasOwn(sent, sprintId), false);
    assert.equal(sent.description, expectedDescription);
    const key = result.results[0].key;
    const saved = await client.get(`/rest/api/2/issue/${key}?fields=description,timetracking,${sprintId}`);
    assert.equal(saved.fields.timetracking.originalEstimateSeconds, expectedSeconds);
    assert.equal(saved.fields.description, expectedDescription);
    assert.ok(!saved.fields[sprintId]?.length);
    console.log(JSON.stringify({ name, key, finalRequestCorrect: true, readbackCorrect: true }));
  }
} finally {
  globalThis.fetch = originalFetch;
  await jml.disconnect();
}

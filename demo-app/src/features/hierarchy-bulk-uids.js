/**
 * Hierarchy Level Batching Demo (E4-S13)
 *
 * Demonstrates UID-based parent/child creation in level-based batches.
 * Shows how a single payload with uid + Parent references is processed
 * into multiple bulk API calls (one per hierarchy level).
 */

import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, info, warning, success, error, showCode } from '../ui/display.js';
import { confirm } from '../ui/prompts.js';

export async function runHierarchyBulkUidDemo(config) {
  showHeader('Hierarchy Level Batching (UIDs, E4-S13)');

  info('This demo builds one payload that includes every JPO hierarchy level (Container → ... → Sub-task).');
  info('The payload is passed to jml.issues.create() once, and the library batches per level automatically.');

  warning('\n⚠️  This will create real issues in your JIRA project.\n');
  const proceed = await confirm('Continue and create demo issues?', false);
  if (!proceed) {
    info('Demo cancelled.');
    return;
  }

  const projectKey = config.defaultProjectKey || 'DEMO';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis || { host: 'localhost', port: 6379 },
  });

  let buildResult;
  try {
    buildResult = await buildJpoHierarchyPayload(jml, projectKey, timestamp);
    if (!buildResult) {
      warning('Full JPO hierarchy not available. Using fallback Epic→Story→Sub-task payload.');
      buildResult = buildFallbackHierarchy(projectKey, timestamp);
    }
  } catch (err) {
    await jml.disconnect();
    error(`Failed to build hierarchy payload: ${err.message}`);
    return;
  }

  const { payload, levelStats, summaryLines } = buildResult;
  summaryLines.forEach(line => info(line));
  showCode('Bulk input payload', JSON.stringify(payload, null, 2));

  const spinner = ora('Creating hierarchy with level-based batching...').start();

  try {
    const result = await jml.issues.create(payload);
    spinner.succeed('Hierarchy created with level-based batching');

    summarizeResults(result, levelStats);

    info('Tip: Retry the same payload with { retry: manifest.id } to resume failed rows using uidMap.');
  } catch (err) {
    spinner.fail('Hierarchy creation failed');
    error(err.message);
  } finally {
    await jml.disconnect();
  }

  await confirm('Return to main menu?', true);
}

async function buildJpoHierarchyPayload(jml, projectKey, timestamp) {
  let hierarchy;
  try {
    hierarchy = await jml.getHierarchy({ refresh: true });
  } catch {
    return null;
  }

  if (!hierarchy || hierarchy.length === 0) {
    return null;
  }

  const issueTypes = await jml.getIssueTypes(projectKey);
  const issueTypeById = new Map(issueTypes.map(type => [type.id, type.name]));

  const levels = [...hierarchy]
    .sort((a, b) => b.id - a.id)
    .map(level => ({
      ...level,
      issueTypeName: level.issueTypeIds?.map(id => issueTypeById.get(id)).find(Boolean),
    }))
    .filter(level => level.issueTypeName);

  if (levels.length < 3) {
    return null;
  }

  const TARGET_COUNTS = [1, 2, 4, 6, 8, 8];
  const nodesPerLevel = [];
  const payload = [];
  const levelStats = [];

  levels.forEach((level, index) => {
    const count = TARGET_COUNTS[index] || TARGET_COUNTS[TARGET_COUNTS.length - 1];
    const parents = nodesPerLevel[index - 1] || [];
    const nodes = [];
    const startIndex = payload.length;

    for (let n = 0; n < count; n++) {
      const uid = `${slug(level.issueTypeName)}-${index}-${n}-${timestamp}`;
      const record = {
        uid,
        Project: projectKey,
        'Issue Type': level.issueTypeName,
        Summary: `[Demo] ${level.issueTypeName} L${index} #${n + 1} ${timestamp}`,
      };

      if (level.issueTypeName.toLowerCase() === 'epic') {
        record['Epic Name'] = `[Demo] ${level.issueTypeName} L${index} #${n + 1} ${timestamp}`;
      }

      if (index > 0 && parents.length > 0) {
        record.Parent = parents[n % parents.length].uid;
      }

      nodes.push({ uid, record });
      payload.push(record);
    }

    nodesPerLevel.push(nodes);
    levelStats.push({
      name: level.issueTypeName,
      count: nodes.length,
      jpoLevelId: level.id,
      startIndex,
      endIndex: payload.length,
    });
  });

  return {
    payload,
    levelStats,
    summaryLines: [
      `Project: ${projectKey}`,
      `JPO levels detected: ${levels.length}`,
      ...levelStats.map(stat => `  Level (JPO id ${stat.jpoLevelId}) → ${stat.name}: ${stat.count} issues`),
      `Total issues in payload: ${payload.length}`,
    ],
  };
}

function buildFallbackHierarchy(projectKey, timestamp) {
  const epicUid = `epic-${timestamp}`;
  const task1Uid = `task1-${timestamp}`;
  const task2Uid = `task2-${timestamp}`;

  const subtasks = Array.from({ length: 10 }).map((_, i) => ({
    uid: `subtask-${i + 1}-${timestamp}`,
    Project: projectKey,
    'Issue Type': 'Sub-task',
    Summary: `[Demo] Sub-task ${i + 1} ${timestamp}`,
    Parent: i < 5 ? task1Uid : task2Uid,
  }));

  const payload = [
    {
      uid: epicUid,
      Project: projectKey,
      'Issue Type': 'Epic',
      Summary: `[Demo] Epic ${timestamp}`,
      'Epic Name': `[Demo] Epic ${timestamp}`,
    },
    {
      uid: task1Uid,
      Project: projectKey,
      'Issue Type': 'Task',
      Summary: `[Demo] Task 1 ${timestamp}`,
      Parent: epicUid,
    },
    {
      uid: task2Uid,
      Project: projectKey,
      'Issue Type': 'Task',
      Summary: `[Demo] Task 2 ${timestamp}`,
      Parent: epicUid,
    },
    ...subtasks,
  ];

  const levelStats = [
    { name: 'Epic', count: 1, jpoLevelId: 'fallback', startIndex: 0, endIndex: 1 },
    { name: 'Task', count: 2, jpoLevelId: 'fallback', startIndex: 1, endIndex: 3 },
    { name: 'Sub-task', count: 10, jpoLevelId: 'fallback', startIndex: 3, endIndex: payload.length },
  ];

  return {
    payload,
    levelStats,
    summaryLines: [
      `Project: ${projectKey}`,
      'Using fallback hierarchy: Epic → Task → Sub-task',
      `Total issues in payload: ${payload.length}`,
    ],
  };
}

function summarizeResults(result, levelStats) {
  success(`Succeeded: ${result.succeeded} / ${result.total}`);

  if (result.manifest?.uidMap) {
    showCode('UID → Key mappings (manifest.uidMap)', JSON.stringify(result.manifest.uidMap, null, 2));
  }

  if (!result.results) {
    return;
  }

  levelStats.forEach(stat => {
    const levelResults = result.results.filter(
      r => r.index >= stat.startIndex && r.index < stat.endIndex,
    );
    const successes = levelResults.filter(r => r.success).length;
    info(`Level ${stat.name}: ${successes}/${stat.count} succeeded`);
  });

  const failures = result.results.filter(r => !r.success);
  if (failures.length > 0) {
    warning(`Failures (${failures.length} issues):`);
    failures.forEach(r => {
      warning(`  Index ${r.index}: ${JSON.stringify(r.error)}`);
    });
  } else {
    info('All records succeeded.');
  }
}

function slug(value) {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

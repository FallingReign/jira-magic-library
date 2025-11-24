/**
 * User Ambiguity Policy Explorer
 *
 * Demonstrates how the user converter behaves under different ambiguity policies.
 * Runs conversions in dry-run mode so no issues are actually created.
 */

import { JML } from 'jira-magic-library';
import { showHeader, info, success, error, warning, showCode } from '../ui/display.js';
import { input, confirm } from '../ui/prompts.js';

const POLICIES = ['first', 'error', 'score'];

export async function runUserAmbiguityDemo(config) {
  showHeader('User Ambiguity Policy Explorer');
  info('This demo resolves Reporter values using dry-run conversions. No issues are created.');

  const defaultProject = config.defaultProjectKey || 'ENG';
  const projectAnswer = await input('Project key to use for dry-run conversions', defaultProject);
  const projectKey = (projectAnswer?.trim() || defaultProject).toUpperCase();

  const issueTypeAnswer = await input('Issue type to use', 'Task');
  const issueType = issueTypeAnswer?.trim() || 'Task';

  let continueLoop = true;
  while (continueLoop) {
    const userValue = (await input('Enter user email / username / display name (leave blank to exit)', '')).trim();

    if (!userValue) {
      info('No value entered. Returning to main menu.');
      break;
    }

    for (const policy of POLICIES) {
      await runPolicyLookup({
        policy,
        userValue,
        config,
        projectKey,
        issueType,
      });
    }

    continueLoop = await confirm('Look up another user?', true);
  }
}

async function runPolicyLookup({ policy, userValue, config, projectKey, issueType }) {
  info(`\nPolicy: ${policy.toUpperCase()} - resolving "${userValue}"`);

  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis,
    ambiguityPolicy: { user: policy },
  });

  try {
    const dryRunIssue = await jml.issues.create(
      {
        Project: projectKey,
        'Issue Type': issueType,
        Summary: `[policy-demo] ${policy} lookup`,
        Reporter: userValue,
      },
      { validate: true }
    );

    const reporter = dryRunIssue?.fields?.reporter;

    if (reporter) {
      const descriptor = reporter.accountId ?? reporter.name ?? 'unknown';
      success(`Resolved reporter to ${descriptor}`);
      showCode(`Reporter payload (${policy})`, JSON.stringify(reporter, null, 2));

      if (policy === 'score') {
        await showScoreBreakdown({
          config,
          projectKey,
          issueType,
          userValue,
        });
      }
    } else {
      warning('Reporter field was not present in the converted payload.');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(message);

    // Show candidate list when AmbiguityError details include them
    const candidates = err?.details?.candidates || err?.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      showCode(
        `Candidates returned (${policy})`,
        JSON.stringify(
          candidates.map((c, index) => ({ index: index + 1, ...c })),
          null,
          2
        )
      );
    }
  } finally {
    await jml.disconnect().catch(() => undefined);
  }
}

async function showScoreBreakdown({ config, projectKey, issueType, userValue }) {
  const strictClient = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis,
    ambiguityPolicy: { user: 'error' },
  });

  try {
    await strictClient.issues.create(
      {
        Project: projectKey,
        'Issue Type': issueType,
        Summary: `[policy-demo] strict lookup`,
        Reporter: userValue,
      },
      { validate: true }
    );

    info('No alternate candidates were returned under strict mode.');
  } catch (err) {
    if (err?.code === 'AMBIGUITY_ERROR') {
      const candidates = err.details?.candidates || err.candidates;
      if (Array.isArray(candidates) && candidates.length > 0) {
        const leaderboard = candidates
          .map((candidate) => ({
            rank: candidate.index ?? 0,
            name: candidate.name,
            email: candidate.email,
            id: candidate.id,
            confidence: candidate.confidence,
            matchType: candidate.matchType,
          }))
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

        showCode(
          'Score policy candidate ranking',
          JSON.stringify(leaderboard, null, 2)
        );
      }
    } else {
      warning('Unable to fetch candidate scores for this lookup.');
    }
  } finally {
    await strictClient.disconnect().catch(() => undefined);
  }
}

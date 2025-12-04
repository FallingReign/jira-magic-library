/**
 * User Lookup & Fuzzy Matching Explorer
 *
 * Story: BACKLOG-S1 (ambiguity policy), BACKLOG-S2 (fuzzy matching)
 * 
 * Demonstrates:
 * - Fuzzy matching for typos (e.g., "Jon Smith" → "John Smith")
 * - Ambiguity policies (first, error, score) when multiple matches found
 * - Match confidence scores and candidate rankings
 * 
 * Runs conversions in dry-run mode so no issues are actually created.
 * 
 * Updated: Uses shared JML instance with per-call config overrides
 * to avoid creating multiple Redis connections.
 */

import { showHeader, info, success, error, warning, showCode } from '../ui/display.js';
import { input, confirm } from '../ui/prompts.js';

const POLICIES = ['first', 'error', 'score'];

/**
 * Run the user ambiguity demo
 * 
 * @param {object} config - Raw config object (for project defaults)
 * @param {import('jira-magic-library').JML} jml - Shared JML instance
 */
export async function runUserAmbiguityDemo(config, jml) {
  showHeader('🔍 User Lookup & Fuzzy Matching Explorer');
  info('This demo shows how user lookups work with fuzzy matching and ambiguity policies.');
  info('Try typos like "Jon Smith" or partial names like "J Smith" to see fuzzy matching in action.\n');

  const defaultProject = config.defaultProjectKey || 'ENG';
  const projectAnswer = await input('Project key to use for dry-run conversions', defaultProject);
  const projectKey = (projectAnswer?.trim() || defaultProject).toUpperCase();

  const issueTypeAnswer = await input('Issue type to use', 'Task');
  const issueType = issueTypeAnswer?.trim() || 'Task';

  let continueLoop = true;
  while (continueLoop) {
    const userValue = (await input(
      'Enter user value (email/name/display name, try typos!)',
      ''
    )).trim();

    if (!userValue) {
      info('No value entered. Returning to main menu.');
      break;
    }

    // First, show fuzzy matching comparison
    console.log('');
    info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    info('                        FUZZY MATCHING COMPARISON');
    info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await runFuzzyComparison({
      jml,
      userValue,
      projectKey,
      issueType,
    });

    // Then show ambiguity policy comparison (with fuzzy enabled)
    console.log('');
    info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    info('                      AMBIGUITY POLICY COMPARISON');
    info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    info('(Using fuzzy matching enabled, threshold 0.3)\n');

    for (const policy of POLICIES) {
      await runPolicyLookup({
        jml,
        policy,
        userValue,
        projectKey,
        issueType,
        fuzzyEnabled: true,
        threshold: 0.3,
      });
    }

    continueLoop = await confirm('Look up another user?', true);
  }
}

/**
 * Compare fuzzy matching ON vs OFF
 */
async function runFuzzyComparison({ jml, userValue, projectKey, issueType }) {
  // Test with fuzzy OFF
  info('\n📴 Fuzzy Matching: DISABLED');
  await runPolicyLookup({
    jml,
    policy: 'first',
    userValue,
    projectKey,
    issueType,
    fuzzyEnabled: false,
    threshold: 0.3,
    showCandidates: false,
  });

  // Test with fuzzy ON
  info('\n✅ Fuzzy Matching: ENABLED (threshold: 0.3)');
  await runPolicyLookup({
    jml,
    policy: 'first',
    userValue,
    projectKey,
    issueType,
    fuzzyEnabled: true,
    threshold: 0.3,
    showCandidates: true,
  });
}

/**
 * Run a single lookup with specific configuration using per-call overrides
 */
async function runPolicyLookup({ 
  jml,
  policy, 
  userValue, 
  projectKey, 
  issueType,
  fuzzyEnabled = true,
  threshold = 0.3,
  showCandidates = true,
}) {
  const configLabel = fuzzyEnabled 
    ? `policy=${policy}, fuzzy=ON` 
    : `policy=${policy}, fuzzy=OFF`;

  try {
    // Use per-call config overrides instead of creating new JML instances
    const dryRunIssue = await jml.issues.create(
      {
        Project: projectKey,
        'Issue Type': issueType,
        Summary: `[demo] ${policy} lookup`,
        Assignee: userValue,
      },
      { 
        validate: true,
        // Per-call config overrides (new feature!)
        ambiguityPolicy: { user: policy },
        fuzzyMatch: {
          user: {
            enabled: fuzzyEnabled,
            threshold,
          },
        },
      }
    );

    const assignee = dryRunIssue?.fields?.assignee;

    if (assignee) {
      const identifier = assignee.accountId ?? assignee.name ?? 'unknown';
      success(`   ✓ [${configLabel}] Resolved → ${identifier}`);

      // For 'score' policy, also show the scoring breakdown
      if (policy === 'score' && showCandidates) {
        await showScoreBreakdown({
          jml,
          projectKey,
          issueType,
          userValue,
          fuzzyEnabled,
          threshold,
        });
      }
    } else {
      warning(`   ⚠ [${configLabel}] Assignee field not in converted payload`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('not found')) {
      error(`   ✗ [${configLabel}] User not found`);
      if (!fuzzyEnabled) {
        info('      → Try with fuzzy matching enabled to tolerate typos');
      }
    } else if (err?.code === 'AMBIGUITY_ERROR' || err?.name === 'AmbiguityError') {
      warning(`   ⚠ [${configLabel}] Multiple matches found (AmbiguityError)`);
      
      // Show candidates with their scores
      const candidates = err?.details?.candidates || err?.candidates;
      const totalCandidates = err?.details?.totalCandidates || candidates?.length || 0;
      if (Array.isArray(candidates) && candidates.length > 0 && showCandidates) {
        const formatted = candidates.map((c, i) => ({
          '#': i + 1,
          displayName: c.displayName || c.name || 'unknown',
          username: c.username || c.id || '-',
          email: c.email || '-',
          confidence: c.confidence?.toFixed(3) || '-',
          combinedScore: c.combinedScore?.toFixed(3) || '-',
          matchType: c.matchType || '-',
        }));
        const truncationNote = totalCandidates > candidates.length 
          ? ` (showing top ${candidates.length} of ${totalCandidates})` 
          : '';
        showCode(`Candidates${truncationNote}`, formatCandidateTable(formatted));
      }
    } else {
      error(`   ✗ [${configLabel}] ${message}`);
    }
  }
  // No jml.disconnect() - we're using a shared instance!
}

/**
 * Show score breakdown by forcing 'error' policy to get all candidates
 */
async function showScoreBreakdown({ jml, projectKey, issueType, userValue, fuzzyEnabled, threshold }) {
  try {
    // Use per-call override to force 'error' policy
    await jml.issues.create(
      {
        Project: projectKey,
        'Issue Type': issueType,
        Summary: `[demo] score breakdown`,
        Assignee: userValue,
      },
      { 
        validate: true,
        ambiguityPolicy: { user: 'error' },
        fuzzyMatch: {
          user: { enabled: fuzzyEnabled, threshold },
        },
      }
    );

    // If we get here, there was only one match
    info('      (Single match found - no scoring competition)');
  } catch (err) {
    if (err?.code === 'AMBIGUITY_ERROR' || err?.name === 'AmbiguityError') {
      const candidates = err.details?.candidates || err.candidates;
      const totalCandidates = err.details?.totalCandidates || candidates?.length || 0;
      if (Array.isArray(candidates) && candidates.length > 0) {
        // Candidates are already sorted by confidence then combined score
        const sorted = candidates.map((c) => ({
          displayName: c.displayName || c.name || 'unknown',
          username: c.username || c.id || '-',
          email: c.email || '-',
          confidence: c.confidence || 0,
          combinedScore: c.combinedScore || 0,
          matchType: c.matchType || '-',
        }));

        const truncationNote = totalCandidates > candidates.length 
          ? ` (showing top ${candidates.length} of ${totalCandidates})` 
          : '';
        info(`      Score policy picked the best candidate (lowest combined score wins)${truncationNote}:`);
        showCode('Candidate Ranking', formatCandidateTable(
          sorted.map((c, i) => ({
            '#': i + 1,
            displayName: c.displayName || c.name,
            username: c.username || c.id || '-',
            email: c.email,
            confidence: c.confidence.toFixed(3),
            combinedScore: c.combinedScore.toFixed(3),
            matchType: c.matchType,
            selected: i === 0 ? '← SELECTED' : '',
          }))
        ));
      }
    }
  }
  // No jml.disconnect() - we're using a shared instance!
}

/**
 * Format candidates as a simple table string
 */
function formatCandidateTable(candidates) {
  if (!candidates || candidates.length === 0) return 'No candidates';
  
  const lines = candidates.map((c) => {
    const parts = [
      `#${c['#']}`,
      (c.displayName || c.name || 'unknown').padEnd(25),
      (c.username || '-').padEnd(20),
      (c.email || '-').padEnd(35),
      `conf: ${c.confidence}`,
    ];
    // Add combined score if available
    if (c.combinedScore !== undefined && c.combinedScore !== '-') {
      parts.push(`score: ${c.combinedScore}`);
    }
    parts.push(`(${c.matchType})`);
    if (c.selected) {
      parts.push(c.selected);
    }
    return parts.join('  ').trim();
  });

  // Add header
  const header = '#   displayName                username              email                                conf        score';
  return header + '\n' + '─'.repeat(120) + '\n' + lines.join('\n');
}

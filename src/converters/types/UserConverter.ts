/**
 * User Type Converter
 * Story: E2-S08, BACKLOG-S1 (ambiguity policy), BACKLOG-S2 (fuzzy matching)
 *
 * Converts user values for fields with type: "user"
 *
 * Accepts:
 * - Email address: "alex@example.com" (case-insensitive)
 * - Display name: "Alex Johnson" (case-insensitive)
 * - Object with name: { name: "alex" } (Server format)
 * - Object with accountId: { accountId: "5d8c..." } (Cloud format)
 * - null/undefined for optional fields
 *
 * Returns:
 * - Server: { name: "username" }
 * - Cloud: { accountId: "..." }
 *
 * Features:
 * - Email lookup via JIRA API
 * - Display name lookup via JIRA API
 * - Policy-driven ambiguity handling (first/error/score)
 * - Fuzzy matching for typo tolerance (BACKLOG-S2)
 * - Server vs Cloud format auto-detection
 * - Full user directory caching (reduces API calls for bulk operations)
 * - Stale-while-revalidate cache pattern
 * - Graceful cache degradation
 */

import Fuse from 'fuse.js';
import type { FieldConverter, ConversionContext } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { AmbiguityError } from '../../errors/AmbiguityError.js';
import type { AmbiguityPolicy, JMLConfig } from '../../types/config.js';
import { extractFieldValue } from '../../utils/extractFieldValue.js';

/**
 * Simple email validation regex
 * Matches: user@domain.com, user.name@sub.domain.co.uk, user+tag@domain.com
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_AMBIGUITY_POLICIES: AmbiguityPolicy[] = ['first', 'error', 'score'];

type MatchReason = 'email-exact' | 'username-exact' | 'username-prefix' | 'display-partial' | 'fuzzy-match';

const MATCH_CONFIDENCE: Record<MatchReason, number> = {
  'email-exact': 1,
  'username-exact': 0.95,
  'username-prefix': 0.7,
  'fuzzy-match': 0.5,
  'display-partial': 0.4,
};

/**
 * JIRA user object structure
 */
interface JiraUser {
  name?: string; // Server format
  accountId?: string; // Cloud format
  displayName: string;
  emailAddress: string;
  active: boolean;
}

interface UserMatch {
  user: JiraUser;
  reason: MatchReason;
  confidence: number;
}

/**
 * Fetch all users from JIRA with pagination (Server/DC only)
 * 
 * Uses the "." wildcard which matches all users in JIRA Server/DC.
 * Paginates through results since API caps at 1000 per request.
 * 
 * Note: This approach is Server/DC specific. Cloud would need
 * a different strategy (e.g., /rest/api/3/users/search).
 * 
 * @param context - Converter context with client
 * @returns Array of all users
 */
async function fetchAllUsers(context: ConversionContext): Promise<JiraUser[]> {
  if (!context.client) {
    return [];
  }

  const allUsers: JiraUser[] = [];
  let startAt = 0;
  const maxResults = 1000; // API max per request

  while (true) {
    // Use "." as wildcard - matches all users in JIRA Server/DC
    const batch = (await context.client.get('/rest/api/2/user/search', {
      username: '.',
      startAt,
      maxResults,
    })) as JiraUser[];

    if (!batch || batch.length === 0) {
      break;
    }

    allUsers.push(...batch);

    // Increment by actual results returned, not maxResults
    startAt += batch.length;

    // If we got fewer than requested, we've reached the end
    if (batch.length < maxResults) {
      break;
    }
  }

  return allUsers;
}

export const convertUserType: FieldConverter = async (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Extract value from JIRA API object formats (e.g., { name: "john.doe" })
  // Returns unchanged if already id/accountId/key, or complex/nested structure
  value = extractFieldValue(value);

  // Passthrough: already-resolved objects with accountId
  if (typeof value === 'object' && value !== null && 'accountId' in value) {
    return value;
  }

  // Must be a string (email or display name)
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Expected string or object for field "${fieldSchema.name}", got ${typeof value}`,
      { field: fieldSchema.id, value, type: typeof value }
    );
  }

  // Trim whitespace
  const searchTerm = value.trim();

  if (searchTerm === '') {
    throw new ValidationError(
      `Empty string is not a valid user for field "${fieldSchema.name}"`,
      { field: fieldSchema.id, value }
    );
  }

  // Determine if it looks like an email (for matching strategy)
  // We no longer reject "invalid" emails - fuzzy matching can handle partial emails
  const isEmail = EMAIL_REGEX.test(searchTerm);

  // Get full user directory from cache or API
  // We cache ALL users and filter locally for faster bulk operations
  let users: JiraUser[] | null = null;
  let cacheStatus: 'hit' | 'stale' | 'miss' = 'miss';

  // Try cache first (using global key, no issueType needed for users)
  if (context.cache) {
    try {
      const result = await context.cache.getLookup('global', 'user');
      if (result.value) {
        users = result.value as JiraUser[];
        cacheStatus = result.isStale ? 'stale' : 'hit';
      }
    } catch {
      // Cache error - fall back to API
      users = null;
      cacheStatus = 'miss';
    }
  }

  // Log cache status
  if (cacheStatus === 'hit') {
    // eslint-disable-next-line no-console
    console.log(`📦 [UserCache] HIT - Using cached user directory (${users?.length || 0} users)`);
  } else if (cacheStatus === 'stale') {
    // eslint-disable-next-line no-console
    console.log(`📦 [UserCache] STALE - Using stale data, refreshing in background...`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`📦 [UserCache] MISS - Fetching user directory from API...`);
  }

  // If stale, trigger background refresh (fire-and-forget with deduplication)
  if (cacheStatus === 'stale' && context.client && context.cache) {
    const refreshKey = `user:global`;
    const refreshStart = Date.now();
    // Background refresh with deduplication - don't await
    // refreshOnce ensures only one API call even if multiple stale hits occur
    context.cache.refreshOnce(refreshKey, async () => {
      const freshUsers = await fetchAllUsers(context);
      if (freshUsers && freshUsers.length > 0 && context.cache) {
        await context.cache.setLookup('global', 'user', freshUsers);
        const elapsed = Date.now() - refreshStart;
        // eslint-disable-next-line no-console
        console.log(`📦 [UserCache] REFRESHED - Cached ${freshUsers.length} users in ${elapsed}ms`);
      }
    }).catch(() => {
      // Ignore background refresh errors
    });
  }

  // Fall back to API - fetch ALL users (paginated) if cache miss
  if (!users && context.client) {
    const fetchStart = Date.now();
    users = await fetchAllUsers(context);
    const elapsed = Date.now() - fetchStart;
    // eslint-disable-next-line no-console
    console.log(`📦 [UserCache] FETCHED - Got ${users?.length || 0} users from API in ${elapsed}ms`);

    // Cache the full user list for future lookups
    if (context.cache && users && users.length > 0) {
      try {
        await context.cache.setLookup('global', 'user', users);
        // eslint-disable-next-line no-console
        console.log(`📦 [UserCache] CACHED - Stored ${users.length} users`);
      } catch {
        // Ignore cache write errors
      }
    }
  }

  // No user list available
  if (!users || users.length === 0) {
    throw new ValidationError(
      `User "${searchTerm}" not found for field "${fieldSchema.name}". No matching users.`,
      { field: fieldSchema.id, value, searchTerm }
    );
  }

  // Filter active users only
  const activeUsers = users.filter((u) => u.active !== false);

  if (activeUsers.length === 0) {
    throw new ValidationError(
      `User "${searchTerm}" not found for field "${fieldSchema.name}". No active users matching search term.`,
      { field: fieldSchema.id, value, searchTerm }
    );
  }

  // Debug logging for user search (if DEBUG env var set)
  const debug = process.env.DEBUG === 'true';
  if (debug) {
    // eslint-disable-next-line no-console
    console.log(`\n🔍 UserConverter Debug: Searching for "${searchTerm}"`);
    // eslint-disable-next-line no-console
    console.log(`   Detected as: ${isEmail ? 'Email' : 'Username/Display Name'}`);
    // eslint-disable-next-line no-console
    console.log(`   Active users returned from API: ${activeUsers.length}`);
    // eslint-disable-next-line no-console
    console.log(`   Users: ${activeUsers.map(u => `${u.name ?? 'unknown'} (${u.displayName})`).join(', ')}`);
  }

  // Match by email, display name, or username
  // JIRA's username parameter searches across multiple fields, so we match all
  const matchedUsers: UserMatch[] = [];
  const addMatch = (user: JiraUser, reason: MatchReason): void => {
    if (matchedUsers.some((match) => match.user === user)) {
      return;
    }
    matchedUsers.push({
      user,
      reason,
      confidence: MATCH_CONFIDENCE[reason],
    });
  };
  const normalizedSearch = searchTerm.toLowerCase();

  if (isEmail) {
    // Match by email OR username (case-insensitive, exact match)
    activeUsers.forEach((user) => {
      if (user.emailAddress?.toLowerCase() === normalizedSearch) {
        addMatch(user, 'email-exact');
        return;
      }
      if (user.name?.toLowerCase() === normalizedSearch) {
        addMatch(user, 'username-exact');
      }
    });
  } else {
    // First try exact username match (case-insensitive)
    activeUsers.forEach((user) => {
      if (user.name?.toLowerCase() === normalizedSearch) {
        addMatch(user, 'username-exact');
      }
    });

    if (matchedUsers.length === 0) {
      // Try prefix match on username (e.g., "auser" matches "auser@company.com")
      // This aligns with JIRA's API behavior which returns prefix matches
      activeUsers.forEach((user) => {
        if (user.name?.toLowerCase().startsWith(normalizedSearch)) {
          addMatch(user, 'username-prefix');
        }
      });
    }

    if (matchedUsers.length === 0) {
      // If no username matches, try display name (partial match)
      activeUsers.forEach((user) => {
        if (user.displayName?.toLowerCase().includes(normalizedSearch)) {
          addMatch(user, 'display-partial');
        }
      });
    }
  }

  // BACKLOG-S2: Fuzzy matching for typo tolerance
  // Only attempt if no exact matches found and fuzzy is enabled
  if (matchedUsers.length === 0) {
    const fuzzyConfig = (context.config as Partial<JMLConfig>)?.fuzzyMatch?.user;
    const fuzzyEnabled = fuzzyConfig?.enabled !== false; // default: true

    if (fuzzyEnabled) {
      const threshold = fuzzyConfig?.threshold ?? 0.3;
      const fuzzyMatches = performFuzzyUserMatch(activeUsers, searchTerm, threshold);
      
      fuzzyMatches.forEach((match) => {
        addMatch(match.user, 'fuzzy-match');
      });

      if (debug && fuzzyMatches.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`   🔍 Fuzzy matched ${fuzzyMatches.length} user(s) for typo "${searchTerm}"`);
      }
    }
  }

  if (debug && matchedUsers.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`   ✓ Matched ${matchedUsers.length} user(s)`);
    // eslint-disable-next-line no-console
    console.log(`   Matches: ${matchedUsers.map(match => `${match.user.name ?? 'unknown'} (${match.user.displayName}, ${match.user.emailAddress}) [${match.reason}]`).join(', ')}`);

    // Show filtered out users if any
    const filteredOut = activeUsers.filter(u => !matchedUsers.some((match) => match.user === u));
    if (filteredOut.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`   ⚠️  Filtered out ${filteredOut.length} user(s) that didn't match:`);
      filteredOut.forEach(u => {
        // eslint-disable-next-line no-console
        console.log(`      - ${u.name ?? 'unknown'} (${u.displayName}) - no match for "${searchTerm}"`);
      });
    }
    // eslint-disable-next-line no-console
    console.log('');
  }

  if (matchedUsers.length === 0) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(`   ✗ No matches found\n`);
    }
    throw new ValidationError(
      `User "${searchTerm}" not found for field "${fieldSchema.name}". ${
        isEmail ? 'No user with that email address.' : 'No user with that username or display name.'
      }`,
      { field: fieldSchema.id, value, searchTerm, isEmail }
    );
  }

  let selectedUserMatch: UserMatch = matchedUsers[0]!;
  if (matchedUsers.length > 1) {
    const policyFromConfig =
      typeof context.config === 'object' && context.config !== null
        ? (context.config as Partial<JMLConfig>).ambiguityPolicy?.user
        : undefined;
    const policy = resolveUserAmbiguityPolicy(policyFromConfig);
    if (policy === 'error') {
      throwAmbiguityError(searchTerm, fieldSchema, matchedUsers);
    } else if (policy === 'score') {
      selectedUserMatch = selectBestUserMatch(matchedUsers, searchTerm, fieldSchema);
    }
    // policy === 'first' already uses first result (JIRA order)
  }

  return formatUserResult(selectedUserMatch.user, fieldSchema);
};

function resolveUserAmbiguityPolicy(policy: unknown): AmbiguityPolicy {
  if (typeof policy === 'string') {
    const normalized = policy.toLowerCase() as AmbiguityPolicy;
    if (USER_AMBIGUITY_POLICIES.includes(normalized)) {
      return normalized;
    }
  }
  return 'first';
}

/**
 * Compute combined similarity score using Fuse.js across all user fields.
 * Scores each field independently and returns the sum of all scores.
 * This ensures that a user who matches on multiple fields (e.g., email AND displayName)
 * scores better than one who only matches on one field.
 * 
 * Returns combined score where lower is better (consistent with Fuse.js scoring).
 */
function computeSecondarySimilarity(user: JiraUser, searchTerm: string): number {
  const fields = ['name', 'displayName', 'emailAddress'] as const;
  let totalScore = 0;

  for (const field of fields) {
    const value = user[field];
    if (!value) {
      // Missing field gets worst score (1.0)
      totalScore += 1;
      continue;
    }

    const fuse = new Fuse([{ value }], {
      keys: ['value'],
      threshold: 1.0, // Allow all matches, we just want the score
      ignoreLocation: true,
      includeScore: true,
      useExtendedSearch: false,
      isCaseSensitive: false,
    });

    const results = fuse.search(searchTerm);
    // Add field score (0 = perfect, 1 = no match)
    totalScore += results[0]?.score ?? 1;
  }

  // Return combined score (0-3 range, lower is better)
  return totalScore;
}

function selectBestUserMatch(
  matches: UserMatch[],
  searchTerm: string,
  fieldSchema: { name: string; id: string }
): UserMatch {
  // First, compute secondary similarity scores for all candidates
  const withSecondary = matches.map((match) => ({
    match,
    secondaryScore: computeSecondarySimilarity(match.user, searchTerm),
  }));

  const sorted = withSecondary.sort((a, b) => {
    // Primary: confidence (higher is better)
    if (b.match.confidence !== a.match.confidence) {
      return b.match.confidence - a.match.confidence;
    }
    // Secondary: fuse.js similarity to search term (lower is better)
    if (a.secondaryScore !== b.secondaryScore) {
      return a.secondaryScore - b.secondaryScore;
    }
    // Tertiary: alphabetical tie-breakers for determinism
    const displayCompare = compareStrings(a.match.user.displayName, b.match.user.displayName);
    if (displayCompare !== 0) {
      return displayCompare;
    }
    const emailCompare = compareStrings(a.match.user.emailAddress, b.match.user.emailAddress);
    if (emailCompare !== 0) {
      return emailCompare;
    }
    return compareStrings(a.match.user.name, b.match.user.name);
  });

  // Check if top 2 candidates are still tied after all criteria
  if (sorted.length >= 2) {
    const first = sorted[0]!;
    const second = sorted[1]!;

    const stillTied =
      first.match.confidence === second.match.confidence &&
      first.secondaryScore === second.secondaryScore;

    if (stillTied) {
      // Even after secondary scoring, they're identical - throw ambiguity error
      throwTiedScoreError(searchTerm, fieldSchema, matches, first.secondaryScore);
    }
  }

  return sorted[0]!.match;
}

function compareStrings(a?: string, b?: string): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function throwAmbiguityError(
  searchTerm: string,
  fieldSchema: { name: string; id: string },
  candidates: UserMatch[]
): never {
  // Compute combined scores for display
  const withScores = candidates.map((match) => ({
    match,
    combinedScore: computeSecondarySimilarity(match.user, searchTerm),
  })).sort((a, b) => {
    // Sort by confidence first, then by combined score
    if (b.match.confidence !== a.match.confidence) {
      return b.match.confidence - a.match.confidence;
    }
    return a.combinedScore - b.combinedScore;
  });

  // Limit to top 5 candidates for cleaner output
  const topCandidates = withScores.slice(0, 5);
  const totalCount = withScores.length;

  const formattedCandidates = topCandidates.map(({ match, combinedScore }, i) => ({
    index: i + 1,
    displayName: match.user.displayName,
    username: match.user.name || match.user.accountId || 'unknown',
    email: match.user.emailAddress,
    confidence: Number(match.confidence.toFixed(3)),
    combinedScore: Number(combinedScore.toFixed(3)),
    matchType: match.reason,
  }));

  const truncationNote = totalCount > 5 ? `\n  ... and ${totalCount - 5} more` : '';

  throw new AmbiguityError(
    `Ambiguous value "${searchTerm}" for field "${fieldSchema.name}". Multiple users found:\n` +
      formattedCandidates
        .map((c) => `  ${c.index}. ${c.displayName} (${c.username}, ${c.email})`)
        .join('\n') +
      truncationNote +
      '\n\nPlease use email address for exact matching or specify a different ambiguity policy.',
    {
      field: fieldSchema.id,
      input: searchTerm,
      candidates: formattedCandidates,
      totalCandidates: totalCount,
    }
  );
}

function throwTiedScoreError(
  searchTerm: string,
  fieldSchema: { name: string; id: string },
  candidates: UserMatch[],
  tiedScore: number
): never {
  const formattedCandidates = candidates.map((match, i) => ({
    index: i + 1,
    displayName: match.user.displayName,
    username: match.user.name || match.user.accountId || 'unknown',
    email: match.user.emailAddress,
    confidence: Number(match.confidence.toFixed(3)),
    matchType: match.reason,
  }));

  throw new AmbiguityError(
    `Ambiguous value "${searchTerm}" for field "${fieldSchema.name}". ` +
      `Multiple users have identical scores (similarity: ${(1 - tiedScore).toFixed(3)}):\n` +
      formattedCandidates
        .map((c) => `  ${c.index}. ${c.displayName} (${c.username}, ${c.email})`)
        .join('\n') +
      '\n\nPlease use email address for exact matching.',
    {
      field: fieldSchema.id,
      input: searchTerm,
      candidates: formattedCandidates,
    }
  );
}

function formatUserResult(user: JiraUser, fieldSchema: { name: string; id: string }): { accountId?: string; name?: string } {
  if (user.accountId) {
    return { accountId: user.accountId };
  }
  if (user.name) {
    return { name: user.name };
  }
  // Fallback (shouldn't happen, but handle gracefully)
  throw new ValidationError(
    `User found but missing both name and accountId for field "${fieldSchema.name}"`,
    { field: fieldSchema.id, user }
  );
}

/**
 * Perform fuzzy matching against user list using fuse.js
 * 
 * BACKLOG-S2: Fuzzy user matching for typo tolerance
 * 
 * Searches across displayName and emailAddress fields to find
 * users that approximately match the search term.
 * 
 * @param users - List of active JIRA users to search
 * @param searchTerm - User input (potentially with typos)
 * @param threshold - Fuse.js threshold (0.0=exact, 0.3=balanced, 1.0=match all)
 * @returns Array of fuzzy matches sorted by score (best first)
 */
function performFuzzyUserMatch(
  users: JiraUser[],
  searchTerm: string,
  threshold: number
): { user: JiraUser; score: number }[] {
  // Configure fuse.js for user matching
  // Search ALL fields - email, displayName, and username
  // Since we cache the full directory, there's no cost to searching everything
  const keys = ['emailAddress', 'displayName', 'name'];

  const fuse = new Fuse(users, {
    keys,
    threshold,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });

  const results = fuse.search(searchTerm);

  // Return matches sorted by score (fuse.js score: 0=perfect, 1=no match)
  return results.map((result) => ({
    user: result.item,
    score: result.score ?? 1,
  }));
}

/**
 * Internal helpers exposed for targeted unit testing.
 * Not part of the public API.
 */
export const __userConverterInternals = {
  compareStrings,
  selectBestUserMatch,
  computeSecondarySimilarity,
};

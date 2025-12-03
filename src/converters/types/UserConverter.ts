/**
 * User Type Converter
 * Story: E2-S08, BACKLOG-S1 (ambiguity policy)
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
 * - Server vs Cloud format auto-detection
 * - Lookup caching (reduces API calls)
 * - Graceful cache degradation
 */

import type { FieldConverter } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';
import { AmbiguityError } from '../../errors/AmbiguityError.js';
import type { AmbiguityPolicy, JMLConfig } from '../../types/config.js';

/**
 * Simple email validation regex
 * Matches: user@domain.com, user.name@sub.domain.co.uk, user+tag@domain.com
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_AMBIGUITY_POLICIES: AmbiguityPolicy[] = ['first', 'error', 'score'];

type MatchReason = 'email-exact' | 'username-exact' | 'username-prefix' | 'display-partial';

const MATCH_CONFIDENCE: Record<MatchReason, number> = {
  'email-exact': 1,
  'username-exact': 0.95,
  'username-prefix': 0.7,
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

export const convertUserType: FieldConverter = async (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Handle object input
  if (typeof value === 'object' && value !== null) {
    // accountId is JIRA Cloud's internal ID - safe to passthrough
    if ('accountId' in value && value.accountId) {
      return value;
    }
    // name is human-readable - extract and resolve like a string
    // This ensures active user check, ambiguity policy, and validation run
    // (Same pattern as ProjectConverter and IssueTypeConverter)
    if ('name' in value && typeof value.name === 'string') {
      value = value.name;
      // Fall through to string resolution below
    }
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

  // Determine if it's an email or display name
  const isEmail = EMAIL_REGEX.test(searchTerm);

  // Validate email format if it looks like an email
  if (!isEmail && searchTerm.includes('@')) {
    throw new ValidationError(
      `Invalid email format for field "${fieldSchema.name}": "${searchTerm}"`,
      { field: fieldSchema.id, value }
    );
  }

  // Get user list from cache or API
  let users: JiraUser[] | null = null;

  // Try cache first
  if (context.cache) {
    try {
      users = await context.cache.getLookup(
        context.projectKey,
        'user',
        context.issueType
      ) as JiraUser[] | null;
    } catch {
      // Cache error - fall back to API
      users = null;
    }
  }

  // Fall back to API query
  if (!users && context.client) {
    // Query JIRA user search API
    // Server: GET /rest/api/2/user/search?username={query}
    // Returns array of users
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    users = (await context.client.get('/rest/api/2/user/search', {
      username: searchTerm,
    })) as JiraUser[];

    // Cache for future use
    if (context.cache && users && users.length > 0) {
      try {
        await context.cache.setLookup(
          context.projectKey,
          'user',
          users,
          context.issueType
        );
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
      selectedUserMatch = selectBestUserMatch(matchedUsers);
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

function selectBestUserMatch(matches: UserMatch[]): UserMatch {
  const sorted = [...matches].sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    const displayCompare = compareStrings(a.user.displayName, b.user.displayName);
    if (displayCompare !== 0) {
      return displayCompare;
    }
    const emailCompare = compareStrings(a.user.emailAddress, b.user.emailAddress);
    if (emailCompare !== 0) {
      return emailCompare;
    }
    return compareStrings(a.user.name, b.user.name);
  });
  return sorted[0]!;
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
  const formattedCandidates = candidates.map((match, i) => ({
    index: i + 1,
    name: match.user.displayName,
    id: match.user.name || match.user.accountId || 'unknown',
    email: match.user.emailAddress,
    confidence: Number(match.confidence.toFixed(3)),
    matchType: match.reason,
  }));

  throw new AmbiguityError(
    `Ambiguous value "${searchTerm}" for field "${fieldSchema.name}". Multiple users found:\n` +
      formattedCandidates
        .map((c) => `  ${c.index}. ${c.name} (${c.id}, ${c.email})`)
        .join('\n') +
      '\n\nPlease use email address for exact matching or specify a different ambiguity policy.',
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
 * Internal helpers exposed for targeted unit testing.
 * Not part of the public API.
 */
export const __userConverterInternals = {
  compareStrings,
  selectBestUserMatch,
};

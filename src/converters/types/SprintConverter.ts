/**
 * Sprint Type Converter
 *
 * Converts sprint values for fields identified by
 * schema.custom === "com.pyxis.greenhopper.jira:gh-sprint"
 *
 * Despite JIRA createmeta reporting Sprint as type:"array", items:"string",
 * the REST API for issue creation/update expects a plain integer sprint ID.
 *
 * Accepts:
 * - Integer number: 13772 (direct sprint ID — fast path, no API call)
 * - Numeric string: "13772" (from CSV, always produces strings — fast path)
 * - Sprint name: "Sprint 1" (resolves active/future sprints via /rest/agile/1.0 API with caching)
 * - Object with id: { id: 13772 } or { id: "13772" } (passthrough)
 * - null/undefined for optional fields
 *
 * Note: Sprint name lookup only searches **active and future** sprints.
 * Closed/historical sprints contain too many pages to search efficiently.
 * To reference a closed sprint, use its numeric ID directly (e.g. 13772).
 *
 * Returns: number (plain integer sprint ID)
 *
 * Features:
 * - Numeric fast path (integer and numeric string bypass API entirely)
 * - Sprint name lookup via Agile REST API (all boards for the project)
 * - Paginated board and sprint fetching
 * - Project-level sprint caching (boards are project-scoped)
 * - Stale-while-revalidate (SWR) cache pattern — same as UserConverter
 * - Deduplication across boards (same sprint can appear on multiple boards)
 * - Case-insensitive name matching; prefers active > future > closed on ties
 *
 * @see https://docs.atlassian.com/jira-software/REST/
 */

import type { FieldConverter, ConversionContext } from '../../types/converter.js';
import { ValidationError } from '../../errors/ValidationError.js';
import type { FieldSchema } from '../../types/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed' | string;
  originBoardId?: number;
}

interface AgileBoard {
  id: number;
  name: string;
}

interface AgileBoardResponse {
  values: AgileBoard[];
  isLast: boolean;
  maxResults?: number;
}

interface AgileSprintResponse {
  values: JiraSprint[];
  isLast: boolean;
  maxResults?: number;
}

// ---------------------------------------------------------------------------
// Agile API helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all boards for a project from the Agile REST API (paginated).
 * Only fetches Scrum boards (type=scrum) — Kanban boards do not support sprints
 * and will return 400 "The board doesn't support sprints" if queried for sprints.
 */
async function fetchBoardsForProject(
  projectKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
): Promise<AgileBoard[]> {
  const boards: AgileBoard[] = [];
  let startAt = 0;
  const maxResults = 50;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const response = (await client.get('/rest/agile/1.0/board', {
      projectKeyOrId: projectKey,
      type: 'scrum',  // Kanban boards don't have sprints; exclude them upfront
      startAt,
      maxResults,
    })) as AgileBoardResponse;

    if (!response?.values?.length) break;

    boards.push(...response.values);
    startAt += response.values.length;

    if (response.isLast !== false) break;
  }

  return boards;
}

/**
 * Fetch active and future sprints for a board from the Agile REST API (paginated).
 *
 * Closed sprints are intentionally excluded: a project with many historical sprints
 * can have hundreds of pages of closed sprints across many boards, causing name
 * lookups to take minutes or longer. If you need a closed sprint, use its numeric
 * ID directly (e.g. Sprint: 13772).
 */
async function fetchSprintsForBoard(
  boardId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
): Promise<JiraSprint[]> {
  const sprints: JiraSprint[] = [];
  let startAt = 0;
  const maxResults = 50;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const response = (await client.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
      state: 'active,future',   // closed sprints excluded — see function JSDoc
      startAt,
      maxResults,
    })) as AgileSprintResponse;

    if (!response?.values?.length) break;

    sprints.push(...response.values);
    startAt += response.values.length;

    if (response.isLast !== false) break;
  }

  return sprints;
}

/**
 * Sort boards so the most-recently-used boards come first.
 *
 * Reads a tiny `sprint-boards` hint from the cache (stored after each successful
 * sprint name lookup) and moves those board IDs to the front of the list in
 * MRU order.  The remaining boards are sorted by ID descending — higher IDs are
 * more recently created and are therefore more likely to have active sprints.
 *
 * Falls back to ID-descending order when no hint is available.
 */
async function prioritiseBoardsByHint(
  boards: AgileBoard[],
  projectKey: string,
  context: ConversionContext
): Promise<AgileBoard[]> {
  let hintBoardIds: number[] = [];

  if (context.cache) {
    try {
      const hint = await context.cache.getLookup(projectKey, 'sprint-boards', undefined);
      if (hint.value) {
        hintBoardIds = hint.value as number[];
      }
    } catch {
      // Cache unavailable — fall back to default ordering
    }
  }

  if (hintBoardIds.length === 0) {
    // No hint: sort by ID descending (newer boards tend to have active sprints)
    return [...boards].sort((a, b) => b.id - a.id);
  }

  const hintSet = new Set(hintBoardIds);
  const hintBoards = hintBoardIds
    .map((id) => boards.find((b) => b.id === id))
    .filter((b): b is AgileBoard => b !== undefined);
  const otherBoards = boards
    .filter((b) => !hintSet.has(b.id))
    .sort((a, b) => b.id - a.id);

  return [...hintBoards, ...otherBoards];
}

/**
 * Persist the board that contained the most recently resolved sprint.
 *
 * Stores an ordered list of board IDs (max 5) under the cache key
 * `lookup:{projectKey}:sprint-boards`.  On the next cold-miss lookup,
 * {@link prioritiseBoardsByHint} moves these boards to the front of the
 * iteration order, dramatically reducing API calls when the sprint is on
 * a frequently-used board.
 *
 * Fire-and-forget: errors are silently ignored.
 */
function updateBoardHint(
  sprint: JiraSprint,
  projectKey: string,
  context: ConversionContext
): void {
  const boardId = sprint.originBoardId;
  if (!boardId || !context.cache) return;

  void context.cache.getLookup(projectKey, 'sprint-boards', undefined)
    .then((result) => {
      const existing: number[] = (result.value as number[] | null) ?? [];
      // Prepend the new board ID, deduplicate, keep at most 5 hints
      const updated = [boardId, ...existing.filter((id) => id !== boardId)].slice(0, 5);
      return context.cache!.setLookup(projectKey, 'sprint-boards', updated, undefined);
    })
    .catch(() => {
      // Best-effort hint — ignore all errors
    });
}

/**
 * Fetch sprints for a project (all boards), deduplicated by sprint ID.
 *
 * @param earlyExitName  When provided (normalised lowercase), the board loop stops
 *                       as soon as any sprint name contains this string.  This is
 *                       used during a name-lookup cache miss to avoid iterating all
 *                       boards for a project that may have dozens of them.  Omit
 *                       (or pass undefined) when you need the complete list, e.g.
 *                       for background cache population.
 */
async function fetchSprintsForProject(
  projectKey: string,
  context: ConversionContext,
  earlyExitName?: string
): Promise<JiraSprint[]> {
  if (!context.client) return [];

  const rawBoards = await fetchBoardsForProject(projectKey, context.client);
  // Sort boards: MRU hint first, then by ID descending (newer = more likely active)
  const boards = await prioritiseBoardsByHint(rawBoards, projectKey, context);
  const sprintMap = new Map<number, JiraSprint>();

  for (const board of boards) {
    let boardSprints: JiraSprint[];
    try {
      boardSprints = await fetchSprintsForBoard(board.id, context.client);
    } catch (err) {
      // Some boards (e.g. non-scrum board types) reject the sprints endpoint
      // with 400 "The board doesn't support sprints". Skip and continue to
      // the next board rather than aborting the whole sprint search.
      const httpStatus = (err as { details?: { status?: number } })?.details?.status;
      if (httpStatus === 400 || httpStatus === 404) continue;
      throw err;
    }
    for (const sprint of boardSprints) {
      sprintMap.set(sprint.id, sprint);
    }
    // Early exit: stop fetching more boards once a candidate match is found.
    // We still include all sprints from the current board (already fetched above)
    // so partial matches and deduplication within the board are handled correctly.
    if (earlyExitName &&
        boardSprints.some((s) => s.name.toLowerCase().includes(earlyExitName))) {
      break;
    }
  }

  return Array.from(sprintMap.values());
}

// ---------------------------------------------------------------------------
// Sprint name resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a sprint name to its integer ID via Agile API (with caching + SWR).
 */
async function resolveSprintByName(
  sprintName: string,
  fieldSchema: FieldSchema,
  context: ConversionContext
): Promise<number> {
  const projectKey = context.projectKey;
  let sprints: JiraSprint[] | null = null;
  let cacheStatus: 'hit' | 'stale' | 'miss' = 'miss';

  // Try cache first (project-level, no issueType — sprints are board/project scoped)
  if (context.cache) {
    try {
      const result = await context.cache.getLookup(projectKey, 'sprint', undefined);
      if (result.value) {
        sprints = result.value as JiraSprint[];
        cacheStatus = result.isStale ? 'stale' : 'hit';
      }
    } catch {
      // Cache error — fall back to API
      sprints = null;
      cacheStatus = 'miss';
    }
  }

  // SWR: stale cache hit → return cached data immediately, refresh in background
  if (cacheStatus === 'stale' && context.client && context.cache) {
    const refreshKey = `sprint:${projectKey}`;
    context.cache.refreshOnce(refreshKey, async () => {
      const freshSprints = await fetchSprintsForProject(projectKey, context); // full fetch
      if (freshSprints.length > 0 && context.cache) {
        await context.cache.setLookup(projectKey, 'sprint', freshSprints, undefined);
      }
    }).catch(() => {
      // Ignore background refresh errors
    });
  }

  // Cache miss → fetch from Agile API.
  // Use early-exit mode: stop iterating boards as soon as the target name is
  // found.  This avoids iterating 50+ boards when the sprint is on board #1.
  // A background full-fetch warms the cache for subsequent lookups.
  if (!sprints && context.client) {
    const normalizedTarget = sprintName.trim().toLowerCase();
    sprints = await fetchSprintsForProject(projectKey, context, normalizedTarget);

    if (context.cache) {
      if (sprints.length > 0) {
        // Cache whatever we found so far (may be partial due to early exit)
        try {
          await context.cache.setLookup(projectKey, 'sprint', sprints, undefined);
        } catch {
          // Ignore cache write errors
        }
      }
      // Fire full background fetch to fill/replace the cache with ALL sprints,
      // so the next lookup (for any sprint name) is a fast cache hit.
      const refreshKey = `sprint:${projectKey}`;
      context.cache.refreshOnce(refreshKey, async () => {
        const allSprints = await fetchSprintsForProject(projectKey, context); // no early exit
        if (allSprints.length > 0 && context.cache) {
          await context.cache.setLookup(projectKey, 'sprint', allSprints, undefined);
        }
      }).catch(() => {});
    }
  }

  // No sprints available (no client, empty project, or API failure)
  if (!sprints || sprints.length === 0) {
    throw new ValidationError(
      `Sprint "${sprintName}" not found for field "${fieldSchema.name}" in project ${projectKey}. ` +
      `No active or future sprints found. If this is a closed sprint, use the sprint ID directly (e.g. 13772).`,
      { field: fieldSchema.id, value: sprintName, projectKey }
    );
  }

  // Case-insensitive exact name match, then partial, then error
  const normalizedInput = sprintName.toLowerCase();
  const exactMatches = sprints.filter((s) => s.name.toLowerCase() === normalizedInput);

  let resolved: JiraSprint | undefined;
  if (exactMatches.length === 1) {
    resolved = exactMatches[0]!;
  } else if (exactMatches.length > 1) {
    // Multiple sprints with the same name — prefer active > future > first by position
    resolved = exactMatches.find((s) => s.state === 'active')
      ?? exactMatches.find((s) => s.state === 'future')
      ?? exactMatches[0]!;
  }

  if (!resolved) {
    // No exact match — try partial substring (case-insensitive)
    const partialMatches = sprints.filter((s) => s.name.toLowerCase().includes(normalizedInput));
    if (partialMatches.length === 1) {
      resolved = partialMatches[0]!;
    }
  }

  if (!resolved) {
    const availableList = sprints
      .map((s) => `"${s.name}" (ID: ${s.id}, ${s.state})`)
      .join(', ');
    throw new ValidationError(
      `Sprint "${sprintName}" not found for field "${fieldSchema.name}" in project ${projectKey}. ` +
      `Active/future sprints available: ${availableList}. ` +
      `If this is a closed sprint, use the sprint ID directly (e.g. 13772).`,
      { field: fieldSchema.id, value: sprintName, projectKey, availableSprints: sprints }
    );
  }

  // Record the winning board so the next cold-start tries it first
  updateBoardHint(resolved, projectKey, context);
  return resolved.id;
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

export const convertSprintType: FieldConverter = async (value, fieldSchema, context) => {
  // Handle optional fields
  if (value === null || value === undefined) {
    return value;
  }

  // Object passthrough: { id: number | string } — already resolved
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === 'number' && Number.isInteger(id)) return id;
    if (typeof id === 'string' && /^\d+$/.test(id.trim())) return parseInt(id.trim(), 10);
    // Fall through to throw below — unexpected object shape
  }

  // Number: validate it's a safe integer (not float)
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new ValidationError(
        `Sprint field requires an integer ID, got float: ${value}. ` +
        `Use a sprint ID (e.g. 13772) or a sprint name (e.g. "Sprint 1").`,
        { field: fieldSchema.id, value }
      );
    }
    if (!Number.isSafeInteger(value)) {
      throw new ValidationError(
        `Sprint ID ${value} exceeds the safe integer range. Please use a valid sprint ID.`,
        { field: fieldSchema.id, value }
      );
    }
    return value;
  }

  // Non-string, non-object, non-number
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Expected number, string, or object for Sprint field "${fieldSchema.name}", got ${typeof value}.`,
      { field: fieldSchema.id, value, type: typeof value }
    );
  }

  const str = (value as string).trim();

  if (str === '') {
    throw new ValidationError(
      `Empty string is not a valid sprint for field "${fieldSchema.name}". ` +
      `Use a sprint ID (e.g. 13772) or a sprint name (e.g. "Sprint 1").`,
      { field: fieldSchema.id, value }
    );
  }

  // Numeric string fast path — common from CSV (always produces strings)
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  // Float string rejection
  if (/^\d+\.\d+$/.test(str)) {
    throw new ValidationError(
      `Sprint field requires an integer ID, got float string: "${str}". ` +
      `Use a sprint ID (e.g. 13772) or a sprint name (e.g. "Sprint 1").`,
      { field: fieldSchema.id, value }
    );
  }

  // Sprint name — resolve via Agile API with caching
  return resolveSprintByName(str, fieldSchema as FieldSchema, context);
};

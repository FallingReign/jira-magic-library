/**
 * Resolution Layer - Barrel Exports
 *
 * Converts human-friendly text into JIRA IDs:
 * - Users: email/display name → accountId or username
 * - Field Options: fuzzy text → option ID
 * - Entities: priority/status/component/version text → ID
 */

export { UserResolver } from './UserResolver.js';
export { FieldOptionResolver } from './FieldOptionResolver.js';
export { EntityResolver } from './EntityResolver.js';
export type {
  ResolvedUser,
  UserResolveOptions,
  ResolvedOption,
  ResolvedEntity,
} from './types.js';

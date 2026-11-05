/**
 * Field IDs that Jira fills itself when they are left blank on create,
 * even though create metadata marks them required with no default value.
 *
 * `jml.validate()` does not report these as missing. Add a field here only
 * with evidence that Jira fills it on create.
 *
 * - `reporter`: Jira uses the user who submits the request. Confirmed on the
 *   team's Jira; Atlassian documents the current-user default for the create
 *   screen (https://support.atlassian.com/jira/kb/howto-disable-auto-filling-reporter-field-when-creating-issues/)
 *   and the server-side fallback (https://jira.atlassian.com/browse/JRASERVER-12984).
 */
export const SERVER_FILLED_FIELDS: ReadonlySet<string> = new Set(['reporter']);

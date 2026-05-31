/**
 * Cloud Create Adapter
 *
 * Adapts issue creation payloads for Cloud v3 vs Server v2 API differences.
 * Handles ADF conversion for rich text, user field format (accountId vs name),
 * and issue type format differences.
 */

import type { DeploymentType } from '../types/config.js';
import { AdfConverter } from '../converters/AdfConverter.js';

/** Fields known to be rich-text (description/comment) in Jira */
const RICH_TEXT_FIELDS = new Set(['description', 'environment']);

/** Fields known to be user-type in Jira */
const USER_FIELDS = new Set(['assignee', 'reporter', 'creator']);

export class CloudCreateAdapter {
  constructor(private readonly deployment: DeploymentType) {}

  /** Transform a resolved payload for the target deployment */
  adaptPayload(payload: Record<string, unknown>): Record<string, unknown> {
    if (this.deployment === 'server' || this.deployment === 'auto') {
      return payload;
    }

    // Cloud adaptation
    const adapted = { ...payload };
    if (adapted.fields && typeof adapted.fields === 'object') {
      adapted.fields = this.adaptFields(adapted.fields as Record<string, unknown>);
    }
    return adapted;
  }

  /** Adapt description/comment fields to ADF if Cloud v3 */
  adaptRichTextFields(fields: Record<string, unknown>): Record<string, unknown> {
    if (this.deployment !== 'cloud') {
      return fields;
    }

    const result = { ...fields };
    for (const [key, value] of Object.entries(result)) {
      if (RICH_TEXT_FIELDS.has(key) && typeof value === 'string') {
        result[key] = AdfConverter.toAdf(value);
      } else if (RICH_TEXT_FIELDS.has(key) && value && typeof value === 'object') {
        // Already ADF or object — passthrough
        if (!AdfConverter.isAdf(value)) {
          // Not ADF and not string — leave as-is
        }
      }
    }
    return result;
  }

  /** Adapt user fields (ensure accountId for Cloud, name for Server) */
  adaptUserFields(fields: Record<string, unknown>): Record<string, unknown> {
    if (this.deployment === 'server' || this.deployment === 'auto') {
      return this.ensureServerUserFormat(fields);
    }

    // Cloud: ensure accountId format
    const result = { ...fields };
    for (const key of Object.keys(result)) {
      if (USER_FIELDS.has(key) && result[key] && typeof result[key] === 'object') {
        const userField = result[key] as Record<string, unknown>;
        if (userField.accountId) {
          // Already has accountId — strip name if present
          const { name: _name, ...rest } = userField;
          result[key] = rest;
        } else if (userField.name && !userField.accountId) {
          // Has name but no accountId — Cloud requires accountId
          // Leave as-is since we can't resolve name→accountId here
          // The resolver should have already provided accountId
        }
      }
    }
    return result;
  }

  /** Full field adaptation (combines all transformations) */
  private adaptFields(fields: Record<string, unknown>): Record<string, unknown> {
    let result = { ...fields };

    // Adapt rich text fields to ADF
    result = this.adaptRichTextFields(result);

    // Adapt user fields to accountId format
    result = this.adaptUserFields(result);

    // Adapt issuetype to use id only (Cloud v3 doesn't accept name in some contexts)
    if (result.issuetype && typeof result.issuetype === 'object') {
      const issueType = result.issuetype as Record<string, unknown>;
      if (issueType.id) {
        result.issuetype = { id: issueType.id };
      }
    }

    return result;
  }

  /** Ensure Server user format uses { name } */
  private ensureServerUserFormat(fields: Record<string, unknown>): Record<string, unknown> {
    const result = { ...fields };
    for (const key of Object.keys(result)) {
      if (USER_FIELDS.has(key) && result[key] && typeof result[key] === 'object') {
        const userField = result[key] as Record<string, unknown>;
        if (userField.name) {
          // Strip accountId if present, keep name
          const { accountId: _accountId, ...rest } = userField;
          result[key] = rest;
        }
      }
    }
    return result;
  }
}

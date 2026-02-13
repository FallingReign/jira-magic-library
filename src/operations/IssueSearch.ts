/**
 * Issue Search API
 * Feature: Phase 2.1 - Issue Search with Field Resolution
 *
 * Enables searching for issues using human-readable field names and values.
 * Leverages existing field resolution and conversion logic.
 */

import type { JiraClient } from '../client/JiraClient.js';
import type { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import type { FieldResolver } from '../converters/FieldResolver.js';
import type { ConverterRegistry } from '../converters/ConverterRegistry.js';
import type { Issue } from '../types/index.js';

/**
 * Search options for issue queries
 */
export interface IssuesSearchOptions {
  // Common search fields
  project?: string;
  assignee?: string;
  status?: string;
  issueType?: string;
  labels?: string[];

  // Custom fields (using human-readable names)
  [fieldName: string]: unknown;

  // Search options
  maxResults?: number;
  orderBy?: string;
  createdSince?: Date | string;
}

/**
 * JIRA Search API response
 */
interface JiraSearchResponse {
  issues: Issue[];
  total: number;
  startAt?: number;
  maxResults?: number;
}

/**
 * Issue Search operation
 * Provides human-readable search API with field resolution
 */
export class IssueSearch {
  constructor(
    private readonly client: JiraClient,
    _schema?: SchemaDiscovery,
    _resolver?: FieldResolver,
    _converter?: ConverterRegistry
  ) {
    // Note: schema, resolver, and converter are placeholders for future enhancement
    // They will be used for field resolution and value conversion in Phase 2.2
  }

  /**
   * Search for issues using human-readable criteria
   *
   * @param criteria - Search criteria with human-readable field names
   * @returns Array of matching issues
   */
  async search(criteria: IssuesSearchOptions): Promise<Issue[]> {
    // Extract search options
    const { maxResults = 100, orderBy, createdSince, ...searchFields } = criteria;

    // Build JQL clauses
    const jqlClauses: string[] = [];

    // Process each search field
    for (const [fieldName, value] of Object.entries(searchFields)) {
      // Skip undefined and null values
      if (value === undefined || value === null) {
        continue;
      }

      // For MVP, use field names directly (no resolution)
      // Future enhancement: add field resolution via schema
      const jqlFieldName = fieldName;

      // Handle arrays (e.g., labels)
      if (Array.isArray(value)) {
        const escapedValues = value.map((v) => this.escapeJqlValue(String(v)));
        jqlClauses.push(`${jqlFieldName} IN (${escapedValues.join(', ')})`);
        continue;
      }

      // For MVP, use values directly (no conversion)
      // Future enhancement: use ConverterRegistry for value conversion
      const jqlValue = String(value);

      // Build JQL clause
      const jqlClause = `${jqlFieldName} ~ "${this.escapeJqlString(jqlValue)}"`;
      jqlClauses.push(jqlClause);
    }

    // Add createdSince filter if provided
    if (createdSince) {
      const dateStr = this.formatDate(createdSince);
      jqlClauses.push(`created >= "${dateStr}"`);
    }

    // Combine all clauses with AND
    let jql = jqlClauses.join(' AND ');

    // Add empty clause if no filters
    if (jqlClauses.length === 0) {
      jql = '';
    }

    // Add ORDER BY clause if specified
    if (orderBy) {
      jql = jql ? `${jql} ORDER BY ${orderBy}` : `ORDER BY ${orderBy}`;
    }

    // Execute search
    const response = await this.client.get<JiraSearchResponse>('/rest/api/2/search', {
      jql,
      maxResults,
      fields: ['key', 'summary', 'status', 'assignee', 'project', 'issuetype', 'created', 'updated']
    });

    return response.issues;
  }

  /**
   * Escape special characters in JQL string values
   */
  private escapeJqlString(value: string): string {
    // Escape backslashes first, then quotes
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Escape JQL value (for IN clauses)
   */
  private escapeJqlValue(value: string): string {
    return `"${this.escapeJqlString(value)}"`;
  }

  /**
   * Format date for JQL query
   */
  private formatDate(date: Date | string): string {
    if (typeof date === 'string') {
      return date;
    }

    // Format as YYYY-MM-DD HH:mm
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}

/**
 * Shared test data for demos
 * 
 * Generates example payloads in CSV, JSON, and YAML formats
 * Used by both bulk-import and schema-validation demos
 * 
 * Note: 
 * - First two issues: Task and Bug (common types) with Reporter
 * - Third issue: Story (may not exist in all projects) without Reporter
 * - Demonstrates: valid data, unknown fields, missing required, invalid issue type
 */

/**
 * Generate example data in all formats for a given project
 * @param {string} projectKey - JIRA project key
 * @param {string} [reporter] - Reporter username (optional, for bulk-import)
 * @returns {Object} Object with csv, json, yaml properties
 */
export function getExampleData(projectKey, reporter = null) {
  return {
    csv: `Project,Issue Type,Summary,Description,Priority,Reporter,Epic Name
${projectKey},Task,Setup development environment,"Install Node.js, VS Code, and dependencies",P3 - Medium,${reporter || ''},Infrastructure
${projectKey},Bug,Fix login timeout,"Users getting timeout after 30 seconds, needs investigation",P2 - High,${reporter || ''},Authentication
${projectKey},Story,Add dark mode support,"Implement dark mode theme with user preference toggle",P4 - Low,,UI Improvements`,

    json: `[
  {
    "Project": "${projectKey}",
    "Issue Type": "Task",
    "Summary": "Setup development environment",
    "Description": "Install Node.js, VS Code, and dependencies",
    "Priority": "P3 - Medium",
    "Reporter": "${reporter || ''}",
    "Epic Name": "Infrastructure"
  },
  {
    "Project": "${projectKey}",
    "Issue Type": "Bug",
    "Summary": "Fix login timeout",
    "Description": "Users getting timeout after 30 seconds, needs investigation",
    "Priority": "P2 - High",
    "Reporter": "${reporter || ''}",
    "Epic Name": "Authentication"
  },
  {
    "Project": "${projectKey}",
    "Issue Type": "Story",
    "Summary": "Add dark mode support",
    "Description": "Implement dark mode theme with user preference toggle",
    "Priority": "P4 - Low",
    "Epic Name": "UI Improvements"
  }
]`,

    yaml: `Project: ${projectKey}
Issue Type: Task
Summary: Setup development environment
Description: Install Node.js, VS Code, and dependencies
Priority: P3 - Medium
Reporter: ${reporter || ''}
Epic Name: Infrastructure
---
Project: ${projectKey}
Issue Type: Bug
Summary: Fix login timeout
Description: Users getting timeout after 30 seconds, needs investigation
Priority: P2 - High
Reporter: ${reporter || ''}
Epic Name: Authentication
---
Project: ${projectKey}
Issue Type: Story
Summary: Add dark mode support
Description: Implement dark mode theme with user preference toggle
Priority: P4 - Low
Epic Name: UI Improvements`
  };
}

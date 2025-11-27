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

/**
 * Generate hierarchy example data with UIDs (E4-S13)
 * 
 * Demonstrates level-based batching:
 * - uid: Temporary identifier for parent references
 * - Parent: UID reference (not JIRA key) for parent-child links
 * - Library creates parents first, then children (in 2-3 API calls, not N)
 * 
 * @param {string} projectKey - JIRA project key
 * @returns {Object} Object with csv, json, yaml properties for hierarchy data
 */
export function getHierarchyExampleData(projectKey) {
  const timestamp = new Date().toISOString().split('T')[0];
  
  return {
    csv: `uid,Project,Issue Type,Summary,Description,Parent,Epic Name
epic-1,${projectKey},Epic,Q4 Release Planning,Epic for Q4 2025 features,,Q4 Release ${timestamp}
task-1,${projectKey},Task,Authentication Service,Implement OAuth 2.0 login,epic-1,
task-2,${projectKey},Task,User Dashboard,Build dashboard with widgets,epic-1,
subtask-1,${projectKey},Sub-task,Google OAuth,Add Google provider,task-1,
subtask-2,${projectKey},Sub-task,GitHub OAuth,Add GitHub provider,task-1,`,

    json: `[
  {
    "uid": "epic-1",
    "Project": "${projectKey}",
    "Issue Type": "Epic",
    "Summary": "Q4 Release Planning",
    "Description": "Epic for Q4 2025 features",
    "Epic Name": "Q4 Release ${timestamp}"
  },
  {
    "uid": "task-1",
    "Project": "${projectKey}",
    "Issue Type": "Task",
    "Summary": "Authentication Service",
    "Description": "Implement OAuth 2.0 login",
    "Parent": "epic-1"
  },
  {
    "uid": "task-2",
    "Project": "${projectKey}",
    "Issue Type": "Task",
    "Summary": "User Dashboard",
    "Description": "Build dashboard with widgets",
    "Parent": "epic-1"
  },
  {
    "uid": "subtask-1",
    "Project": "${projectKey}",
    "Issue Type": "Sub-task",
    "Summary": "Google OAuth",
    "Description": "Add Google provider",
    "Parent": "task-1"
  },
  {
    "uid": "subtask-2",
    "Project": "${projectKey}",
    "Issue Type": "Sub-task",
    "Summary": "GitHub OAuth",
    "Description": "Add GitHub provider",
    "Parent": "task-1"
  }
]`,

    yaml: `uid: epic-1
Project: ${projectKey}
Issue Type: Epic
Summary: Q4 Release Planning
Description: Epic for Q4 2025 features
Epic Name: Q4 Release ${timestamp}
---
uid: task-1
Project: ${projectKey}
Issue Type: Task
Summary: Authentication Service
Description: Implement OAuth 2.0 login
Parent: epic-1
---
uid: task-2
Project: ${projectKey}
Issue Type: Task
Summary: User Dashboard
Description: Build dashboard with widgets
Parent: epic-1
---
uid: subtask-1
Project: ${projectKey}
Issue Type: Sub-task
Summary: Google OAuth
Description: Add Google provider
Parent: task-1
---
uid: subtask-2
Project: ${projectKey}
Issue Type: Sub-task
Summary: GitHub OAuth
Description: Add GitHub provider
Parent: task-1`
  };
}

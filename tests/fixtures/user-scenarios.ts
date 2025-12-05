/**
 * User Scenario Fixtures for Data-Driven Integration Tests
 * 
 * Strategy: Use createmeta to discover ALL available fields dynamically,
 * then create comprehensive scenarios that test every field with both:
 * - Exact matching values (friendly format)
 * - Fuzzy matching values (case-insensitive, partial matches)
 * 
 * **Environment Variables Required:**
 * - JIRA_PROJECT_KEY: Project to test against (e.g., 'ZUL')
 * - JIRA_TEST_USER_NAME: Valid unique user email/username for assignee tests
 * - TEST_PARENT_ISSUE_KEY: Valid parent issue for hierarchy tests (optional)
 * 
 * Story: E3-S15 - Data-Driven Integration Test Suite
 */

export interface UserScenario {
  /** Short name for the scenario */
  name: string;
  
  /** What this scenario validates (internal use) */
  description: string;
  
  /** Category for grouping */
  category: 'comprehensive-exact' | 'comprehensive-fuzzy' | 'edge-cases';
  
  /** Test description for it() block */
  testDescription: string;
  
  /** The user's input payload */
  payload: Record<string, any>;
  
  /** Which converters this exercises (for coverage tracking) */
  expectedConverters: string[];
}

export const USER_SCENARIOS: UserScenario[] = [
  // ============================================================
  // COMPREHENSIVE EXACT MATCH SCENARIO
  // Uses ALL fields from createmeta with exact string matches
  // ============================================================
  {
    name: 'task-all-fields-exact-match',
    description: 'Task with ALL available fields using exact string matches',
    category: 'comprehensive-exact',
    testDescription: 'should create Task with all available fields using exact matching values',
    payload: {
      Project: process.env.JIRA_PROJECT_KEY || 'ZUL',
      'Issue Type': 'Task',
      Summary: 'Task with all fields - exact match test',
      Description: 'Testing all available fields with exact string matches.\n\nCreated by E3-S15 data-driven integration test suite.',
      Priority: 'P1 - Critical',
      'Component/s': ['Code - Automation'],
      'Fix Version/s': ['ZUL_MS1_2024'],
      'Due Date': '2025-12-31',
      Assignee: process.env.JIRA_TEST_USER_NAME || 'Slack Tools',
      Level: 'MP -> mp_apartment', // Cascading select
      'Time Tracking': {
        'Original Estimate': '3h',
        'Remaining Estimate': '1h',
      },
      Labels: ['integration-test', 'exact-match', 'e3-s15'],
    },
    expectedConverters: [
      'project', 'issuetype', 'string', 'text', 'priority', 
      'array', 'date', 'user', 'option-with-child', 'timetracking'
    ],
  },
  
  // ============================================================
  // COMPREHENSIVE FUZZY MATCH SCENARIO
  // Uses ALL fields from createmeta with fuzzy values
  // (lowercase, mixed case, partial matches)
  // ============================================================
  {
    name: 'task-all-fields-fuzzy-match',
    description: 'Task with ALL available fields using fuzzy matching values',
    category: 'comprehensive-fuzzy',
    testDescription: 'should create Task with all available fields using fuzzy matching (lowercase, mixed case)',
    payload: {
      Project: 'Zulu',
      'Issue Type': 'task',
      Summary: 'Task with all fields - fuzzy match test',
      Description: 'Testing all available fields with fuzzy/case-insensitive values.',
      Priority: 'P0',
      'Component/s': 'code - automation',
      'Fix Version/s': 'MS7 2025', // Should fuzzy match to ZUL_MS7_2025
      'Due Date': '2025-12-31',
      Assignee: 'Slack Tools',
      Level: { parent: 'mp', child: 'apartment' },
      'Original Estimate': '2 hours',
      'Remaining Estimate': '30 min',
      Labels: ['integration-test', 'fuzzy-match', 'e3-s15'],
    },
    expectedConverters: [
      'project', 'issuetype', 'string', 'text', 'priority',
      'array', 'date', 'user', 'option-with-child', 'timetracking'
    ],
  },
  
  // ============================================================
  // BUG SCENARIO WITH MIXED FORMATS
  // Tests combination of exact + fuzzy + passthrough formats
  // ============================================================
  {
    name: 'bug-mixed-formats',
    description: 'Bug with mix of exact, fuzzy, and passthrough formats',
    category: 'comprehensive-fuzzy',
    testDescription: 'should create Bug with mixed format values (exact, fuzzy, passthrough)',
    payload: {
      Project: process.env.JIRA_PROJECT_KEY || 'ZUL',
      'Issue Type': 'BuG', // MIXED CASE - fuzzy match
      Summary: 'Bug with mixed formats - integration test',
      Description: 'Testing mixed value formats in one issue.',
      Priority: 'P1 - Critical', // Exact match
      'Component/s': ['Debug'], // Exact match
      'Due Date': '2025-11-30',
      Assignee: process.env.JIRA_TEST_USER_NAME || 'Slack Tools',
      'Original Estimate': '1d',
      Labels: ['bug', 'mixed-format', 'e3-s15'],
    },
    expectedConverters: [
      'project', 'issuetype', 'string', 'text', 'priority',
      'array', 'date', 'user', 'timetracking'
    ],
  },
  
  // ============================================================
  // EDGE CASE SCENARIOS
  // Tests boundary conditions, null handling, mixed formats
  // ============================================================
  {
    name: 'edge-minimal-with-nulls',
    description: 'Minimal Task with null optional fields and empty arrays',
    category: 'edge-cases',
    testDescription: 'should create Task with minimal fields, null optionals, and empty arrays',
    payload: {
      Project: process.env.JIRA_PROJECT_KEY || 'ZUL',
      'Issue Type': 'TaSk', // MIXED CASE - fuzzy match
      Summary: 'Minimal task with nulls and empty arrays - edge case test',
      Description: null, // Explicitly null
      Assignee: null, // Explicitly null
      Labels: [], // Empty array
    },
    expectedConverters: [
      'project', 'issuetype', 'string', 'text', 'user', 'array'
    ],
  },
  
  {
    name: 'edge-passthrough-format',
    description: 'Task with extremely fuzzy values (partial matches, alternate formats)',
    category: 'edge-cases',
    testDescription: 'should create Task with ultra-fuzzy values and still resolve correctly',
    payload: {
      Project: 'ZUL', // Project keys must be exact (no fuzzy matching)
      'Issue Type': 'TASK', // UPPERCASE
      Summary: 'Task with ultra-fuzzy values - edge case test',
      Description: 'Testing extreme fuzzy matching capabilities.',
      Priority: 'critical', // Just the severity word (no P1 prefix)
      'Component/s': ['automation'], // Partial match (should find "Code - Automation")
      Labels: ['edge-case', 'ultra-fuzzy'],
    },
    expectedConverters: [
      'project', 'issuetype', 'string', 'text', 'priority', 'array'
    ],
  },
];

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(category: UserScenario['category']): UserScenario[] {
  return USER_SCENARIOS.filter(s => s.category === category);
}

/**
 * Validate converter coverage - ensure all 15 converters are tested
 */
export function validateConverterCoverage(): { 
  covered: string[], 
  missing: string[], 
  percentage: number 
} {
  const ALL_CONVERTERS = [
    'string', 'text', 'number', 'date', 'datetime', 
    'array', 'priority', 'user', 'option', 'option-with-child',
    'component', 'version', 'timetracking', 'issuetype', 'project'
  ];
  
  const coveredConverters = new Set<string>();
  USER_SCENARIOS.forEach(scenario => {
    scenario.expectedConverters.forEach(converter => {
      coveredConverters.add(converter);
    });
  });
  
  const covered = Array.from(coveredConverters).sort();
  const missing = ALL_CONVERTERS.filter(c => !coveredConverters.has(c)).sort();
  const percentage = Math.round((covered.length / ALL_CONVERTERS.length) * 100);
  
  return { covered, missing, percentage };
}

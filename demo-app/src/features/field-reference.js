/**
 * Field Type Reference Browser
 * 
 * Educational tool to explore available field type converters
 * and see examples without creating issues
 */

import inquirer from 'inquirer';
import { showHeader, info, showCode, pause, clear } from '../ui/display.js';

/**
 * Field type converter documentation
 */
const FIELD_TYPES = [
  {
    name: '📝 String (Text Fields)',
    value: 'string',
    description: 'Single-line text fields like Summary, Environment',
    converter: 'Built-in string converter',
    accepts: 'Any string value',
    returns: 'Trimmed string',
    examples: [
      { input: '"  Test Summary  "', output: '"Test Summary"' },
      { input: '"Bug in login"', output: '"Bug in login"' },
    ],
  },
  {
    name: '📄 Text (Multi-line Fields)',
    value: 'text',
    description: 'Multi-line text fields like Description, Comments',
    converter: 'Built-in text converter',
    accepts: 'String with newlines',
    returns: 'Trimmed text preserving internal newlines',
    examples: [
      { input: '"Line 1\\nLine 2\\nLine 3"', output: '"Line 1\\nLine 2\\nLine 3"' },
      { input: '"  Steps:\\n1. Login\\n2. Click"', output: '"Steps:\\n1. Login\\n2. Click"' },
    ],
  },
  {
    name: '🧩 Component (Array Items)',
    value: 'component',
    description: 'Component/s field items',
    converter: 'ComponentConverter (E2-S10)',
    accepts: 'Component name (string) or {id: "..."}',
    returns: '{id: "12345"}',
    examples: [
      { input: '"Backend"', output: '{id: "10001"}' },
      { input: '"frontend"', output: '{id: "10002"} (case-insensitive)' },
      { input: '{id: "10001"}', output: '{id: "10001"} (passthrough)' },
    ],
  },
  {
    name: '🎯 Option (Single-Select Fields)',
    value: 'option',
    description: 'Single-select custom fields like Priority, Severity',
    converter: 'OptionConverter (E2-S09)',
    accepts: 'Option name (string) or {id: "..."}',
    returns: '{id: "10413"}',
    examples: [
      { input: '"High"', output: '{id: "2"}' },
      { input: '"a - blocker"', output: '{id: "10413"} (case-insensitive)' },
      { input: '{id: "2"}', output: '{id: "2"} (passthrough)' },
    ],
  },
  {
    name: '📋 Array (Multi-Value Fields)',
    value: 'array',
    description: 'Fields that accept multiple values',
    converter: 'ArrayConverter (E2-S04)',
    accepts: 'Array or CSV string',
    returns: 'Array of converted items',
    examples: [
      { input: '["Backend", "Frontend"]', output: '[{id: "10001"}, {id: "10002"}]' },
      { input: '"Backend, Frontend"', output: '[{id: "10001"}, {id: "10002"}] (CSV parsed)' },
      { input: '["label1", "label2"]', output: '["label1", "label2"] (string array)' },
    ],
  },
  {
    name: '🔢 Number',
    value: 'number',
    description: 'Numeric fields',
    converter: 'NumberConverter (E2-S01)',
    accepts: 'Number or numeric string',
    returns: 'Number',
    examples: [
      { input: '"42"', output: '42' },
      { input: '42', output: '42' },
      { input: '"3.14"', output: '3.14' },
    ],
  },
  {
    name: '📅 Date',
    value: 'date',
    description: 'Date-only fields',
    converter: 'DateConverter (E2-S02)',
    accepts: 'Date object, ISO string, or YYYY-MM-DD',
    returns: '"YYYY-MM-DD"',
    examples: [
      { input: '"2025-10-21"', output: '"2025-10-21"' },
      { input: 'new Date("2025-10-21")', output: '"2025-10-21"' },
      { input: '"2025-10-21T15:30:00Z"', output: '"2025-10-21"' },
    ],
  },
  {
    name: '⏰ DateTime',
    value: 'datetime',
    description: 'Date and time fields',
    converter: 'DateTimeConverter (E2-S03)',
    accepts: 'Date object or ISO string',
    returns: '"YYYY-MM-DDTHH:mm:ss.sss+0000"',
    examples: [
      { input: 'new Date("2025-10-21T15:30:00Z")', output: '"2025-10-21T15:30:00.000+0000"' },
      { input: '"2025-10-21T15:30:00Z"', output: '"2025-10-21T15:30:00.000+0000"' },
    ],
  },
  {
    name: '👤 User',
    value: 'user',
    description: 'User fields like Assignee, Reporter',
    converter: 'UserConverter (E2-S08)',
    accepts: 'Username, email, or {accountId: "..."}',
    returns: '{accountId: "..."} or {name: "..."}',
    examples: [
      { input: '"john.doe"', output: '{name: "john.doe"} (Server)' },
      { input: '"john.doe@example.com"', output: '{accountId: "abc123"} (Cloud)' },
      { input: '{accountId: "abc123"}', output: '{accountId: "abc123"} (passthrough)' },
    ],
  },
  {
    name: '🎯 Priority',
    value: 'priority',
    description: 'Issue priority field',
    converter: 'PriorityConverter (E2-S07)',
    accepts: 'Priority name (string) or {id: "..."}',
    returns: '{id: "3"}',
    examples: [
      { input: '"High"', output: '{id: "2"}' },
      { input: '"medium"', output: '{id: "3"} (case-insensitive)' },
      { input: '{id: "2"}', output: '{id: "2"} (passthrough)' },
    ],
  },
];

export async function runFieldReference() {
  let browsing = true;

  while (browsing) {
    clear();
    showHeader('Field Type Reference');
    info('Browse available field type converters and see examples\n');

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Select a field type to learn more:',
        choices: [
          ...FIELD_TYPES.map(ft => ({ name: ft.name, value: ft.value })),
          new inquirer.Separator(),
          { name: '← Back to main menu', value: 'back' },
        ],
        pageSize: 15,
      },
    ]);

    if (choice === 'back') {
      browsing = false;
      break;
    }

    const fieldType = FIELD_TYPES.find(ft => ft.value === choice);
    if (fieldType) {
      await showFieldTypeDetails(fieldType);
    }
  }
}

async function showFieldTypeDetails(fieldType) {
  clear();
  showHeader(fieldType.name);

  info(`Description: ${fieldType.description}`);
  info(`Converter: ${fieldType.converter}`);
  info(`Accepts: ${fieldType.accepts}`);
  info(`Returns: ${fieldType.returns}\n`);

  info('Examples:\n');

  for (const example of fieldType.examples) {
    showCode(`Input: ${example.input}`, `Output: ${example.output}`);
  }

  info('\nUsage in code:');
  showCode('JavaScript:', 
    `await jml.issues.create({\n` +
    `  Project: 'PROJ',\n` +
    `  'Issue Type': 'Task',\n` +
    `  Summary: 'Example',\n` +
    `  // Field using ${fieldType.value} converter:\n` +
    `  FieldName: ${fieldType.examples[0].input}\n` +
    `});`
  );

  await pause('\nPress Enter to continue...');
}

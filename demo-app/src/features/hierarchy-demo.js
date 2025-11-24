/**
 * Hierarchy Demo - Interactive Demo for E3-S09
 * 
 * Demonstrates parent-child relationships using JPO hierarchy
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, warning } from '../ui/display.js';
import { confirm } from '../ui/prompts.js';

/**
 * Run interactive hierarchy demo
 */
export async function runHierarchyDemo(config) {
  showHeader('Issue Hierarchy Demo (E3-S09)');

  info('This demo showcases parent-child relationships in JIRA:\n');
  console.log('  • Epic → Story → Subtask hierarchy');
  console.log('  • Parent link with exact key or summary search');
  console.log('  • Parent field synonyms ("Parent", "Epic Link", "Epic")');
  console.log('  • Multi-level hierarchies (5+ levels deep)');
  console.log('  • Cascading select fields\n');

  const { example } = await inquirer.prompt([
    {
      type: 'list',
      name: 'example',
      message: 'Choose a hierarchy example to run:',
      choices: [
        { name: '1. 📋 Epic with Stories (exact keys)', value: 'epic-stories' },
        { name: '2. ✅ Story with Subtasks (parent synonyms)', value: 'story-subtasks' },
        { name: '3. 🏗️  Multi-level Hierarchy (up to 6 levels deep)', value: 'multi-level' },
        { name: '4. 🔍 Parent Link by Summary Search', value: 'summary-search' },
        { name: '5. ⚙️  Custom Parent Synonyms (config)', value: 'custom-synonyms' },
        { name: '6. 🎯 Custom Issue Type Abbreviations', value: 'custom-types' },
        { name: '7. 🔀 Cascading Select All Formats', value: 'cascading-select' },
        new inquirer.Separator(),
        { name: '↩️  Back to Main Menu', value: 'back' },
      ],
      pageSize: 15,
    },
  ]);

  if (example === 'back') {
    return;
  }

  warning('\n⚠️  WARNING: This will create real issues in your JIRA instance!\n');

  const shouldContinue = await confirm('Continue with creating test issues?', false);

  if (!shouldContinue) {
    info('Demo cancelled\n');
    return;
  }

  const jml = new JML({
    baseUrl: config.baseUrl,
    auth: { token: config.token },
    apiVersion: config.apiVersion || 'v2',
    redis: config.redis || {
      host: 'localhost',
      port: 6379,
    },
  });

  try {
    switch (example) {
      case 'epic-stories':
        await demoEpicWithStories(jml, config);
        break;
      case 'story-subtasks':
        await demoStoryWithSubtasks(jml, config);
        break;
      case 'multi-level':
        await demoMultiLevelHierarchy(jml, config);
        break;
      case 'summary-search':
        await demoSummarySearch(jml, config);
        break;
      case 'custom-synonyms':
        await demoCustomSynonyms(config);
        break;
      case 'custom-types':
        await demoCustomTypes(config);
        break;
      case 'cascading-select':
        await demoCascadingSelect(jml, config);
        break;
    }

    await jml.disconnect();

    success('\n✅ Demo complete!\n');
    info('Check your JIRA project to see the created issues.\n');

  } catch (err) {
    error(`\nDemo failed: ${err.message}\n`);
    console.error(err);
  }

  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Demo 1: Epic with Stories
 */
async function demoEpicWithStories(jml, config) {
  const projectKey = config.defaultProjectKey || 'DEMO';

  console.log('\n📋 Creating Epic with linked Stories...\n');

  const spinner = ora('Creating Epic...').start();
  const epic = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Epic',
    Summary: `Q4 Feature Development - ${new Date().toISOString().split('T')[0]}`,
    Description: 'Epic for all Q4 features (demo)',
  });
  spinner.succeed(`Created Epic: ${epic.key}`);

  spinner.start('Creating Story 1 (using "Parent" synonym)...');
  const story1 = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Story',
    Summary: 'User Login Feature',
    Description: 'Implement user authentication',
    Parent: epic.key, // Using "Parent" synonym
  });
  spinner.succeed(`Created Story: ${story1.key} (parent: ${epic.key})`);

  spinner.start('Creating Story 2 (using "Epic Link" synonym)...');
  const story2 = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Story',
    Summary: 'User Profile Page',
    Description: 'User can view and edit profile',
    'Epic Link': epic.key, // Using "Epic Link" synonym
  });
  spinner.succeed(`Created Story: ${story2.key} (parent: ${epic.key})`);

  showCodeExample(`
// Create Epic
const epic = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Epic',
  Summary: 'Q4 Feature Development',
});

// Link Stories to Epic (multiple synonym options)
const story1 = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Story',
  Summary: 'User Login Feature',
  Parent: epic.key,        // ← "Parent" synonym
});

const story2 = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Story',
  Summary: 'User Profile Page',
  'Epic Link': epic.key,   // ← "Epic Link" synonym
});
  `);
}

/**
 * Demo 2: Story with Subtasks
 */
async function demoStoryWithSubtasks(jml, config) {
  const projectKey = config.defaultProjectKey || 'DEMO';

  console.log('\n✅ Creating Story with Subtasks...\n');

  const spinner = ora('Creating Story...').start();
  const story = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Story',
    Summary: `Implement Dashboard - ${new Date().toISOString().split('T')[0]}`,
    Description: 'User dashboard with widgets (demo)',
  });
  spinner.succeed(`Created Story: ${story.key}`);

  spinner.start('Creating Subtask 1 (using "Parent")...');
  const subtask1 = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Sub-task',
    Summary: 'Design dashboard layout',
    Parent: story.key,
  });
  spinner.succeed(`Created Subtask: ${subtask1.key} (parent: ${story.key})`);

  spinner.start('Creating Subtask 2 (using "Parent Link")...');
  const subtask2 = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Sub-task',
    Summary: 'Implement widget API',
    'Parent Link': story.key,
  });
  spinner.succeed(`Created Subtask: ${subtask2.key} (parent: ${story.key})`);

  showCodeExample(`
// Create Story
const story = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Story',
  Summary: 'Implement Dashboard',
});

// Create Subtasks (multiple synonyms work)
const subtask1 = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Sub-task',
  Summary: 'Design dashboard layout',
  Parent: story.key,         // ← "Parent" synonym
});

const subtask2 = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Sub-task',
  Summary: 'Implement widget API',
  'Parent Link': story.key,  // ← "Parent Link" synonym
});
  `);
}

/**
 * Demo 3: Multi-level Hierarchy
 * 
 * Shows how to create a multi-level hierarchy by discovering the available
 * hierarchy from JIRA (JPO or standard) and creating issues at different levels.
 * The library automatically resolves the "Parent" field to the correct
 * custom field for your project (could be "Epic Link", "Parent Link", etc.)
 */
async function demoMultiLevelHierarchy(jml, config) {
  console.log('\n🏗️  Multi-level Hierarchy Demo\n');

  // Ask user for project key
  const { projectKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectKey',
      message: 'Enter project key:',
      default: config.defaultProjectKey || 'DEMO',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Project key is required';
        }
        return true;
      },
    },
  ]);

  console.log('\n🔍 Discovering JIRA hierarchy...\n');
  
  // Discover hierarchy
  const spinner = ora('Checking for JPO hierarchy...').start();
  const hierarchy = await jml.getHierarchy();
  
  if (!hierarchy) {
    spinner.info('No JPO hierarchy found - using standard JIRA hierarchy');
    await demoStandardHierarchy(jml, projectKey);
    return;
  }
  
  spinner.succeed('JPO hierarchy discovered!');
  console.log('\nAvailable hierarchy levels:');
  hierarchy.forEach(level => {
    console.log(`  ${level.id}. ${level.title} (${level.issueTypeIds.length} issue types)`);
  });
  
  info('\nThis demo will create a multi-level hierarchy using your configuration.\n');
  info('Available levels: Sub-task → Story → Epic → Phase → Container → Anthology\n');
  info('Note: The library handles all field resolution automatically.\n');
  info('You just use "Parent" and the library finds the right field!\n');

  // Get available issue types with their IDs
  info('\nGetting available issue types for this project...\n');
  
  let issueTypes = [];
  try {
    issueTypes = await jml.getIssueTypes(projectKey);
    spinner.succeed(`Found ${issueTypes.length} issue types in project ${projectKey}`);
  } catch (err) {
    spinner.fail('Could not get issue types');
    warning(`\nFailed to get issue types: ${err.message}`);
    info('Falling back to standard Epic→Story→Subtask...\n');
    await demoStandardHierarchy(jml, projectKey);
    return;
  }
  
  // Sort hierarchy from highest to lowest, support all available levels
  const sortedLevels = [...hierarchy].sort((a, b) => b.id - a.id);
  
  const levelsToUse = [];
  let lastSelectedLevel = null;
  
  info('\nFiltering issue types by hierarchy level...\n');
  
  for (const level of sortedLevels) {
    // If we have a previous selection, only allow the next level down (sequential chain)
    if (lastSelectedLevel !== null && level.id !== lastSelectedLevel - 1) {
      continue; // Skip - would break the chain
    }
    
    // Filter issue types: only show types whose IDs are in this level's issueTypeIds
    const validTypesForLevel = issueTypes
      .filter(it => level.issueTypeIds.includes(it.id))
      .filter(it => !levelsToUse.some(l => l.issueType === it.name)); // Skip already used
    
    if (validTypesForLevel.length === 0) {
      // No valid types at this level in this project, skip it
      continue;
    }
    
    info(`Level ${level.id} (${level.title}): ${validTypesForLevel.length} type(s) available`);
    
    const { issueType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'issueType',
        message: `Select issue type for ${level.title} (level ${level.id}):`,
        choices: [
          ...validTypesForLevel.map(t => ({ name: t.name, value: t.name })),
          new inquirer.Separator(),
          { name: '⏭️  Skip this level', value: null },
          { name: '✅ Stop here (start creating)', value: 'STOP' },
        ],
      },
    ]);
    
    if (issueType === 'STOP') {
      info('\nStopping selection, will create hierarchy with selected levels.');
      break;
    }
    
    if (issueType) {
      levelsToUse.push({ level: level.id, title: level.title, issueType });
      lastSelectedLevel = level.id;
    }
    
    // No artificial limit - user can select all levels down to Sub-task
  }
  
  if (levelsToUse.length < 2) {
    warning('\nNeed at least 2 levels to create a hierarchy.');
    info('Falling back to standard Epic→Story→Subtask...\n');
    await demoStandardHierarchy(jml, projectKey);
    return;
  }
  
  info(`\nWill create ${levelsToUse.length}-level hierarchy:`);
  
  info(`\nWill create ${levelsToUse.length}-level hierarchy:`);
  levelsToUse.forEach((l, i) => {
    const indent = '  ' + '  '.repeat(i);
    console.log(`${indent}└─ ${l.issueType} (${l.title} level)`);
  });
  console.log();

  const createdIssues = [];
  const spinner2 = ora(`Creating ${levelsToUse[0].issueType} (top level)...`).start();
  const topIssue = await jml.issues.create({
    Project: projectKey,
    'Issue Type': levelsToUse[0].issueType,
    Summary: `${levelsToUse[0].issueType} - ${new Date().toISOString().split('T')[0]}`,
  });
  spinner2.succeed(`Created ${levelsToUse[0].issueType}: ${topIssue.key}`);
  createdIssues.push({ key: topIssue.key, type: levelsToUse[0].issueType });

  // Create remaining levels with parent links
  for (let i = 1; i < levelsToUse.length; i++) {
    const parentIssue = createdIssues[i - 1];
    spinner2.start(`Creating ${levelsToUse[i].issueType} under ${parentIssue.key}...`);
    
    const payload = {
      Project: projectKey,
      'Issue Type': levelsToUse[i].issueType,
      Summary: `${levelsToUse[i].issueType} under ${parentIssue.type}`,
      Parent: parentIssue.key,  // ← Library resolves to correct parent field
    };
    
    // Demo user input: Epic Name is commonly required for Epic issue types
    // This is legitimate user input, not hardcoded library logic
    const issueTypeLC = levelsToUse[i].issueType.toLowerCase();
    if (issueTypeLC === 'epic') {
      payload['Epic Name'] = `Demo ${levelsToUse[i].issueType} - ${new Date().toISOString().split('T')[0]}`;
    }
    
    const issue = await jml.issues.create(payload);
    
    spinner2.succeed(`Created ${levelsToUse[i].issueType}: ${issue.key} (parent: ${parentIssue.key})`);
    createdIssues.push({ key: issue.key, type: levelsToUse[i].issueType });
  }

  // Show hierarchy tree
  success(`\n✅ ${levelsToUse.length}-Level Hierarchy Created:\n`);
  createdIssues.forEach((issue, index) => {
    const indent = '   '.repeat(index) + (index > 0 ? '└── ' : '');
    console.log(`${indent}${issue.key} (${issue.type})`);
  });
  console.log();

  showCodeExample(`
// Step 1: Discover your JIRA hierarchy
const hierarchy = await jml.getHierarchy();

if (hierarchy) {
  // JPO installed - hierarchy is an array of levels
  console.log('Hierarchy levels:', hierarchy.map(l => l.title));
  // Example: ["Sub-task", "Story", "Epic", "Phase", "Container", "Anthology"]
  
  // Find the level you want by title or id
  const epicLevel = hierarchy.find(l => l.title === 'Epic');
  const storyLevel = hierarchy.find(l => l.title === 'Story');
  
  // Create issues at different levels
  const epic = await jml.issues.create({
    Project: '${projectKey}',
    'Issue Type': epicLevel.title, // "Epic"
    Summary: 'Product Release',
  });
  
  const story = await jml.issues.create({
    Project: '${projectKey}',
    'Issue Type': storyLevel.title, // "Story"
    Summary: 'Authentication Service',
    Parent: epic.key,  // ← Just use "Parent"!
  });
  
  const subtask = await jml.issues.create({
    Project: '${projectKey}',
    'Issue Type': 'Sub-task', // Or use hierarchy[0].title
    Summary: 'Google OAuth provider',
    Parent: story.key,  // ← Same pattern
  });
} else {
  // Standard JIRA - use built-in Epic/Story/Subtask
  const epic = await jml.issues.create({
    Project: '${projectKey}',
    'Issue Type': 'Epic',
    Summary: 'Product Release',
  });
  
  const story = await jml.issues.create({
    Project: '${projectKey}',
    'Issue Type': 'Story',
    Summary: 'Feature',
    Parent: epic.key,
  });
}

// ✅ Works with ANY hierarchy in your JIRA!
// No need to know if it's "Epic Link", "Parent Link", or custom field.
// The library discovers and handles it automatically.
  `);
}

/**
 * Fallback for standard JIRA (no JPO)
 */
async function demoStandardHierarchy(jml, projectKey) {
  info('Creating standard Epic → Story → Subtask hierarchy\n');

  const spinner3 = ora('Creating Epic (top level)...').start();
  const epic = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Epic',
    Summary: `Product Release - ${new Date().toISOString().split('T')[0]}`,
    'Epic Name': `Release ${new Date().toISOString().split('T')[0]}`, // Required for Epic
  });
  spinner3.succeed(`Created Epic: ${epic.key}`);

  spinner3.start('Creating Story under Epic...');
  const story = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Story',
    Summary: 'Authentication Service',
    Parent: epic.key,
  });
  spinner3.succeed(`Created Story: ${story.key} (parent: ${epic.key})`);

  spinner3.start('Creating Subtask under Story...');
  const subtask = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Sub-task',
    Summary: 'Google OAuth provider',
    Parent: story.key,
  });
  spinner3.succeed(`Created Subtask: ${subtask.key} (parent: ${story.key})`);

  success('\n✅ 3-Level Hierarchy Created:\n');
  console.log(`   ${epic.key} (Epic)`);
  console.log(`   └── ${story.key} (Story)`);
  console.log(`       └── ${subtask.key} (Subtask)\n`);
}



/**
 * Demo 4: Summary Search
 */
async function demoSummarySearch(jml, config) {
  const projectKey = config.defaultProjectKey || 'DEMO';

  console.log('\n🔍 Creating parent link using summary search...\n');

  const uniqueId = Date.now();
  const spinner = ora('Creating Epic with unique summary...').start();
  const epic = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Epic',
    Summary: `Unique Epic ${uniqueId}`,
    Description: 'Epic with unique summary for search demo',
  });
  spinner.succeed(`Created Epic: ${epic.key} (${epic.fields.summary})`);

  spinner.start('Creating Story linked by summary search...');
  const story = await jml.issues.create({
    Project: projectKey,
    'Issue Type': 'Story',
    Summary: 'Feature for unique epic',
    Parent: `Unique Epic ${uniqueId}`, // ← Search by summary!
  });
  spinner.succeed(`Created Story: ${story.key} (found parent by summary)`);

  showCodeExample(`
// Create Epic with unique summary
const epic = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Epic',
  Summary: 'Unique Epic ${uniqueId}',
});

// Link by summary (not key!)
const story = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Story',
  Summary: 'Feature for unique epic',
  Parent: 'Unique Epic ${uniqueId}',  // ← Library searches by summary
});

// ✅ Library automatically:
// 1. Searches for Epic with matching summary
// 2. Resolves to Epic key
// 3. Creates Story with proper parent link
  `);
}

/**
 * Demo 5: Custom Synonyms
 */
async function demoCustomSynonyms(config) {
  console.log('\n⚙️  Custom Parent Synonyms Demo\n');

  info('You can configure custom parent field synonyms via config:\n');

  showCodeExample(`
const jml = new JML({
  baseUrl: '${config.baseUrl}',
  auth: { token: 'YOUR_TOKEN' },
  
  // Add custom parent synonyms
  parentFieldSynonyms: [
    'Custom Parent',
    'My Parent Field',
    'Initiative',
    'Portfolio Item'
  ]
});

// Now you can use any of these:
const story = await jml.issues.create({
  Project: 'DEMO',
  'Issue Type': 'Story',
  Summary: 'My Story',
  'Custom Parent': 'EPIC-123',     // ← Custom synonym
  // OR
  Initiative: 'EPIC-123',           // ← Another custom synonym
  // OR
  Parent: 'EPIC-123',               // ← Default synonym still works
});

// ✅ Custom synonyms MERGE with defaults (not replace)
// Default synonyms: "Parent", "Epic Link", "Epic", "Parent Link", "Parent Issue"
  `);

  info('Custom synonyms extend (not replace) the default list\n');
  info('This allows team-specific field names while keeping standard ones\n');
}

/**
 * Demo 6: Custom Issue Types
 */
async function demoCustomTypes(config) {
  console.log('\n🎯 Custom Issue Type Abbreviations Demo\n');

  info('You can configure custom issue type abbreviations:\n');

  showCodeExample(`
const jml = new JML({
  baseUrl: '${config.baseUrl}',
  auth: { token: 'YOUR_TOKEN' },
  
  // Add custom issue type abbreviations
  issueTypeAbbreviations: {
    spike: ['spike', 'sp', 'research'],
    technical_debt: ['tech debt', 'td', 'debt'],
    improvement: ['improve', 'imp', 'enhancement']
  }
});

// Now you can use abbreviations:
const issue1 = await jml.issues.create({
  Project: 'DEMO',
  'Issue Type': 'sp',              // ← Resolves to "Spike"
  Summary: 'Research OAuth options',
});

const issue2 = await jml.issues.create({
  Project: 'DEMO',
  'Issue Type': 'tech debt',       // ← Resolves to "Technical Debt"
  Summary: 'Refactor auth module',
});

// ✅ Fuzzy matching still works:
// 'stor' → 'Story'
// 'bug' → 'Bug'  
// 'SP' → 'Spike' (case-insensitive)
  `);

  info('Abbreviations make issue creation faster and more flexible\n');
}

/**
 * Demo 7: Cascading Select
 */
async function demoCascadingSelect(jml, config) {
  const projectKey = config.defaultProjectKey || 'DEMO';

  console.log('\n🔀 Cascading Select Field Formats Demo\n');
  info('This requires a cascading select custom field in your project\n');

  warning('⚠️  Skipping issue creation (requires project-specific cascading field)\n');

  showCodeExample(`
// Format 1: String with delimiter
const issue1 = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Story',
  Summary: 'Test cascading select',
  'My Cascading Field': 'Parent Option -> Child Option',
});

// Format 2: Object with parent/child
const issue2 = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Story',
  Summary: 'Test cascading select',
  'My Cascading Field': {
    parent: 'Parent Option',
    child: 'Child Option'
  }
});

// Format 3: Array [parent, child]
const issue3 = await jml.issues.create({
  Project: '${projectKey}',
  'Issue Type': 'Story',
  Summary: 'Test cascading select',
  'My Cascading Field': ['Parent Option', 'Child Option']
});

// ✅ All three formats produce the same result!
// The library converts them to proper JIRA API format.
  `);
}

/**
 * Show formatted code example
 */
function showCodeExample(code) {
  console.log('\n📝 Code Example:\n');
  console.log('\x1b[2m' + code.trim() + '\x1b[0m\n');
}

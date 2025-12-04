/**
 * Hierarchy Demo - Interactive Demo for E3-S09
 * 
 * Demonstrates parent-child relationships using JPO hierarchy
 */

import inquirer from 'inquirer';
import ora from 'ora';
import { JML } from 'jira-magic-library';
import { showHeader, success, error, info, warning, showCode, pause } from '../ui/display.js';
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
        { name: '1. 🔎 Discover Parent Fields (read-only)', value: 'discover-parents' },
        new inquirer.Separator(),
        { name: '2. 📋 Epic with Stories (exact keys)', value: 'epic-stories' },
        { name: '3. ✅ Story with Subtasks (parent synonyms)', value: 'story-subtasks' },
        { name: '4. 🏗️  Multi-level Hierarchy (up to 6 levels deep)', value: 'multi-level' },
        { name: '5. 🔍 Parent Link by Summary Search', value: 'summary-search' },
        { name: '6. ⚙️  Custom Parent Synonyms (config)', value: 'custom-synonyms' },
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

  // Discover parents is read-only, skip the warning
  if (example === 'discover-parents') {
    const jml = new JML({
      baseUrl: config.baseUrl,
      auth: { token: config.token },
      apiVersion: config.apiVersion || 'v2',
      redis: config.redis || { host: 'localhost', port: 6379 },
    });
    await demoDiscoverParentFields(jml, config);
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
 * Demo: Discover Parent Fields (read-only)
 * 
 * Discovers and displays parent fields for all issue types in a project.
 * This is a read-only operation - no issues are created.
 */
async function demoDiscoverParentFields(jml, config) {
  const projectKey = config.defaultProjectKey || 'DEMO';

  console.log('\n🔎 Discovering Parent Fields & Valid Parents\n');
  info(`Project: ${projectKey}\n`);
  info('This discovers which field each issue type uses for parent references,\n');
  info('and which issue types are valid parents based on the hierarchy.\n\n');

  const spinner = ora('Fetching issue types and hierarchy...').start();

  try {
    // Get all issue types for the project and hierarchy structure
    const [issueTypes, hierarchy] = await Promise.all([
      jml.getIssueTypes(projectKey),
      jml.getHierarchy(),
    ]);
    
    // Build a map of issue type ID -> name for lookups
    const issueTypeMap = new Map(issueTypes.map(t => [t.id, t.name]));
    
    spinner.succeed(`Found ${issueTypes.length} issue types` + (hierarchy ? ` with ${hierarchy.length}-level hierarchy` : ' (no JPO hierarchy)'));

    // Collect all parent field data first (before displaying)
    spinner.start('Discovering parent fields for all issue types...');
    const results = [];
    
    for (const issueType of issueTypes) {
      try {
        const parentField = await jml.getParentField(projectKey, issueType.name);
        
        // Find valid parent types from hierarchy
        let validParentTypes = [];
        if (hierarchy) {
          // Find child's level in hierarchy
          const childLevel = hierarchy.find(level => level.issueTypeIds.includes(issueType.id));
          if (childLevel) {
            // Parent level is one higher (id + 1)
            const parentLevel = hierarchy.find(level => level.id === childLevel.id + 1);
            if (parentLevel) {
              // Map parent level issue type IDs to names
              validParentTypes = parentLevel.issueTypeIds
                .map(id => issueTypeMap.get(id))
                .filter(Boolean);
            }
          }
        }
        
        results.push({
          typeName: issueType.name,
          parentField,
          validParentTypes,
          error: null,
        });
      } catch (err) {
        results.push({
          typeName: issueType.name,
          parentField: null,
          validParentTypes: [],
          error: err.message,
        });
      }
    }
    
    spinner.succeed('Discovery complete');

    // Now display all results at once (no interleaved async operations)
    console.log('\n┌──────────────────────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ Issue Type           │ Parent Field          │ Field Key            │ Valid Parents         │');
    console.log('├──────────────────────────────────────────────────────────────────────────────────────────────┤');

    for (const result of results) {
      const typeName = result.typeName.padEnd(20);
      const validParents = result.validParentTypes.length > 0 
        ? result.validParentTypes.join(', ').slice(0, 21).padEnd(21)
        : '(top level)'.padEnd(21);
        
      if (result.error) {
        console.log(`│ ${typeName} │ ${'Error'.padEnd(21)} │ ${result.error.slice(0, 20).padEnd(20)} │ ${'-'.padEnd(21)} │`);
      } else if (result.parentField) {
        const fieldName = result.parentField.name.padEnd(21);
        const fieldKey = result.parentField.key.padEnd(20);
        console.log(`│ ${typeName} │ ${fieldName} │ ${fieldKey} │ ${validParents} │`);
      } else {
        console.log(`│ ${typeName} │ ${'(none)'.padEnd(21)} │ ${'-'.padEnd(20)} │ ${validParents} │`);
      }
    }

    console.log('└──────────────────────────────────────────────────────────────────────────────────────────────┘');

    // Show usage example
    console.log('\n');
    info('💡 How to use discovered parent fields:\n\n');

    showCodeExample(`
// Get parent field for a specific issue type
const parentField = await jml.getParentField('${projectKey}', 'Story');

if (parentField) {
  console.log(\`Field: \${parentField.name} (\${parentField.key})\`);
  // "Field: Parent Link (customfield_10014)"
  
  // Use the discovered field name in issue creation:
  await jml.issues.create({
    Project: '${projectKey}',
    'Issue Type': 'Story',
    Summary: 'My Story',
    [parentField.name]: 'EPIC-123',  // Discovered field name
    // OR simply use:
    Parent: 'EPIC-123',               // "Parent" always works
  });
}

// Discover all parent fields for a project
const issueTypes = await jml.getIssueTypes('${projectKey}');
for (const type of issueTypes) {
  const parent = await jml.getParentField('${projectKey}', type.name);
  console.log(\`\${type.name}: \${parent?.name ?? 'No parent field'}\`);
}
`);

    success('\n✅ Discovery complete (read-only, no issues created)\n');
    
    await pause();
    await jml.disconnect();

  } catch (err) {
    spinner.fail(`Failed: ${err.message}`);
    throw err;
  }
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
  
  // Add custom parent synonyms (extends defaults, not replaces)
  parentFieldSynonyms: [
    'Initiative',
    'Portfolio Item',
    'Superior'
  ]
});

// The library automatically discovers the parent field name from JIRA
// (e.g., "Parent Link", "Container", "Epic Link") and uses that.
// Custom synonyms are ADDED to the discovered name + "parent" keyword.

// Now you can use:
const story = await jml.issues.create({
  Project: 'DEMO',
  'Issue Type': 'Story',
  Summary: 'My Story',
  
  // These always work:
  'Parent Link': 'EPIC-123',        // ← Discovered from JIRA schema
  Parent: 'EPIC-123',               // ← Universal "parent" keyword
  
  // Custom synonyms also work:
  Initiative: 'EPIC-123',           // ← From parentFieldSynonyms config
});

// ✅ Synonym priority:
// 1. Discovered field name from JIRA (e.g., "Parent Link", "Container")
// 2. Custom synonyms from parentFieldSynonyms config
// 3. Default "parent" keyword (always works)
  `);

  info('Custom synonyms extend (not replace) the discovered field name\n');
  info('The library discovers the actual parent field from your JIRA instance\n');
}

/**
 * Demo 6: Cascading Select
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

# 🪄 JIRA Magic Library - Interactive Demo

A beautiful, interactive terminal application for exploring JIRA Magic Library features.

## ✨ Features

- 🎨 **Beautiful Terminal UI** - Color-coded output, loading spinners, formatted boxes
- 🔐 **Credential Management** - Save/load credentials securely
- 🎯 **Interactive Demos** - Guided walkthroughs of each feature
- 📝 **Code Examples** - See actual code before running it
- 🔄 **Real JIRA Integration** - Creates actual issues in your instance

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd demo-app
npm install
```

### 2. Run the Demo

```bash
npm start
```

### 3. Follow the Prompts

The demo will guide you through:
- Setting up your JIRA credentials
- Testing the connection
- Selecting features to explore
- Creating real JIRA issues

## 🎓 Available Demos

### Option Type Converter (E2-S09) ✅

Learn how to work with single-select custom fields:
- Set option by name (user-friendly)
- Set option by ID (advanced)
- Case-insensitive matching
- Optional field handling

### Issue Hierarchy (E3-S09) ✅

Comprehensive examples for parent-child relationships:
- **Epic with Stories** - Link stories to epics using exact keys
- **Story with Subtasks** - Create subtasks under stories
- **Multi-level Hierarchy** - Container → Phase → Epic → Story → Subtask
- **Parent Synonyms** - Use "Parent", "Epic Link", "Epic", "Parent Link", etc.
- **Summary Search** - Find parents by summary text
- **Custom Synonyms** - Configure your own parent field synonyms
- **Issue Type Abbreviations** - Use shortcuts like "ST" for Story, "B" for Bug
- **Cascading Select** - All 3 input formats (string, object, array)

**Run hierarchy examples:**
```bash
cd demo-app
node src/features/hierarchy.js
```

**Individual examples:**
```javascript
const { createEpicWithStories, createSubtaskHierarchy, createMultiLevelHierarchy } = require('./src/features/hierarchy');

// Create Epic with 2 Stories
await createEpicWithStories();

// Create Story with 2 Subtasks
await createSubtaskHierarchy();

// Create 5-level hierarchy
await createMultiLevelHierarchy();
```

### User Ambiguity Policy Explorer 💡

Quickly compare how the **first**, **error**, and **score** ambiguity policies behave without creating issues:

- Runs reporter conversion in **dry-run mode** (no API mutations).
- Uses your live directory data so you can see exact matches vs ambiguity warnings.
- Logs resolved payloads or candidate lists for each policy to help you choose the right default.

**How to run:**
1. `npm start` inside `demo-app/`.
2. Pick **User Ambiguity Policy Explorer** from the main menu.
3. Enter the project/issue type for lookups (used only for dry-run validation).
4. Provide the email/username/display name to test and review each policy’s output.

### Coming Soon

- 📝 Text Field Converter (E1-S08)
- 🔢 Number Type Converter (E2-S01)
- 📅 DateTime Converter (E2-S03)
- 👤 User Type Converter (E2-S08)

## 🏗️ Architecture

### Demo Organization

Demos are organized into two categories:

#### 1. **User-Facing Demos** (Main Menu)
Demonstrate the **public JML API** that customers will use:
- Show complete workflows using `jira-magic-library` package imports
- Focus on end-user experience and real-world use cases
- Examples: `multi-field-creator.js`, `bulk-import.js`, `hierarchy-demo.js`

#### 2. **Infrastructure Demos** (Developer Tools Section)
Demonstrate **internal components** for development and testing:
- Show internal classes not exported in public API
- Help developers understand implementation details
- Examples: `manifest-storage-demo.js`, `bulk-api-wrapper-demo.js`, `field-reference.js`

**Key Principle**: User-facing demos show what customers import and use. Infrastructure demos show internal implementation for development purposes.

### Directory Structure

```
demo-app/
├── src/
│   ├── index.js              # Main entry point with menu
│   ├── prompts.js            # Menu structure (User vs Infrastructure sections)
│   ├── config/
│   │   └── manager.js        # Credential storage
│   ├── ui/
│   │   ├── display.js        # Output formatting
│   │   └── prompts.js        # Interactive prompts
│   └── features/
│       ├── multi-field-creator.js  # User-facing: Field testing
│       ├── bulk-import.js          # User-facing: Bulk creation
│       ├── hierarchy-demo.js       # User-facing: Parent links
│       └── deprecated/             # Old/internal demos
│           ├── manifest-storage-demo.js  # Infrastructure
│           └── bulk-api-wrapper-demo.js  # Infrastructure
├── package.json
└── README.md
```
```

## 🔧 Configuration

Credentials are saved to `.demo-config.json` (gitignored). Example:

```json
{
  "baseUrl": "https://your-instance.atlassian.net",
  "token": "your-personal-access-token",
  "apiVersion": "v2",
  "defaultProjectKey": "ENG"
}
```

## 🎨 UX Features

- **Inquirer** - Arrow key menu navigation
- **Chalk** - Color-coded terminal output
- **Boxen** - Beautiful bordered boxes
- **Ora** - Loading spinners for async operations

## 🐛 Troubleshooting

### "Cannot find module 'jira-magic-library'"

Run `npm install` in the demo-app directory. The library is linked via `"jira-magic-library": "file:../"`.

### "Connection failed"

- Verify your JIRA URL is correct
- Check your Personal Access Token is valid
- Ensure network access to your JIRA instance

### Colors not showing

Some terminals don't support colors. Try a modern terminal like:
- Windows Terminal
- iTerm2 (macOS)
- GNOME Terminal (Linux)

## � Adding New Demos

### User-Facing Demo (Main Menu)

**When**: Story implements public API that users will call

**Pattern**:
```javascript
// demo-app/src/features/my-feature.js
import { jml } from 'jira-magic-library';  // Import from package

export async function runMyFeatureDemo(config) {
  showHeader('My Feature Demo');
  
  // Show what the user will do
  const result = await jml.issues.create({
    Project: 'ENG',
    'Issue Type': 'Task',
    Summary: 'Test issue'
  });
  
  success(`Created: ${result.key}`);
}
```

**Integration**:
1. Add demo file to `demo-app/src/features/`
2. Import in `demo-app/src/index.js`
3. Add menu choice in **User-Facing Features** section
4. Call demo with config parameter

### Infrastructure Demo (Developer Tools)

**When**: Story implements internal class/utility (not exported in public API)

**Pattern**:
```javascript
// demo-app/src/features/deprecated/internal-component-demo.js
import { InternalClass } from 'jira-magic-library/dist/internal/InternalClass.js';

export async function runInternalDemo(config) {
  showHeader('Internal Component Demo (Development)');
  warning('⚠️  This demonstrates internal implementation details.');
  
  // Directly test the internal class
  const component = new InternalClass(config);
  const result = await component.someMethod();
  
  info('Result:', result);
}
```

**Integration**:
1. Add demo file to `demo-app/src/features/deprecated/` (or new `infrastructure/`)
2. Import in `demo-app/src/index.js`
3. Add menu choice in **Infrastructure Demos** section
4. Mark clearly as "Development Tool" in menu

### Menu Structure Example

```javascript
// demo-app/src/prompts.js
const choices = [
  new inquirer.Separator('=== User-Facing Features ==='),
  { name: '�📝 Multi-Field Issue Creator', value: 'multi-field' },
  { name: '📦 Bulk Issue Import (CSV/JSON/YAML)', value: 'bulk-import' },
  { name: '🔗 Issue Hierarchy & Parent Links', value: 'hierarchy' },
  
  new inquirer.Separator('=== Infrastructure Demos (Development) ==='),
  { name: '🗄️  Manifest Storage (Internal)', value: 'manifest-storage' },
  { name: '🔄 Bulk API Wrapper (Internal)', value: 'bulk-api-wrapper' },
  { name: '🔍 JIRA Field Reference', value: 'field-reference' },
];
```

---

## 📋 Adding New Demos (Legacy)

The demo-app is an **interactive menu-driven application**, not a collection of standalone scripts.

### Demo Architecture Pattern

**Structure:** All demos follow this pattern:

```
src/features/{name}.js    # Feature demo implementation
       ↓ (import)
src/index.js              # Main menu integration
       ↓ (import)
src/ui/prompts.js         # Menu item definition
```

**Example:** See `src/features/bulk-import.js` (E4-S01) for the complete pattern.

### Step-by-Step: Adding a New Demo

#### 1. Create Feature File

**File:** `src/features/{your-feature}.js`

**Template:**
```javascript
import inquirer from 'inquirer';
import ora from 'ora';
import { YourAPI } from 'jira-magic-library'; // Import from compiled library
import { showHeader, success, error, info } from '../ui/display.js';
import { pause } from '../ui/prompts.js';

/**
 * Your Feature Demo (E{epic}-S{story})
 * 
 * Brief description of what this demo shows.
 * 
 * Note: Scope guidance if needed.
 */

export async function runYourFeatureDemo(config) {
  showHeader('Your Feature Demo Title');

  info('Description of what users will learn.\n');

  try {
    // Your demo logic here:
    // 1. Show example data/code
    // 2. Interactive prompts for user input
    // 3. Call library API with user choices
    // 4. Display results with formatting
    
    success('✓ Demo completed!');
    await pause();
  } catch (err) {
    error(`\n❌ Error: ${err.message}`);
    console.error(err);
    await pause();
  }
}
```

**Key Points:**
- Import from `'jira-magic-library'` (not from `src/` or relative paths)
- Use UI helpers: `showHeader`, `info`, `success`, `error`, `warning`, `showCode`
- Accept `config` parameter (contains baseUrl, token, apiVersion, redis)
- Export async function (not default export)
- Always wrap in try/catch with error display
- Always end with `pause()` so user can read output

#### 2. Add Menu Item

**File:** `src/ui/prompts.js`

**Add to `mainMenu` function's choices array:**
```javascript
export async function mainMenu() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '✨ Multi-Field Issue Creator (E1-E3)', value: 'multi-field' },
        { name: '📥 Your Feature Name (E{X}-S{YY})', value: 'your-feature' }, // Add here
        // ... existing choices
      ],
    },
  ]);
  return action;
}
```

**Guidelines:**
- Use emoji for visual distinction
- Include story ID for traceability
- Value matches the case handler name
- Position logically (grouped by epic or functionality)

#### 3. Integrate into Main Menu

**File:** `src/index.js`

**Add import at top:**
```javascript
import { runYourFeatureDemo } from './features/your-feature.js';
```

**Add case handler in switch statement:**
```javascript
async function main() {
  // ... credential setup ...

  let running = true;
  while (running) {
    const action = await mainMenu();

    switch (action) {
      case 'multi-field':
        clear();
        await runMultiFieldCreator(config);
        clear();
        break;

      case 'your-feature':  // Add this case
        clear();
        await runYourFeatureDemo(config);
        clear();
        break;

      // ... existing cases ...
    }
  }
}
```

**Pattern:** Always `clear()` → `await runDemo(config)` → `clear()` for clean UX.

### Demo Types

#### Type 1: Field Converter Demo (Most Common)

**Example:** Priority, Option, User, Date fields  
**Approach:** Add field to Multi-Field Creator (see below)  
**File:** `src/features/multi-field-creator.js`

**Add to AVAILABLE_FIELDS:**
```javascript
const AVAILABLE_FIELDS = [
  // ... existing fields ...
  { name: '🎯 Your Field Name', value: 'customfield_10042', type: 'option', required: false },
];
```

#### Type 2: Infrastructure/API Demo (Rare)

**Example:** Input Parser (E4-S01), Hierarchy Discovery  
**Approach:** Create standalone feature file  
**Focus:** Show API usage and output format, not full workflows  
**Scope:** Demo should match story scope (parser demo shows parsing only, not issue creation)

#### Type 3: Workflow Demo (Complex)

**Example:** Bulk import, Multi-level hierarchy creation  
**Approach:** Create standalone feature file with multi-step flows  
**Focus:** Realistic end-to-end scenarios users will implement

### Best Practices

✅ **DO:**
- Show example data/code before running operations
- Use spinners (`ora`) for async operations
- Display results in formatted boxes (`boxen`)
- Handle errors gracefully with clear messages
- Scope demo to story boundaries (parser demo ≠ bulk creation demo)
- Test with real JIRA credentials before committing

❌ **DON'T:**
- Create standalone TypeScript files (use JavaScript)
- Import from `src/` or `../lib/` (use `'jira-magic-library'`)
- Skip error handling
- Create issues without user confirmation
- Mix multiple story scopes in one demo

## 🤝 Contributing

This demo validates the public API works as expected. When adding new library features, please add corresponding demos!

---

**Enjoy exploring JIRA Magic Library!** 🚀

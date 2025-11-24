/**
 * Example: Create a Bug Issue
 * 
 * Demonstrates creating a simple bug report in JIRA with
 * the minimum required fields.
 * 
 * Prerequisites:
 * - .env file configured (see ../README.md)
 * - JIRA_PROJECT_KEY set to a valid project
 * - Project has "Bug" issue type
 * 
 * Run: npm run example:create-bug
 */

import { JML } from '../src';
import { getConfig } from './config';

async function main() {
  console.log('📝 Example: Create a Bug Issue\n');

  // Initialize library
  const config = getConfig();
  const jml = new JML(config);

  console.log('🔗 Connected to:', config.baseUrl);

  try {
    // Create a bug with minimal fields
    console.log('\n🐛 Creating bug...');
    const result = await jml.issues.create({
      Project: process.env.JIRA_PROJECT_KEY!,
      'Issue Type': 'Bug',
      Summary: 'Example: Login button not working on Safari',
      Description: 'When users click the login button on Safari 16+, nothing happens. ' +
                   'This works fine on Chrome and Firefox.\n\n' +
                   'Steps to reproduce:\n' +
                   '1. Open Safari browser\n' +
                   '2. Navigate to login page\n' +
                   '3. Enter credentials\n' +
                   '4. Click login button\n\n' +
                   'Expected: User is logged in\n' +
                   'Actual: Nothing happens',
    });

    console.log('\n✅ Bug created successfully!');
    console.log(`   Key: ${result.key}`);
    console.log(`   ID: ${result.id}`);
    console.log(`   URL: ${process.env.JIRA_BASE_URL}/browse/${result.key}`);

  } catch (error: any) {
    console.error('\n❌ Error creating bug:', error.message);
    if (error.context) {
      console.error('   Context:', JSON.stringify(error.context, null, 2));
    }
    process.exit(1);
  }
}

main();

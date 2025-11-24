/**
 * Example: Error Handling
 * 
 * Demonstrates how to handle different error types when creating issues.
 * 
 * Prerequisites:
 * - .env file configured (see ../README.md)
 * 
 * Run: npm run example:error-handling
 */

import { JML, ValidationError, JIRAApiError, ConnectionError } from '../src';
import { getConfig } from './config';

async function main() {
  console.log('📝 Example: Error Handling\n');

  const config = getConfig();
  const jml = new JML(config);

  // Example 1: Invalid project
  console.log('1️⃣  Testing invalid project...');
  try {
    await jml.issues.create({
      Project: 'NONEXISTENT',
      'Issue Type': 'Bug',
      Summary: 'This should fail',
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      console.log('   ✅ Caught ValidationError:', error.message);
    } else if (error instanceof JIRAApiError) {
      console.log('   ✅ Caught JIRAApiError:', error.message);
    } else {
      console.log('   ❌ Unexpected error:', error);
    }
  }

  // Example 2: Missing required field
  console.log('\n2️⃣  Testing missing required field...');
  try {
    await jml.issues.create({
      Project: config.redis?.host || 'PROJ', // Wrong field used as example
      'Issue Type': 'Bug',
      // Missing Summary (required)
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      console.log('   ✅ Caught ValidationError:', error.message);
      if (error.details) {
        console.log('   📋 Details:', error.details);
      }
    } else {
      console.log('   ❌ Unexpected error:', error);
    }
  }

  // Example 3: Connection test
  console.log('\n3️⃣  Testing JIRA connection...');
  try {
    const serverInfo = await jml.validateConnection();
    console.log('   ✅ Connected to JIRA successfully');
    console.log(`   📊 Version: ${serverInfo.version}`);
    console.log(`   🏢 Type: ${serverInfo.deploymentType}`);
  } catch (error: any) {
    if (error instanceof ConnectionError) {
      console.log('   ❌ Connection failed:', error.message);
    } else {
      console.log('   ❌ Unexpected error:', error);
    }
  }

  console.log('\n✅ Error handling examples complete!');
  console.log('💡 Tip: Always catch and handle specific error types for better UX');

  await jml.disconnect();
}

main().catch(console.error);

/**
 * Example: Connection Validation
 * 
 * Demonstrates how to validate connection to JIRA before making requests.
 * 
 * Prerequisites:
 * - .env file configured (see ../README.md)
 * 
 * Run: npm run example:validate-connection
 */

import { JML } from '../src';
import { getConfig } from './config';

async function main() {
  console.log('📝 Example: Connection Validation\n');

  const config = getConfig();
  console.log('🔗 Connecting to:', config.baseUrl);

  const jml = new JML(config);

  try {
    // Validate connection before doing anything else
    console.log('\n🔍 Validating connection...');
    const serverInfo = await jml.validateConnection();

    console.log('\n✅ Successfully connected to JIRA!');
    console.log(`   Version: ${serverInfo.version}`);
    console.log(`   Deployment Type: ${serverInfo.deploymentType}`);
    console.log(`   Server Title: ${serverInfo.serverTitle}`);
    console.log(`   Build Number: ${serverInfo.buildNumber}`);

    console.log('\n💡 Tip: Always validate connection before making requests');
    console.log('   This helps catch auth/network issues early!');

  } catch (error: any) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('   Check your JIRA_BASE_URL and JIRA_PAT in .env');
    process.exit(1);
  } finally {
    await jml.disconnect();
  }
}

main().catch(console.error);

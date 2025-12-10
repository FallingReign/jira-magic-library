/**
 * Debug script to test HELP project issue creation
 * Run with: node debug-help-issue.js
 */

import { JML } from './dist/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🔧 Initializing JML...\n');
  
  const jml = new JML({
    baseUrl: process.env.JIRA_BASE_URL,
    auth: { token: process.env.JIRA_TOKEN },
    apiVersion: 'v2',
    // Comment out Redis to test without cache
    // redis: {
    //   host: process.env.REDIS_HOST || 'localhost',
    //   port: parseInt(process.env.REDIS_PORT || '6379'),
    // }
  });

  console.log('📝 Testing exact Slack payload...\n');

  const yamlContent = `Project: "HELP"
Issue Type: "Help Request"
Summary: "{{{slack.user_mention_id(user_id={{inputs.Ft0A15DKHWUS__user_id}})}}} needs assistance!"
Description: "{{{{steps.82d10424-948a-4b3d-9a15-9b561899ef14.fields.da37bb08-5c3b-4582-ba3e-cfed080799f7}}}}"
Assignee: +Help_OnCall
Reporter: "{{{slack.user_email(user_id={{inputs.Ft0A15DKHWUS__user_id}})}}}"
Priority: "{{{{steps.82d10424-948a-4b3d-9a15-9b561899ef14.fields.5e255e86-4658-4dc6-8763-c096f7ea54b1}}}}"
customfield_10395: "Raven"
customfield_12300: "C030SKZCJ15"`;

  console.log('Input YAML:');
  console.log(yamlContent);
  console.log('\n---\n');

  try {
    console.log('🚀 Attempting to create issue...\n');
    
    const result = await jml.issues.create({
      data: yamlContent,
      format: 'yaml'
    });

    console.log('✅ SUCCESS!');
    console.log('Created issue:', result);
  } catch (error) {
    console.log('❌ FAILED!');
    console.log('Error:', error.message);
    
    // Show hex codes for Project field
    if (error.message.includes('Project')) {
      console.log('\n🔍 Debugging Project field:');
      const lines = yamlContent.split('\n');
      const projectLine = lines.find(l => l.startsWith('Project:'));
      if (projectLine) {
        const projectValue = projectLine.replace('Project:', '').trim().replace(/^"|"$/g, '');
        console.log('  Project value:', JSON.stringify(projectValue));
        console.log('  Hex codes:', [...projectValue].map(c => c.charCodeAt(0).toString(16)).join(' '));
      }
    }
    
    console.log('\nFull error details:');
    console.log(error);
  }
}

main().catch(console.error);

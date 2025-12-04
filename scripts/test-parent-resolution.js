#!/usr/bin/env node
/**
 * Test Script: Parent Resolution Endpoints
 * 
 * Tests alternative endpoints for resolving parent issues by summary:
 * 1. GreenHopper epics endpoint (for Epic Link field)
 * 2. JPO parent suggest endpoint (for Parent Link field)
 * 
 * Usage:
 *   node scripts/test-parent-resolution.js <projectKey> <searchQuery> [issueTypeName]
 * 
 * Examples:
 *   node scripts/test-parent-resolution.js ZUL "my epic"
 *   node scripts/test-parent-resolution.js ZUL "my super epic" SuperEpic
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// Configuration
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_PAT = process.env.JIRA_PAT;

if (!JIRA_BASE_URL || !JIRA_PAT) {
  console.error('❌ Missing JIRA_BASE_URL or JIRA_PAT in .env file');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node scripts/test-parent-resolution.js <projectKey> <searchQuery> [issueTypeName]');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/test-parent-resolution.js ZUL "my epic"');
  console.log('  node scripts/test-parent-resolution.js ZUL "super epic" SuperEpic');
  process.exit(1);
}

const projectKey = args[0];
const searchQuery = args[1];
const issueTypeName = args[2] || 'Story'; // Default to Story for JPO suggest

console.log('\n🔍 Parent Resolution Test');
console.log('═'.repeat(60));
console.log(`Project: ${projectKey}`);
console.log(`Search Query: "${searchQuery}"`);
console.log(`Issue Type (for JPO): ${issueTypeName}`);
console.log(`JIRA URL: ${JIRA_BASE_URL}`);
console.log('═'.repeat(60));

/**
 * Make authenticated request to JIRA
 */
async function jiraRequest(method, path, body = null) {
  const url = `${JIRA_BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${JIRA_PAT}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    data: response.ok ? await response.json() : await response.text(),
  };
}

/**
 * Test 1: GreenHopper Epics Endpoint
 * For fields with plugin: com.pyxis.greenhopper.jira:gh-epic-link
 */
async function testGreenHopperEpics() {
  console.log('\n\n📗 Test 1: GreenHopper Epics Endpoint');
  console.log('─'.repeat(60));
  console.log('Endpoint: GET /rest/greenhopper/1.0/epics');
  console.log('Use case: Resolving Epic Link field values\n');
  
  const path = `/rest/greenhopper/1.0/epics?searchQuery=${encodeURIComponent(searchQuery)}&projectKey=${projectKey}&maxResults=10&hideDone=false`;
  
  console.log(`Request: GET ${path}\n`);
  
  try {
    const result = await jiraRequest('GET', path);
    
    if (result.ok) {
      console.log(`✅ Status: ${result.status} ${result.statusText}`);
      console.log('\nResponse:');
      console.log(JSON.stringify(result.data, null, 2));
      
      // Parse epic results
      if (result.data.epicNames && result.data.epicNames.length > 0) {
        console.log('\n📋 Parsed Epics:');
        result.data.epicNames.forEach((epic, i) => {
          console.log(`  ${i + 1}. ${epic.key} - "${epic.name}"`);
        });
      } else if (result.data.length === 0 || (result.data.epicNames && result.data.epicNames.length === 0)) {
        console.log('\n⚠️  No epics found matching query');
      }
    } else {
      console.log(`❌ Status: ${result.status} ${result.statusText}`);
      console.log('Response:', result.data);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

/**
 * Test 2: JPO Parent Suggest Endpoint
 * For fields with plugin: com.atlassian.jpo:jpo-custom-field-parent
 */
async function testJPOParentSuggest() {
  console.log('\n\n📘 Test 2: JPO Parent Suggest Endpoint');
  console.log('─'.repeat(60));
  console.log('Endpoint: POST /rest/jpo/1.0/parent/suggest');
  console.log('Use case: Resolving Parent Link field values (JPO hierarchy)\n');
  
  const path = '/rest/jpo/1.0/parent/suggest';
  const body = {
    query: searchQuery,
    issueTypeName: issueTypeName,
    maxResults: 10,
  };
  
  console.log(`Request: POST ${path}`);
  console.log(`Body: ${JSON.stringify(body)}\n`);
  
  try {
    const result = await jiraRequest('POST', path, body);
    
    if (result.ok) {
      console.log(`✅ Status: ${result.status} ${result.statusText}`);
      console.log('\nResponse:');
      console.log(JSON.stringify(result.data, null, 2));
      
      // Parse parent results - JPO returns { issues: [...], projects: [...] }
      if (result.data.issues && result.data.issues.length > 0) {
        // Build project ID -> key map
        const projectMap = new Map();
        if (result.data.projects) {
          result.data.projects.forEach(p => projectMap.set(p.id, p.key));
        }
        
        // Build issue type ID -> name map (if available)
        const typeMap = new Map();
        if (result.data.issueTypes) {
          result.data.issueTypes.forEach(t => typeMap.set(t.id, t.name || t.id));
        }
        
        console.log('\n📋 Parsed Parents:');
        result.data.issues.forEach((parent, i) => {
          const projectKey = projectMap.get(parent.projectId) || '???';
          const issueKey = `${projectKey}-${parent.issueKey}`;
          const typeName = typeMap.get(String(parent.issueTypeId)) || `type:${parent.issueTypeId}`;
          console.log(`  ${i + 1}. ${issueKey} - "${parent.issueSummary}" (${typeName})`);
        });
      } else if (Array.isArray(result.data) && result.data.length > 0) {
        // Alternative array format
        console.log('\n📋 Parsed Parents:');
        result.data.forEach((parent, i) => {
          console.log(`  ${i + 1}. ${parent.key || parent.issueKey} - "${parent.summary || parent.issueSummary}"`);
        });
      } else {
        console.log('\n⚠️  No parents found matching query');
      }
    } else {
      console.log(`❌ Status: ${result.status} ${result.statusText}`);
      console.log('Response:', result.data);
      
      if (result.status === 404) {
        console.log('\n💡 Note: 404 typically means JPO (Advanced Roadmaps) is not installed');
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

/**
 * Test 3: Standard JQL Search (current approach)
 * Fallback that works everywhere
 */
async function testJQLSearch() {
  console.log('\n\n📙 Test 3: Standard JQL Search (current fallback)');
  console.log('─'.repeat(60));
  console.log('Endpoint: POST /rest/api/2/search');
  console.log('Use case: Universal fallback, searches all issue types\n');
  
  const path = '/rest/api/2/search';
  const jql = `project = ${projectKey} AND summary ~ "${searchQuery}"`;
  const body = {
    jql,
    fields: ['summary', 'issuetype', 'key'],
    maxResults: 10,
  };
  
  console.log(`Request: POST ${path}`);
  console.log(`JQL: ${jql}\n`);
  
  try {
    const result = await jiraRequest('POST', path, body);
    
    if (result.ok) {
      console.log(`✅ Status: ${result.status} ${result.statusText}`);
      console.log(`Total matches: ${result.data.total}`);
      
      if (result.data.issues && result.data.issues.length > 0) {
        console.log('\n📋 Parsed Results:');
        result.data.issues.forEach((issue, i) => {
          console.log(`  ${i + 1}. ${issue.key} - "${issue.fields.summary}" (${issue.fields.issuetype.name})`);
        });
      } else {
        console.log('\n⚠️  No issues found matching query');
      }
    } else {
      console.log(`❌ Status: ${result.status} ${result.statusText}`);
      console.log('Response:', result.data);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

/**
 * Test 4: Check which parent field plugin is used for the issue type
 */
async function testParentFieldDiscovery() {
  console.log('\n\n🔧 Test 4: Parent Field Discovery');
  console.log('─'.repeat(60));
  console.log('Checking which parent field plugin is used for this project/issue type\n');
  
  // First get issue types for the project
  const projectPath = `/rest/api/2/project/${projectKey}`;
  
  try {
    const projectResult = await jiraRequest('GET', projectPath);
    
    if (!projectResult.ok) {
      console.log(`❌ Failed to get project: ${projectResult.status}`);
      return;
    }
    
    console.log(`Project: ${projectResult.data.name} (${projectResult.data.key})\n`);
    
    const parentPlugins = [
      'com.pyxis.greenhopper.jira:gh-epic-link',
      'com.atlassian.jpo:jpo-custom-field-parent',
    ];
    
    console.log('Parent fields found per issue type:');
    console.log('─'.repeat(50));
    
    // Check each issue type using the new createmeta endpoint
    for (const issueType of projectResult.data.issueTypes || []) {
      const fieldsPath = `/rest/api/2/issue/createmeta/${projectKey}/issuetypes/${issueType.id}`;
      const fieldsResult = await jiraRequest('GET', fieldsPath);
      
      if (!fieldsResult.ok) {
        console.log(`\n${issueType.name}: ❌ (${fieldsResult.status})`);
        continue;
      }
      
      const parentFields = [];
      
      for (const field of fieldsResult.data.values || []) {
        if (field.schema?.custom && parentPlugins.includes(field.schema.custom)) {
          parentFields.push({
            key: field.fieldId,
            name: field.name,
            plugin: field.schema.custom,
          });
        }
        // Also check for standard parent field
        if (field.fieldId === 'parent') {
          parentFields.push({
            key: 'parent',
            name: 'Parent',
            plugin: '(standard)',
          });
        }
      }
      
      if (parentFields.length > 0) {
        console.log(`\n${issueType.name}:`);
        parentFields.forEach(pf => {
          const pluginShort = pf.plugin.includes('greenhopper') ? 'GreenHopper (Epic Link)' :
                             pf.plugin.includes('jpo') ? 'JPO (Parent Link)' :
                             pf.plugin;
          console.log(`  • ${pf.name} (${pf.key}) → ${pluginShort}`);
        });
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Run all tests
async function main() {
  try {
    await testParentFieldDiscovery();
    await testGreenHopperEpics();
    await testJPOParentSuggest();
    await testJQLSearch();
    
    console.log('\n\n' + '═'.repeat(60));
    console.log('📊 Summary');
    console.log('═'.repeat(60));
    console.log(`
Based on the results above, here's the recommended resolution strategy:

1. If issue type uses "Epic Link" (gh-epic-link):
   → Use GreenHopper /rest/greenhopper/1.0/epics endpoint
   
2. If issue type uses "Parent Link" (jpo-custom-field-parent):
   → Use JPO /rest/jpo/1.0/parent/suggest endpoint
   
3. Fallback (standard parent or unknown):
   → Use JQL search (current approach, but without type filtering)

This eliminates the need for JPO hierarchy for validation - each endpoint
returns only valid parents for the context automatically!
`);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

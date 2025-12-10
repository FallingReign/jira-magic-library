/**
 * Debug test for HELP project issue
 */

import { parseInput } from '../src/parsers/InputParser.js';
import { resolveUniqueName } from '../src/utils/resolveUniqueName.js';

describe('Debug HELP project matching', () => {
  it('should parse the exact Slack payload', async () => {
    const yamlContent = `Project: "HELP"
Issue Type: "Help Request"
Summary: "{{{slack.user_mention_id(user_id={{inputs.Ft0A15DKHWUS__user_id}})}}} needs assistance!"
Description: "{{{{steps.82d10424-948a-4b3d-9a15-9b561899ef14.fields.da37bb08-5c3b-4582-ba3e-cfed080799f7}}}}"
Assignee: +Help_OnCall
Reporter: {{{slack.user_email(user_id={{inputs.Ft0A15DKHWUS__user_id}})}}}
Priority: {{{{steps.82d10424-948a-4b3d-9a15-9b561899ef14.fields.5e255e86-4658-4dc6-8763-c096f7ea54b1}}}}
customfield_10395: "Raven"
customfield_12300: "C030SKZCJ15"`;

    const result = await parseInput({ data: yamlContent, format: 'yaml' });
    
    console.log('Parsed result:', JSON.stringify(result, null, 2));
    console.log('Project value:', result.data[0].Project);
    console.log('Project hex codes:', [...(result.data[0].Project as string)].map(c => c.charCodeAt(0).toString(16)));
    
    expect(result.data).toHaveLength(1);
    expect(result.data[0].Project).toBe('HELP');
  });

  it('should test resolveUniqueName with HELP directly', () => {
    const projects = [
      { id: 'HELP', name: 'Help Desk' },
      { id: 'PROJ', name: 'Project Alpha' },
    ];

    const result = resolveUniqueName('HELP', projects, {
      field: 'project',
      fieldName: 'Project',
    });

    expect(result.id).toBe('HELP');
  });

  it('should show hex codes for comparison', () => {
    const userInput = 'HELP';
    const jiraValue = 'HELP';
    
    console.log('User input hex:', [...userInput].map(c => c.charCodeAt(0).toString(16)));
    console.log('JIRA value hex:', [...jiraValue].map(c => c.charCodeAt(0).toString(16)));
    console.log('Are they equal?', userInput === jiraValue);
  });
});

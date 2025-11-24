import { JML } from '../../src.js';
import { loadConfig } from '../../src/config/loader.js';

describe('Integration: E3-S02b Virtual Time Tracking Fields', () => {
  let jml: JML;

  beforeAll(() => {
    if (!process.env.JIRA_BASE_URL) {
      console.warn('⚠️  Skipping integration tests (JIRA not configured)');
      return;
    }
    const config = loadConfig();
    jml = new JML(config);
  });

  afterEach(async () => {
    // Small delay between tests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it('AC8.1: should create issue with "Original Estimate" as top-level field', async () => {
    if (!jml) return;

    const issue = await jml.issues.create({
      project: process.env.JIRA_PROJECT_KEY!,
      issueType: 'Task',
      summary: `E3-S02b Test: Original Estimate (${new Date().toISOString()})`,
      'Original Estimate': '3d',
    });

    expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    console.log(`✅ Created issue ${issue.key} with Original Estimate`);
  });

  it('AC8.2: should create issue with "Remaining Estimate" as top-level field', async () => {
    if (!jml) return;

    const issue = await jml.issues.create({
      project: process.env.JIRA_PROJECT_KEY!,
      issueType: 'Task',
      summary: `E3-S02b Test: Remaining Estimate (${new Date().toISOString()})`,
      'Remaining Estimate': '1d',
    });

    expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    console.log(`✅ Created issue ${issue.key} with Remaining Estimate`);
  });

  it('AC8.3: should create issue with both top-level fields', async () => {
    if (!jml) return;

    const issue = await jml.issues.create({
      project: process.env.JIRA_PROJECT_KEY!,
      issueType: 'Task',
      summary: `E3-S02b Test: Both Estimates (${new Date().toISOString()})`,
      'Original Estimate': '5d',
      'Remaining Estimate': '2d',
    });

    expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    console.log(`✅ Created issue ${issue.key} with both estimates`);
  });

  it('AC8.4: should create issue with case-insensitive field names', async () => {
    if (!jml) return;

    const issue = await jml.issues.create({
      project: process.env.JIRA_PROJECT_KEY!,
      issueType: 'Task',
      summary: `E3-S02b Test: Case Variations (${new Date().toISOString()})`,
      'original estimate': '2h',
      'REMAINING_ESTIMATE': '30m',
    });

    expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    console.log(`✅ Created issue ${issue.key} with case-insensitive field names`);
  });

  it('AC8.5: backward compatibility - object format still works', async () => {
    if (!jml) return;

    const issue = await jml.issues.create({
      project: process.env.JIRA_PROJECT_KEY!,
      issueType: 'Task',
      summary: `E3-S02b Test: Object Format (${new Date().toISOString()})`,
      'Time Tracking': {
        originalEstimate: '4d',
        remainingEstimate: '1d',
      },
    });

    expect(issue.key).toMatch(/^[A-Z]+-\d+$/);
    console.log(`✅ Created issue ${issue.key} with object format (backward compatible)`);
  });
});

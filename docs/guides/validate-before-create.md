# Validate Before Create

Use schema-only validation (no API lookups during create) to fail fast in your UI or pipeline.

## Setup
```ts
import 'dotenv/config';
import { JML } from 'jira-magic-library';

const jml = new JML({
  baseUrl: process.env.JIRA_BASE_URL!,
  auth: { token: process.env.JIRA_TOKEN! },
  redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
});
```

## Validate an array
```ts
const result = await jml.validate({
  data: [
    { Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Prepare sprint board' },
    { Project: 'PROJ', 'Issue Type': 'Bug', Summary: '' }, // missing summary
  ],
});

if (!result.valid) {
  console.table(result.errors);
  // surface errors to the user and stop here
}
```

## Validate a file (auto-detected)
```ts
const result = await jml.validate({ from: './issues.csv' });
```

## Interpreting errors
- `INVALID_PROJECT` / `INVALID_ISSUE_TYPE`: The project/issue type doesn’t exist in your instance.
- `REQUIRED_FIELD_MISSING`: Schema required field is null/empty/missing.
- `INVALID_TYPE`: Value doesn’t match the schema type (string/number/array/user/project).
- `INVALID_ENUM_VALUE`: Value not in allowed options.
- `warnings`: Non-blocking issues (e.g., unknown fields), safe to ignore or warn the user.

## When to proceed to create()
Only call `jml.issues.create()` if `result.valid === true`. This avoids API calls for bad payloads and gives users actionable feedback upfront.

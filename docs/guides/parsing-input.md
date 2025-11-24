# Parsing CSV / JSON / YAML

JML’s `parseInput` handles multi-format ingestion and normalizes values (arrays, numbers, empty cells) before validation or create.

## Examples

### CSV
```ts
import { parseInput } from 'jira-magic-library';

const parsed = await parseInput({ from: './issues.csv' });
console.log(parsed.format); // "csv"
console.log(parsed.data.length);
```

### JSON
```ts
const parsed = await parseInput({
  data: [
    { Project: 'ZUL', 'Issue Type': 'Task', Summary: 'First' },
    { Project: 'ZUL', 'Issue Type': 'Bug', Summary: 'Second' },
  ],
  format: 'json',
});
```

### YAML
```ts
const parsed = await parseInput({ from: './issues.yaml' }); // format auto-detected
```

## Blank cell handling
- CSV unquoted blank cell → `null`
- CSV quoted blank `""` → empty string `''`
- YAML blank value → `null`; `""` stays `''`
- JSON follows the input exactly

## Pipe into validate/create
```ts
const parsed = await parseInput({ from: './issues.csv' });
const validation = await jml.validate(parsed);
if (validation.valid) {
  await jml.issues.create(parsed);
}
```

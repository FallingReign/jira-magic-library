const { preprocessQuotes } = require('./dist/parsers/quote-preprocessor.js');
const { testCases } = require('./tmp/quote-preprocessor/dist/test-cases.js');

let passed = 0;
let failed = 0;
const failures = [];

for (const tc of testCases) {
  try {
    const output = preprocessQuotes(tc.input, tc.format);
    const modified = output !== tc.input;
    
    if (output !== tc.expectedOutput) {
      failed++;
      failures.push({ id: tc.id, description: tc.description, expected: tc.expectedOutput, got: output });
    } else if (modified !== tc.shouldModify) {
      failed++;
      failures.push({ id: tc.id, description: tc.description, issue: 'shouldModify mismatch', expected: tc.shouldModify, got: modified });
    } else {
      passed++;
    }
  } catch (e) {
    failed++;
    failures.push({ id: tc.id, description: tc.description, error: e.message });
  }
}

console.log(`Test Results: ${passed}/${passed + failed} passed (${((passed / (passed + failed)) * 100).toFixed(1)}%)`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.slice(0, 15).forEach(f => {
    console.log(`  - ${f.id}: ${f.description}`);
    if (f.error) console.log(`    Error: ${f.error}`);
    if (f.issue) console.log(`    Issue: ${f.issue} (expected: ${f.expected}, got: ${f.got})`);
    if (f.expected && f.got && !f.issue) {
      console.log(`    Expected: ${JSON.stringify(f.expected).substring(0, 100)}...`);
      console.log(`    Got:      ${JSON.stringify(f.got).substring(0, 100)}...`);
    }
  });
  if (failures.length > 15) console.log(`  ... and ${failures.length - 15} more`);
}

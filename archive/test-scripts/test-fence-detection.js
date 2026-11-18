#!/usr/bin/env node
// Test fence detection

const TrustScanner = require('./scanner.js');

const testCases = [
  {
    name: "Standard markdown fence",
    text: `Here is my code:
\`\`\`javascript
const config = {retries: 3, timeout: 5000, debug: true};
\`\`\`
Done.`
  },
  {
    name: "Fence without language",
    text: `Here is my code:
\`\`\`
const config = {retries: 3, timeout: 5000, debug: true};
\`\`\`
Done.`
  },
  {
    name: "Inline fence (code on same line)",
    text: `Here is: \`\`\`const config = {retries: 3, timeout: 5000, debug: true};\`\`\` Done.`
  }
];

console.log('Testing fence detection...\n');

testCases.forEach((testCase, idx) => {
  console.log(`[Test ${idx + 1}] ${testCase.name}`);
  console.log('Input:', testCase.text.substring(0, 80) + '...');
  
  TrustScanner.scan(testCase.text).then(result => {
    const sourceCodeFindings = result.findings.filter(f => f.patternId === 'source_code');
    console.log('Result: source_code findings =', sourceCodeFindings.length);
    if (sourceCodeFindings.length > 0) {
      console.log('  ✓ DETECTED');
      sourceCodeFindings.forEach(f => {
        console.log(`    Code: ${f.rawMatch.substring(0, 50)}`);
      });
    } else {
      console.log('  ✗ NOT DETECTED');
    }
    console.log('');
  }).catch(err => {
    console.error('Error:', err.message);
  });
});

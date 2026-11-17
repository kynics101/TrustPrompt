#!/usr/bin/env node
// Test the regex fix directly

const testCases = [
  {
    name: "Standard markdown fence (newlines)",
    text: `Here is my code:
\`\`\`javascript
const config = {retries: 3, timeout: 5000, debug: true};
\`\`\`
Done.`
  },
  {
    name: "Fence without language",
    text: `\`\`\`
const config = {retries: 3, timeout: 5000, debug: true};
\`\`\``
  },
  {
    name: "Inline fence (code on same line)",
    text: `Here is: \`\`\`const config = {retries: 3, timeout: 5000, debug: true};\`\`\` Done.`
  }
];

// OLD regex (broken)
const oldRegex = /```([\w]*)(.*?)```/;

// NEW regex (fixed)
const newRegex = /```([\w]*)([\s\S]*?)```/;

console.log('Testing regex patterns...\n');

testCases.forEach((testCase, idx) => {
  console.log(`[Test ${idx + 1}] ${testCase.name}`);
  
  const oldMatch = testCase.text.match(oldRegex);
  const newMatch = testCase.text.match(newRegex);
  
  console.log(`  OLD regex: ${oldMatch ? '✓ MATCH' : '✗ NO MATCH'}`);
  if (oldMatch) {
    console.log(`    Language: "${oldMatch[1]}"`);
    console.log(`    Code: "${oldMatch[2].substring(0, 30)}..."`);
  }
  
  console.log(`  NEW regex: ${newMatch ? '✓ MATCH' : '✗ NO MATCH'}`);
  if (newMatch) {
    console.log(`    Language: "${newMatch[1]}"`);
    console.log(`    Code: "${newMatch[2].substring(0, 50)}..."`);
  }
  console.log('');
});

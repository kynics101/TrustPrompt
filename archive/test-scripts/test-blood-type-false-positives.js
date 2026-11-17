// Test to verify blood_type_mention doesn't match stray letters

const patterns = require('./patterns.js');
const PATTERNS = patterns.TRUSTPROMPT_PATTERNS;

const testCases = [
  {
    text: "My credit card number is 4111 1111 1111 1111, and my API key is sk-test-1234567890abcdef",
    shouldMatch: false,
    description: "Credit card and API key - should NOT match"
  },
  {
    text: "Blood type A positive",
    shouldMatch: true,
    description: "Explicit blood type mention - SHOULD match"
  },
  {
    text: "My blood type is O negative",
    shouldMatch: true,
    description: "Personal blood type disclosure - SHOULD match"
  },
  {
    text: "TYPE O RICE from Asia",
    shouldMatch: true,
    description: "TYPE O alone - will match but contextFilter should suppress it"
  },
  {
    text: "A and B are letters",
    shouldMatch: false,
    description: "Stray letters A and B - should NOT match"
  },
  {
    text: "Type A+ positive",
    shouldMatch: true,
    description: "Type A+ notation - SHOULD match"
  },
  {
    text: "I am O negative donor",
    shouldMatch: true,
    description: "O negative as blood type - SHOULD match"
  },
  {
    text: "The letter O is round",
    shouldMatch: false,
    description: "Letter O without blood type context - should NOT match"
  }
];

const pattern = PATTERNS.find(p => p.id === 'blood_type_mention');
if (!pattern) {
  console.error("blood_type_mention pattern not found");
  process.exit(1);
}

console.log("Testing blood_type_mention regex without contextFilter");
console.log("=" .repeat(70));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  pattern.regex.lastIndex = 0;
  const match = pattern.regex.exec(testCase.text);
  
  const didMatch = match !== null;
  const success = didMatch === testCase.shouldMatch;
  
  const status = success ? "✓ PASS" : "✗ FAIL";
  const action = didMatch ? `matched "${match[0]}"` : "no match";
  
  console.log(`${status}: ${testCase.description}`);
  console.log(`  Text: "${testCase.text}"`);
  console.log(`  Expected: ${testCase.shouldMatch ? "MATCH" : "NO MATCH"}, Got: ${action}`);
  
  if (success) {
    passed++;
  } else {
    failed++;
  }
  console.log();
}

console.log("=" .repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);

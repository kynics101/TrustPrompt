// Direct test of pattern fixes without scanner complexity
// Tests that shipping context is properly suppressed

// Load patterns
let patterns;
try {
  patterns = require('./patterns.js');
} catch (e) {
  console.error("Failed to load patterns:", e.message);
  process.exit(1);
}

const PATTERNS = patterns.TRUSTPROMPT_PATTERNS;

// Test cases
const testCases = [
  {
    name: "Shipping Note - TYPE O RICE (blood type in product context)",
    text: "ORDER shipped on 03-14-1998 to warehouse. Parcel has 5 KG of TYPE O RICE plus loan form",
    testPatterns: ['blood_type_mention'],
    shouldSuppress: true,
    expectedMatch: "TYPE O"
  },
  {
    name: "Order Date - 03-14-1998 (date in shipping context)",
    text: "ORDER shipped on 03-14-1998 to warehouse. Parcel has 5 KG of TYPE O RICE",
    testPatterns: ['birthday_date'],
    shouldSuppress: true,
    expectedMatch: "03-14-1998"
  },
  {
    name: "Parcel Weight - 5 KG (weight in shipping context)",
    text: "ORDER shipped to warehouse. Parcel has 5 KG of rice",
    testPatterns: ['weight_mention'],
    shouldSuppress: true,
    expectedMatch: "5 KG"
  },
  {
    name: "Personal Blood Type - Medical record",
    text: "Patient blood type O positive confirmed in medical screening",
    testPatterns: ['blood_type_mention'],
    shouldSuppress: false,
    expectedMatch: "O positive"
  },
  {
    name: "Personal Birth Date - Direct disclosure",
    text: "I was born on 03-14-1998 and I'm 26 years old",
    testPatterns: ['birthday_date'],
    shouldSuppress: false,
    expectedMatch: "03-14-1998"
  }
];

function testPattern(patternId, text, expectedMatch) {
  const pattern = PATTERNS.find(p => p.id === patternId);
  if (!pattern) {
    console.log(`  ✗ Pattern ${patternId} not found`);
    return null;
  }
  
  if (!pattern.regex) {
    console.log(`  ✗ Pattern ${patternId} has no regex`);
    return null;
  }
  
  // Reset regex
  pattern.regex.lastIndex = 0;
  
  let match = pattern.regex.exec(text);
  if (!match) {
    console.log(`  - No regex match found`);
    return null;
  }
  
  console.log(`  ✓ Regex matched: "${match[0]}"`);
  
  // Test contextFilter if it exists
  if (pattern.contextFilter) {
    const shouldAllow = pattern.contextFilter(match[0], text, match.index);
    const action = shouldAllow ? "ALLOWED" : "SUPPRESSED";
    console.log(`  ✓ contextFilter: ${action}`);
    
    // DEBUG: Log what contextFilter did
    if (patternId === 'blood_type_mention' && text.includes('RICE')) {
      console.log(`  [DEBUG] Full text: "${text}"`);
      console.log(`  [DEBUG] Match index: ${match.index}, Match: "${match[0]}"`);
      const contextStart = Math.max(0, match.index - 150);
      const contextEnd = Math.min(text.length, match.index + match[0].length + 150);
      const contextBefore = text.substring(contextStart, match.index).toLowerCase();
      const contextAfter = text.substring(match.index + match[0].length, contextEnd).toLowerCase();
      console.log(`  [DEBUG] Context before: "${contextBefore}"`);
      console.log(`  [DEBUG] Context after: "${contextAfter}"`);
    }
    
    return { matched: true, suppressed: !shouldAllow, value: match[0] };
  }
  
  return { matched: true, suppressed: false, value: match[0] };
}

console.log("=" .repeat(80));
console.log("Testing Shipping Context Suppression");
console.log("=" .repeat(80));
console.log();

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`Test: ${testCase.name}`);
  console.log(`Input: "${testCase.text}"`);
  
  for (const patternId of testCase.testPatterns) {
    const result = testPattern(patternId, testCase.text, testCase.expectedMatch);
    
    if (!result || !result.matched) {
      console.log(`  ✗ FAIL: No match found for ${patternId}`);
      failed++;
      console.log();
      continue;
    }
    
    const pass = result.suppressed === testCase.shouldSuppress;
    if (pass) {
      console.log(`  ✓ PASS: Correctly ${testCase.shouldSuppress ? 'suppressed' : 'allowed'} "${result.value}"`);
      passed++;
    } else {
      console.log(`  ✗ FAIL: Expected ${testCase.shouldSuppress ? 'suppressed' : 'allowed'}, got ${result.suppressed ? 'suppressed' : 'allowed'}`);
      failed++;
    }
  }
  
  console.log();
}

console.log("=" .repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=" .repeat(80));

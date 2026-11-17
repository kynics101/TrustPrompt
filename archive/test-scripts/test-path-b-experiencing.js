// Test script to verify PATH B fixes for "experiencing" and "Filipino"
// This script loads the gazetteer and tests the scan function

// Mock global context
global.MEDICAL_TERMS_DATA = [
  'diabetes', 'cancer', 'heart disease', 'depression', 
  'menstruation', 'heavy bleeding', 'heavy period', 'period pain'
];

global.FINANCIAL_TERMS_DATA = [
  'salary', 'income', 'credit card', 'account number'
];

global.ORGANIZATIONS_DATA = [
  'Google', 'Microsoft', 'Apple', 'Facebook'
];

// Load gazetteer.js
const fs = require('fs');
const gazetteerCode = fs.readFileSync('./gazetteer.js', 'utf8');

// Execute gazetteer in a context
eval(gazetteerCode);

// Test cases
const testCases = [
  {
    text: "I am experiencing heavy menstruation",
    expected: true,
    category: "health",
    description: "Should detect 'menstruation' with 'experiencing' marker"
  },
  {
    text: "i am experiencing heavy menstruation",
    expected: true,
    category: "health",
    description: "Lowercase variant of above"
  },
  {
    text: "I am a Filipino",
    expected: true,
    category: "nationality",
    description: "Should detect 'Filipino' as nationality"
  },
  {
    text: "I'm Filipino",
    expected: true,
    category: "nationality",
    description: "Contraction variant"
  },
  {
    text: "What is Filipino culture?",
    expected: false,
    category: "safe",
    description: "Should NOT detect in educational context"
  },
  {
    text: "I have diabetes",
    expected: true,
    category: "health",
    description: "Original trigger should still work"
  }
];

console.log('Testing PATH B Gazetteer Fixes\n');
console.log('='.repeat(60));

let passCount = 0;
let failCount = 0;

for (const test of testCases) {
  try {
    const results = TrustGazetteer.scan(test.text);
    const hasFindings = results.length > 0;
    const passed = hasFindings === test.expected;
    
    if (passed) {
      passCount++;
      console.log(`✓ PASS: ${test.description}`);
      console.log(`  Text: "${test.text}"`);
      console.log(`  Findings: ${hasFindings ? results.length + ' found' : 'none (as expected)'}`);
    } else {
      failCount++;
      console.log(`✗ FAIL: ${test.description}`);
      console.log(`  Text: "${test.text}"`);
      console.log(`  Expected: ${test.expected ? 'findings' : 'no findings'}`);
      console.log(`  Got: ${hasFindings ? results.length + ' findings' : 'no findings'}`);
      if (hasFindings) {
        console.log(`  Details: ${JSON.stringify(results.map(r => ({
          label: r.label, 
          rawMatch: r.rawMatch,
          patternId: r.patternId
        })), null, 2)}`);
      }
    }
    console.log();
  } catch (error) {
    failCount++;
    console.log(`✗ ERROR: ${test.description}`);
    console.log(`  Error: ${error.message}`);
    console.log();
  }
}

console.log('='.repeat(60));
console.log(`Results: ${passCount} passed, ${failCount} failed`);
console.log(`Success rate: ${Math.round((passCount / (passCount + failCount)) * 100)}%`);

if (failCount === 0) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log('\n✗ Some tests failed!');
  process.exit(1);
}

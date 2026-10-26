// Test file to verify the UMID prose detection fix
// This script validates that "Use UMID CRN 0111-3044737-0 as my valid ID." is correctly classified as prose

const TrustScanner = require('./scanner.js');

// Test cases
const testCases = [
  {
    name: 'UMID Prose (SHOULD be prose - was incorrectly code)',
    text: 'Use UMID CRN 0111-3044737-0 as my valid ID.',
    expectedClassification: 'prose',
    expectedScore: 0
  },
  {
    name: 'SSS Prose (SHOULD be prose)',
    text: 'Refer to my SSS 12-3456789-0 as my employee identifier.',
    expectedClassification: 'prose',
    expectedScore: 0
  },
  {
    name: 'GSIS Prose (SHOULD be prose)',
    text: 'Know my GSIS 1234-5678901 as my government ID.',
    expectedClassification: 'prose',
    expectedScore: 0
  },
  {
    name: 'Import Statement Code (SHOULD still be code)',
    text: 'import { foo as bar } from "module";',
    expectedClassification: 'code',
    expectedScore: 3  // At minimum keyword score
  },
  {
    name: 'Type Annotation Code (SHOULD still be code)',
    text: 'const x = value as string;',
    expectedClassification: 'code',
    expectedScore: 3  // At minimum keyword score
  },
  {
    name: 'Async Await Code (SHOULD still be code)',
    text: 'async function test() { return await promise; }',
    expectedClassification: 'code',
    expectedScore: 3  // Keyword score (async)
  }
];

console.log('═══════════════════════════════════════════════════════════════');
console.log('  TESTING UMID PROSE FIX - Source Code Detection');
console.log('═══════════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`Input: "${testCase.text}"`);
  
  const scoreObj = TrustScanner.computeSourceCodeScore(testCase.text);
  
  console.log(`Result: ${scoreObj.classification} (score: ${scoreObj.score})`);
  console.log(`Expected: ${testCase.expectedClassification} (score: ${testCase.expectedScore})`);
  
  const classificationMatch = scoreObj.classification === testCase.expectedClassification;
  const scoreMatch = scoreObj.score >= testCase.expectedScore || testCase.expectedScore === 0;
  
  if (classificationMatch && scoreMatch) {
    console.log('✅ PASS\n');
    passCount++;
  } else {
    console.log('❌ FAIL');
    if (!classificationMatch) {
      console.log(`  - Classification mismatch: got "${scoreObj.classification}", expected "${testCase.expectedClassification}"`);
    }
    if (!scoreMatch) {
      console.log(`  - Score mismatch: got ${scoreObj.score}, expected at least ${testCase.expectedScore}`);
    }
    console.log();
    failCount++;
  }
  
  // Show feature details for debugging
  console.log('Feature Breakdown:');
  console.log(`  - Code Keywords: ${scoreObj.features.code_keywords} points`);
  console.log(`  - Import Statements: ${scoreObj.features.import_statements} points`);
  console.log(`  - Braces: ${scoreObj.features.braces} points`);
  console.log(`  - Function Calls: ${scoreObj.features.function_calls} points`);
  console.log(`  - Line Density: ${scoreObj.features.line_density} points`);
  console.log(`  - Strong Evidence: ${scoreObj.strong_evidence ? 'YES' : 'NO'}`);
  console.log('───────────────────────────────────────────────────────────────\n');
});

console.log('═══════════════════════════════════════════════════════════════');
console.log(`RESULTS: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`);
console.log('═══════════════════════════════════════════════════════════════');

if (failCount === 0) {
  console.log('\n✅ ALL TESTS PASSED! The UMID fix is working correctly.');
} else {
  console.log(`\n❌ ${failCount} test(s) failed. Review the output above.`);
}

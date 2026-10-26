// Test file to verify ID-in-Code detection solution
// Tests all 4 scenarios from the solution

const TrustScanner = require('./scanner.js');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ID-IN-CODE DETECTION SOLUTION - COMPREHENSIVE TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

const testCases = [
  {
    name: '1. Prose Example (B2 bypass + A1 filter)',
    text: 'Use UMID as my valid ID.',
    expectedClassification: 'prose',
    expectedScore: 0,
    expectedRiskLevel: 'none',
    shouldAlert: false,
    description: 'Pure prose discussing example ID - should NOT alert'
  },
  {
    name: '2. UMID in Variable Assignment (Path A new pattern)',
    text: 'const UMID = "0111-3044737-0";',
    expectedClassification: 'code',
    expectedScore: null, // Will have high score
    expectedRiskLevel: 'high',
    shouldAlert: true,
    expectedPatterns: ['ph_id_umid_variable_assignment'],
    description: 'Real UMID in code variable - SHOULD alert'
  },
  {
    name: '3. ID in Object Literal (Path A new pattern)',
    text: '{umid: "0111-3044737-0", name: "John"}',
    expectedClassification: 'code',
    expectedScore: null,
    expectedRiskLevel: 'high',
    shouldAlert: true,
    expectedPatterns: ['ph_id_object_literal'],
    description: 'ID in object literal - SHOULD alert'
  },
  {
    name: '4. ID Shared as Real Data (Path B gazetteer)',
    text: 'My UMID is 0111-3044737-0',
    expectedClassification: 'prose',
    expectedScore: null,
    expectedRiskLevel: 'high',
    shouldAlert: true,
    expectedPatterns: ['gazetteer_philid_code'],
    description: 'Real ID mention (not prose example) - SHOULD alert'
  },
  {
    name: 'Bonus: SSS in Variable Assignment',
    text: 'const sss = "12-3456789-0";',
    expectedClassification: 'code',
    expectedScore: null,
    expectedRiskLevel: 'high',
    shouldAlert: true,
    expectedPatterns: ['ph_id_sss_variable_assignment'],
    description: 'SSS credential in code - SHOULD alert'
  },
  {
    name: 'Bonus: GSIS in Function Call',
    text: 'sendRequest({gsis: "1234-5678901-0", data: {}})',
    expectedClassification: 'code',
    expectedScore: null,
    expectedRiskLevel: 'high',
    shouldAlert: true,
    expectedPatterns: ['ph_id_function_argument', 'ph_id_object_literal'],
    description: 'GSIS in function argument - SHOULD alert'
  },
  {
    name: 'Bonus: Normal Code (No IDs)',
    text: 'const x = 5; function add(a, b) { return a + b; }',
    expectedClassification: 'code',
    expectedScore: null,
    expectedRiskLevel: 'low',
    shouldAlert: false,
    description: 'Clean code with no credentials - should NOT alert for IDs'
  }
];

let passCount = 0;
let failCount = 0;
const results = [];

testCases.forEach((testCase, index) => {
  console.log(`\n${'─'.repeat(63)}`);
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`${'─'.repeat(63)}`);
  console.log(`Input: "${testCase.text}"`);
  console.log(`Expected: ${testCase.description}`);
  
  let result;
  try {
    result = TrustScanner.scan(testCase.text);
  } catch (e) {
    console.log(`❌ SCAN ERROR: ${e.message}`);
    failCount++;
    results.push({ test: testCase.name, status: 'ERROR', error: e.message });
    return;
  }
  
  console.log(`\nResult:`);
  console.log(`  Risk Level: ${result.riskLevel}`);
  console.log(`  Score: ${result.score}`);
  console.log(`  Findings: ${result.findings.length}`);
  
  if (result.findings.length > 0) {
    console.log(`\n  Detected Patterns:`);
    result.findings.forEach((f, idx) => {
      console.log(`    ${idx + 1}. ${f.patternId} (${f.label})`);
      console.log(`       Risk: ${f.risk}`);
      console.log(`       Match: ${f.rawMatch.substring(0, 50)}${f.rawMatch.length > 50 ? '...' : ''}`);
    });
  }
  
  // Validation
  console.log(`\n  Validation:`);
  
  let allChecks = true;
  
  // Check risk level
  if (result.riskLevel === testCase.expectedRiskLevel) {
    console.log(`  ✓ Risk level matches: ${testCase.expectedRiskLevel}`);
  } else {
    console.log(`  ✗ Risk level mismatch: expected ${testCase.expectedRiskLevel}, got ${result.riskLevel}`);
    allChecks = false;
  }
  
  // Check alert status
  const hasFindings = result.findings.length > 0;
  if (hasFindings === testCase.shouldAlert) {
    console.log(`  ✓ Alert status correct: ${testCase.shouldAlert ? 'Alerted' : 'Not alerted'}`);
  } else {
    console.log(`  ✗ Alert status wrong: expected ${testCase.shouldAlert ? 'alert' : 'no alert'}, got ${hasFindings ? 'alert' : 'no alert'}`);
    allChecks = false;
  }
  
  // Check expected patterns (if specified)
  if (testCase.expectedPatterns && testCase.expectedPatterns.length > 0) {
    const foundPatterns = result.findings.map(f => f.patternId);
    const allExpectedFound = testCase.expectedPatterns.some(p => foundPatterns.includes(p));
    
    if (allExpectedFound) {
      console.log(`  ✓ Expected pattern found: ${testCase.expectedPatterns[0]}`);
    } else {
      console.log(`  ✗ Expected pattern not found: ${testCase.expectedPatterns[0]}`);
      console.log(`     Found: ${foundPatterns.join(', ')}`);
      allChecks = false;
    }
  }
  
  if (allChecks) {
    console.log(`\n✅ PASS`);
    passCount++;
    results.push({ test: testCase.name, status: 'PASS' });
  } else {
    console.log(`\n❌ FAIL`);
    failCount++;
    results.push({ test: testCase.name, status: 'FAIL' });
  }
});

console.log(`\n${'═'.repeat(63)}`);
console.log('SUMMARY');
console.log('═'.repeat(63));
console.log(`\nTotal: ${testCases.length} tests`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

console.log(`\n${'─'.repeat(63)}`);
console.log('RESULTS MATRIX');
console.log(`${'─'.repeat(63)}`);

results.forEach(r => {
  const statusIcon = r.status === 'PASS' ? '✅' : r.status === 'ERROR' ? '⚠️' : '❌';
  console.log(`${statusIcon} ${r.test}`);
  if (r.error) {
    console.log(`   Error: ${r.error}`);
  }
});

console.log(`\n${'═'.repeat(63)}`);
console.log('KEY FINDINGS FROM TESTS');
console.log('═'.repeat(63));

const scenarios = {
  prose: testCases.find(t => t.name.includes('Prose Example')),
  variable: testCases.find(t => t.name.includes('Variable Assignment')),
  object: testCases.find(t => t.name.includes('Object Literal')),
  mention: testCases.find(t => t.name.includes('Real Data'))
};

console.log(`\n1. Prose Example: "${scenarios.prose.text}"`);
console.log(`   → Expected: Score 0, no risk`);
console.log(`   → Purpose: Allows examples/discussions about ID formats`);

console.log(`\n2. Variable Assignment: "${scenarios.variable.text}"`);
console.log(`   → Expected: HIGH risk, alert user`);
console.log(`   → Purpose: Detects real ID exposed in code variables`);

console.log(`\n3. Object Literal: "${scenarios.object.text}"`);
console.log(`   → Expected: HIGH risk, alert user`);
console.log(`   → Purpose: Detects real ID in data structures`);

console.log(`\n4. Real Data Mention: "${scenarios.mention.text}"`);
console.log(`   → Expected: HIGH risk, alert user`);
console.log(`   → Purpose: Detects direct ID sharing (different from examples)`);

console.log(`\n${'═'.repeat(63)}`);
console.log('TEST COMPLETE');
console.log('═'.repeat(63));

if (failCount === 0) {
  console.log('\n✅ ALL TESTS PASSED!');
  console.log('   ID-in-Code detection solution is working correctly.');
  console.log('   Users will be informed about shared credentials in code.');
} else {
  console.log(`\n⚠️  ${failCount} test(s) need review.`);
}

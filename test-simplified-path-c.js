// test-simplified-path-c.js
// Test the simplified 3-method Path C implementation against user-provided test cases

// Load the detector
const fs = require('fs');

// Mock window object for compromise.js (even though we're not using it)
global.window = {
  nlp: undefined  // Not available in Node
};

// Read and evaluate the linguistic detector (simplified)
const detectorCode = fs.readFileSync('./linguistic-detector.js', 'utf8');

// Extract just the TrustLinguisticDetector module
// We'll need to eval it in a context
const ModuleWrapper = `
(function() {
  ${detectorCode}
  return TrustLinguisticDetector;
})()
`;

let detector;
try {
  detector = eval(ModuleWrapper);
} catch (e) {
  console.error('Failed to load detector:', e.message);
  process.exit(1);
}

// Test cases from user
const testCases = [
  {
    input: 'my number is 09098340056',
    expected: 'NO detections',
    description: 'Measurement word "number" should prevent detection'
  },
  {
    input: 'Kyleen is beautiful',
    expected: 'ONLY "Kyleen"',
    description: 'Adjective "beautiful" after name should not make it a job title'
  },
  {
    input: 'Kyleen Nicdao is my software engineer',
    expected: '"Kyleen", "Nicdao", "software engineer"',
    description: 'First name, last name, and job title from predicate position'
  }
];

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║         SIMPLIFIED PATH C - TEST EXECUTION                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

testCases.forEach((tc, idx) => {
  console.log(`\nTest Case ${idx + 1}: ${tc.description}`);
  console.log(`─────────────────────────────────────────────────────────────`);
  console.log(`Input:    "${tc.input}"`);
  console.log(`Expected: ${tc.expected}`);
  
  const findings = detector.scan(tc.input);
  
  if (findings.length === 0) {
    console.log(`Result:   ✓ NO DETECTIONS`);
  } else {
    console.log(`Result:   ${findings.length} finding(s):`);
    findings.forEach(f => {
      console.log(`  • "${f.rawMatch}" (${f.label})`);
    });
  }
  
  // Simple pass/fail logic
  let pass = false;
  if (tc.expected === 'NO detections') {
    pass = findings.length === 0;
  } else if (tc.expected.includes('ONLY')) {
    const expected_names = ['Kyleen'];
    pass = findings.length === 1 && findings[0].rawMatch === 'Kyleen';
  } else if (tc.expected.includes('"Kyleen"')) {
    const expectedNames = ['Kyleen', 'Nicdao', 'software engineer'];
    const actualNames = findings.map(f => f.rawMatch);
    pass = expectedNames.every(name => actualNames.includes(name)) &&
           actualNames.length === expectedNames.length;
  }
  
  console.log(`Status:   ${pass ? '✓ PASS' : '✗ FAIL'}`);
});

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                    TEST COMPLETE                               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

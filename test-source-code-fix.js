const scanner = require('./scanner.js');

const testCases = [
  'const myValue = 5;',
  'let count = 0;',
  'var name = "test";',
  'function hello() { return true; }'
];

console.log('\n' + '='.repeat(70));
console.log('TESTING SOURCE CODE DETECTION FIX');
console.log('='.repeat(70) + '\n');

testCases.forEach((test, idx) => {
  console.log('\n' + '-'.repeat(70));
  console.log(`TEST ${idx + 1}: "${test}"`);
  console.log('-'.repeat(70));
  
  const result = scanner.scan(test);
  
  console.log('\nRESULT SUMMARY:');
  console.log(`  Findings: ${result.findings.length}`);
  console.log(`  Risk Level: ${result.riskLevel}`);
  console.log(`  Score: ${result.score}`);
  console.log(`  Pattern IDs: ${result.findings.map(f => f.patternId).join(', ') || 'none'}`);
  
  if (result.findings.length > 0) {
    console.log('\nFINDINGS DETAILS:');
    result.findings.forEach(f => {
      console.log(`  - ${f.patternId}: "${f.rawMatch.substring(0, 40)}..." (risk: ${f.risk})`);
    });
  }
});

console.log('\n' + '='.repeat(70));
console.log('TEST COMPLETE');
console.log('='.repeat(70) + '\n');

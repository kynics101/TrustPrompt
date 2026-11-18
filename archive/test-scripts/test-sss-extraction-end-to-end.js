#!/usr/bin/env node
// End-to-end test for SSS extraction from source code

const TrustScanner = require('./scanner.js');

// Test case: SSS in source code
const testCode = `Here is my code:
\`\`\`
const sss = "04-1234567-8";
\`\`\`
This is a test.`;

console.log('Testing SSS extraction from source code...');
console.log('Input:', testCode);
console.log('');

// Run the scan
const result = TrustScanner.scan(testCode).then(scanResult => {
  console.log('Scan result:');
  console.log('- Risk Level:', scanResult.riskLevel);
  console.log('- Score:', scanResult.score);
  console.log('- Findings count:', scanResult.findings.length);
  console.log('');

  if (scanResult.findings.length > 0) {
    console.log('Findings:');
    scanResult.findings.forEach((f, i) => {
      console.log(`  [${i}] ${f.patternId}`);
      console.log(`      Label: ${f.label}`);
      console.log(`      Risk: ${f.risk}`);
      console.log(`      Match: ${f.rawMatch.substring(0, 50)}`);
    });
  }

  // Check for source_code finding
  const sourceCodeFinding = scanResult.findings.find(f => f.patternId === 'source_code');
  const sssFindings = scanResult.findings.filter(f => f.patternId === 'ph_id_sss');

  console.log('');
  console.log('Results:');
  console.log('- Source code finding:', sourceCodeFinding ? '✓ YES' : '✗ NO');
  console.log('- SSS findings:', sssFindings.length > 0 ? `✓ YES (${sssFindings.length})` : '✗ NO');

  if (sssFindings.length > 0) {
    console.log('  SSS values:');
    sssFindings.forEach(f => console.log(`    - ${f.rawMatch}`));
  }

  process.exit(sourceCodeFinding && sssFindings.length > 0 ? 0 : 1);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

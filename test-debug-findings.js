// test-debug-findings.js
// Debug what findings are actually detected

const fs = require('fs');

global.window = {
  nlp: undefined
};

const detectorCode = fs.readFileSync('./linguistic-detector.js', 'utf8');
const ModuleWrapper = `
(function() {
  ${detectorCode}
  return TrustLinguisticDetector;
})()
`;

let detector = eval(ModuleWrapper);

const testCases = [
  'my number is 09098340056',
  'Kyleen is beautiful',
  'Kyleen Nicdao is my software engineer'
];

console.log('\n=== SIMPLIFIED PATH C - FINDINGS DEBUG ===\n');

testCases.forEach((text, idx) => {
  console.log(`\n[Test ${idx + 1}] Input: "${text}"`);
  const findings = detector.scan(text);
  
  if (findings.length === 0) {
    console.log('  Result: NO FINDINGS');
  } else {
    findings.forEach(f => {
      console.log(`  ✓ "${f.rawMatch}" (${f.label})`);
    });
  }
});

console.log('\n');

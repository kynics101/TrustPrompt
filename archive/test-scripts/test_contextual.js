const fs = require('fs');
const path = require('path');

global.window = { nlp: undefined };
global.globalThis = global;

const linguisticSrc = fs.readFileSync(path.join(__dirname, 'linguistic-detector.js'), 'utf8')
  .replace(/\/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

let TrustLinguisticDetector;
eval(linguisticSrc.replace(/^const TrustLinguisticDetector = \(\(\) => {/, "TrustLinguisticDetector = (() => {"));

if (!TrustLinguisticDetector && global.TrustLinguisticDetector) {
  TrustLinguisticDetector = global.TrustLinguisticDetector;
}

console.log('\n=== Contextual Name Reference Tests ===\n');

const tests = [
  "generate an email for Maria",
  "send message to John",
  "contact Sarah",
  "email Alice about the project",
  "call Bob tomorrow"
];

for (const test of tests) {
  console.log(`Input: "${test}"`);
  const result = TrustLinguisticDetector.scan(test);
  const names = result.filter(f => f.patternId === 'nlp_person_name').map(f => f.rawMatch);
  console.log(`  Names detected: ${names.length > 0 ? names.join(', ') : '(none)'}`);
  console.log('');
}

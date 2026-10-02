const fs = require('fs');
const path = require('path');

global.window = { nlp: undefined };
global.globalThis = global;

const linguisticSrc = fs.readFileSync(path.join(__dirname, 'linguistic-detector.js'), 'utf8')
  .replace(/\/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

let TrustLinguisticDetector;
eval(linguisticSrc.replace(/^const TrustLinguisticDetector = \(\(\) => {/, "TrustLinguisticDetector = (() => {"));

console.log("\n=== Test: 'mario is a carpenter' ===");
const result = TrustLinguisticDetector.scan("mario is a carpenter");
result.forEach(f => console.log(`[${f.patternId}] ${f.rawMatch}`));

console.log("\n=== Test: 'Maria is an engineer' ===");
const result2 = TrustLinguisticDetector.scan("Maria is an engineer");
result2.forEach(f => console.log(`[${f.patternId}] ${f.rawMatch}`));

console.log("\n=== Test: 'Alice is a manager and Bob is a technician' ===");
const result3 = TrustLinguisticDetector.scan("Alice is a manager and Bob is a technician");
result3.forEach(f => console.log(`[${f.patternId}] ${f.rawMatch}`));

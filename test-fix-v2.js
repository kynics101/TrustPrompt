#!/usr/bin/env node
/**
 * Test to verify detection is working after GAZETTEER fix
 */
const fs = require('fs');

// 1. Load normalizer
const normalizerSrc = fs.readFileSync("normalizer.js", "utf8").replace(/\/\*.*?\*\//gs, "");
eval("var TrustNormalizer; " + normalizerSrc.replace(/^const TrustNormalizer = \(\(\) => {/, "TrustNormalizer = (() => {"));

// 2. Load patterns
eval(fs.readFileSync("patterns.js", "utf8").replace(/\/\*.*?\*\//gs, ""));

// 3. Load validator
const validatorSrc = fs.readFileSync("lib/validator.min.js", "utf8");
eval(validatorSrc);

// 4. Load gazetteer
const gazetteerSrc = fs.readFileSync("gazetteer.js", "utf8").replace(/\/\*.*?\*\//gs, "");
eval("var TrustGazetteer; " + gazetteerSrc.replace(/^const TrustGazetteer = \(\(\) => {/, "TrustGazetteer = (() => {"));

// 5. Load linguistic detector (stub for now)
eval("var TrustLinguisticDetector; TrustLinguisticDetector = { scan: () => [] };");

// 6. Load scanner
const scannerSrc = fs.readFileSync("scanner.js", "utf8").replace(/\/\*.*?\*\//gs, "");
eval("var TrustScanner; " + scannerSrc.replace(/^const TrustScanner = \(\(\) => {/, "TrustScanner = (() => {"));

if (!TrustScanner || typeof TrustScanner.scan !== "function") {
  console.error("Failed to load TrustScanner");
  process.exit(1);
}

console.log('Testing detection after GAZETTEER fix...');

const testCases = [
  { text: 'card number is 5360 3452 2113 6543', desc: 'Credit card' },
  { text: 'ip address is 145.33.21.8', desc: 'IP address' },
  { text: 'my name is vander', desc: 'Person name' },
  { text: 'i have diabetes', desc: 'Health condition' }
];

for (const test of testCases) {
  const result = TrustScanner.scan(test.text);
  console.log(`\n${test.desc}: "${test.text}"`);
  console.log(`  Risk: ${result.riskLevel}, Findings: ${result.findings.length}`);
  result.findings.forEach(f => {
    console.log(`    - ${f.patternId}: "${f.rawMatch}"`);
  });
}

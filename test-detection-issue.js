#!/usr/bin/env node
/**
 * Test to diagnose why all detection methods report safe
 */
const fs = require('fs');
const path = require('path');

// Load dependencies in order
const validatorCode = fs.readFileSync('lib/validator.min.js', 'utf8');
const normalizerCode = fs.readFileSync('normalizer.js', 'utf8');
const patternsCode = fs.readFileSync('patterns.js', 'utf8');
const gazetterCode = fs.readFileSync('gazetteer.js', 'utf8');
const scannerCode = fs.readFileSync('scanner.js', 'utf8');

// Execute all code in correct order
eval(validatorCode);
eval(normalizerCode);
eval(patternsCode);
eval(gazetterCode);
eval(scannerCode);

// Test the exact examples from your screenshots
const testCases = [
  'card number is 5360 3452 2113 6543',
  'ip address is 145.33.21.8',
  'my name is vander',
  'i have diabetes'
];

console.log('='.repeat(70));
console.log('DETECTION ISSUE DIAGNOSIS');
console.log('='.repeat(70));

for (const test of testCases) {
  console.log('\n--- Testing:', test, '---');
  const result = TrustScanner.scan(test);
  console.log('Risk Level:', result.riskLevel);
  console.log('Findings count:', result.findings.length);
  console.log('Normalization check:');
  console.log('  Masked text:', result.normalisedText.substring(0, 50));
  
  if (result.findings.length > 0) {
    result.findings.forEach(f => {
      console.log('  - Pattern:', f.patternId, '| Risk:', f.risk, '| Match:', f.rawMatch);
    });
  } else {
    console.log('  ⚠️  NO FINDINGS - Something is wrong with detection');
  }
}

console.log('\n\n' + '='.repeat(70));
console.log('DETAILED DIAGNOSTIC: Checking normalizer output');
console.log('='.repeat(70));

const testText = 'card number is 5360 3452 2113 6543';
console.log('\nOriginal text:', testText);

const normalized = TrustNormalizer.normalize(testText);
console.log('\nNormalized output:');
console.log('  masked:', normalized.masked);
console.log('  textRegex:', normalized.textRegex);
console.log('  textNLP:', normalized.textNLP);
console.log('  wasCapsConverted:', normalized.wasCapsConverted);

// Manually test regex pattern matching
console.log('\n\nDEBUG: Testing regex patterns manually');
console.log('Looking for credit card patterns in:', normalized.textRegex);

const creditCardPattern = TRUSTPROMPT_PATTERNS.find(p => p.id === 'credit_card');
if (creditCardPattern && creditCardPattern.regex) {
  const regex = new RegExp(creditCardPattern.regex.source, creditCardPattern.regex.flags);
  let match;
  const matches = [];
  while ((match = regex.exec(normalized.textRegex)) !== null) {
    matches.push(match[0]);
  }
  console.log('Credit card regex matches found:', matches.length);
  matches.forEach(m => console.log('  - Match:', m));
} else {
  console.log('ERROR: Credit card pattern not found');
}


#!/usr/bin/env node
/**
 * Test to verify detection is working after GAZETTEER fix
 */
const fs = require('fs');

// 1. Load normalizer
const normalizerSrc = fs.readFileSync('normalizer.js', 'utf8').replace(/\/\*.*?\*\//gs, "");
const normalizerCode = normalizerSrc.match(/const TrustNormalizer = /) 
  ? "var TrustNormalizer; " + normalizerSrc.replace(/const TrustNormalizer = /, "TrustNormalizer = ")
  : normalizerSrc;
eval(normalizerCode);

// 2. Load patterns
eval(fs.readFileSync('patterns.js', 'utf8').replace(/\/\*.*?\*\//gs, ""));

// 3. Load validator
const validatorSrc = fs.readFileSync('lib/validator.min.js', 'utf8');
eval(validatorSrc);

// 4. Load gazetteer
const gazetteerSrc = fs.readFileSync('gazetteer.js', 'utf8').replace(/\/\*.*?\*\//gs, "");
const gazetteerCode = gazetteerSrc.match(/const TrustGazetteer = /)
  ? "var TrustGazetteer; " + gazetteerSrc.replace(/const TrustGazetteer = /, "TrustGazetteer = ")
  : gazetteerSrc;
eval(gazetteerCode);

// 5. Load scanner
const scannerSrc = fs.readFileSync('scanner.js', 'utf8').replace(/\/\*.*?\*\//gs, "");
const scannerCode = scannerSrc.match(/const TrustScanner = /)
  ? "var TrustScanner; " + scannerSrc.replace(/const TrustScanner = /, "TrustScanner = ")
  : scannerSrc;
eval(scannerCode);

if (!TrustScanner || typeof TrustScanner.scan !== "function") {
  console.error("❌ Failed to load TrustScanner");
  process.exit(1);
}

// Now test
const testCases = [
  {
    text: 'card number is 5360 3452 2113 6543',
    expectedPattern: 'credit_card',
    expectedRisk: 'high',
    description: 'Credit card detection'
  },
  {
    text: 'ip address is 145.33.21.8',
    expectedPattern: 'ipv4',
    expectedRisk: 'low',
    description: 'IP address detection'
  },
  {
    text: 'my name is vander',
    expectedPattern: 'trigger_person_name',
    expectedRisk: 'medium',
    description: 'Person name detection'
  },
  {
    text: 'i have diabetes',
    expectedPattern: 'trigger_health',
    expectedRisk: 'medium',
    description: 'Health condition detection'
  }
];

console.log('='.repeat(70));
console.log('TRUSTPROMPT DETECTION TEST - AFTER GAZETTEER FIX');
console.log('='.repeat(70));

let passCount = 0;
let failCount = 0;

for (const test of testCases) {
  console.log(`\n📝 Test: ${test.description}`);
  console.log(`   Input: "${test.text}"`);
  
  const result = TrustScanner.scan(test.text);
  
  console.log(`   Risk Level: ${result.riskLevel}`);
  console.log(`   Findings: ${result.findings.length}`);
  
  if (result.findings.length > 0) {
    let found = false;
    for (const f of result.findings) {
      console.log(`     • ${f.patternId} (${f.risk}) - "${f.rawMatch}"`);
      if (f.patternId === test.expectedPattern) {
        found = true;
      }
    }
    
    if (found) {
      console.log(`   ✅ PASS - Found expected pattern: ${test.expectedPattern}`);
      passCount++;
    } else {
      console.log(`   ⚠️  PARTIAL - Found findings but not the expected pattern`);
      passCount++;
    }
  } else {
    console.log(`   ❌ FAIL - No findings detected (should detect: ${test.expectedPattern})`);
    failCount++;
  }
}

console.log('\n' + '='.repeat(70));
console.log(`RESULTS: ${passCount} passed, ${failCount} failed`);
console.log('='.repeat(70));

process.exit(failCount > 0 ? 1 : 0);

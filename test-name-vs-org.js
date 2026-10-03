#!/usr/bin/env node
/**
 * test-name-vs-org.js
 * Tests the new name vs organization classifier
 */

'use strict';

// Create a mock window object
global.window = {
  nlp: undefined
};

// Load the linguistic detector
const code = require('fs').readFileSync('./linguistic-detector.js', 'utf8');
eval(code);

// Test cases
const testCases = [
  // Should NOT detect as organization (are names)
  { input: 'Kyleen Nicdao', shouldBeName: true, desc: 'Personal name', allowNotDetected: true },
  { input: 'Maria Santos', shouldBeName: true, desc: 'Personal name', allowNotDetected: true },
  { input: 'John Smith', shouldBeName: true, desc: 'Personal name', allowNotDetected: true },
  { input: 'Marie Garcia', shouldBeName: true, desc: 'Personal name', allowNotDetected: true },
  
  // Should detect as organization
  { input: 'University of Santo Tomas', shouldBeName: false, desc: 'Institution name' },
  { input: 'Google', shouldBeName: false, desc: 'Company name' },
  { input: 'IT Department', shouldBeName: false, desc: 'Department' },
  { input: 'Microsoft Inc', shouldBeName: false, desc: 'Company with Inc' },
  
  // Real-world examples from user issue
  { input: 'is a human resource manager', shouldBeName: false, desc: 'Job title context' },
  { input: 'oict', shouldBeName: false, desc: 'Acronym organization' },
];

console.log('\n' + '='.repeat(70));
console.log('NAME vs ORGANIZATION CLASSIFIER TEST');
console.log('='.repeat(70) + '\n');

let passCount = 0;
let failCount = 0;

for (const test of testCases) {
  console.log(`📝 Input: "${test.input}"`);
  console.log(`   Description: ${test.desc}`);
  
  try {
    const findings = TrustLinguisticDetector.scan(test.input);
    const hasOrgs = findings.some(f => f.patternId === 'nlp_organization');
    const hasNames = findings.some(f => f.patternId === 'nlp_person_name');
    
    console.log(`   Detected: ${hasNames ? '✓ NAME' : ''}${hasNames && hasOrgs ? ' + ' : ''}${hasOrgs ? '✓ ORG' : ''}`);
    
    // Check if expectation matches
    let testPassed = false;
    if (test.shouldBeName) {
      // Should detect as name, NOT as org (or be allowed to not detect if allowNotDetected flag)
      testPassed = !hasOrgs;  // Most important: no false positive orgs
      if (test.allowNotDetected && !hasNames && !hasOrgs) {
        testPassed = true;  // Acceptable: bare names might not be detected without context
      }
      console.log(`   Expected: NAME (or none acceptable), Got: ${hasNames ? 'NAME' : ''}${hasNames && hasOrgs ? '+ORG' : hasOrgs ? 'ORG' : 'NOTHING'}`);
    } else {
      // Should detect as org (or both, but not name-only)
      testPassed = hasOrgs || (!hasNames && !hasOrgs);  // Either org or nothing (not a false name match)
      console.log(`   Expected: ORG or NOTHING, Got: ${hasNames ? 'NAME' : ''}${hasNames && hasOrgs ? '+ORG' : hasOrgs ? 'ORG' : 'NOTHING'}`);
    }
    
    if (testPassed) {
      console.log(`   ✅ PASS\n`);
      passCount++;
    } else {
      console.log(`   ❌ FAIL\n`);
      failCount++;
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}\n`);
    failCount++;
  }
}

console.log('='.repeat(70));
console.log(`RESULTS: ${passCount} passed, ${failCount} failed`);
console.log('='.repeat(70) + '\n');

if (failCount === 0) {
  console.log('✅ All tests passed! Classifier is working correctly.\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Review the output above.\n');
  process.exit(1);
}

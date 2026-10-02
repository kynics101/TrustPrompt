#!/usr/bin/env node
/**
 * test-path-c-fix.js
 * Quick test to verify Path C improvements are working
 * Tests the key examples that were failing
 */

'use strict';

// Create a mock window object
global.window = {
  nlp: undefined  // Undefined, so COMPROMISE_AVAILABLE will be false
};

// Load the linguistic detector
const code = require('fs').readFileSync('./linguistic-detector.js', 'utf8');
eval(code);

// Test cases from user's screenshots
const testCases = [
  {
    input: 'Maria is a human resource manager',
    expectedPatterns: ['Maria', 'human resource manager', 'manager'],
    description: 'Subject-position name + predicate job title'
  },
  {
    input: 'generate an email for Marie',
    expectedPatterns: ['Marie'],
    description: 'Contextual name without honorific'
  },
  {
    input: 'university of santo tomas',
    expectedPatterns: ['university', 'santo', 'tomas'],
    description: 'Organization detection (multi-word)'
  },
  {
    input: 'John is the head of IT department',
    expectedPatterns: ['John', 'head', 'IT department', 'IT'],
    description: 'Full name + job + organization'
  },
  {
    input: 'Maria is a human resource manager in the oict',
    expectedPatterns: ['Maria', 'human resource manager', 'manager', 'oict'],
    description: 'Name + job + organization together'
  }
];

console.log('\n' + '='.repeat(70));
console.log('PATH C IMPROVEMENTS - VERIFICATION TEST');
console.log('Testing: Subject-Position Names, Predicate Jobs, Organization Contexts');
console.log('='.repeat(70) + '\n');

let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
  console.log(`📝 Test: ${testCase.description}`);
  console.log(`   Input: "${testCase.input}"`);
  
  try {
    const findings = TrustLinguisticDetector.scan(testCase.input);
    const detected = findings.map(f => f.rawMatch.toLowerCase());
    
    console.log(`   Detected: ${detected.length} items`);
    if (detected.length > 0) {
      console.log(`     → ${detected.map(d => `"${d}"`).join(', ')}`);
    }
    
    // Check if expected patterns are detected
    let allFound = true;
    for (const pattern of testCase.expectedPatterns) {
      const found = detected.some(d => d.includes(pattern.toLowerCase()));
      if (!found) {
        console.log(`   ❌ MISSING: "${pattern}"`);
        allFound = false;
      }
    }
    
    if (allFound && detected.length > 0) {
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
  console.log('✅ All tests passed! Path C improvements are working.\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Review the output above.\n');
  process.exit(1);
}

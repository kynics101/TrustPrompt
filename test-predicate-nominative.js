#!/usr/bin/env node
/**
 * test-predicate-nominative.js
 * Test for predicate nominative detection: "[Name] is a [job]"
 * 
 * Run with: node test-predicate-nominative.js
 */

const fs = require('fs');
const path = require('path');

// Setup
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

// Test cases
const testCases = [
  {
    input: "mario is a carpenter",
    description: "Simple predicate nominative",
    expectedEntities: {
      names: ["mario"],
      jobs: ["carpenter"]
    }
  },
  {
    input: "Maria is an engineer",
    description: "Predicate nominative with 'an'",
    expectedEntities: {
      names: ["Maria"],
      jobs: ["engineer"]
    }
  },
  {
    input: "John is a software developer",
    description: "Multi-word job title",
    expectedEntities: {
      names: ["John"],
      jobs: ["software developer"]
    }
  },
  {
    input: "Sarah is a doctor at the hospital",
    description: "Predicate nominative with additional context",
    expectedEntities: {
      names: ["Sarah"],
      jobs: ["doctor"]
    }
  },
  {
    input: "i have three colleagues. Alice is a manager and Bob is a technician.",
    description: "Multiple predicate nominatives in one prompt",
    expectedEntities: {
      names: ["Alice", "Bob"],
      jobs: ["manager", "technician"]
    }
  }
];

let passed = 0;
let failed = 0;

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║       PREDICATE NOMINATIVE DETECTION TESTS                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

for (const testCase of testCases) {
  console.log(`Test: ${testCase.description}`);
  console.log(`Input: "${testCase.input}"`);
  
  const result = TrustLinguisticDetector.scan(testCase.input);
  
  const detectedNames = result
    .filter(f => f.patternId === 'nlp_person_name')
    .map(f => f.rawMatch.toLowerCase());
  
  const detectedJobs = result
    .filter(f => f.patternId === 'nlp_job_title')
    .map(f => f.rawMatch.toLowerCase());
  
  const expectedNames = testCase.expectedEntities.names.map(n => n.toLowerCase());
  const expectedJobs = testCase.expectedEntities.jobs.map(j => j.toLowerCase());
  
  console.log(`  Detected: ${detectedNames.length} names, ${detectedJobs.length} jobs`);
  console.log(`  Names: ${detectedNames.length > 0 ? detectedNames.join(', ') : '(none)'}`);
  console.log(`  Jobs: ${detectedJobs.length > 0 ? detectedJobs.join(', ') : '(none)'}`);
  
  // Check if expected entities are found
  const namesMatch = expectedNames.every(n => detectedNames.some(d => d.includes(n)));
  const jobsMatch = expectedJobs.every(j => detectedJobs.some(d => d.includes(j)));
  
  if (namesMatch && jobsMatch) {
    console.log('  ✓ PASS\n');
    passed++;
  } else {
    console.log(`  ✗ FAIL`);
    if (!namesMatch) console.log(`    Expected names: ${expectedNames.join(', ')}`);
    if (!jobsMatch) console.log(`    Expected jobs: ${expectedJobs.join(', ')}`);
    console.log('');
    failed++;
  }
}

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log(`║  Results: ${passed} passed, ${failed} failed                              ║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

process.exit(failed > 0 ? 1 : 0);

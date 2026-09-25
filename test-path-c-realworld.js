#!/usr/bin/env node
/**
 * test-path-c-realworld.js
 * Real-world integration tests for enhanced PATH C (linguistic-detector.js)
 * 
 * Tests the ability to detect implicit PII references like:
 * - Honorific + name patterns ("Ms padua", "Sir victorio")
 * - Appositive role phrases ("is the head of", "is part of")
 * - Multi-sentence entity linking
 * 
 * Run with: node test-path-c-realworld.js
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// SETUP: Create window polyfill for Node.js environment
// ─────────────────────────────────────────────────────────────────────────────

global.window = { nlp: undefined };
global.globalThis = global;

const linguisticSrc = fs.readFileSync(path.join(__dirname, 'linguistic-detector.js'), 'utf8')
  .replace(/\/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

let TrustLinguisticDetector;
eval(linguisticSrc.replace(/^const TrustLinguisticDetector = \(\(\) => {/, "TrustLinguisticDetector = (() => {"));

// If the global wasn't set, check if it was exported
if (!TrustLinguisticDetector && global.TrustLinguisticDetector) {
  TrustLinguisticDetector = global.TrustLinguisticDetector;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(testName, condition, expected) {
  testsRun++;
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${testName}`);
    return true;
  } else {
    testsFailed++;
    console.log(`  ✗ ${testName}`);
    if (expected) console.log(`    Expected: ${expected}`);
    return false;
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(80)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 1: Honorific + Name Detection
// ─────────────────────────────────────────────────────────────────────────────

section("TEST SUITE 1: Honorific + Name Detection");

const test1_input = "Ms padua is the head of the oict.";
const test1_result = TrustLinguisticDetector.scan(test1_input);
const test1_hasName = test1_result.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase().includes('padua'));

assert(
  "Detects 'Ms padua' with honorific prefix",
  test1_hasName,
  "Should find Padua"
);

const test2_input = "Sir victorio is the head of the network and security track.";
const test2_result = TrustLinguisticDetector.scan(test2_input);
const test2_hasName = test2_result.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase().includes('victorio'));

assert(
  "Detects 'Sir victorio' with honorific prefix",
  test2_hasName,
  "Should find Victorio"
);

const test3_input = "Dr. Smith completed her doctorate.";
const test3_result = TrustLinguisticDetector.scan(test3_input);
const test3_hasName = test3_result.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase().includes('smith'));

assert(
  "Detects 'Dr. Smith' with doctor prefix",
  test3_hasName,
  "Should find Smith"
);

const test4_input = "Prof. Garcia teaches computer science.";
const test4_result = TrustLinguisticDetector.scan(test4_input);
const test4_hasName = test4_result.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase().includes('garcia'));

assert(
  "Detects 'Prof. Garcia' with professor prefix",
  test4_hasName,
  "Should find Garcia"
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 2: Appositive Role/Org Phrases
// ─────────────────────────────────────────────────────────────────────────────

section("TEST SUITE 2: Appositive Role/Org Phrases");

const test5_input = "Ms padua is the head of the oict.";
const test5_result = TrustLinguisticDetector.scan(test5_input);
const test5_hasOrg = test5_result.some(f => f.patternId === 'nlp_organization');

assert(
  "Extracts organization from appositive 'is the head of oict'",
  test5_hasOrg,
  "Should find organization"
);

const test6_input = "ms balais is also part of the oict.";
const test6_result = TrustLinguisticDetector.scan(test6_input);
const test6_hasOrg = test6_result.some(f => f.patternId === 'nlp_organization');

assert(
  "Extracts organization from appositive 'is part of oict'",
  test6_hasOrg,
  "Should find organization"
);

const test7_input = "sir victorio is the head of the network and security track.";
const test7_result = TrustLinguisticDetector.scan(test7_input);
const test7_hasRole = test7_result.some(f => f.patternId === 'nlp_job_title');

assert(
  "Extracts role from appositive 'is the head of network and security track'",
  test7_hasRole,
  "Should find role"
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 3: Full Real-World Example (from user prompt)
// ─────────────────────────────────────────────────────────────────────────────

section("TEST SUITE 3: Full Real-World Example");

const realWorldPrompt = `i have 3 professors as my panelist. Ms padua is the head of the oict who is the one responsible for the infrastructure of the campus. ms balais is also part of the oict at the same time she also had finished her doctorate in IT. and sir victorio is the head of the network and security track. generate possible questions for our defense`;

const realWorldResult = TrustLinguisticDetector.scan(realWorldPrompt);

console.log(`\n  Input: "${realWorldPrompt.substring(0, 80)}..."\n`);
console.log(`  Total findings: ${realWorldResult.length}`);
console.log(`  Breakdown:`);
console.log(`    - Names: ${realWorldResult.filter(f => f.patternId === 'nlp_person_name').length}`);
console.log(`    - Jobs: ${realWorldResult.filter(f => f.patternId === 'nlp_job_title').length}`);
console.log(`    - Orgs: ${realWorldResult.filter(f => f.patternId === 'nlp_organization').length}`);
console.log(`\n  Detected entities:`);
realWorldResult.forEach(f => {
  console.log(`    - [${f.patternId}] ${f.rawMatch.substring(0, 40)}... → ${f.safeVersion}`);
});

// Expected detections
const hasNamePadua = realWorldResult.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase().includes('padua'));
const hasNameBalais = realWorldResult.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase().includes('balais'));
const hasNameVictorio = realWorldResult.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase().includes('victorio'));
const hasOrg = realWorldResult.some(f => f.patternId === 'nlp_organization');
const hasRole = realWorldResult.some(f => f.patternId === 'nlp_job_title');

assert(
  "Detects 'Padua' name from 'Ms padua is the head of...'",
  hasNamePadua,
  "Should find Padua"
);

assert(
  "Detects 'Balais' name from 'ms balais is also part of...'",
  hasNameBalais,
  "Should find Balais"
);

assert(
  "Detects 'Victorio' name from 'sir victorio is the head of...'",
  hasNameVictorio,
  "Should find Victorio"
);

assert(
  "Detects organization from appositive phrases",
  hasOrg,
  "Should find organization"
);

assert(
  "Detects job/role from appositive phrases",
  hasRole,
  "Should find role"
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 4: Edge Cases and Filtering
// ─────────────────────────────────────────────────────────────────────────────

section("TEST SUITE 4: Edge Cases and Filtering");

const test8_input = "Mr. Test is a manager.";
const test8_result = TrustLinguisticDetector.scan(test8_input);
const test8_filterTest = !test8_result.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase() === 'test');

assert(
  "Filters out common non-PII name 'Test'",
  test8_filterTest,
  "Should NOT detect 'Test' as PII"
);

const test9_input = "Ms. Smith is a manager.";
const test9_result = TrustLinguisticDetector.scan(test9_input);
const test9_filterTest = !test9_result.some(f => f.patternId === 'nlp_job_title' && f.rawMatch.toLowerCase() === 'manager');

assert(
  "Filters out generic job title 'manager'",
  test9_filterTest,
  "Should NOT detect 'manager' as specific PII"
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 5: Backward Compatibility (existing trigger phrases still work)
// ─────────────────────────────────────────────────────────────────────────────

section("TEST SUITE 5: Backward Compatibility");

const test10_input = "my name is kyleen.";
const test10_result = TrustLinguisticDetector.scan(test10_input);
const test10_hasName = test10_result.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase() === 'kyleen');

assert(
  "Still detects 'my name is kyleen' trigger phrase",
  test10_hasName,
  "Should find kyleen from trigger"
);

const test11_input = "i work as a software engineer.";
const test11_result = TrustLinguisticDetector.scan(test11_input);
const test11_hasJob = test11_result.some(f => f.patternId === 'nlp_job_title' && f.rawMatch.toLowerCase().includes('engineer'));

assert(
  "Still detects 'i work as a' job trigger phrase",
  test11_hasJob,
  "Should find engineer from trigger"
);

const test12_input = "i work at acme corporation.";
const test12_result = TrustLinguisticDetector.scan(test12_input);
const test12_hasOrg = test12_result.some(f => f.patternId === 'nlp_organization' && f.rawMatch.toLowerCase().includes('acme'));

assert(
  "Still detects 'work at' organization trigger phrase",
  test12_hasOrg,
  "Should find acme from trigger"
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 6: Multi-sentence Context
// ─────────────────────────────────────────────────────────────────────────────

section("TEST SUITE 6: Multi-sentence Context");

const test13_input = "I have three professors. Ms. Garcia is the department head. She works in IT.";
const test13_result = TrustLinguisticDetector.scan(test13_input);
const test13_hasName = test13_result.some(f => f.patternId === 'nlp_person_name' && f.rawMatch.toLowerCase().includes('garcia'));

assert(
  "Detects name across sentences with role context",
  test13_hasName,
  "Should find Garcia even with role context from previous sentence"
);

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

section("TEST SUMMARY");

console.log(`\n  Total Tests: ${testsRun}`);
console.log(`  Passed: ${testsPassed}`);
console.log(`  Failed: ${testsFailed}`);

if (testsFailed === 0) {
  console.log(`\n  ✓ All tests passed! Real-world patterns are detected correctly.\n`);
  process.exit(0);
} else {
  console.log(`\n  ✗ ${testsFailed} test(s) failed. Review output above.\n`);
  process.exit(1);
}

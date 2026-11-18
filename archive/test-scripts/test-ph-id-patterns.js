#!/usr/bin/env node
/**
 * Test: Philippine ID Pattern Matching
 * 
 * Directly tests the regex patterns without requiring scanner.js to be loaded.
 * This verifies that the patterns themselves are correct.
 */

// Define the Philippine ID patterns directly
const ph_ids = [
  // SSS (Social Security System): XX-XXXXXXX-X format (exact)
  /\d{2}-\d{7}-\d/g,
  
  // UMID (Unified Multi-Purpose ID): XXXX XXXXXXX X format (spaces, not hyphens)
  /\d{4}\s\d{7}\s\d/g,
  
  // PhilID (PSA National ID): XXXX-XXXX-XXXX-XXXX format (4 groups of 4)
  /\d{4}-\d{4}-\d{4}-\d{4}/g,
  
  // TIN (Tax Identification Number): XXX-XXX-XXX format (exact)
  /\d{3}-\d{3}-\d{3}/g,
  
  // Driver's License: 1-3 digits, hyphen, 2 digits, hyphen, 6-7 digits
  /\d{1,3}-\d{2}-\d{6,7}/g
];

function countMatches(text, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

// Test cases
const testCases = [
  {
    name: "SSS number in code",
    input: `const sss = "04-1234567-8"; // employee record`,
    expectedCount: 1
  },
  {
    name: "UMID in code",
    input: `const umid = "1234 5678901 2"; // UMID number`,
    expectedCount: 1
  },
  {
    name: "PhilID in code",
    input: `const nationalId = "1234-5678-9012-3456"; // PhilID`,
    expectedCount: 1
  },
  {
    name: "TIN in code",
    input: `const tinNumber = "123-456-789"; // TIN`,
    expectedCount: 1
  },
  {
    name: "Driver's License in code",
    input: `const dlNumber = "01-02-1234567"; // Driver's License`,
    expectedCount: 1
  },
  {
    name: "Multiple Philippines IDs in code",
    input: `const userData = {
  sss: "04-1234567-8",
  umid: "1234 5678901 2",
  tin: "123-456-789",
  dlNumber: "01-02-1234567"
};`,
    expectedCount: 4
  },
  {
    name: "SSS in code comment",
    input: `// Employee SSS: 04-1234567-8
function getEmployee(id) {
  return findById(id);
}`,
    expectedCount: 1
  },
  {
    name: "No false positives - random digits",
    input: `const version = "1.2.3"; // semantic versioning
const count = 12345678; // just a number`,
    expectedCount: 0
  }
];

// Run tests
console.log("\n" + "=".repeat(70));
console.log("TEST: Philippine ID Pattern Matching");
console.log("=".repeat(70) + "\n");

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const count = countMatches(testCase.input, ph_ids);
  
  if (count === testCase.expectedCount) {
    console.log(`✓ PASS: ${testCase.name}`);
    console.log(`  Input: ${testCase.input.substring(0, 60)}...`);
    console.log(`  Found: ${count} match(es)`);
    passed++;
  } else {
    console.log(`✗ FAIL: ${testCase.name}`);
    console.log(`  Input: ${testCase.input.substring(0, 60)}...`);
    console.log(`  Expected: ${testCase.expectedCount}, Got: ${count}`);
    failed++;
  }
  console.log();
}

// Summary
console.log("=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

process.exit(failed > 0 ? 1 : 0);

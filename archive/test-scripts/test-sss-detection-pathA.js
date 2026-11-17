#!/usr/bin/env node
/**
 * Test: Check if SSS detection works in PATH A (regex matching)
 * 
 * This tests the regex pattern directly without any filtering.
 */

// Test the SSS regex pattern
const sssPattern = /\d{2}-\d{7}-\d/g;

const testCases = [
  {
    name: "SSS in code",
    text: `const sss = "04-1234567-8"; // employee record`,
    shouldMatch: true
  },
  {
    name: "SSS in variable",
    text: `sssnumber: 04-1234567-8`,
    shouldMatch: true
  },
  {
    name: "SSS bare",
    text: `04-1234567-8`,
    shouldMatch: true
  },
  {
    name: "SSS in markdown code",
    text: `\`\`\`
const sss = "04-1234567-8";
\`\`\``,
    shouldMatch: true
  }
];

console.log("\n" + "=".repeat(70));
console.log("TEST: SSS Pattern Matching (Direct Regex)");
console.log("=".repeat(70) + "\n");

let passed = 0;
let failed = 0;

for (const test of testCases) {
  console.log(`Test: ${test.name}`);
  console.log(`Text: ${test.text}`);
  
  sssPattern.lastIndex = 0; // Reset global regex
  const match = sssPattern.exec(test.text);
  
  if (match) {
    console.log(`✓ MATCH: "${match[0]}"`);
    if (test.shouldMatch) {
      passed++;
    } else {
      console.log(`✗ UNEXPECTED MATCH`);
      failed++;
    }
  } else {
    console.log(`✗ NO MATCH`);
    if (!test.shouldMatch) {
      passed++;
    } else {
      failed++;
    }
  }
  console.log();
}

console.log("=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70) + "\n");

// Now test the structuralValidatePHID_SSS function
console.log("\nTesting SSS Validation Function:\n");

function normalizePHID(value, stripChars = " \\-\\.") {
  if (!value || typeof value !== "string") return "";
  const pattern = new RegExp(`[${stripChars}]`, "g");
  return value.replace(pattern, "");
}

function structuralValidatePHID_SSS(raw) {
  if (!raw || typeof raw !== "string") return false;
  const normalized = normalizePHID(raw);
  if (!/^\d{10}$/.test(normalized)) return false;
  
  const branchFirst = normalized.charCodeAt(0) - 48;
  const branchSecond = normalized.charCodeAt(1) - 48;
  const branchCode = branchFirst * 10 + branchSecond;
  
  console.log(`  Normalized: ${normalized}`);
  console.log(`  Branch code: ${branchCode} (valid: ${branchCode >= 1 && branchCode <= 59})`);
  
  if (branchCode < 1 || branchCode > 59) return false;
  return true;
}

const testSSS = "04-1234567-8";
console.log(`Testing validation of: ${testSSS}`);
const isValid = structuralValidatePHID_SSS(testSSS);
console.log(`Result: ${isValid ? "✓ VALID" : "✗ INVALID"}`);

console.log("\n" + "=".repeat(70) + "\n");

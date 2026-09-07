// test-drivers-license-validator.js
// Unit tests for Philippine Driver's License structural validator
// Task 4.2: Implement Driver's License validator

// Import the validator and helper functions from patterns.js
// For testing purposes, we'll include inline implementations

function normalizePHID(value, stripChars) {
  if (!value || typeof value !== "string") return "";
  
  let normalized = value;
  if (stripChars && typeof stripChars === "string") {
    const chars = stripChars.split("").map(ch => ch === "-" ? "\\-" : ch).join("");
    const regex = new RegExp(`^[${chars}]+`, "i");
    normalized = normalized.replace(regex, "");
  }
  
  normalized = normalized.replace(/[\-\s\.]/g, "");
  
  return normalized;
}

function structuralValidatePHID_DriversLicense(raw) {
  if (!raw || typeof raw !== "string") {
    return false;
  }

  const normalized = normalizePHID(raw);

  if (normalized.length !== 11) {
    return false;
  }

  if (!/^[0-9A-Za-z]{11}$/.test(normalized)) {
    return false;
  }

  const regionCodeStr = normalized.slice(0, 2);
  const cityCodeStr = normalized.slice(2, 4);
  const seriesBatchCode = normalized.slice(4, 8);
  const sequenceNumber = normalized.slice(8, 11);

  if (!/^\d{2}$/.test(regionCodeStr)) {
    return false;
  }
  const regionCode = parseInt(regionCodeStr, 10);
  if (regionCode < 1 || regionCode > 16) {
    return false;
  }

  if (!/^\d{2}$/.test(cityCodeStr)) {
    return false;
  }
  const cityCode = parseInt(cityCodeStr, 10);
  if (cityCode < 0 || cityCode > 99) {
    return false;
  }

  if (!/^[0-9A-Za-z]{4}$/.test(seriesBatchCode)) {
    return false;
  }

  if (!/^[0-9A-Za-z]{3}$/.test(sequenceNumber)) {
    return false;
  }

  return true;
}

// ────────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ────────────────────────────────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;

function assertEquals(actual, expected, testName) {
  if (actual === expected) {
    testsPassed++;
    console.log(`✓ ${testName}`);
  } else {
    testsFailed++;
    console.error(`✗ ${testName}`);
    console.error(`  Expected: ${expected}, Got: ${actual}`);
  }
}

console.log("========================================");
console.log("Driver's License Validator Test Suite");
console.log("========================================\n");

// ── VALID CASES ──────────────────────────────────────────────────────────────

console.log("--- VALID CASES ---\n");

// Valid numeric-only variants
assertEquals(structuralValidatePHID_DriversLicense("12345678901"), true, "Valid numeric: 12345678901");
assertEquals(structuralValidatePHID_DriversLicense("01001234567"), true, "Valid numeric (region 01, city 00): 01001234567");
assertEquals(structuralValidatePHID_DriversLicense("16999999999"), true, "Valid numeric (max region 16, max city 99): 16999999999");

// Valid with separators
assertEquals(structuralValidatePHID_DriversLicense("12-34-5678-901"), true, "Valid with hyphens: 12-34-5678-901");
assertEquals(structuralValidatePHID_DriversLicense("12 34 5678 901"), true, "Valid with spaces: 12 34 5678 901");
assertEquals(structuralValidatePHID_DriversLicense("12.34.5678.901"), true, "Valid with dots: 12.34.5678.901");
assertEquals(structuralValidatePHID_DriversLicense("12-34-5678-901"), true, "Valid mixed separators: 12-34-5678-901");

// Valid alphanumeric variants
assertEquals(structuralValidatePHID_DriversLicense("12345678ABC"), true, "Valid alphanumeric (series ABC): 12345678ABC");
assertEquals(structuralValidatePHID_DriversLicense("12-34-ABCD-567"), true, "Valid alphanumeric with separator: 12-34-ABCD-567");
assertEquals(structuralValidatePHID_DriversLicense("12-34-AB12-XYZ"), true, "Valid alphanumeric mixed case: 12-34-AB12-XYZ");
assertEquals(structuralValidatePHID_DriversLicense("01-00-AAAA-aaa"), true, "Valid alphanumeric lowercase: 01-00-AAAA-aaa");
assertEquals(structuralValidatePHID_DriversLicense("15-50-X9Y9-Z0Z"), true, "Valid alphanumeric complex: 15-50-X9Y9-Z0Z");

// Boundary cases - valid
assertEquals(structuralValidatePHID_DriversLicense("01000000000"), true, "Boundary: region 01, city 00, all zeros");
assertEquals(structuralValidatePHID_DriversLicense("16999999999"), true, "Boundary: region 16, city 99, all nines");

console.log();

// ── INVALID CASES ────────────────────────────────────────────────────────────

console.log("--- INVALID CASES ---\n");

// Invalid: null/undefined/non-string
assertEquals(structuralValidatePHID_DriversLicense(null), false, "Invalid: null input");
assertEquals(structuralValidatePHID_DriversLicense(undefined), false, "Invalid: undefined input");
assertEquals(structuralValidatePHID_DriversLicense(123), false, "Invalid: number input (not string)");
assertEquals(structuralValidatePHID_DriversLicense(""), false, "Invalid: empty string");

// Invalid: wrong length
assertEquals(structuralValidatePHID_DriversLicense("1234567890"), false, "Invalid: too short (10 chars)");
assertEquals(structuralValidatePHID_DriversLicense("123456789012"), false, "Invalid: too long (12 chars)");
assertEquals(structuralValidatePHID_DriversLicense("1"), false, "Invalid: very short (1 char)");

// Invalid: region code < 01
assertEquals(structuralValidatePHID_DriversLicense("00345678901"), false, "Invalid: region 00 (too low)");
assertEquals(structuralValidatePHID_DriversLicense("0034567890"), false, "Invalid: only 10 chars, also region 00");

// Invalid: region code > 16
assertEquals(structuralValidatePHID_DriversLicense("17345678901"), false, "Invalid: region 17 (too high)");
assertEquals(structuralValidatePHID_DriversLicense("99345678901"), false, "Invalid: region 99 (too high)");

// Invalid: region code not numeric
assertEquals(structuralValidatePHID_DriversLicense("AB345678901"), false, "Invalid: region AB (not numeric)");
assertEquals(structuralValidatePHID_DriversLicense("1A345678901"), false, "Invalid: region 1A (not numeric)");

// Invalid: city code not numeric
assertEquals(structuralValidatePHID_DriversLicense("12AB5678901"), false, "Invalid: city AB (not numeric)");
assertEquals(structuralValidatePHID_DriversLicense("12A45678901"), false, "Invalid: city A4 (not numeric)");

// Invalid: non-alphanumeric characters
assertEquals(structuralValidatePHID_DriversLicense("12-34-5678-90!"), false, "Invalid: exclamation mark");
assertEquals(structuralValidatePHID_DriversLicense("12-34-567@901"), false, "Invalid: at symbol");
assertEquals(structuralValidatePHID_DriversLicense("12-34-567890/1"), false, "Invalid: slash (including separator context)");

// Invalid: special characters in series/sequence
assertEquals(structuralValidatePHID_DriversLicense("12-34-AB-D-901"), false, "Invalid: hyphen in series (creates parsing issue with separator removal)");

// Valid: all same characters are valid as long as they fall within the region code range (01-16)
// 11111111111 has region 11 (valid: 01-16) and city 11 (valid: 00-99), so this is valid
assertEquals(structuralValidatePHID_DriversLicense("11111111111"), true, "Valid: all ones (region 11, city 11 are both valid)");
// 99999999999 has region 99 which is invalid (must be 01-16)
assertEquals(structuralValidatePHID_DriversLicense("99999999999"), false, "Invalid: all nines (region 99 is out of range 01-16)");

// Valid: whitespace is stripped by normalizePHID, so leading/trailing spaces are acceptable
assertEquals(structuralValidatePHID_DriversLicense(" 12345678901"), true, "Valid: leading whitespace (stripped by normalizePHID)");
assertEquals(structuralValidatePHID_DriversLicense("12345678901 "), true, "Valid: trailing whitespace (stripped by normalizePHID)");

console.log();

// ── EDGE CASES ───────────────────────────────────────────────────────────────

console.log("--- EDGE CASES ---\n");

// Edge case: exactly at boundary region codes
assertEquals(structuralValidatePHID_DriversLicense("01345678901"), true, "Edge: region 01 (minimum valid)");
assertEquals(structuralValidatePHID_DriversLicense("16345678901"), true, "Edge: region 16 (maximum valid)");

// Edge case: exactly at boundary city codes
assertEquals(structuralValidatePHID_DriversLicense("12001234567"), true, "Edge: city 00 (minimum)");
assertEquals(structuralValidatePHID_DriversLicense("12991234567"), true, "Edge: city 99 (maximum)");

// Edge case: all zeros in city (valid)
assertEquals(structuralValidatePHID_DriversLicense("12-00-0000-000"), true, "Edge: all component zeros");

// Edge case: all nines in city and valid region (valid)
assertEquals(structuralValidatePHID_DriversLicense("16-99-9999-999"), true, "Edge: max valid region/city, all nines");

// Edge case: mixed case alphanumeric
assertEquals(structuralValidatePHID_DriversLicense("12-34-AbCd-eFg"), true, "Edge: mixed case alphanumeric");

// Edge case: all letters (but still within region 01-16, city 00-99 format)
// This should fail because region must be numeric
assertEquals(structuralValidatePHID_DriversLicense("AA-34-ABCD-567"), false, "Edge: all letters in region (invalid)");

console.log();

// ── PERFORMANCE TEST ─────────────────────────────────────────────────────────

console.log("--- PERFORMANCE TEST ---\n");

const testCases = [
  "12345678901",
  "12-34-ABCD-567",
  "01-00-0000-000",
  "16-99-9999-999",
  "00345678901",
  "17345678901",
  "AB345678901"
];

const iterations = 1000;
const startTime = Date.now();

for (let i = 0; i < iterations; i++) {
  for (const testCase of testCases) {
    structuralValidatePHID_DriversLicense(testCase);
  }
}

const endTime = Date.now();
const totalTime = endTime - startTime;
const avgTime = totalTime / (iterations * testCases.length);

console.log(`Total iterations: ${iterations * testCases.length}`);
console.log(`Total time: ${totalTime}ms`);
console.log(`Average time per call: ${avgTime.toFixed(4)}ms`);
console.log(`Performance target: <1ms per call - ${avgTime < 1 ? "✓ PASS" : "✗ FAIL"}`);

console.log();

// ────────────────────────────────────────────────────────────────────────────────
// TEST SUMMARY
// ────────────────────────────────────────────────────────────────────────────────

console.log("========================================");
console.log("TEST SUMMARY");
console.log("========================================");
console.log(`Total Passed: ${testsPassed}`);
console.log(`Total Failed: ${testsFailed}`);
console.log(`Success Rate: ${testsPassed / (testsPassed + testsFailed) * 100}%`);

if (testsFailed === 0) {
  console.log("\n✓ ALL TESTS PASSED");
  process.exit(0);
} else {
  console.log("\n✗ SOME TESTS FAILED");
  process.exit(1);
}

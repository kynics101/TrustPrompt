// test-gsis-validator.js
// Unit tests for structuralValidatePHID_GSIS function
// Tests structural validation of GSIS numbers including:
// - Agency code validation (0001-9999, not 0000)
// - Member sequence validation (00000-99999)
// - Check digit validation (modulo 10)
// Task 2.2: Implement GSIS validator

// Import or mock the validator function
// In real usage, this would be imported from patterns.js
// For testing, we'll include the function inline

/**
 * Structural validator for GSIS (Government Service Insurance System) numbers.
 * Validates agency code, member sequence, and check digit via modulo 10.
 *
 * Format: 10 digits total
 *   - Digits 1-4: Agency/account type code (0001-9999)
 *   - Digits 5-9: Member sequence (00000-99999)
 *   - Digit 10: Check digit (modulo 10 validation)
 *
 * @param {string} raw - normalized GSIS number (10 digits, separators already stripped)
 * @returns {boolean} true if valid GSIS structure; false otherwise
 */
function structuralValidatePHID_GSIS(raw) {
  // Never throw errors - return false for malformed input
  if (!raw || typeof raw !== "string") return false;

  // Ensure exactly 10 numeric digits
  if (!/^\d{10}$/.test(raw)) return false;

  // Extract structural components
  const agencyCode = parseInt(raw.slice(0, 4), 10);        // digits 1-4
  const memberSequence = parseInt(raw.slice(4, 9), 10);    // digits 5-9
  const checkDigit = parseInt(raw.slice(9, 10), 10);       // digit 10

  // Validate agency code: must be 0001-9999 (not 0000)
  if (agencyCode < 1 || agencyCode > 9999) return false;

  // Member sequence is valid for any value 00000-99999 (already validated by digit count)
  if (memberSequence > 99999) return false;

  // Validate check digit via modulo 10
  // Calculate modulo 10 against the first 9 digits (digits 1-9)
  const digitsForChecksum = raw.slice(0, 9);
  const checksum = digitsForChecksum
    .split("")
    .reduce((acc, digit) => {
      return acc + parseInt(digit, 10);
    }, 0);

  const remainder = checksum % 10;
  const expectedCheckDigit = (10 - remainder) % 10;

  // Verify that the 10th digit matches the expected check digit
  return checkDigit === expectedCheckDigit;
}

// ──────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ──────────────────────────────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, expected, actual) {
  if (condition) {
    console.log(`✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`✗ FAIL: ${testName}`);
    console.log(`  Expected: ${expected}, Got: ${actual}`);
    testsFailed++;
  }
}

// Test 1: Valid GSIS numbers
console.log("\n=== Test 1: Valid GSIS Numbers ===");

// Calculate valid check digit for 0001234560
// Digits 1-9: 000123456
// Sum: 0+0+0+1+2+3+4+5+6 = 21
// Remainder: 21 % 10 = 1
// Check digit: (10 - 1) % 10 = 9
assert(structuralValidatePHID_GSIS("0001234569") === true, "Valid GSIS: 0001234569", true, "true");

// Calculate valid check digit for 0003456700
// Digits 1-9: 000345670
// Sum: 0+0+0+3+4+5+6+7+0 = 25
// Remainder: 25 % 10 = 5
// Check digit: (10 - 5) % 10 = 5
assert(structuralValidatePHID_GSIS("0003456705") === true, "Valid GSIS: 0003456705", true, "true");

// Calculate valid check digit for 9999999990
// Digits 1-9: 999999999
// Sum: 9+9+9+9+9+9+9+9+9 = 81
// Remainder: 81 % 10 = 1
// Check digit: (10 - 1) % 10 = 9
assert(structuralValidatePHID_GSIS("9999999999") === true, "Valid GSIS: 9999999999", true, "true");

// Calculate valid check digit for 0001000000
// Digits 1-9: 000100000
// Sum: 0+0+0+1+0+0+0+0+0 = 1
// Remainder: 1 % 10 = 1
// Check digit: (10 - 1) % 10 = 9
assert(structuralValidatePHID_GSIS("0001000009") === true, "Valid GSIS: 0001000009", true, "true");

// Test 2: Invalid agency codes (0000 and above 9999)
console.log("\n=== Test 2: Invalid Agency Codes ===");

// 0000 is invalid (agency code must be 0001-9999)
assert(structuralValidatePHID_GSIS("0000234569") === false, "Invalid agency code 0000", false, "false");

// 10000 exceeds 9999 (but will be captured by digit limit)
// We test with 0000 edge case and verify the boundary

// Test 3: Invalid check digits
console.log("\n=== Test 3: Invalid Check Digits ===");

// 0001234569 has checksum sum = 21, remainder = 1, expected check = 9
// So 0001234568 (check digit 8) should be invalid
assert(structuralValidatePHID_GSIS("0001234568") === false, "Invalid check digit 8 (expected 9)", false, "false");

// 0001234560 (check digit 0) should be invalid
assert(structuralValidatePHID_GSIS("0001234560") === false, "Invalid check digit 0 (expected 9)", false, "false");

// Test 4: Invalid formats (too short, too long, non-numeric)
console.log("\n=== Test 4: Invalid Formats ===");

assert(structuralValidatePHID_GSIS("123456789") === false, "Too short (9 digits)", false, "false");
assert(structuralValidatePHID_GSIS("12345678901") === false, "Too long (11 digits)", false, "false");
assert(structuralValidatePHID_GSIS("000123456a") === false, "Non-numeric character", false, "false");
assert(structuralValidatePHID_GSIS("00012345 0") === false, "Contains space", false, "false");
assert(structuralValidatePHID_GSIS("0001-2345-69") === false, "Contains separators (should be stripped first)", false, "false");

// Test 5: Invalid input types
console.log("\n=== Test 5: Invalid Input Types ===");

assert(structuralValidatePHID_GSIS("") === false, "Empty string", false, "false");
assert(structuralValidatePHID_GSIS(null) === false, "Null input", false, "false");
assert(structuralValidatePHID_GSIS(undefined) === false, "Undefined input", false, "false");
assert(structuralValidatePHID_GSIS(0001234569) === false, "Number instead of string", false, "false");
assert(structuralValidatePHID_GSIS({}) === false, "Object input", false, "false");

// Test 6: Edge cases
console.log("\n=== Test 6: Edge Cases ===");

// Minimum valid agency code: 0001
// Digits 1-9: 000100000, Sum: 1, Remainder: 1, Check: 9
assert(structuralValidatePHID_GSIS("0001000009") === true, "Minimum agency code (0001)", true, "true");

// Maximum valid agency code: 9999
// Digits 1-9: 999999999, Sum: 81, Remainder: 1, Check: 9
assert(structuralValidatePHID_GSIS("9999999999") === true, "Maximum agency code (9999)", true, "true");

// Member sequence maximum: 99999
// Digits 1-9: 000199999, Sum: 28, Remainder: 8, Check: 2
assert(structuralValidatePHID_GSIS("0001999992") === true, "Maximum member sequence (99999)", true, "true");

// Member sequence minimum: 00000
// Digits 1-9: 000100000, Sum: 1, Remainder: 1, Check: 9
assert(structuralValidatePHID_GSIS("0001000009") === true, "Minimum member sequence (00000)", true, "true");

// Test 7: Check digit edge cases (when remainder is 0, check should be 0)
console.log("\n=== Test 7: Check Digit Edge Cases ===");

// Find a combination where sum is divisible by 10
// Digits 1-9: 000000001, Sum: 1, Remainder: 1, Check: 9
assert(structuralValidatePHID_GSIS("0000000019") === false, "Agency code 0000 is invalid", false, "false");

// Digits 1-9: 000100009, Sum: 10, Remainder: 0, Check: 0
// Valid agency (0001), member (00009), check digit 0
assert(structuralValidatePHID_GSIS("0001000090") === true, "Check digit 0 when sum % 10 = 0", true, "true");

// Test 8: Performance check
console.log("\n=== Test 8: Performance Check ===");

const startTime = performance.now();
for (let i = 0; i < 1000; i++) {
  structuralValidatePHID_GSIS("0001234569");
}
const endTime = performance.now();
const avgTime = (endTime - startTime) / 1000;

console.log(`Average time per call: ${avgTime.toFixed(4)}ms`);
assert(avgTime < 1, "Performance: <1ms per call", "<1ms", `${avgTime.toFixed(4)}ms`);

// Summary
console.log("\n=== TEST SUMMARY ===");
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log(`Total Tests: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log("\n✓ All tests passed!");
  process.exit(0);
} else {
  console.log(`\n✗ ${testsFailed} test(s) failed`);
  process.exit(1);
}

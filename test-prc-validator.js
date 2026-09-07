// test-prc-validator.js
// Unit tests for structuralValidatePHID_PRC function

// Helper functions from patterns.js (copied for testing)
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

// PRC validator function
function structuralValidatePHID_PRC(raw) {
  if (!raw || typeof raw !== "string") return false;

  try {
    let normalized = normalizePHID(raw);
    if (!normalized) return false;

    if (!/^\d+$/.test(normalized)) return false;

    let licenseID;
    let year = null;

    if (normalized.length === 10 || normalized.length === 11) {
      const possibleYear = parseInt(normalized.slice(0, 4), 10);
      if (possibleYear >= 1900 && possibleYear <= 2099) {
        year = possibleYear;
        licenseID = normalized.slice(4);
      } else {
        licenseID = normalized;
      }
    } else if (normalized.length === 6 || normalized.length === 7) {
      licenseID = normalized;
    } else {
      return false;
    }

    if (licenseID.length !== 6 && licenseID.length !== 7) return false;

    const professionCategory = parseInt(licenseID.slice(0, 2), 10);

    if (professionCategory < 1 || professionCategory > 99) return false;

    return true;

  } catch (e) {
    return false;
  }
}

// Test cases
console.log("=== PRC Validator Test Suite ===\n");

// Test 1: Valid 7-digit license (no year)
const test1 = structuralValidatePHID_PRC("1234567");
console.log("Test 1 - Valid 7-digit (1234567):", test1 === true ? "PASS" : "FAIL", `(expected true, got ${test1})`);

// Test 2: Valid 6-digit license (no year)
const test2 = structuralValidatePHID_PRC("123456");
console.log("Test 2 - Valid 6-digit (123456):", test2 === true ? "PASS" : "FAIL", `(expected true, got ${test2})`);

// Test 3: Valid 7-digit with year prefix
const test3 = structuralValidatePHID_PRC("2021-1234567");
console.log("Test 3 - Valid with year (2021-1234567):", test3 === true ? "PASS" : "FAIL", `(expected true, got ${test3})`);

// Test 4: Valid 6-digit with year prefix
const test4 = structuralValidatePHID_PRC("2021-123456");
console.log("Test 4 - Valid 6-digit with year (2021-123456):", test4 === true ? "PASS" : "FAIL", `(expected true, got ${test4})`);

// Test 5: Valid with spaces as separators
const test5 = structuralValidatePHID_PRC("2021 1234567");
console.log("Test 5 - Valid with spaces (2021 1234567):", test5 === true ? "PASS" : "FAIL", `(expected true, got ${test5})`);

// Test 6: Invalid - profession category 00
const test6 = structuralValidatePHID_PRC("2021-001234");
console.log("Test 6 - Invalid profession 00 (2021-001234):", test6 === false ? "PASS" : "FAIL", `(expected false, got ${test6})`);

// Test 7: Invalid - year out of range (1899)
const test7 = structuralValidatePHID_PRC("1899-123456");
console.log("Test 7 - Invalid year 1899 (1899-123456):", test7 === false ? "PASS" : "FAIL", `(expected false, got ${test7})`);

// Test 8: Invalid - year out of range (2100)
const test8 = structuralValidatePHID_PRC("2100-123456");
console.log("Test 8 - Invalid year 2100 (2100-123456):", test8 === false ? "PASS" : "FAIL", `(expected false, got ${test8})`);

// Test 9: Invalid - too short (5 digits)
const test9 = structuralValidatePHID_PRC("12345");
console.log("Test 9 - Invalid too short (12345):", test9 === false ? "PASS" : "FAIL", `(expected false, got ${test9})`);

// Test 10: Invalid - too long (8 digits, no year)
const test10 = structuralValidatePHID_PRC("12345678");
console.log("Test 10 - Invalid too long (12345678):", test10 === false ? "PASS" : "FAIL", `(expected false, got ${test10})`);

// Test 11: Invalid - year with 5-digit license (total 9 digits)
const test11 = structuralValidatePHID_PRC("2021-12345");
console.log("Test 11 - Invalid 5-digit license (2021-12345):", test11 === false ? "PASS" : "FAIL", `(expected false, got ${test11})`);

// Test 12: Invalid - non-numeric characters
const test12 = structuralValidatePHID_PRC("2021-12345A");
console.log("Test 12 - Invalid non-numeric (2021-12345A):", test12 === false ? "PASS" : "FAIL", `(expected false, got ${test12})`);

// Test 13: Invalid - null input
const test13 = structuralValidatePHID_PRC(null);
console.log("Test 13 - Invalid null input:", test13 === false ? "PASS" : "FAIL", `(expected false, got ${test13})`);

// Test 14: Invalid - empty string
const test14 = structuralValidatePHID_PRC("");
console.log("Test 14 - Invalid empty string:", test14 === false ? "PASS" : "FAIL", `(expected false, got ${test14})`);

// Test 15: Valid - profession category 99 (boundary)
const test15 = structuralValidatePHID_PRC("9934567");
console.log("Test 15 - Valid profession 99 (9934567):", test15 === true ? "PASS" : "FAIL", `(expected true, got ${test15})`);

// Test 16: Valid - profession category 01 (boundary)
const test16 = structuralValidatePHID_PRC("0134567");
console.log("Test 16 - Valid profession 01 (0134567):", test16 === true ? "PASS" : "FAIL", `(expected true, got ${test16})`);

// Test 17: Valid - year 1900 (boundary)
const test17 = structuralValidatePHID_PRC("1900-123456");
console.log("Test 17 - Valid year 1900 (1900-123456):", test17 === true ? "PASS" : "FAIL", `(expected true, got ${test17})`);

// Test 18: Valid - year 2099 (boundary)
const test18 = structuralValidatePHID_PRC("2099-123456");
console.log("Test 18 - Valid year 2099 (2099-123456):", test18 === true ? "PASS" : "FAIL", `(expected true, got ${test18})`);

// Test 19: Invalid - 4-digit year that doesn't look like year (e.g., 0999)
const test19 = structuralValidatePHID_PRC("0999123456");
console.log("Test 19 - Invalid year 0999 (0999123456):", test19 === false ? "PASS" : "FAIL", `(expected false, got ${test19})`);

// Test 20: Valid - with dashes in year-license separator
const test20 = structuralValidatePHID_PRC("2021-12-3456");
console.log("Test 20 - Valid with mixed dashes (2021-12-3456):", test20 === true ? "PASS" : "FAIL", `(expected true, got ${test20})`);

console.log("\n=== Performance Test ===");
const iterations = 1000;
const testValue = "2021-1234567";
const startTime = process.hrtime.bigint();
for (let i = 0; i < iterations; i++) {
  structuralValidatePHID_PRC(testValue);
}
const endTime = process.hrtime.bigint();
const duration = Number(endTime - startTime) / 1000000;  // convert to milliseconds
const avgMs = duration / iterations;
console.log(`${iterations} iterations: ${duration.toFixed(2)}ms total, ${avgMs.toFixed(4)}ms average`);
console.log(`Performance target: <1ms per call - ${avgMs < 1 ? "PASS" : "FAIL"}`);

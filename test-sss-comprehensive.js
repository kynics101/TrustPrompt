// Comprehensive test for SSS validator - Task 2.1
// Tests structural validation: branch code (01-59), membership sequence, check digits (modulo 11)

function structuralValidatePHID_SSS(raw) {
  if (!raw || typeof raw !== "string") return false;
  if (!/^\d{10}$/.test(raw)) return false;

  const branchCode = parseInt(raw.slice(0, 2), 10);
  const membershipSequence = parseInt(raw.slice(2, 8), 10);
  const checkDigitStr = raw.slice(8, 10);
  const checkDigitsProvided = parseInt(checkDigitStr, 10);

  if (branchCode < 1 || branchCode > 59) return false;
  if (membershipSequence > 999999) return false;

  const digitsForChecksum = raw.slice(0, 8);
  const checksum = digitsForChecksum
    .split("")
    .reduce((acc, digit, index) => {
      const weights = [5, 4, 3, 2, 9, 8, 7, 6];
      return acc + (parseInt(digit, 10) * weights[index]);
    }, 0);

  const remainder = checksum % 11;
  let expectedCheckDigit;
  if (remainder === 0) {
    expectedCheckDigit = 0;
  } else {
    expectedCheckDigit = 11 - remainder;
  }

  const checkDigitActual = parseInt(checkDigitStr[1], 10);
  const tensPlace = parseInt(checkDigitStr[0], 10);
  
  if (expectedCheckDigit < 10) {
    return tensPlace === 0 && checkDigitActual === expectedCheckDigit;
  } else if (expectedCheckDigit === 10) {
    return checkDigitsProvided === 10;
  } else {
    return false;
  }
}

let passed = 0, failed = 0;

function test(name, result, expected) {
  if (result === expected) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name} - expected ${expected}, got ${result}`);
  }
}

console.log("=== SSS Validator Tests - Task 2.1 ===\n");

// Branch code validation tests
console.log("1. Branch Code Validation (01-59):");
test("Branch 01 (min valid) with correct check digit", structuralValidatePHID_SSS("0100000007"), true);
test("Branch 04 with correct check digit", structuralValidatePHID_SSS("0412345601"), true);
test("Branch 30 with correct check digit", structuralValidatePHID_SSS("3000000007"), true);
test("Branch 59 (max valid) with correct check digit", structuralValidatePHID_SSS("5900000005"), true);
test("Branch 00 (too low)", structuralValidatePHID_SSS("0000000000"), false);
test("Branch 60 (too high)", structuralValidatePHID_SSS("6000000000"), false);
test("Branch 99", structuralValidatePHID_SSS("9900000000"), false);

// Digit count validation tests
console.log("\n2. Digit Count Validation (exactly 10):");
test("9 digits", structuralValidatePHID_SSS("041234567"), false);
test("11 digits", structuralValidatePHID_SSS("04123456789"), false);
test("Empty string", structuralValidatePHID_SSS(""), false);

// Character type validation tests
console.log("\n3. Character Type Validation (numeric only):");
test("Alphanumeric", structuralValidatePHID_SSS("041234567A"), false);
test("With hyphens", structuralValidatePHID_SSS("04-1234567-8"), false);
test("With spaces", structuralValidatePHID_SSS("04 12345 67"), false);

// Non-string input tests
console.log("\n4. Non-String Inputs:");
test("null", structuralValidatePHID_SSS(null), false);
test("undefined", structuralValidatePHID_SSS(undefined), false);
test("number", structuralValidatePHID_SSS(1234567890), false);
test("object", structuralValidatePHID_SSS({value: "0412345601"}), false);

// Membership sequence tests
console.log("\n5. Membership Sequence (000000-999999):");
test("000000 with branch 01", structuralValidatePHID_SSS("0100000007"), true);
test("123456 with branch 04", structuralValidatePHID_SSS("0412345601"), true);
test("999999 with branch 01", structuralValidatePHID_SSS("0199999900"), true);

// Check digit calculation tests
console.log("\n6. Check Digit Calculation (modulo 11):");
test("04123456 -> check digit 01", structuralValidatePHID_SSS("0412345601"), true);
test("04123456 -> wrong check digit 78", structuralValidatePHID_SSS("0412345678"), false);

// Performance test
console.log("\n7. Performance Test:");
const iterations = 10000;
const testValue = "0412345601";
const startTime = Date.now();
for (let i = 0; i < iterations; i++) {
  structuralValidatePHID_SSS(testValue);
}
const endTime = Date.now();
const totalTime = endTime - startTime;
const avgTime = totalTime / iterations;
console.log(`  ${iterations} iterations in ${totalTime}ms (avg: ${avgTime.toFixed(4)}ms)`);
if (avgTime < 1) {
  console.log(`  ✓ Performance target met (<1ms)`);
  passed++;
} else {
  console.log(`  ✗ Performance target exceeded (>1ms)`);
  failed++;
}

// Summary
console.log("\n=== SUMMARY ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
if (failed === 0) {
  console.log("✓ ALL TESTS PASSED");
} else {
  console.log("✗ SOME TESTS FAILED");
}

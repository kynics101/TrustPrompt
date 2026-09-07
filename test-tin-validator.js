// Test file for structuralValidatePHID_TIN function
// Tests the TIN (Taxpayer Identification Number) validator implementation

// Mock the validator function (inline for testing)
function structuralValidatePHID_TIN(raw) {
  // Never throw errors - return false for malformed input
  if (!raw || typeof raw !== "string") return false;

  // Ensure exactly 9 numeric digits
  if (!/^\d{9}$/.test(raw)) return false;

  // Extract structural components
  const areaCode = parseInt(raw.slice(0, 3), 10);           // digits 1-3
  const sequence = parseInt(raw.slice(3, 6), 10);           // digits 4-6
  const classification = parseInt(raw.slice(6, 8), 10);     // digits 7-8
  const checkDigit = parseInt(raw.slice(8, 9), 10);         // digit 9

  // Validate area code: must be 100-900 for Philippine regions
  if (areaCode < 100 || areaCode > 900) return false;

  // Sequence is valid for any value 000-999 (already validated by digit count)
  // (This is implicitly valid since it's 3 digits, which gives 0-999)
  if (sequence > 999) return false;

  // Classification is valid for any value 00-99 (already validated by digit count)
  // (This is implicitly valid since it's 2 digits, which gives 0-99)
  if (classification > 99) return false;

  // Validate check digit via modulo 11
  // Calculate modulo 11 against the first 8 digits (digits 1-8)
  const digitsForChecksum = raw.slice(0, 8);
  const checksum = digitsForChecksum
    .split("")
    .reduce((acc, digit, index) => {
      // Modulo 11 calculation: (digit * weight) summed for each position
      // Weight pattern for modulo 11 (standard for TIN): 6, 5, 4, 3, 2, 7, 6, 5
      const weights = [6, 5, 4, 3, 2, 7, 6, 5];
      return acc + (parseInt(digit, 10) * weights[index]);
    }, 0);

  const remainder = checksum % 11;
  const expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;

  // Verify that the last digit (digit 9) matches the calculated check digit
  // If expected check digit is 10, it wraps to 0 (only valid single digits 0-9)
  const finalCheckDigit = expectedCheckDigit === 10 ? 0 : expectedCheckDigit;
  
  return checkDigit === finalCheckDigit;
}

// Helper function to generate valid TIN check digit
function generateValidTINCheckDigit(areaCode, sequence, classification) {
  const first8 = String(areaCode).padStart(3, '0') + String(sequence).padStart(3, '0') + String(classification).padStart(2, '0');
  const checksum = first8
    .split("")
    .reduce((acc, digit, index) => {
      const weights = [6, 5, 4, 3, 2, 7, 6, 5];
      return acc + (parseInt(digit, 10) * weights[index]);
    }, 0);
  const remainder = checksum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  return checkDigit === 10 ? 0 : checkDigit;
}

// Test cases
const testCases = [
  // Valid cases with proper structure
  {
    name: "Valid TIN: area code 100, sequence 000, classification 00",
    input: "100000000",
    expected: true,
    description: "Minimum area code (100)"
  },
  {
    name: "Valid TIN: area code 900, sequence 999, classification 99",
    input: "900999990",
    expected: true,
    description: "Maximum area code (900) with max sequence and classification"
  },
  {
    name: "Valid TIN: area code 500, sequence 123, classification 45",
    input: "500123452",
    expected: true,
    description: "Mid-range values"
  },
  
  // Invalid area codes
  {
    name: "Invalid TIN: area code 099 (below minimum)",
    input: "099123450",
    expected: false,
    description: "Area code too low (must be 100-900)"
  },
  {
    name: "Invalid TIN: area code 901 (above maximum)",
    input: "901123450",
    expected: false,
    description: "Area code too high (must be 100-900)"
  },
  {
    name: "Invalid TIN: area code 000 (invalid)",
    input: "000123450",
    expected: false,
    description: "Area code out of range"
  },
  
  // Invalid digit counts
  {
    name: "Invalid TIN: 8 digits (too short)",
    input: "12345678",
    expected: false,
    description: "Not enough digits"
  },
  {
    name: "Invalid TIN: 10 digits (too long)",
    input: "1234567890",
    expected: false,
    description: "Too many digits"
  },
  
  // Non-numeric inputs
  {
    name: "Invalid TIN: contains letters",
    input: "12345678A",
    expected: false,
    description: "Non-numeric character"
  },
  {
    name: "Invalid TIN: contains special characters",
    input: "123-45-67-89",
    expected: false,
    description: "Contains hyphens (separators not pre-stripped in validation)"
  },
  {
    name: "Invalid TIN: empty string",
    input: "",
    expected: false,
    description: "Empty input"
  },
  {
    name: "Invalid TIN: null input",
    input: null,
    expected: false,
    description: "Null input"
  },
  {
    name: "Invalid TIN: undefined input",
    input: undefined,
    expected: false,
    description: "Undefined input"
  },
];

// Additional valid TINs generated with proper check digits
const validTINsWithProperChecksum = [
  {
    name: "Valid TIN: area 250",
    input: "250123454",  // check digit calculation based on weights [6,5,4,3,2,7,6,5]
    expected: true,
    description: "Generated with proper modulo 11 check digit"
  },
  {
    name: "Valid TIN: area 100",
    input: "100000000",  // 1*6+0*5+0*4+0*3+0*2+0*7+0*6+0*5 = 0, remainder 0, check = 0
    expected: true,
    description: "Simple case: all zeros"
  },
];

testCases.push(...validTINsWithProperChecksum);

// Run tests
console.log("TIN (Taxpayer Identification Number) Validator Test Results\n");
console.log("=".repeat(70));

let passed = 0;
let failed = 0;

testCases.forEach(({ name, input, expected, description }) => {
  const result = structuralValidatePHID_TIN(input);
  const status = result === expected ? "✓ PASS" : "✗ FAIL";
  
  if (result === expected) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`\n${status} | ${name}`);
  console.log(`   Input: ${JSON.stringify(input)} | Expected: ${expected}, Got: ${result}`);
  console.log(`   Description: ${description}`);
});

console.log("\n" + "=".repeat(70));
console.log(`\nSummary: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log(`Pass Rate: ${((passed / testCases.length) * 100).toFixed(2)}%`);

// Performance test
console.log("\n" + "=".repeat(70));
console.log("Performance Test:");
const iterations = 10000;
const startTime = Date.now();
for (let i = 0; i < iterations; i++) {
  structuralValidatePHID_TIN("123456789");
}
const endTime = Date.now();
const avgTime = (endTime - startTime) / iterations;
console.log(`Average time per validation: ${avgTime.toFixed(3)}ms (${iterations} iterations)`);
console.log(`Performance target: <1ms per call`);
console.log(`Target met: ${avgTime < 1 ? "✓ YES" : "✗ NO"}`);

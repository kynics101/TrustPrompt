// Quick verification of GSIS validator logic

function structuralValidatePHID_GSIS(raw) {
  if (!raw || typeof raw !== "string") return false;
  if (!/^\d{10}$/.test(raw)) return false;

  const agencyCode = parseInt(raw.slice(0, 4), 10);
  const memberSequence = parseInt(raw.slice(4, 9), 10);
  const checkDigit = parseInt(raw.slice(9, 10), 10);

  if (agencyCode < 1 || agencyCode > 9999) return false;
  if (memberSequence > 99999) return false;

  const digitsForChecksum = raw.slice(0, 9);
  const checksum = digitsForChecksum
    .split("")
    .reduce((acc, digit) => acc + parseInt(digit, 10), 0);

  const remainder = checksum % 10;
  const expectedCheckDigit = (10 - remainder) % 10;

  return checkDigit === expectedCheckDigit;
}

// Test cases
const testCases = [
  // Valid cases
  { input: "0001234569", expected: true, reason: "Valid: agency=0001, checksum=(0+0+0+1+2+3+4+5+6)%10=1, check=(10-1)%10=9" },
  { input: "0001000009", expected: true, reason: "Valid: agency=0001, min member seq, checksum=(0+0+0+1+0+0+0+0+0)%10=1, check=9" },
  { input: "9999999999", expected: true, reason: "Valid: agency=9999, checksum=(9*9)%10=1, check=9" },
  { input: "0001999992", expected: true, reason: "Valid: agency=0001, max member, checksum=(0+0+0+1+9+9+9+9+9)%10=8, check=(10-8)%10=2" },
  
  // Invalid agency code (0000)
  { input: "0000234569", expected: false, reason: "Invalid: agency code 0000 (must be 0001-9999)" },
  
  // Invalid check digit
  { input: "0001234568", expected: false, reason: "Invalid: check digit 8 (expected 9)" },
  { input: "0001000000", expected: false, reason: "Invalid: check digit 0 (expected 9)" },
  
  // Invalid formats
  { input: "123456789", expected: false, reason: "Invalid: too short (9 digits)" },
  { input: "12345678901", expected: false, reason: "Invalid: too long (11 digits)" },
  { input: "000123456a", expected: false, reason: "Invalid: contains non-numeric" },
  { input: "", expected: false, reason: "Invalid: empty string" },
  { input: null, expected: false, reason: "Invalid: null input" },
];

console.log("GSIS Validator Verification\n");
let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = structuralValidatePHID_GSIS(test.input);
  const status = result === test.expected ? "✓ PASS" : "✗ FAIL";
  
  if (result === test.expected) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${status} | Test ${index + 1}: ${test.input}`);
  console.log(`    ${test.reason}`);
  console.log(`    Expected: ${test.expected}, Got: ${result}\n`);
});

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

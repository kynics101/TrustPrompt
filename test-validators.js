/**
 * Test the validators with your real sample IDs
 * to see why they're failing
 */

// Your sample IDs (remove hyphens for validation)
const testCases = {
  // SSS format: 31-0500213-4 → 3105002134
  sss: {
    raw: "3105002134",
    withHyphens: "31-0500213-4",
    desc: "SSS: 31-0500213-4"
  },
  // GSIS format: 31050021346 → 3105002134 (11 digits, not 10!)
  gsis: {
    raw: "31050021346",
    withHyphens: "31050021346",
    desc: "GSIS: 31050021346"
  },
  // National ID format: 3672-0413-9178-4769
  philid: {
    raw: "36720413917 84769",
    withHyphens: "3672-0413-9178-4769",
    desc: "National ID: 3672-0413-9178-4769"
  }
};

// SSS Validator (from patterns.js)
function structuralValidatePHID_SSS(raw) {
  if (!raw || typeof raw !== "string") return false;
  if (!/^\d{10}$/.test(raw)) return false;

  const branchFirst = raw.charCodeAt(0) - 48;
  const branchSecond = raw.charCodeAt(1) - 48;
  const branchCode = branchFirst * 10 + branchSecond;
  if (branchCode < 1 || branchCode > 59) return false;

  const weights = [5, 4, 3, 2, 9, 8, 7, 6];
  let checksum = 0;
  for (let i = 0; i < 8; i++) {
    checksum += (raw.charCodeAt(i) - 48) * weights[i];
  }

  const remainder = checksum % 11;
  let expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;

  const checkDigit9 = raw.charCodeAt(8) - 48;
  const checkDigit10 = raw.charCodeAt(9) - 48;
  
  if (expectedCheckDigit < 10) {
    return checkDigit9 === 0 && checkDigit10 === expectedCheckDigit;
  } else if (expectedCheckDigit === 10) {
    return checkDigit9 === 1 && checkDigit10 === 0;
  } else {
    return false;
  }
}

// GSIS Validator
function structuralValidatePHID_GSIS(raw) {
  if (!raw || typeof raw !== "string") return false;
  if (!/^\d{10}$/.test(raw)) return false;

  const agencyCode = (raw.charCodeAt(0) - 48) * 1000 +
                     (raw.charCodeAt(1) - 48) * 100 +
                     (raw.charCodeAt(2) - 48) * 10 +
                     (raw.charCodeAt(3) - 48);

  if (agencyCode < 1 || agencyCode > 9999) return false;

  let digitSum = 0;
  for (let i = 0; i < 9; i++) {
    digitSum += raw.charCodeAt(i) - 48;
  }

  const remainder = digitSum % 10;
  const expectedCheckDigit = (10 - remainder) % 10;
  const checkDigitProvided = raw.charCodeAt(9) - 48;

  return checkDigitProvided === expectedCheckDigit;
}

console.log("═══════════════════════════════════════════════════════════════");
console.log("VALIDATOR TEST: Why are your real IDs being rejected?");
console.log("═══════════════════════════════════════════════════════════════\n");

// Test SSS
console.log("SSS VALIDATOR TEST");
console.log("──────────────────────────────────────────────────────────────");
console.log(`Sample: ${testCases.sss.withHyphens}`);
console.log(`Digits only: ${testCases.sss.raw}`);
console.log(`Length: ${testCases.sss.raw.length}`);

const sssValid = structuralValidatePHID_SSS(testCases.sss.raw);
console.log(`Validation result: ${sssValid ? "✓ PASS" : "✗ FAIL"}`);

if (!sssValid) {
  console.log("\nDEBUG: Calculating expected check digit...");
  const raw = testCases.sss.raw;
  const branchCode = (raw[0] - 48) * 10 + (raw[1] - 48);
  console.log(`  Branch code (digits 1-2): ${branchCode} (must be 01-59)`);
  
  const weights = [5, 4, 3, 2, 9, 8, 7, 6];
  let checksum = 0;
  for (let i = 0; i < 8; i++) {
    const digit = raw.charCodeAt(i) - 48;
    const weight = weights[i];
    checksum += digit * weight;
    console.log(`  Digit ${i+1}: ${digit} × ${weight} = ${digit * weight}`);
  }
  console.log(`  Total checksum: ${checksum}`);
  console.log(`  Checksum % 11 = ${checksum % 11}`);
  
  const remainder = checksum % 11;
  const expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;
  const providedCheck9 = raw.charCodeAt(8) - 48;
  const providedCheck10 = raw.charCodeAt(9) - 48;
  
  console.log(`  Expected check digit: ${expectedCheckDigit}`);
  console.log(`  Provided check digits (9-10): ${providedCheck9}${providedCheck10}`);
  console.log(`  YOUR ID has check digits as "0${providedCheck10}", expected: "${expectedCheckDigit}"`);
}

console.log("\n");

// Test GSIS
console.log("GSIS VALIDATOR TEST");
console.log("──────────────────────────────────────────────────────────────");
console.log(`Sample: ${testCases.gsis.withHyphens}`);
console.log(`Digits only: ${testCases.gsis.raw}`);
console.log(`Length: ${testCases.gsis.raw.length}`);

// GSIS expects 10 digits, but sample is 11!
if (testCases.gsis.raw.length !== 10) {
  console.log(`✗ INVALID LENGTH: GSIS validator expects 10 digits, but got ${testCases.gsis.raw.length}`);
  console.log("   This is the first problem!");
} else {
  const gsisValid = structuralValidatePHID_GSIS(testCases.gsis.raw);
  console.log(`Validation result: ${gsisValid ? "✓ PASS" : "✗ FAIL"}`);
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("CONCLUSION:");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`
The validators are using STRICT CHECK DIGIT validation.
Your real IDs might not match the expected check digits because:

1. SSS expects modulo 11 check digit algorithm
2. GSIS expects modulo 10 check digit algorithm
3. If your ID's check digit doesn't match, validation fails
4. GSIS in your sample has 11 digits, validator expects 10

SOLUTION: We need to either:
A) Fix the validators to correctly calculate check digits for Philippine IDs
B) Or disable validators and rely on regex format matching (current approach)

Since your IDs are real and valid, the issue is likely that the validators
are using incorrect algorithms for Philippine ID check digit calculation.
`);

// Debug UMID validator
const fs = require('fs');
eval(fs.readFileSync('patterns.js', 'utf8'));

console.log("Debugging UMID validator");
console.log("=".repeat(60));
console.log();

const raw = "4310-5002134-6";
console.log("Input:", raw);
console.log();

// Manually walk through the validator steps
console.log("Step 1: Check if raw is string");
console.log("  raw:", raw, "typeof:", typeof raw);
console.log("  Pass:", typeof raw === "string" && raw);
console.log();

const normalized = normalizePHID(raw);
console.log("Step 2: Normalize");
console.log("  normalized:", normalized);
console.log();

console.log("Step 3: Check length");
console.log("  length:", normalized.length);
console.log("  Pass:", normalized.length === 12);
console.log();

console.log("Step 4: Check all digits");
const REGEX_12_DIGITS = /^\d{12}$/;
console.log("  matches /^\\d{12}$/:", REGEX_12_DIGITS.test(normalized));
console.log();

console.log("Step 5: Check first digit is '1'");
console.log("  normalized[0]:", normalized[0]);
console.log("  Pass:", normalized[0] === '1');
console.log();

const sssSystemCode = (normalized.charCodeAt(0) - 48) * 1000 +
                      (normalized.charCodeAt(1) - 48) * 100 +
                      (normalized.charCodeAt(2) - 48) * 10 +
                      (normalized.charCodeAt(3) - 48);
console.log("Step 6: Check SSS system code");
console.log("  code:", sssSystemCode);
console.log("  Pass:", sssSystemCode > 0 && sssSystemCode <= 1999);
console.log();

const month = (normalized.charCodeAt(4) - 48) * 10 + (normalized.charCodeAt(5) - 48);
console.log("Step 7: Check month");
console.log("  month:", month);
console.log("  Pass:", month >= 1 && month <= 12);
console.log();

console.log("Step 8: Calculate check digit");
let digitSum = 0;
for (let i = 0; i < 11; i++) {
  digitSum += normalized.charCodeAt(i) - 48;
}
console.log("  digitSum:", digitSum);

const remainder = digitSum % 10;
const expectedCheckDigit = remainder === 0 ? 0 : 10 - remainder;
const checkDigitProvided = normalized.charCodeAt(11) - 48;
console.log("  remainder:", remainder);
console.log("  expectedCheckDigit:", expectedCheckDigit);
console.log("  checkDigitProvided:", checkDigitProvided);
console.log("  Pass:", checkDigitProvided === expectedCheckDigit);
console.log();

console.log("Final result:", structuralValidatePHID_UMID(raw));

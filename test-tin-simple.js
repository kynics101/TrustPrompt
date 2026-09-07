// Simple TIN validator test - inline

function structuralValidatePHID_TIN(raw) {
  if (!raw || typeof raw !== "string") return false;
  if (!/^\d{9}$/.test(raw)) return false;

  const areaCode = parseInt(raw.slice(0, 3), 10);
  const sequence = parseInt(raw.slice(3, 6), 10);
  const classification = parseInt(raw.slice(6, 8), 10);
  const checkDigit = parseInt(raw.slice(8, 9), 10);

  if (areaCode < 100 || areaCode > 900) return false;
  if (sequence > 999) return false;
  if (classification > 99) return false;

  const digitsForChecksum = raw.slice(0, 8);
  const checksum = digitsForChecksum
    .split("")
    .reduce((acc, digit, index) => {
      const weights = [6, 5, 4, 3, 2, 7, 6, 5];
      return acc + (parseInt(digit, 10) * weights[index]);
    }, 0);

  const remainder = checksum % 11;
  const expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;
  const finalCheckDigit = expectedCheckDigit === 10 ? 0 : expectedCheckDigit;
  
  return checkDigit === finalCheckDigit;
}

// Test 1: Area code validation
console.log("Test 1: Area code validation");
console.log("  Valid: 100-900");
console.log("  structuralValidatePHID_TIN('100000000'):", structuralValidatePHID_TIN('100000000'));  // Valid area code 100
console.log("  structuralValidatePHID_TIN('900000000'):", structuralValidatePHID_TIN('900000000'));  // Valid area code 900
console.log("  structuralValidatePHID_TIN('099000000'):", structuralValidatePHID_TIN('099000000'));  // Invalid area code 099
console.log("  structuralValidatePHID_TIN('901000000'):", structuralValidatePHID_TIN('901000000'));  // Invalid area code 901

// Test 2: Digit count validation
console.log("\nTest 2: Digit count validation");
console.log("  structuralValidatePHID_TIN('12345678'):", structuralValidatePHID_TIN('12345678'));    // 8 digits
console.log("  structuralValidatePHID_TIN('1234567890'):", structuralValidatePHID_TIN('1234567890'));// 10 digits
console.log("  structuralValidatePHID_TIN('123456789'):", structuralValidatePHID_TIN('123456789'));  // 9 digits

// Test 3: Non-numeric
console.log("\nTest 3: Non-numeric inputs");
console.log("  structuralValidatePHID_TIN('12345678A'):", structuralValidatePHID_TIN('12345678A'));  // Letter
console.log("  structuralValidatePHID_TIN(''):", structuralValidatePHID_TIN(''));                     // Empty
console.log("  structuralValidatePHID_TIN(null):", structuralValidatePHID_TIN(null));                // Null

// Test 4: Modulo 11 check digit calculation
console.log("\nTest 4: Modulo 11 check digit");
// For 12345678:
// (1*6 + 2*5 + 3*4 + 4*3 + 5*2 + 6*7 + 7*6 + 8*5) % 11
// = (6 + 10 + 12 + 12 + 10 + 42 + 42 + 40) % 11
// = 174 % 11 = 9
// remainder = 9, expected check digit = 11 - 9 = 2
// So valid TIN would be "123456782"
console.log("  Testing TIN 123456782 (with calculated check digit 2):");
console.log("  structuralValidatePHID_TIN('123456782'):", structuralValidatePHID_TIN('123456782'));

// Manual calculation for reference:
console.log("\n  Manual calculation for 12345678:");
const first8 = "12345678";
const weights = [6, 5, 4, 3, 2, 7, 6, 5];
let sum = 0;
for (let i = 0; i < 8; i++) {
  sum += parseInt(first8[i]) * weights[i];
}
const remainder = sum % 11;
const expectedCheck = remainder === 0 ? 0 : 11 - remainder;
const finalCheck = expectedCheck === 10 ? 0 : expectedCheck;
console.log(`  Sum: ${sum}, Remainder: ${remainder}, Expected check digit: ${expectedCheck}, Final: ${finalCheck}`);

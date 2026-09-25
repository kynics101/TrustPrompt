// Test SSS checksum for "31-0500213-4"
const sssNum = "3105002134";

console.log("SSS Number:", sssNum);
console.log("Digits:", sssNum.split(''));
console.log();

// Branch code (first 2 digits)
const branch = parseInt(sssNum.substring(0, 2));
console.log("Branch code (01-59):", branch);
console.log("Branch valid?:", branch >= 1 && branch <= 59);
console.log();

// Membership sequence (digits 3-8)
const membership = sssNum.substring(2, 8);
console.log("Membership sequence (digits 3-8):", membership);
console.log();

// Check digits (digits 9-10)
const checkDigits = sssNum.substring(8, 10);
console.log("Check digits (digits 9-10):", checkDigits);
console.log();

// Calculate expected check digit using modulo 11
// Weights: [5, 4, 3, 2, 9, 8, 7, 6]
const weights = [5, 4, 3, 2, 9, 8, 7, 6];
const digitsOnly = sssNum.substring(0, 8);  // First 8 digits
let checksum = 0;
for (let i = 0; i < 8; i++) {
  const digit = parseInt(digitsOnly[i]);
  const weight = weights[i];
  const product = digit * weight;
  checksum += product;
  console.log(`Digit ${i+1}: ${digit} × ${weight} = ${product}`);
}

console.log();
console.log("Checksum total:", checksum);
console.log("Checksum % 11 = ", checksum % 11);

const remainder = checksum % 11;
let expectedCheckDigit;
if (remainder === 0) {
  expectedCheckDigit = 0;
} else {
  expectedCheckDigit = 11 - remainder;
}

console.log("Remainder:", remainder);
console.log("Expected check digit:", expectedCheckDigit);
console.log();

const checkDigit9 = parseInt(checkDigits[0]);
const checkDigit10 = parseInt(checkDigits[1]);

console.log("Provided check digit 9:", checkDigit9);
console.log("Provided check digit 10:", checkDigit10);
console.log();

if (expectedCheckDigit < 10) {
  console.log(`Expected format: 0${expectedCheckDigit}`);
  console.log(`Provided format: ${checkDigits}`);
  console.log(`Match?:`, checkDigit9 === 0 && checkDigit10 === expectedCheckDigit);
} else if (expectedCheckDigit === 10) {
  console.log(`Expected format: 10`);
  console.log(`Provided format: ${checkDigits}`);
  console.log(`Match?:`, checkDigit9 === 1 && checkDigit10 === 0);
}

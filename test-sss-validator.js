// Load patterns.js to test SSS validator
const fs = require('fs');
const patternsCode = fs.readFileSync('patterns.js', 'utf8');

// Extract and run the normalizePHID and structuralValidatePHID_SSS functions
eval(patternsCode);

console.log("Testing SSS validator with hyphenated format");
console.log("=".repeat(60));

// Test cases
const testCases = [
  { input: "31-0500213-4", expected: true, desc: "Valid SSS with hyphens" },
  { input: "3105002134", expected: true, desc: "Valid SSS without hyphens" },
  { input: "10-5002134-6", expected: false, desc: "Invalid SSS (last 10 of UMID)" },
];

testCases.forEach(tc => {
  const result = structuralValidatePHID_SSS(tc.input);
  const status = result === tc.expected ? "✓ PASS" : "✗ FAIL";
  console.log(`${status}: "${tc.input}" → ${result} (expected ${tc.expected})`);
  console.log(`      ${tc.desc}`);
  console.log();
});

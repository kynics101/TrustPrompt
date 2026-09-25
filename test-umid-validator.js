// Test UMID validator
const fs = require('fs');
eval(fs.readFileSync('patterns.js', 'utf8'));

console.log("Testing UMID validator");
console.log("=".repeat(60));
console.log();

const testCases = [
  { input: "4310-5002134-6", expected: true, desc: "Valid UMID with hyphens" },
  { input: "431050021346", expected: true, desc: "Valid UMID without hyphens" },
];

testCases.forEach(tc => {
  const result = structuralValidatePHID_UMID(tc.input);
  const status = result === tc.expected ? "✓ PASS" : "✗ FAIL";
  console.log(`${status}: "${tc.input}"`);
  console.log(`      Result: ${result}, Expected: ${tc.expected}`);
  console.log(`      ${tc.desc}`);
  console.log();
});

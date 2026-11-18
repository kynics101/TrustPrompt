// Test the scanner with the age_value question
require('./normalizer.js');  // Load normalizer first
require('./gazetteer.js');   // Load gazetteer
require('./patterns.js');    // Load patterns
const TrustScanner = require('./scanner.js');

const testText = "What's the average height and weight of a 25 year old Filipino male?";

console.log("Running scanner on:", testText);
console.log("---");

const result = TrustScanner.scan(testText);

console.log("---");
console.log("Total findings:", result.findings.length);
result.findings.forEach(f => {
  console.log(`- ${f.patternId}: "${f.rawMatch}" (risk: ${f.risk})`);
});

// Look specifically for age_value findings
const ageFindings = result.findings.filter(f => f.patternId === "age_value");
console.log("\nAge-related findings:", ageFindings.length);
ageFindings.forEach(f => {
  console.log(`- "${f.rawMatch}"`);
});

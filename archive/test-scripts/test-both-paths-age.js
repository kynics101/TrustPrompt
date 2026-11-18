// Test both Path A and Path B for the age_value case
require('./terms-medical.js');
require('./terms-financial.js');
require('./terms-organizations.js');
require('./normalizer.js');
require('./gazetteer.js');
require('./patterns.js');
const TrustScanner = require('./scanner.js');

const testText = "What's the average height and weight of a 25 year old Filipino male?";

console.log("======================================");
console.log("Testing BOTH Paths for age_value");
console.log("======================================");
console.log("Input:", testText);
console.log("");

// Run full scan
const result = TrustScanner.scan(testText);

console.log("RESULTS:");
console.log("========");
console.log("Total findings:", result.findings.length);
console.log("");

// Show ALL findings, not just age_value
console.log("All findings:");
result.findings.forEach((f, idx) => {
  console.log(`${idx + 1}. ${f.patternId} (${f.source}): "${f.rawMatch}" - risk: ${f.risk}`);
});

console.log("");

// Look specifically for age_value
const ageFindings = result.findings.filter(f => f.patternId === "age_value");
console.log("Age-value findings:", ageFindings.length);
if (ageFindings.length > 0) {
  ageFindings.forEach(f => {
    console.log("  - rawMatch:", f.rawMatch);
    console.log("    source:", f.source);
    console.log("    risk:", f.risk);
  });
}

console.log("");
console.log("Expected: 0 age_value findings (should be SUPPRESSED by contextFilter)");
console.log("Actual:", ageFindings.length, "age_value findings");

if (ageFindings.length === 0) {
  console.log("\n✓ PASS - No false positive!");
} else {
  console.log("\n✗ FAIL - False positive detected!");
}

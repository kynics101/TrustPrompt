// Test with the EXACT input from AB-FP-2 dataset entry
require('./terms-medical.js');
require('./terms-financial.js');
require('./terms-organizations.js');
require('./normalizer.js');
require('./gazetteer.js');
require('./validator-wrapper.js');
require('./linguistic-detector-refactored.js');
require('./patterns.js');
const TrustScanner = require('./scanner.js');

// EXACT input from your dataset (with typos preserved)
const testText = "Whats the average hieght and weight of a 25 year old filpino mal? Pls explain in a tabel.";

console.log("════════════════════════════════════════════════════════════════");
console.log("Testing EXACT Dataset Entry: AB-FP-2");
console.log("════════════════════════════════════════════════════════════════\n");
console.log("Input text:");
console.log(`"${testText}"\n`);
console.log("Expected: Should NOT flag (no risk detected)");
console.log("Current: ???\n");

const result = TrustScanner.scan(testText);

console.log("────────────────────────────────────────────────────────────────");
console.log("RESULTS:");
console.log("────────────────────────────────────────────────────────────────");
console.log("Total findings:", result.findings ? result.findings.length : 0);

if (result.findings && result.findings.length > 0) {
  console.log("\nFindings detected:");
  result.findings.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.patternId}] "${f.rawMatch}" (risk: ${f.risk}, source: ${f.source})`);
  });
  
  const ageFindings = result.findings.filter(f => f.patternId === "age_value");
  console.log(`\nAge-value findings: ${ageFindings.length}`);
  if (ageFindings.length > 0) {
    ageFindings.forEach(f => console.log(`  - "${f.rawMatch}"`));
  }
  
  console.log("\nStatus: ✗ FAIL - False positive detected");
} else {
  console.log("No findings detected");
  console.log("Status: ✓ PASS - Correctly suppressed");
}

console.log("\nRisk Level:", result.riskLevel || "none");

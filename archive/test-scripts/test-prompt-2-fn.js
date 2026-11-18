// Test Prompt 2 - False Negative case
require('./terms-medical.js');
require('./terms-financial.js');
require('./terms-organizations.js');
require('./normalizer.js');
require('./gazetteer.js');
require('./validator-wrapper.js');
require('./linguistic-detector-refactored.js');
require('./patterns.js');
const TrustScanner = require('./scanner.js');

const testText = `I've been putting off a routine health checkup for ages and I finally want to book one, but I'm not sure which screenings are even relevant for me yet. I am 34 years old and generally healthy — based on that, which standard check-ups would you say are worth asking my doctor about at this stage of life?`;

console.log("════════════════════════════════════════════════════════════════");
console.log("Testing FALSE NEGATIVE: Prompt 2 - Should flag age but doesn't");
console.log("════════════════════════════════════════════════════════════════\n");
console.log("Input text:");
console.log(`"${testText.substring(0, 100)}..."\n`);
console.log("Expected: SHOULD flag age_value (personal disclosure: 'I am 34 years old')");
console.log("Current: ???\n");

const result = TrustScanner.scan(testText);

console.log("────────────────────────────────────────────────────────────────");
console.log("RESULTS:");
console.log("────────────────────────────────────────────────────────────────");
console.log("Total findings:", result.findings ? result.findings.length : 0);

if (result.findings && result.findings.length > 0) {
  console.log("\nFindings detected:");
  result.findings.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.patternId}] "${f.rawMatch}" (risk: ${f.risk})`);
  });
  
  const ageFindings = result.findings.filter(f => f.patternId === "age_value");
  console.log(`\nAge-value findings: ${ageFindings.length}`);
  if (ageFindings.length > 0) {
    console.log("Status: ✓ GOOD - Age detected correctly");
  } else {
    console.log("Status: ✗ FAIL - Missing age detection (FALSE NEGATIVE)");
  }
} else {
  console.log("No findings detected");
  console.log("Status: ✗ FAIL - Should have flagged age_value as personal disclosure");
}

console.log("\nRisk Level:", result.riskLevel || "none");

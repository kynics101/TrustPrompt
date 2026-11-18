// Simple age context test - without linguistic detector
require('./terms-medical.js');
require('./terms-financial.js');
require('./terms-organizations.js');
require('./normalizer.js');
require('./gazetteer.js');
require('./validator-wrapper.js');
require('./patterns.js');
const TrustScanner = require('./scanner.js');

// Disable PATH C by preventing TrustLinguisticDetector from being available
globalThis.TrustLinguisticDetector = undefined;

let prompt1Pass = false;
let prompt2Pass = false;

console.log("═══════════════════════════════════════════════════════════════");
console.log("PROMPT 1 TEST (FP) - Should NOT flag age in general question");
console.log("═══════════════════════════════════════════════════════════════\n");

const prompt1 = "Whats the average hieght and weight of a 25 year old filpino mal? Pls explain in a tabel.";
console.log(`Input: "${prompt1}"\n`);

try {
  const result1 = TrustScanner.scan(prompt1);
  const findings1 = result1 && result1.findings ? result1.findings : [];
  const ageFindings1 = findings1.filter(f => f.patternId === 'age_value');
  
  console.log(`Result: ${findings1.length} total findings, ${ageFindings1.length} age findings`);
  if (ageFindings1.length === 0) {
    console.log("✓ PASS - Correctly suppressed age in general context\n");
    prompt1Pass = true;
  } else {
    console.log("✗ FAIL - Should NOT have flagged age in general question\n");
    prompt1Pass = false;
  }
} catch (e) {
  console.log(`✗ ERROR in Prompt 1: ${e.message}\n`);
  prompt1Pass = false;
}

console.log("═══════════════════════════════════════════════════════════════");
console.log("PROMPT 2 TEST (FN) - SHOULD flag age in personal disclosure");
console.log("═══════════════════════════════════════════════════════════════\n");

const prompt2 = `I've been putting off a routine health checkup for ages and I finally want to book one, but I'm not sure which screenings are even relevant for me yet. I am 34 years old and generally healthy — based on that, which standard check-ups would you say are worth asking my doctor about at this stage of life?`;
console.log(`Input: "${prompt2.substring(0, 80)}..."\n`);

try {
  const result2 = TrustScanner.scan(prompt2);
  const findings2 = result2 && result2.findings ? result2.findings : [];
  const ageFindings2 = findings2.filter(f => f.patternId === 'age_value');

  console.log(`Result: ${findings2.length} total findings, ${ageFindings2.length} age findings`);
  if (ageFindings2.length > 0) {
    console.log("✓ PASS - Correctly detected age in personal disclosure\n");
    ageFindings2.forEach((f, idx) => {
      console.log(`  ${idx + 1}. "${f.rawMatch}" (risk: ${f.risk})`);
    });
    prompt2Pass = true;
  } else {
    console.log("✗ FAIL - Should have flagged age in personal disclosure\n");
    prompt2Pass = false;
  }
} catch (e) {
  console.log(`✗ ERROR in Prompt 2: ${e.message}\n`);
  prompt2Pass = false;
}

console.log("═══════════════════════════════════════════════════════════════");
console.log("SUMMARY");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`Prompt 1 (FP suppress): ${prompt1Pass ? '✓ PASS' : '✗ FAIL'}`);
console.log(`Prompt 2 (FN detect):   ${prompt2Pass ? '✓ PASS' : '✗ FAIL'}`);
console.log(`Overall: ${prompt1Pass && prompt2Pass ? '✓✓ BOTH PASS' : '✗ ONE OR MORE FAILED'}`);

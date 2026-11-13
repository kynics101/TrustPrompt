// Test all three user prompts
require('./terms-medical.js');
require('./terms-financial.js');
require('./terms-organizations.js');
require('./normalizer.js');
require('./gazetteer.js');
require('./validator-wrapper.js');
require('./patterns.js');
const TrustScanner = require('./scanner.js');

// Disable PATH C
globalThis.TrustLinguisticDetector = undefined;

console.log("═══════════════════════════════════════════════════════════════\n");

const prompts = [
  {
    name: "Prompt 1 (Work Experience)",
    text: "I'm updating my résumé summary and want it to sound confident without exaggerating. I have worked 20 years in logistics and supply-chain roles, and I'd like a two-sentence professional summary that highlights that experience. Could you draft something polished I can drop straight into the top of my CV?",
    should: "NOT detect",
    reason: "20 years refers to work experience, not age"
  },
  {
    name: "Prompt 2 (Personal Age)",
    text: "I've been putting off a routine health checkup for ages and I finally want to book one, but I'm not sure which screenings are even relevant for me yet. I am 34 years old and generally healthy — based on that, which standard check-ups would you say are worth asking my doctor about at this stage of life?",
    should: "DETECT 34",
    reason: "Personal age disclosure: 'I am 34 years old'"
  },
  {
    name: "Prompt 3 (General Question)",
    text: "Whats the avrage hieght and wieght of a 25 year old filipno mal? Pls explain in a tabel.",
    should: "NOT detect",
    reason: "General demographic question, not personal disclosure"
  }
];

prompts.forEach((prompt, idx) => {
  console.log(`\n${prompt.name.toUpperCase()}`);
  console.log(`Should: ${prompt.should}`);
  console.log(`Reason: ${prompt.reason}`);
  console.log(`Input: "${prompt.text.substring(0, 70)}..."\n`);
  
  try {
    const result = TrustScanner.scan(prompt.text);
    const findings = result && result.findings ? result.findings : [];
    const ageFindings = findings.filter(f => f.patternId === 'age_value');
    
    console.log(`Found: ${findings.length} total, ${ageFindings.length} age findings`);
    
    if (ageFindings.length > 0) {
      ageFindings.forEach(f => {
        console.log(`  - "${f.rawMatch}"`);
      });
    }
    
    let status = "?";
    if (prompt.should.includes("NOT") && ageFindings.length === 0) {
      status = "✓ PASS";
    } else if (prompt.should.includes("NOT") && ageFindings.length > 0) {
      status = "✗ FAIL (false positive)";
    } else if (prompt.should.includes("DETECT") && ageFindings.length > 0) {
      status = "✓ PASS";
    } else if (prompt.should.includes("DETECT") && ageFindings.length === 0) {
      status = "✗ FAIL (false negative)";
    }
    
    console.log(`Result: ${status}\n`);
  } catch (e) {
    console.log(`ERROR: ${e.message}\n`);
  }
});

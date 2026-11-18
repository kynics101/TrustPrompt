// test-path-b-card-edge-cases.js
// Test edge cases to ensure the fix doesn't break valid detections

// Mock minimal dependencies
global.PH_ADDRESS_DB = {
  matchesAny: (str) => false
};

// Mock term data
global.MEDICAL_TERMS_DATA = ["diabetes"];
global.FINANCIAL_TERMS_DATA = ["account", "transaction"];
global.ORGANIZATIONS_DATA = [];

// Define test cards
const OFFICIAL_TEST_CARDS = new Set([
  "4111111111111111",
  "5500000000000004",
  "378282246310005",
]);
global.OFFICIAL_TEST_CARDS = OFFICIAL_TEST_CARDS;

// Load modules
require('./normalizer.js');
require('./gazetteer.js');

const TrustNormalizer = global.TrustNormalizer;
const TrustGazetteer = global.TrustGazetteer;

console.log("\n" + "=".repeat(80));
console.log("PATH B EDGE CASES TEST");
console.log("=".repeat(80));

const testCases = [
  {
    name: "Non-financial trigger with test card",
    text: "The test card 4111111111111111 is for Stripe",
    shouldFlag: false,
    reason: "No financial trigger phrase - test card is context"
  },
  {
    name: "Financial trigger with partial test card",
    text: "my card number is 41111111",
    shouldFlag: true,
    reason: "Not a complete test card - should flag"
  },
  {
    name: "Multiple spaces in card number",
    text: "my card number is 4111    1111    1111    1111",
    shouldFlag: false,
    reason: "Test card with extra spaces - should normalize and suppress"
  },
  {
    name: "American Express test card",
    text: "my card number is 378282246310005",
    shouldFlag: false,
    reason: "Official Amex test card - should suppress"
  },
  {
    name: "Health condition (sanity check)",
    text: "i have diabetes",
    shouldFlag: true,
    reason: "Medical term with trigger - should flag"
  }
];

let passed = 0;
let failed = 0;

for (const test of testCases) {
  console.log(`\n📌 ${test.name}`);
  console.log(`   Input: "${test.text.substring(0, 60)}${test.text.length > 60 ? '...' : ''}"`);
  console.log(`   Expected: ${test.shouldFlag ? "FLAGGED" : "NOT flagged"}`);
  console.log(`   Reason: ${test.reason}`);
  
  try {
    const normalized = TrustNormalizer.normalizePath_B(test.text);
    const findings = TrustGazetteer.scan(normalized);
    
    const isFlagged = findings.length > 0;
    const status = isFlagged === test.shouldFlag ? "✅ PASS" : "❌ FAIL";
    
    console.log(`   Result: ${status} - ${isFlagged ? "FLAGGED" : "NOT flagged"}`);
    
    if (isFlagged) {
      console.log(`   Findings: ${findings.map(f => f.label).join(", ")}`);
    }
    
    if (isFlagged === test.shouldFlag) {
      passed++;
    } else {
      failed++;
    }
    
  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`);
    failed++;
  }
}

console.log("\n" + "=".repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(80) + "\n");

process.exit(failed > 0 ? 1 : 0);

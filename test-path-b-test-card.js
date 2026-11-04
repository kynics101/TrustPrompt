// test-path-b-test-card.js
// Verify that Path B no longer flags test card numbers

// Mock minimal dependencies BEFORE loading gazetteer
global.PH_ADDRESS_DB = {
  matchesAny: (str) => false  // Stub
};

// Mock term data
global.MEDICAL_TERMS_DATA = [
  "diabetes", "hypertension", "fever", "asthma", "menstruation"
];

global.FINANCIAL_TERMS_DATA = [
  "account", "transaction", "deposit", "withdrawal", "balance"
];

global.ORGANIZATIONS_DATA = [];

// Define test cards (like patterns.js does)
const OFFICIAL_TEST_CARDS = new Set([
  "4111111111111111",        // Stripe Visa test
  "5500000000000004",        // Stripe Mastercard test
  "378282246310005",         // Stripe Amex test
]);

// Inject into global scope
global.OFFICIAL_TEST_CARDS = OFFICIAL_TEST_CARDS;

// Now load gazetteer and normalizer
require('./normalizer.js');
require('./gazetteer.js');

const TrustGazetteer = global.TrustGazetteer;
const TrustNormalizer = global.TrustNormalizer;

console.log("\n" + "=".repeat(80));
console.log("PATH B TEST CARD DETECTION TEST");
console.log("=".repeat(80));

const testCases = [
  {
    name: "Test card with spaces (Stripe Visa)",
    text: "my card number is 4111 1111 1111 1111",
    shouldFlag: false,
    reason: "Official Stripe test card - should NOT be flagged"
  },
  {
    name: "Test card without spaces (Stripe Visa)",
    text: "my card number is 4111111111111111",
    shouldFlag: false,
    reason: "Official Stripe test card - should NOT be flagged"
  },
  {
    name: "Test card with hyphens (Stripe Visa)",
    text: "my card number is 4111-1111-1111-1111",
    shouldFlag: false,
    reason: "Official Stripe test card - should NOT be flagged"
  },
  {
    name: "Real-looking card number",
    text: "my card number is 4532123456789123",
    shouldFlag: true,
    reason: "Non-test card number - SHOULD be flagged"
  },
  {
    name: "Stripe Mastercard test",
    text: "my card number is 5500 0000 0000 0004",
    shouldFlag: false,
    reason: "Official Stripe test card - should NOT be flagged"
  }
];

for (const test of testCases) {
  console.log(`\n📌 ${test.name}`);
  console.log(`   Input: "${test.text}"`);
  console.log(`   Expected: ${test.shouldFlag ? "FLAGGED" : "NOT flagged"}`);
  console.log(`   Reason: ${test.reason}`);
  
  try {
    // Normalize path B
    const normalized = TrustNormalizer.normalizePath_B(test.text);
    console.log(`   Normalized: "${normalized}"`);
    
    // Scan with gazetteer (Path B)
    const findings = TrustGazetteer.scan(normalized);
    
    const isFlagged = findings.some(f => f.category === "financial" || f.label?.includes("Financial"));
    const status = isFlagged === test.shouldFlag ? "✅ PASS" : "❌ FAIL";
    
    console.log(`   Result: ${status} - ${isFlagged ? "FLAGGED" : "NOT flagged"}`);
    
    if (isFlagged) {
      console.log(`   Findings:`, findings.map(f => `${f.label}: "${f.rawMatch}"`).join(", "));
    }
    
  } catch (error) {
    console.error(`   ❌ ERROR: ${error.message}`);
  }
}

console.log("\n" + "=".repeat(80));
console.log("TEST COMPLETE");
console.log("=".repeat(80) + "\n");

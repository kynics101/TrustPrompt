// Simple test to check if trigger phrases are being matched

global.MEDICAL_TERMS_DATA = [];
global.FINANCIAL_TERMS_DATA = [];
global.ORGANIZATIONS_DATA = [];
global.PH_ADDRESS_DB = {};

console.log("Loading gazetteer...\n");
require('./gazetteer.js');

const testText1 = "my number is 09171234567";
const testText2 = "server is 192.168.1.1";

console.log("Test 1: '" + testText1 + "'");
const result1 = TrustGazetteer.scan(testText1);
console.log("  Findings:", result1.length);
if (result1.length > 0) {
  result1.forEach(f => {
    console.log(`    - ${f.patternId}: ${f.rawMatch}`);
  });
}

console.log("\nTest 2: '" + testText2 + "'");
const result2 = TrustGazetteer.scan(testText2);
console.log("  Findings:", result2.length);
if (result2.length > 0) {
  result2.forEach(f => {
    console.log(`    - ${f.patternId}: ${f.rawMatch}`);
  });
}

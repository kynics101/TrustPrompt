// Test to verify UMID is detected correctly and not flagged as international phone or PRC

// Patterns to test
const umidPattern = /\b\d{4}-\d{7}-\d\b/g;
const prcPattern = /(?<!\d-)\b\d{7}\b(?!-\d)/g;

const testValue = "4310-5002134-6";

console.log("Testing UMID Detection Fix\n");
console.log("-----------------------------------\n");

// Test UMID pattern (should match)
const umidMatches = testValue.match(umidPattern);
console.log("✓ UMID Pattern Test");
console.log(`  Pattern: ${umidPattern.source}`);
console.log(`  Value: "${testValue}"`);
console.log(`  Matches: ${umidMatches ? "YES - " + umidMatches.join(", ") : "NO"}`);
console.log(`  Expected: YES (UMID should match)`);
console.log(`  Status: ${umidMatches ? "✓ PASS" : "✗ FAIL"}`);
console.log("");

// Test PRC pattern (should NOT match the middle 5002134)
const prcMatches = testValue.match(prcPattern);
console.log("✓ PRC Pattern Test");
console.log(`  Pattern: ${prcPattern.source}`);
console.log(`  Value: "${testValue}"`);
console.log(`  Matches: ${prcMatches ? "YES - " + prcMatches.join(", ") : "NO"}`);
console.log(`  Expected: NO (PRC should NOT match UMID's middle digits)`);
console.log(`  Status: ${!prcMatches ? "✓ PASS" : "✗ FAIL"}`);
console.log("");

// Test standalone 7-digit numbers (PRC should match these)
const standaloneTests = [
  { value: "1234567", shouldMatch: true, label: "Standalone 7-digit PRC" },
  { value: "5002134", shouldMatch: true, label: "Standalone 7-digit number" },
];

console.log("✓ PRC Pattern Standalone Tests");
standaloneTests.forEach(test => {
  const prcStandaloneMatches = test.value.match(prcPattern);
  const matched = prcStandaloneMatches ? true : false;
  const status = matched === test.shouldMatch ? "✓ PASS" : "✗ FAIL";
  console.log(`  ${status} | "${test.value}" - ${test.label}`);
  console.log(`    Expected: ${test.shouldMatch ? "match" : "no match"} | Got: ${matched ? "match" : "no match"}`);
});

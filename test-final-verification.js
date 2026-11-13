const patterns = require('./patterns.js').TRUSTPROMPT_PATTERNS;

// Test 1: Pedro Ramos breach profile - should DETECT height and weight
const text1 = "Name: Pedro Ramos, Engineer at Meralco, 6 ft, 80 kg, Catholic, bank loan ₱500,000, email pedro@example.com.";

// Test 2: Shipping note - should SUPPRESS weight
const text2 = "SUMMARIZE THIS SHIPPING NOTE: ORDER 4111111111111112 SHIPPED ON 03-14-1998 TO WAREHOUSE B. THE PARCEL HAS 5 KG OF TYPE O RICE PLUS A LOAN APPLICATION FORM.";

console.log("╔════════════════════════════════════════════════════════════════════╗");
console.log("║           FINAL VERIFICATION - HEIGHT/WEIGHT DETECTION             ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

function testPatternDirectly(patternId, text) {
  const pattern = patterns.find(p => p.id === patternId);
  if (!pattern || !pattern.regex) return null;

  pattern.regex.lastIndex = 0;
  const match = pattern.regex.exec(text);
  if (!match) return null;

  if (pattern.contextFilter) {
    const shouldAllow = pattern.contextFilter(match[0], text, match.index);
    return shouldAllow;
  }
  return true;
}

// TEST 1
console.log("TEST 1: Breach Profile (Pedro Ramos)");
console.log("─".repeat(70));
console.log(`Input: ${text1.substring(0, 75)}...`);
console.log();

const height1 = testPatternDirectly('height_mention', text1);
const weight1 = testPatternDirectly('weight_mention', text1);

console.log(`✓ Height (6 ft):    ${height1 === true ? 'DETECTED ✓' : height1 === false ? 'SUPPRESSED ✗' : 'NOT FOUND'}`);
console.log(`✓ Weight (80 kg):   ${weight1 === true ? 'DETECTED ✓' : weight1 === false ? 'SUPPRESSED ✗' : 'NOT FOUND'}`);

if (height1 === true && weight1 === true) {
  console.log(`\n✓✓✓ TEST 1 PASSED - Both height and weight detected`);
} else {
  console.log(`\n✗✗✗ TEST 1 FAILED`);
}

console.log("\n");

// TEST 2
console.log("TEST 2: Shipping Note");
console.log("─".repeat(70));
console.log(`Input: ${text2.substring(0, 75)}...`);
console.log();

const weight2 = testPatternDirectly('weight_mention', text2);

console.log(`✓ Weight (5 KG):    ${weight2 === true ? 'DETECTED ✗' : weight2 === false ? 'SUPPRESSED ✓' : 'NOT FOUND'}`);

if (weight2 === false) {
  console.log(`\n✓✓✓ TEST 2 PASSED - Weight correctly suppressed in shipping context`);
} else {
  console.log(`\n✗✗✗ TEST 2 FAILED`);
}

console.log("\n");
console.log("╔════════════════════════════════════════════════════════════════════╗");
if (height1 === true && weight1 === true && weight2 === false) {
  console.log("║                    ✓ ALL TESTS PASSED ✓                          ║");
} else {
  console.log("║                    ✗ SOME TESTS FAILED ✗                         ║");
}
console.log("╚════════════════════════════════════════════════════════════════════╝");

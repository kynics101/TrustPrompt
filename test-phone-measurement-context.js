/**
 * test-phone-measurement-context.js
 * 
 * Test suite for the extended measurement context detection that applies to:
 * - phone_intl patterns
 * - ph_mobile patterns
 * 
 * This validates that phone numbers appearing in measurement/conversion contexts
 * are not flagged as risky PII.
 * 
 * Examples:
 * - "turn 09098340056 grams into tons" → NOT flagged
 * - "call me at 09098340056" → FLAGGED
 */

// Mock implementation of isMeasurementContext
function isMeasurementContext(rawMatch, fullText, matchIndex) {
  // Measurement unit keywords that commonly follow numeric values
  const unitPatterns = [
    /\b(grams?|ounces?|pounds?|kilograms?|kg|lb|oz)\b/i,
    /\b(milliliters?|liters?|ml|l|gallons?|cups?|tablespoons?|teaspoons?)\b/i,
    /\b(meters?|kilometers?|miles?|feet|yards?|inches?|cm|mm|km|mi)\b/i,
    /\b(seconds?|minutes?|hours?|days?|weeks?|months?|years?|ms|sec|min|hr)\b/i,
    /\b(watts?|volts?|amperes?|hertz|Hz|MHz|GHz|W|V|A)\b/i,
    /\b(celsius|fahrenheit|degrees?|°C|°F)\b/i,
    /\b(bytes?|kilobytes?|megabytes?|gigabytes?|kb|mb|gb|bits?)\b/i,
    /\b(rpm|mph|kph|m\/s|km\/h)\b/i,
  ];

  // Action verbs that indicate unit conversion
  const conversionActions = [
    /\b(convert|turn|transform|change|translate|into|to)\b/i,
  ];

  // Look around the match for context
  const beforeStart = Math.max(0, matchIndex - 100);
  const beforeText = fullText.slice(beforeStart, matchIndex);
  
  const afterStart = matchIndex + rawMatch.length;
  const afterText = fullText.slice(afterStart, Math.min(fullText.length, afterStart + 100));
  
  const fullContext = beforeText + " [NUMBER] " + afterText;
  const contextLower = fullContext.toLowerCase();

  // Check if conversion action is mentioned
  const hasConversionAction = conversionActions.some(pattern => pattern.test(contextLower));
  
  // Check if any unit pattern appears
  const hasUnitPattern = unitPatterns.some(pattern => pattern.test(contextLower));
  
  // If both conversion action AND units are present, or just units after
  if ((hasConversionAction && hasUnitPattern) || unitPatterns.some(pattern => pattern.test(afterText))) {
    return true;
  }

  return false;
}

// Test cases
const testCases = [
  // MEASUREMENT CONTEXTS (should be filtered as safe, NOT flagged)
  {
    name: "Philippine number in unit conversion (grams to tons)",
    text: "turn 09098340056 grams into tons",
    number: "09098340056",
    shouldBeSafe: true,
    description: "Number in measurement conversion context"
  },
  {
    name: "Convert value from kilograms to pounds",
    text: "convert 09098340056 kilograms into pounds",
    number: "09098340056",
    shouldBeSafe: true,
    description: "Conversion action with metric units"
  },
  {
    name: "International format number in measurement",
    text: "Transform +639098340056 milliliters into liters",
    number: "+639098340056",
    shouldBeSafe: true,
    description: "International format number in measurement"
  },
  {
    name: "Number with distance conversion",
    text: "turn 09098340056 meters into kilometers",
    number: "09098340056",
    shouldBeSafe: true,
    description: "Distance unit conversion"
  },
  {
    name: "Number with time conversion",
    text: "convert 09098340056 seconds to hours",
    number: "09098340056",
    shouldBeSafe: true,
    description: "Time unit conversion"
  },
  {
    name: "Number with temperature",
    text: "convert 09098340056 celsius to fahrenheit",
    number: "09098340056",
    shouldBeSafe: true,
    description: "Temperature conversion"
  },
  {
    name: "Number with data storage",
    text: "transform 09098340056 megabytes to gigabytes",
    number: "09098340056",
    shouldBeSafe: true,
    description: "Data storage unit conversion"
  },

  // CONTACT/PERSONAL CONTEXTS (should NOT be filtered, FLAGGED as risky)
  {
    name: "Phone number in direct contact context",
    text: "call me at 09098340056",
    number: "09098340056",
    shouldBeSafe: false,
    description: "Direct phone number sharing"
  },
  {
    name: "Phone number for callback",
    text: "my number is 09098340056 please call back",
    number: "09098340056",
    shouldBeSafe: false,
    description: "Personal phone number"
  },
  {
    name: "International number contact",
    text: "reach me at +639098340056 anytime",
    number: "+639098340056",
    shouldBeSafe: false,
    description: "Contact number"
  },
  {
    name: "Number in greeting",
    text: "text me at 09098340056",
    number: "09098340056",
    shouldBeSafe: false,
    description: "Communication request"
  },
  {
    name: "Mixed context - number after casual text",
    text: "here is my contact 09098340056 for tomorrow",
    number: "09098340056",
    shouldBeSafe: false,
    description: "Personal contact sharing"
  }
];

// Run tests
console.log("=".repeat(80));
console.log("PHONE NUMBER MEASUREMENT CONTEXT TEST SUITE");
console.log("=".repeat(80));
console.log();

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const numberIndex = test.text.toLowerCase().indexOf(test.number.toLowerCase());
  
  if (numberIndex === -1) {
    console.log(`⚠️  SKIPPED: ${test.name}`);
    console.log(`   Reason: Number not found in text`);
    console.log();
    continue;
  }

  // Call the context detection
  const isSafeContext = isMeasurementContext(test.number, test.text, numberIndex);
  const testPassed = isSafeContext === test.shouldBeSafe;

  if (testPassed) {
    console.log(`✅ PASS: ${test.name}`);
    console.log(`   Text: "${test.text}"`);
    console.log(`   Number: ${test.number}`);
    console.log(`   Result: ${isSafeContext ? "Safe (measurement context)" : "Risky (contact context)"}`);
    console.log(`   Description: ${test.description}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${test.name}`);
    console.log(`   Text: "${test.text}"`);
    console.log(`   Number: ${test.number}`);
    console.log(`   Result: ${isSafeContext ? "Safe (measurement context)" : "Risky (contact context)"}`);
    console.log(`   Expected: ${test.shouldBeSafe ? "Safe" : "Risky"}`);
    console.log(`   Description: ${test.description}`);
    failed++;
  }
  console.log();
}

console.log("=".repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log("=".repeat(80));

if (failed === 0) {
  console.log("✅ ALL TESTS PASSED");
  process.exit(0);
} else {
  console.log(`❌ ${failed} TEST(S) FAILED`);
  process.exit(1);
}

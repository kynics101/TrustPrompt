// Test TASK-4.7: Context-aware phone number filtering

// Simulate the helper function from scanner.js
function isMeasurementContext(rawMatch, fullText, matchIndex) {
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

  const startLookahead = matchIndex + rawMatch.length;
  const lookahead = fullText.slice(startLookahead, startLookahead + 50);
  
  if (unitPatterns.some(pattern => pattern.test(lookahead))) {
    return true;
  }

  return false;
}

// Test cases
const testCases = [
  { text: 'i have 0909835056 grams of', match: '0909835056', shouldReject: true },
  { text: 'call me at 0909835056 please', match: '0909835056', shouldReject: false },
  { text: 'my phone is 0909835056', match: '0909835056', shouldReject: false },
  { text: '0909835056 kg of material', match: '0909835056', shouldReject: true },
  { text: '+1 (555) 123-4567 for support', match: '+1 (555) 123-4567', shouldReject: false },
  { text: '123 meters is 1234567 cm', match: '1234567', shouldReject: true },
];

console.log('Context-Aware Phone Filter Test (TASK-4.7):\n');
let passed = 0;
let failed = 0;

testCases.forEach(({ text, match, shouldReject }) => {
  const matchIndex = text.indexOf(match);
  if (matchIndex === -1) {
    console.log(`✗ SETUP ERROR: "${match}" not found in "${text}"`);
    return;
  }

  const isRejected = isMeasurementContext(match, text, matchIndex);
  const result = isRejected === shouldReject ? '✓ PASS' : '✗ FAIL';

  if (isRejected === shouldReject) passed++;
  else failed++;

  console.log(`${result} | "${text}"`);
  console.log(`       Match: "${match}" at index ${matchIndex}`);
  console.log(`       Expected: ${shouldReject ? 'REJECT' : 'ACCEPT'}, Got: ${isRejected ? 'REJECT' : 'ACCEPT'}\n`);
});

console.log(`\nSummary: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

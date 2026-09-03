// Test the updated phone_intl regex with negative lookahead for units

const regex = /\+?1?\s?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\s+(?:grams?|kg|lb|oz|ml|l|cm|mm|inches?|feet|meters?|yards?|tons?|ounces?|pounds?|liters?|gallons?|cups?|tablespoons?|teaspoons?|fahrenheit|celsius|degrees?|km|mi|mph|kph|Hz|MHz|GHz|watts?|volts?|amperes?|bits?|bytes?|mb|gb|kb|rpm)\b)/g;

const testCases = [
  { text: '0909835056 grams', expected: 'NO MATCH' },
  { text: 'call me at 0909835056', expected: '0909835056' },
  { text: 'my number is 0909835056', expected: '0909835056' },
  { text: '(090) 983-5056', expected: '(090) 983-5056' },
  { text: '+1 (555) 123-4567', expected: '+1 (555) 123-4567' },
  { text: '+63 909 835 5056', expected: '+63 909 835 5056' },
  { text: '0909835056 kg', expected: 'NO MATCH' },
  { text: '0909835056', expected: '0909835056' },
  { text: '0909835056 meters', expected: 'NO MATCH' },
  { text: 'call 0909835056 today', expected: '0909835056' },
];

console.log('Phone Regex Test Results:\n');
let passed = 0;
let failed = 0;

testCases.forEach(({ text, expected }) => {
  const matches = text.match(regex);
  const result = matches ? matches[0] : 'NO MATCH';
  const status = result === expected ? '✓ PASS' : '✗ FAIL';
  
  if (result === expected) passed++;
  else failed++;
  
  console.log(`${status} | "${text}"`);
  console.log(`       Expected: ${expected}, Got: ${result}\n`);
});

console.log(`\nSummary: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

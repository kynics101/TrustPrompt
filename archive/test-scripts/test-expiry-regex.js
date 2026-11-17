// Debug expiry pattern matching

const testText = "expiry dates is on nov 23, 2026";

const expiryPatterns = [
  /\b(expir|expire|expires|expiration|expires|valid until|valid thru|good until|use by|best by|sell by)\b/i,
  /\b(exp|expiry|exp\.?|expn|exp date)\s*[:=]?\s*\d/i,
  /\b(card|subscription|membership|license|permit|visa|passport)\s+(?:expir|expire|exp|valid)\b/i,
];

console.log('Text:', testText);
console.log('\nTesting expiry patterns:\n');

expiryPatterns.forEach((pattern, idx) => {
  const matches = pattern.test(testText);
  console.log(`Pattern ${idx + 1}: ${pattern.source}`);
  console.log(`  Matches: ${matches ? 'YES' : 'NO'}`);
  if (matches) {
    const match = testText.match(pattern);
    console.log(`  Matched text: "${match[0]}"`);
  }
  console.log();
});

console.log('Full context extraction simulation:');
const matchIndex = testText.indexOf('nov 23, 2026');
const contextStart = Math.max(0, matchIndex - 150);
const contextEnd = Math.min(testText.length, matchIndex + 'nov 23, 2026'.length + 150);
const context = testText.substring(contextStart, contextEnd).toLowerCase();

console.log('Context:', context);
console.log('\nPattern matching on context:');
expiryPatterns.forEach((pattern, idx) => {
  const matches = pattern.test(context);
  console.log(`Pattern ${idx + 1}: ${matches ? 'MATCH' : 'no match'}`);
});

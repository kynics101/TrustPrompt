// test-mobile-detection.js
// Test that +639189945231 is detected as a mobile number

const testPrompt = `I'm registering for an overseas service and it insists on international dialing format, which I always get wrong. My Philippine number is +639189945231. Could you confirm that's the correct international form and help me fill out the 'mobile (with country code)' field properly?`;

console.log('═════════════════════════════════════════════════════════════');
console.log('MOBILE NUMBER DETECTION TEST');
console.log('═════════════════════════════════════════════════════════════\n');

console.log('Test prompt:');
console.log(testPrompt);
console.log('\n' + '─'.repeat(60) + '\n');

// Test the regex directly
const regex = /(\+639|09)[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d/gi;
const matches = testPrompt.match(regex);

console.log(`Regex matches: ${matches ? matches.length : 0}`);
if (matches) {
  matches.forEach((m, i) => {
    console.log(`  [${i + 1}] ${m}`);
  });
}

console.log('\n' + '─'.repeat(60));
console.log('\nExpected: +639189945231 should be detected');
console.log('Actual: ' + (matches && matches.includes('+639189945231') ? '✅ DETECTED' : '❌ NOT DETECTED'));

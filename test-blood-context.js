const patterns = require('./patterns.js');

const testPrompt = "for my data privacy class, pretend a leaked record says: nurse ana reyes of pgh, female, catholic, diabetic, blood type a+, card 4111 1111 1111 1111, mobile 09171234567. explain what a privacy officer should do.";

console.log('=== Blood Type Context Filter Test ===\n');
console.log('Input:', testPrompt);
console.log('');

const bloodPattern = patterns.TRUSTPROMPT_PATTERNS.find(p => p.id === 'blood_type_mention');

const re = new RegExp(bloodPattern.regex.source, bloodPattern.regex.flags);
let match;

console.log('--- Testing contextFilter ---');
while ((match = re.exec(testPrompt)) !== null) {
  const rawMatch = match[0];
  const matchIndex = match.index;
  
  console.log(`Regex matched: "${rawMatch}" at index ${matchIndex}`);
  
  if (bloodPattern.contextFilter) {
    const isAllowed = bloodPattern.contextFilter(rawMatch, testPrompt, matchIndex);
    console.log(`  ContextFilter result: ${isAllowed ? '✓ ALLOWED' : '✗ SUPPRESSED'}`);
  }
}

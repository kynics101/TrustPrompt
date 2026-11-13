// diagnose-mobile-issue.js
// Comprehensive diagnostic to understand why mobile is detected as GSIS

const fs = require('fs');
const patternsCode = fs.readFileSync('./patterns.js', 'utf8');

// Extract TRUSTPROMPT_PATTERNS from file
const match = patternsCode.match(/const TRUSTPROMPT_PATTERNS = \[([\s\S]+?)\];/);
if (!match) {
  console.log('❌ Could not find TRUSTPROMPT_PATTERNS');
  process.exit(1);
}

// For now, just test the regexes manually
const testInput = '+639189945231';
const testInputWithout = '639189945231';

console.log('═════════════════════════════════════════════════════════');
console.log('DIAGNOSTIC: Mobile vs GSIS Pattern Matching');
console.log('═════════════════════════════════════════════════════════\n');

// Test mobile regex
const mobileRegex = /(\+639|09)[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d/gi;
const gsisRegex = /(?<!\d)\d{4}[_\-\s]?\d{7}[_\-\s]?\d(?!\d)/g;
const gsisRegexOld = /\b\d{4}[_\-\s]?\d{7}[_\-\s]?\d\b/g;

console.log('Test 1: Full input WITH +63 prefix');
console.log('─'.repeat(60));
console.log(`Input: "${testInput}"`);

mobileRegex.lastIndex = 0;
const mobileMatch = mobileRegex.exec(testInput);
console.log(`Mobile regex matches: ${mobileMatch ? mobileMatch[0] : 'NO'}`);

gsisRegex.lastIndex = 0;
const gsisMatch = gsisRegex.exec(testInput);
console.log(`GSIS (new) regex matches: ${gsisMatch ? gsisMatch[0] : 'NO'}`);

gsisRegexOld.lastIndex = 0;
const gsisMatchOld = gsisRegexOld.exec(testInput);
console.log(`GSIS (old) regex matches: ${gsisMatchOld ? gsisMatchOld[0] : 'NO'}`);

console.log('\nTest 2: Input WITHOUT +63 prefix (just digits)');
console.log('─'.repeat(60));
console.log(`Input: "${testInputWithout}"`);

mobileRegex.lastIndex = 0;
const mobileMatch2 = mobileRegex.exec(testInputWithout);
console.log(`Mobile regex matches: ${mobileMatch2 ? mobileMatch2[0] : 'NO'}`);

gsisRegex.lastIndex = 0;
const gsisMatch2 = gsisRegex.exec(testInputWithout);
console.log(`GSIS (new) regex matches: ${gsisMatch2 ? gsisMatch2[0] : 'NO'}`);

gsisRegexOld.lastIndex = 0;
const gsisMatchOld2 = gsisRegexOld.exec(testInputWithout);
console.log(`GSIS (old) regex matches: ${gsisMatchOld2 ? gsisMatchOld2[0] : 'NO'}`);

// Test with different parts of the number
console.log('\n\nTest 3: Extracting 10-digit segment from 12-digit number');
console.log('─'.repeat(60));
const segment = testInputWithout.substring(0, 10); // '6391899452'
console.log(`Segment (first 10): "${segment}"`);

gsisRegex.lastIndex = 0;
const segmentGsis = gsisRegex.exec(segment);
console.log(`GSIS (new) regex matches: ${segmentGsis ? segmentGsis[0] : 'NO'}`);

gsisRegexOld.lastIndex = 0;
const segmentGsisOld = gsisRegexOld.exec(segment);
console.log(`GSIS (old) regex matches: ${segmentGsisOld ? segmentGsisOld[0] : 'NO'}`);

// Check if it matches 4-7-1 pattern
console.log('\n\nTest 4: Does 10-digit segment match GSIS 4-7-1 pattern?');
console.log('─'.repeat(60));
const testPattern = /\d{4}[_\-\s]?\d{7}[_\-\s]?\d/;
console.log(`Pattern /\\d{4}[_\\-\\s]?\\d{7}[_\\-\\s]?\\d/ matches "${segment}": ${testPattern.test(segment)}`);

// What about with formatting?
const formatted = segment.substring(0, 4) + '-' + segment.substring(4, 11) + '-' + segment.substring(11);
console.log(`\nFormatted as GSIS: "${formatted}"`);
console.log(`Pattern matches formatted: ${testPattern.test(formatted)}`);

console.log('\n' + '═'.repeat(60));
console.log('KEY FINDING:');
console.log('If GSIS is matching "+639189945231", the issue is that:');
console.log('1. The prefix (+63) is being STRIPPED somewhere');
console.log('2. Leaving 639189945231 (12 digits)');
console.log('3. A 10-digit substring is extracted from this');
console.log('4. That 10-digit part matches GSIS pattern 4-7-1');

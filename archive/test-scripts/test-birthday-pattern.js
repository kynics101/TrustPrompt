// Test to debug why "March 07,2005" is not being detected

const pattern = /^(on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i;

const testStrings = [
  'March 07,2005',
  'march 07,2005',
  'on March 07,2005',
  'March 7,2005',
  'March 07, 2005',
  'March 07, 2005 was my birthday',
  'january 1,2000',
  'March',
  'march',
  '07,2005'
];

console.log('='.repeat(70));
console.log('TESTING followPattern REGEX FOR BIRTHDAY DETECTION');
console.log('='.repeat(70));
console.log('Pattern:', pattern.toString());
console.log('');

testStrings.forEach((str, idx) => {
  const match = pattern.test(str);
  const fullMatch = str.match(pattern);
  console.log(`Test ${idx + 1}: '${str}'`);
  console.log(`  Result: ${match ? '✓ MATCH' : '✗ NO MATCH'}`);
  if (fullMatch) {
    console.log(`  Matched: '${fullMatch[0]}'`);
  }
  console.log('');
});

console.log('='.repeat(70));
console.log('ISSUE ANALYSIS:');
console.log('='.repeat(70));

// The issue is that the regex pattern only matches ONE of these alternatives:
// 1. Month abbreviations: jan|feb|mar|...|dec
// 2. Full month names: january|february|march|...|december
// 3. Date format with slashes/dashes: \d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}
// 4. Date format with slashes/dashes (year first): \d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}

console.log('\nThe followPattern only matches these formats:');
console.log('  ✓ "jan" or "january" (month only)');
console.log('  ✓ "07/15/2005" or "07-15-2005" (numeric date)');
console.log('  ✓ "2005/07/15" or "2005-07-15" (numeric date, year first)');
console.log('\nBUT NOT:');
console.log('  ✗ "March 07,2005" (month name + day + comma + year)');
console.log('  ✗ "March 07, 2005" (month name + day + comma + space + year)');
console.log('');

console.log('WHY? Because the regex pattern after the month names doesn\'t include');
console.log('the full date format. It needs to match:');
console.log('  Pattern needed: (january|february|...)\s+\d{1,2},?\s*\d{4}');
console.log('');

// Test what would match
console.log('SOLUTION: Update the followPattern regex to include full date formats:');
const improvedPattern = /^(on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/i;

console.log('');
console.log('Testing with improved pattern:');
console.log('Pattern:', improvedPattern.toString());
console.log('');

testStrings.forEach((str, idx) => {
  const match = improvedPattern.test(str);
  const fullMatch = str.match(improvedPattern);
  console.log(`Test ${idx + 1}: '${str}'`);
  console.log(`  Result: ${match ? '✓ MATCH' : '✗ NO MATCH'}`);
  if (fullMatch) {
    console.log(`  Matched: '${fullMatch[0]}'`);
  }
});

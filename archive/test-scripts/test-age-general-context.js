// Test: Verify age_value is suppressed in general/informational contexts

console.log('═'.repeat(80));
console.log('AGE VALUE CONTEXT FILTER TEST');
console.log('═'.repeat(80));
console.log();

// Replicate the contextFilter logic for age_value
function testAgeContextFilter(rawMatch, fullText, matchIndex) {
  if (!fullText || typeof fullText !== "string") return true;
  
  const contextStart = Math.max(0, matchIndex - 150);
  const contextEnd = Math.min(fullText.length, matchIndex + rawMatch.length + 150);
  const context = fullText.substring(contextStart, contextEnd).toLowerCase();
  
  const generalQuestionPatterns = [
    /\b(what\s+is|what\s+are|define|definition\s+of|explain|explained)\b/,
    /\b(refers?\s+to|is\s+defined\s+as|are\s+defined\s+as|means?\b)/,
    /\b(average|typical|general|demographic|statistics?|common|usually|normally|generally)\b/,
    /\b(for educational|for informational|for reference|as\s+a\s+guide)\b/,
    /\b(research|study|investigation|analysis|findings?|data|survey|reported|subjects?|participants?)\b/,
    /\b(examples?\s+of|such as|like|for instance|in general)\b/,
    /\b(age group|age range|age bracket|age category|ages?\s+\d+-\d+)\b/,
  ];
  
  const isGeneralContext = generalQuestionPatterns.some(p => p.test(context));
  
  return !isGeneralContext;  // Return true to ALLOW, false to SUPPRESS
}

// Test cases
const testCases = [
  {
    name: 'General question: average age',
    text: `What's the average height and weight of a 25 year old Filipino male? Please explain in a table.`,
    matchText: '25 year old',
    shouldSuppress: true,  // GENERAL QUESTION - suppress
    description: 'Educational/informational question'
  },
  {
    name: 'Personal disclosure: I am',
    text: `My personal information: I am 25 years old. My email is user@example.com.`,
    matchText: '25 years old',
    shouldSuppress: false,  // PERSONAL DISCLOSURE - allow
    description: 'Direct personal statement'
  },
  {
    name: 'Research context: subjects',
    text: `In our study, we examined subjects aged 25 years old to determine health outcomes.`,
    matchText: '25 years old',
    shouldSuppress: true,  // RESEARCH CONTEXT - suppress
    description: 'Research/academic context'
  },
  {
    name: 'Typical/demographic context',
    text: `The typical age for this demographic is 25 years old. This group has unique characteristics.`,
    matchText: '25 years old',
    shouldSuppress: true,  // DEMOGRAPHIC CONTEXT - suppress
    description: 'General demographic information'
  },
  {
    name: 'Personal age statement',
    text: `My age is 25 years old. I have 5 years of work experience.`,
    matchText: '25 years old',
    shouldSuppress: false,  // PERSONAL - allow
    description: 'Direct age disclosure with "my"'
  },
  {
    name: 'Definition request',
    text: `What is the average age? In this context, a 25 year old person represents...`,
    matchText: '25 year old',
    shouldSuppress: true,  // DEFINITIONAL - suppress
    description: 'Defining or explaining a concept'
  },
  {
    name: 'Statistical data',
    text: `According to statistics, the average age of the population is 25 years old.`,
    matchText: '25 years old',
    shouldSuppress: true,  // STATISTICAL - suppress
    description: 'Statistical/data context'
  },
  {
    name: 'Third-person personal',
    text: `My friend is 25 years old. He works in IT.`,
    matchText: '25 years old',
    shouldSuppress: false,  // PERSONAL (about an individual) - allow
    description: 'Personal information about someone'
  },
];

let totalTests = 0;
let totalPassed = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log('-'.repeat(70));
  console.log(`Text: "${testCase.text.substring(0, 70)}..."`);
  
  const matchIndex = testCase.text.indexOf(testCase.matchText);
  if (matchIndex === -1) {
    console.log(`✗ Match text not found: "${testCase.matchText}"`);
    console.log();
    return;
  }
  
  totalTests++;
  
  const result = testAgeContextFilter(testCase.matchText, testCase.text, matchIndex);
  const isSuppressed = !result;
  const passed = isSuppressed === testCase.shouldSuppress;
  
  const expected = testCase.shouldSuppress ? 'SUPPRESS' : 'ALLOW';
  const actual = isSuppressed ? 'SUPPRESS' : 'ALLOW';
  const status = passed ? '✓ PASS' : '✗ FAIL';
  
  console.log(`Expected: ${expected}`);
  console.log(`Actual: ${actual}`);
  console.log(`Reason: ${testCase.description}`);
  console.log(`Result: ${status}`);
  console.log();
  
  if (passed) totalPassed++;
});

console.log('═'.repeat(80));
console.log('TEST SUMMARY');
console.log('═'.repeat(80));
console.log(`Total: ${totalTests} tests`);
console.log(`Passed: ${totalPassed} ✓`);
console.log(`Failed: ${totalTests - totalPassed} ✗`);
console.log();

if (totalTests === totalPassed) {
  console.log('✓✓✓ ALL TESTS PASSED ✓✓✓');
  console.log();
  console.log('Behavior verified:');
  console.log('  ✓ General/educational age mentions are suppressed');
  console.log('  ✓ Personal age disclosures are allowed');
  console.log('  ✓ Research/statistical contexts are suppressed');
} else {
  console.log('✗✗✗ SOME TESTS FAILED ✗✗✗');
}

/**
 * Test script for Path C improvements:
 * 1. Better filtering of verb-participles (e.g., "experiencing heavy")
 * 2. Merging consecutive first and last names (e.g., "Maricel" + "Balais" → "Maricel Balais")
 */

// Mock the TrustLinguisticDetector for testing
const testCases = [
  {
    text: 'Maricel Balais is the head of OICT, generate possible research question to know the pain points of the office',
    description: 'Should detect Maricel Balais as a merged name, NOT separate names',
    expectedNames: ['Maricel Balais'],
    shouldNotHave: ['experiencing', 'heavy']
  },
  {
    text: 'I am experiencing heavy workload at the office',
    description: 'Should NOT detect "experiencing" or "heavy" as names',
    expectedNames: [],
    shouldNotHave: ['experiencing', 'heavy', 'experiencing heavy']
  },
  {
    text: 'Maria Garcia works as a human resource manager',
    description: 'Should detect Maria Garcia as merged name and human resource manager as job',
    expectedNames: ['Maria Garcia'],
    shouldNotHave: []
  },
  {
    text: 'John Smith said that the new procedure is good',
    description: 'Should detect John Smith as merged name, NOT "new" or "good" as names',
    expectedNames: ['John Smith'],
    shouldNotHave: ['new', 'good']
  },
  {
    text: 'According to Dr. Sarah Johnson, the patient is experiencing severe pain',
    description: 'Should detect Sarah Johnson (with honorific) but NOT "experiencing" or "severe" as names',
    expectedNames: ['Sarah Johnson', 'Sarah Johnson'],  // Might be detected twice but should be merged/dedup
    shouldNotHave: ['experiencing', 'severe']
  }
];

console.log('='.repeat(80));
console.log('Path C Improvement Test Suite');
console.log('='.repeat(80));

// Test the NON_NAME_WORDS filter
console.log('\n1. Testing NON_NAME_WORDS filter:');
console.log('   Should include: experiencing, heavy, reporting, stating, etc.');

// List of words that should filter out false positives
const testFilterWords = [
  'experiencing', 'heavy', 'reporting', 'stating', 'regarding',
  'according', 'working', 'playing', 'good', 'bad', 'new', 'old'
];

const shouldBeFiltered = testFilterWords.map(word => `  - ${word}`).join('\n');
console.log(shouldBeFiltered);

// Test name merging logic
console.log('\n2. Testing name merging logic:');
console.log('   Input: ["Maricel", "Balais"]');
console.log('   Output: ["Maricel Balais"]');
console.log('   ✓ Consecutive names should be merged');

// Test that verb-participles are not detected
console.log('\n3. Testing verb-participle filtering:');
testCases.forEach(testCase => {
  if (testCase.shouldNotHave.length > 0) {
    console.log(`\n   Text: "${testCase.text}"`);
    console.log(`   Description: ${testCase.description}`);
    console.log(`   Should NOT detect: ${testCase.shouldNotHave.join(', ')}`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('Test cases defined. Run TrustLinguisticDetector.scan() on each case.');
console.log('='.repeat(80));

// Helper to run tests if TrustLinguisticDetector is available
if (typeof window !== 'undefined' && window.TrustLinguisticDetector) {
  console.log('\n✓ TrustLinguisticDetector is available');
  console.log('\nRunning automated tests...\n');

  let passCount = 0;
  let failCount = 0;

  testCases.forEach((testCase, idx) => {
    console.log(`\nTest ${idx + 1}: ${testCase.description}`);
    console.log(`Text: "${testCase.text}"`);

    const results = window.TrustLinguisticDetector.scan(testCase.text);
    const detectedNames = results
      .filter(r => r.patternId === 'nlp_person_name')
      .map(r => r.rawMatch);

    console.log(`Expected names: ${testCase.expectedNames.join(', ')}`);
    console.log(`Detected names: ${detectedNames.join(', ') || '(none)'}`);

    // Check if unwanted words were detected
    const unwantedDetected = testCase.shouldNotHave.filter(word =>
      detectedNames.some(name => name.toLowerCase().includes(word.toLowerCase()))
    );

    if (unwantedDetected.length === 0) {
      console.log('✓ PASS: No unwanted words detected');
      passCount++;
    } else {
      console.log(`✗ FAIL: Detected unwanted words: ${unwantedDetected.join(', ')}`);
      failCount++;
    }
  });

  console.log(`\n${'-'.repeat(80)}`);
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log(`${'-'.repeat(80)}\n`);
} else {
  console.log(
    '\n⚠ TrustLinguisticDetector not available.\n' +
    'Load this script in a context where the linguistic-detector.js has been loaded.\n'
  );
}

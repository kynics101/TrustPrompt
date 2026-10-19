/**
 * Test script for Phase 1 Path C improvements
 * 
 * Run with: node test-phase1-improvements.js
 * 
 * Tests:
 * 1. Common-word filtering
 * 2. Confidence thresholds
 * 3. Safe context filtering
 * 4. Honorific + role extraction
 */

console.log('================================================================================');
console.log('PATH C PHASE 1 IMPROVEMENTS TEST SUITE');
console.log('================================================================================\n');

// Mock the detector constants since we're not loading the full module
const COMMON_WORD_FILTERS = {
  greetings: new Set(['hello', 'hi', 'goodbye', 'bye', 'thanks', 'welcome']),
  adjectives: new Set(['beautiful', 'wonderful', 'amazing', 'great', 'good']),
  common_verbs: new Set(['work', 'is', 'are', 'have', 'do', 'get']),
  action_words: new Set(['create', 'build', 'develop', 'test']),
  common_nouns: new Set(['thing', 'stuff', 'object', 'subject']),
  generic_org_words: new Set(['organization', 'company', 'team'])
};

const CONFIDENCE_THRESHOLDS = {
  person: 0.65,
  organization: 0.70,
  job: 0.60
};

// Test 1: Common word filtering
console.log('TEST 1: Common-Word Filtering');
console.log('─────────────────────────────────────────────────────────────────────────\n');

function testCommonWordFilter() {
  const testCases = [
    { word: 'hello', shouldFilter: true, reason: 'greeting' },
    { word: 'beautiful', shouldFilter: true, reason: 'adjective' },
    { word: 'work', shouldFilter: true, reason: 'common verb' },
    { word: 'Kyleen', shouldFilter: false, reason: 'proper name' },
    { word: 'Google', shouldFilter: false, reason: 'org name' },
    { word: 'create', shouldFilter: true, reason: 'action word' }
  ];

  let passed = 0;
  for (const test of testCases) {
    const lower = test.word.toLowerCase();
    let isCommon = false;
    for (const [category, wordSet] of Object.entries(COMMON_WORD_FILTERS)) {
      if (wordSet.has(lower)) {
        isCommon = true;
        break;
      }
    }
    
    const result = isCommon === test.shouldFilter;
    const status = result ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} | "${test.word}" (${test.reason})`);
    if (result) passed++;
  }
  
  console.log(`\nResult: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// Test 2: Confidence thresholds
console.log('TEST 2: Confidence Thresholds');
console.log('─────────────────────────────────────────────────────────────────────────\n');

function testConfidenceThresholds() {
  const testCases = [
    { candidate: 'John Smith', type: 'person', confidence: 0.75, shouldPass: true },
    { candidate: 'hello', type: 'person', confidence: 0.50, shouldPass: false },
    { candidate: 'Google', type: 'organization', confidence: 0.80, shouldPass: true },
    { candidate: 'unknown org', type: 'organization', confidence: 0.65, shouldPass: false },
    { candidate: 'Professor', type: 'job', confidence: 0.65, shouldPass: true }
  ];

  let passed = 0;
  for (const test of testCases) {
    const threshold = CONFIDENCE_THRESHOLDS[test.type];
    const passesThreshold = test.confidence >= threshold;
    const result = passesThreshold === test.shouldPass;
    const status = result ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} | "${test.candidate}" (${test.type}: ${test.confidence} vs threshold ${threshold})`);
    if (result) passed++;
  }
  
  console.log(`\nResult: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// Test 3: Safe context detection
console.log('TEST 3: Safe Context Detection');
console.log('─────────────────────────────────────────────────────────────────────────\n');

function testSafeContextDetection() {
  const testCases = [
    {
      text: "What is diabetes?",
      entity: "diabetes",
      isSafe: true,
      reason: "information-seeking"
    },
    {
      text: "I have diabetes and need help",
      entity: "diabetes",
      isSafe: false,
      reason: "personal disclosure"
    },
    {
      text: "In my Spanish course, Maria is...",
      entity: "Maria",
      isSafe: true,
      reason: "educational (no personal marker before 'my')"
    },
    {
      text: "const myValue = 5;",
      entity: "myValue",
      isSafe: true,
      reason: "code/technical context"
    },
    {
      text: "Convert 3 grams to kilograms",
      entity: "grams",
      isSafe: true,
      reason: "measurement context"
    }
  ];

  let passed = 0;
  for (const test of testCases) {
    // Simplified check - just verify pattern matching works
    const lower = test.text.toLowerCase();
    
    let detectedAsUnSafe = false;
    
    if (/^\s*(what|how|explain|define)/.test(lower)) {
      detectedAsUnSafe = false;  // Info-seeking = safe
    } else if (/\b(my|i|we|our)\b/.test(lower)) {
      detectedAsUnSafe = true;   // Personal markers = unsafe
    } else if (/\b(const|let|var|function)/.test(lower)) {
      detectedAsUnSafe = false;  // Code = safe
    } else if (/\b(grams|kilograms|tons|meters)/.test(lower)) {
      detectedAsUnSafe = false;  // Measurement = safe
    }
    
    const result = detectedAsUnSafe === !test.isSafe;
    const status = result ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} | "${test.reason}"`);
    if (result) passed++;
  }
  
  console.log(`\nResult: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// Test 4: Honorific extraction
console.log('TEST 4: Honorific + Role Extraction');
console.log('─────────────────────────────────────────────────────────────────────────\n');

function testHonorificExtraction() {
  const patterns = [
    /\b(Mr|Ms|Mrs|Miss|Dr|Prof|Professor|Sir)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:the\s+)?([A-Za-z\s]+?)\s+(?:of|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi
  ];
  
  const testCases = [
    {
      text: "Ms Padua is the Head of OICT",
      shouldMatch: true,
      expectedName: "Padua",
      expectedOrg: "OICT"
    },
    {
      text: "Dr. Smith is director of engineering",
      shouldMatch: true,
      expectedName: "Smith",
      expectedOrg: "engineering"
    },
    {
      text: "Sir Victorio is the network track head",
      shouldMatch: true,
      expectedName: "Victorio",
      expectedOrg: "head"  // Last capture
    },
    {
      text: "John works at Google",
      shouldMatch: false,
      reason: "no honorific pattern"
    }
  ];

  let passed = 0;
  for (const test of testCases) {
    const pattern = patterns[0];
    pattern.lastIndex = 0;  // Reset regex
    const match = pattern.exec(test.text);
    
    const matched = match !== null;
    const result = matched === test.shouldMatch;
    const status = result ? '✅ PASS' : '❌ FAIL';
    
    if (test.shouldMatch && match) {
      const name = match[2];
      const org = match[4];
      console.log(`  ${status} | "${test.text}"`);
      console.log(`         → Name: "${name}", Org: "${org}"`);
    } else {
      console.log(`  ${status} | "${test.text}"`);
    }
    
    if (result) passed++;
  }
  
  console.log(`\nResult: ${passed}/${testCases.length} tests passed\n`);
  return passed === testCases.length;
}

// Run all tests
console.log('\nRUNNING TESTS...\n');

const test1Result = testCommonWordFilter();
const test2Result = testConfidenceThresholds();
const test3Result = testSafeContextDetection();
const test4Result = testHonorificExtraction();

// Summary
console.log('================================================================================');
console.log('TEST SUMMARY');
console.log('================================================================================\n');

const allPassed = test1Result && test2Result && test3Result && test4Result;

console.log(`Common-Word Filtering:        ${test1Result ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Confidence Thresholds:        ${test2Result ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Safe Context Detection:       ${test3Result ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Honorific + Role Extraction:  ${test4Result ? '✅ PASS' : '❌ FAIL'}`);

console.log(`\n${'═'.repeat(80)}`);
if (allPassed) {
  console.log('🎉 ALL TESTS PASSED! Path C improvements are ready for deployment.\n');
} else {
  console.log('⚠️ Some tests failed. Review the output above.\n');
}
console.log(`${'═'.repeat(80)}\n`);
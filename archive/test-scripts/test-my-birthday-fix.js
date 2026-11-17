// Test to verify "My birthday" is properly filtered out

// Load the detector (simulating browser environment)
const mockNLP = { nlp: () => ({}) }; // Dummy compromise.js

// Mock window object for browser compatibility
if (typeof window === 'undefined') {
  global.window = mockNLP;
}

// Mock occupations and organizations data
global.OCCUPATIONS_DATA = [];
global.ORGANIZATIONS_DATA = [];

// Load the linguistic detector
require('./linguistic-detector.js');

// Test cases
const testCases = [
  {
    name: "My birthday - should NOT detect as name",
    text: "My birthday is on March 07, 2025",
    shouldNotDetect: "My birthday",
    description: "Possessive pronoun + personal attribute"
  },
  {
    name: "Your birthday - should NOT detect as name",
    text: "Your birthday is coming soon",
    shouldNotDetect: "Your birthday",
    description: "Possessive pronoun + personal attribute"
  },
  {
    name: "His address - should NOT detect as name",
    text: "His address is 123 Main Street",
    shouldNotDetect: "His address",
    description: "Possessive pronoun + personal attribute"
  },
  {
    name: "My email - should NOT detect as name",
    text: "My email is john@example.com",
    shouldNotDetect: "My email",
    description: "Possessive pronoun + personal attribute"
  },
  {
    name: "John Smith - should detect as name",
    text: "John Smith works here",
    shouldDetect: "John Smith",
    description: "Legitimate person name"
  }
];

console.log('='.repeat(60));
console.log('TESTING: My birthday and similar false positives');
console.log('='.repeat(60));

// Test the detector
for (const testCase of testCases) {
  console.log(`\n[TEST] ${testCase.name}`);
  console.log(`Text: "${testCase.text}"`);
  console.log(`Description: ${testCase.description}`);
  
  // Call the scan function if available
  if (typeof TrustLinguisticDetector !== 'undefined' && TrustLinguisticDetector.scan) {
    const findings = TrustLinguisticDetector.scan(testCase.text);
    const personNames = findings.filter(f => f.patternId === 'nlp_person_name').map(f => f.rawMatch);
    
    if (testCase.shouldNotDetect) {
      const found = personNames.some(name => name.toLowerCase() === testCase.shouldNotDetect.toLowerCase());
      if (found) {
        console.log(`❌ FAILED: "${testCase.shouldNotDetect}" was detected but should NOT be`);
      } else {
        console.log(`✅ PASSED: "${testCase.shouldNotDetect}" was NOT detected (correct)`);
      }
    }
    
    if (testCase.shouldDetect) {
      const found = personNames.some(name => name.toLowerCase() === testCase.shouldDetect.toLowerCase());
      if (found) {
        console.log(`✅ PASSED: "${testCase.shouldDetect}" was detected (correct)`);
      } else {
        console.log(`❌ FAILED: "${testCase.shouldDetect}" was NOT detected but should be`);
      }
    }
    
    console.log(`Detected names: ${personNames.length > 0 ? personNames.join(', ') : 'none'}`);
  } else {
    console.log('⚠️  TrustLinguisticDetector not available');
  }
}

console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60));

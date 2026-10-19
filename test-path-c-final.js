/**
 * Test Path C detection after removing regex-based fallback
 * Verifies that compromise.js NER is the sole source for name detection
 */

const nlp = require('compromise');

// Test cases
const testCases = [
  {
    name: "Single-word name (Kyleen)",
    text: "Kyleen is a developer",
    expectedNames: ["Kyleen"],
    expectedJobs: ["developer"]
  },
  {
    name: "Name with offensive language",
    text: "Andrea is a crazy bitch",
    expectedNames: ["Andrea"],
    expectedJobs: [] // "crazy bitch" should NOT be detected as a job
  },
  {
    name: "Multiple names",
    text: "Cristina and Kyleen are lawyers",
    expectedNames: ["Cristina", "Kyleen"],
    expectedJobs: ["lawyers"]
  },
  {
    name: "Name mentioned standalone",
    text: "I spoke with Kyleen Nicdao about the project",
    expectedNames: ["Kyleen Nicdao"],
    expectedJobs: []
  },
  {
    name: "Explicit name declaration",
    text: "My name is Cristina",
    expectedNames: ["Cristina"],
    expectedJobs: []
  }
];

console.log('=== Testing Path C NER Detection (Regex Removed) ===\n');

testCases.forEach(testCase => {
  console.log(`📋 Test: ${testCase.name}`);
  console.log(`   Text: "${testCase.text}"`);
  
  const doc = nlp(testCase.text);
  
  // Extract people using compromise.js NER
  const peopleEntities = doc.people().out('array');
  console.log(`   NER People detected: ${JSON.stringify(peopleEntities)}`);
  console.log(`   Expected: ${JSON.stringify(testCase.expectedNames)}`);
  
  // Extract job titles (check for specific patterns)
  const tags = doc.verbs().out('array');
  const nouns = doc.nouns().out('array');
  console.log(`   Nouns detected: ${JSON.stringify(nouns)}`);
  
  // Simple check: look for job-related terms
  const jobTerms = nouns.filter(n => 
    ['developer', 'lawyer', 'lawyers', 'manager', 'engineer'].includes(n.toLowerCase())
  );
  console.log(`   Job terms detected: ${JSON.stringify(jobTerms)}`);
  console.log(`   Expected jobs: ${JSON.stringify(testCase.expectedJobs)}`);
  
  console.log('---\n');
});

console.log('✅ Test complete. Check console output for NER behavior.\n');
console.log('Key findings:');
console.log('- "Kyleen" should be detected as a person name (NOT "Kyleen is")');
console.log('- "Andrea" should be detected despite "crazy bitch" in text');
console.log('- Job titles should be captured correctly');
console.log('- Regex fallback has been removed entirely');

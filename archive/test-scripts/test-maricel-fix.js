/**
 * Test: Verify that "Maricel Balais" is now detected in the test case
 * This tests the fix where we removed the filter on "experiencing" after "is"
 */

// Mock the CSV data loading for testing
const mockCSV = {
  occupations: "gynecologist,librarian,doctor,nurse,engineer,manager",
  organizations: "Google,Microsoft,Amazon"
};

// Import the detector - in Node.js this would work:
// const TrustLinguisticDetector = require('./linguistic-detector.js');

// For browser testing, we need to load it via script tags

console.log("=== TEST: Maricel Balais Detection ===\n");

const testCases = [
  {
    name: "Original failing case",
    input: "Maricel Balais is experiencing heavy menstruation and she want to her gynecologist",
    expectedFindings: {
      names: ["Maricel Balais"],
      jobs: ["gynecologist"],
      orgs: []
    }
  },
  {
    name: "Similar case with different verb",
    input: "John Smith is reporting a problem to the manager",
    expectedFindings: {
      names: ["John Smith"],
      jobs: ["manager"],
      orgs: []
    }
  },
  {
    name: "Name with descriptive state",
    input: "Alice Brown is tired after working as a nurse",
    expectedFindings: {
      names: ["Alice Brown"],
      jobs: ["nurse"],
      orgs: []
    }
  },
  {
    name: "Multiple names with actions",
    input: "Maria is an engineer and Carlos is a doctor experiencing burnout",
    expectedFindings: {
      names: ["Maria", "Carlos"],
      jobs: ["engineer", "doctor"],
      orgs: []
    }
  }
];

// Display test cases for manual verification
testCases.forEach((test, idx) => {
  console.log(`Test ${idx + 1}: ${test.name}`);
  console.log(`Input: "${test.input}"`);
  console.log(`Expected:`);
  console.log(`  - Names: ${test.expectedFindings.names.join(", ")}`);
  console.log(`  - Jobs: ${test.expectedFindings.jobs.join(", ")}`);
  console.log(`  - Orgs: ${test.expectedFindings.orgs.join(", ") || "(none)"}`);
  console.log();
});

console.log("=== Running in Browser ===\n");
console.log("To test: Open the browser console and run:");
console.log("  TrustLinguisticDetector.scan('Maricel Balais is experiencing heavy menstruation and she want to her gynecologist')");
console.log("\nExpected output:");
console.log("  - 1 person name: 'Maricel Balais'");
console.log("  - 1 job title: 'gynecologist'");

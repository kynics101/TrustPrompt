/**
 * Test file to verify fixes for Path C false positives
 * 
 * Issues Fixed:
 * 1. "my birthday" false positive: "my birthday is june 8,2003" should extract only the date, not "my birthday" as a name
 * 2. "Jerralyn" not detected: "generate an email for Jerralyn" should detect "Jerralyn" as a person name
 */

// Test Cases for Path B (Gazetteer) - "my birthday" fix
const testCasesPathB = [
  {
    text: "my birthday is june 8,2003",
    expectedFindings: ["june 8,2003"], // Should extract date, NOT "my birthday"
    shouldNotFind: ["my birthday", "birthday"],
    description: "Birthday date should be extracted, not 'my birthday' phrase"
  },
  {
    text: "my birthday is 06-15-1990",
    expectedFindings: ["06-15-1990"],
    shouldNotFind: ["my birthday"],
    description: "Numeric date format should match, not phrase"
  },
  {
    text: "my birthday is december 25",
    expectedFindings: ["december 25"],
    shouldNotFind: ["my birthday"],
    description: "Month name with day should match"
  },
  {
    text: "my birthday is 1995",
    expectedFindings: ["1995"],
    shouldNotFind: ["my birthday"],
    description: "Year-only date should match"
  }
];

// Test Cases for Path C (Linguistic) - "Jerralyn" detection fix (METHOD 4.5)
const testCasesPathC = [
  {
    text: "generate an email for Jerralyn",
    expectedFindings: ["Jerralyn"],
    description: "Directive context: 'for [Name]' - single-word name in 'for' clause"
  },
  {
    text: "send message to John",
    expectedFindings: ["John"],
    description: "Directive context: 'to [Name]' - single-word name in 'to' clause"
  },
  {
    text: "contact Sarah",
    expectedFindings: ["Sarah"],
    description: "Action verb: 'contact [Name]' - direct object name"
  },
  {
    text: "please email Alice about the project",
    expectedFindings: ["Alice"],
    description: "Action verb: 'email [Name]' - single-word name"
  },
  {
    text: "call Bob tomorrow",
    expectedFindings: ["Bob"],
    description: "Action verb: 'call [Name]' - short name"
  },
  {
    text: "message Maria with the details",
    expectedFindings: ["Maria"],
    description: "Action verb: 'message [Name]' - then preposition"
  },
  {
    text: "invite David to the meeting",
    expectedFindings: ["David"],
    description: "Action verb: 'invite [Name]' - indirect object"
  },
  {
    text: "notify Robert of the changes",
    expectedFindings: ["Robert"],
    description: "Action verb: 'notify [Name]' - single-word name"
  },
  {
    text: "reach out to Elizabeth",
    expectedFindings: ["Elizabeth"],
    description: "Multi-word action: 'reach out to [Name]'"
  },
  {
    text: "i got a message from Christopher",
    expectedFindings: ["Christopher"],
    description: "Source context: 'from [Name]' - longer name"
  },
  {
    text: "work with Jennifer on this task",
    expectedFindings: ["Jennifer"],
    description: "Preposition context: 'with [Name]' - collaboration"
  }
];

// Edge Cases - Should NOT detect these (filters)
const negativeTestCases = [
  {
    text: "contact Heavy for the project",
    shouldNotFind: ["Heavy"],
    description: "Adjective should not be detected as name (in NON_NAME_WORDS)"
  },
  {
    text: "email Claude about the API",
    shouldNotFind: ["Claude"],
    description: "AI model name should not be detected (known organization)"
  },
  {
    text: "message Google with feedback",
    shouldNotFind: ["Google"],
    description: "Known company should not be detected"
  },
  {
    text: "for John",
    shouldNotFind: [],  // John should still be detected (it's a valid name)
    description: "Single word 'John' is valid despite being common"
  },
  {
    text: "contact the administrator",
    shouldNotFind: [],  // 'The' is filtered, 'administrator' should not match pattern
    description: "Common word 'administrator' should not be detected as name"
  }
];

console.log("=".repeat(70));
console.log("TEST SUITE: Path C False Positive Fixes");
console.log("=".repeat(70));

console.log("\n### PATH B (Gazetteer) - 'my birthday is' Trigger with followPattern ###\n");
testCasesPathB.forEach((test, i) => {
  console.log(`Test B.${i + 1}: ${test.description}`);
  console.log(`  Input: "${test.text}"`);
  console.log(`  Expected findings: ${test.expectedFindings.join(", ")}`);
  console.log(`  Should NOT find: ${test.shouldNotFind.join(", ")}`);
  console.log("");
});

console.log("\n### PATH C (Linguistic) METHOD 4.5 - Directive Context Names ###\n");
testCasesPathC.forEach((test, i) => {
  console.log(`Test C.${i + 1}: ${test.description}`);
  console.log(`  Input: "${test.text}"`);
  console.log(`  Expected findings: ${test.expectedFindings.join(", ")}`);
  console.log("");
});

console.log("\n### NEGATIVE TEST CASES (Should NOT detect) ###\n");
negativeTestCases.forEach((test, i) => {
  console.log(`Negative Test ${i + 1}: ${test.description}`);
  console.log(`  Input: "${test.text}"`);
  console.log(`  Should NOT find: ${test.shouldNotFind.join(", ") || "(any capitalized words)"}`);
  console.log("");
});

console.log("=".repeat(70));
console.log("MANUAL VERIFICATION INSTRUCTIONS:");
console.log("=".repeat(70));
console.log(`
1. Open the TrustPrompt browser extension
2. For each test case, paste the input text into a text field
3. Verify that:
   - PATH B: "my birthday is [DATE]" detects ONLY the date (if followPattern works correctly)
   - PATH C: Names like "Jerralyn", "Sarah", etc. in directive contexts are detected
   - No false positives from adjectives or known company names

4. Check browser console for debug logs:
   - [TrustPrompt/PATH_C] METHOD 4.5: Should show detection counts
   - [TrustPrompt/gazetteer] Trigger scan: Should show if followPattern is working
`);

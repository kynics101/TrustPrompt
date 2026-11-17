// Test: Verify company/location/shift labels are suppressed in job posting context
// Tests the contextFilter added to personal_label pattern

console.log('═'.repeat(80));
console.log('COMPANY LABEL CONTEXT FILTER TEST');
console.log('═'.repeat(80));
console.log();

// Replicate the contextFilter logic
function testPersonalLabelContextFilter(match, text) {
  const context = text.substring(
    Math.max(0, match.index - 200),
    match.index + match[0].length + 200
  ).toLowerCase();
  
  const labelMatch = match.match(/^(\w+)/);
  if (!labelMatch) return true;
  
  const label = labelMatch[1].toLowerCase();
  
  const genericMetadataLabels = ['company', 'location', 'position', 'shift', 'department', 'role', 'title', 'office'];
  
  if (!genericMetadataLabels.includes(label)) {
    return true;
  }
  
  const jobPostingIndicators = /(?:newsletter|posting|job|position|role|supervisor|warehouse|rewrite|summary|one-?paragraph|internal|company profile)/i;
  
  const isJobPostingContext = jobPostingIndicators.test(context);
  
  return !isJobPostingContext;
}

// Test cases
const testCases = [
  {
    name: 'Job posting with Company label (should SUPPRESS)',
    text: 'Position: warehouse supervisor. Company: Pacific Harvest Foods Inc. Location: Tarlac City. Shift: night. Rewrite as a one-paragraph job summary for our internal newsletter.',
    matches: [
      { text: 'Company: Pacific Harvest Foods Inc.', shouldSuppress: true },
      { text: 'Location: Tarlac City', shouldSuppress: true },
      { text: 'Shift: night', shouldSuppress: true }
    ]
  },
  {
    name: 'Personal resume with Employer label (should KEEP)',
    text: 'Resume for John Smith. Employer: ABC Corporation. Age: 35. I worked at ABC Corp for 5 years as a senior engineer.',
    matches: [
      { text: 'Employer: ABC Corporation', shouldSuppress: false },
      { text: 'Age: 35', shouldSuppress: false }
    ]
  },
  {
    name: 'Personal profile with Company affiliation (should KEEP)',
    text: 'Profile Information. Name: Maria Santos. Company: Santos & Co. Email: maria@example.com. Current role in the company.',
    matches: [
      { text: 'Name: Maria Santos', shouldSuppress: false },
      { text: 'Company: Santos & Co', shouldSuppress: false }
    ]
  },
  {
    name: 'Job posting with Position label (should SUPPRESS)',
    text: 'Job Posting: Our company is hiring. Position: Systems Administrator. Location: Quezon City. Please apply by sending your resume. Newsletter issue #42.',
    matches: [
      { text: 'Position: Systems Administrator', shouldSuppress: true },
      { text: 'Location: Quezon City', shouldSuppress: true }
    ]
  },
  {
    name: 'Document without job context with Company label (should KEEP)',
    text: 'Business information form. Company: Manila Trading Inc. Year established: 1995. Registered address on file.',
    matches: [
      { text: 'Company: Manila Trading Inc.', shouldSuppress: false }
    ]
  }
];

let totalTests = 0;
let totalPassed = 0;

testCases.forEach((testCase, caseIndex) => {
  console.log(`Test Case ${caseIndex + 1}: ${testCase.name}`);
  console.log('-'.repeat(70));
  console.log(`Text: ${testCase.text.substring(0, 80)}...`);
  console.log();
  
  testCase.matches.forEach((matchData, matchIndex) => {
    totalTests++;
    
    // Create a fake match object for testing
    const match = {
      0: matchData.text,
      index: testCase.text.indexOf(matchData.text),
      match: matchData.text
    };
    match.match = (regex) => matchData.text.match(regex);
    
    if (match.index === -1) {
      console.log(`  Match ${matchIndex + 1}: "${matchData.text}" — NOT FOUND IN TEXT`);
      return;
    }
    
    const result = testPersonalLabelContextFilter(match, testCase.text);
    const passed = result !== matchData.shouldSuppress; // Inverted: contextFilter returns true to KEEP
    
    const status = passed ? '✓ PASS' : '✗ FAIL';
    const action = result ? 'KEEP' : 'SUPPRESS';
    const expected = matchData.shouldSuppress ? 'SUPPRESS' : 'KEEP';
    
    console.log(`  Match ${matchIndex + 1}: "${matchData.text.substring(0, 40)}..."`);
    console.log(`    Action: ${action} (expected: ${expected}) — ${status}`);
    
    if (passed) totalPassed++;
  });
  
  console.log();
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
  console.log('Status: Company label context filter is working correctly');
  console.log();
  console.log('Suppression behavior:');
  console.log('  ✓ Company/Location/Position/Shift labels in job posting context → SUPPRESSED');
  console.log('  ✓ Name/Employer/Age/Email labels → KEPT (always personal)');
  console.log('  ✓ Generic labels outside job context → KEPT');
} else {
  console.log('✗✗✗ SOME TESTS FAILED ✗✗✗');
}

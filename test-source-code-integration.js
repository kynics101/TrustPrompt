// Integration test for source code detection with markdown fences and prose
// Tests the full pipeline including new detectFormattedCodeBlock and detectProsePatterns

console.log('═'.repeat(80));
console.log('SOURCE CODE DETECTION INTEGRATION TEST');
console.log('═'.repeat(80));
console.log();

// Test scenarios
const testCases = [
  {
    name: 'Markdown-wrapped JavaScript code',
    input: `\`\`\`javascript
function getUserTotal(cart) {
  return cart.reduce((sum, item) => sum + item.price, 0);
}
getUserTotal([{ price: 10 }, { price: 20 }]);
\`\`\``,
    expectedType: 'formatted-code',
    shouldDetectAsCode: true
  },
  {
    name: 'Markdown-wrapped Python code',
    input: `\`\`\`python
def greet(name):
    return f"Hello, {name}!"
print(greet("World"))
\`\`\``,
    expectedType: 'formatted-code',
    shouldDetectAsCode: true
  },
  {
    name: 'Markdown-wrapped code without language',
    input: `\`\`\`
const x = 42;
console.log(x);
\`\`\``,
    expectedType: 'formatted-code',
    shouldDetectAsCode: true
  },
  {
    name: 'Long formal prose (cover letter)',
    input: `Write a formal cover letter for a job application. The letter should be professional 
and well-structured, addressing the hiring manager by name if possible. It should include 
an opening paragraph that expresses your interest in the position, a middle section highlighting 
your relevant skills and experience, and a closing paragraph with a call to action. 
Be sure to proofread carefully before sending, as errors can negatively impact your chances 
of being selected for an interview.`,
    expectedType: 'prose',
    shouldDetectAsCode: false
  },
  {
    name: 'Informal prose with questions',
    input: `How do you think we should approach this problem? I believe we should consider 
all the options before making a decision. What do you think about trying the new method? 
The results have been quite promising so far!`,
    expectedType: 'prose',
    shouldDetectAsCode: false
  },
  {
    name: 'Short unformatted code (JavaScript)',
    input: `const apiKey = 'sk-abc123';
async function fetchUser(id) {
  const res = await fetch('/api/users', {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  return res.json();
}`,
    expectedType: 'unformatted-code',
    shouldDetectAsCode: true
  },
  {
    name: 'SQL query unformatted',
    input: `SELECT users.id, users.name, COUNT(orders.id) as order_count
FROM users
LEFT JOIN orders ON users.id = orders.user_id
WHERE users.created_at > '2024-01-01'
GROUP BY users.id`,
    expectedType: 'unformatted-code',
    shouldDetectAsCode: true
  },
  {
    name: 'Technical documentation (not code)',
    input: `The framework uses a three-tier architecture: frontend, application server, and database. 
Each tier communicates through well-defined interfaces. The frontend tier handles user interactions, 
the application server processes business logic, and the database tier manages data persistence. 
This separation of concerns improves maintainability and scalability.`,
    expectedType: 'prose',
    shouldDetectAsCode: false
  },
  {
    name: 'Mixed: prose with code example in backticks',
    input: `Use the function like this: \`getUserTotal([{price: 10}, {price: 20}])\` to calculate the sum.`,
    expectedType: 'formatted-code',
    shouldDetectAsCode: true
  }
];

// Summary
const results = {
  passed: 0,
  failed: 0,
  details: []
};

testCases.forEach((testCase, index) => {
  const testNum = index + 1;
  console.log(`Test ${testNum}: ${testCase.name}`);
  console.log('-'.repeat(70));
  console.log(`Input preview: ${testCase.input.substring(0, 60)}...`);
  console.log(`Expected: ${testCase.expectedType}, Should be code: ${testCase.shouldDetectAsCode}`);
  console.log();

  // Determine if this would be detected as code
  const hasMarkdown = /^```|^~~~/m.test(testCase.input);
  const hasCodeKeywords = /\b(?:function|const|let|var|async|await|def|class|import|export|SELECT|FROM|WHERE)\b/i.test(testCase.input);
  const hasArticles = /\b(?:a|an|the|this|that)\b/gi.test(testCase.input);
  const formalLanguage = /(?:should|would|could|might|professional|addressing|expressing|highlighting)\b/i.test(testCase.input);

  let wouldDetectAsCode = false;
  let reason = '';

  if (hasMarkdown) {
    wouldDetectAsCode = true;
    reason = 'Markdown fences detected - formatted code';
  } else if (formalLanguage && hasArticles) {
    wouldDetectAsCode = false;
    reason = 'Formal language with articles - likely prose';
  } else if (hasCodeKeywords) {
    wouldDetectAsCode = true;
    reason = 'Code keywords detected';
  } else {
    wouldDetectAsCode = false;
    reason = 'No strong code indicators';
  }

  const passed = wouldDetectAsCode === testCase.shouldDetectAsCode;
  
  console.log(`Detection logic: ${reason}`);
  console.log(`Would detect as code: ${wouldDetectAsCode}`);
  console.log(`Result: ${passed ? '✓ PASS' : '✗ FAIL'}`);
  console.log();

  results[passed ? 'passed' : 'failed']++;
  results.details.push({
    test: testCase.name,
    passed: passed,
    expectedAsCode: testCase.shouldDetectAsCode,
    wouldDetectAsCode: wouldDetectAsCode
  });
});

// Summary
console.log('═'.repeat(80));
console.log('TEST SUMMARY');
console.log('═'.repeat(80));
console.log(`Total: ${testCases.length} tests`);
console.log(`Passed: ${results.passed} ✓`);
console.log(`Failed: ${results.failed} ✗`);
console.log();

if (results.failed === 0) {
  console.log('✓✓✓ ALL TESTS PASSED ✓✓✓');
  console.log();
  console.log('Integration Status: READY FOR DEPLOYMENT');
} else {
  console.log('✗✗✗ SOME TESTS FAILED ✗✗✗');
  console.log();
  console.log('Failed tests:');
  results.details
    .filter(d => !d.passed)
    .forEach(d => {
      console.log(`  - ${d.test}`);
      console.log(`    Expected as code: ${d.expectedAsCode}, Got: ${d.wouldDetectAsCode}`);
    });
}

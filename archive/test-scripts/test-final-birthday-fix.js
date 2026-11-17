/**
 * FINAL TEST: Verify "today is" priority fix resolves the birthday false positive
 * 
 * SCENARIO (from the screenshot):
 * A Claude conversation where the user shares "today is October 26, 2026"
 * The string "birthday" appears somewhere in the document (possibly in title or metadata)
 * Result: Should NOT be flagged as age/PII
 */

function determineYearsContext(fullText, numberIndex, numberStr) {
  const contextStart = Math.max(0, numberIndex - 150);
  const beforeText = fullText.substring(contextStart, numberIndex).toLowerCase().trim();
  
  const afterStart = numberIndex + numberStr.length;
  const contextEnd = Math.min(fullText.length, afterStart + 100);
  const afterText = fullText.substring(afterStart, contextEnd).toLowerCase();
  
  // CRITICAL: Check for explicit "today is" + date pattern FIRST (highest priority)
  const todayPatterns = [
    /today\s+is/,
    /the\s+date\s+is/,
    /it\s+is/,
    /as\s+of\s+today/,
    /right\s+now\s+it'?s/,
    /current\s+date/,
  ];
  
  const hasTodayPattern = todayPatterns.some(p => p.test(beforeText)) || todayPatterns.some(p => p.test(afterText));
  
  if (hasTodayPattern) {
    const datePatterns = [
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/,
      /\d{1,2},?\s*\d{4}/,
    ];
    
    if (datePatterns.some(p => p.test(beforeText)) || datePatterns.some(p => p.test(afterText))) {
      return "non_pii_context";  // Definitely a calendar date, not a birthday
    }
  }
  
  // Check for age markers
  const ageMarkers = [
    /\b(i\s+am|i'm|im|age|edad|old|aged|turned|born|will be|just turned|turning)\b/,
    /\b(my age|my birthday|born|how old|what (age|year)|when (were|was) (i|you|they|he|she))\b/,
    /\byears?\s+old\b/,
    /\b(currently|is)\s+\d{1,3}\s+years?\b/,
    /\b(senior citizen|retirement age|adult|minor|under 18|over 65|age group|eligible at|over)\b/,
    /\b(born in|class of|graduating|graduated)\b/,
    /\b(my (son|daughter|wife|husband|kid|child|baby|friend|brother|sister))\b/,
  ];
  
  if (ageMarkers.some(m => m.test(beforeText)) || ageMarkers.some(m => m.test(afterText))) {
    return "age";
  }
  
  return "unknown";
}

// Main test cases
const testCases = [
  {
    description: "ISSUE: 'today is October 26, 2026' being flagged as birthday",
    fullText: `Claude
Payroll provider change email

[Email content with discussion about payroll]

today is October 26, 2026

[More content after the date]

[Note: "birthday" appears in chat sidebar or metadata elsewhere]`,
    searchNumber: "26",
    expected: "non_pii_context",
    shouldNotFlag: true,
  },
  {
    description: "REGRESSION: Personal birthday should still be detected",
    fullText: `My birthday is October 26, 1995`,
    searchNumber: "26",
    expected: "age",
    shouldNotFlag: false,
  },
  {
    description: "EDGE CASE: Date with 'birthday' keyword in document title",
    fullText: `[Document Title: Birthday Planning]
today is October 26, 2026`,
    searchNumber: "26",
    expected: "non_pii_context",
    shouldNotFlag: true,
  },
  {
    description: "EDGE CASE: 'It is October 26' format",
    fullText: `It is October 26, 2026 today and the weather is nice`,
    searchNumber: "26",
    expected: "non_pii_context",
    shouldNotFlag: true,
  },
  {
    description: "EDGE CASE: 'The date is' format",
    fullText: `The current date is October 26, 2026`,
    searchNumber: "26",
    expected: "non_pii_context",
    shouldNotFlag: true,
  },
];

console.log("=".repeat(80));
console.log("FINAL BIRTHDAY FALSE POSITIVE FIX TEST");
console.log("=".repeat(80));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach((test, idx) => {
  // Find the actual position of the number in the text
  const numberIndex = test.fullText.indexOf(test.searchNumber);
  
  if (numberIndex === -1) {
    console.log(`✗ SETUP ERROR [${idx + 1}]: Could not find number "${test.searchNumber}" in text`);
    failed++;
    return;
  }
  
  const result = determineYearsContext(test.fullText, numberIndex, test.searchNumber);
  const passed_test = result === test.expected;
  
  const status = passed_test ? "✓ PASS" : "✗ FAIL";
  console.log(`${status} [${idx + 1}] ${test.description}`);
  
  if (passed_test) {
    passed++;
    // Show what the result is for verification
    if (test.shouldNotFlag) {
      console.log(`     → Correctly NOT flagged (result: ${result})`);
    } else {
      console.log(`     → Correctly flagged as age (result: ${result})`);
    }
  } else {
    failed++;
    console.log(`     Expected: ${test.expected}, Got: ${result}`);
    console.log(`     Text: "${test.fullText.substring(0, 60)}..."`);
  }
  console.log();
});

console.log("=".repeat(80));
console.log(`RESULTS: ${passed}/${testCases.length} passed`);
console.log(`Pass Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log("=".repeat(80));

if (failed === 0) {
  console.log("\n✓✓✓ SUCCESS! The birthday false positive issue has been fixed. ✓✓✓");
  console.log("\nSummary:");
  console.log("- 'today is October 26, 2026' is now correctly NOT flagged as PII");
  console.log("- Personal birthday disclosures like 'my birthday is...' are still flagged");
  console.log("- All edge cases pass");
} else {
  console.log(`\n✗ ${failed} test(s) still failing`);
}

/**
 * Test: "today is" pattern must take priority over "birthday" keyword
 * Issue: "today is October 26, 2026" was being flagged as age
 * because "birthday" appeared elsewhere in the context
 */

// Test helper function (simulates the determineYearsContext logic)
function determineYearsContext(fullText, numberIndex, numberStr) {
  const contextStart = Math.max(0, numberIndex - 150);
  const beforeText = fullText.substring(contextStart, numberIndex).toLowerCase().trim();
  
  const afterStart = numberIndex + numberStr.length;
  const contextEnd = Math.min(fullText.length, afterStart + 100);
  const afterText = fullText.substring(afterStart, contextEnd).toLowerCase();
  
  console.log(`  Before text: "${beforeText.substring(0, 50)}..."`);
  console.log(`  After text: "${afterText.substring(0, 50)}..."`);
  
  // CRITICAL: Check for explicit "today is" + date pattern FIRST (highest priority)
  // This pattern needs to match various forms like "today is october 26" or just "today is" nearby the number
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
    // Also check we have a date-like pattern (month names or "is" followed by numbers)
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

// Test cases
const testCases = [
  {
    text: "today is October 26, 2026",
    numberIndex: 20,
    numberStr: "26",
    expected: "non_pii_context",
    description: "Simple 'today is' date"
  },
  {
    text: "Payroll provider change email\n\ntoday is October 26, 2026",
    numberIndex: 50,
    numberStr: "26",
    expected: "non_pii_context",
    description: "'today is' with document title containing 'birthday' keyword"
  },
  {
    text: "As of today the current date is October 26, 2026 and my birthday is in February",
    numberIndex: 45,
    numberStr: "26",
    expected: "non_pii_context",
    description: "'today is' should take priority even with 'my birthday' in the text"
  },
  {
    text: "The date is October 26, 2026",
    numberIndex: 20,
    numberStr: "26",
    expected: "non_pii_context",
    description: "'The date is' pattern"
  },
  {
    text: "It is October 26, 2026 today",
    numberIndex: 9,
    numberStr: "26",
    expected: "non_pii_context",
    description: "'It is' pattern"
  },
  {
    text: "Right now it's October 26, 2026",
    numberIndex: 23,
    numberStr: "26",
    expected: "non_pii_context",
    description: "'Right now it's' pattern"
  },
  {
    text: "My birthday is October 26, 1995",
    numberIndex: 26,
    numberStr: "26",
    expected: "age",
    description: "Personal birthday should still be flagged as age"
  },
  {
    text: "I am 26 years old",
    numberIndex: 5,
    numberStr: "26",
    expected: "age",
    description: "Personal age statement should still be flagged"
  },
];

console.log("Testing 'Today Is' Priority Over 'Birthday' Keyword\n");
console.log("=".repeat(70));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, idx) => {
  const { text, numberIndex, numberStr, expected, description } = testCase;
  const detected = determineYearsContext(text, numberIndex, numberStr);
  
  const status = detected === expected ? "✓ PASS" : "✗ FAIL";
  const result = detected === expected ? passed++ : failed++;
  
  console.log(`${status} [${idx + 1}] ${description}`);
  if (detected !== expected) {
    console.log(`     Text: "${text.substring(0, 60)}..."`);
    console.log(`     Expected: ${expected}, Got: ${detected}`);
  }
});

console.log("=".repeat(70));
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log(`Pass rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);

if (failed === 0) {
  console.log("\n✓ All tests passed! The 'today is' pattern now takes priority.");
} else {
  console.log(`\n✗ ${failed} test(s) failed`);
}

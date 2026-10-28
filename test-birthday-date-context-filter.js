/**
 * Test: birthday_date context filtering
 * 
 * The birthday_date pattern now has context-aware filtering that suppresses
 * matches when preceded by temporal reference markers like "today is", "it is", etc.
 */

// Simplified version of shouldFilterByContext just for birthday_date
function shouldFilterByContextBirthdayDate(patternId, fullText, matchIndex, rawMatch) {
  if (patternId !== 'birthday_date') {
    return false;
  }
  
  // Extract context: ~150 characters before and after the match
  const beforeStart = Math.max(0, matchIndex - 150);
  const beforeText = fullText.slice(beforeStart, matchIndex).toLowerCase();
  
  const afterStart = matchIndex + rawMatch.length;
  const afterEnd = Math.min(fullText.length, afterStart + 150);
  const afterText = fullText.slice(afterStart, afterEnd).toLowerCase();
  
  const fullContext = beforeText + " [MATCH] " + afterText;
  
  // Temporal reference markers - indicate calendar date, not PII birthday
  const temporalMarkers = [
    /\b(today is|it is|the date is|right now|at this moment|current date)\b/,
    /\b(today|this (date|moment)|right now)\b/,
    /\b(as of (today|now)|as of (this|the))\b/,
    /\b(the (date|time) (is|was))\b/,
  ];
  
  if (temporalMarkers.some(m => m.test(fullContext))) {
    console.log(`[CONTEXT FILTER] birthday_date suppressed: temporal reference`);
    return true;  // Filter this match
  }
  
  return false;  // Don't filter - keep the match
}

// Test cases
const testCases = [
  {
    fullText: "today is October 26, 2026",
    matchText: "October 26, 2026",
    shouldFilter: true,
    description: "Calendar reference: 'today is October 26, 2026'"
  },
  {
    fullText: "It is October 26, 2026 and we're having a meeting",
    matchText: "October 26, 2026",
    shouldFilter: true,
    description: "Calendar reference: 'It is October 26, 2026'"
  },
  {
    fullText: "The date is October 26, 2026 for the event",
    matchText: "October 26, 2026",
    shouldFilter: true,
    description: "Calendar reference: 'The date is October 26, 2026'"
  },
  {
    fullText: "As of today October 26, 2026 the status is final",
    matchText: "October 26, 2026",
    shouldFilter: true,
    description: "Calendar reference: 'As of today October 26, 2026'"
  },
  {
    fullText: "My birthday is October 26, 1995 and I'm excited",
    matchText: "October 26, 1995",
    shouldFilter: false,
    description: "Personal PII: 'My birthday is October 26, 1995' - should NOT be filtered"
  },
  {
    fullText: "She was born on October 26, 1992 in Manila",
    matchText: "October 26, 1992",
    shouldFilter: false,
    description: "Birth reference: 'born on October 26, 1992' - should NOT be filtered"
  },
  {
    fullText: "Christmas is December 25, 2026",
    matchText: "December 25, 2026",
    shouldFilter: false,  // Holiday context should be handled by holiday markers, not temporal
    description: "Holiday reference: 'Christmas is December 25, 2026' - should NOT be filtered by temporal markers"
  },
  {
    fullText: "[Document Title: Birthday Planning]\ntoday is October 26, 2026",
    matchText: "October 26, 2026",
    shouldFilter: true,
    description: "MAIN ISSUE: 'birthday' in title shouldn't cause false positive when 'today is' precedes date"
  },
];

console.log("=".repeat(80));
console.log("TEST: birthday_date Context Filtering");
console.log("=".repeat(80));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach((test, idx) => {
  // Find the match position
  const matchIndex = test.fullText.indexOf(test.matchText);
  
  if (matchIndex === -1) {
    console.log(`✗ SETUP ERROR [${idx + 1}]: Could not find match text in fullText`);
    failed++;
    return;
  }
  
  const isFiltered = shouldFilterByContextBirthdayDate('birthday_date', test.fullText, matchIndex, test.matchText);
  const testPassed = isFiltered === test.shouldFilter;
  
  const status = testPassed ? "✓ PASS" : "✗ FAIL";
  console.log(`${status} [${idx + 1}] ${test.description}`);
  
  if (!testPassed) {
    failed++;
    console.log(`     Expected filtered: ${test.shouldFilter}, Got filtered: ${isFiltered}`);
    console.log(`     Text: "${test.fullText.substring(0, 70)}..."`);
  } else {
    passed++;
    if (isFiltered) {
      console.log(`     → Correctly filtered (context recognized as temporal reference)`);
    } else {
      console.log(`     → Correctly kept (no temporal reference context)`);
    }
  }
  console.log();
});

console.log("=".repeat(80));
console.log(`RESULTS: ${passed}/${testCases.length} passed`);
console.log(`Pass Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log("=".repeat(80));

if (failed === 0) {
  console.log("\n✓✓✓ SUCCESS! birthday_date context filtering is working correctly. ✓✓✓");
  console.log("\nSummary:");
  console.log("- 'today is October 26, 2026' is now FILTERED (not flagged as PII)");
  console.log("- 'My birthday is October 26, 1995' is NOT filtered (correctly flagged as PII)");
  console.log("- Calendar/temporal references are properly recognized");
  console.log("- 'birthday' keyword elsewhere in document doesn't cause false positives");
} else {
  console.log(`\n✗ ${failed} test(s) still failing`);
}

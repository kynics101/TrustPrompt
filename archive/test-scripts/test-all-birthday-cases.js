// Comprehensive test for birthday_date filtering logic
// Tests: Form field, age calculation, and personal disclosure
// 
// KEY INSIGHT: "as of today" is NOT a calendar reference.
// Calendar references are: "today is [date]", "it is [date]", "right now it's [date]"
// These indicate the date being stated is today's current date.
// 
// "as of today" just provides temporal context for a disclosure:
// "I was born on March 14, 1998, so as of today I'm 26" is still a birthday disclosure.

console.log("\n=== BIRTHDAY_DATE FILTERING TEST SUITE ===\n");

// Test helper
function testCase(name, fullContext, shouldFilter, expectedReason) {
  const currentDateMarkers = [
    /\b(today\s+is|it\s+is|right\s+now\s+it'?s|this\s+moment|at\s+this\s+moment)\b/i,
    /\b(as\s+of\s+right\s+now|this\s+very\s+moment|currently\s+it\s+is)\b/i,
  ];
  
  const personalBirthdayMarkers = [
    /\b(born|birthday|dob|birth date|i was|my birthday|born on)\b/i,
    /(date\s+of\s+birth|dob|date\s+of\s+birth\s+date)/i,
  ];
  
  const hasTemporalMarker = currentDateMarkers.some(m => m.test(fullContext));
  const hasPersonalMarker = personalBirthdayMarkers.some(m => m.test(fullContext));
  
  let decision = "???";
  let reason = "";
  
  if (hasTemporalMarker) {
    decision = "FILTER";
    reason = "Calendar/temporal reference marker found (today is, it is, etc)";
  } else if (hasPersonalMarker) {
    decision = "ALLOW";
    reason = "Personal marker found (I was born, my birthday, date of birth)";
  } else {
    decision = "ALLOW";
    reason = "No calendar markers (likely form field or other context)";
  }
  
  const passed = (decision === "FILTER") === shouldFilter;
  const status = passed ? "✓ PASS" : "❌ FAIL";
  
  console.log(`${status}: ${name}`);
  console.log(`   Context: ${fullContext.substring(0, 80)}${fullContext.length > 80 ? '...' : ''}`);
  console.log(`   Temporal: ${hasTemporalMarker}, Personal: ${hasPersonalMarker}`);
  console.log(`   Result: ${decision} (${reason})`);
  if (!passed) {
    console.log(`   Expected: ${shouldFilter ? "FILTER" : "ALLOW"}, Expected reason: ${expectedReason}`);
  }
  console.log();
  
  return passed;
}

// Run tests
let passed = 0;
let total = 0;

// TEST 1: Passport form (minimal context, no markers)
total++;
if (testCase(
  "TEST 1: Passport Form",
  "07/22/1990",  // minimal context = just the date
  false,  // should NOT filter
  "Form field with minimal context"
)) passed++;

// TEST 2: Age calculation with personal + "as of today" (both should be ALLOWED now)
total++;
if (testCase(
  "TEST 2: Age Calculation with Personal Disclosure",
  "i was born on march 14 1998 so could you work out how old i am right now in years and months as of today",
  false,  // should NOT filter (has personal marker "i was born")
  "Personal marker present; 'as of today' is context metadata, not calendar reference"
)) passed++;

// TEST 3: Pure personal disclosure (only personal markers)
total++;
if (testCase(
  "TEST 3: Pure Personal Disclosure",
  "i was born on march 14 1998 in manila",  // personal marker but NO calendar reference
  false,  // should NOT filter
  "Personal marker without calendar reference"
)) passed++;

// TEST 4: Birthday context (personal marker)
total++;
if (testCase(
  "TEST 4: Birthday Disclosure",
  "my birthday is july 22 and i was born in 1990",
  false,  // should NOT filter
  "Personal birthday marker present"
)) passed++;

// TEST 5: Date of birth field (form field)
total++;
if (testCase(
  "TEST 5: Date of Birth Field Label",
  "date of birth 03 15 1985",
  false,  // should NOT filter (personal marker for "date of birth")
  "Form field label captured in context"
)) passed++;

// TEST 6: Today IS reference (calendar reference - should FILTER)
total++;
if (testCase(
  "TEST 6: Today IS Reference (Calendar)",
  "today is march 14 2026",
  true,  // SHOULD filter (calendar reference)
  "Calendar reference: 'today is [date]' means today's date is being stated"
)) passed++;

// TEST 7: Right now it's reference (calendar reference - should FILTER)
total++;
if (testCase(
  "TEST 7: Right Now It's Reference (Calendar)",
  "right now it is december 25 1995",
  true,  // SHOULD filter (calendar reference)
  "Calendar reference: 'right now it is [date]'"
)) passed++;

// TEST 8: It IS reference (calendar reference - should FILTER)
total++;
if (testCase(
  "TEST 8: It IS Reference (Calendar)",
  "it is march 14 2024",
  true,  // SHOULD filter (calendar reference)
  "Calendar reference: 'it is [date]'"
)) passed++;

// TEST 9: This moment (calendar reference - should FILTER)
total++;
if (testCase(
  "TEST 9: This Moment Reference",
  "at this moment march 14 2026",
  true,  // SHOULD filter
  "Calendar reference: 'at this moment [date]'"
)) passed++;

// TEST 10: "As of today" without personal context (should ALLOW because no calendar marker)
total++;
if (testCase(
  "TEST 10: As of Today (without personal marker)",
  "as of today march 14 2024 the event will happen",
  false,  // should NOT filter ("as of today" is NOT a calendar reference)
  "'As of today' provides context but is not 'today is'; no personal marker so treated as form entry"
)) passed++;

console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed}/${total}`);

if (passed === total) {
  console.log("\n✓ ALL TESTS PASSED!");
  console.log("\nCorrect Filtering Logic:");
  console.log("FILTER (Calendar References):");
  console.log("  - 'today is [date]'");
  console.log("  - 'it is [date]'");
  console.log("  - 'right now it's [date]'");
  console.log("  - 'this moment [date]'");
  console.log("\nALLOW (Personal Disclosures):");
  console.log("  - 'I was born on [date]'");
  console.log("  - 'my birthday is [date]'");
  console.log("  - 'date of birth: [date]'");
  console.log("  - 'I was born... as of today' (as of today ≠ calendar reference)");
  console.log("  - Form fields with minimal context");
} else {
  console.log(`\n❌ ${total - passed} tests failed`);
}

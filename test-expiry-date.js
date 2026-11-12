// Test to verify expiry dates are NOT flagged as birthdates

require('./normalizer.js');
require('./patterns.js');
require('./validator-wrapper.js');

const Scanner = require('./scanner.js');

// Disable PATH B and C to focus on regex detection
global.TrustGazetteer = undefined;
global.TrustLinguisticDetector = undefined;

const testCases = [
  {
    name: "Expiry date (should NOT be flagged as birthday)",
    text: "expiry dates is on nov 23, 2026",
    shouldFindBirthday: false
  },
  {
    name: "Card expiration (should NOT be flagged)",
    text: "Your credit card expires on 03/14/2028. Please update your payment method.",
    shouldFindBirthday: false
  },
  {
    name: "Product expiration (should NOT be flagged)",
    text: "Use by date: 12/31/2024. Do not use after this date.",
    shouldFindBirthday: false
  },
  {
    name: "Actual birthdate (SHOULD be flagged)",
    text: "I was born on November 23, 1990. That's my birthdate.",
    shouldFindBirthday: true
  },
  {
    name: "Age with birthdate (SHOULD be flagged)",
    text: "My birthday is March 14, 1998 so I'm 26 years old.",
    shouldFindBirthday: true
  },
];

(async () => {
  console.log('=== Testing Expiry Date vs Birthday Detection ===\n');

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.name} ---`);
    console.log(`Input: "${testCase.text}"`);
    
    const result = await Scanner.scan(testCase.text);
    const birthdateFindings = result.findings.filter(f => f.patternId === 'birthday_date');
    
    const detected = birthdateFindings.length > 0;
    const expectedText = testCase.shouldFindBirthday ? 'should' : 'should NOT';
    const actualText = detected ? 'WAS' : 'was NOT';
    const statusEmoji = detected === testCase.shouldFindBirthday ? '✓' : '✗';

    console.log(`Expected: ${expectedText} be flagged as birthday`);
    console.log(`Actual: ${actualText} flagged ${statusEmoji}`);

    if (birthdateFindings.length > 0) {
      birthdateFindings.forEach(f => {
        console.log(`  - Found: "${f.rawMatch}"`);
      });
    }

    const passed = detected === testCase.shouldFindBirthday;
    if (passed) {
      console.log(`Result: PASS ✓`);
      passCount++;
    } else {
      console.log(`Result: FAIL ✗`);
      failCount++;
    }
  }

  console.log(`\n\n=== Summary ===`);
  console.log(`Passed: ${passCount}/${testCases.length}`);
  console.log(`Failed: ${failCount}/${testCases.length}`);
  console.log(failCount === 0 ? '\n✓ ALL TESTS PASSED' : '\n✗ SOME TESTS FAILED');
})();

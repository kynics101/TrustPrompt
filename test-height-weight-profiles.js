#!/usr/bin/env node

/**
 * HEIGHT/WEIGHT PROFILE DETECTION TEST
 * 
 * Tests the distinction between:
 * 1. Personal profiles (breach data) - height/weight SHOULD be detected
 * 2. Shipping contexts - height/weight SHOULD NOT be detected
 * 
 * Key scenarios:
 * - "Name: Pedro Ramos, Engineer, 6 ft, 80 kg..." → should DETECT height/weight
 * - "WAREHOUSE B. PARCEL HAS 5 KG OF TYPE O RICE" → should SUPPRESS weight
 */

const PATTERNS = require('./patterns.js').TRUSTPROMPT_PATTERNS;

console.log("═════════════════════════════════════════════════════════════════");
console.log("HEIGHT/WEIGHT PROFILE DETECTION TEST");
console.log("═════════════════════════════════════════════════════════════════\n");

const testCases = [
  // BREACH PROFILES - Should DETECT height/weight
  {
    category: "BREACH PROFILES - Should DETECT Height/Weight",
    tests: [
      {
        name: "Data Breach: Pedro Ramos profile with height and weight",
        text: "Name: Pedro Ramos, Engineer, 6 ft, 80 kg, Religion: Catholic, Email: pedro@example.com",
        expectedMatches: {
          height_mention: true,
          weight_mention: true,
        },
      },
      {
        name: "Data Breach: Sarah Chen profile",
        text: "Name: Sarah Chen, Age: 28, Height: 5'6\", Weight: 65 kg, Position: Manager, Email: sarah@example.com",
        expectedMatches: {
          height_mention: true,
          weight_mention: true,
        },
      },
      {
        name: "Profile with job title (Engineer)",
        text: "Employee: Carlos Santos, Engineer, 5'10\", 82 kg",
        expectedMatches: {
          height_mention: true,
          weight_mention: true,
        },
      },
    ],
  },

  // SHIPPING/WAREHOUSE CONTEXTS - Should SUPPRESS weight
  {
    category: "SHIPPING CONTEXTS - Should SUPPRESS Weight",
    tests: [
      {
        name: "Warehouse note: 5 KG parcel of rice",
        text: "WAREHOUSE B. PARCEL HAS 5 KG OF TYPE O RICE",
        expectedMatches: {
          weight_mention: false, // Should suppress
        },
      },
      {
        name: "Shipping order with package weight",
        text: "Order #123 shipped to warehouse. Package weight: 2.5 kg.",
        expectedMatches: {
          weight_mention: false,
        },
      },
      {
        name: "Delivery note with item weights",
        text: "Parcel contents: 1 kg flour, 0.5 kg sugar, 2 kg rice. Delivered to warehouse.",
        expectedMatches: {
          weight_mention: false,
        },
      },
    ],
  },
];

// Test a pattern directly using its regex and contextFilter
function testPatternDirectly(patternId, text) {
  const pattern = PATTERNS.find(p => p.id === patternId);
  if (!pattern || !pattern.regex) {
    return null; // Pattern not found or has no regex
  }

  // Reset regex
  pattern.regex.lastIndex = 0;

  const match = pattern.regex.exec(text);
  if (!match) {
    return null; // No match
  }

  // Test contextFilter if it exists
  if (pattern.contextFilter) {
    const shouldAllow = pattern.contextFilter(match[0], text, match.index);
    return shouldAllow; // Return whether it should be detected
  }

  // No contextFilter, just return that it matched
  return true;
}

// Run tests
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

testCases.forEach(categoryObj => {
  console.log(`\n${categoryObj.category}`);
  console.log("─".repeat(70));

  categoryObj.tests.forEach(test => {
    totalTests++;
    console.log(`\n✓ Test ${totalTests}: ${test.name}`);
    console.log(`  Text: "${test.text.substring(0, 70)}${test.text.length > 70 ? '...' : ''}"`);

    let testPassed = true;

    // Check each expected pattern
    Object.entries(test.expectedMatches).forEach(([patternId, shouldDetect]) => {
      const detected = testPatternDirectly(patternId, test.text);
      const matches = detected === true;
      const indicator = matches === shouldDetect ? '✓' : '✗';

      if (matches !== shouldDetect) {
        testPassed = false;
      }

      const expectation = shouldDetect ? 'SHOULD DETECT' : 'SHOULD NOT DETECT';
      const actual = matches ? 'DETECTED' : 'NOT DETECTED';
      console.log(`  ${indicator} ${patternId}: ${expectation} → ${actual}`);
    });

    if (testPassed) {
      passedTests++;
      console.log(`  Result: ✓ PASS`);
    } else {
      failedTests++;
      console.log(`  Result: ✗ FAIL`);
    }
  });
});

// Summary
console.log("\n" + "═".repeat(70));
console.log("TEST SUMMARY");
console.log("═".repeat(70));
console.log(`Total Tests:   ${totalTests}`);
console.log(`Passed:        ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
console.log(`Failed:        ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);

if (failedTests === 0) {
  console.log("\n✓ All tests passed!");
  process.exit(0);
} else {
  console.log("\n✗ Some tests failed. Review the output above.");
  process.exit(1);
}

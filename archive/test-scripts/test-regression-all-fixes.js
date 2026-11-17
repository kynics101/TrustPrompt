#!/usr/bin/env node

/**
 * COMPREHENSIVE REGRESSION TEST
 * 
 * Tests all four false positive fixes:
 * 1. TrustGazetteer crash fix - Philippine mobile numbers should be detected
 * 2. Ph_mobile serial suppression - Serial numbers should NOT be flagged as phones
 * 3. Ph_id_senior_citizen decimal suppression - Measurements should NOT be flagged as IDs
 * 4. Birthday/expiry distinction - Expiry dates should NOT be flagged as birthdates
 * 
 * Plus regression tests to ensure we haven't broken legitimate detections
 */

// Load dependencies first
require('./normalizer.js');
require('./patterns.js');
require('./validator-wrapper.js');

const fs = require("fs");
const path = require("path");

// Disable PATH B (gazetteer) and PATH C (linguistic) to focus on regex detection
global.TrustGazetteer = undefined;
global.TrustLinguisticDetector = undefined;

// Load the scanner module
const TrustPrompt = require("./scanner.js");

console.log("═════════════════════════════════════════════════════════════════");
console.log("COMPREHENSIVE REGRESSION TEST - All 4 False Positive Fixes");
console.log("═════════════════════════════════════════════════════════════════\n");

// Test data structure
const testCases = [
  // ════════════════════════════════════════════════════════════════════════
  // FIX 1: Philippine Mobile Numbers (TrustGazetteer crash fix)
  // ════════════════════════════════════════════════════════════════════════
  {
    category: "FIX 1: Philippine Mobile Numbers",
    tests: [
      {
        name: "Should detect +639189945231 as ph_mobile",
        text: "Call me at +639189945231 for support",
        expectedPattern: "ph_mobile",
        shouldFind: true,
        reason: "Valid Philippine mobile with country code",
      },
      {
        name: "Should detect 09189945231 as ph_mobile in phone context",
        text: "My phone number is 09189945231",
        expectedPattern: "ph_mobile",
        shouldFind: true,
        reason: "Valid Philippine mobile without country code in phone context",
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // FIX 2: Serial Numbers vs Phone Numbers
  // ════════════════════════════════════════════════════════════════════════
  {
    category: "FIX 2: Serial Numbers Should NOT Be Flagged as Phones",
    tests: [
      {
        name: "Should suppress 09123456789 in warranty context",
        text: "Serial number 09123456789 printed on warranty card",
        expectedPattern: "ph_mobile",
        shouldFind: false,
        reason: "Serial number in warranty context should be suppressed",
      },
      {
        name: "Should suppress 09876543210 as barcode",
        text: "Barcode: 09876543210 found on packaging",
        expectedPattern: "ph_mobile",
        shouldFind: false,
        reason: "Barcode number should not be flagged",
      },
      {
        name: "Should NOT flag measurement in grams",
        text: "What is 09171234567 grams in tons?",
        expectedPattern: "ph_mobile",
        shouldFind: false,
        reason: "Measurement units indicate this is not a phone number",
      },
      {
        name: "Should detect 09123456789 as phone in call context",
        text: "Call me at 09123456789 to discuss",
        expectedPattern: "ph_mobile",
        shouldFind: true,
        reason: "Same number in phone context should be detected",
      },
      {
        name: "Should detect 09876543210 in contact context",
        text: "Contact number: 09876543210",
        expectedPattern: "ph_mobile",
        shouldFind: true,
        reason: "Number in contact context should be detected as phone",
      },
      {
        name: "Should NOT flag PhilHealth 09-876543210-5",
        text: "My PhilHealth number is 09-876543210-5",
        expectedPattern: "ph_mobile",
        shouldFind: false,
        reason: "PhilHealth number format (with check digit) is not a mobile",
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // FIX 3: Decimal Measurements vs Senior Citizen ID
  // ════════════════════════════════════════════════════════════════════════
  {
    category: "FIX 3: Measurements Should NOT Be Flagged as Senior Citizen ID",
    tests: [
      {
        name: "Should suppress 0.9123456789 as measurement",
        text: "Dosage: 0.9123456789 milligrams",
        expectedPattern: "ph_id_senior_citizen",
        shouldFind: false,
        reason: "Decimal measurement should not be flagged as ID",
      },
      {
        name: "Should suppress 0.1234567890 mg",
        text: "Amount: 0.1234567890 mg per dose",
        expectedPattern: "ph_id_senior_citizen",
        shouldFind: false,
        reason: "Decimal with units should be suppressed",
      },
      {
        name: "Should detect 1234567890 as senior citizen ID in OSCA context",
        text: "My OSCA card number is 1234567890 for my senior benefits",
        expectedPattern: "ph_id_senior_citizen",
        shouldFind: true,
        reason: "Legitimate OSCA ID should still be detected",
      },
      {
        name: "Should detect 9876543210 with senior keyword",
        text: "Senior citizen ID: 9876543210",
        expectedPattern: "ph_id_senior_citizen",
        shouldFind: true,
        reason: "10-digit number with senior context should be detected",
      },
      {
        name: "Should suppress 2345678921 as loyalty card",
        text: "Pharmacy loyalty number is 2345678921",
        expectedPattern: "ph_id_senior_citizen",
        shouldFind: false,
        reason: "Loyalty card should be suppressed",
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // FIX 4: Expiry Dates vs Birth Dates
  // ════════════════════════════════════════════════════════════════════════
  {
    category: "FIX 4: Expiry Dates Should NOT Be Flagged as Birthdate",
    tests: [
      {
        name: "Should suppress expiry date 11/23/26",
        text: "Card expiry date: 11/23/26",
        expectedPattern: "birthday_date",
        shouldFind: false,
        reason: "Expiry date should not be flagged as birthday",
      },
      {
        name: "Should suppress expiry 11/23/2026",
        text: "Card expires: 11/23/2026",
        expectedPattern: "birthday_date",
        shouldFind: false,
        reason: "Expires keyword should suppress date",
      },
      {
        name: "Should suppress validity date nov 23, 2026",
        text: "Valid until nov 23, 2026",
        expectedPattern: "birthday_date",
        shouldFind: false,
        reason: "Valid until keyword should suppress",
      },
      {
        name: "Should suppress use by date",
        text: "Use by: 11/23/2026",
        expectedPattern: "birthday_date",
        shouldFind: false,
        reason: "Use by keyword should suppress",
      },
      {
        name: "Should detect legitimate birthdate 11/23/1990",
        text: "My birthday is 11/23/1990",
        expectedPattern: "birthday_date",
        shouldFind: true,
        reason: "Legitimate birthdate should still be detected",
      },
      {
        name: "Should detect birthdate with month name",
        text: "Born on November 23, 1990",
        expectedPattern: "birthday_date",
        shouldFind: true,
        reason: "Month name birthdate should be detected",
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // REGRESSION TESTS: Ensure we haven't broken existing detections
  // ════════════════════════════════════════════════════════════════════════
  {
    category: "REGRESSION: Other PII Should Still Be Detected",
    tests: [
      {
        name: "Should still detect credit card numbers",
        text: "Card number: 4532015112830366",
        expectedPattern: "credit_card",
        shouldFind: true,
        reason: "Valid credit card should be detected",
      },
      {
        name: "Should still detect SSS numbers",
        text: "SSS number: 12-3456789-0",
        expectedPattern: "ph_id_sss",
        shouldFind: true,
        reason: "SSS pattern should be detected",
      },
      {
        name: "Should still detect email addresses",
        text: "Contact me at test@example.com",
        expectedPattern: "email",
        shouldFind: true,
        reason: "Email should be detected",
      },
    ],
  },

  {
    category: "NEW FIX 5: Barangay Should NOT Be Flagged as Address",
    tests: [
      {
        name: "Should NOT flag bare 'barangay' word",
        text: "The barangay confirming she was there",
        expectedPattern: "ph_address",
        shouldFind: false,
        reason: "Bare 'barangay' without place name is not an address",
      },
      {
        name: "Should NOT flag 'barangay' + action verb",
        text: "The barangay confirms the permit is valid",
        expectedPattern: "ph_address",
        shouldFind: false,
        reason: "Action verb after barangay indicates document context, not address",
      },
      {
        name: "Should NOT flag 'barangay' + document word",
        text: "The barangay clearance was approved",
        expectedPattern: "ph_address",
        shouldFind: false,
        reason: "Document words after barangay are not address references",
      },
      {
        name: "Should STILL flag 'Barangay' + proper place name",
        text: "I live at Barangay San Roque",
        expectedPattern: "ph_address",
        shouldFind: true,
        reason: "Barangay with proper place name is a real address",
      },
    ],
  },

  {
    category: "NEW FIX 6: Weight of Box Should NOT Be Flagged as Weight",
    tests: [
      {
        name: "Should NOT flag weight of box",
        text: "The box weighs 3 kg",
        expectedPattern: "weight_mention",
        shouldFind: false,
        reason: "Weight of container/box is not personal health information",
      },
      {
        name: "Should NOT flag package weight",
        text: "The package weight is 3 kg and contains medicines",
        expectedPattern: "weight_mention",
        shouldFind: false,
        reason: "Package weight in shipping context should be suppressed",
      },
      {
        name: "Should NOT flag product weight specification",
        text: "Item specifications: 3 kg box",
        expectedPattern: "weight_mention",
        shouldFind: false,
        reason: "Product weight spec is not personal information",
      },
      {
        name: "Should STILL flag personal weight",
        text: "My weight is 65 kg",
        expectedPattern: "weight_mention",
        shouldFind: true,
        reason: "Personal weight statement should be detected",
      },
    ],
  },
];

// Run tests
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

async function runTests() {
  for (const category of testCases) {
    console.log(`\n${category.category}`);
    console.log("─".repeat(70));

    for (const test of category.tests) {
      totalTests++;
      try {
        const result = await TrustPrompt.scan(test.text);
        const findings = result.findings || [];
        const patternFound = findings.some((f) => f.patternId === test.expectedPattern);

        if (patternFound === test.shouldFind) {
          passedTests++;
          console.log(`✅ ${test.name}`);
        } else {
          failedTests++;
          const action = test.shouldFind ? "find" : "NOT find";
          console.log(
            `❌ ${test.name}\n   Expected to ${action} ${test.expectedPattern}`
          );
          failureDetails.push({
            test: test.name,
            expected: test.shouldFind,
            found: patternFound,
            pattern: test.expectedPattern,
            text: test.text,
            reason: test.reason,
            findings: findings,
          });
        }
      } catch (error) {
        failedTests++;
        console.log(`❌ ${test.name} - ERROR: ${error.message}`);
        failureDetails.push({
          test: test.name,
          error: error.message,
          text: test.text,
        });
      }
    }
  }

  // Print summary
  console.log("\n" + "═".repeat(70));
  console.log("TEST SUMMARY");
  console.log("═".repeat(70));
  console.log(`Total Tests:   ${totalTests}`);
  console.log(`Passed:        ${passedTests} ✅`);
  console.log(`Failed:        ${failedTests} ❌`);
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`Pass Rate:     ${passRate}%`);

  if (failedTests > 0) {
    console.log("\n" + "─".repeat(70));
    console.log("FAILURE DETAILS:");
    console.log("─".repeat(70));
    for (const failure of failureDetails) {
      console.log(`\nTest: ${failure.test}`);
      console.log(`Text: "${failure.text}"`);
      if (failure.error) {
        console.log(`Error: ${failure.error}`);
      } else {
        console.log(
          `Expected: ${failure.shouldFind ? "FIND" : "NOT FIND"} ${failure.pattern}`
        );
        console.log(`Got: ${failure.found ? "FOUND" : "NOT FOUND"}`);
        console.log(`Findings: ${JSON.stringify(failure.findings, null, 2)}`);
      }
    }
  }

  console.log("\n" + "═".repeat(70));
  if (failedTests === 0) {
    console.log("🎉 ALL TESTS PASSED! All fixes are working correctly.");
  } else {
    console.log(
      `⚠️  ${failedTests} test(s) failed. Review details above.`
    );
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

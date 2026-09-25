/**
 * test-philid-final-verification.js
 * 
 * Final verification that all Philippine ID samples are detected correctly
 * after the comprehensive regex and validator fixes.
 * 
 * Test cases from user's final requirements:
 * 1. Driver's License: C51-23-016208
 * 2. National ID: 3672-0413-9178-4769
 * 3. Passport: P7409785C
 * 4. PhilHealth: (to be detected as high risk)
 * 5. GSIS: 31050021346 (NOT as phone number)
 * 6. SSS: 31-0500213-4
 * 7. Voter's ID: 1234-56-78901234-M
 * 8. PWD: 13-7604-000-0001234
 * 9. UMID: 4310-5002134-6
 * 10. Senior Citizen: (to be detected as high risk)
 * 11. Postal: (to be detected as high risk)
 */

const fs = require("fs");
const path = require("path");

// Load patterns.js - strip the const keyword to allow assignment
const patternsCode = fs.readFileSync(__dirname + "/patterns.js", "utf8")
  .replace(/^const TRUSTPROMPT_PATTERNS/, "TRUSTPROMPT_PATTERNS")
  .replace(/\/\*[\s\S]*?\*\//g, "");  // Remove block comments

eval(patternsCode);

const TEST_CASES = [
  {
    id: "ph_id_drivers_license",
    samples: [
      { value: "C51-23-016208", shouldMatch: true, desc: "Valid Driver's License" }
    ]
  },
  {
    id: "ph_id_philid",
    samples: [
      { value: "3672-0413-9178-4769", shouldMatch: true, desc: "Valid National ID (16 digits, 4 groups)" }
    ]
  },
  {
    id: "ph_id_passport",
    samples: [
      { value: "P7409785C", shouldMatch: true, desc: "Valid Passport (1 letter + 7 digits + 1 letter)" },
      { value: "PA7203775", shouldMatch: true, desc: "Valid Passport (2 letters + 7 digits)" }
    ]
  },
  {
    id: "ph_id_gsis",
    samples: [
      { value: "31050021346", shouldMatch: true, desc: "Valid GSIS (11 digits)" }
    ]
  },
  {
    id: "ph_id_sss",
    samples: [
      { value: "31-0500213-4", shouldMatch: true, desc: "Valid SSS (2 digits - 7 digits - 1 digit)" }
    ]
  },
  {
    id: "ph_id_voters",
    samples: [
      { value: "1234-56-78901234-M", shouldMatch: true, desc: "Valid Voter's ID (4 digits - 2 digits - 8 digits - letter)" }
    ]
  },
  {
    id: "ph_id_pwd",
    samples: [
      { value: "13-7604-000-0001234", shouldMatch: true, desc: "Valid PWD (2-4-3-7 format)" }
    ]
  },
  {
    id: "ph_id_umid",
    samples: [
      { value: "4310-5002134-6", shouldMatch: true, desc: "Valid UMID (4 digits - 7 digits - 1 digit)" }
    ]
  },
  {
    id: "phone_intl",
    samples: [
      { value: "31050021346", shouldMatch: false, desc: "GSIS should NOT match international phone" },
      { value: "31-0500213-4", shouldMatch: false, desc: "SSS should NOT match international phone" },
      { value: "4310-5002134-6", shouldMatch: false, desc: "UMID should NOT match international phone" }
    ]
  }
];

// Color codes for output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m"
};

function testPattern(patternId, samples) {
  const pattern = TRUSTPROMPT_PATTERNS.find(p => p.id === patternId);
  
  if (!pattern || !pattern.regex) {
    console.log(`${colors.red}✗ Pattern ${patternId} not found${colors.reset}`);
    return false;
  }

  let allPassed = true;
  
  for (const sample of samples) {
    const matches = pattern.regex.test(sample.value);
    const passed = matches === sample.shouldMatch;
    
    if (!passed) {
      allPassed = false;
      console.log(
        `${colors.red}✗ ${patternId}: ${sample.desc}${colors.reset}\n` +
        `  Value: ${sample.value}\n` +
        `  Expected match: ${sample.shouldMatch}, Got: ${matches}`
      );
    } else {
      console.log(
        `${colors.green}✓ ${patternId}: ${sample.desc}${colors.reset}\n` +
        `  Value: ${sample.value} → ${matches ? "MATCHED" : "NOT MATCHED"}`
      );
    }
    
    // Reset regex global flag
    pattern.regex.lastIndex = 0;
  }
  
  return allPassed;
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("FINAL VERIFICATION: Philippine ID Detection");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

let totalTests = 0;
let passedTests = 0;

for (const testCase of TEST_CASES) {
  const passed = testPattern(testCase.id, testCase.samples);
  totalTests += testCase.samples.length;
  if (passed) passedTests += testCase.samples.length;
  console.log();
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`RESULTS: ${colors.green}${passedTests}${colors.reset}/${totalTests} tests passed`);
if (passedTests === totalTests) {
  console.log(`${colors.green}✓ ALL TESTS PASSED - Ready for deployment${colors.reset}`);
} else {
  console.log(`${colors.red}✗ ${totalTests - passedTests} tests failed${colors.reset}`);
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

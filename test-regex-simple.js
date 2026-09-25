/**
 * Simple regex test without needing full patterns.js evaluation
 */

const testCases = [
  // Driver's License format: Axx-xx-xxxxxx
  {
    pattern: /[A-Z]\d{2}-\d{2}-\d{6}/g,
    id: "ph_id_drivers_license",
    samples: [
      { value: "C51-23-016208", shouldMatch: true, desc: "Valid Driver's License" }
    ]
  },

  // National ID format: xxxx-xxxx-xxxx-xxxx (16 digits, 4 groups)
  {
    pattern: /\d{4}-\d{4}-\d{4}-\d{4}/g,
    id: "ph_id_philid",
    samples: [
      { value: "3672-0413-9178-4769", shouldMatch: true, desc: "Valid National ID (16 digits)" },
      { value: "3672-0413-9178", shouldMatch: false, desc: "Incomplete National ID (3 groups)" }
    ]
  },

  // Passport format: Axxxxxxx A (1 letter + 7 digits + 1 letter) or AA xxxxxxx (2 letters + 7 digits)
  {
    pattern: /[A-Z]\d{7}[A-Z]|[A-Z]{2}\d{7}/g,
    id: "ph_id_passport",
    samples: [
      { value: "P7409785C", shouldMatch: true, desc: "Valid Passport (1 letter + 7 digits + 1 letter)" },
      { value: "PA7203775", shouldMatch: true, desc: "Valid Passport (2 letters + 7 digits)" }
    ]
  },

  // GSIS format: 11 digits (4 digits + 7 digits) - should NOT match international phone
  {
    pattern: /[0-9]{4}[0-9]{7}/g,
    id: "ph_id_gsis",
    samples: [
      { value: "31050021346", shouldMatch: true, desc: "Valid GSIS (11 digits)" }
    ]
  },

  // SSS format: 2 digits - 7 digits - 1 digit
  {
    pattern: /\d{2}-\d{7}-\d/g,
    id: "ph_id_sss",
    samples: [
      { value: "31-0500213-4", shouldMatch: true, desc: "Valid SSS" }
    ]
  },

  // Voter's ID format: 4 digits - 2 digits - 8 digits - letter
  {
    pattern: /\d{4}-\d{2}-\d{8}-[A-Z]/g,
    id: "ph_id_voters",
    samples: [
      { value: "1234-56-78901234-M", shouldMatch: true, desc: "Valid Voter's ID" }
    ]
  },

  // PWD format: 2 digits - 4 digits - 3 digits - 7 digits
  {
    pattern: /\d{2}-\d{4}-\d{3}-\d{7}/g,
    id: "ph_id_pwd",
    samples: [
      { value: "13-7604-000-0001234", shouldMatch: true, desc: "Valid PWD" }
    ]
  },

  // UMID format: 4 digits - 7 digits - 1 digit
  {
    pattern: /\d{4}-\d{7}-\d/g,
    id: "ph_id_umid",
    samples: [
      { value: "4310-5002134-6", shouldMatch: true, desc: "Valid UMID" }
    ]
  },

  // International phone - stricter pattern (should NOT match SSS, GSIS, UMID)
  // Range: 7-9 digits (most country codes + 10-digit local numbers)
  {
    pattern: /^\+?[1-9]\d{6,8}$/gm,
    id: "phone_intl",
    samples: [
      { value: "31050021346", shouldMatch: false, desc: "GSIS should NOT match as international phone (11 digits)" },
      { value: "31-0500213-4", shouldMatch: false, desc: "SSS should NOT match as international phone (has dashes)" },
      { value: "4310-5002134-6", shouldMatch: false, desc: "UMID should NOT match as international phone (has dashes)" }
    ]
  }
];

const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m"
};

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("REGEX PATTERN VERIFICATION");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

let totalTests = 0;
let passedTests = 0;

for (const testCase of testCases) {
  let casesPassed = 0;
  console.log(`Testing: ${colors.yellow}${testCase.id}${colors.reset}`);
  
  for (const sample of testCase.samples) {
    const regex = new RegExp(testCase.pattern.source, testCase.pattern.flags);
    const matches = regex.test(sample.value);
    const passed = matches === sample.shouldMatch;

    totalTests++;
    if (passed) {
      passedTests++;
      casesPassed++;
      console.log(`  ${colors.green}✓${colors.reset} ${sample.desc}`);
      console.log(`    Value: "${sample.value}" → ${matches ? "MATCHED ✓" : "NOT MATCHED ✓"}`);
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${sample.desc}`);
      console.log(`    Value: "${sample.value}"`);
      console.log(`    Expected: ${sample.shouldMatch ? "MATCH" : "NO MATCH"}, Got: ${matches ? "MATCH" : "NO MATCH"}`);
    }
  }
  
  console.log();
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`RESULTS: ${colors.green}${passedTests}${colors.reset}/${totalTests} tests passed`);
if (passedTests === totalTests) {
  console.log(`${colors.green}✓ ALL REGEX PATTERNS WORKING CORRECTLY${colors.reset}`);
  console.log(`${colors.green}Ready to reload the extension and test in the browser.${colors.reset}`);
} else {
  console.log(`${colors.red}✗ ${totalTests - passedTests} tests failed${colors.reset}`);
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

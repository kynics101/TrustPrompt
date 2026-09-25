/**
 * test-universal-context-filtering.js
 * 
 * Test suite for universal context filtering applied to ALL Path A PII patterns:
 * - Email addresses
 * - Payment card numbers
 * - Phone numbers
 * - API keys
 * - JSON Web Tokens (JWTs)
 * - IP addresses
 * - MAC addresses
 * - Philippine IDs
 * 
 * This validates that PII appearing in educational/example contexts
 * are not flagged, while actual sensitive disclosures are still caught.
 */

// Mock implementation of shouldFilterByContext
function shouldFilterByContext(patternId, rawMatch, fullText, matchIndex) {
  // Patterns that benefit from context analysis
  const contextAwarePatterns = [
    'phone_intl', 'ph_mobile',
    'email',
    'ipv4', 'ipv6', 'mac_address',
    'credit_card',
    'api_key', 'jwt',
    'ph_id_philid', 'ph_id_umid', 'ph_id_passport', 'ph_id_prc',
    'ph_id_postal', 'ph_id_pwd', 'ph_id_senior_citizen',
    'ph_id_gsis', 'ph_id_sss', 'ph_id_philhealth',
    'ph_id_drivers_license', 'ph_id_voters',
    'ph_id_pagibig', 'ph_id_police_clearance', 'ph_id_nbi'
  ];

  if (!contextAwarePatterns.includes(patternId)) {
    return false;
  }

  const beforeStart = Math.max(0, matchIndex - 150);
  const beforeText = fullText.slice(beforeStart, matchIndex).toLowerCase();
  
  const afterStart = matchIndex + rawMatch.length;
  const afterText = fullText.slice(afterStart, Math.min(fullText.length, afterStart + 150)).toLowerCase();
  
  const fullContext = beforeText + " [MATCH] " + afterText;

  // Educational markers
  const educationalMarkers = [
    /\b(how to|how do|how can|guide|tutorial|lesson|learn|study|teach|instruction)\b/,
    /\b(explain|describe|show|demonstrate|example|sample|documentation)\b/,
  ];
  if (educationalMarkers.some(m => m.test(fullContext))) return true;

  // Example/Demo/Test markers
  const exampleMarkers = [
    /\b(example|demo|demonstration|test case|sample|mock|dummy|fake|test data)\b/,
    /\b(format example|template|structure|layout|pattern)\b/,
  ];
  if (exampleMarkers.some(m => m.test(fullContext))) return true;

  // Validation markers
  const validationMarkers = [
    /\b(validate|check|verify|parse|format|validation)\b/,
    /\b(invalid|correct|valid format|proper format|pattern match)\b/,
  ];
  if (validationMarkers.some(m => m.test(fullContext))) return true;

  // Code markers
  const codeMarkers = [
    /\b(code|code block|function|method|variable|constant|class|import|export|require)\b/,
    /\b(json|yaml|config|configuration|api|endpoint)\b/,
  ];
  if (codeMarkers.some(m => m.test(beforeText))) return true;

  // Reference markers
  const referenceMarkers = [
    /\b(reference|specification|api doc|readme|wiki|documentation)\b/,
    /\b(specification|standard|format|rfc)\b/,
  ];
  if (referenceMarkers.some(m => m.test(fullContext))) return true;

  // Measurement markers
  const measurementMarkers = [
    /\b(convert|turn|transform|into|to|from)\b/,
    /\b(gram|kg|meter|second|bit|byte|mb|gb|celsius|fahrenheit)\b/,
  ];
  if (['ipv4', 'ipv6', 'mac_address', 'credit_card', 'phone_intl', 'ph_mobile'].includes(patternId)) {
    if (measurementMarkers.some(m => m.test(fullContext))) return true;
  }

  // Placeholder markers
  const placeholderMarkers = [
    /\b(replace|substitute|placeholder|with your own|your own|change this)\b/,
    /\b(insert your|put your|add your|use your own)\b/,
  ];
  if (placeholderMarkers.some(m => m.test(fullContext))) return true;

  return false;
}

// Test cases
const testCases = [
  // EMAIL TESTS
  {
    name: "Email: Example in documentation",
    text: "Use format: test@example.com in your configuration",
    patternId: "email",
    value: "test@example.com",
    shouldFilter: true,
    category: "Email - Example"
  },
  {
    name: "Email: Contact disclosure",
    text: "You can reach me at myemail@company.com",
    patternId: "email",
    value: "myemail@company.com",
    shouldFilter: false,
    category: "Email - Contact"
  },

  // PHONE TESTS
  {
    name: "Phone: Measurement context",
    text: "Convert 09098340056 grams into tons",
    patternId: "ph_mobile",
    value: "09098340056",
    shouldFilter: true,
    category: "Phone - Measurement"
  },
  {
    name: "Phone: Contact disclosure",
    text: "Call me at 09098340056 anytime",
    patternId: "ph_mobile",
    value: "09098340056",
    shouldFilter: false,
    category: "Phone - Contact"
  },

  // CREDIT CARD TESTS
  {
    name: "Credit Card: Format validation example",
    text: "Valid format: 4532-1234-5678-9999 with validation",
    patternId: "credit_card",
    value: "4532-1234-5678-9999",
    shouldFilter: true,
    category: "Card - Format"
  },
  {
    name: "Credit Card: Actual card sharing",
    text: "My card number is 4532-1234-5678-9999",
    patternId: "credit_card",
    value: "4532-1234-5678-9999",
    shouldFilter: false,
    category: "Card - Personal"
  },

  // IP ADDRESS TESTS
  {
    name: "IPv4: Conversion example",
    text: "Convert 192.168.1.1 to binary format",
    patternId: "ipv4",
    value: "192.168.1.1",
    shouldFilter: true,
    category: "IPv4 - Conversion"
  },
  {
    name: "IPv4: Configuration disclosure",
    text: "Server configured at 192.168.1.1",
    patternId: "ipv4",
    value: "192.168.1.1",
    shouldFilter: false,
    category: "IPv4 - Config"
  },

  // MAC ADDRESS TESTS
  {
    name: "MAC: Format documentation",
    text: "MAC address format: AA:BB:CC:DD:EE:FF example",
    patternId: "mac_address",
    value: "AA:BB:CC:DD:EE:FF",
    shouldFilter: true,
    category: "MAC - Format"
  },
  {
    name: "MAC: Device identifier sharing",
    text: "My device MAC address is AA:BB:CC:DD:EE:FF",
    patternId: "mac_address",
    value: "AA:BB:CC:DD:EE:FF",
    shouldFilter: false,
    category: "MAC - Device"
  },

  // API KEY TESTS
  {
    name: "API Key: Code example",
    text: "function authenticate() { const apiKey = 'sk_test_abc123def456xyz789'; }",
    patternId: "api_key",
    value: "sk_test_abc123def456xyz789",
    shouldFilter: true,
    category: "API Key - Code"
  },
  {
    name: "API Key: Actual credential sharing",
    text: "Use this key: sk_test_abc123def456xyz789 in your account settings",
    patternId: "api_key",
    value: "sk_test_abc123def456xyz789",
    shouldFilter: false,
    category: "API Key - Personal"
  },

  // JWT TESTS
  {
    name: "JWT: Documentation example",
    text: "JWT format: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 in docs",
    patternId: "jwt",
    value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    shouldFilter: true,
    category: "JWT - Documentation"
  },
  {
    name: "JWT: Session token sharing",
    text: "My session token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    patternId: "jwt",
    value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    shouldFilter: false,
    category: "JWT - Session"
  },

  // PHILIPPINE ID TESTS
  {
    name: "PhilID: Format example",
    text: "Valid format: 00-0000-0000-0-000 for testing",
    patternId: "ph_id_philid",
    value: "00-0000-0000-0-000",
    shouldFilter: true,
    category: "PhilID - Format"
  },
  {
    name: "PhilID: Actual ID sharing",
    text: "My PhilID is 00-0000-0000-0-000",
    patternId: "ph_id_philid",
    value: "00-0000-0000-0-000",
    shouldFilter: false,
    category: "PhilID - Personal"
  },

  // SSS NUMBER TESTS
  {
    name: "SSS: Example in template",
    text: "SSS number example: 12-3456789-0 for reference",
    patternId: "ph_id_sss",
    value: "12-3456789-0",
    shouldFilter: true,
    category: "SSS - Template"
  },
  {
    name: "SSS: Personal disclosure",
    text: "My SSS number is 12-3456789-0",
    patternId: "ph_id_sss",
    value: "12-3456789-0",
    shouldFilter: false,
    category: "SSS - Personal"
  },

  // DRIVERS LICENSE TESTS
  {
    name: "Drivers License: Format guide",
    text: "License format: D00-00-000000 explained in guide",
    patternId: "ph_id_drivers_license",
    value: "D00-00-000000",
    shouldFilter: true,
    category: "DL - Format"
  },
  {
    name: "Drivers License: Personal sharing",
    text: "My drivers license is D00-00-000000",
    patternId: "ph_id_drivers_license",
    value: "D00-00-000000",
    shouldFilter: false,
    category: "DL - Personal"
  },
];

// Run tests
console.log("=".repeat(80));
console.log("UNIVERSAL CONTEXT FILTERING TEST SUITE (ALL PII TYPES)");
console.log("=".repeat(80));
console.log();

let passed = 0;
let failed = 0;
let byCategory = {};

for (const test of testCases) {
  const valueIndex = test.text.toLowerCase().indexOf(test.value.toLowerCase());
  
  if (valueIndex === -1) {
    console.log(`⚠️  SKIPPED: ${test.name}`);
    console.log(`   Value not found in text`);
    console.log();
    continue;
  }

  const shouldFilter = shouldFilterByContext(test.patternId, test.value, test.text, valueIndex);
  const testPassed = shouldFilter === test.shouldFilter;

  // Track by category
  if (!byCategory[test.category]) {
    byCategory[test.category] = { passed: 0, failed: 0 };
  }

  if (testPassed) {
    console.log(`✅ PASS: ${test.name}`);
    console.log(`   Pattern: ${test.patternId}`);
    console.log(`   Result: ${shouldFilter ? "Filtered (safe)" : "Not filtered (risky)"}`);
    passed++;
    byCategory[test.category].passed++;
  } else {
    console.log(`❌ FAIL: ${test.name}`);
    console.log(`   Pattern: ${test.patternId}`);
    console.log(`   Result: ${shouldFilter ? "Filtered" : "Not filtered"}`);
    console.log(`   Expected: ${test.shouldFilter ? "Filtered" : "Not filtered"}`);
    failed++;
    byCategory[test.category].failed++;
  }
  console.log();
}

console.log("=".repeat(80));
console.log("CATEGORY BREAKDOWN");
console.log("=".repeat(80));
for (const [category, results] of Object.entries(byCategory)) {
  const total = results.passed + results.failed;
  const pct = ((results.passed / total) * 100).toFixed(0);
  console.log(`${category.padEnd(30)} ${results.passed}/${total} (${pct}%)`);
}

console.log();
console.log("=".repeat(80));
console.log(`TOTAL RESULTS: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log("=".repeat(80));

if (failed === 0) {
  console.log("✅ ALL TESTS PASSED");
  process.exit(0);
} else {
  console.log(`❌ ${failed} TEST(S) FAILED`);
  process.exit(1);
}

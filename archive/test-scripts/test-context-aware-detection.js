// Test context-aware phone/IP detection in gazetteer.js
// This test verifies that phone and IP are detected with sharing intent
// but suppressed in educational contexts

console.log("=== CONTEXT-AWARE PHONE & IP DETECTION TEST ===\n");

// Mock the necessary global data
global.MEDICAL_TERMS_DATA = [];
global.FINANCIAL_TERMS_DATA = [];
global.ORGANIZATIONS_DATA = [];
global.PH_ADDRESS_DB = {};

// Load gazetteer - this will register TrustGazetteer globally
require('./gazetteer.js');

const testCases = [
  {
    name: "Sharing intent: my number is",
    text: "Please contact me, my number is 09171234567",
    shouldDetect: true,
    reason: "Clear sharing intent with trigger phrase 'my number is'"
  },
  {
    name: "Educational context: how many",
    text: "How many grams are there in 09172345678?",
    shouldDetect: false,
    reason: "Educational context: asking 'how many'"
  },
  {
    name: "Question about IP format",
    text: "Is 192.168.1.1 a private IP address?",
    shouldDetect: false,
    reason: "Question with '?' mark - asking about format, not sharing"
  },
  {
    name: "Sharing server info",
    text: "Our office server is 192.168.1.1 and it's down",
    shouldDetect: true,
    reason: "Trigger phrase 'server is' with actual IP"
  },
  {
    name: "Call me at (phone sharing)",
    text: "Call me at 0917-123-4567 for emergency",
    shouldDetect: true,
    reason: "Imperative action 'call me at' with phone number"
  },
  {
    name: "Example context (suppressed)",
    text: "Example: like 192.168.0.1, this is a private IP",
    shouldDetect: false,
    reason: "Educational keyword 'example' and 'like' suggest discussion not sharing"
  },
  {
    name: "Technical specification",
    text: "RFC standard uses 192.168.1.1 for documentation",
    shouldDetect: false,
    reason: "Technical context: 'RFC' and 'documentation' keywords"
  },
  {
    name: "Multiple PII with sharing intent",
    text: "Email: maria@example.com, my number is 09171234567, my server 192.168.1.1",
    shouldDetect: true,
    reason: "Multiple sharing intents: 'my number is' and 'my server'"
  }
];

console.log("Testing " + testCases.length + " scenarios:\n");

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`  Text: "${testCase.text}"`);
  console.log(`  Expected: ${testCase.shouldDetect ? "DETECT" : "SUPPRESS"}`);
  console.log(`  Reason: ${testCase.reason}`);
  
  try {
    // Normalize the text (mimicking scanner.js normalization)
    const normalized = testCase.text.toLowerCase();
    
    // Run the gazetteer scan
    const findings = TrustGazetteer.scan(normalized);
    
    // Check for phone or IP findings
    const hasPhoneOrIPFinding = findings.some(f => 
      f.patternId.includes("phone_number") || f.patternId.includes("ip_address")
    );
    
    // Verify result matches expectation
    const testPassed = hasPhoneOrIPFinding === testCase.shouldDetect;
    
    if (testPassed) {
      console.log(`  Result: ✓ PASS - ${hasPhoneOrIPFinding ? "Phone/IP detected" : "Phone/IP suppressed"}`);
      passed++;
    } else {
      console.log(`  Result: ✗ FAIL - Expected ${testCase.shouldDetect ? "detection" : "suppression"}, got ${hasPhoneOrIPFinding ? "detection" : "suppression"}`);
      if (findings.length > 0) {
        console.log(`  Findings: ${JSON.stringify(findings.map(f => ({ patternId: f.patternId, risk: f.risk, rawMatch: f.rawMatch })), null, 2)}`);
      }
      failed++;
    }
  } catch (error) {
    console.log(`  Result: ✗ ERROR - ${error.message}`);
    failed++;
  }
  
  console.log();
});

console.log("=== TEST SUMMARY ===");
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failed === 0) {
  console.log("\n✓ All tests passed!");
} else {
  console.log(`\n✗ ${failed} test(s) failed`);
  process.exit(1);
}

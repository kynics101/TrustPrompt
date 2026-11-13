// Test to verify serial numbers are NOT flagged as phone numbers
// but legitimate phone numbers ARE still detected

require('./normalizer.js');
require('./patterns.js');
require('./validator-wrapper.js');

const Scanner = require('./scanner.js');

// Disable PATH B and C to focus on regex detection
global.TrustGazetteer = undefined;
global.TrustLinguisticDetector = undefined;

const testCases = [
  {
    name: "Serial Number (should NOT be flagged)",
    text: "My appliance warranty card has a serial that begins with 09. The serial is 09123456789 printed under the barcode.",
    shouldDetectMobile: false
  },
  {
    name: "Legitimate Phone Number (should be flagged)",
    text: "I'm registering for an overseas service and my Philippine number is +639189945231. Could you confirm that's correct?",
    shouldDetectMobile: true
  },
  {
    name: "Phone Number with International Context (should be flagged)",
    text: "My mobile number with country code is 09189945231. Please call me on that number.",
    shouldDetectMobile: true
  },
  {
    name: "Serial in Product Context (should NOT be flagged)",
    text: "The device serial number 09987654321 is shown on the product box for warranty purposes.",
    shouldDetectMobile: false
  },
];

(async () => {
  console.log('=== Testing Serial vs Phone Number Detection ===\n');

  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.name} ---`);
    console.log(`Input: "${testCase.text}"`);
    
    const result = await Scanner.scan(testCase.text);
    const mobileFindings = result.findings.filter(f => f.patternId === 'ph_mobile');
    
    const detected = mobileFindings.length > 0;
    const expectedText = testCase.shouldDetectMobile ? 'should' : 'should NOT';
    const actualText = detected ? 'WAS' : 'was NOT';
    const statusEmoji = detected === testCase.shouldDetectMobile ? '✓' : '✗';

    console.log(`Expected: ${expectedText} be flagged`);
    console.log(`Actual: ${actualText} flagged ${statusEmoji}`);

    if (mobileFindings.length > 0) {
      mobileFindings.forEach(f => {
        console.log(`  - Found: "${f.rawMatch}" (risk: ${f.risk})`);
      });
    }

    const passed = detected === testCase.shouldDetectMobile;
    console.log(`Result: ${passed ? 'PASS ✓' : 'FAIL ✗'}`);
  }
})();

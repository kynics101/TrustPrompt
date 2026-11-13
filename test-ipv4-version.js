const patterns = require('./patterns.js');

const testCases = [
  {
    text: "The new release version 10.2.3.4 includes bug fixes.",
    ipAddress: "10.2.3.4",
    shouldSuppress: true,
    description: "Version number context"
  },
  {
    text: "Our server is running at 192.168.1.1 for internal use.",
    ipAddress: "192.168.1.1",
    shouldSuppress: false,
    description: "Actual IP address"
  },
  {
    text: "v10.2.3.4 released today",
    ipAddress: "10.2.3.4",
    shouldSuppress: true,
    description: "Version with v prefix"
  },
  {
    text: "Connect to 10.0.0.1 to access the server",
    ipAddress: "10.0.0.1",
    shouldSuppress: false,
    description: "IP in connection instruction"
  },
  {
    text: "Release 10.2.3.4 build fixes critical issues",
    ipAddress: "10.2.3.4",
    shouldSuppress: true,
    description: "Release with build context"
  },
  {
    text: "The app version 10.2.3.4 is now available",
    ipAddress: "10.2.3.4",
    shouldSuppress: true,
    description: "App version context"
  }
];

const pattern = patterns.TRUSTPROMPT_PATTERNS.find(p => p.id === 'ipv4');
if (!pattern) {
  console.error("IPv4 pattern not found");
  process.exit(1);
}

console.log("Testing IPv4 contextFilter with version numbers");
console.log("=".repeat(70));
console.log();

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const matchIndex = testCase.text.indexOf(testCase.ipAddress);
  if (matchIndex === -1) {
    console.log(`✗ FAIL: ${testCase.description}`);
    console.log(`  Could not find "${testCase.ipAddress}" in text`);
    failed++;
    continue;
  }
  
  const shouldAllow = pattern.contextFilter(testCase.ipAddress, testCase.text, matchIndex);
  const isSuppressed = !shouldAllow;
  const success = isSuppressed === testCase.shouldSuppress;
  
  if (success) {
    console.log(`✓ PASS: ${testCase.description}`);
    console.log(`  Text: "${testCase.text}"`);
    console.log(`  Result: ${isSuppressed ? "SUPPRESSED (version)" : "ALLOWED (IP)"}`);
    passed++;
  } else {
    console.log(`✗ FAIL: ${testCase.description}`);
    console.log(`  Text: "${testCase.text}"`);
    console.log(`  Expected: ${testCase.shouldSuppress ? "SUPPRESSED" : "ALLOWED"}`);
    console.log(`  Got: ${isSuppressed ? "SUPPRESSED" : "ALLOWED"}`);
    failed++;
  }
  console.log();
}

console.log("=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);

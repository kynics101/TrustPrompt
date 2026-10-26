// Test: Code Context Label Enhancement
// Verifies that when source_code and ID patterns are detected together,
// the ID labels are prefixed with "[Source Code]"

require('./normalizer.js');  // Load normalizer first (defines TrustNormalizer globally)
require('./patterns.js');    // Load patterns (defines TRUSTPROMPT_PATTERNS globally)
const TrustScanner = require('./scanner.js');

const testCases = [
  {
    name: "UMID in code + source code detection",
    text: `const id = 0111-3044737-0;
console.log(id);`,
    expectedLabels: [
      "[Source Code] UMID (Unified Multi-Purpose ID)",  // Standalone UMID with code context
      "Source Code Block"                                // Code block itself
    ]
  },
  {
    name: "Prose-only UMID (no code context)",
    text: `My UMID is 0111-3044737-0, please help me understand it.`,
    expectedLabels: [
      "UMID (Unified Multi-Purpose ID)"  // No "[Source Code]" prefix - prose context
    ]
  },
  {
    name: "SSS in variable assignment",
    text: `let sss = "12-3456789-0";
api.send({sss: sss});`,
    expectedLabels: [
      "[Source Code] SSS (Social Security System)",
      "Source Code Block"
    ]
  },
  {
    name: "GSIS in prose",
    text: `I shared my GSIS number: 1234-5678901-0`,
    expectedLabels: [
      "GSIS (Government Service Insurance)"  // No "[Source Code]" prefix
    ]
  },
  {
    name: "Code pattern detection (already marked)",
    text: `const obj = {umid: "0111-3044737-0", name: "John"};`,
    expectedLabels: [
      // These already mention "Code", so no additional "[Source Code]" prefix
      "Government ID in Object Literal",
      "Source Code Block"
    ]
  }
];

async function runTests() {
  console.log("=".repeat(70));
  console.log("TEST: Code Context Label Enhancement");
  console.log("=".repeat(70));

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\n### ${test.name}`);
    console.log(`Input: "${test.text.substring(0, 50)}${test.text.length > 50 ? '...' : ''}"`);

    try {
      const result = await TrustScanner.scan(test.text);
      const { findings, riskLevel } = result;

      console.log(`Risk Level: ${riskLevel}`);
      console.log(`Findings Count: ${findings.length}`);

      // Extract labels from findings
      const actualLabels = findings.map(f => f.label);
      console.log(`Labels Found:`);
      actualLabels.forEach(label => console.log(`  - ${label}`));

      // Check if expected labels are present
      const allExpected = test.expectedLabels.every(expected =>
        actualLabels.some(actual => actual.includes(expected))
      );

      if (allExpected) {
        console.log(`✅ PASS: All expected labels found`);
        passed++;
      } else {
        console.log(`❌ FAIL: Expected labels missing`);
        console.log(`  Expected: ${test.expectedLabels.join(", ")}`);
        console.log(`  Got: ${actualLabels.join(", ")}`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ FAIL: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(70)}`);
}

runTests().catch(console.error);

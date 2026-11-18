// test-path-specific-normalization.js
// Test to verify path-specific normalization works correctly

// Test cases covering all PII categories
const testCases = [
  {
    name: "Path A: Card number with spaces",
    text: "my card is 4111 1111 1111 1111",
    expectations: {
      pathA: "should preserve spaces in card number",
      pathB: "should have readable text",
      pathC: "should be well-formed prose"
    }
  },
  {
    name: "Path A: Philippine mobile number",
    text: "call me at +63 917 123 4567 anytime",
    expectations: {
      pathA: "should preserve spaces in phone number",
      pathB: "should recognize phone context",
      pathC: "should be proper sentence"
    }
  },
  {
    name: "Path B: Medical term with punctuation",
    text: "I have hypertension, diabetes and fever.",
    expectations: {
      pathA: "no false positives from punctuation",
      pathB: "should detect medical terms",
      pathC: "should preserve sentence structure"
    }
  },
  {
    name: "Path B: Philippine address",
    text: "I live in barangay Makati, brgy. Taguig on Makati Avenue.",
    expectations: {
      pathA: "no false positives",
      pathB: "should detect PH address terms",
      pathC: "should maintain proper capitalization"
    }
  },
  {
    name: "Path C: Person names",
    text: "My name is Maricel Balais and I work in Manila.",
    expectations: {
      pathA: "no false matches",
      pathB: "should detect Manila as location",
      pathC: "should recognize Maricel Balais as name"
    }
  },
  {
    name: "Path C: Organization and job title",
    text: "I am a Senior Engineer at Accenture, working as a consultant.",
    expectations: {
      pathA: "no false matches",
      pathB: "should detect job/company context",
      pathC: "should recognize organization and job title"
    }
  },
  {
    name: "All paths: Code block interference",
    text: `Here's my code: \`\`\`javascript
const apiKey = 'sk-test-key';
function fetchData() { return fetch('/api'); }
\`\`\`
Contact maria@example.com for access.`,
    expectations: {
      pathA: "should detect source code and email",
      pathB: "should not match inside code block",
      pathC: "should not parse code as prose"
    }
  },
  {
    name: "Edge case: Punctuation after name",
    text: "Contact Sarah, the CEO of Accenture.",
    expectations: {
      pathA: "no card/phone false positives",
      pathB: "should recognize CEO context",
      pathC: "should identify Sarah as name and Accenture as org"
    }
  },
  {
    name: "Edge case: Bad punctuation",
    text: "hello,world from john.smith@email.com,then contact maria",
    expectations: {
      pathA: "should still detect email correctly",
      pathB: "should find email domain if listed",
      pathC: "should parse names despite missing spaces"
    }
  }
];

// Helper to display results
function testNormalization() {
  console.log("\n" + "=".repeat(80));
  console.log("TESTING PATH-SPECIFIC NORMALIZATION");
  console.log("=".repeat(80));

  for (const test of testCases) {
    console.log(`\n📌 ${test.name}`);
    console.log(`Input: "${test.text.substring(0, 60)}${test.text.length > 60 ? '...' : ''}"`);
    
    try {
      // Get all three normalizations
      const pathA = TrustNormalizer.normalizePath_A(test.text);
      const pathB = TrustNormalizer.normalizePath_B(test.text);
      const pathC = TrustNormalizer.normalizePath_C(test.text);
      
      console.log(`  ✓ Path A (Regex): "${pathA.substring(0, 50)}${pathA.length > 50 ? '...' : ''}"`);
      console.log(`  ✓ Path B (Gazetteer): "${pathB.substring(0, 50)}${pathB.length > 50 ? '...' : ''}"`);
      console.log(`  ✓ Path C (NLP): "${pathC.substring(0, 50)}${pathC.length > 50 ? '...' : ''}"`);
      
      // Quick checks
      if (test.text.includes("4111") && !pathA.includes("4111 1111")) {
        console.log(`  ⚠️  WARNING: Card number spaces not preserved in Path A`);
      }
      
      if (test.text.includes("+63") && !pathA.includes("+63")) {
        console.log(`  ⚠️  WARNING: Phone number format changed in Path A`);
      }
      
      if (pathC.includes("[CODE BLOCK]")) {
        console.log(`  ✓ Code blocks properly isolated in Path C`);
      }
      
    } catch (error) {
      console.error(`  ❌ ERROR: ${error.message}`);
    }
  }
  
  console.log("\n" + "=".repeat(80));
  console.log("TEST COMPLETE");
  console.log("=".repeat(80));
}

// Run tests if in Node environment or browser with TrustNormalizer
if (typeof window !== 'undefined' && window.TrustNormalizer) {
  console.log("Running in browser environment...");
  testNormalization();
} else if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  console.log("Running in Node.js environment...");
  console.log("To test: Load normalizer.js first, then this file");
}

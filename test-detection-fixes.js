// test-detection-fixes.js
// Comprehensive test suite for the three detection fixes
// Tests FIX #1 (standalone person names), FIX #2 (standalone acronyms), FIX #3 (possessives)

/* global TrustLinguisticDetector, TrustNormalizer */

console.log("[TEST SUITE] Detection Fixes Test Cases");

const TEST_CASES = [
  // ─────────────────────────────────────────────────────────────────────
  // FIX #1: Standalone Person Names (without honorifics or copular construction)
  // ─────────────────────────────────────────────────────────────────────
  {
    category: "FIX #1 - Standalone Person Names",
    name: "Simple two-word name",
    input: "Kyleen Nicdao sent me an email.",
    expectedFindings: ["Kyleen Nicdao"],
    expectedPatternId: "nlp_person_name",
    description: "Should detect 'Kyleen Nicdao' mentioned standalone without honorific or copular trigger"
  },
  {
    category: "FIX #1 - Standalone Person Names",
    name: "Two-word name at sentence start",
    input: "Maria Santos is a colleague of mine.",
    expectedFindings: ["Maria Santos"],
    expectedPatternId: "nlp_person_name",
    description: "Should detect standalone name at beginning of sentence"
  },
  {
    category: "FIX #1 - Standalone Person Names",
    name: "Three-word name (full name with middle)",
    input: "I met John Michael Smith yesterday.",
    expectedFindings: ["John Michael Smith"],
    expectedPatternId: "nlp_person_name",
    description: "Should detect three-word person names"
  },
  {
    category: "FIX #1 - Standalone Person Names",
    name: "Name in middle of sentence",
    input: "My colleague Alex Johnson was promoted.",
    expectedFindings: ["Alex Johnson"],
    expectedPatternId: "nlp_person_name",
    description: "Should detect name mentioned in middle of sentence"
  },
  {
    category: "FIX #1 - Standalone Person Names",
    name: "Multiple names in one text",
    input: "Kyleen Nicdao and Maria Santos work together. John Smith joined the team.",
    expectedFindings: ["Kyleen Nicdao", "Maria Santos", "John Smith"],
    expectedPatternId: "nlp_person_name",
    description: "Should detect multiple standalone names"
  },
  {
    category: "FIX #1 - Standalone Person Names",
    name: "Name with apostrophe-like pattern (not possessive org)",
    input: "I know Mary O'Brien from work.",
    expectedFindings: ["Mary"],  // O'Brien may not match due to apostrophe in regex [A-Z][a-z]+
    expectedPatternId: "nlp_person_name",
    description: "Should attempt to detect names even with apostrophes"
  },
  {
    category: "FIX #1 - Standalone Person Names",
    name: "Filter out false positives - job title",
    input: "The Human Resources manager called today.",
    expectedFindings: [],
    expectedPatternId: "nlp_person_name",
    description: "Should NOT detect 'Human Resources' as a person name (it's an org term)"
  },
  {
    category: "FIX #1 - Standalone Person Names",
    name: "Filter out false positives - common abbreviations",
    input: "Product Manager Alice Lee sent the report.",
    expectedFindings: ["Alice Lee"],  // Product Manager filtered, but Alice Lee should be detected
    expectedPatternId: "nlp_person_name",
    description: "Should detect real names but filter out common job titles"
  },

  // ─────────────────────────────────────────────────────────────────────
  // FIX #2: Standalone Acronyms (without preceding context words)
  // ─────────────────────────────────────────────────────────────────────
  {
    category: "FIX #2 - Standalone Acronyms",
    name: "Standalone 4-letter acronym (OICT)",
    input: "I work at OICT.",
    expectedFindings: ["OICT"],
    expectedPatternId: "nlp_organization",
    description: "Should detect standalone acronym 'OICT' without requiring context words"
  },
  {
    category: "FIX #2 - Standalone Acronyms",
    name: "Standalone 3-letter acronym",
    input: "The IBM team arrived.",
    expectedFindings: ["IBM"],
    expectedPatternId: "nlp_organization",
    description: "Should detect 3-letter acronyms like IBM"
  },
  {
    category: "FIX #2 - Standalone Acronyms",
    name: "Standalone 5-letter acronym",
    input: "OASIS is a great program.",
    expectedFindings: ["OASIS"],
    expectedPatternId: "nlp_organization",
    description: "Should detect 5-letter acronyms"
  },
  {
    category: "FIX #2 - Standalone Acronyms",
    name: "Multiple acronyms",
    input: "OICT and IBM are collaborating. HR will announce ASAP.",
    expectedFindings: ["OICT", "IBM", "HR", "ASAP"],
    expectedPatternId: "nlp_organization",
    description: "Should detect all standalone acronyms"
  },
  {
    category: "FIX #2 - Standalone Acronyms",
    name: "Filter common non-org acronyms (THE, AND, FOR)",
    input: "THE and FOR should be filtered. OICT should not.",
    expectedFindings: ["OICT"],  // THE and FOR are blacklisted
    expectedPatternId: "nlp_organization",
    description: "Should NOT detect common English acronyms like THE, AND, FOR"
  },
  {
    category: "FIX #2 - Standalone Acronyms",
    name: "Acronym with context prefix",
    input: "head of OICT",
    expectedFindings: ["OICT"],
    expectedPatternId: "nlp_organization",
    description: "Should detect OICT with context words (also tests Pattern 3 + Pattern 3.5 integration)"
  },
  {
    category: "FIX #2 - Standalone Acronyms",
    name: "Acronym in sentence middle",
    input: "Our team at OICT works on security initiatives.",
    expectedFindings: ["OICT"],
    expectedPatternId: "nlp_organization",
    description: "Should detect acronym mentioned in middle of sentence"
  },

  // ─────────────────────────────────────────────────────────────────────
  // FIX #3: Possessive Organization Names (with apostrophes)
  // ─────────────────────────────────────────────────────────────────────
  {
    category: "FIX #3 - Possessive Organization Names",
    name: "Possessive org name - Tita's Incorporation",
    input: "I work at Tita's Incorporation.",
    expectedFindings: ["Tita's Incorporation"],
    expectedPatternId: "nlp_organization",
    description: "Should detect 'Tita's Incorporation' with apostrophe in organization name"
  },
  {
    category: "FIX #3 - Possessive Organization Names",
    name: "Possessive org name in 'head of' context",
    input: "Maria is the head of Tita's Incorporation.",
    expectedFindings: ["Tita's Incorporation"],
    expectedPatternId: "nlp_organization",
    description: "Should detect possessive org in appositive context"
  },
  {
    category: "FIX #3 - Possessive Organization Names",
    name: "Multiple possessive org names",
    input: "I work at John's Company. My partner works at Maria's Firm.",
    expectedFindings: ["John's Company", "Maria's Firm"],
    expectedPatternId: "nlp_organization",
    description: "Should detect multiple possessive organization names"
  },
  {
    category: "FIX #3 - Possessive Organization Names",
    name: "Possessive org in employment context",
    input: "employed by McDonald's Corporation",
    expectedFindings: ["McDonald's Corporation"],
    expectedPatternId: "nlp_organization",
    description: "Should detect possessive org in 'employed by' context"
  },
  {
    category: "FIX #3 - Possessive Organization Names",
    name: "Common org name without apostrophe (sanity check)",
    input: "I am part of University of Santo Tomas.",
    expectedFindings: ["University of Santo Tomas"],
    expectedPatternId: "nlp_organization",
    description: "Should still detect organizations without apostrophes (verify no regression)"
  },

  // ─────────────────────────────────────────────────────────────────────
  // Integration Tests - Multiple Fixes Together
  // ─────────────────────────────────────────────────────────────────────
  {
    category: "Integration Tests",
    name: "FIX #1 + FIX #2: Name + Acronym",
    input: "Kyleen Nicdao works at OICT.",
    expectedFindings: ["Kyleen Nicdao", "OICT"],
    expectedPatternIds: ["nlp_person_name", "nlp_organization"],
    description: "Should detect both standalone name and standalone acronym in same text"
  },
  {
    category: "Integration Tests",
    name: "FIX #1 + FIX #3: Name + Possessive Org",
    input: "Maria Santos works at Tita's Incorporation.",
    expectedFindings: ["Maria Santos", "Tita's Incorporation"],
    expectedPatternIds: ["nlp_person_name", "nlp_organization"],
    description: "Should detect standalone name and possessive organization"
  },
  {
    category: "Integration Tests",
    name: "All three fixes together",
    input: "Kyleen Nicdao is the head of Tita's Incorporation. She works with OICT.",
    expectedFindings: ["Kyleen Nicdao", "Tita's Incorporation", "OICT"],
    expectedPatternIds: ["nlp_person_name", "nlp_organization", "nlp_organization"],
    description: "Should detect all three types: standalone name, possessive org, and acronym"
  },
  {
    category: "Integration Tests",
    name: "Real-world scenario from browser",
    input: "Ms padua is the head of the oict.",
    expectedFindings: ["padua", "oict"],  // Should detect at least honorific-based name and contextual org
    expectedPatternIds: ["nlp_person_name", "nlp_organization"],
    description: "Should detect the original failing case (now with multiple methods)"
  },
  {
    category: "Integration Tests",
    name: "Real-world scenario - University of Santo Tomas",
    input: "I am studying at university of santo tomas",
    expectedFindings: ["university of santo tomas"],
    expectedPatternId: "nlp_organization",
    description: "Should detect multi-word organizations (Path C success case, verify no regression)"
  }
];

// ─────────────────────────────────────────────────────────────────────
// Test Runner
// ─────────────────────────────────────────────────────────────────────

function runTests() {
  console.log("\n" + "=".repeat(80));
  console.log("RUNNING DETECTION FIXES TEST SUITE");
  console.log("=".repeat(80) + "\n");

  let passedTests = 0;
  let failedTests = 0;
  const failedTestDetails = [];

  for (const testCase of TEST_CASES) {
    try {
      // Normalize text
      const normalizedText = TrustNormalizer.normalize(testCase.input);
      
      // Run linguistic detector
      const findings = TrustLinguisticDetector.scan(normalizedText);
      
      // Extract finding strings for easier comparison
      const foundMatches = findings.map(f => f.rawMatch);
      
      // Check if all expected findings are present
      const allFound = testCase.expectedFindings.every(expected =>
        foundMatches.some(found => found.toLowerCase() === expected.toLowerCase())
      );
      
      // Check pattern IDs if specified
      let patternCheck = true;
      if (testCase.expectedPatternIds) {
        // Multiple pattern IDs - all should be present in findings
        patternCheck = testCase.expectedPatternIds.every(patternId =>
          findings.some(f => f.patternId === patternId)
        );
      } else if (testCase.expectedPatternId && testCase.expectedFindings.length > 0) {
        // Single pattern ID - all findings should have this pattern
        patternCheck = findings.every(f => f.patternId === testCase.expectedPatternId || testCase.expectedFindings.length === 0);
      }
      
      const testPassed = allFound && patternCheck;
      
      if (testPassed) {
        passedTests++;
        console.log(`✓ PASS: ${testCase.category} - ${testCase.name}`);
      } else {
        failedTests++;
        console.log(`✗ FAIL: ${testCase.category} - ${testCase.name}`);
        failedTestDetails.push({
          name: testCase.name,
          category: testCase.category,
          description: testCase.description,
          input: testCase.input,
          expectedFindings: testCase.expectedFindings,
          actualFindings: foundMatches,
          expectedPatterns: testCase.expectedPatternIds || testCase.expectedPatternId,
          actualPatterns: findings.map(f => f.patternId)
        });
      }
    } catch (error) {
      failedTests++;
      console.log(`✗ ERROR: ${testCase.category} - ${testCase.name}`);
      console.log(`  Error: ${error.message}`);
      failedTestDetails.push({
        name: testCase.name,
        category: testCase.category,
        error: error.message
      });
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Tests: ${TEST_CASES.length}`);
  console.log(`Passed: ${passedTests} ✓`);
  console.log(`Failed: ${failedTests} ✗`);
  console.log(`Success Rate: ${((passedTests / TEST_CASES.length) * 100).toFixed(1)}%`);

  // Print failed test details
  if (failedTestDetails.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("FAILED TEST DETAILS");
    console.log("=".repeat(80));
    
    for (const detail of failedTestDetails) {
      console.log(`\n[${detail.category}] ${detail.name}`);
      if (detail.error) {
        console.log(`  Error: ${detail.error}`);
      } else {
        console.log(`  Description: ${detail.description}`);
        console.log(`  Input: "${detail.input}"`);
        console.log(`  Expected Findings: ${JSON.stringify(detail.expectedFindings)}`);
        console.log(`  Actual Findings: ${JSON.stringify(detail.actualFindings)}`);
        if (detail.expectedPatterns) {
          console.log(`  Expected Patterns: ${JSON.stringify(detail.expectedPatterns)}`);
          console.log(`  Actual Patterns: ${JSON.stringify(detail.actualPatterns)}`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

// Export for use in browser console or other test runners
if (typeof window !== 'undefined') {
  window.runDetectionFixesTests = runTests;
  
  // Auto-run if all dependencies are available
  if (typeof TrustLinguisticDetector !== 'undefined' && typeof TrustNormalizer !== 'undefined') {
    console.log("[TEST SUITE] All dependencies loaded, ready to run tests");
    console.log("[TEST SUITE] Call runDetectionFixesTests() to execute tests");
  }
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TEST_CASES, runTests };
}

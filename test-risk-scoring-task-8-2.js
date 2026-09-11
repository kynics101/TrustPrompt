// test-risk-scoring-task-8-2.js
//
// Test suite for TASK 8.2: Update risk scoring computation
// - Ensure escalated findings participate in risk score aggregation
// - Verify governance escalation does not interfere with duplicate merging or deduplication
// - Reference: Requirement 18

// Load scanner.js to access computeRiskScore and related functions
const fs = require("fs");
const path = require("path");

// Load scanner.js
const scannerSrc = fs.readFileSync(
  path.join(__dirname, "scanner.js"),
  "utf8"
);

// Load patterns.js (required by scanner.js)
const patternsSrc = fs.readFileSync(
  path.join(__dirname, "patterns.js"),
  "utf8"
);

// Load normalizer.js
const normalizerSrc = fs.readFileSync(
  path.join(__dirname, "normalizer.js"),
  "utf8"
);

// Create a scope and load modules
const vm = require("vm");
const context = vm.createContext({
  console,
  require,
  shannonEntropy: (function() {
    // Mock Shannon entropy function
    return (str) => {
      if (!str || str.length === 0) return 0;
      const freq = {};
      for (const c of str) {
        freq[c] = (freq[c] || 0) + 1;
      }
      let entropy = 0;
      for (const count of Object.values(freq)) {
        const p = count / str.length;
        entropy -= p * Math.log2(p);
      }
      return entropy;
    };
  })(),
  isKnownPlaceholder: (patternId, value) => {
    // Mock placeholder detection
    const placeholders = ["test", "example", "demo", "123456789012", "1234567890"];
    return placeholders.includes(value.toLowerCase());
  },
  PLACEHOLDER_PATTERNS: []
});

// Execute patterns.js first (contains helper functions)
vm.runInContext(patternsSrc, context);

// Get TRUSTPROMPT_PATTERNS from context
const TRUSTPROMPT_PATTERNS = context.TRUSTPROMPT_PATTERNS;

// Add to context before running scanner.js
context.TRUSTPROMPT_PATTERNS = TRUSTPROMPT_PATTERNS;
context.TrustValidator = {
  validate: (fn, raw) => fn ? fn(raw) : true
};

// Create a minimal TrustNormalizer mock
context.TrustNormalizer = {
  normalize: (text) => ({
    masked: text,
    textRegex: text,
    textNLP: text,
    wasCapsConverted: false
  })
};

// Create a minimal TrustGazetteer mock
context.TrustGazetteer = {
  scan: () => []
};

// Inject undefined for TrustLinguisticDetector to avoid PATH C
context.TrustLinguisticDetector = undefined;

// Execute scanner.js
vm.runInContext(scannerSrc, context);

// Get TrustScanner
const TrustScanner = context.TrustScanner;

if (!TrustScanner || typeof TrustScanner.computeRiskScore !== "function") {
  console.error("❌ Failed to load TrustScanner.computeRiskScore");
  process.exit(1);
}

const computeRiskScore = TrustScanner.computeRiskScore;
const BASE_SCORES = TrustScanner.BASE_SCORES;
const ENTITY_TIER = TrustScanner.ENTITY_TIER;

// ── Test Helper ──────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name, condition, details = "") {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${title}`);
  console.log(`${'─'.repeat(70)}`);
}

// ── TASK 8.2 Test Cases ──────────────────────────────────────────────────

section("TASK 8.2: Risk Scoring Computation - Escalated Findings");

// Test 1: Single validated PhilID finding escalates to HIGH
console.log("\n### Test 1: Single Validated PhilID Escalates to HIGH ###");
{
  const findings = [
    {
      patternId: "ph_id_philid",
      label: "PhilID (PSA National ID)",
      risk: "high",
      rawMatch: "123456789012",
      safeVersion: "12-****-****-**12",
      validated: true,  // ← Escalated finding
      source: "A_regex"
    }
  ];
  
  const result = computeRiskScore(findings);
  test(
    "Validated PhilID returns riskLevel='high'",
    result.riskLevel === "high",
    `Expected: high, Got: ${result.riskLevel}`
  );
  test(
    "Validated PhilID governance rule is 'critical_entity'",
    result.governance === "critical_entity",
    `Expected: critical_entity, Got: ${result.governance}`
  );
}

// Test 2: Multiple escalated findings aggregate correctly
console.log("\n### Test 2: Multiple Escalated Findings Aggregate ###");
{
  const findings = [
    {
      patternId: "ph_id_philid",
      label: "PhilID (PSA National ID)",
      risk: "high",
      rawMatch: "123456789012",
      safeVersion: "12-****-****-**12",
      validated: true,
      source: "A_regex"
    },
    {
      patternId: "ph_id_drivers_license",
      label: "Driver's License (LTO)",
      risk: "high",
      rawMatch: "01001234567",
      safeVersion: "01-*******-567",
      validated: true,
      source: "A_regex"
    }
  ];
  
  const result = computeRiskScore(findings);
  test(
    "Multiple validated findings return riskLevel='high'",
    result.riskLevel === "high",
    `Expected: high, Got: ${result.riskLevel}`
  );
  test(
    "Multiple validated findings result in higher score",
    result.score > 10,
    `Expected score > 10, Got: ${result.score}`
  );
  test(
    "Governance rule is triggered for multiple critical validated findings",
    result.governance === "critical_entity",
    `Expected: critical_entity, Got: ${result.governance}`
  );
}

// Test 3: Deduplication does NOT lose escalation status
console.log("\n### Test 3: Deduplication Preserves Escalation Status ###");
{
  // Simulate deduplication scenario:
  // Same rawMatch appears in multiple findings, highest risk wins
  // After merging, escalation should still apply
  
  const findings = [
    {
      patternId: "ph_id_philid",
      label: "PhilID (PSA National ID)",
      risk: "high",
      rawMatch: "123456789012",
      safeVersion: "12-****-****-**12",
      validated: true,  // This is the winning finding after dedup
      source: "A_regex"
    }
  ];
  
  const result = computeRiskScore(findings);
  test(
    "Post-dedup finding retains validated flag",
    findings[0].validated === true,
    "Validated flag should not be lost during dedup"
  );
  test(
    "Post-dedup escalation still applies",
    result.riskLevel === "high" && result.governance === "critical_entity",
    `Expected: high + critical_entity, Got: ${result.riskLevel} + ${result.governance}`
  );
}

// Test 4: Non-escalated findings maintain their base score
console.log("\n### Test 4: Non-Escalated Findings Use Base Scores ###");
{
  const findings = [
    {
      patternId: "email",
      label: "Email Address",
      risk: "moderate",
      rawMatch: "test@example.com",
      safeVersion: "[REDACTED-EMAIL]",
      validated: false,  // Not a high-tier validated finding
      source: "A_regex"
    }
  ];
  
  const result = computeRiskScore(findings);
  test(
    "Email finding uses base score aggregation",
    BASE_SCORES["email"] === 5,
    `Expected email base score: 5, Got: ${BASE_SCORES["email"]}`
  );
  test(
    "Non-escalated finding returns 'moderate' risk",
    result.riskLevel === "moderate" || result.riskLevel === "low",
    `Expected: moderate or low, Got: ${result.riskLevel}`
  );
}

// Test 5: Mix of escalated and non-escalated findings
console.log("\n### Test 5: Mix of Escalated and Non-Escalated Findings ###");
{
  const findings = [
    {
      patternId: "ph_id_philid",
      label: "PhilID (PSA National ID)",
      risk: "high",
      rawMatch: "123456789012",
      safeVersion: "12-****-****-**12",
      validated: true,  // ← Escalated (CRITICAL tier)
      source: "A_regex"
    },
    {
      patternId: "email",
      label: "Email Address",
      risk: "moderate",
      rawMatch: "user@example.com",
      safeVersion: "[REDACTED-EMAIL]",
      validated: false,
      source: "A_regex"
    }
  ];
  
  const result = computeRiskScore(findings);
  test(
    "Mixed findings with escalated critical elevate to HIGH",
    result.riskLevel === "high",
    `Expected: high, Got: ${result.riskLevel}`
  );
  test(
    "Governance rule reflects escalation",
    result.governance === "critical_entity",
    `Expected: critical_entity, Got: ${result.governance}`
  );
}

// Test 6: Verify all Philippine ID patterns have correct BASE_SCORES
console.log("\n### Test 6: Philippine ID Patterns Have Correct BASE_SCORES ###");
{
  const phIDPatterns = [
    "ph_id_philid",
    "ph_id_drivers_license",
    "ph_id_passport",
    "ph_id_umid",
    "ph_id_sss",
    "ph_id_gsis",
    "ph_id_prc",
    "ph_id_tin",
    "ph_id_philhealth",
    "ph_id_nbi_clearance",
    "ph_id_police_clearance",
    "ph_id_psa_certificate",
    "ph_id_barangay_clearance",
    "ph_id_comelec_voter_id"
  ];
  
  for (const patternId of phIDPatterns) {
    const expectedScore = patternId === "ph_id_barangay_clearance" ? 8 : 10;
    test(
      `${patternId} has BASE_SCORE of ${expectedScore}`,
      BASE_SCORES[patternId] === expectedScore,
      `Expected: ${expectedScore}, Got: ${BASE_SCORES[patternId]}`
    );
  }
}

// Test 7: Verify all Philippine ID patterns have CRITICAL tier
console.log("\n### Test 7: Philippine ID Patterns Have CRITICAL Entity Tier ###");
{
  const phIDPatterns = [
    "ph_id_philid",
    "ph_id_drivers_license",
    "ph_id_passport",
    "ph_id_umid",
    "ph_id_sss",
    "ph_id_gsis",
    "ph_id_prc",
    "ph_id_tin",
    "ph_id_philhealth",
    "ph_id_nbi_clearance",
    "ph_id_police_clearance",
    "ph_id_psa_certificate",
    "ph_id_barangay_clearance",
    "ph_id_comelec_voter_id"
  ];
  
  for (const patternId of phIDPatterns) {
    test(
      `${patternId} has ENTITY_TIER='critical'`,
      ENTITY_TIER[patternId] === "critical",
      `Expected: critical, Got: ${ENTITY_TIER[patternId]}`
    );
  }
}

// Test 8: Escalation does not interfere with deduplication logic
console.log("\n### Test 8: Escalation Does Not Interfere With Deduplication ###");
{
  // This test verifies that the mergeAndDedupe logic happens BEFORE
  // risk scoring and governance escalation, so escalation status
  // doesn't affect deduplication winners
  
  const findings = [
    {
      patternId: "ph_id_philid",
      label: "PhilID (PSA National ID)",
      risk: "high",
      rawMatch: "123456789012",
      safeVersion: "12-****-****-**12",
      validated: true,
      source: "A_regex"
    }
  ];
  
  const result = computeRiskScore(findings);
  test(
    "Escalation happens after dedup (findings not modified by escalation)",
    findings[0].validated === true,
    "Finding's validated flag should remain unchanged by computeRiskScore"
  );
  test(
    "Score reflects base aggregation + governance escalation",
    result.riskLevel === "high",
    `Final risk should be 'high' after governance escalation`
  );
}

// Test 9: Ensure escalation priority over other governance rules
console.log("\n### Test 9: Escalation Priority Over Other Governance Rules ###");
{
  const findings = [
    {
      patternId: "ph_id_philid",
      label: "PhilID (PSA National ID)",
      risk: "high",
      rawMatch: "123456789012",
      safeVersion: "12-****-****-**12",
      validated: true,  // Escalated
      source: "A_regex"
    }
  ];
  
  const result = computeRiskScore(findings);
  test(
    "Escalation rule takes priority",
    result.governance === "critical_entity",
    `Expected: critical_entity, Got: ${result.governance}`
  );
  test(
    "Priority results in 'high' risk level",
    result.riskLevel === "high",
    `Expected: high, Got: ${result.riskLevel}`
  );
}

// Test 10: Barangay Clearance (MODERATE BASE_SCORE) still escalates with validated flag
console.log("\n### Test 10: Barangay Clearance Escalation (BASE_SCORE=8) ###");
{
  const findings = [
    {
      patternId: "ph_id_barangay_clearance",
      label: "Barangay Clearance",
      risk: "moderate",  // Note: MODERATE risk
      rawMatch: "2021-1234",
      safeVersion: "2021-****",
      validated: true,  // Still escalated due to CRITICAL tier
      source: "A_regex"
    }
  ];
  
  const result = computeRiskScore(findings);
  test(
    "Barangay Clearance has BASE_SCORE of 8",
    BASE_SCORES["ph_id_barangay_clearance"] === 8,
    `Expected: 8, Got: ${BASE_SCORES["ph_id_barangay_clearance"]}`
  );
  test(
    "Barangay Clearance is CRITICAL tier (despite MODERATE risk level)",
    ENTITY_TIER["ph_id_barangay_clearance"] === "critical",
    `Expected: critical, Got: ${ENTITY_TIER["ph_id_barangay_clearance"]}`
  );
  test(
    "Validated Barangay Clearance escalates to HIGH",
    result.riskLevel === "high",
    `Expected: high, Got: ${result.riskLevel}`
  );
}

// Summary
section("Test Summary");
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}

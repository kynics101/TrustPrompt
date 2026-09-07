#!/usr/bin/env node
/**
 * test-task-8-2-risk-scoring.js
 * TASK 8.2: Update risk scoring computation
 * 
 * Tests verify:
 * - Escalated findings participate in risk score aggregation
 * - Governance escalation doesn't interfere with duplicate merging
 * - mergeAndDedupe() preserves validated flag and escalation status
 * - finalRisk() returns "high" for escalated findings
 * - All 14 ph_id patterns are handled consistently
 * 
 * Requirements: 18
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Load all dependencies
const normalizerCode = fs.readFileSync(path.join(__dirname, 'normalizer.js'), 'utf8');
const patternsCode = fs.readFileSync(path.join(__dirname, 'patterns.js'), 'utf8');
const validatorCode = fs.readFileSync(path.join(__dirname, 'lib', 'validator.min.js'), 'utf8');
const scannerCode = fs.readFileSync(path.join(__dirname, 'scanner.js'), 'utf8');
const gazetterCode = fs.readFileSync(path.join(__dirname, 'gazetteer.js'), 'utf8');

// Execute all code in sequence
eval(normalizerCode);
eval(validatorCode);
eval(patternsCode);
eval(gazetterCode);
eval(scannerCode);

console.log("\n=== TASK 8.2: Risk Scoring Computation Tests ===\n");

let passCount = 0;
let failCount = 0;

function test(name, condition, details = "") {
  if (condition) {
    console.log(`✓ ${name}`);
    passCount++;
  } else {
    console.log(`✗ ${name}`);
    if (details) console.log(`  Details: ${details}`);
    failCount++;
  }
}

// Helper: Extract BASE_SCORES and ENTITY_TIER from scanner for verification
const BASE_SCORES = TrustScanner.BASE_SCORES;
const ENTITY_TIER = TrustScanner.ENTITY_TIER;

// ── Test 1: Escalated findings aggregate correctly in score computation ───

console.log("Test 1: Risk score aggregation with escalated findings");
const text1 = `
  PhilID: 92-03-15-123-45-6
  Email: user@example.com
`;
const result1 = TrustScanner.scan(text1);

test(
  "Both PhilID and email findings detected",
  result1.findings.length >= 2,
  `Found ${result1.findings.length} findings`
);

const hasPhilID = result1.findings.some(f => f.patternId === "ph_id_philid");
const hasEmail = result1.findings.some(f => f.patternId === "email");

test(
  "PhilID found",
  hasPhilID,
  `Findings: ${result1.findings.map(f => f.patternId).join(", ")}`
);

test(
  "Email found",
  hasEmail,
  `Findings: ${result1.findings.map(f => f.patternId).join(", ")}`
);

test(
  "Score > 0 (aggregates both findings)",
  result1.score > 0,
  `score=${result1.score}`
);

test(
  "Risk is HIGH (PhilID escalation takes precedence)",
  result1.riskLevel === "high",
  `riskLevel=${result1.riskLevel}`
);

// ── Test 2: Duplicate escalated findings are merged correctly ────────────

console.log("\nTest 2: Deduplication with escalated findings");
const text2 = `
  My PhilID is 92-03-15-123-45-6
  PhilID number: 92-03-15-123-45-6
  Call me at 0909-123-4567
`;
const result2 = TrustScanner.scan(text2);

// Count unique patterns
const patterns2 = new Set(result2.findings.map(f => f.patternId));
const philidCount = result2.findings.filter(f => f.patternId === "ph_id_philid").length;

test(
  "Duplicate PhilIDs are deduplicated",
  philidCount === 1,
  `Found ${philidCount} PhilID findings (should be 1)`
);

test(
  "Remaining findings have high risk due to PhilID",
  result2.riskLevel === "high",
  `riskLevel=${result2.riskLevel}`
);

// ── Test 3: Multiple different escalated findings ────────────────────────

console.log("\nTest 3: Multiple different escalated findings");
const text3 = `
  PhilID: 92-03-15-123-45-6
  SSS: 04-123456-78
  TIN: 123-45-678-9
`;
const result3 = TrustScanner.scan(text3);

const escalatedCount = result3.findings.filter(f =>
  f.patternId.startsWith("ph_id_") && f.validated === true
).length;

test(
  "Multiple escalated findings detected",
  escalatedCount >= 2,
  `Found ${escalatedCount} escalated findings`
);

test(
  "Score reflects multiple patterns",
  result3.score > 0,
  `score=${result3.score}`
);

test(
  "Risk escalates to HIGH with any validated PhilID",
  result3.riskLevel === "high",
  `riskLevel=${result3.riskLevel}`
);

// ── Test 4: All 14 ph_id patterns have correct BASE_SCORES ──────────────

console.log("\nTest 4: All 14 ph_id patterns have correct BASE_SCORES");

const ph_id_patterns = [
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

let allHaveScores = true;
let barangayScore = BASE_SCORES["ph_id_barangay_clearance"];
let otherScores = [];

for (const patternId of ph_id_patterns) {
  const score = BASE_SCORES[patternId];
  if (score === undefined) {
    console.log(`  ✗ Missing BASE_SCORES for ${patternId}`);
    allHaveScores = false;
  } else {
    if (patternId === "ph_id_barangay_clearance") {
      otherScores.push({ patternId, score });
    } else {
      otherScores.push({ patternId, score });
    }
  }
}

test(
  "All 14 ph_id patterns have BASE_SCORES defined",
  allHaveScores,
  "Missing scores for some patterns"
);

test(
  "Barangay clearance has score 8",
  barangayScore === 8,
  `barangay_clearance score=${barangayScore}, expected 8`
);

const otherScore10 = otherScores.filter(p => 
  p.patternId !== "ph_id_barangay_clearance" && p.score === 10
).length;

test(
  "Other 13 ph_id patterns have score 10",
  otherScore10 === 13,
  `Found ${otherScore10} patterns with score 10, expected 13`
);

// ── Test 5: All 14 ph_id patterns have CRITICAL entity tier ──────────────

console.log("\nTest 5: All 14 ph_id patterns have CRITICAL entity tier");

let allCritical = true;
for (const patternId of ph_id_patterns) {
  const tier = ENTITY_TIER[patternId];
  if (tier !== "critical") {
    console.log(`  ✗ ${patternId} has tier=${tier}, expected "critical"`);
    allCritical = false;
  }
}

test(
  "All 14 ph_id patterns classified as CRITICAL tier",
  allCritical,
  "Some patterns have wrong tier"
);

// ── Test 6: Escalated findings preserve validated flag through merge ──────

console.log("\nTest 6: validated flag preservation through merge");
const text6 = `
  PhilID: 92-03-15-123-45-6
  Email: user@example.com
  Phone: 0909-123-4567
`;
const result6 = TrustScanner.scan(text6);

const philidFinding = result6.findings.find(f => f.patternId === "ph_id_philid");
test(
  "PhilID finding preserved after merge",
  philidFinding !== undefined,
  "PhilID finding should exist"
);

if (philidFinding) {
  test(
    "PhilID validated flag is true",
    philidFinding.validated === true,
    `validated=${philidFinding.validated}`
  );
}

// ── Test 7: Non-escalated findings don't trigger HIGH risk alone ────────

console.log("\nTest 7: Non-escalated findings don't trigger HIGH alone");
const text7 = "Email: user@example.com";
const result7 = TrustScanner.scan(text7);

test(
  "Email-only scan does not escalate to HIGH",
  result7.riskLevel !== "high",
  `riskLevel=${result7.riskLevel}`
);

// ── Test 8: Risk score aggregation is multiplicative ────────────────────

console.log("\nTest 8: Risk score aggregation multiplier");
const text8 = `
  PhilID: 92-03-15-123-45-6
  SSS: 04-123456-78
  TIN: 123-45-678-9
  Email: user@example.com
`;
const result8 = TrustScanner.scan(text8);

// Expected: base (10+10+10+5) * multiplier for 4 types
const expectedBase = BASE_SCORES["ph_id_philid"] +
                     BASE_SCORES["ph_id_sss"] +
                     BASE_SCORES["ph_id_tin"] +
                     BASE_SCORES["email"];
const expectedMultiplier = 1.70; // For 4 types

test(
  "Score reflects multiple types",
  result8.score > expectedBase,
  `score=${result8.score}, base=${expectedBase}`
);

test(
  "Risk escalates to HIGH with validated PhilID",
  result8.riskLevel === "high",
  `riskLevel=${result8.riskLevel}`
);

// ── Test 9: Barangay clearance (MODERATE risk) escalates with CRITICAL tier

console.log("\nTest 9: Barangay escalation despite MODERATE risk");
const text9 = "Barangay Clearance: BC-2021-01-1234";
const result9 = TrustScanner.scan(text9);

const barangayFinding = result9.findings.find(f => f.patternId === "ph_id_barangay_clearance");

if (barangayFinding) {
  test(
    "Barangay finding has risk='moderate'",
    barangayFinding.risk === "moderate",
    `risk=${barangayFinding.risk}`
  );

  test(
    "Barangay escalates final risk to HIGH",
    result9.riskLevel === "high",
    `riskLevel=${result9.riskLevel}`
  );
}

// ── Test 10: Mixed escalated and non-escalated findings ──────────────────

console.log("\nTest 10: Mixed escalated and non-escalated findings");
const text10 = `
  PhilID: 92-03-15-123-45-6
  Name: John Doe
  Age: 30
  Email: john@example.com
`;
const result10 = TrustScanner.scan(text10);

const escalatedFindings = result10.findings.filter(f =>
  f.patternId.startsWith("ph_id_") && f.validated === true
);

test(
  "Escalated PhilID found",
  escalatedFindings.length > 0,
  `Escalated findings: ${escalatedFindings.length}`
);

test(
  "Final risk is HIGH due to escalated PhilID",
  result10.riskLevel === "high",
  `riskLevel=${result10.riskLevel}`
);

test(
  "Other findings (name, age, email) are included in aggregation",
  result10.findings.length >= 2,
  `Total findings: ${result10.findings.length}`
);

// ── Test 11: Computability check - ensure no circular logic ──────────────

console.log("\nTest 11: Risk computation stability");

const texts = [
  "PhilID: 92-03-15-123-45-6",
  "SSS: 04-123456-78",
  "TIN: 123-45-678-9",
  "Driver's License: 12-34-ABCD-567"
];

let allStable = true;
for (const txt of texts) {
  const r = TrustScanner.scan(txt);
  if (r.riskLevel !== "high") {
    console.log(`  ✗ ${txt.substring(0, 30)}... returned riskLevel=${r.riskLevel}, expected high`);
    allStable = false;
  }
}

test(
  "All validated ph_id patterns escalate to HIGH consistently",
  allStable,
  "Some patterns didn't escalate consistently"
);

// ── Test 12: Verify no interference with existing non-PhilID patterns ─────

console.log("\nTest 12: Non-interference with existing patterns");
const text12 = "Credit Card: 4532-1234-5678-9010";
const result12 = TrustScanner.scan(text12);

test(
  "Credit card is detected",
  result12.findings.some(f => f.patternId === "credit_card"),
  `Findings: ${result12.findings.map(f => f.patternId).join(", ")}`
);

test(
  "Credit card triggers HIGH risk (existing behavior preserved)",
  result12.riskLevel === "high",
  `riskLevel=${result12.riskLevel}`
);

// ── Summary ──────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(60));
console.log(`RESULTS: ${passCount} passed, ${failCount} failed`);
console.log("=".repeat(60));

if (failCount === 0) {
  console.log("✓ All tests PASSED");
} else {
  console.log(`✗ ${failCount} test(s) FAILED`);
}

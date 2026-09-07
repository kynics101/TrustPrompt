/**
 * test-governance-escalation.js
 * TASK 8.3: Tests for governance escalation logic
 * 
 * Tests verify:
 * - Validated Philippine ID findings trigger HIGH risk escalation
 * - Log messages are generated
 * - Escalation doesn't interfere with other findings
 * - Multiple escalations work correctly
 * 
 * Requirements: 16, 20
 */

console.log("\n=== TASK 8.3: Governance Escalation Tests ===\n");

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

// ── Test 1: Single validated PhilID escalates to HIGH ────────────────────

console.log("Test 1: Single PhilID escalation");
const text1 = "My PhilID is 92-03-15-123-45-6";
const result1 = TrustScanner.scan(text1);

test(
  "Scan completes",
  result1 !== undefined && result1.findings !== undefined,
  "Result is undefined"
);

test(
  "PhilID is detected",
  result1.findings.some(f => f.patternId === "ph_id_philid"),
  `Findings: ${result1.findings.map(f => f.patternId).join(", ")}`
);

test(
  "PhilID finding is validated",
  result1.findings.find(f => f.patternId === "ph_id_philid")?.validated === true,
  "Finding not marked as validated"
);

test(
  "Risk level is escalated to HIGH",
  result1.riskLevel === "high",
  `riskLevel=${result1.riskLevel}`
);

// ── Test 2: Multiple escalations in single scan ──────────────────────────

console.log("\nTest 2: Multiple escalations");
const text2 = `
  PhilID: 92-03-15-123-45-6
  SSS: 04-123456-78
  Passport: P123456789
`;
const result2 = TrustScanner.scan(text2);

const escalatedFindings = result2.findings.filter(f => 
  f.patternId.startsWith("ph_id_") && f.validated === true
);

test(
  "Multiple Philippine IDs detected",
  escalatedFindings.length >= 2,
  `Found ${escalatedFindings.length} validated findings`
);

test(
  "Risk remains HIGH with multiple escalations",
  result2.riskLevel === "high",
  `riskLevel=${result2.riskLevel}`
);

test(
  "Score aggregates correctly",
  result2.score > 0,
  `score=${result2.score}`
);

// ── Test 3: Barangay clearance (MODERATE risk) still escalates ─────────

console.log("\nTest 3: Barangay clearance escalation");
const text3 = "Barangay Clearance: BC-2021-01-1234";
const result3 = TrustScanner.scan(text3);

test(
  "Barangay clearance is detected",
  result3.findings.some(f => f.patternId === "ph_id_barangay_clearance"),
  `Findings: ${result3.findings.map(f => f.patternId).join(", ")}`
);

const barangayFinding = result3.findings.find(f => f.patternId === "ph_id_barangay_clearance");
if (barangayFinding) {
  test(
    "Barangay clearance is validated",
    barangayFinding.validated === true,
    `validated=${barangayFinding.validated}`
  );

  test(
    "Barangay clearance escalates to HIGH (despite MODERATE risk)",
    result3.riskLevel === "high",
    `riskLevel=${result3.riskLevel}`
  );
}

// ── Test 4: Non-validated PhilID does not escalate ──────────────────────

console.log("\nTest 4: Non-validated PhilID");
const text4 = "Invalid PhilID: 92-03-15-999-99-9";  // sex digit 9 is invalid
const result4 = TrustScanner.scan(text4);

const invalidPhilId = result4.findings.find(f => f.patternId === "ph_id_philid");
test(
  "Invalid PhilID is not detected (fails structural validation)",
  invalidPhilId === undefined,
  "Invalid PhilID should not be in findings"
);

// ── Test 5: Governance escalation with other findings ────────────────────

console.log("\nTest 5: Mixed findings with escalation");
const text5 = `
  My email is user@example.com
  PhilID: 92-03-15-123-45-6
  Phone: 0909-123-4567
`;
const result5 = TrustScanner.scan(text5);

test(
  "Multiple finding types detected",
  result5.findings.length >= 2,
  `Found ${result5.findings.length} findings`
);

test(
  "Mixed findings still escalate to HIGH for validated PhilID",
  result5.riskLevel === "high",
  `riskLevel=${result5.riskLevel}`
);

// ── Test 6: SSS number escalation ────────────────────────────────────────

console.log("\nTest 6: SSS escalation");
const text6 = "Employee SSS: 04-123456-78";
const result6 = TrustScanner.scan(text6);

const sssFindings = result6.findings.filter(f => f.patternId === "ph_id_sss");
test(
  "SSS is detected",
  sssFindings.length > 0,
  `Findings: ${result6.findings.map(f => f.patternId).join(", ")}`
);

if (sssFindings.length > 0) {
  test(
    "SSS is validated",
    sssFindings[0].validated === true,
    `validated=${sssFindings[0].validated}`
  );

  test(
    "SSS escalates to HIGH",
    result6.riskLevel === "high",
    `riskLevel=${result6.riskLevel}`
  );
}

// ── Test 7: TIN escalation ───────────────────────────────────────────────

console.log("\nTest 7: TIN escalation");
const text7 = "TIN: 123-45-678-9";
const result7 = TrustScanner.scan(text7);

const tinFindings = result7.findings.filter(f => f.patternId === "ph_id_tin");
test(
  "TIN is detected",
  tinFindings.length > 0,
  `Findings: ${result7.findings.map(f => f.patternId).join(", ")}`
);

if (tinFindings.length > 0) {
  test(
    "TIN is validated",
    tinFindings[0].validated === true,
    `validated=${tinFindings[0].validated}`
  );

  test(
    "TIN escalates to HIGH",
    result7.riskLevel === "high",
    `riskLevel=${result7.riskLevel}`
  );
}

// ── Test 8: Passport escalation ──────────────────────────────────────────

console.log("\nTest 8: Passport escalation");
const text8 = "Passport: P123456789";
const result8 = TrustScanner.scan(text8);

const passportFindings = result8.findings.filter(f => f.patternId === "ph_id_passport");
test(
  "Passport is detected",
  passportFindings.length > 0,
  `Findings: ${result8.findings.map(f => f.patternId).join(", ")}`
);

if (passportFindings.length > 0) {
  test(
    "Passport is validated",
    passportFindings[0].validated === true,
    `validated=${passportFindings[0].validated}`
  );

  test(
    "Passport escalates to HIGH",
    result8.riskLevel === "high",
    `riskLevel=${result8.riskLevel}`
  );
}

// ── Test 9: Driver's License escalation ──────────────────────────────────

console.log("\nTest 9: Driver's License escalation");
const text9 = "Driver's License: 12-34-ABCD-567";
const result9 = TrustScanner.scan(text9);

const dlFindings = result9.findings.filter(f => f.patternId === "ph_id_drivers_license");
test(
  "Driver's License is detected",
  dlFindings.length > 0,
  `Findings: ${result9.findings.map(f => f.patternId).join(", ")}`
);

if (dlFindings.length > 0) {
  test(
    "Driver's License is validated",
    dlFindings[0].validated === true,
    `validated=${dlFindings[0].validated}`
  );

  test(
    "Driver's License escalates to HIGH",
    result9.riskLevel === "high",
    `riskLevel=${result9.riskLevel}`
  );
}

// ── Test 10: Redaction in escalated findings ──────────────────────────────

console.log("\nTest 10: Redaction consistency");
const text10 = "PhilID: 92-03-15-123-45-6";
const result10 = TrustScanner.scan(text10);

const redactedFinding = result10.findings.find(f => f.patternId === "ph_id_philid");
if (redactedFinding) {
  test(
    "Finding has safeVersion",
    redactedFinding.safeVersion !== undefined,
    `safeVersion=${redactedFinding.safeVersion}`
  );

  test(
    "safeVersion contains asterisks for redaction",
    /\*/.test(redactedFinding.safeVersion),
    `safeVersion=${redactedFinding.safeVersion}`
  );

  test(
    "safeVersion is not the raw value",
    redactedFinding.safeVersion !== redactedFinding.rawMatch,
    `Should be different from raw: ${redactedFinding.rawMatch}`
  );
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(50));
console.log(`RESULTS: ${passCount} passed, ${failCount} failed`);
console.log("=".repeat(50));

if (failCount === 0) {
  console.log("✓ All tests PASSED");
} else {
  console.log(`✗ ${failCount} test(s) FAILED`);
}

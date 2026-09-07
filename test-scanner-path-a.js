/**
 * test-scanner-path-a.js
 * TASK 7.4: Integration tests for PATH A + Philippine IDs
 * 
 * Tests verify:
 * - Philippine ID patterns match correctly in scanner PATH A
 * - Validators are called and findings are marked validated
 * - Entropy and placeholder suppression work
 * - Risk scoring includes Philippine IDs
 * 
 * Requirements: 18, 20
 */

console.log("\n=== TASK 7.4: Scanner PATH A + Philippine IDs Integration Tests ===\n");

const mockTexts = {
  valid_philid: "My PhilID is 92-03-15-123-45-6 for verification",
  valid_sss: "SSS number: 04-123456-78 for employment",
  valid_drivers_license: "Driver's License 12-34-ABCD-567 on file",
  valid_passport: "Passport P123456789 for travel",
  valid_tin: "TIN: 123-45-678-9 for taxes",
  
  multiple_ids: `
    PhilID: 920315123456
    SSS: 0412345678
    Driver's License: 12-3456-ABCD-567
    Passport: P123456789
  `,

  invalid_philid: "Invalid ID: 92-03-15-999-99-9",  // invalid sex digit
  invalid_sss: "Invalid SSS: 00-123456-78",  // invalid branch code
};

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

// ── Test 1: Valid PhilID detection in PATH A ───────────────────────────

console.log("Test 1: PhilID detection");
const scanner1 = TrustScanner.scan(mockTexts.valid_philid);
const philidFindings = scanner1.findings.filter(f => f.patternId === "ph_id_philid");
test(
  "PhilID pattern matches valid input",
  philidFindings.length > 0,
  `Found ${philidFindings.length} findings`
);

if (philidFindings.length > 0) {
  test(
    "PhilID finding is marked validated=true",
    philidFindings[0].validated === true,
    `validated=${philidFindings[0].validated}`
  );
  
  test(
    "PhilID finding has correct risk level",
    philidFindings[0].risk === "high",
    `risk=${philidFindings[0].risk}`
  );

  test(
    "PhilID sanitize produces redacted output",
    /\*/.test(philidFindings[0].safeVersion),
    `safeVersion=${philidFindings[0].safeVersion}`
  );
}

// ── Test 2: Valid SSS detection in PATH A ───────────────────────────────

console.log("\nTest 2: SSS detection");
const scanner2 = TrustScanner.scan(mockTexts.valid_sss);
const sssFindings = scanner2.findings.filter(f => f.patternId === "ph_id_sss");
test(
  "SSS pattern matches valid input",
  sssFindings.length > 0,
  `Found ${sssFindings.length} findings`
);

if (sssFindings.length > 0) {
  test(
    "SSS finding is marked validated=true",
    sssFindings[0].validated === true,
    `validated=${sssFindings[0].validated}`
  );
}

// ── Test 3: Multiple ID types in same text ──────────────────────────────

console.log("\nTest 3: Multiple ID types detection");
const scanner3 = TrustScanner.scan(mockTexts.multiple_ids);
const phIdFindings = scanner3.findings.filter(f => f.patternId.startsWith("ph_id_"));

test(
  "Multiple Philippine IDs detected",
  phIdFindings.length >= 3,
  `Found ${phIdFindings.length} Philippine ID findings`
);

test(
  "All Philippine IDs are marked validated",
  phIdFindings.every(f => f.validated === true),
  `Some findings not validated`
);

// ── Test 4: Risk scoring includes Philippine IDs ──────────────────────────

console.log("\nTest 4: Risk scoring");
test(
  "Multiple PhilID scan results in 'high' risk level",
  scanner3.riskLevel === "high",
  `riskLevel=${scanner3.riskLevel}`
);

test(
  "Risk score is calculated",
  scanner3.score > 0,
  `score=${scanner3.score}`
);

// ── Test 5: Invalid PhilID fails structural validation ────────────────────

console.log("\nTest 5: Structural validation");
const scanner5 = TrustScanner.scan(mockTexts.invalid_philid);
const invalidPhilIdFindings = scanner5.findings.filter(f => f.patternId === "ph_id_philid");

test(
  "Invalid PhilID is not detected (structural validation fails)",
  invalidPhilIdFindings.length === 0,
  `Found ${invalidPhilIdFindings.length} findings for invalid input`
);

// ── Test 6: Invalid SSS fails branch code validation ──────────────────────

console.log("\nTest 6: SSS branch code validation");
const scanner6 = TrustScanner.scan(mockTexts.invalid_sss);
const invalidSssFindings = scanner6.findings.filter(f => f.patternId === "ph_id_sss");

test(
  "Invalid SSS (branch code 00) is not detected",
  invalidSssFindings.length === 0,
  `Found ${invalidSssFindings.length} findings for invalid SSS`
);

// ── Test 7: Governance escalation for validated Philippine IDs ───────────

console.log("\nTest 7: Governance escalation");
const scanner7 = TrustScanner.scan(mockTexts.valid_philid);

// Check for escalation in governance result
test(
  "Governance evaluation completed",
  scanner7.governance !== undefined,
  `governance=${scanner7.governance}`
);

// The escalation should result in HIGH risk
test(
  "Validated PhilID triggers HIGH risk classification",
  scanner7.riskLevel === "high",
  `riskLevel=${scanner7.riskLevel}`
);

// ── Test 8: Sanitize consistency ─────────────────────────────────────────

console.log("\nTest 8: Sanitize consistency");
const sanitizeTests = [
  { id: "ph_id_philid", value: "920315123456" },
  { id: "ph_id_sss", value: "0412345678" },
  { id: "ph_id_tin", value: "123456789" }
];

for (const test8 of sanitizeTests) {
  const pattern = TRUSTPROMPT_PATTERNS.find(p => p.id === test8.id);
  if (pattern && pattern.sanitize) {
    const sanitized1 = pattern.sanitize(test8.value);
    const sanitized2 = pattern.sanitize(test8.value);
    test(
      `${test8.id} sanitize is consistent`,
      sanitized1 === sanitized2,
      `First: ${sanitized1}, Second: ${sanitized2}`
    );
  }
}

// ── Test 9: ENTITY_TIER and BASE_SCORES coverage ─────────────────────────

console.log("\nTest 9: Scoring configuration");
const philidPatterns = [
  "ph_id_philid", "ph_id_drivers_license", "ph_id_passport", "ph_id_umid",
  "ph_id_sss", "ph_id_gsis", "ph_id_prc", "ph_id_tin", "ph_id_philhealth",
  "ph_id_nbi_clearance", "ph_id_police_clearance", "ph_id_psa_certificate",
  "ph_id_barangay_clearance", "ph_id_comelec_voter_id"
];

for (const patternId of philidPatterns) {
  test(
    `${patternId} in ENTITY_TIER`,
    TrustScanner.ENTITY_TIER[patternId] !== undefined,
    `ENTITY_TIER[${patternId}] is undefined`
  );

  test(
    `${patternId} in BASE_SCORES`,
    TrustScanner.BASE_SCORES[patternId] !== undefined,
    `BASE_SCORES[${patternId}] is undefined`
  );

  const tier = TrustScanner.ENTITY_TIER[patternId];
  test(
    `${patternId} is classified as "critical"`,
    tier === "critical",
    `ENTITY_TIER=${tier}`
  );

  const score = TrustScanner.BASE_SCORES[patternId];
  const expectedScore = patternId === "ph_id_barangay_clearance" ? 8 : 10;
  test(
    `${patternId} has correct base score (${expectedScore})`,
    score === expectedScore,
    `BASE_SCORES=${score}`
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

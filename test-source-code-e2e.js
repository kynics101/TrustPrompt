// test-source-code-e2e.js
// End-to-end test for source code detection reaching governance and badge
// Tests unformatted code blocks flowing through the entire pipeline

/* global TrustScanner, console */

console.log("═══════════════════════════════════════════════════════════════════");
console.log("TEST: Source Code Detection End-to-End Flow");
console.log("═══════════════════════════════════════════════════════════════════\n");

// ── Test 1: Unformatted JavaScript code block ──────────────────────────────
console.log("TEST 1: Unformatted JavaScript code block");
console.log("────────────────────────────────────────────");

const test1_text = `
const apiKey = 'sk-abc123def456ghi789';
async function fetchUser(userId) {
  const res = await fetch('/api/users', {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  return res.json();
}
fetchUser(42);
`;

console.log("Input text (unformatted code):");
console.log(test1_text);
console.log("\nScanning...\n");

const result1 = TrustScanner.scan(test1_text);

console.log("\n✓ SCAN COMPLETE");
console.log("────────────────");
console.log("Findings count:", result1.findings.length);
console.log("Risk level:", result1.riskLevel);
console.log("Score:", result1.score);
console.log("Governance rule:", result1.governance);

if (result1.findings.length > 0) {
  console.log("\nFindings detail:");
  result1.findings.forEach((f, i) => {
    console.log(`  [${i+1}] ${f.patternId} (${f.risk}) - matched: "${f.rawMatch.substring(0, 30)}..."`);
  });
}

const codeFindings1 = result1.findings.filter(f => f.patternId === 'source_code');
console.log("\nSource code findings:", codeFindings1.length);
if (codeFindings1.length > 0) {
  console.log("✅ PASS: Source code detected");
} else {
  console.log("❌ FAIL: No source code detected");
}

if (result1.riskLevel !== "none") {
  console.log("✅ PASS: Risk level affected by findings:", result1.riskLevel);
} else {
  console.log("⚠️  WARN: Risk level is still 'none' - findings may not be reaching governance");
}

// ── Test 2: Python code with database credentials ─────────────────────────
console.log("\n\nTEST 2: Python code with database credentials");
console.log("────────────────────────────────────────────────");

const test2_text = `
import psycopg2
connection = psycopg2.connect(
    host="db.example.com",
    database="prod_db",
    user="admin",
    password="SecurePassword123!"
)
cursor = connection.cursor()
cursor.execute("SELECT * FROM users")
`;

console.log("Input text (Python code with password):");
console.log(test2_text);
console.log("\nScanning...\n");

const result2 = TrustScanner.scan(test2_text);

console.log("\n✓ SCAN COMPLETE");
console.log("────────────────");
console.log("Findings count:", result2.findings.length);
console.log("Risk level:", result2.riskLevel);
console.log("Score:", result2.score);
console.log("Governance rule:", result2.governance);

if (result2.findings.length > 0) {
  console.log("\nFindings detail:");
  result2.findings.forEach((f, i) => {
    console.log(`  [${i+1}] ${f.patternId} (${f.risk}) - matched: "${f.rawMatch.substring(0, 30)}..."`);
  });
}

const codeFindings2 = result2.findings.filter(f => f.patternId === 'source_code');
console.log("\nSource code findings:", codeFindings2.length);
if (codeFindings2.length > 0) {
  console.log("✅ PASS: Source code detected");
  console.log("Elevated risk due to embedded credentials:", codeFindings2[0].risk);
} else {
  console.log("❌ FAIL: No source code detected");
}

// ── Test 3: Simple unformatted code snippet ────────────────────────────────
console.log("\n\nTEST 3: Simple unformatted code snippet");
console.log("──────────────────────────────────────────");

const test3_text = `for (let i = 0; i < 10; i++) {
  console.log(i);
}`;

console.log("Input text (simple loop):");
console.log(test3_text);
console.log("\nScanning...\n");

const result3 = TrustScanner.scan(test3_text);

console.log("\n✓ SCAN COMPLETE");
console.log("────────────────");
console.log("Findings count:", result3.findings.length);
console.log("Risk level:", result3.riskLevel);
console.log("Score:", result3.score);
console.log("Governance rule:", result3.governance);

const codeFindings3 = result3.findings.filter(f => f.patternId === 'source_code');
console.log("\nSource code findings:", codeFindings3.length);
if (codeFindings3.length > 0) {
  console.log("✅ PASS: Source code detected");
  console.log("Risk level:", codeFindings3[0].risk);
} else {
  console.log("❌ FAIL: No source code detected");
}

// ── Test 4: Verify BASE_SCORES and ENTITY_TIER ─────────────────────────────
console.log("\n\nTEST 4: Verify BASE_SCORES and ENTITY_TIER");
console.log("──────────────────────────────────────────────");

if (TrustScanner && TrustScanner.BASE_SCORES) {
  console.log("✅ BASE_SCORES available");
  console.log("  source_code BASE_SCORE:", TrustScanner.BASE_SCORES.source_code);
  
  if (TrustScanner.BASE_SCORES.source_code === 5) {
    console.log("  ✅ PASS: source_code score is 5 (Moderate tier)");
  } else {
    console.log("  ❌ FAIL: source_code score is", TrustScanner.BASE_SCORES.source_code, "(expected 5)");
  }
} else {
  console.log("❌ FAIL: BASE_SCORES not available");
}

if (TrustScanner && TrustScanner.ENTITY_TIER) {
  console.log("\n✅ ENTITY_TIER available");
  console.log("  source_code ENTITY_TIER:", TrustScanner.ENTITY_TIER.source_code);
  
  if (TrustScanner.ENTITY_TIER.source_code === "significant") {
    console.log("  ✅ PASS: source_code tier is 'significant'");
  } else {
    console.log("  ❌ FAIL: source_code tier is", TrustScanner.ENTITY_TIER.source_code, "(expected 'significant')");
  }
} else {
  console.log("❌ FAIL: ENTITY_TIER not available");
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════════════");
console.log("TEST SUMMARY");
console.log("═══════════════════════════════════════════════════════════════════");

console.log("\nKey observations:");
console.log("1. Source code findings should appear in result.findings");
console.log("2. Risk level should reflect detected code (low/moderate/high depending on content)");
console.log("3. Governance rule should be applied (log will show which rule)");
console.log("4. Console logs should show source_code findings flowing through:");
console.log("   - runSourceCodeDetection() → findings created");
console.log("   - mergeAndDedupe() → findings merged");
console.log("   - suppressPlaceholders() → findings retained (not suppressed)");
console.log("   - computeRiskScore() → scorable findings include source_code");
console.log("   - evaluateGovernance() → rules evaluated with source_code present");

console.log("\nIf risk level is 'none' despite code detection:");
console.log("  → Check if source_code findings are being filtered out");
console.log("  → Check console logs for [TrustPrompt/merge], [TrustPrompt/scorer], [TrustPrompt/governance]");
console.log("  → Verify BASE_SCORES.source_code = 5 and ENTITY_TIER.source_code = 'significant'");

console.log("\n═══════════════════════════════════════════════════════════════════\n");

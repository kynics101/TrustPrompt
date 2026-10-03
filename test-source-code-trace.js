// test-source-code-trace.js
// Minimal test to trace source code detection through the full pipeline

console.log("\n=== SOURCE CODE FINDING TRACE TEST ===\n");

const testText = "const myValue = 5;";
console.log("Input text:", testText);

// Simulate the scanner's execution path
console.log("\n[Step 1] Testing TrustScanner.scan()...");
const result = TrustScanner.scan(testText);

console.log("\n[Step 2] Result object:");
console.log("  findings.length:", result.findings.length);
console.log("  riskLevel:", result.riskLevel);
console.log("  score:", result.score);
console.log("  governance:", result.governance);

console.log("\n[Step 3] Detailed findings:");
result.findings.forEach((f, i) => {
  console.log(`  Finding ${i}:`, {
    patternId: f.patternId,
    label: f.label,
    risk: f.risk,
    rawMatch: f.rawMatch.substring(0, 50),
    validated: f.validated,
    source: f.source
  });
});

console.log("\n[Step 4] Checking for source_code findings:");
const sourceCodeFindings = result.findings.filter(f => f.patternId === 'source_code');
console.log("  source_code findings found:", sourceCodeFindings.length);
if (sourceCodeFindings.length > 0) {
  sourceCodeFindings.forEach((f, i) => {
    console.log(`  [${i}] score metrics:`, f.codeMetrics);
  });
}

console.log("\n[Step 5] Checking BASE_SCORES:");
if (TrustScanner && TrustScanner.BASE_SCORES) {
  console.log("  BASE_SCORES['source_code']:", TrustScanner.BASE_SCORES.source_code);
} else {
  console.log("  ❌ BASE_SCORES not accessible");
}

console.log("\n[Step 6] Result summary:");
if (sourceCodeFindings.length === 0) {
  console.log("  ❌ PROBLEM: Source code was detected (score 6) but NO finding in results");
  console.log("  Possible causes:");
  console.log("    1. Filtered by suppressPlaceholders()");
  console.log("    2. Filtered by shouldFilterByContext()");
  console.log("    3. Not being added to findings array");
  console.log("    4. Lost in mergeAndDedupe()");
} else {
  console.log("  ✅ Source code finding present:", sourceCodeFindings[0].patternId);
  console.log("  Risk score contributed:", TrustScanner.BASE_SCORES.source_code);
}

console.log("\n=== END TRACE ===\n");

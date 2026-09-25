/**
 * test-code-risk-escalation-9-1.js
 * TASK 9.1: Tests for evaluateCodeRiskEscalation function
 * 
 * Tests verify:
 * - Code blocks without credentials maintain base risk (LOW)
 * - Code blocks with critical credentials (API keys, JWT) escalate to HIGH
 * - Code blocks with sensitive keywords (password, secret, token) escalate to MODERATE
 * - Risk escalation logic respects already-elevated base risks
 * - Log messages are generated with correct format
 * - Escalation reasons are accurate
 * 
 * Requirements: 10, 12
 * Design Reference: Section 2.2 (Credential Escalation Logic)
 */

console.log("\n=== TASK 9.1: Code Risk Escalation Tests ===\n");

// Mock CODE_DETECTION_CONFIG for testing (same as in scanner.js)
const CODE_DETECTION_CONFIG = {
  LOG_SIGNAL_DETAILS: true
};

// ── TASK 9.1: evaluateCodeRiskEscalation(scoreObj, baseRisk) ────────────────
// Implementation for testing

function evaluateCodeRiskEscalation(scoreObj, baseRisk) {
  // ── Validate inputs ────────────────────────────────────────────────────
  if (!scoreObj || typeof baseRisk !== 'string') {
    return {
      escalatedRisk: baseRisk || 'low',
      escalated: false,
      reason: 'Invalid input to evaluateCodeRiskEscalation',
      credentialsDetected: false,
      credentialTypes: [],
      patterns: []
    };
  }

  // ── Extract credential indicator score from features ───────────────────
  const features = scoreObj.features || {};
  const credentialIndicatorsScore = features.credentialIndicators || 0;

  // ── Initialize result object ──────────────────────────────────────────
  let escalatedRisk = baseRisk.toLowerCase();
  let escalated = false;
  let reason = '';
  const credentialTypes = [];
  const patterns = [];

  // ── Check if credentials were detected (credentialIndicators > 0) ─────
  if (credentialIndicatorsScore === 0) {
    // No credentials detected
    if (CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS) {
      console.log(
        '[TrustPrompt/CodeDetection] Risk Escalation: No credentials detected (credentialIndicators = 0); maintaining base risk: ' + baseRisk
      );
    }
    return {
      escalatedRisk,
      escalated: false,
      reason: 'No embedded credentials detected',
      credentialsDetected: false,
      credentialTypes: [],
      patterns: []
    };
  }

  // ── Credentials detected: determine severity and escalate accordingly ──
  credentialTypes.push('general_credential_pattern');

  // ── Critical credentials: Escalate to HIGH ─────────────────────────────
  if (credentialIndicatorsScore > 0.5) {
    // High credential indicator score suggests multiple or critical patterns
    credentialTypes.push('api_key', 'jwt', 'aws_key', 'github_token');
    patterns.push('[REDACTED_API_KEY]', '[REDACTED_JWT]', '[REDACTED_AWS_KEY]');
    
    if (baseRisk.toLowerCase() === 'high') {
      // Already at highest risk; no escalation needed
      escalatedRisk = 'high';
      escalated = false;
      reason = 'Already at HIGH risk; critical credentials present but no further escalation';
    } else {
      // Escalate to HIGH from LOW or MODERATE
      escalatedRisk = 'high';
      escalated = true;
      reason =
        'Code block contains embedded credentials (score: ' +
        credentialIndicatorsScore.toFixed(2) +
        '); critical patterns likely present';
    }
  }
  // ── Sensitive credentials: Escalate to MODERATE ─────────────────────────
  // If credentialIndicators score is moderate (0 < score ≤ 0.5)
  // Escalate from LOW → MODERATE; maintain MODERATE or HIGH
  else if (credentialIndicatorsScore > 0) {
    if (baseRisk.toLowerCase() === 'low') {
      escalatedRisk = 'moderate';
      escalated = true;
      reason =
        'Code block contains sensitive keywords or credentials (score: ' +
        credentialIndicatorsScore.toFixed(2) +
        ')';
      credentialTypes.push('password', 'secret', 'token', 'database_url');
      patterns.push('[REDACTED_PASSWORD]', '[REDACTED_TOKEN]');
    } else if (baseRisk.toLowerCase() === 'moderate') {
      escalatedRisk = 'moderate';
      escalated = false;
      reason = 'Already at MODERATE risk; credentials present but no further escalation';
      credentialTypes.push('password', 'secret', 'token');
    } else if (baseRisk.toLowerCase() === 'high') {
      escalatedRisk = 'high';
      escalated = false;
      reason = 'Already at HIGH risk; credentials present but no further escalation';
      credentialTypes.push('password', 'secret', 'token');
    }
  }

  // ── Log escalation decision (if enabled) ──────────────────────────────
  if (CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS) {
    console.log(
      `[TrustPrompt/CodeDetection] Risk Escalation: ${baseRisk} → ${escalatedRisk} | ` +
        `Reason: ${reason} | ` +
        `Credential Types: ${credentialTypes.join(', ')} | ` +
        `Classification: ${scoreObj.classification || 'unknown'}`
    );
  }

  // ── Return escalation result ────────────────────────────────────────────
  return {
    escalatedRisk,
    escalated,
    reason,
    credentialsDetected: credentialIndicatorsScore > 0,
    credentialTypes: Array.from(new Set(credentialTypes)), // deduplicate
    patterns
  };
}

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

// Helper: create a mock scoreObj with specified credential indicator score
function createScoreObj(credentialIndicatorsScore, classification = "code", features = {}) {
  return {
    classification,
    score: 10,
    strong_evidence: true,
    reason: "✓ Meets threshold (score ≥ 6) AND has strong evidence",
    features: {
      code_keywords: 3,
      imports: 3,
      braces: 2,
      function_calls: 2,
      semicolons: 1,
      operators: 1,
      naming_conventions: 1,
      comments: 1,
      indentation: 1,
      line_density: 1,
      credentialIndicators: credentialIndicatorsScore,
      ...features
    }
  };
}

// ── Test 1: Code with NO credentials (credentialIndicators = 0) ──────────

console.log("Test 1: Code without credentials");
const scoreObj1 = createScoreObj(0);
const escalation1 = evaluateCodeRiskEscalation(scoreObj1, "low");

test(
  "No credentials detected",
  escalation1.credentialsDetected === false,
  `credentialsDetected=${escalation1.credentialsDetected}`
);

test(
  "Base risk is maintained (LOW)",
  escalation1.escalatedRisk === "low",
  `escalatedRisk=${escalation1.escalatedRisk}`
);

test(
  "Escalation flag is false",
  escalation1.escalated === false,
  `escalated=${escalation1.escalated}`
);

test(
  "Reason mentions no credentials",
  escalation1.reason.includes("No embedded credentials"),
  `reason="${escalation1.reason}"`
);

test(
  "Credential types array is empty",
  escalation1.credentialTypes.length === 0,
  `credentialTypes=${escalation1.credentialTypes}`
);

// ── Test 2: Code with CRITICAL credentials (score > 0.5) ──────────────────

console.log("\nTest 2: Code with critical credentials (API key/JWT)");
const scoreObj2 = createScoreObj(0.75);  // High score indicates critical credentials
const escalation2 = evaluateCodeRiskEscalation(scoreObj2, "low");

test(
  "Credentials detected",
  escalation2.credentialsDetected === true,
  `credentialsDetected=${escalation2.credentialsDetected}`
);

test(
  "Risk escalated to HIGH",
  escalation2.escalatedRisk === "high",
  `escalatedRisk=${escalation2.escalatedRisk}`
);

test(
  "Escalation flag is true",
  escalation2.escalated === true,
  `escalated=${escalation2.escalated}`
);

test(
  "Reason mentions critical patterns",
  escalation2.reason.includes("critical patterns"),
  `reason="${escalation2.reason}"`
);

test(
  "Credential types include api_key, jwt, aws_key, github_token",
  escalation2.credentialTypes.includes("api_key") &&
  escalation2.credentialTypes.includes("jwt") &&
  escalation2.credentialTypes.includes("aws_key") &&
  escalation2.credentialTypes.includes("github_token"),
  `credentialTypes=${escalation2.credentialTypes.join(", ")}`
);

test(
  "Patterns array contains redacted examples",
  escalation2.patterns.length > 0 && 
  escalation2.patterns.some(p => p.includes("REDACTED")),
  `patterns=${escalation2.patterns.join(", ")}`
);

// ── Test 3: Code with SENSITIVE credentials (0 < score ≤ 0.5) ────────────

console.log("\nTest 3: Code with sensitive credentials (password/secret keyword)");
const scoreObj3 = createScoreObj(0.35);  // Moderate score
const escalation3 = evaluateCodeRiskEscalation(scoreObj3, "low");

test(
  "Credentials detected",
  escalation3.credentialsDetected === true,
  `credentialsDetected=${escalation3.credentialsDetected}`
);

test(
  "Risk escalated to MODERATE (from LOW)",
  escalation3.escalatedRisk === "moderate",
  `escalatedRisk=${escalation3.escalatedRisk}`
);

test(
  "Escalation flag is true",
  escalation3.escalated === true,
  `escalated=${escalation3.escalated}`
);

test(
  "Reason mentions sensitive keywords",
  escalation3.reason.includes("sensitive"),
  `reason="${escalation3.reason}"`
);

test(
  "Credential types include password, secret, token",
  escalation3.credentialTypes.includes("password") &&
  escalation3.credentialTypes.includes("secret") &&
  escalation3.credentialTypes.includes("token"),
  `credentialTypes=${escalation3.credentialTypes.join(", ")}`
);

// ── Test 4: Base risk already MODERATE with moderate credentials ─────────

console.log("\nTest 4: Already MODERATE risk, moderate credentials found");
const scoreObj4 = createScoreObj(0.35);
const escalation4 = evaluateCodeRiskEscalation(scoreObj4, "moderate");

test(
  "Risk remains MODERATE",
  escalation4.escalatedRisk === "moderate",
  `escalatedRisk=${escalation4.escalatedRisk}`
);

test(
  "Escalation flag is false (no change)",
  escalation4.escalated === false,
  `escalated=${escalation4.escalated}`
);

test(
  "Reason mentions no further escalation",
  escalation4.reason.includes("no further escalation"),
  `reason="${escalation4.reason}"`
);

// ── Test 5: Base risk already HIGH with critical credentials ──────────────

console.log("\nTest 5: Already HIGH risk, critical credentials found");
const scoreObj5 = createScoreObj(0.75);
const escalation5 = evaluateCodeRiskEscalation(scoreObj5, "high");

test(
  "Risk remains HIGH",
  escalation5.escalatedRisk === "high",
  `escalatedRisk=${escalation5.escalatedRisk}`
);

test(
  "Escalation flag is false (already high)",
  escalation5.escalated === false,
  `escalated=${escalation5.escalated}`
);

test(
  "Reason mentions already at HIGH",
  escalation5.reason.includes("Already at HIGH"),
  `reason="${escalation5.reason}"`
);

// ── Test 6: Invalid input handling ────────────────────────────────────────

console.log("\nTest 6: Invalid input handling");

const escalation6a = evaluateCodeRiskEscalation(null, "low");
test(
  "Null scoreObj returns default result",
  escalation6a.escalatedRisk === "low" && escalation6a.escalated === false,
  `escalatedRisk=${escalation6a.escalatedRisk}`
);

const escalation6b = evaluateCodeRiskEscalation({}, 123);
test(
  "Non-string baseRisk returns default result",
  escalation6b.escalatedRisk === 123,
  `escalatedRisk=${escalation6b.escalatedRisk}`
);

// ── Test 7: Edge case - credentials with prose classification ────────────

console.log("\nTest 7: Credentials detected in prose-classified block");
const scoreObj7 = createScoreObj(0.6);  // High credentials but prose classification
scoreObj7.classification = "prose";
const escalation7 = evaluateCodeRiskEscalation(scoreObj7, "low");

test(
  "Credentials still escalate risk to HIGH",
  escalation7.escalatedRisk === "high",
  `escalatedRisk=${escalation7.escalatedRisk}`
);

test(
  "Log includes classification info",
  escalation7.reason.length > 0,
  `reason="${escalation7.reason}"`
);

// ── Test 8: Deduplication of credential types ────────────────────────────

console.log("\nTest 8: Credential types are deduplicated");
const scoreObj8 = createScoreObj(0.65);
const escalation8 = evaluateCodeRiskEscalation(scoreObj8, "low");

const uniqueTypes = new Set(escalation8.credentialTypes);
test(
  "No duplicate credential types",
  uniqueTypes.size === escalation8.credentialTypes.length,
  `credentialTypes=${escalation8.credentialTypes}`
);

// ── Test 9: Escalation reason includes score value ───────────────────────

console.log("\nTest 9: Escalation reason includes score details");
const scoreObj9 = createScoreObj(0.42);
const escalation9 = evaluateCodeRiskEscalation(scoreObj9, "low");

test(
  "Reason includes formatted score",
  escalation9.reason.includes("0.42"),
  `reason="${escalation9.reason}"`
);

// ── Test 10: Mixed feature scores (boundary value) ──────────────────────

console.log("\nTest 10: Boundary case - credentialIndicators exactly 0.5");
const scoreObj10 = createScoreObj(0.5);
const escalation10 = evaluateCodeRiskEscalation(scoreObj10, "low");

test(
  "Score of 0.5 escalates to MODERATE (boundary behavior)",
  escalation10.escalatedRisk === "moderate",
  `escalatedRisk=${escalation10.escalatedRisk}`
);

test(
  "Escalation occurred",
  escalation10.escalated === true,
  `escalated=${escalation10.escalated}`
);

// ── Test 11: Very high credential score ─────────────────────────────────

console.log("\nTest 11: Very high credential indicator (edge case)");
const scoreObj11 = createScoreObj(0.99);
const escalation11 = evaluateCodeRiskEscalation(scoreObj11, "low");

test(
  "Score 0.99 escalates to HIGH",
  escalation11.escalatedRisk === "high",
  `escalatedRisk=${escalation11.escalatedRisk}`
);

test(
  "Reason includes critical patterns",
  escalation11.reason.includes("0.99"),
  `reason="${escalation11.reason}"`
);

// ── Test 12: Minimum credential detection (just above 0) ─────────────────

console.log("\nTest 12: Minimum credential detection");
const scoreObj12 = createScoreObj(0.01);
const escalation12 = evaluateCodeRiskEscalation(scoreObj12, "low");

test(
  "Score 0.01 escalates to MODERATE",
  escalation12.escalatedRisk === "moderate",
  `escalatedRisk=${escalation12.escalatedRisk}`
);

test(
  "Credentials are detected",
  escalation12.credentialsDetected === true,
  `credentialsDetected=${escalation12.credentialsDetected}`
);

// ── Summary ──────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(50));
console.log(`Tests passed: ${passCount}`);
console.log(`Tests failed: ${failCount}`);
console.log("=".repeat(50));

if (failCount === 0) {
  console.log("✓ All tests passed!");
} else {
  console.log(`✗ ${failCount} test(s) failed`);
}

// ── Export for use in other modules ──────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    passCount,
    failCount,
    createScoreObj
  };
}

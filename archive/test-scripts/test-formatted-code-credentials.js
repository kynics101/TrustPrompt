#!/usr/bin/env node
/**
 * Test: Formatted code blocks with credential detection
 * 
 * Simulates the flow for formatted code blocks with credentials
 */

console.log("=".repeat(70));
console.log("TEST: Formatted Code Block Credential Detection");
console.log("=".repeat(70) + "\n");

// Simulate the extraction flow
const codeWithSSS = `const sss = "04-1234567-8"; // employee record`;

console.log("Code block detected:");
console.log(codeWithSSS);

// Step 1: Extract formatted code (detectFormattedCodeBlock returns this)
const formattedCode = codeWithSSS;
console.log(`\nFormatted code extracted: "${formattedCode}"`);

// Step 2: Compute credential indicators
const CREDENTIAL_PATTERNS = {
  ph_ids: [
    /\d{2}-\d{7}-\d/g,
    /\d{4}\s\d{7}\s\d/g,
    /\d{4}-\d{4}-\d{4}-\d{4}/g,
    /\d{3}-\d{3}-\d{3}/g,
    /\d{1,3}-\d{2}-\d{6,7}/g
  ]
};

function countPatternMatches(text, patterns) {
  if (!Array.isArray(patterns)) return 0;
  let count = 0;
  for (const pattern of patterns) {
    if (pattern instanceof RegExp) {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    }
  }
  return count;
}

function computeCredentialIndicators(text) {
  if (!text || !text.trim() || !CREDENTIAL_PATTERNS) {
    return { value: 0.0 };
  }
  
  let totalCount = 0;
  for (const [category, patterns] of Object.entries(CREDENTIAL_PATTERNS)) {
    if (Array.isArray(patterns) && patterns.length > 0 && typeof patterns[0] === 'string') {
      continue;
    }
    if (Array.isArray(patterns)) {
      totalCount += countPatternMatches(text, patterns);
    }
  }
  
  return {
    value: Math.min(1.0, totalCount * 0.33)
  };
}

const credRes = computeCredentialIndicators(formattedCode);
console.log(`\nCredential indicators computed: ${credRes.value}`);

// Step 3: Create scoreObj with credentials included
const scoreObj = {
  classification: 'code',
  score: 99,
  strong_evidence: true,
  features: {
    credentialIndicators: credRes.value
  }
};

console.log(`\nscoreObj.features.credentialIndicators: ${scoreObj.features.credentialIndicators}`);

// Step 4: Evaluate risk escalation
function evaluateCodeRiskEscalation(scoreObj) {
  const features = scoreObj.features || {};
  const credentialIndicatorsScore = features.credentialIndicators || 0;
  
  console.log(`\nEvaluating code risk:`);
  console.log(`  credentialIndicatorsScore: ${credentialIndicatorsScore}`);
  console.log(`  credentialIndicatorsScore > 0: ${credentialIndicatorsScore > 0}`);
  
  return {
    escalatedRisk: credentialIndicatorsScore > 0 ? 'high' : 'low',
    escalated: credentialIndicatorsScore > 0,
    credentialsDetected: credentialIndicatorsScore > 0,
    reason: credentialIndicatorsScore > 0 ? 'Credentials detected' : 'No credentials'
  };
}

const escalationResult = evaluateCodeRiskEscalation(scoreObj);

console.log(`\nEscalation result:`);
console.log(`  credentialsDetected: ${escalationResult.credentialsDetected}`);
console.log(`  escalatedRisk: ${escalationResult.escalatedRisk}`);

// Step 5: Check if extraction will be triggered
const shouldExtract = escalationResult.credentialsDetected && formattedCode;
console.log(`\nWill extract credentials: ${shouldExtract}`);

if (shouldExtract) {
  console.log(`\n✓ SUCCESS: Code with SSS number will have credentials extracted!`);
  console.log(`  Next: extractCredentialsFromCode() will be called`);
  console.log(`  Result: ph_id_sss finding for 04-1234567-8 will be created`);
} else {
  console.log(`\n✗ FAILED: Credentials not detected, extraction won't happen`);
}

console.log("\n" + "=".repeat(70) + "\n");

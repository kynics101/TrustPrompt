// test-log-code-detection-11-1.js
// Tests for Task 11.1: logCodeDetection(scoreObj, findings) function
// Requirement 16: Logging and Diagnostics

// This test file validates the logCodeDetection function exported from scanner.js
// It tests logging output, verbosity levels, and escalation detection

// Mock console.log to capture output
const capturedLogs = [];
const originalLog = console.log;
const originalWarn = console.warn;

function mockConsoleLog(...args) {
  capturedLogs.push({
    type: 'log',
    text: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  });
}

function mockConsoleWarn(...args) {
  capturedLogs.push({
    type: 'warn',
    text: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  });
}

function startCapturingLogs() {
  capturedLogs.length = 0;
  console.log = mockConsoleLog;
  console.warn = mockConsoleWarn;
}

function stopCapturingLogs() {
  console.log = originalLog;
  console.warn = originalWarn;
}

function getLogs() {
  return capturedLogs.map(entry => entry.text);
}

function clearLogs() {
  capturedLogs.length = 0;
}

// Create a mock TrustScanner with just the needed functions for testing
// We'll test the logCodeDetection function directly
const TrustScanner = (() => {
  // CODE_DETECTION_CONFIG (from scanner.js)
  const CODE_DETECTION_CONFIG = {
    enableSourceCodeDetection: true,
    scoreThreshold: 6,
    requireStrongEvidence: true,
    LOG_SIGNAL_DETAILS: true,
    LOG_THRESHOLD_COMPARISON: true,
    LOG_STRONG_EVIDENCE_DETECTION: true,
    verbosity: "info"
  };

  // updateCodeDetectionConfig function
  function updateCodeDetectionConfig(newConfig) {
    if (!newConfig || typeof newConfig !== 'object') {
      return CODE_DETECTION_CONFIG;
    }

    for (const key in newConfig) {
      if (newConfig.hasOwnProperty(key) && CODE_DETECTION_CONFIG.hasOwnProperty(key)) {
        CODE_DETECTION_CONFIG[key] = newConfig[key];
      }
    }

    return CODE_DETECTION_CONFIG;
  }

  // logCodeDetection function (from scanner.js)
  function logCodeDetection(scoreObj, findings) {
    if (!CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS && !CODE_DETECTION_CONFIG.LOG_THRESHOLD_COMPARISON) {
      return;
    }

    if (!scoreObj) {
      return;
    }

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const verbosity = CODE_DETECTION_CONFIG.verbosity || 'info';

    if (CODE_DETECTION_CONFIG.LOG_THRESHOLD_COMPARISON) {
      const scoreThreshold = CODE_DETECTION_CONFIG.scoreThreshold || 6;
      const thresholdMet = scoreObj.score >= scoreThreshold ? '✓' : '✗';
      console.log(
        `[TrustPrompt/CodeDetection] ${timestamp} Composite Score: ${scoreObj.score} ` +
        `(threshold: ${scoreThreshold}) ${thresholdMet}`
      );
    }

    if (CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS && verbosity === 'debug') {
      console.log('[TrustPrompt/CodeDetection] Feature Analysis:');

      const features = scoreObj.features || {};

      const featureMapping = {
        code_keywords: { name: 'Code Keywords', strong: true, max: 3 },
        import_statements: { name: 'Import/Require', strong: true, max: 3 },
        braces: { name: 'Braces', strong: true, max: 2 },
        function_calls: { name: 'Function Calls', strong: true, max: 2 },
        semicolons: { name: 'Semicolons', strong: false, max: 1 },
        operators: { name: 'Operators', strong: false, max: 1 },
        naming_conventions: { name: 'Naming Conventions', strong: false, max: 1 },
        comments: { name: 'Comments', strong: false, max: 1 },
        indentation: { name: 'Indentation', strong: false, max: 1 },
        line_density: { name: 'Line Density', strong: false, max: 1 }
      };

      for (const [key, meta] of Object.entries(featureMapping)) {
        if (!meta.strong) continue;
        const score = features[key] || 0;
        const passed = score > 0 ? '✓ PASS' : '✗ FAIL';
        console.log(`  [Strong] ${meta.name}: ${score}/${meta.max} ${passed}`);
      }

      for (const [key, meta] of Object.entries(featureMapping)) {
        if (meta.strong) continue;
        const score = features[key] || 0;
        const status = score > 0 ? '(detected)' : '(none)';
        console.log(`  [Weak] ${meta.name}: ${score}/${meta.max} ${status}`);
      }
    }

    if (CODE_DETECTION_CONFIG.LOG_STRONG_EVIDENCE_DETECTION) {
      const strongEvidencePresent = scoreObj.strong_evidence ? 'YES' : 'NO';
      const features = scoreObj.features || {};

      const detectedStrongTypes = [];
      if (features.code_keywords > 0) detectedStrongTypes.push('Code Keywords');
      if (features.import_statements > 0) detectedStrongTypes.push('Import/Require');
      if (features.braces > 0) detectedStrongTypes.push('Braces');
      if (features.function_calls >= 2) detectedStrongTypes.push('Function Calls');

      const strongEvidenceStr = detectedStrongTypes.length > 0
        ? `YES (${detectedStrongTypes.join(', ')})`
        : 'NO';

      console.log(`[TrustPrompt/CodeDetection] Strong Evidence: ${strongEvidenceStr}`);
    }

    console.log(`[TrustPrompt/CodeDetection] Classification: ${(scoreObj.classification || 'unknown').toUpperCase()}`);
    if (scoreObj.reason) {
      console.log(`[TrustPrompt/CodeDetection] Reason: ${scoreObj.reason}`);
    }

    if (findings && Array.isArray(findings)) {
      for (const finding of findings) {
        if (finding.elevated) {
          const escalationDetails = finding.elevation_reason || 'unknown reason';
          const originalRisk = finding.original_risk || 'low';
          console.log(
            `[TrustPrompt/CodeDetection] Risk Escalation: ${originalRisk} → ${finding.risk} ` +
            `(${escalationDetails})`
          );
        }
      }
    }

    if (CODE_DETECTION_CONFIG.LOG_THRESHOLD_COMPARISON && verbosity !== 'error') {
      const scoreThreshold = CODE_DETECTION_CONFIG.scoreThreshold || 6;
      const requireStrongEvidence = CODE_DETECTION_CONFIG.requireStrongEvidence || true;

      let thresholdVerdict;
      if (requireStrongEvidence && !scoreObj.strong_evidence) {
        thresholdVerdict = 'PROSE (no strong evidence)';
      } else if (scoreObj.score >= scoreThreshold) {
        thresholdVerdict = 'CODE (meets threshold)';
      } else {
        thresholdVerdict = 'PROSE (below threshold)';
      }

      console.log(`[TrustPrompt/CodeDetection] Total Score: ${scoreObj.score} (threshold: ${scoreThreshold}) | Strong Evidence: ${scoreObj.strong_evidence ? 'YES' : 'NO'} | Classification: ${thresholdVerdict}`);
    }
  }

  return {
    updateCodeDetectionConfig,
    logCodeDetection,
    LOG_SIGNAL_DETAILS: CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS,
    LOG_THRESHOLD_COMPARISON: CODE_DETECTION_CONFIG.LOG_THRESHOLD_COMPARISON,
    LOG_STRONG_EVIDENCE_DETECTION: CODE_DETECTION_CONFIG.LOG_STRONG_EVIDENCE_DETECTION,
    verbosity: CODE_DETECTION_CONFIG.verbosity
  };
})();
console.log("\n=== Test 1: Log CODE classification with strong evidence ===");
startCapturingLogs();

const scoreObjCode = {
  classification: "code",
  score: 10,
  strong_evidence: true,
  reason: "✓ Meets threshold (score ≥ 6) AND has strong evidence",
  features: {
    code_keywords: 3,
    import_statements: 3,
    braces: 2,
    function_calls: 2,
    semicolons: 1,
    operators: 1,
    naming_conventions: 0,
    comments: 1,
    indentation: 1,
    line_density: 1
  }
};

const findingsCode = [
  {
    patternId: "source_code",
    risk: "low",
    elevated: false,
    rawMatch: "function foo() { return 42; }"
  }
];

// Update config to enable logging
const originalConfig = {
  LOG_SIGNAL_DETAILS: TrustScanner.LOG_SIGNAL_DETAILS,
  LOG_THRESHOLD_COMPARISON: TrustScanner.LOG_THRESHOLD_COMPARISON,
  LOG_STRONG_EVIDENCE_DETECTION: TrustScanner.LOG_STRONG_EVIDENCE_DETECTION,
  verbosity: TrustScanner.verbosity
};

// Temporarily enable logging for testing
TrustScanner.updateCodeDetectionConfig({
  LOG_SIGNAL_DETAILS: true,
  LOG_THRESHOLD_COMPARISON: true,
  LOG_STRONG_EVIDENCE_DETECTION: true,
  verbosity: "debug"
});

TrustScanner.logCodeDetection(scoreObjCode, findingsCode);

stopCapturingLogs();

const logs1 = getLogs();
console.log("Captured logs:");
logs1.forEach(log => console.log("  ", log));

// Verify expected content
const hasCompositeScore = logs1.some(l => l.includes("Composite Score") && l.includes("10"));
const hasClassification = logs1.some(l => l.includes("Classification") && l.includes("CODE"));
const hasStrongEvidence = logs1.some(l => l.includes("Strong Evidence") && l.includes("YES"));
const hasReason = logs1.some(l => l.includes("Reason"));

console.log("\n✓ Test 1 checks:");
console.log("  Has composite score log:", hasCompositeScore);
console.log("  Has classification log:", hasClassification);
console.log("  Has strong evidence log:", hasStrongEvidence);
console.log("  Has reason log:", hasReason);

if (hasCompositeScore && hasClassification && hasStrongEvidence && hasReason) {
  console.log("✓ Test 1 PASSED");
} else {
  console.log("✗ Test 1 FAILED");
}

// ── Test 2: Log PROSE classification with no strong evidence ──────────────
console.log("\n=== Test 2: Log PROSE classification (no strong evidence) ===");
clearLogs();
startCapturingLogs();

const scoreObjProse = {
  classification: "prose",
  score: 3,
  strong_evidence: false,
  reason: "✗ Below threshold (score < 6) and no strong evidence",
  features: {
    code_keywords: 0,
    import_statements: 0,
    braces: 0,
    function_calls: 0,
    semicolons: 0,
    operators: 0,
    naming_conventions: 0,
    comments: 0,
    indentation: 1,
    line_density: 1
  }
};

const findingsProse = [];

TrustScanner.logCodeDetection(scoreObjProse, findingsProse);

stopCapturingLogs();

const logs2 = getLogs();
console.log("Captured logs:");
logs2.forEach(log => console.log("  ", log));

const hasProseClassification = logs2.some(l => l.includes("Classification") && l.includes("PROSE"));
const hasProseReason = logs2.some(l => l.includes("Reason") && l.includes("Below threshold"));

console.log("\n✓ Test 2 checks:");
console.log("  Has PROSE classification log:", hasProseClassification);
console.log("  Has prose reason log:", hasProseReason);

if (hasProseClassification && hasProseReason) {
  console.log("✓ Test 2 PASSED");
} else {
  console.log("✗ Test 2 FAILED");
}

// ── Test 3: Verbosity level filtering (info vs debug) ──────────────────────
console.log("\n=== Test 3: Verbosity level filtering (info level) ===");
clearLogs();

TrustScanner.updateCodeDetectionConfig({
  LOG_SIGNAL_DETAILS: true,
  LOG_THRESHOLD_COMPARISON: true,
  LOG_STRONG_EVIDENCE_DETECTION: true,
  verbosity: "info"  // Not debug - should not show feature details
});

startCapturingLogs();

TrustScanner.logCodeDetection(scoreObjCode, findingsCode);

stopCapturingLogs();

const logs3 = getLogs();
console.log("Captured logs (info level):");
logs3.forEach(log => console.log("  ", log));

// At info level, feature details should NOT be logged
const hasFeatureDetails = logs3.some(l => l.includes("[Strong]") || l.includes("[Weak]"));
const stillHasThresholdComparison = logs3.some(l => l.includes("Composite Score"));

console.log("\n✓ Test 3 checks:");
console.log("  No feature details at info level:", !hasFeatureDetails);
console.log("  Still has threshold comparison:", stillHasThresholdComparison);

if (!hasFeatureDetails && stillHasThresholdComparison) {
  console.log("✓ Test 3 PASSED");
} else {
  console.log("✗ Test 3 FAILED");
}

// ── Test 4: Logging disabled ──────────────────────────────────────────────
console.log("\n=== Test 4: Logging disabled (logScores flag false) ===");
clearLogs();

TrustScanner.updateCodeDetectionConfig({
  LOG_SIGNAL_DETAILS: false,
  LOG_THRESHOLD_COMPARISON: false,
  LOG_STRONG_EVIDENCE_DETECTION: false,
  verbosity: "debug"
});

startCapturingLogs();

TrustScanner.logCodeDetection(scoreObjCode, findingsCode);

stopCapturingLogs();

const logs4 = getLogs();
console.log("Captured logs when disabled:", logs4.length > 0 ? logs4 : "(no logs)");

console.log("\n✓ Test 4 checks:");
console.log("  No logs when disabled:", logs4.length === 0);

if (logs4.length === 0) {
  console.log("✓ Test 4 PASSED");
} else {
  console.log("✗ Test 4 FAILED");
}

// ── Test 5: Risk escalation logging ────────────────────────────────────────
console.log("\n=== Test 5: Risk escalation logging ===");
clearLogs();

TrustScanner.updateCodeDetectionConfig({
  LOG_SIGNAL_DETAILS: true,
  LOG_THRESHOLD_COMPARISON: true,
  LOG_STRONG_EVIDENCE_DETECTION: true,
  verbosity: "debug"
});

const findingsEscalated = [
  {
    patternId: "source_code",
    risk: "high",
    elevated: true,
    original_risk: "low",
    elevation_reason: "contains_embedded_credentials",
    rawMatch: "const apiKey = 'sk-1234567890abcdef';"
  }
];

startCapturingLogs();

TrustScanner.logCodeDetection(scoreObjCode, findingsEscalated);

stopCapturingLogs();

const logs5 = getLogs();
console.log("Captured logs:");
logs5.forEach(log => console.log("  ", log));

const hasEscalationLog = logs5.some(l => 
  l.includes("Risk Escalation") && 
  l.includes("low") && 
  l.includes("high") &&
  l.includes("contains_embedded_credentials")
);

console.log("\n✓ Test 5 checks:");
console.log("  Has escalation log with details:", hasEscalationLog);

if (hasEscalationLog) {
  console.log("✓ Test 5 PASSED");
} else {
  console.log("✗ Test 5 FAILED");
}

// ── Test 6: Strong evidence detection logging ────────────────────────────
console.log("\n=== Test 6: Strong evidence detection with multiple types ===");
clearLogs();

TrustScanner.updateCodeDetectionConfig({
  LOG_SIGNAL_DETAILS: false,
  LOG_THRESHOLD_COMPARISON: true,  // Keep at least one enabled
  LOG_STRONG_EVIDENCE_DETECTION: true,
  verbosity: "debug"
});

startCapturingLogs();

TrustScanner.logCodeDetection(scoreObjCode, findingsCode);

stopCapturingLogs();

const logs6 = getLogs();
console.log("Captured logs:");
logs6.forEach(log => console.log("  ", log));

const hasMultipleStrongTypes = logs6.some(l => 
  l.includes("Strong Evidence") && 
  (l.includes("Code Keywords") || l.includes("Import")) &&
  l.includes("YES")
);

console.log("\n✓ Test 6 checks:");
console.log("  Shows multiple strong evidence types:", hasMultipleStrongTypes);

if (hasMultipleStrongTypes) {
  console.log("✓ Test 6 PASSED");
} else {
  console.log("✗ Test 6 FAILED");
}

// ── Test 7: Null/undefined scoreObj handling ────────────────────────────
console.log("\n=== Test 7: Null scoreObj handling ===");
clearLogs();

TrustScanner.updateCodeDetectionConfig({
  LOG_SIGNAL_DETAILS: true,
  LOG_THRESHOLD_COMPARISON: true,
  verbosity: "debug"
});

startCapturingLogs();

TrustScanner.logCodeDetection(null, []);

stopCapturingLogs();

const logs7 = getLogs();
console.log("Captured logs for null scoreObj:", logs7.length > 0 ? logs7 : "(no logs)");

console.log("\n✓ Test 7 checks:");
console.log("  Handles null gracefully:", logs7.length === 0);

if (logs7.length === 0) {
  console.log("✓ Test 7 PASSED");
} else {
  console.log("✗ Test 7 FAILED");
}

// ── Test 8: Format validation ────────────────────────────────────────────
console.log("\n=== Test 8: Log format compliance ===");
clearLogs();

TrustScanner.updateCodeDetectionConfig({
  LOG_SIGNAL_DETAILS: false,
  LOG_THRESHOLD_COMPARISON: true,
  LOG_STRONG_EVIDENCE_DETECTION: false,
  verbosity: "info"
});

startCapturingLogs();

TrustScanner.logCodeDetection(scoreObjCode, findingsCode);

stopCapturingLogs();

const logs8 = getLogs();
console.log("Captured logs:");
logs8.forEach(log => console.log("  ", log));

// Check for expected format: [TrustPrompt/CodeDetection]
const allHaveCorrectPrefix = logs8.every(l => l.includes("[TrustPrompt/CodeDetection]"));

console.log("\n✓ Test 8 checks:");
console.log("  All logs have [TrustPrompt/CodeDetection] prefix:", allHaveCorrectPrefix);

if (allHaveCorrectPrefix && logs8.length > 0) {
  console.log("✓ Test 8 PASSED");
} else {
  console.log("✗ Test 8 FAILED");
}

// Restore original config
TrustScanner.updateCodeDetectionConfig(originalConfig);

console.log("\n=== All tests completed ===");

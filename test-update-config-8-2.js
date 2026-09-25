// test-update-config-8-2.js
// Unit tests for updateCodeDetectionConfig(newConfig) function
// Task 8.2: Implement updateCodeDetectionConfig(newConfig)
//
// Requirements: 8 (Threshold Calibration and Tuning), 15 (Configuration and Tuning Parameters)
//
// Test Coverage:
//   1. Config merge with partial updates
//   2. Threshold validation (1–16 range for score)
//   3. Boolean validation (requireStrongEvidence, logging flags)
//   4. Verbosity level validation
//   5. Weight validation (non-negative numbers)
//   6. Performance threshold validation
//   7. Invalid input handling
//   8. Logging behavior verification
//   9. Edge cases (null, undefined, empty object)

// Mock the required parts of scanner.js
const TrustScanner = (() => {
  // ── Initial CODE_DETECTION_CONFIG (from task 8.1) ───────────────
  const CODE_DETECTION_CONFIG = {
    SOURCE_CODE_THRESHOLD: 50,
    ENABLE_PROSE_HEURISTICS: false,
    WEIGHTS: {
      brace_density: 1.0,
      keywords: 1.2,
      indentation: 0.8,
      imports: 1.5,
      comments: 0.9
    },
    MAX_POSSIBLE_SCORE: 102.5,
    BRACE_DENSITY_THRESHOLDS: {
      low: 0.02,
      high: 0.05
    },
    BRACE_DENSITY_SCORES: {
      none: 0,
      moderate: 10,
      high: 20
    },
    KEYWORD_DENSITY_THRESHOLDS: {
      moderate: 0.02,
      high: 0.05
    },
    KEYWORD_DENSITY_SCORES: {
      none: 0,
      moderate: 15,
      high: 25
    },
    INDENTATION_THRESHOLDS: {
      some: 0.1,
      moderate: 0.2,
      consistent: 0.3
    },
    INDENTATION_SCORES: {
      none: 0,
      weak: 8,
      moderate: 12,
      deep_nesting: 5
    },
    IMPORT_SCORES: {
      none: 0,
      few: 10,
      moderate: 15,
      many: 20
    },
    COMMENT_SCORES: {
      none: 0,
      few: 5,
      moderate: 10,
      many: 15
    },
    PERFORMANCE_WARN_MS: 10,
    PERFORMANCE_MAX_MS: 5,
    LOG_SIGNAL_DETAILS: true,
    LOG_THRESHOLD_COMPARISON: true,
    LOG_PERFORMANCE: true,
    MAX_CODE_BLOCK_LINES: 20,
    CODE_CONTEXT_LOOKAHEAD: 100,
    TRIGGER_PHRASES_INTENTIONAL: [
      "here is", "here's", "like this", "for example", "such as",
      "code:", "function:", "script:", "example:", "implementation:",
      "try this", "use this", "run this", "execute this", "implement",
      "this is the", "see below", "check this", "look at", "paste this",
      "code example", "code snippet", "source code", "implementation example"
    ],
    LOG_STRONG_EVIDENCE_DETECTION: true,
    verbosity: "info",
    ENABLE_PROSE_HEURISTICS: false,
    PROSE_PATTERNS: {
      capitalized_sentences: /(?:^|[\.\!\?]\s+)[A-Z][a-z]+(?:\s+[a-z]+)*[\.\!\?]/m,
      english_articles: /\b(?:the|a|an|and|or|but|in|on|at|to|for|of|with|from)\b/gi
    }
  };

  // ── TASK 8.2: UPDATE CODE DETECTION CONFIG ──────────────────────────────────────
  function updateCodeDetectionConfig(newConfig) {
    if (!newConfig || typeof newConfig !== 'object') {
      console.warn('[TrustPrompt/CodeDetection] updateCodeDetectionConfig: newConfig must be an object');
      return CODE_DETECTION_CONFIG;
    }

    const updatedValues = {};
    let validationErrors = [];

    // Validate and merge each property
    for (const key in newConfig) {
      if (!newConfig.hasOwnProperty(key)) continue;

      const newValue = newConfig[key];

      // scoreThreshold: must be 1–16 (per requirement: minimum 1 point, max 3+3+2+2+1+1+1+1+1+1 = 16)
      if (key === 'scoreThreshold' || key === 'SOURCE_CODE_THRESHOLD') {
        if (typeof newValue !== 'number') {
          validationErrors.push(`${key}: must be a number (current: ${CODE_DETECTION_CONFIG[key]})`);
          continue;
        }
        if (newValue < 1 || newValue > 16) {
          validationErrors.push(`${key}: must be between 1–16 (received: ${newValue})`);
          continue;
        }
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
      // requireStrongEvidence: must be boolean
      else if (key === 'requireStrongEvidence' || key === 'REQUIRE_STRONG_EVIDENCE') {
        if (typeof newValue !== 'boolean') {
          validationErrors.push(`${key}: must be a boolean (received: ${typeof newValue})`);
          continue;
        }
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
      // Logging flags: must be boolean
      else if (key === 'LOG_SIGNAL_DETAILS' || key === 'LOG_THRESHOLD_COMPARISON' || 
               key === 'LOG_PERFORMANCE' || key === 'LOG_STRONG_EVIDENCE_DETECTION') {
        if (typeof newValue !== 'boolean') {
          validationErrors.push(`${key}: must be a boolean (received: ${typeof newValue})`);
          continue;
        }
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
      // verbosity: must be "debug", "info", "warn", or "error"
      else if (key === 'verbosity') {
        const validVerbosities = ['debug', 'info', 'warn', 'error'];
        if (!validVerbosities.includes(newValue)) {
          validationErrors.push(`${key}: must be one of ${JSON.stringify(validVerbosities)} (received: "${newValue}")`);
          continue;
        }
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
      // ENABLE_PROSE_HEURISTICS: must be boolean
      else if (key === 'ENABLE_PROSE_HEURISTICS') {
        if (typeof newValue !== 'boolean') {
          validationErrors.push(`${key}: must be a boolean (received: ${typeof newValue})`);
          continue;
        }
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
      // Weights: can be partial object, must have numeric values
      else if (key === 'WEIGHTS' && typeof newValue === 'object') {
        for (const weightKey in newValue) {
          if (!newValue.hasOwnProperty(weightKey)) continue;
          const weight = newValue[weightKey];
          if (typeof weight !== 'number' || weight < 0) {
            validationErrors.push(`WEIGHTS.${weightKey}: must be a non-negative number (received: ${weight})`);
            continue;
          }
          if (!CODE_DETECTION_CONFIG.WEIGHTS[weightKey]) {
            validationErrors.push(`WEIGHTS.${weightKey}: unknown weight key (valid: ${Object.keys(CODE_DETECTION_CONFIG.WEIGHTS).join(', ')})`);
            continue;
          }
          CODE_DETECTION_CONFIG.WEIGHTS[weightKey] = weight;
          updatedValues[`WEIGHTS.${weightKey}`] = weight;
        }
      }
      // Performance thresholds: must be non-negative numbers
      else if (key === 'PERFORMANCE_WARN_MS' || key === 'PERFORMANCE_MAX_MS') {
        if (typeof newValue !== 'number' || newValue < 0) {
          validationErrors.push(`${key}: must be a non-negative number (received: ${newValue})`);
          continue;
        }
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
      // MAX_CODE_BLOCK_LINES: must be positive integer
      else if (key === 'MAX_CODE_BLOCK_LINES') {
        if (!Number.isInteger(newValue) || newValue < 1) {
          validationErrors.push(`${key}: must be a positive integer (received: ${newValue})`);
          continue;
        }
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
      // CODE_CONTEXT_LOOKAHEAD: must be positive integer
      else if (key === 'CODE_CONTEXT_LOOKAHEAD') {
        if (!Number.isInteger(newValue) || newValue < 0) {
          validationErrors.push(`${key}: must be a non-negative integer (received: ${newValue})`);
          continue;
        }
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
      // Other keys: allow as-is (for extensibility, but log warning)
      else {
        console.warn(`[TrustPrompt/CodeDetection] updateCodeDetectionConfig: unknown config key "${key}", allowing as-is`);
        CODE_DETECTION_CONFIG[key] = newValue;
        updatedValues[key] = newValue;
      }
    }

    // Log results
    if (CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS || CODE_DETECTION_CONFIG.verbosity === 'debug') {
      console.log('[TrustPrompt/CodeDetection] Configuration Update:');
      console.log(`  Updated values: ${JSON.stringify(updatedValues)}`);
      if (validationErrors.length > 0) {
        console.warn(`  Validation errors (${validationErrors.length}): ${validationErrors.join('; ')}`);
      } else {
        console.log('  All validations passed');
      }
      console.log(`  Active config:
    - SOURCE_CODE_THRESHOLD: ${CODE_DETECTION_CONFIG.SOURCE_CODE_THRESHOLD}
    - REQUIRE_STRONG_EVIDENCE: ${CODE_DETECTION_CONFIG.requireStrongEvidence}
    - LOG_SIGNAL_DETAILS: ${CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS}
    - LOG_THRESHOLD_COMPARISON: ${CODE_DETECTION_CONFIG.LOG_THRESHOLD_COMPARISON}
    - LOG_PERFORMANCE: ${CODE_DETECTION_CONFIG.LOG_PERFORMANCE}
    - verbosity: ${CODE_DETECTION_CONFIG.verbosity}
    - ENABLE_PROSE_HEURISTICS: ${CODE_DETECTION_CONFIG.ENABLE_PROSE_HEURISTICS}`);
    }

    return CODE_DETECTION_CONFIG;
  }

  return { updateCodeDetectionConfig };
})();

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: updateCodeDetectionConfig
// ══════════════════════════════════════════════════════════════════════════════

const testResults = [];

function assert(condition, message) {
  if (!condition) {
    testResults.push({ passed: false, message: `FAIL: ${message}` });
    console.error(`✗ ${message}`);
  } else {
    testResults.push({ passed: true, message: `PASS: ${message}` });
    console.log(`✓ ${message}`);
  }
}

console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
console.log('║ TASK 8.2: updateCodeDetectionConfig(newConfig) — Test Suite                   ║');
console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

// Test 1: Partial config update with valid threshold
console.log('Test 1: Partial config update with valid threshold');
const result1 = TrustScanner.updateCodeDetectionConfig({ SOURCE_CODE_THRESHOLD: 8 });
assert(result1.SOURCE_CODE_THRESHOLD === 8, 'SOURCE_CODE_THRESHOLD updated to 8');
console.log('');

// Test 2: Threshold validation — below minimum (0)
console.log('Test 2: Threshold validation — reject below minimum');
const result2 = TrustScanner.updateCodeDetectionConfig({ SOURCE_CODE_THRESHOLD: 0 });
assert(result2.SOURCE_CODE_THRESHOLD === 8, 'Threshold unchanged (validation rejected 0)');
console.log('');

// Test 3: Threshold validation — above maximum (17)
console.log('Test 3: Threshold validation — reject above maximum');
const result3 = TrustScanner.updateCodeDetectionConfig({ SOURCE_CODE_THRESHOLD: 17 });
assert(result3.SOURCE_CODE_THRESHOLD === 8, 'Threshold unchanged (validation rejected 17)');
console.log('');

// Test 4: Valid threshold at minimum (1)
console.log('Test 4: Valid threshold at minimum boundary');
TrustScanner.updateCodeDetectionConfig({ SOURCE_CODE_THRESHOLD: 1 });
const result4 = TrustScanner.updateCodeDetectionConfig({ SOURCE_CODE_THRESHOLD: 1 });
assert(result4.SOURCE_CODE_THRESHOLD === 1, 'SOURCE_CODE_THRESHOLD accepted at minimum (1)');
console.log('');

// Test 5: Valid threshold at maximum (16)
console.log('Test 5: Valid threshold at maximum boundary');
TrustScanner.updateCodeDetectionConfig({ SOURCE_CODE_THRESHOLD: 1 });
const result5 = TrustScanner.updateCodeDetectionConfig({ SOURCE_CODE_THRESHOLD: 16 });
assert(result5.SOURCE_CODE_THRESHOLD === 16, 'SOURCE_CODE_THRESHOLD accepted at maximum (16)');
console.log('');

// Test 6: requireStrongEvidence validation — boolean
console.log('Test 6: requireStrongEvidence validation — boolean accepted');
const result6 = TrustScanner.updateCodeDetectionConfig({ REQUIRE_STRONG_EVIDENCE: true });
assert(result6.REQUIRE_STRONG_EVIDENCE === true, 'REQUIRE_STRONG_EVIDENCE set to true');
console.log('');

// Test 7: requireStrongEvidence validation — non-boolean rejected
console.log('Test 7: requireStrongEvidence validation — non-boolean rejected');
const prevRequire = result6.REQUIRE_STRONG_EVIDENCE;
const result7 = TrustScanner.updateCodeDetectionConfig({ REQUIRE_STRONG_EVIDENCE: 'true' });
assert(result7.REQUIRE_STRONG_EVIDENCE === prevRequire, 'Non-boolean REQUIRE_STRONG_EVIDENCE rejected');
console.log('');

// Test 8: Logging flags — boolean validation
console.log('Test 8: Logging flags — boolean accepted');
const result8 = TrustScanner.updateCodeDetectionConfig({ 
  LOG_SIGNAL_DETAILS: false,
  LOG_THRESHOLD_COMPARISON: true,
  LOG_PERFORMANCE: false
});
assert(result8.LOG_SIGNAL_DETAILS === false, 'LOG_SIGNAL_DETAILS set to false');
assert(result8.LOG_THRESHOLD_COMPARISON === true, 'LOG_THRESHOLD_COMPARISON set to true');
assert(result8.LOG_PERFORMANCE === false, 'LOG_PERFORMANCE set to false');
console.log('');

// Test 9: Verbosity validation — valid level
console.log('Test 9: Verbosity validation — valid levels accepted');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result9a = TrustScanner.updateCodeDetectionConfig({ verbosity: 'debug' });
assert(result9a.verbosity === 'debug', 'verbosity "debug" accepted');
const result9b = TrustScanner.updateCodeDetectionConfig({ verbosity: 'info' });
assert(result9b.verbosity === 'info', 'verbosity "info" accepted');
const result9c = TrustScanner.updateCodeDetectionConfig({ verbosity: 'warn' });
assert(result9c.verbosity === 'warn', 'verbosity "warn" accepted');
const result9d = TrustScanner.updateCodeDetectionConfig({ verbosity: 'error' });
assert(result9d.verbosity === 'error', 'verbosity "error" accepted');
console.log('');

// Test 10: Verbosity validation — invalid level rejected
console.log('Test 10: Verbosity validation — invalid level rejected');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const prevVerbosity = 'error';
const result10 = TrustScanner.updateCodeDetectionConfig({ verbosity: 'trace' });
assert(result10.verbosity === prevVerbosity, 'Invalid verbosity "trace" rejected');
console.log('');

// Test 11: Weight validation — valid weights
console.log('Test 11: Weight validation — valid weights accepted');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result11 = TrustScanner.updateCodeDetectionConfig({ 
  WEIGHTS: {
    brace_density: 1.5,
    keywords: 1.0
  }
});
assert(result11.WEIGHTS.brace_density === 1.5, 'brace_density weight updated to 1.5');
assert(result11.WEIGHTS.keywords === 1.0, 'keywords weight updated to 1.0');
assert(result11.WEIGHTS.imports === 1.5, 'Other weights unchanged (imports still 1.5)');
console.log('');

// Test 12: Weight validation — non-numeric rejected
console.log('Test 12: Weight validation — non-numeric rejected');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result12 = TrustScanner.updateCodeDetectionConfig({ 
  WEIGHTS: {
    brace_density: 'high'
  }
});
assert(result12.WEIGHTS.brace_density === 1.5, 'Non-numeric weight rejected');
console.log('');

// Test 13: Weight validation — unknown weight key rejected
console.log('Test 13: Weight validation — unknown weight key rejected');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result13 = TrustScanner.updateCodeDetectionConfig({ 
  WEIGHTS: {
    unknown_weight: 2.0
  }
});
assert(!result13.WEIGHTS.unknown_weight, 'Unknown weight key rejected (not added)');
console.log('');

// Test 14: Performance thresholds — valid values
console.log('Test 14: Performance thresholds — valid values accepted');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result14 = TrustScanner.updateCodeDetectionConfig({ 
  PERFORMANCE_WARN_MS: 15,
  PERFORMANCE_MAX_MS: 8
});
assert(result14.PERFORMANCE_WARN_MS === 15, 'PERFORMANCE_WARN_MS updated to 15');
assert(result14.PERFORMANCE_MAX_MS === 8, 'PERFORMANCE_MAX_MS updated to 8');
console.log('');

// Test 15: Performance thresholds — negative rejected
console.log('Test 15: Performance thresholds — negative values rejected');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result15 = TrustScanner.updateCodeDetectionConfig({ 
  PERFORMANCE_WARN_MS: -5
});
assert(result15.PERFORMANCE_WARN_MS === 15, 'Negative PERFORMANCE_WARN_MS rejected');
console.log('');

// Test 16: MAX_CODE_BLOCK_LINES — valid values
console.log('Test 16: MAX_CODE_BLOCK_LINES — positive integer accepted');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result16 = TrustScanner.updateCodeDetectionConfig({ 
  MAX_CODE_BLOCK_LINES: 30
});
assert(result16.MAX_CODE_BLOCK_LINES === 30, 'MAX_CODE_BLOCK_LINES updated to 30');
console.log('');

// Test 17: MAX_CODE_BLOCK_LINES — non-integer rejected
console.log('Test 17: MAX_CODE_BLOCK_LINES — non-integer rejected');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result17 = TrustScanner.updateCodeDetectionConfig({ 
  MAX_CODE_BLOCK_LINES: 25.5
});
assert(result17.MAX_CODE_BLOCK_LINES === 30, 'Non-integer MAX_CODE_BLOCK_LINES rejected');
console.log('');

// Test 18: CODE_CONTEXT_LOOKAHEAD — valid values
console.log('Test 18: CODE_CONTEXT_LOOKAHEAD — non-negative integer accepted');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result18 = TrustScanner.updateCodeDetectionConfig({ 
  CODE_CONTEXT_LOOKAHEAD: 150
});
assert(result18.CODE_CONTEXT_LOOKAHEAD === 150, 'CODE_CONTEXT_LOOKAHEAD updated to 150');
console.log('');

// Test 19: CODE_CONTEXT_LOOKAHEAD — negative rejected
console.log('Test 19: CODE_CONTEXT_LOOKAHEAD — negative values rejected');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result19 = TrustScanner.updateCodeDetectionConfig({ 
  CODE_CONTEXT_LOOKAHEAD: -50
});
assert(result19.CODE_CONTEXT_LOOKAHEAD === 150, 'Negative CODE_CONTEXT_LOOKAHEAD rejected');
console.log('');

// Test 20: ENABLE_PROSE_HEURISTICS — boolean validation
console.log('Test 20: ENABLE_PROSE_HEURISTICS — boolean accepted');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result20 = TrustScanner.updateCodeDetectionConfig({ 
  ENABLE_PROSE_HEURISTICS: true
});
assert(result20.ENABLE_PROSE_HEURISTICS === true, 'ENABLE_PROSE_HEURISTICS set to true');
console.log('');

// Test 21: Invalid input — null
console.log('Test 21: Invalid input — null returns config unchanged');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const currentThreshold = 16;
const result21 = TrustScanner.updateCodeDetectionConfig(null);
assert(result21.SOURCE_CODE_THRESHOLD === currentThreshold, 'null input does not modify config');
console.log('');

// Test 22: Invalid input — undefined
console.log('Test 22: Invalid input — undefined returns config unchanged');
const result22 = TrustScanner.updateCodeDetectionConfig(undefined);
assert(result22.SOURCE_CODE_THRESHOLD === currentThreshold, 'undefined input does not modify config');
console.log('');

// Test 23: Invalid input — non-object
console.log('Test 23: Invalid input — non-object (string) rejected');
const result23 = TrustScanner.updateCodeDetectionConfig('not an object');
assert(result23.SOURCE_CODE_THRESHOLD === currentThreshold, 'String input rejected');
console.log('');

// Test 24: Empty object — no changes
console.log('Test 24: Empty object — no changes to config');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const snapshot = { ...result23 };
const result24 = TrustScanner.updateCodeDetectionConfig({});
assert(result24.SOURCE_CODE_THRESHOLD === snapshot.SOURCE_CODE_THRESHOLD, 'Empty object does not modify config');
console.log('');

// Test 25: Multiple properties at once
console.log('Test 25: Multiple properties updated simultaneously');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result25 = TrustScanner.updateCodeDetectionConfig({
  SOURCE_CODE_THRESHOLD: 10,
  LOG_SIGNAL_DETAILS: false,
  LOG_PERFORMANCE: true,
  verbosity: 'debug',
  WEIGHTS: { keywords: 1.1 }
});
assert(result25.SOURCE_CODE_THRESHOLD === 10, 'SOURCE_CODE_THRESHOLD merged');
assert(result25.LOG_SIGNAL_DETAILS === false, 'LOG_SIGNAL_DETAILS merged');
assert(result25.LOG_PERFORMANCE === true, 'LOG_PERFORMANCE merged');
assert(result25.verbosity === 'debug', 'verbosity merged');
assert(result25.WEIGHTS.keywords === 1.1, 'WEIGHTS.keywords merged');
console.log('');

// Test 26: Logging output controlled by LOG_SIGNAL_DETAILS flag
console.log('Test 26: Logging controlled by LOG_SIGNAL_DETAILS');
console.log('  (should see detailed log output if LOG_SIGNAL_DETAILS is true)');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: true });
TrustScanner.updateCodeDetectionConfig({ SOURCE_CODE_THRESHOLD: 12 });
console.log('');

// Test 27: Ensure unknown keys are allowed but logged
console.log('Test 27: Unknown config keys allowed with warning');
TrustScanner.updateCodeDetectionConfig({ LOG_SIGNAL_DETAILS: false });
const result27 = TrustScanner.updateCodeDetectionConfig({
  CUSTOM_OPTION: 'some value'
});
assert(result27.CUSTOM_OPTION === 'some value', 'Unknown key added to config');
console.log('');

// ══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n╔════════════════════════════════════════════════════════════════════════════════╗');
const passed = testResults.filter(r => r.passed).length;
const failed = testResults.filter(r => !r.passed).length;
console.log(`║ Results: ${passed} passed, ${failed} failed (Total: ${testResults.length} tests)                    ║`);
console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

if (failed === 0) {
  console.log('✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`✗ ${failed} test(s) failed`);
  process.exit(1);
}

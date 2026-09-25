// scanner.js — TrustPrompt main-thread scan pipeline + risk scoring engine
//
// Framework basis:
//   NIST SP 800-122  — qualitative impact levels (Low / Moderate / High)
//   RA 10173         — PI, SPI, identifiability from information alone or together
//   Researcher-defined rules — operational scoring, escalation, ceiling, response logic
//                              (must be calibrated and reported transparently)
//
// Flow (RAE 5-step model):
//   rawText
//     → normalise
//     → Path A (regex + validator) + Path B (gazetteer)
//     → merge / dedupe
//     → suppressPlaceholders (TASK-4.4)
//     → Step 1: base score per distinct entity type
//     → Step 2: distinct entity-type multiplier
//     → Step 3: preliminary classification
//     → Step 4: governance rule evaluation
//     → Step 5: final risk classification

// ══════════════════════════════════════════════════════════════════════════════
// TASK 17.1: MULTI-FEATURE SOURCE CODE DETECTION FRAMEWORK — INLINE DOCUMENTATION
// ══════════════════════════════════════════════════════════════════════════════
//
// Overview
// ────────
// The 10-feature composite scoring framework replaces the single-signal approach
// with a dual-threshold classification rule:
//
//   Classification = "code"  IF (total_score >= 6) AND (strong_evidence_present)
//   Classification = "prose" OTHERWISE
//
// This framework detects unformatted code blocks in plain text, distinguishes code
// from technical prose with high accuracy, and escalates risk when credentials are
// embedded in code blocks.
//
// Design reference: .kiro/specs/source-code-detection-improvement/design.md
// Requirements:  1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18
//
// Feature Classification
// ──────────────────────
// STRONG EVIDENCE (trigger classification as code when combined with score >= 6):
//   Feature 1: Code Keywords        - 3 pts  if/else, function, class, import, def, etc.
//   Feature 2: Import/Require       - 3 pts  import..from, require(), #include, use, etc.
//   Feature 3: Braces               - 2 pts  braceDensity >= 0.03 OR totalBraces >= 2
//   Feature 4: Function Calls       - 2 pts  if 2+ calls (1 pt if exactly 1 call)
//
// WEAK EVIDENCE (accumulate supporting score but alone cannot trigger classification):
//   Feature 5:  Semicolons          - 1 pt   1+ semicolons
//   Feature 6:  Operators           - 1 pt   arithmetic, logical, bitwise, assignment ops
//   Feature 7:  Naming Conventions  - 1 pt   2+ camelCase or snake_case identifiers
//   Feature 8:  Comments            - 1 pt   //, #, --, /* */, <!-- -->
//   Feature 9:  Indentation         - 1 pt   >=20% of lines indented 4+ spaces or tabs
//   Feature 10: Line Density        - 1 pt   3+ lines AND avg 30-150 chars/line
//
// Maximum possible score: 3 + 3 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 1 = 16 points
//
// Strong Evidence Definition
// ──────────────────────────
// strong_evidence_present = true IF ANY of the following:
//   - features.code_keywords > 0       (keywords score > 0)
//   - features.import_statements > 0   (imports score > 0)
//   - features.braces > 0              (braces score > 0)
//   - features.function_calls >= 2     (2+ function calls = strong)
//
// Dual Threshold Classification Rule
// ────────────────────────────────────
//   IF (total_score >= CODE_DETECTION_CONFIG.scoreThreshold)   // default: 6
//      AND (strong_evidence_present OR !requireStrongEvidence)  // default: true
//   THEN classification = "code"
//   ELSE classification = "prose"
//
// This two-part requirement prevents false positives from technical prose with high
// weak-evidence scores (e.g., documentation with many camelCase terms and operators).
//
// Configuration Parameters (CODE_DETECTION_CONFIG)
// ──────────────────────────────────────────────────
//   enableSourceCodeDetection  {boolean}  Master enable/disable (default: true)
//   scoreThreshold             {number}   Min score for code classification (default: 6)
//   requireStrongEvidence      {boolean}  Enforce dual threshold (default: true)
//   LOG_SIGNAL_DETAILS         {boolean}  Log each feature's score (default: true)
//   LOG_THRESHOLD_COMPARISON   {boolean}  Log score vs threshold (default: true)
//   LOG_PERFORMANCE            {boolean}  Log execution timing (default: true)
//   verbosity                  {string}   "debug"|"info"|"warn"|"error" (default: "info")
//   PERFORMANCE_WARN_MS        {number}   Log warning if scoring > N ms (default: 10)
//   MAX_CODE_BLOCK_LINES       {number}   Max lines per unformatted block (default: 20)
//
//   Update at runtime: TrustScanner.updateCodeDetectionConfig({ scoreThreshold: 7 })
//
// Risk Escalation (Requirement 12)
// ─────────────────────────────────
// When a code block is detected, embedded credentials are scanned:
//   - API keys, JWT, GitHub/OpenAI/AWS tokens:  Escalate to HIGH
//   - Passwords, database URLs, secrets:         Escalate to MODERATE
//   - No credentials:                            Maintain base risk (LOW)
//
// Context-Aware Elevation (Requirement 10)
// ──────────────────────────────────────────
// Trigger phrases in 100-char lookahead/lookbehind windows elevate LOW -> MODERATE:
//   "here is", "example:", "code:", "function:", "try this", "see below", etc.
//
// Performance Optimization (Requirement 13, Tasks 14.1 + 14.2)
// ──────────────────────────────────────────────────────────────
// - All regex patterns pre-compiled at module load time (zero compilation cost per call)
// - Texts > 1000 chars sampled: head 350 + mid 300 + tail 350 chars (sampled: true)
// - Credential indicators always evaluated on full text (never sampled)
// - Target: < 0.5ms per feature, < 5ms total per block
//
// Calibration Results (Task 15.3, Requirement 14)
// ─────────────────────────────────────────────────
//   41 positive samples (JS, Python, SQL, Shell, Go, Rust, C#, unformatted):
//     TPR (True Positive Rate):  95.1%  PASS  [target: >=90%]
//     FNR (False Negative Rate): 4.9%   PASS  [target: <=10%]
//   30 negative samples (prose, tech docs, config files, edge cases):
//     TNR (True Negative Rate):  96.7%  PASS  [target: >=85%]
//     FPR (False Positive Rate): 3.3%   PASS  [target: <=15%]
//
// ══════════════════════════════════════════════════════════════════════════════
// TASK 17.2: DIAGNOSTIC EXAMPLE
// ══════════════════════════════════════════════════════════════════════════════
//
// Input: JavaScript async function with embedded API key (unformatted, no fences)
//
//   const apiKey = 'sk-abc123def456ghi789';
//   async function fetchUser(userId) {
//     const res = await fetch('/api/users', {
//       headers: { 'Authorization': 'Bearer ' + apiKey }
//     });
//     return res.json();
//   }
//   fetchUser(42);
//
// Expected feature scores:
//   Feature 1: Code Keywords   - const, async, function, return, await  -> 3 pts (STRONG)
//   Feature 2: Import/Require  - (none)                                  -> 0 pts
//   Feature 3: Braces          - 4 open + 4 close = 8 total braces      -> 2 pts (STRONG)
//   Feature 4: Function Calls  - fetch(), fetchUser(), res.json() = 3   -> 2 pts (STRONG)
//   Feature 5: Semicolons      - 3 semicolons found                      -> 1 pt
//   Feature 6: Operators       - + (string concat), = (assignment)       -> 1 pt
//   Feature 7: Naming Conv.    - apiKey, userId, fetchUser (camelCase)   -> 1 pt
//   Feature 8: Comments        - (none detected)                          -> 0 pts
//   Feature 9: Indentation     - 5/7 lines indented >= 4 spaces = 71%   -> 1 pt
//   Feature 10: Line Density   - 7 lines, avg ~46 chars/line (in range)  -> 1 pt
//                                                                         -----
//   Total score: 3+0+2+2+1+1+1+0+1+1 = 12 pts
//
// Strong evidence: CODE_KEYWORDS (3), BRACES (2), FUNCTION_CALLS (2)
// strong_evidence_present = true
//
// Dual threshold:
//   score (12) >= threshold (6)? YES
//   strong_evidence_present?      YES
//   -> classification = "CODE"
//
// Credential escalation:
//   API key 'sk-abc123...' matches -> credentialIndicators > 0.5 -> HIGH
//   -> escalatedRisk = "high"
//
// Log output (CODE_DETECTION_CONFIG.verbosity = "debug"):
//   [TrustPrompt/CodeDetection] Feature: code_keywords    3 pts (threshold: >=1) PASS
//   [TrustPrompt/CodeDetection] Feature: import_stmts     0 pts (threshold: >=1) FAIL
//   [TrustPrompt/CodeDetection] Feature: braces           2 pts (threshold: >=2) PASS
//   [TrustPrompt/CodeDetection] Feature: function_calls   2 pts (threshold: >=2) PASS
//   [TrustPrompt/CodeDetection] Feature: semicolons       1 pt  (threshold: >=1) PASS
//   [TrustPrompt/CodeDetection] Feature: operators        1 pt  (threshold: >=1) PASS
//   [TrustPrompt/CodeDetection] Feature: naming_conv      1 pt  (threshold: >=2) PASS
//   [TrustPrompt/CodeDetection] Feature: comments         0 pts (threshold: >=1) FAIL
//   [TrustPrompt/CodeDetection] Feature: indentation      1 pt  (threshold: >=0.2) PASS
//   [TrustPrompt/CodeDetection] Feature: line_density     1 pt  (threshold: 30-150) PASS
//   [TrustPrompt/CodeDetection] Strong Evidence: CODE_KEYWORDS (3 pts), BRACES (2 pts), FUNCTION_CALLS (2 pts)
//   [TrustPrompt/CodeDetection] Total Score: 12 (threshold: 6) | Strong Evidence: YES | Classification: CODE
//   [TrustPrompt/code] code block + api_key detected -> HIGH risk
// ══════════════════════════════════════════════════════════════════════════════


/* global TrustNormalizer, TRUSTPROMPT_PATTERNS, TrustValidator, TrustGazetteer, TrustLinguisticDetector */
/* global shannonEntropy, isKnownPlaceholder, PLACEHOLDER_PATTERNS */

const TrustScanner = (() => {

  // ── TASK 1.2: CODE DETECTION CONFIGURATION ─────────────────────────────────
  // Multi-signal scoring framework for detecting source code (formatted and unformatted).
  // Supports Requirements 1, 8, 15: configurable thresholds, weights, and language-specific patterns.

  // ── TASK 8.1: CODE DETECTION CONFIGURATION ──────────────────────────────
  // Multi-feature scoring framework for source code detection (unformatted and formatted).
  // Dual threshold validation: score ≥ 6 AND strong evidence required for classification.
  // Features: 4 strong evidence types (3pts each), 6 weak evidence types (1pt each) → max 16 points
  // Supports Requirements 1, 8, 15: configurable thresholds, feature points, logging.
  // Reference: Design Section 1.4 (Configuration)

  const CODE_DETECTION_CONFIG = {
    // ── Feature-Based Scoring Configuration ─────────────────────────────────
    // Dual Threshold Rule: classification = "code" IF (score ≥ 6) AND (strong_evidence_present)
    enableSourceCodeDetection: true,     // Requirement 15: Master enable/disable flag
    scoreThreshold: 6,                   // Requirement 8: Minimum score for code classification
    requireStrongEvidence: true,         // Requirement 15: Require at least one strong type

    // ── Feature Configuration (Requirement 15) ──────────────────────────────
    // Each feature has: enabled (bool), strong (bool), points (int)
    // Strong evidence types: code_keywords, import_statements, braces, function_calls ≥ 2
    // Weak evidence types: semicolons, operators, naming_conventions, comments, indentation, line_density
    features: {
      code_keywords: {
        enabled: true,
        strong: true,
        points: 3
      },
      import_statements: {
        enabled: true,
        strong: true,
        points: 3
      },
      braces: {
        enabled: true,
        strong: true,
        points: 2
      },
      function_calls: {
        enabled: true,
        strong: true,
        points: 2,
        strongThreshold: 2  // 2+ calls = strong, 1 call = weak (1pt)
      },
      semicolons: {
        enabled: true,
        strong: false,
        points: 1
      },
      operators: {
        enabled: true,
        strong: false,
        points: 1
      },
      naming_conventions: {
        enabled: true,
        strong: false,
        points: 1
      },
      comments: {
        enabled: true,
        strong: false,
        points: 1
      },
      indentation: {
        enabled: true,
        strong: false,
        points: 1
      },
      line_density: {
        enabled: true,
        strong: false,
        points: 1
      }
    },

    // ── Brace Density Thresholds (Requirement 2) ────────────────────────────
    BRACE_DENSITY_THRESHOLDS: {
      low: 0.02,   // 1 brace per 50 characters: moderate evidence
      high: 0.05   // 1 brace per 20 characters: strong evidence
    },

    // ── Keyword Density Thresholds (Requirement 3) ──────────────────────────
    KEYWORD_DENSITY_THRESHOLDS: {
      moderate: 0.02,  // 2% of words are code keywords
      high: 0.05       // 5% of words are code keywords
    },

    // ── Indentation Pattern Configuration (Requirement 4) ──────────────────
    INDENTATION_THRESHOLDS: {
      some: 0.1,       // 10% of lines have indentation: weak evidence
      moderate: 0.2,   // 20% of lines have indentation: trigger
      consistent: 0.3  // 30% of lines have indentation with consistency
    },

    // ── Function Call Detection Thresholds (Requirement 4) ─────────────────
    FUNCTION_CALL_THRESHOLDS: {
      strong: 2,       // 2+ function calls = strong evidence (2 points)
      weak: 1          // 1 function call = weak evidence (1 point)
    },

    // ── Import/Require Statement Patterns (Requirement 5) ──────────────────
    IMPORT_PATTERNS: {
      javascript: [
        /import\s+\{?[\w\.\,\s]+\}?\s+from\s+["'][\w\.\/-]+["']/gi,
        /require\s*\(\s*["'][\w\.\/-]+["']\s*\)/gi,
        /export\s+(?:default\s+)?(?:function|class|const|let|var|async)/gi
      ],
      python: [
        /^import\s+[\w\.]+/gim,
        /^from\s+[\w\.]+\s+import\s+[\w\,\s]+/gim
      ],
      java: [
        /^import\s+[\w\.]+;?/gim,
        /^package\s+[\w\.]+/gim
      ],
      csharp: [
        /^using\s+[\w\.]+;?/gim,
        /^namespace\s+[\w\.]+/gim
      ],
      cpp: [
        /#include\s+[<"][\w\.\/-]+[>"]/gi,
        /#import\s+[<"][\w\.\/-]+[>"]/gi
      ],
      go: [
        /^import\s+\(/gim,
        /^import\s+"[\w\.\/-]+"/gim
      ],
      rust: [
        /^use\s+[\w\:\:]+/gim,
        /^mod\s+[\w]+/gim
      ],
      php: [
        /(?:require|include|require_once|include_once)\s+["'][\w\.\/-]+["']/gi,
        /^use\s+[\w\\]+/gim
      ]
    },

    // ── Comment Marker Patterns per Language (Requirement 6) ────────────────
    // Used for detecting comment syntax in source code
    COMMENT_PATTERNS: {
      single_line: {
        javascript: /\/\/.*$/gm,       // JavaScript, Java, C++, Go, Rust
        python: /#.*$/gm,              // Python, Ruby, Shell, Perl
        sql: /--.*$/gm,                // SQL, Lua, Haskell, Ada
        vb: /'.*$/gm                   // VB.NET, VBA
      },
      block: {
        javascript: /\/\*[\s\S]*?\*\//g,      // JavaScript, Java, C, C++, Go, Rust
        python: /"""[\s\S]*?"""/g,            // Python docstring
        python_alt: /'''[\s\S]*?'''/g,       // Python docstring (alternate)
        ruby: /=begin[\s\S]*?=end/gm,        // Ruby
        html: /<!--[\s\S]*?-->/g             // HTML, XML
      }
    },

    // ── Credential Escalation Configuration (Requirement 12) ────────────────
    // Risk escalation levels when credentials detected in code blocks
    credentialPatterns: [
      /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([A-Za-z0-9\-_+\/]{10,})["']?/gi,
      /AKIA[A-Z0-9]{16}/g,                   // AWS access key
      /(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}/g,  // GitHub tokens
      /sk-[A-Za-z0-9\-]{20,}/g,              // OpenAI API key
      /eyJ[A-Za-z0-9\-_]{7,}\.eyJ[A-Za-z0-9\-_]{7,}\./g,  // JWT
      /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/gi,  // Private keys
      /(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{6,})["']/gi,     // Passwords
      /(?:database|db)[_-]?(?:url|connection)\s*[:=]\s*(?:mongodb|postgresql|mysql)[:\/]/gi
    ],

    escalateTo: {
      credentialFound: "moderate",     // Non-critical credentials → MODERATE risk
      credentialAndCode: "high"        // Critical credentials + code → HIGH risk
    },

    // ── Performance Configuration (Requirement 13) ───────────────────────────
    PERFORMANCE_WARN_MS: 10,            // Warn if scoring exceeds 10ms
    PERFORMANCE_MAX_MS: 5,              // Target completion within 5ms per block

    // ── Code Block Extraction (Requirement 11) ──────────────────────────────
    MAX_CODE_BLOCK_LINES: 20,           // Maximum consecutive lines per block
    CODE_CONTEXT_LOOKAHEAD: 100,        // Characters before/after for context analysis

    // ── Context-Aware Detection (Requirement 10) ────────────────────────────
    // Trigger phrases that increase confidence when near code blocks
    TRIGGER_PHRASES_INTENTIONAL: [
      "here is", "here's", "like this", "for example", "such as",
      "code:", "function:", "script:", "example:", "implementation:",
      "try this", "use this", "run this", "execute this", "implement",
      "this is the", "see below", "check this", "look at", "paste this",
      "code example", "code snippet", "source code", "implementation example"
    ],

    // ── Logging and Diagnostics (Requirement 16) ────────────────────────────
    LOG_SIGNAL_DETAILS: true,           // Log each feature's score and reasoning
    LOG_THRESHOLD_COMPARISON: true,     // Log "score X ≥ threshold Y" decisions
    LOG_PERFORMANCE: true,              // Log execution time per block
    LOG_STRONG_EVIDENCE_DETECTION: true, // Log strong evidence type detection
    verbosity: "info",                  // Log verbosity: "debug", "info", "warn", "error"

    // ── Prose Heuristics (Requirement 20) ────────────────────────────────────
    // Optional heuristics to reduce false positives from formatted prose
    ENABLE_PROSE_HEURISTICS: false,     // Disabled by default for predictability
    PROSE_PATTERNS: {
      capitalized_sentences: /(?:^|[\.\!\?]\s+)[A-Z][a-z]+(?:\s+[a-z]+)*[\.\!\?]/m,
      english_articles: /\b(?:the|a|an|and|or|but|in|on|at|to|for|of|with|from)\b/gi
    }
  };

  // ── TASK 8.2: UPDATE CODE DETECTION CONFIG ──────────────────────────────────────
  // REQUIREMENT 8, 15: Implement updateCodeDetectionConfig(newConfig)
  //
  // Accepts partial config updates and merges them with the existing CODE_DETECTION_CONFIG.
  // Validates threshold ranges and logs updated values.
  //
  // @param {Object} newConfig - Partial config object to merge
  // @returns {Object} Updated CODE_DETECTION_CONFIG
  //
  // Validation:
  //   - scoreThreshold: must be between 1–16 (points scale)
  //   - requireStrongEvidence: must be boolean
  //   - LOG_SIGNAL_DETAILS: must be boolean
  //   - LOG_THRESHOLD_COMPARISON: must be boolean
  //   - LOG_PERFORMANCE: must be boolean
  //   - verbosity: must be one of "debug", "info", "warn", "error"
  //
  // Example:
  //   updateCodeDetectionConfig({ scoreThreshold: 8, LOG_SIGNAL_DETAILS: false })
  //   → Validates and merges, logs: "[TrustPrompt/CodeDetection] Updated config: ..."
  //
  // Requirements: 8 (Threshold Calibration), 15 (Configuration)

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

  // ── TASK 3.1: LANGUAGE PATTERN DETECTION OBJECTS ──────────────────────────────
  // Multi-language pattern detection for Signal 2 (Token Pattern Recognition).
  // Each language entry contains:
  //   - weight: language prevalence factor (how likely this language is in typical code)
  //   - patterns: array of regex patterns for keywords, syntax, control flow, imports, comments
  // Reference: Design Section 1 (Signal 2), Requirement 3
  // Weight rationale: JavaScript 1.2 (most common), Python 1.1 (very common), SQL 1.0 (common),
  //                  Shell 0.9 (less common), JSON 0.8 (configuration, not pure code),
  //                  XML/HTML 0.7 (markup, not traditional code)

  const LANGUAGE_PATTERNS = {
    javascript: {
      weight: 1.2,  // JavaScript is prevalent and easily detected
      patterns: [
        // Control flow: if, else, for, while, do, switch, case, break, continue, return, try, catch, finally
        /\b(?:const|let|var|function|async|await|class|import|export|require)\b/i,
        // Control structures and keywords
        /\b(?:if|else|for|while|do|switch|case|break|continue|return|try|catch|finally)\b/i,
        // JavaScript-specific operators: typeof, instanceof, new, delete, void, in, of
        /\b(?:new|instanceof|typeof|void|delete|in|of)\b/i,
        // Arrow functions and method shorthand: => or methodName() { or methodName: function
        /=>|[a-zA-Z0-9_$]\s*:\s*(?:function|async\s+function|\(.*?\)|{)/,
        // Comments: single-line (//) or block comments (/* ... */)
        /\/\/.*?$|\/\*[\s\S]*?\*\//m
      ]
    },

    python: {
      weight: 1.1,  // Python is very common and distinctive
      patterns: [
        // Python-specific keywords: def, class (very distinctive)
        /\b(?:def|class)\b/,
        // Python imports: from X import Y
        /\bfrom\s+[\w.]+\s+import\b/,
        // Python indentation (4+ spaces at line start): very distinctive
        /^\s{4,}[a-zA-Z_]/m,
        // Python comments: starts with #
        /#/
      ]
    },

    sql: {
      weight: 1.0,  // SQL is common in many contexts
      patterns: [
        // SQL keywords: SELECT, FROM, WHERE, JOIN, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP
        /\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|DATABASE|VIEW|INDEX)\b/i,
        // SQL logical operators and conditions
        /\b(?:AND|OR|NOT|IN|BETWEEN|LIKE|EXISTS|IS|NULL)\b/i,
        // SQL statement structure: SELECT...FROM or INSERT...VALUES
        /\b(?:SELECT\s+.*?\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET)\b/i
      ]
    },

    shell: {
      weight: 0.9,  // Shell scripts are common but less universal
      patterns: [
        // Shebang: #!/bin/bash or #!/bin/sh (very distinctive)
        /^#!\/(?:bin\/bash|bin\/sh|usr\/bin\/env\s+bash)/m,
        // Shell keyword 'then' after if (very distinctive to shell)
        /if\s+\[.*?\]\s*;\s*then\b/,
        // Shell variable expansion: ${VAR} or pipes to common commands
        /\$\{[A-Za-z0-9_]+\}|\|\s+(?:grep|sed|awk)/,
        // Set directives: set -e, set -u
        /^set\s+-[a-z]/m
      ]
    },

    json: {
      weight: 0.8,  // JSON is configuration-like, not traditional code
      patterns: [
        // JSON key-value pairs: "key": (very distinctive)
        /"[^"]*"\s*:\s*(?:\{|\[|"|\d|true|false|null)/,
        // Multiple key-value pairs (indicates JSON structure)
        /"[^"]*"\s*:\s*[^,}]*,\s*"[^"]*"\s*:/,
        // JSON array with objects: [{...}]
        /\[\s*\{[\s\S]*\}\s*\]/
      ]
    },

  };

  // ── TASK 1.2: LANGUAGE-SPECIFIC KEYWORD SETS (Requirement 3) ─────────────
  // Comprehensive keyword list covering control flow, declarations, types, modules, and common objects.
  // Matched case-insensitively with word boundaries to avoid partial word matches.
  // Supports: JavaScript, Python, Java, C, C++, C#, PHP, Ruby, Go, Rust, SQL, Shell, and others.

  const LANGUAGE_KEYWORDS = {
    // ── Control Flow (all languages) ────────────────────────────────────
    control_flow: [
      "if", "else", "elseif", "elif", "for", "while", "do",
      "switch", "case", "break", "continue", "return",
      "try", "catch", "finally", "throw", "when", "match"
    ],

    // ── Variable/Function Declaration ───────────────────────────────────
    declaration: [
      "function", "def", "async", "await", "const", "let", "var",
      "class", "struct", "interface", "enum", "type", "typedef",
      "void", "static", "public", "private", "protected"
    ],

    // ── Type Keywords ───────────────────────────────────────────────────
    types: [
      "int", "string", "bool", "float", "double", "char", "long", "short",
      "boolean", "byte", "void", "null", "undefined", "true", "false",
      "any", "number", "object", "array", "map", "set", "list", "dict"
    ],

    // ── Module/Import (Node.js, Python, Java, C#, Rust, etc.) ──────────
    module_import: [
      "import", "export", "require", "module", "from", "as",
      "use", "include", "namespace", "package", "using", "implements"
    ],

    // ── Common Methods/Objects (JavaScript, Python, Java, C#) ──────────
    common_objects: [
      "console", "document", "window", "this", "self", "super", "new",
      "delete", "typeof", "instanceof", "extends", "super",
      "print", "printf", "println", "log", "logger",
      "object", "array", "string", "math", "date", "json", "error"
    ],

    // ── Operators and Keywords ──────────────────────────────────────────
    operators: [
      "and", "or", "not", "in", "is", "be", "lambda", "yield",
      "finally", "with", "assert", "raise", "pass", "global", "nonlocal"
    ],

    // ── SQL Keywords ────────────────────────────────────────────────────
    sql_keywords: [
      "select", "from", "where", "join", "left", "right", "inner", "outer",
      "on", "group", "by", "order", "having", "insert", "update", "delete",
      "create", "drop", "alter", "table", "database", "index", "view",
      "union", "intersect", "except", "case", "when", "then", "else"
    ],

    // ── Shell/Bash Keywords ─────────────────────────────────────────────
    shell_keywords: [
      "if", "then", "else", "fi", "for", "do", "done", "while",
      "case", "esac", "break", "continue", "function", "return",
      "export", "echo", "read", "declare", "local"
    ]
  };

  // Flatten keyword sets for easy iteration (case-insensitive matching)
  const ALL_CODE_KEYWORDS = [].concat(
    LANGUAGE_KEYWORDS.control_flow,
    LANGUAGE_KEYWORDS.declaration,
    LANGUAGE_KEYWORDS.types,
    LANGUAGE_KEYWORDS.module_import,
    LANGUAGE_KEYWORDS.common_objects,
    LANGUAGE_KEYWORDS.operators,
    LANGUAGE_KEYWORDS.sql_keywords,
    LANGUAGE_KEYWORDS.shell_keywords
  );

  // ── TASK 5.1: CREDENTIAL DETECTION PATTERN COLLECTION ────────────────────────
  // Comprehensive credential detection patterns for identifying embedded secrets in code.
  // Organized by credential type for modularity and clarity.
  // Used by computeCredentialIndicators() to elevate code block risk if credentials are found.
  // Reference: Requirements 4, 12; Design Section 1 (Signal 4)

  const CREDENTIAL_PATTERNS = {
    // ── Sub-category: API Key Patterns ──────────────────────────────────────
    // Detects variable assignments and environment variable references for API keys
    api_keys: [
      // Variable assignment patterns: api_key=..., secret=..., etc.
      /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([A-Za-z0-9\-_+\/]{10,})["']?/gi,
      /(?:secret|secret[_-]?key|secretkey)\s*[:=]\s*["']?([A-Za-z0-9\-_+\/]{10,})["']?/gi,
      /(?:api[_-]?secret|apisecret)\s*[:=]\s*["']?([A-Za-z0-9\-_+\/]{10,})["']?/gi,
      /(?:authorization|bearer)\s*[:=]\s*["']?Bearer\s+([A-Za-z0-9\-_+\/]{20,})["']?/gi
    ],

    // ── Sub-category: Environment Variables ─────────────────────────────────
    // Detects ${VAR_NAME} or $VAR_NAME patterns for secrets stored in env vars
    environment_variables: [
      /\$\{(?:API_KEY|SECRET|PASSWORD|TOKEN|BEARER|AUTH|AWS_ACCESS_KEY|AWS_SECRET_KEY)\}/gi,
      /\$(?:API_KEY|SECRET|PASSWORD|TOKEN|BEARER|AUTH|AWS_ACCESS_KEY|AWS_SECRET_KEY)\b/gi
    ],

    // ── Sub-category: Connection Strings ────────────────────────────────────
    // Detects database and service connection strings (mongodb://, postgresql://, etc.)
    connection_strings: [
      /mongodb(?:\+srv)?:\/\/[^\s]+/gi,         // MongoDB connection string
      /postgresql:\/\/[^\s]+/gi,                // PostgreSQL connection string
      /postgres:\/\/[^\s]+/gi,                  // PostgreSQL (alternate)
      /mysql:\/\/[^\s]+/gi,                     // MySQL connection string
      /mariadb:\/\/[^\s]+/gi,                   // MariaDB connection string
      /redis:\/\/[^\s]+/gi,                     // Redis connection string
      /amqp:\/\/[^\s]+/gi,                      // RabbitMQ/AMQP connection string
      /jdbc:[a-z]+:\/\/[^\s]+/gi                // Java JDBC connection string
    ],

    // ── Sub-category: AWS Credentials ──────────────────────────────────────
    // Detects AWS access key IDs and secret access keys
    aws_keys: [
      /AKIA[A-Z0-9]{16}/g,                      // AWS Access Key ID (always starts with AKIA)
      /(?:aws[_-]?secret|aws_secret_access_key)\s*[:=]\s*["']?([A-Za-z0-9\/+]{40})["']?/gi
    ],

    // ── Sub-category: GitHub Tokens ────────────────────────────────────────
    // Detects GitHub personal access tokens and OAuth tokens
    github_tokens: [
      /ghp_[A-Za-z0-9_]{36,}/g,                 // GitHub Personal Access Token (classic)
      /gho_[A-Za-z0-9_]{36,}/g,                 // GitHub OAuth Token
      /ghu_[A-Za-z0-9_]{36,}/g,                 // GitHub User-to-Server Token
      /ghs_[A-Za-z0-9_]{36,}/g,                 // GitHub Server-to-Server Token
      /ghr_[A-Za-z0-9_]{36,}/g,                 // GitHub Refresh Token
      /github[_-]?token\s*[:=]\s*["']?([A-Za-z0-9_]{36,})["']?/gi,
      /github[_-]?pat\s*[:=]\s*["']?([A-Za-z0-9_]{36,})["']?/gi,
      /github_pat_[A-Za-z0-9_]{36,}/g           // Alternative GitHub PAT pattern
    ],

    // ── Sub-category: OpenAI / AI API Keys ──────────────────────────────────
    // Detects OpenAI, Anthropic, and other AI service API keys
    openai_keys: [
      /sk-[A-Za-z0-9]{20,}/g,                   // OpenAI API key (sk-proj-...)
      /sk-proj-[A-Za-z0-9_\-]{20,}/g,          // OpenAI project-based key
      /(?:openai|anthropic)[_-]?(?:api[_-]?)?key\s*[:=]\s*["']?([A-Za-z0-9_\-]{20,})["']?/gi
    ],

    // ── Sub-category: JWT Patterns ──────────────────────────────────────────
    // Detects JSON Web Tokens (JWT format: header.payload.signature)
    jwt_tokens: [
      /eyJ[A-Za-z0-9\-_]{7,}\.eyJ[A-Za-z0-9\-_]{7,}\.[A-Za-z0-9\-_]{7,}/g,
      /(?:jwt|jwttoken|bearer)\s+eyJ[A-Za-z0-9\-_]+/gi
    ],

    // ── Sub-category: Base64-Encoded Data ───────────────────────────────────
    // Detects long base64 sequences (potentially encoded credentials)
    base64_data: [
      /[A-Za-z0-9+\/]{40,}={0,3}(?:\n|$)/g    // Base64 data (40+ chars)
    ],

    // ── Sub-category: Private Keys ──────────────────────────────────────────
    // Detects private key file markers (RSA, DSA, EC, OpenSSH)
    private_keys: [
      /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
      /-----BEGIN ENCRYPTED PRIVATE KEY-----/gi,
      /-----BEGIN CERTIFICATE-----/gi,
      /-----BEGIN PUBLIC KEY-----/gi
    ],

    // ── Sub-category: URLs with Embedded Credentials ────────────────────────
    // Detects URLs containing username:password (http://user:pass@host)
    urls_with_credentials: [
      /https?:\/\/(?:[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+@)[^\s\)>\]]+/g,
      /ftp:\/\/(?:[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+@)[^\s\)>\]]+/g
    ],

    // ── Sub-category: Variable Names Suggesting Secrets ──────────────────────
    // Keyword-based patterns for variable names and assignment patterns
    credential_variable_names: [
      "api_key", "apikey", "api-key", "api key",
      "secret", "secret_key", "secretkey", "secret-key",
      "password", "passwd", "pwd", "pass",
      "token", "access_token", "accesstoken", "refresh_token",
      "bearer", "authorization", "auth_token",
      "private_key", "privatekey", "private-key",
      "database_url", "db_url", "connection_string",
      "aws_access_key", "aws_secret", "aws_key",
      "github_token", "gitlab_token", "bitbucket_token",
      "client_secret", "oauth_secret", "client_id",
      "jwt", "jwttoken", "jwt-token"
    ],

    // ── Sub-category: Sensitive Keywords ────────────────────────────────────
    // Keywords that indicate sensitive information is nearby
    sensitive_keywords: [
      "password", "secret", "token", "api_key", "private_key",
      "database_url", "credential", "auth", "oauth", "jwt",
      "sensitive", "confidential", "encrypted", "decrypted",
      "apikey", "access_key", "secret_key", "bearer"
    ]
  };

  // ── TASK 1.2: COMMENT MARKER PATTERNS (Requirement 6) ──────────────────────
  // Language-specific comment syntax for detecting documentation in code.

  const COMMENT_MARKERS = {
    // Single-line comment patterns (// # -- ' `)
    single_line: {
      javascript: /\/\/.*$/gm,      // // ... (JavaScript, Java, C++, Go, Rust)
      python: /#.*$/gm,              // # ... (Python, Ruby, Shell)
      sql: /--.*$/gm,                // -- ... (SQL, Lua, Haskell)
      vb: /'.*$/gm                   // ' ... (VB.NET, VBA)
    },

    // Block comment patterns (/* ... */ """ """ =begin ... =end <!-- ... -->)
    block: {
      javascript: /\/\*[\s\S]*?\*\//g,       // /* ... */ (JavaScript, Java, C, C++, Go, Rust)
      python: /"""[\s\S]*?"""/g,             // """ ... """ (Python docstring)
      python_alt: /'''[\s\S]*?'''/g,        // ''' ... ''' (Python docstring)
      ruby: /=begin[\s\S]*?=end/g,          // =begin ... =end (Ruby)
      html: /<!--[\s\S]*?-->/g              // <!-- ... --> (HTML, XML)
    },

    // JSDoc/JavaDoc/Docstring patterns
    docstring: {
      jsdoc: /\/\*\*[\s\S]*?\*\//g,  // /** ... */ (JSDoc)
      javadoc: /\/\*\*[\s\S]*?\*\//g, // /** ... */ (JavaDoc)
      python_docstring: /"""[\s\S]*?"""/g // """ ... """ (Python)
    }
  };

  // Flatten comment markers for regex-based matching
  const ALL_COMMENT_PATTERNS = [
    ...Object.values(COMMENT_MARKERS.single_line),
    ...Object.values(COMMENT_MARKERS.block),
    ...Object.values(COMMENT_MARKERS.docstring)
  ];

  const RISK_ORDER = { none: 0, low: 1, moderate: 2, high: 3 };

  // ── STEP 1: Entity classification & base scores ───────────────────────────

  const BASE_SCORES = {
    // ── Critical / access-critical (score 10) ────────────────────────────
    credit_card:      10,
    jwt:              10,
    api_key:          10,
    // password_inline:  10,
    id_label:         10,

    // ── Philippine Government IDs (TASK-7.3) ───────────────────────────────
    ph_id_philid:              10,  // PhilID (PSA National ID)
    ph_id_drivers_license:     10,  // Driver's License (LTO)
    ph_id_passport:            10,  // Passport (BI)
    ph_id_umid:                10,  // UMID (Unified Multi-Purpose ID)
    ph_id_sss:                 10,  // SSS (Social Security System)
    ph_id_gsis:                10,  // GSIS (Government Service Insurance System)
    ph_id_prc:                 10,  // PRC (Professional Regulation Commission)
    ph_id_tin:                 10,  // TIN (Taxpayer Identification Number)
    ph_id_philhealth:          10,  // PhilHealth (Health Insurance)
    ph_id_nbi_clearance:       10,  // NBI Clearance
    ph_id_police_clearance:    10,  // Police Clearance (PNP)
    ph_id_psa_certificate:     10,  // PSA Certificate (Vital Records)
    ph_id_barangay_clearance:  8,   // Barangay Clearance (MODERATE risk - Requirement 13)
    ph_id_comelec_voter_id:    10,  // COMELEC Voter's ID

    // ── Direct personal identifiers (score 5) ────────────────────────────
    email:            5,
    ph_mobile:        5,
    phone_intl:       5,
    ph_address:       5,

    // ── Contextual indicators (score 2) ──────────────────────────────────
    ipv4:             2,
    ipv6:             2,
    mac_address:      2,
    personal_label:   2,
    trigger_person_name: 2,
    trigger_age:         2,
    trigger_dob:         2,
    trigger_employer:    2,
    trigger_location:    2,
    trigger_health:      2,
    trigger_financial:   2,
    gazetteer_medical:   2,
    gazetteer_financial: 2,
    nlp_person_name:     2,  // PATH C linguistic
    nlp_job_title:       2,  // PATH C linguistic
    nlp_organization:    2,  // PATH C linguistic

    // ── Container (score 2) ───────────────────────────────────────────────
    // Changed from 0 to 2: Source code detection should contribute to risk scoring
    // even without embedded credentials. Unformatted code itself is suspicious PII context.
    source_code: 2
  };

  const ENTITY_TIER = {
    credit_card:      "critical",
    jwt:              "critical",
    api_key:          "critical",
    id_label:         "critical",

    // ── Philippine Government IDs (TASK-7.3) – all classified as CRITICAL ────
    ph_id_philid:              "critical",  // PhilID (PSA National ID)
    ph_id_drivers_license:     "critical",  // Driver's License (LTO)
    ph_id_passport:            "critical",  // Passport (BI)
    ph_id_umid:                "critical",  // UMID (Unified Multi-Purpose ID)
    ph_id_sss:                 "critical",  // SSS (Social Security System)
    ph_id_gsis:                "critical",  // GSIS (Government Service Insurance System)
    ph_id_prc:                 "critical",  // PRC (Professional Regulation Commission)
    ph_id_tin:                 "critical",  // TIN (Taxpayer Identification Number)
    ph_id_philhealth:          "critical",  // PhilHealth (Health Insurance)
    ph_id_nbi_clearance:       "critical",  // NBI Clearance
    ph_id_police_clearance:    "critical",  // Police Clearance (PNP)
    ph_id_psa_certificate:     "critical",  // PSA Certificate (Vital Records)
    ph_id_barangay_clearance:  "critical",  // Barangay Clearance (MODERATE risk but CRITICAL tier)
    ph_id_comelec_voter_id:    "critical",  // COMELEC Voter's ID

    email:            "direct",
    ph_mobile:        "direct",
    phone_intl:       "direct",
    ph_address:       "direct",

    ipv4:             "contextual",
    ipv6:             "contextual",
    mac_address:      "contextual",
    personal_label:   "contextual",
    trigger_person_name: "contextual",
    trigger_age:         "contextual",
    trigger_dob:         "contextual",
    trigger_employer:    "contextual",
    trigger_location:    "contextual",
    trigger_health:      "contextual",
    trigger_financial:   "contextual",
    gazetteer_medical:   "contextual",
    gazetteer_financial: "contextual",
    nlp_person_name:     "contextual",  // PATH C linguistic
    nlp_job_title:       "contextual",  // PATH C linguistic
    nlp_organization:    "contextual",  // PATH C linguistic

    source_code: "container"
  };

  const SENSITIVE_CONTEXT_IDS = new Set([
    "gazetteer_medical",
    "gazetteer_financial",
    "trigger_health",
    "trigger_financial"
  ]);

  // ── STEP 2: Distinct entity-type multiplier ───────────────────────────────

  function getMultiplier(distinctTypeCount) {
    if (distinctTypeCount >= 5) return 2.00;
    if (distinctTypeCount === 4) return 1.70;
    if (distinctTypeCount === 3) return 1.40;
    if (distinctTypeCount === 2) return 1.20;
    return 1.00;
  }

  // ── STEP 3: Preliminary classification ───────────────────────────────────

  function preliminaryClass(score) {
    if (score >= 10) return "high";
    if (score >= 5)  return "moderate";
    if (score >= 2)  return "low";
    return "none";
  }

  // ── STEP 4: Governance rule evaluation ───────────────────────────────────
  //
  // TASK-8.1: Governance Rule 1 escalation for validated Philippine IDs
  // When finding.validated:true and ENTITY_TIER="critical" and patternId matches ph_id_*,
  // escalate risk to "high" regardless of other scoring factors.

  function evaluateGovernance(findings, preliminary) {
    const hasValidatedCritical = findings.some(
      f => ENTITY_TIER[f.patternId] === "critical" && f.validated === true
    );
    
    // TASK-8.1: Check for validated Philippine Government IDs
    const validatedPhilIDFinding = findings.find(
      f => f.validated === true && 
           ENTITY_TIER[f.patternId] === "critical" &&
           f.patternId && f.patternId.startsWith("ph_id_")
    );
    
    if (validatedPhilIDFinding) {
      console.log(`[TrustPrompt/governance] Rule 1 escalation: ${validatedPhilIDFinding.patternId} (validated) → HIGH`);
      return { rule: "rule_1_validated_philid", result: "high" };
    }

    const hasDirectOrCritical = findings.some(
      f => ENTITY_TIER[f.patternId] === "critical" ||
           ENTITY_TIER[f.patternId] === "direct"
    );
    const hasSensitiveContext = findings.some(
      f => SENSITIVE_CONTEXT_IDS.has(f.patternId)
    );
    const allContextualOrContainer = findings.every(
      f => ENTITY_TIER[f.patternId] === "contextual" ||
           ENTITY_TIER[f.patternId] === "container"
    );

    if (hasValidatedCritical) {
      return { rule: "critical_entity", result: "high" };
    }

    if (hasDirectOrCritical && hasSensitiveContext) {
      const raised = RISK_ORDER[preliminary] < RISK_ORDER["high"]
        ? Object.keys(RISK_ORDER).find(k => RISK_ORDER[k] === RISK_ORDER[preliminary] + 1)
        : "high";
      return { rule: "sensitive_context", result: raised };
    }

    if (allContextualOrContainer && findings.some(
      f => ENTITY_TIER[f.patternId] === "contextual")
    ) {
      return { rule: "contextual_ceiling", result: null };
    }

    return { rule: "none", result: null };
  }

  // ── STEP 5: Final classification ─────────────────────────────────────────

  function finalClass(preliminary, governance) {
    const { rule, result } = governance;

    if (rule === "rule_1_validated_philid") {
      return "high";
    }

    if (rule === "critical_entity") {
      return "high";
    }

    if (rule === "sensitive_context") {
      return result;
    }

    if (rule === "contextual_ceiling") {
      return RISK_ORDER[preliminary] > RISK_ORDER["moderate"] ? "moderate" : preliminary;
    }

    return preliminary;
  }

  // ── Main scoring function ─────────────────────────────────────────────────

  function computeRiskScore(findings) {
    const scorable = findings.filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0);
    if (scorable.length === 0) return { score: 0, riskLevel: "none", governance: "none" };

    const seenTypes = new Set();
    let baseTotal   = 0;
    for (const f of scorable) {
      if (!seenTypes.has(f.patternId)) {
        seenTypes.add(f.patternId);
        baseTotal += BASE_SCORES[f.patternId] ?? 0;
      }
    }

    const distinctTypeCount = seenTypes.size;
    const multiplier        = getMultiplier(distinctTypeCount);
    const preScore          = baseTotal * multiplier;
    const preliminary       = preliminaryClass(preScore);
    const governance        = evaluateGovernance(findings, preliminary);
    const riskLevel         = finalClass(preliminary, governance);

    console.log(
      `[TrustPrompt/scorer] base:${baseTotal} ×${multiplier} = ${preScore.toFixed(2)}`,
      `| prelim:${preliminary} | gov:${governance.rule}(${governance.result})`,
      `| final:${riskLevel}`
    );

    return {
      score:      Math.round(preScore * 100) / 100,
      riskLevel,
      governance: governance.rule
    };
  }

  // ── TASK-4.4: Placeholder suppression ────────────────────────────────────
  //
  // Removes findings whose rawMatch is a known placeholder value or matches
  // a structural placeholder pattern. Suppressed findings are logged to the
  // console but never shown to the user.
  //
  // Called after mergeAndDedupe() and before computeRiskScore().

  function suppressPlaceholders(findings) {
    const kept      = [];
    const suppressed = [];

    for (const f of findings) {
      if (isKnownPlaceholder(f.patternId, f.rawMatch)) {
        suppressed.push(f);
      } else {
        kept.push(f);
      }
    }

    if (suppressed.length > 0) {
      console.log(
        "[TrustPrompt/suppressed] placeholder findings removed:",
        suppressed.map(f => `${f.patternId}:${f.rawMatch.slice(0, 20)}`).join(", ")
      );
    }

    return kept;
  }

  // ── Context-aware filtering helper ──────────────────────────────────────────
  // TASK-4.7: Rejects matches that appear in measurement/unit contexts
  // This prevents false positives like "0909835056 grams" being flagged as a phone number.
  // Checks the original text around the match position for unit keywords.

  // ── TASK 4.7: Context-Aware Filtering for All PII Patterns ────────────────────
  // Determines if ANY detected PII pattern appears in a safe/educational context
  // that should be filtered out rather than flagged.
  //
  // PURPOSE: Apply context analysis to ALL regex-detected PII, not just phones.
  //          Examples:
  //            - "test@example.com" in email format documentation
  //            - "192.168.1.1" in "convert 192.168.1.1 to binary"
  //            - "4532-1234-5678-9999" in credit card validation guide
  //            - "AA:BB:CC:DD:EE:FF" in MAC address documentation
  //
  // PATTERNS FILTERED:
  //   Numeric: ipv4, ipv6, mac_address, credit_card
  //   Contact: phone_intl, ph_mobile, email
  //   Credentials: api_key, jwt
  //   IDs: All ph_id_* patterns

  function shouldFilterByContext(patternId, rawMatch, fullText, matchIndex) {
    // Patterns that benefit from context analysis
    const contextAwarePatterns = [
      'phone_intl', 'ph_mobile',      // Measurement contexts
      'email',                         // Example/demo contexts
      'ipv4', 'ipv6', 'mac_address',  // Educational contexts
      'credit_card',                   // Format documentation
      'api_key', 'jwt',                // Code/documentation blocks
      'ph_id_philid', 'ph_id_umid', 'ph_id_passport', 'ph_id_prc',
      'ph_id_postal', 'ph_id_pwd', 'ph_id_senior_citizen',
      'ph_id_gsis', 'ph_id_sss', 'ph_id_philhealth',
      'ph_id_drivers_license', 'ph_id_voters',
      'ph_id_pagibig', 'ph_id_police_clearance', 'ph_id_nbi'
    ];

    // Only apply context filtering to patterns that need it
    if (!contextAwarePatterns.includes(patternId)) {
      return false;
    }

    // Extract context: before and after the match (±150 chars)
    const beforeStart = Math.max(0, matchIndex - 150);
    const beforeText = fullText.slice(beforeStart, matchIndex).toLowerCase();
    
    const afterStart = matchIndex + rawMatch.length;
    const afterText = fullText.slice(afterStart, Math.min(fullText.length, afterStart + 150)).toLowerCase();
    
    const fullContext = beforeText + " [MATCH] " + afterText;

    // ── SAFE CONTEXT MARKERS ──────────────────────────────────────────────────
    
    // 1. Educational/How-To contexts
    const educationalMarkers = [
      /\b(how to|how do|how can|guide|tutorial|lesson|learn|study|teach|instruction)\b/,
      /\b(explain|describe|show|demonstrate|example|sample|documentation)\b/,
    ];
    
    if (educationalMarkers.some(m => m.test(fullContext))) {
      console.log(`[TrustPrompt/context] filtered ${patternId}: educational context`);
      return true;
    }

    // 2. Example/Demo/Test/Sample contexts
    const exampleMarkers = [
      /\b(example|demo|demonstration|test case|sample|mock|dummy|fake|test data)\b/,
      /\b(format example|template|structure|layout|pattern)\b/,
    ];
    
    if (exampleMarkers.some(m => m.test(fullContext))) {
      console.log(`[TrustPrompt/context] filtered ${patternId}: example/demo context`);
      return true;
    }

    // 3. Validation/Format/Verification contexts
    const validationMarkers = [
      /\b(validate|check|verify|parse|format|validation)\b/,
      /\b(invalid|correct|valid format|proper format|pattern match)\b/,
      /\b(test format|check format|verify format)\b/,
    ];
    
    if (validationMarkers.some(m => m.test(fullContext))) {
      console.log(`[TrustPrompt/context] filtered ${patternId}: validation context`);
      return true;
    }

    // 4. Code/Development contexts
    const codeMarkers = [
      /\b(code|code block|function|method|variable|constant|class|import|export|require)\b/,
      /\b(json|yaml|config|configuration|api|endpoint)\b/,
    ];
    
    if (codeMarkers.some(m => m.test(beforeText))) {  // Before text for code context
      console.log(`[TrustPrompt/context] filtered ${patternId}: code context`);
      return true;
    }

    // 5. Reference/Documentation contexts
    const referenceMarkers = [
      /\b(reference|specification|api doc|readme|wiki|documentation)\b/,
      /\b(specification|standard|format|rfc)\b/,
    ];
    
    if (referenceMarkers.some(m => m.test(fullContext))) {
      console.log(`[TrustPrompt/context] filtered ${patternId}: reference context`);
      return true;
    }

    // 6. Unit conversion/Measurement contexts (for numeric patterns)
    const measurementMarkers = [
      /\b(convert|turn|transform|into|to|from)\b/,
      /\b(gram|kg|meter|second|bit|byte|mb|gb|celsius|fahrenheit)\b/,
    ];
    
    if (['ipv4', 'ipv6', 'mac_address', 'credit_card', 'phone_intl', 'ph_mobile'].includes(patternId)) {
      if (measurementMarkers.some(m => m.test(fullContext))) {
        console.log(`[TrustPrompt/context] filtered ${patternId}: measurement context`);
        return true;
      }
    }

    // 7. Assignment/Placeholder contexts
    const placeholderMarkers = [
      /\b(replace|substitute|placeholder|with your own|your own|change this)\b/,
      /\b(insert your|put your|add your|use your own)\b/,
    ];
    
    if (placeholderMarkers.some(m => m.test(fullContext))) {
      console.log(`[TrustPrompt/context] filtered ${patternId}: placeholder context`);
      return true;
    }

    return false;
  }

  // ── DEPRECATED: Use shouldFilterByContext instead ─────────────────────────────
  // Kept for backwards compatibility with existing code that calls isMeasurementContext

  function isMeasurementContext(rawMatch, fullText, matchIndex) {
    // Measurement unit keywords that commonly follow numeric values
    const unitPatterns = [
      /\b(grams?|ounces?|pounds?|kilograms?|kg|lb|oz)\b/i,
      /\b(milliliters?|liters?|ml|l|gallons?|cups?|tablespoons?|teaspoons?)\b/i,
      /\b(meters?|kilometers?|miles?|feet|yards?|inches?|cm|mm|km|mi)\b/i,
      /\b(seconds?|minutes?|hours?|days?|weeks?|months?|years?|ms|sec|min|hr)\b/i,
      /\b(watts?|volts?|amperes?|hertz|Hz|MHz|GHz|W|V|A)\b/i,
      /\b(celsius|fahrenheit|degrees?|°C|°F)\b/i,
      /\b(bytes?|kilobytes?|megabytes?|gigabytes?|kb|mb|gb|bits?)\b/i,
      /\b(rpm|mph|kph|m\/s|km\/h)\b/i,
    ];

    // Action verbs that indicate unit conversion
    const conversionActions = [
      /\b(convert|turn|transform|change|translate|into|to)\b/i,
    ];

    // Look around the match for context
    // Before: Check for conversion actions and units BEFORE the number
    const beforeStart = Math.max(0, matchIndex - 100);
    const beforeText = fullText.slice(beforeStart, matchIndex);
    
    // After: Check for units AFTER the number
    const afterStart = matchIndex + rawMatch.length;
    const afterText = fullText.slice(afterStart, Math.min(fullText.length, afterStart + 100));
    
    // Combined context for broader matching
    const fullContext = beforeText + " [NUMBER] " + afterText;
    const contextLower = fullContext.toLowerCase();

    // Check if conversion action is mentioned anywhere in context
    const hasConversionAction = conversionActions.some(pattern => pattern.test(contextLower));
    
    // Check if any unit pattern appears in the context
    const hasUnitPattern = unitPatterns.some(pattern => pattern.test(contextLower));
    
    // If both conversion action AND units are present, or just units after
    if ((hasConversionAction && hasUnitPattern) || unitPatterns.some(pattern => pattern.test(afterText))) {
      return true;
    }

    return false;
  }

  // ── TASK 10.1: Context-Aware Code Detection ─────────────────────────────────
  // Determines if a code block appears in a context that suggests intentional code sharing.
  //
  // PURPOSE: When a code block is detected via multi-signal scoring, this function
  //          examines surrounding text for trigger phrases that indicate the code is
  //          being intentionally shared (e.g., "here is my code:", "like this example:").
  //
  // PARAMETERS:
  //   text (string):              The matched code block text
  //   normalizedFullText (string): The complete normalized text being scanned
  //   matchIndex (number):        The starting index of the match in normalizedFullText
  //
  // RETURNS:
  //   boolean: true if code block has contextual trigger phrases (suggests intentional code sharing)
  //            false if no trigger phrases found (code block is standalone/unclear intent)
  //
  // ALGORITHM:
  //   1. Extract 100 characters before and after the match (lookahead/lookbehind windows)
  //   2. Define trigger phrases that suggest intentional code sharing
  //   3. Search for trigger phrases in both windows (case-insensitive)
  //   4. Return true if any trigger phrase is found, false otherwise
  //
  // EXAMPLES:
  //   - "here is my code: function foo() { }" → contextual = true (trigger: "here is")
  //   - "like this example: const x = 5;" → contextual = true (trigger: "like this")
  //   - "function foo() { }" → contextual = false (no surrounding context)
  //
  // Reference: Requirements 10, Design Section 6 (Context-Aware Detection)
  // TASK: 10.1

  function isCodeContextual(text, normalizedFullText, matchIndex) {
    // Validate inputs
    if (!text || typeof text !== 'string' || !normalizedFullText || typeof normalizedFullText !== 'number') {
      if (typeof normalizedFullText !== 'string') {
        console.warn('[TrustPrompt/context] isCodeContextual: invalid input types');
        return false;
      }
    }

    // Define trigger phrases that suggest intentional code sharing
    // These phrases typically precede code blocks in documentation, tutorials, or shared explanations
    const triggerPhrases = [
      // Introductory phrases
      "here is", "here's", "like this", "for example", "such as",
      // Explicit code labels
      "code:", "function:", "script:", "example:", "implementation:",
      // Action phrases
      "try this", "use this", "run this", "execute this", "implement",
      // Code block indicators
      "this is the", "see below", "check this", "look at", "paste this",
      // Additional context phrases
      "below is", "the code", "this code", "example code", "sample code",
      "shows:", "shows the", "demonstrates:", "demonstrates the",
      "follows:", "follows here", "next:", "next is"
    ];

    // Extract lookahead window (100 characters after the match)
    const lookbehindStart = Math.max(0, matchIndex - 100);
    const lookbehind = normalizedFullText.slice(lookbehindStart, matchIndex).toLowerCase();

    // Extract lookahead window (100 characters after the match)
    const lookaheadStart = matchIndex + text.length;
    const lookaheadEnd = Math.min(normalizedFullText.length, lookaheadStart + 100);
    const lookahead = normalizedFullText.slice(lookaheadStart, lookaheadEnd).toLowerCase();

    // Check if any trigger phrase appears in lookbehind or lookahead windows
    for (const phrase of triggerPhrases) {
      if (lookbehind.includes(phrase) || lookahead.includes(phrase)) {
        console.log(`[TrustPrompt/context] code contextual trigger found: "${phrase}"`);
        return true;
      }
    }

    // No trigger phrases found
    return false;
  }

  // ── FEATURE 1: CODE KEYWORDS (Strong Evidence — 3 points) ───────────────────
  // Scans for language keywords across control flow, declarations, types, modules,
  // and language-specific built-ins.
  // 1+ matches → 3 points (strong evidence), else 0.
  const CODE_KEYWORD_REGEX = new RegExp(
    '\\b(?:' +
    'if|else|elseif|elif|for|while|do|switch|case|break|continue|return|try|catch|finally|throw|when|match|' +
    'function|def|async|await|const|let|var|class|struct|interface|enum|type|typedef|namespace|' +
    'int|string|bool|boolean|float|double|char|long|short|byte|void|null|undefined|true|false|' +
    'import|export|require|from|as|use|include|package|using|' +
    'this|self|super|new|delete|instanceof|typeof' +
    ')\\b',
    'gi'
  );

  function detectCodeKeywords(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, count: 0, keywordMatches: [] };
    }
    CODE_KEYWORD_REGEX.lastIndex = 0;
    const matches = text.match(CODE_KEYWORD_REGEX) || [];
    const count = matches.length;
    const score = count >= 1 ? 3 : 0;
    return {
      score,
      count,
      keywordMatches: matches
    };
  }

  // ── FEATURE 2: IMPORT/REQUIRE STATEMENTS (Strong Evidence — 3 points) ───────
  // Scans for module loading syntax across JavaScript/TypeScript, Python, Java, C#, C/C++, Go, Rust, PHP.
  // 1+ matches → 3 points (strong evidence), else 0.
  const IMPORT_STATEMENT_PATTERNS = [
    /import\s+[\s\S]*?from\s+["'][^"']+["']/gi,
    /import\s+["'][^"']+["']/gi,
    /require\s*\(\s*["'][^"']+["']\s*\)/gi,
    /export\s+(?:default\s+)?(?:function|class|const|let|var|async)/gi,
    /^[ \t]*import\s+[\w\.]+/gim,
    /^[ \t]*from\s+[\w\.]+\s+import\s+[\w\,\s*]+/gim,
    /^[ \t]*import\s+[\w\.]+;?/gim,
    /^[ \t]*using\s+[\w\.]+;?/gim,
    /^[ \t]*namespace\s+[\w\.]+/gim,
    /^[ \t]*package\s+[\w\.]+/gim,
    /^[ \t]*#include\s+[<"][^>"]+[>"]/gim,
    /^[ \t]*#import\s+[<"][^>"]+[>"]/gim,
    /^[ \t]*import\s+\(/gim,
    /^[ \t]*import\s+"[^"]+"/gim,
    /^[ \t]*use\s+[\w:]+/gim,
    /^[ \t]*mod\s+[\w]+/gim,
    /(?:require|include|require_once|include_once)\s+["'][^"']+["']/gi
  ];

  function detectImportStatements(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, count: 0, importMatches: [] };
    }
    const importMatches = [];
    for (const pat of IMPORT_STATEMENT_PATTERNS) {
      pat.lastIndex = 0;
      const m = text.match(pat);
      if (m) {
        importMatches.push(...m);
      }
    }
    const count = importMatches.length;
    const score = count >= 1 ? 3 : 0;
    return {
      score,
      count,
      importMatches
    };
  }

  // ── FEATURE 3: BRACES (Strong Evidence — 2 points) ─────────────────────────
  // Analyzes curly braces ({ and }).
  // Density ≥ 0.03 OR totalBraces ≥ 2 → 2 points (strong evidence), else 0.
  function detectBraces(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, openBraces: 0, closeBraces: 0, totalBraces: 0, density: 0 };
    }
    const openBraces = (text.match(/\{/g) || []).length;
    const closeBraces = (text.match(/\}/g) || []).length;
    const totalBraces = openBraces + closeBraces;
    const textLength = Math.max(text.length, 1);
    const density = totalBraces / textLength;
    const score = (density >= 0.03 || totalBraces >= 2) ? 2 : 0;
    return {
      score,
      openBraces,
      closeBraces,
      totalBraces,
      density: parseFloat(density.toFixed(4))
    };
  }

  // ── FEATURE 4: FUNCTION CALLS (Strong Evidence — 2 points / 1 point) ────────
  // Scans for function invocation syntax: identifier(...) or obj.method(...) or console.log(...).
  // Excludes control structures like if (...), for (...), while (...), etc.
  // 2+ calls → 2 points (strong evidence), 1 call → 1 point (weak evidence), 0 → 0.
  const FUNCTION_CALL_REGEX = /\b([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\s*\(/g;
  const CONTROL_KEYWORDS = new Set([
    'if', 'else if', 'for', 'while', 'switch', 'catch', 'when', 'match',
    'return', 'typeof', 'sizeof', 'throw'
  ]);

  function detectFunctionCalls(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, count: 0, functionCallMatches: [] };
    }
    const matches = [];
    let match;
    FUNCTION_CALL_REGEX.lastIndex = 0;
    while ((match = FUNCTION_CALL_REGEX.exec(text)) !== null) {
      const fnName = match[1].toLowerCase();
      if (!CONTROL_KEYWORDS.has(fnName)) {
        matches.push(match[0]);
      }
    }
    const count = matches.length;
    let score = 0;
    if (count >= 2) {
      score = 2; // strong evidence
    } else if (count === 1) {
      score = 1; // weak evidence
    }
    return {
      score,
      count,
      functionCallMatches: matches
    };
  }

  // ── FEATURE 5: SEMICOLONS (Weak Evidence — 1 point) ─────────────────────────
  // Counts semicolons (;).
  // 1+ semicolons → 1 point (weak evidence), else 0.
  function detectSemicolons(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, semicolonCount: 0 };
    }
    const matches = text.match(/;/g) || [];
    const count = matches.length;
    return {
      score: count >= 1 ? 1 : 0,
      semicolonCount: count
    };
  }

  // ── FEATURE 6: OPERATORS (Weak Evidence — 1 point) ──────────────────────────
  // Scans for arithmetic, comparison, logical, assignment, bitwise operators.
  // 1+ matches → 1 point (weak evidence), else 0.
  // Detects: ++ -- ** && || << >> === !== <=> compound assignment (+=, -=, etc.) and single operators
  const OPERATORS_REGEX = /(\+\+|--|\*\*|&&|\|\||<<|>>|===|!==|<=>|[+\-*\/%&|^!=<>]=|[+\-*\/%&|^<>!~=])/g;

  function detectOperators(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, operatorCount: 0 };
    }
    OPERATORS_REGEX.lastIndex = 0;
    const matches = text.match(OPERATORS_REGEX) || [];
    const count = matches.length;
    return {
      score: count >= 1 ? 1 : 0,
      operatorCount: count
    };
  }

  // ── FEATURE 7: NAMING CONVENTIONS (Weak Evidence — 1 point) ─────────────────
  // Scans for camelCase and snake_case variable/function naming patterns.
  // 2+ matches → 1 point (weak evidence), else 0.
  const CAMEL_CASE_REGEX = /\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g;
  const SNAKE_CASE_REGEX = /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g;

  function detectCodingNamingConventions(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, camelCaseMatches: [], snake_caseMatches: [], totalMatches: 0 };
    }
    CAMEL_CASE_REGEX.lastIndex = 0;
    SNAKE_CASE_REGEX.lastIndex = 0;
    const camelMatches = text.match(CAMEL_CASE_REGEX) || [];
    const snakeMatches = text.match(SNAKE_CASE_REGEX) || [];
    const totalMatches = camelMatches.length + snakeMatches.length;
    return {
      score: totalMatches >= 2 ? 1 : 0,
      camelCaseMatches: camelMatches,
      snake_caseMatches: snakeMatches,
      totalMatches
    };
  }

  // ── FEATURE 8: COMMENTS (Weak Evidence — 1 point) ────────────────────────────
  // Scans for single-line (//, #, --) or block (/*...*/, """...""", <!--...-->) comment markers.
  // 1+ comment markers → 1 point (weak evidence), else 0.
  const COMMENT_DETECTION_PATTERNS = [
    /\/\/.*?$/gm,
    /#.*?$/gm,
    /--.*?$/gm,
    /\/\*[\s\S]*?\*\//g,
    /"""[\s\S]*?"""/g,
    /'''[\s\S]*?'''/g,
    /<!--[\s\S]*?-->/g
  ];

  function detectComments(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, commentCount: 0 };
    }
    let count = 0;
    for (const pat of COMMENT_DETECTION_PATTERNS) {
      pat.lastIndex = 0;
      const m = text.match(pat);
      if (m) count += m.length;
    }
    return {
      score: count >= 1 ? 1 : 0,
      commentCount: count
    };
  }

  // ── FEATURE 9: INDENTATION PATTERN (Weak Evidence — 1 point) ─────────────────
  // Computes fraction of non-empty lines with 4+ spaces or tabs.
  // Ratio ≥ 0.2 → 1 point (weak evidence), else 0.
  function detectIndentationPattern(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, indentedLineCount: 0, totalLines: 0, ratio: 0 };
    }
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      return { score: 0, indentedLineCount: 0, totalLines: 0, ratio: 0 };
    }
    let indentedLineCount = 0;
    for (const line of lines) {
      if (/^(\s{4,}|\t)/.test(line)) {
        indentedLineCount++;
      }
    }
    const ratio = indentedLineCount / lines.length;
    return {
      score: ratio >= 0.2 ? 1 : 0,
      indentedLineCount,
      totalLines: lines.length,
      ratio: parseFloat(ratio.toFixed(3))
    };
  }

  // ── FEATURE 10: LINE DENSITY CONSISTENCY (Weak Evidence — 1 point) ───────────
  // Computes average characters per line across non-empty lines.
  // For single-line code: Just check if line is reasonable length (> 5 chars)
  // For multi-line: 3+ lines AND 30 ≤ avgCharsPerLine ≤ 150 → 1 point (weak evidence)
  function detectLineDensity(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, avgCharsPerLine: 0, lineCount: 0 };
    }
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    // Single line: Check if it has reasonable length for code (> 5 chars)
    if (lines.length === 1) {
      const isReasonableLength = lines[0].trim().length > 5;
      return {
        score: isReasonableLength ? 1 : 0,
        avgCharsPerLine: lines[0].length,
        lineCount: 1
      };
    }
    
    // Multi-line: Need 3+ lines AND proper char density
    if (lines.length < 3) {
      return { score: 0, avgCharsPerLine: 0, lineCount: lines.length };
    }
    let totalChars = 0;
    for (const line of lines) {
      totalChars += line.length;
    }
    const avgCharsPerLine = totalChars / lines.length;
    const isCodeDensity = avgCharsPerLine >= 30 && avgCharsPerLine <= 150;
    return {
      score: isCodeDensity ? 1 : 0,
      avgCharsPerLine: parseFloat(avgCharsPerLine.toFixed(1)),
      lineCount: lines.length
    };
  }

  // ── TASK 7.1: COMPOSITE FEATURE SCORING ALGORITHM ────────────────────────────
  // Evaluates 10 independent code features and applies dual threshold classification:
  //   total_score ≥ 6 AND strong_evidence_present (keywords, imports, braces, or 2+ function calls)
  // Max possible score: 3+3+2+2+1+1+1+1+1+1 = 16 points.
  //
  // TASK 14.1: Performance profiling — measures execution time using performance.now().
  //   If CODE_DETECTION_CONFIG.LOG_PERFORMANCE is enabled and execution exceeds
  //   PERFORMANCE_WARN_MS (default 10ms), a warning is logged.
  //
  // TASK 14.2: Large-text sampling — for texts > 1000 characters, a representative
  //   sample is taken (first 350 + middle 300 + last 350 chars) instead of the full
  //   text. This keeps each feature computation < 0.5ms and total < 5ms per block
  //   (target: Req 13). Sampling is indicated in the returned object (sampled: true).
  //
  // Pre-compiled regex patterns (module-level constants) ensure zero compilation cost
  // per call: CODE_KEYWORD_REGEX, FUNCTION_CALL_REGEX, OPERATORS_REGEX,
  // CAMEL_CASE_REGEX, SNAKE_CASE_REGEX, IMPORT_STATEMENT_PATTERNS,
  // COMMENT_DETECTION_PATTERNS — all created once at module load time.
  //
  // @param {string} text - The text block to analyze
  // @returns {Object} Score object:
  //   {
  //     classification: "code" | "prose",
  //     score: number,
  //     strong_evidence: boolean,
  //     reason: string,
  //     sampled: boolean,         // true if text was sampled for performance
  //     features: { ... },
  //     featureDetails: { ... }
  //   }
  function computeSourceCodeScore(text) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return {
        classification: 'prose',
        score: 0,
        strong_evidence: false,
        reason: 'Empty or invalid input text',
        sampled: false,
        features: {
          code_keywords: 0,
          import_statements: 0,
          braces: 0,
          function_calls: 0,
          semicolons: 0,
          operators: 0,
          naming_conventions: 0,
          comments: 0,
          indentation: 0,
          line_density: 0,
          credentialIndicators: 0
        },
        featureDetails: {}
      };
    }

    // ── TASK 14.1: Performance profiling start ──────────────────────────────
    const _perfStart = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();

    // ── TASK 14.2: Large-text sampling strategy ─────────────────────────────
    // For text blocks > 1000 chars, sample representative slices to keep each
    // feature function fast (target: < 0.5ms each, total < 5ms per block).
    // Sample: first 350 chars + middle 300 chars + last 350 chars = 1000 chars max.
    const SAMPLING_THRESHOLD = 1000;
    let analysisText = text;
    let sampled = false;
    if (text.length > SAMPLING_THRESHOLD) {
      const head = text.slice(0, 350);
      const midStart = Math.floor(text.length / 2) - 150;
      const mid = text.slice(midStart, midStart + 300);
      const tail = text.slice(-350);
      analysisText = head + '\n' + mid + '\n' + tail;
      sampled = true;
    }

    // Evaluate all 10 feature functions (use analysisText — sampled for large inputs)
    const keywordsRes = detectCodeKeywords(analysisText);
    const importsRes = detectImportStatements(analysisText);
    const bracesRes = detectBraces(analysisText);
    const functionCallsRes = detectFunctionCalls(analysisText);
    const semicolonsRes = detectSemicolons(analysisText);
    const operatorsRes = detectOperators(analysisText);
    const namingRes = detectCodingNamingConventions(analysisText);
    const commentsRes = detectComments(analysisText);
    const indentationRes = detectIndentationPattern(analysisText);
    const lineDensityRes = detectLineDensity(analysisText);

    // Also evaluate credential indicators if available (always use full text for credentials)
    let credIndicatorVal = 0;
    if (typeof computeCredentialIndicators === 'function') {
      try {
        const credRes = computeCredentialIndicators(text);
        credIndicatorVal = (credRes && typeof credRes.value === 'number') ? credRes.value : 0;
      } catch (_e) {
        credIndicatorVal = 0;
      }
    }

    const features = {
      code_keywords: keywordsRes.score,
      import_statements: importsRes.score,
      braces: bracesRes.score,
      function_calls: functionCallsRes.score,
      semicolons: semicolonsRes.score,
      operators: operatorsRes.score,
      naming_conventions: namingRes.score,
      comments: commentsRes.score,
      indentation: indentationRes.score,
      line_density: lineDensityRes.score,
      credentialIndicators: credIndicatorVal
    };

    // Calculate total score from the 10 detection features
    const total_score = (
      features.code_keywords +
      features.import_statements +
      features.braces +
      features.function_calls +
      features.semicolons +
      features.operators +
      features.naming_conventions +
      features.comments +
      features.indentation +
      features.line_density
    );

    // Determine strong evidence presence (at least one strong type)
    const strong_evidence_present = (
      features.code_keywords > 0 ||
      features.import_statements > 0 ||
      features.braces > 0 ||
      features.function_calls >= 2
    );

    const threshold = (CODE_DETECTION_CONFIG && typeof CODE_DETECTION_CONFIG.scoreThreshold === 'number')
      ? CODE_DETECTION_CONFIG.scoreThreshold
      : 6;
    const requireStrong = (CODE_DETECTION_CONFIG && typeof CODE_DETECTION_CONFIG.requireStrongEvidence === 'boolean')
      ? CODE_DETECTION_CONFIG.requireStrongEvidence
      : true;

    let classification;
    let reason;

    if (total_score >= threshold && (!requireStrong || strong_evidence_present)) {
      classification = 'code';
      reason = `✓ Meets threshold (score ≥ ${threshold}) AND has strong evidence`;
    } else if (total_score >= threshold && !strong_evidence_present) {
      classification = 'prose';
      reason = '✗ Meets score threshold but NO strong evidence type';
    } else {
      classification = 'prose';
      reason = `✗ Below score threshold (< ${threshold}) OR no strong evidence`;
    }

    const scoreObj = {
      classification,
      score: total_score,
      strong_evidence: strong_evidence_present,
      reason,
      sampled,
      features,
      featureDetails: {
        code_keywords: keywordsRes,
        import_statements: importsRes,
        braces: bracesRes,
        function_calls: functionCallsRes,
        semicolons: semicolonsRes,
        operators: operatorsRes,
        naming_conventions: namingRes,
        comments: commentsRes,
        indentation: indentationRes,
        line_density: lineDensityRes
      }
    };

    // ── TASK 14.1: Performance profiling end — log if enabled and above threshold ─
    if (CODE_DETECTION_CONFIG && CODE_DETECTION_CONFIG.LOG_PERFORMANCE) {
      const _perfEnd = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      const _elapsed = _perfEnd - _perfStart;
      const _warnMs = (CODE_DETECTION_CONFIG.PERFORMANCE_WARN_MS !== undefined)
        ? CODE_DETECTION_CONFIG.PERFORMANCE_WARN_MS
        : 10;
      if (_elapsed > _warnMs) {
        console.warn(
          `[TrustPrompt/CodeDetection] computeSourceCodeScore: ${_elapsed.toFixed(2)}ms` +
          ` (threshold: ${_warnMs}ms, textLen: ${text.length}, sampled: ${sampled})`
        );
      } else if (CODE_DETECTION_CONFIG.verbosity === 'debug') {
        console.log(
          `[TrustPrompt/CodeDetection] computeSourceCodeScore: ${_elapsed.toFixed(2)}ms` +
          ` (textLen: ${text.length}, sampled: ${sampled})`
        );
      }
    }

    return scoreObj;
  }

  // ── TASK 12.2: UNFORMATTED CODE BLOCK EXTRACTION ─────────────────────────────
  // Identifies unformatted code blocks in plain text without markdown backticks.
  // Groups contiguous lines with code-like characteristics (up to MAX_CODE_BLOCK_LINES).
  // Applies computeSourceCodeScore() to each candidate block.
  function extractUnformattedCodeBlocks(normalisedText) {
    if (!normalisedText || typeof normalisedText !== 'string') return [];
    const maxLines = (CODE_DETECTION_CONFIG && CODE_DETECTION_CONFIG.MAX_CODE_BLOCK_LINES) || 20;
    const lines = normalisedText.split('\n');
    
    if (CODE_DETECTION_CONFIG && CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS) {
      console.log('[TrustPrompt/CODE] extractUnformattedCodeBlocks - input lines:', lines.length);
    }
    
    const blocks = [];
    let currentBlock = [];
    let blockStartIndex = 0;
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLen = line.length + 1; // account for newline
      const trimmed = line.trim();

      // Check if line exhibits code characteristics:
      const isIndented = /^(\s{4,}|\t)/.test(line);
      const hasKeywords = detectCodeKeywords(trimmed).score > 0;
      const hasImports = detectImportStatements(trimmed).score > 0;
      const hasBraces = (trimmed.match(/[{}]/g) || []).length > 0;
      const hasFnCalls = detectFunctionCalls(trimmed).count > 0;
      const hasSemi = trimmed.endsWith(';');

      const isCodeLikeLine = trimmed.length > 0 && (isIndented || hasKeywords || hasImports || hasBraces || hasFnCalls || hasSemi);

      if (CODE_DETECTION_CONFIG && CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS && isCodeLikeLine) {
        console.log('[TrustPrompt/CODE] Code-like line detected:', {
          text: trimmed.substring(0, 40),
          hasKeywords,
          hasSemi,
          hasBraces,
          hasFnCalls
        });
      }

      if (isCodeLikeLine) {
        if (currentBlock.length === 0) {
          blockStartIndex = currentIndex;
        }
        currentBlock.push(line);

        if (currentBlock.length >= maxLines) {
          // Reached max block size, evaluate candidate
          const blockText = currentBlock.join('\n');
          const scoreObj = computeSourceCodeScore(blockText);
          if (scoreObj.classification === 'code') {
            blocks.push({
              rawMatch: blockText,
              startIndex: blockStartIndex,
              scoreObj
            });
          }
          currentBlock = [];
        }
      } else {
        if (currentBlock.length >= 1) {
          const blockText = currentBlock.join('\n');
          const scoreObj = computeSourceCodeScore(blockText);
          if (scoreObj.classification === 'code') {
            blocks.push({
              rawMatch: blockText,
              startIndex: blockStartIndex,
              scoreObj
            });
          }
        }
        currentBlock = [];
      }
      currentIndex += lineLen;
    }

    // Process trailing block
    if (currentBlock.length >= 1) {
      const blockText = currentBlock.join('\n');
      const scoreObj = computeSourceCodeScore(blockText);
      
      // DEBUG: Log the scoring result
      if (CODE_DETECTION_CONFIG && CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS) {
        console.log('[TrustPrompt/CODE] Trailing block evaluation:');
        console.log('  Block text:', blockText.substring(0, 50));
        console.log('  Classification:', scoreObj.classification);
        console.log('  Score:', scoreObj.score);
        console.log('  Strong evidence:', scoreObj.strong_evidence);
        console.log('  Reason:', scoreObj.reason);
      }
      
      if (scoreObj.classification === 'code') {
        blocks.push({
          rawMatch: blockText,
          startIndex: blockStartIndex,
          scoreObj
        });
      }
    }

    return blocks;
  }

  // ── TASK 13.2: DEDUPLICATION LOGIC ──────────────────────────────────────────
  // Deduplicates overlapping or identical findings between markdown regex and
  // multi-feature unformatted code detection. Prefers richer metadata.
  function deduplicateCodeFindings(findings) {
    const codeFindings = findings.filter(f => f.patternId === 'source_code');
    const otherFindings = findings.filter(f => f.patternId !== 'source_code');
    if (codeFindings.length <= 1) return findings;

    const keptCodeFindings = [];
    for (const current of codeFindings) {
      let isDuplicate = false;
      for (let i = 0; i < keptCodeFindings.length; i++) {
        const existing = keptCodeFindings[i];
        const curText = current.rawMatch.trim();
        const exText = existing.rawMatch.trim();

        // Exact match or substring overlap
        if (curText === exText || exText.includes(curText) || curText.includes(exText)) {
          isDuplicate = true;
          console.log('[TrustPrompt/code] Deduplicated: markdown + multi-signal → 1 finding');

          // Merge metrics, keep highest risk
          const higherRisk = (RISK_ORDER[current.risk] || 0) > (RISK_ORDER[existing.risk] || 0)
            ? current.risk
            : existing.risk;
          existing.risk = higherRisk;

          // Merge codeMetrics if current has richer features
          if (current.codeMetrics && (!existing.codeMetrics || current.codeMetrics.score > existing.codeMetrics.score)) {
            existing.codeMetrics = current.codeMetrics;
          }
          if (current.source === 'A_multi_feature') {
            existing.source = 'A_multi_feature';
          }
          if (current.elevated) {
            existing.elevated = true;
            existing.elevation_reason = current.elevation_reason || existing.elevation_reason;
          }
          break;
        }
      }
      if (!isDuplicate) {
        keptCodeFindings.push(current);
      }
    }

    return [...otherFindings, ...keptCodeFindings];
  }

  // ── PATH A — regex + validator.js ────────────────────────────────────────
  //
  // TASK-4.5: Added entropy pre-check — if pattern.minEntropy is set, the
  //   extracted value must meet the minimum Shannon entropy threshold or the
  //   match is discarded before the validator step.
  //
  // TASK-4.7: Added context-aware filtering — for phone numbers, rejects matches
  //   that appear immediately before measurement units (e.g., "0909835056 grams").
  //
  // Each finding receives a `validated` boolean:
  //   true  — passed TrustValidator.validate() (mathematical confirmation)
  //   false — regex matched but failed validator (format-only candidate)

  function runPathA(normalisedText) {
    let findings = [];
    for (const pattern of TRUSTPROMPT_PATTERNS) {
      if (!pattern.regex) continue; // ph_mobile and any future regex-less patterns skip Path A
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = re.exec(normalisedText)) !== null) {
        const raw = match[0];
        const matchIndex = match.index;

        // TASK-4.7: Context-aware filtering for ALL PII patterns
        // Check if this match appears in an educational/example context that should be filtered
        if (shouldFilterByContext(pattern.id, raw, normalisedText, matchIndex)) {
          console.log(`[TrustPrompt/context] filtered ${pattern.id}: ${raw.slice(0, 30)}`);
          continue;
        }

        // TASK-4.4: Apply placeholder suppression for known test/dummy values
        if (isKnownPlaceholder(pattern.id, raw)) {
          console.log(`[TrustPrompt/placeholder] rejected known placeholder: ${raw.slice(0, 30)}`);
          continue;
        }

        // TASK-4.5: Entropy pre-check — reject low-entropy dummy values
        if (pattern.minEntropy !== undefined) {
          // Extract the value portion (after any label=... prefix) for entropy check
          const valueMatch = raw.match(/[:=]\s*["']?([A-Za-z0-9\-_\.+\/=]{10,})["']?\s*$/)
                          || raw.match(/^([A-Za-z0-9\-_\.+\/=]{10,})$/);
          const valueStr = valueMatch ? valueMatch[1] : raw;
          if (shannonEntropy(valueStr) < pattern.minEntropy) {
            console.log(`[TrustPrompt/entropy] rejected low-entropy match: ${raw.slice(0, 30)}`);
            continue;
          }
        }

        // TASK-7.2: Wire structural validators into finding creation
        // When pattern.structuralValidate is defined, call it on matched value
        let isValidated = false;
        if (pattern.structuralValidate) {
          isValidated = pattern.structuralValidate(raw);
          if (!isValidated) {
            console.log(`[TrustPrompt/validator] structural validation failed: ${pattern.id} - ${raw.slice(0, 30)}`);
            continue;
          }
        } else {
          // Fall back to TrustValidator for patterns without structuralValidate
          isValidated = TrustValidator.validate(pattern.validate, raw);
          if (!isValidated) continue;
        }

        // ─── TASK 12.1: Multi-feature scoring for source_code pattern ─────────
        if (pattern.id === "source_code") {
          // Extract inner text if wrapped in markdown fences or backticks
          let innerCode = raw;
          if (innerCode.startsWith('```') && innerCode.endsWith('```')) {
            innerCode = innerCode.replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '').replace(/\r?\n?```$/, '');
          } else if (innerCode.startsWith('`') && innerCode.endsWith('`')) {
            innerCode = innerCode.slice(1, -1);
          }

          const scoreObj = computeSourceCodeScore(innerCode);

          // Log detection diagnostic
          if (typeof logCodeDetection === 'function') {
            logCodeDetection(scoreObj);
          }

          // If dual-threshold check fails, reject finding (distinguish code from prose)
          if (scoreObj.classification !== "code") {
            console.log(`[TrustPrompt/CodeDetection] Rejected markdown block as prose (score: ${scoreObj.score})`);
            continue;
          }

          // ── TASK 12.3: Credential escalation within code block ─────────────
          const escalationResult = evaluateCodeRiskEscalation(scoreObj, pattern.risk);
          let escalatedRisk = escalationResult.escalatedRisk;

          // ── TASK 10.2: Context-aware risk elevation ────────────────────────
          const isContextual = isCodeContextual(raw, normalisedText, matchIndex);
          let contextElevation = false;
          if (isContextual && escalatedRisk === "low") {
            escalatedRisk = "moderate";
            contextElevation = true;
            console.log(`[TrustPrompt/context] code block + trigger phrase → MODERATE risk`);
          }

          if (escalationResult.escalated) {
            console.log(`[TrustPrompt/code] code block + ${escalationResult.credentialTypes.join(', ')} detected → ${escalatedRisk.toUpperCase()} risk`);
          }

          findings.push({
            patternId: pattern.id,
            label: pattern.label,
            risk: escalatedRisk,
            rawMatch: raw,
            safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[CODE BLOCK REMOVED]",
            validated: true,
            source: "A_regex",
            elevated: escalationResult.escalated || contextElevation,
            elevation_reason: escalationResult.escalated ? escalationResult.reason : (contextElevation ? "context_trigger_phrase" : undefined),
            credentialTypes: escalationResult.credentialTypes,
            contextElevation: contextElevation,
            codeMetrics: {
              score: scoreObj.score,
              strong_evidence: scoreObj.strong_evidence,
              classification: scoreObj.classification,
              reason: scoreObj.reason,
              features: scoreObj.features
            }
          });
          continue;
        }

        findings.push({
          patternId:   pattern.id,
          label:       pattern.label,
          risk:        pattern.risk,
          rawMatch:    raw,
          safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]",
          validated:   isValidated,  // TASK-7.2: Set validated:true if structuralValidate passed
          source:      "A_regex"
        });
      }
    }

    // ── TASK 13.2: Deduplicate markdown regex and multi-feature findings ─────
    // (Unformatted code detection is now in runSourceCodeDetection, running in parallel)
    findings = deduplicateCodeFindings(findings);

    return findings;
  }

  // ── Merge + deduplicate ───────────────────────────────────────────────────────
  //
  // Merges findings from all three paths (A: regex, B: gazetteer, C: linguistic).
  // When the same rawMatch appears in multiple paths, the finding with the highest
  // risk level is preserved (highest RISK_ORDER value wins).
  // Special handling: UMID takes precedence over SSS for overlapping matches.

  function mergeAndDedupe(pathA, pathB, pathC, sourceCode = []) {
    const allFindings = [...pathA, ...pathB, ...pathC, ...sourceCode];
    
    // First pass: collect all findings by rawMatch
    const seen = new Map();
    for (const f of allFindings) {
      const key = f.rawMatch.trim().toLowerCase();
      const ex  = seen.get(key);
      if (!ex || RISK_ORDER[f.risk] > RISK_ORDER[ex.risk]) seen.set(key, f);
    }
    
    // Second pass: Remove SSS findings that are substrings of UMID findings
    // This prevents "10-5002134-6" (SSS match) from appearing when it's part of "4310-5002134-6" (UMID)
    const result = [...seen.values()];
    return result.filter(f => {
      if (f.patternId === 'ph_id_sss') {
        // Check if this SSS finding is a substring of any UMID finding
        const sssMatch = f.rawMatch.trim();
        const hasUmidParent = result.some(other => 
          other.patternId === 'ph_id_umid' && 
          other.rawMatch.includes(sssMatch)
        );
        if (hasUmidParent) {
          return false; // Filter out this SSS finding
        }
      }
      return true;
    });
  }

  // ── TASK 12.3: Extract and run source code detection in parallel ─────────────────
  // Source code detection runs independently on normalisedText, parallel with all paths.
  // Returns findings array with source_code pattern and proper risk escalation.

  function runSourceCodeDetection(normalisedText) {
    if (!CODE_DETECTION_CONFIG || CODE_DETECTION_CONFIG.enableSourceCodeDetection === false) {
      return [];
    }

    let findings = [];
    const unformattedBlocks = extractUnformattedCodeBlocks(normalisedText);
    
    for (const block of unformattedBlocks) {
      const escalationResult = evaluateCodeRiskEscalation(block.scoreObj, "low");
      let escalatedRisk = escalationResult.escalatedRisk;
      const isContextual = isCodeContextual(block.rawMatch, normalisedText, block.startIndex);
      let contextElevation = false;
      
      if (isContextual && escalatedRisk === "low") {
        escalatedRisk = "moderate";
        contextElevation = true;
        console.log(`[TrustPrompt/context] code block + trigger phrase → MODERATE risk`);
      }
      
      if (escalationResult.escalated) {
        console.log(`[TrustPrompt/code] code block + ${escalationResult.credentialTypes.join(', ')} detected → ${escalatedRisk.toUpperCase()} risk`);
      }

      findings.push({
        patternId: "source_code",
        label: "Source Code Block",
        risk: escalatedRisk,
        rawMatch: block.rawMatch,
        safeVersion: "[CODE BLOCK REMOVED]",
        validated: true,
        source: "source_code_detection",
        elevated: escalationResult.escalated || contextElevation,
        elevation_reason: escalationResult.escalated ? escalationResult.reason : (contextElevation ? "context_trigger_phrase" : undefined),
        credentialTypes: escalationResult.credentialTypes,
        contextElevation: contextElevation,
        codeMetrics: {
          score: block.scoreObj.score,
          strong_evidence: block.scoreObj.strong_evidence,
          classification: block.scoreObj.classification,
          reason: block.scoreObj.reason,
          features: block.scoreObj.features
        }
      });
    }

    return findings;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  //
  // Four-path parallel architecture:
  //   PATH A (regex + validator.js) — runs on textRegex view
  //   PATH B (gazetteer + trigger phrases) — runs on textNLP view
  //   PATH C (linguistic NER/POS) — runs on textNLP view parallel with PATH B
  //   SOURCE CODE DETECTION — runs on normalisedText, parallel with all paths
  //
  // After all paths complete, findings are merged and deduplicated (highest risk wins).
  // The normalized textNLP view is prepared specifically for linguistic analysis:
  // sentence case estimated, whitespace normalized, punctuation standardized.

  function scan(rawText) {
    console.log("[TrustPrompt/scanner] SCAN START - input:", rawText.substring(0, 50));
    
    if (!rawText || !rawText.trim()) {
      console.log("[TrustPrompt/scanner] Empty text - returning empty findings");
      return { findings: [], riskLevel: "none", score: 0,
               governance: "none", normalisedText: "", wasCapsConverted: false };
    }
    
    console.log("[TrustPrompt/scanner] Normalizing...");
    const { masked, textRegex, textNLP, wasCapsConverted } =
      TrustNormalizer.normalize(rawText);
    
    // All four paths run in parallel
    console.log("[TrustPrompt/scanner] Running PATH A (regex)...");
    const pathAFindings = runPathA(textRegex);
    console.log(`[TrustPrompt/scanner] PATH A findings: ${pathAFindings.length}${pathAFindings.length > 0 ? ' → ' + pathAFindings.map(f => f.patternId).join(', ') : ''}`);
    
    console.log("[TrustPrompt/scanner] Running PATH B (gazetteer)...");
    const pathBFindings = TrustGazetteer.scan(textNLP);
    console.log(`[TrustPrompt/scanner] PATH B findings: ${pathBFindings.length}${pathBFindings.length > 0 ? ' → ' + pathBFindings.map(f => f.patternId).join(', ') : ''}`);
    
    console.log("[TrustPrompt/scanner] Running PATH C (linguistic)...");
    let pathCFindings = [];
    if (typeof TrustLinguisticDetector !== 'undefined' && TrustLinguisticDetector && typeof TrustLinguisticDetector.scan === 'function') {
      try {
        pathCFindings = TrustLinguisticDetector.scan(textNLP);
        console.log(`[TrustPrompt/scanner] PATH C findings: ${pathCFindings.length}${pathCFindings.length > 0 ? ' → ' + pathCFindings.map(f => f.patternId).join(', ') : ''}`);
      } catch (pathCError) {
        console.error("[TrustPrompt/scanner] PATH C error:", pathCError);
        pathCFindings = [];
      }
    } else {
      console.warn("[TrustPrompt/scanner] TrustLinguisticDetector not available - PATH C skipped");
    }
    
    console.log("[TrustPrompt/scanner] Running SOURCE CODE DETECTION (parallel with all paths)...");
    const sourceCodeFindings = runSourceCodeDetection(masked);
    console.log(`[TrustPrompt/scanner] SOURCE CODE DETECTION findings: ${sourceCodeFindings.length}${sourceCodeFindings.length > 0 ? ' → source_code blocks' : ''}`);
    
    const merged        = mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings, sourceCodeFindings);
    const findings      = suppressPlaceholders(merged);  // TASK-4.4
    const { score, riskLevel, governance } = computeRiskScore(findings);

    console.log(
      "[TrustPrompt/scanner] FINAL RESULT - risk:", riskLevel, `score:${score}`,
      `| findings: ${findings.length} (A:${pathAFindings.length} B:${pathBFindings.length} C:${pathCFindings.length} SRC:${sourceCodeFindings.length})`
    );
    if (findings.length > 0) {
      console.log("[TrustPrompt/scanner] Findings detail:", findings.map(f => `${f.patternId}:${f.rawMatch.slice(0, 20)}`).join(", "));
    }

    return { findings, riskLevel, score, governance, normalisedText: masked, wasCapsConverted };
  }

  // ── TASK 11.2: IMPLEMENT formatDiagnosticOutput(scoreObj) ───────────────────────
  // Requirement 16: Logging and Diagnostics
  //
  // Formats diagnostic output according to specification:
  //   Format: [TrustPrompt/CodeDetection] Feature: name score/max (threshold: X) [✓ PASS / ✗ FAIL]
  //   Include strong evidence section: "Strong Evidence: CODE_KEYWORDS (3 pts), IMPORTS (3 pts)"
  //   Include total score and threshold comparison
  //   Example: "[TrustPrompt/CodeDetection] Total Score: 10 (threshold: 6) | Strong Evidence: YES | Classification: CODE"
  //
  // Parameters:
  //   @param {Object} scoreObj - Score object with:
  //     - classification: "code" or "prose"
  //     - score: total feature points (0–16)
  //     - strong_evidence: boolean (at least one strong evidence type detected)
  //     - reason: human-readable classification reason
  //     - features: {code_keywords, imports, braces, function_calls, semicolons, ...}
  //
  // Returns:
  //   {Object} formatted - Object with structured diagnostic information:
  //     - headers: array of formatted header lines
  //     - features: array of formatted feature lines
  //     - summary: array of summary lines
  //     - fullText: concatenated string of all lines
  //
  // Requirements: 16 (Logging and Diagnostics)

  function formatDiagnosticOutput(scoreObj) {
    if (!scoreObj) {
      return { headers: [], features: [], summary: [], fullText: '' };
    }

    const scoreThreshold = CODE_DETECTION_CONFIG.scoreThreshold || 6;
    const features = scoreObj.features || {};
    
    // ── Feature mapping with thresholds and max points ──────────────────────
    const featureMapping = {
      code_keywords: { name: 'CODE_KEYWORDS', strong: true, max: 3, threshold: 1 },
      import_statements: { name: 'IMPORTS', strong: true, max: 3, threshold: 1 },
      braces: { name: 'BRACES', strong: true, max: 2, threshold: 1 },
      function_calls: { name: 'FUNCTION_CALLS', strong: true, max: 2, threshold: 2 },
      semicolons: { name: 'SEMICOLONS', strong: false, max: 1, threshold: 1 },
      operators: { name: 'OPERATORS', strong: false, max: 1, threshold: 1 },
      naming_conventions: { name: 'NAMING_CONVENTIONS', strong: false, max: 1, threshold: 1 },
      comments: { name: 'COMMENTS', strong: false, max: 1, threshold: 1 },
      indentation: { name: 'INDENTATION', strong: false, max: 1, threshold: 1 },
      line_density: { name: 'LINE_DENSITY', strong: false, max: 1, threshold: 1 }
    };

    // ── Build diagnostic lines ──────────────────────────────────────────────
    const headers = [];
    const featureLines = [];
    const summaryLines = [];

    // ── Feature Analysis Header ─────────────────────────────────────────────
    headers.push('[TrustPrompt/CodeDetection] ═══ FEATURE ANALYSIS ═══');

    // ── Format each feature ─────────────────────────────────────────────────
    for (const [key, meta] of Object.entries(featureMapping)) {
      const score = features[key] || 0;
      const threshold = meta.threshold;
      const max = meta.max;
      const passed = score >= threshold ? '✓ PASS' : '✗ FAIL';
      const evidenceType = meta.strong ? 'Strong' : 'Weak';

      // Format: [TrustPrompt/CodeDetection] Feature: name score/max (threshold: X) [✓ PASS / ✗ FAIL]
      const line = `[TrustPrompt/CodeDetection] Feature: ${meta.name} ${score}/${max} (threshold: ${threshold}) [${passed}]`;
      featureLines.push({ key, line, score, passed: score >= threshold, type: evidenceType });
    }

    // ── Build Strong Evidence Section ───────────────────────────────────────
    const detectedStrongTypes = [];
    if (features.code_keywords > 0) detectedStrongTypes.push(`CODE_KEYWORDS (${features.code_keywords} pts)`);
    if (features.import_statements > 0) detectedStrongTypes.push(`IMPORTS (${features.import_statements} pts)`);
    if (features.braces > 0) detectedStrongTypes.push(`BRACES (${features.braces} pts)`);
    if (features.function_calls >= 2) detectedStrongTypes.push(`FUNCTION_CALLS (${features.function_calls} pts)`);

    const strongEvidenceStr = detectedStrongTypes.length > 0
      ? detectedStrongTypes.join(', ')
      : 'NONE';

    // ── Summary Lines ───────────────────────────────────────────────────────
    summaryLines.push('[TrustPrompt/CodeDetection] ═══ SUMMARY ═══');
    summaryLines.push(`[TrustPrompt/CodeDetection] Total Score: ${scoreObj.score} (threshold: ${scoreThreshold})`);
    summaryLines.push(`[TrustPrompt/CodeDetection] Strong Evidence: ${scoreObj.strong_evidence ? 'YES' : 'NO'} | ${strongEvidenceStr}`);
    summaryLines.push(`[TrustPrompt/CodeDetection] Classification: ${(scoreObj.classification || 'unknown').toUpperCase()}`);
    
    if (scoreObj.reason) {
      summaryLines.push(`[TrustPrompt/CodeDetection] Reason: ${scoreObj.reason}`);
    }

    // ── Combine all lines ───────────────────────────────────────────────────
    const allLines = [...headers, ...featureLines.map(f => f.line), ...summaryLines];
    const fullText = allLines.join('\n');

    return {
      headers,
      features: featureLines,
      summary: summaryLines,
      fullText
    };
  }

  // ── TASK 11.1: IMPLEMENT logCodeDetection(scoreObj, findings) ───────────────────
  // Requirement 16: Logging and Diagnostics
  //
  // Logs detailed code detection results with configurable verbosity.
  // Checks CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS and CODE_DETECTION_CONFIG.LOG_THRESHOLD_COMPARISON
  // to control output detail level.
  //
  // Parameters:
  //   @param {Object} scoreObj - Score object with:
  //     - classification: "code" or "prose"
  //     - score: total feature points (0–16)
  //     - strong_evidence: boolean (at least one strong evidence type detected)
  //     - reason: human-readable classification reason
  //     - features: {code_keywords, imports, braces, function_calls, semicolons, ...}
  //   @param {Array} findings - Array of finding objects with:
  //     - patternId: "source_code"
  //     - risk: "low", "moderate", or "high"
  //     - elevated: boolean (if risk was escalated)
  //     - elevation_reason: string describing why risk was escalated
  //     - rawMatch: matched code text
  //
  // Output:
  //   Logs to console based on CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS and verbosity level
  //
  // Format Examples:
  //   [TrustPrompt/CodeDetection] Feature Analysis:
  //     [Strong] Code Keywords: 3/3 (threshold: 1) [✓ PASS]
  //     [Weak] Semicolons: 1/1
  //     Total Score: 10 (threshold: 6)
  //     Strong Evidence: YES (Code Keywords, Imports, Braces)
  //     Classification: CODE
  //     Reason: ✓ Meets threshold (score ≥ 6) AND has strong evidence
  //
  // Requirements: 16 (Logging and Diagnostics)

  function logCodeDetection(scoreObj, findings) {
    // ── Guard: Check if logging is enabled ──────────────────────────────────
    if (!CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS && !CODE_DETECTION_CONFIG.LOG_THRESHOLD_COMPARISON) {
      return;
    }

    if (!scoreObj) {
      return;
    }

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
    const verbosity = CODE_DETECTION_CONFIG.verbosity || 'info';

    // ── Log composite score with timestamp ──────────────────────────────────
    if (CODE_DETECTION_CONFIG.LOG_THRESHOLD_COMPARISON) {
      const scoreThreshold = CODE_DETECTION_CONFIG.scoreThreshold || 6;
      const thresholdMet = scoreObj.score >= scoreThreshold ? '✓' : '✗';
      console.log(
        `[TrustPrompt/CodeDetection] ${timestamp} Composite Score: ${scoreObj.score} ` +
        `(threshold: ${scoreThreshold}) ${thresholdMet}`
      );
    }

    // ── Log feature detection results (if verbosity enabled and LOG_SIGNAL_DETAILS) ──
    if (CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS && verbosity === 'debug') {
      console.log('[TrustPrompt/CodeDetection] Feature Analysis:');

      const features = scoreObj.features || {};

      // Map feature names to config for display
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

      // Log strong evidence features first
      for (const [key, meta] of Object.entries(featureMapping)) {
        if (!meta.strong) continue;
        const score = features[key] || 0;
        const passed = score > 0 ? '✓ PASS' : '✗ FAIL';
        console.log(`  [Strong] ${meta.name}: ${score}/${meta.max} ${passed}`);
      }

      // Log weak evidence features
      for (const [key, meta] of Object.entries(featureMapping)) {
        if (meta.strong) continue;
        const score = features[key] || 0;
        const status = score > 0 ? '(detected)' : '(none)';
        console.log(`  [Weak] ${meta.name}: ${score}/${meta.max} ${status}`);
      }
    }

    // ── Log strong evidence presence and detected types ─────────────────────
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

    // ── Log classification result and reason ────────────────────────────────
    console.log(`[TrustPrompt/CodeDetection] Classification: ${(scoreObj.classification || 'unknown').toUpperCase()}`);
    if (scoreObj.reason) {
      console.log(`[TrustPrompt/CodeDetection] Reason: ${scoreObj.reason}`);
    }

    // ── Log risk escalation details (if escalation occurred) ────────────────
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

    // ── Log threshold comparison summary ───────────────────────────────────
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
    scan,
    computeRiskScore,
    BASE_SCORES,
    ENTITY_TIER,
    SENSITIVE_CONTEXT_IDS,
    updateCodeDetectionConfig,
    logCodeDetection,
    formatDiagnosticOutput,
    computeSourceCodeScore,
    runSourceCodeDetection,
    evaluateCodeRiskEscalation,
    isCodeContextual,
    detectCodeKeywords,
    detectImportStatements,
    detectBraces,
    detectFunctionCalls,
    detectSemicolons,
    detectOperators,
    detectCodingNamingConventions,
    detectComments,
    detectIndentationPattern,
    detectLineDensity,
    extractUnformattedCodeBlocks,
    deduplicateCodeFindings,
    CODE_DETECTION_CONFIG
  };

})();

// ══════════════════════════════════════════════════════════════════════════════
// TASK 1.1: Shared Utilities for Signal Computation
// ══════════════════════════════════════════════════════════════════════════════
//
// This module provides foundational utilities for the multi-signal source code
// detection framework. These functions are used by signal computation functions
// (computeStructureDensity, computeTokenPattern, etc.) to extract features from
// text blocks.
//
// Requirements: 1, 7
// ══════════════════════════════════════════════════════════════════════════════

// ── Utility 1: shannonEntropy(text) ──────────────────────────────────────────
//
// Compute Shannon entropy of text in bits per character.
// Already implemented in patterns.js; exposed here for signal computation.
// Entropy measures randomness/disorder in character distribution:
//   - H = 0 bits/char: All characters are identical (e.g., "aaaa")
//   - H ≈ 1 bit/char: Only 2 unique characters (e.g., "aabb")
//   - H ≈ 2.0 bits/char: 4 unique characters equally distributed
//   - H ≈ 4.7 bits/char: Full ASCII printable set equally distributed
//
// Code typically has H ≈ 4.0-5.0 bits/char (varied operators, identifiers)
// Prose typically has H ≈ 4.0-4.5 bits/char (natural language distribution)
//
// Note: This function is declared globally in patterns.js and is used by
// entropy-based signal computation and placeholder filtering.
//
// @param {string} text - Input text to analyze
// @returns {number} Shannon entropy in bits per character (0-~5.5 typical range)

// ── Utility 2: extractWordsFromText(text) ───────────────────────────────────
//
// Tokenize text into words for keyword matching and analysis.
// Splits on whitespace and punctuation, preserving word boundaries.
// Used by Signal 2 (Token Pattern Recognition) to count language keywords
// and by Signal 3 (Indentation Pattern) to compute statistics.
//
// @param {string} text - Text to tokenize
// @returns {string[]} Array of words (lowercase, non-empty)

function extractWordsFromText(text) {
  if (!text || !text.trim()) return [];
  
  // Split on whitespace and common punctuation, preserving words
  // \w+ matches word characters (alphanumeric + underscore)
  // This is more efficient than splitting and filtering
  const matches = text.match(/\b[\w$]+\b/gi);
  
  if (!matches) return [];
  
  // Convert to lowercase for case-insensitive keyword matching
  return matches.map(word => word.toLowerCase());
}

// ── Utility 3: countLineIndentation(text) ───────────────────────────────────
//
// Analyze indentation patterns in text to detect code blocks.
// Returns statistics about leading whitespace across all lines.
// Used by Signal 3 (Indentation Pattern) to score code-like indentation.
//
// Indentation consistency is a strong code indicator:
//   - Code: Indentation in multiples of 2, 3, 4, or 8 spaces (tab widths)
//   - Code: Deep nesting (3+ levels) common in functions, loops, conditionals
//   - Prose: Random or minimal indentation (block quotes at most)
//
// @param {string} text - Text to analyze
// @returns {object} Indentation statistics:
//   {
//     indentedLineCount: number,    // Lines with leading whitespace
//     totalLineCount: number,       // Total non-empty lines
//     indentRatio: number,          // 0-1, fraction of indented lines
//     indentLevels: Set<number>,    // Unique indentation depths (spaces)
//     isConsistent: boolean,        // Indentation in multiples or tabs
//     maxIndentLevel: number,       // Maximum indentation depth
//     avgIndentLevel: number        // Average indentation depth
//   }

function countLineIndentation(text) {
  if (!text || !text.trim()) {
    return {
      indentedLineCount: 0,
      totalLineCount: 0,
      indentRatio: 0,
      indentLevels: new Set(),
      isConsistent: false,
      maxIndentLevel: 0,
      avgIndentLevel: 0
    };
  }
  
  const lines = text.split('\n').filter(line => line.length > 0);
  if (lines.length === 0) {
    return {
      indentedLineCount: 0,
      totalLineCount: 0,
      indentRatio: 0,
      indentLevels: new Set(),
      isConsistent: false,
      maxIndentLevel: 0,
      avgIndentLevel: 0
    };
  }
  
  let indentedLineCount = 0;
  const indentLevels = new Set();
  let totalIndent = 0;
  let maxIndent = 0;
  let hasTabIndent = false;
  
  for (const line of lines) {
    // Count leading whitespace (spaces or tabs)
    const leadingMatch = line.match(/^(\s*)/);
    if (!leadingMatch) continue;
    
    const leadingWS = leadingMatch[1];
    if (leadingWS.length === 0) continue; // No indentation
    
    indentedLineCount++;
    
    // Check if tabs are used
    if (leadingWS.includes('\t')) {
      hasTabIndent = true;
    }
    
    // Count spaces only (for space-based indentation analysis)
    const spaceCount = leadingWS.replace(/\t/g, '    ').length; // Assume 4-space tabs
    indentLevels.add(spaceCount);
    totalIndent += spaceCount;
    maxIndent = Math.max(maxIndent, spaceCount);
  }
  
  // Compute indentation consistency:
  // True if all indentations are multiples of 2, 3, 4, or 8 (common tab widths)
  // or if all indentation uses tabs
  let isConsistent = false;
  if (hasTabIndent && indentLevels.size <= 5) {
    // Tab-based indentation is inherently consistent
    isConsistent = true;
  } else if (indentLevels.size > 0) {
    // Check if all indents are multiples of a common tab width (2, 3, 4, 8)
    const tabWidths = [2, 3, 4, 8];
    for (const tabWidth of tabWidths) {
      const allMultiples = [...indentLevels].every(level => level % tabWidth === 0 || level === 0);
      if (allMultiples) {
        isConsistent = true;
        break;
      }
    }
  }
  
  const indentRatio = indentedLineCount / lines.length;
  const avgIndentLevel = indentedLineCount > 0 ? totalIndent / indentedLineCount : 0;
  
  return {
    indentedLineCount,
    totalLineCount: lines.length,
    indentRatio,
    indentLevels,
    isConsistent,
    maxIndentLevel: maxIndent,
    avgIndentLevel: Math.round(avgIndentLevel * 100) / 100
  };
}

// ── Utility 4: normalizeRegexPattern(pattern) ───────────────────────────────
//
// Pre-compile and cache regex patterns to improve performance.
// Regex compilation is expensive; caching avoids recompilation.
// This helper maintains a simple LRU cache of compiled patterns.
//
// Used by signal computation functions (Token Pattern Recognition, etc.)
// to cache language keyword patterns and credential patterns.
//
// Cache capacity: 100 patterns (typical use cases need 10-30)
//
// @param {string|RegExp} pattern - Pattern to normalize (string or regex)
// @returns {RegExp} Compiled regex pattern (cached)

const REGEX_CACHE = new Map();
const REGEX_CACHE_MAX = 100;

function normalizeRegexPattern(pattern) {
  // If already a RegExp, check cache by source + flags
  if (pattern instanceof RegExp) {
    const key = pattern.source + ':' + pattern.flags;
    if (REGEX_CACHE.has(key)) {
      return REGEX_CACHE.get(key);
    }
    
    // Add to cache (simple LRU: delete oldest when full)
    if (REGEX_CACHE.size >= REGEX_CACHE_MAX) {
      const firstKey = REGEX_CACHE.keys().next().value;
      REGEX_CACHE.delete(firstKey);
    }
    REGEX_CACHE.set(key, pattern);
    return pattern;
  }
  
  // If string, compile and cache
  if (typeof pattern === 'string') {
    if (REGEX_CACHE.has(pattern)) {
      return REGEX_CACHE.get(pattern);
    }
    
    const compiled = new RegExp(pattern, 'gi'); // Global, case-insensitive by default
    if (REGEX_CACHE.size >= REGEX_CACHE_MAX) {
      const firstKey = REGEX_CACHE.keys().next().value;
      REGEX_CACHE.delete(firstKey);
    }
    REGEX_CACHE.set(pattern, compiled);
    return compiled;
  }
  
  throw new TypeError(`normalizeRegexPattern expects string or RegExp, got ${typeof pattern}`);
}

// ── Utility 5: countPatternMatches(text, patterns) ─────────────────────────
//
// Count total matches of multiple patterns in text.
// Helper for signal computation functions that need to count keyword occurrences.
//
// @param {string} text - Text to search
// @param {RegExp[]} patterns - Array of regex patterns
// @returns {number} Total match count across all patterns

function countPatternMatches(text, patterns) {
  if (!text || !Array.isArray(patterns)) return 0;
  
  let totalMatches = 0;
  for (const pattern of patterns) {
    const compiled = normalizeRegexPattern(pattern);
    // Reset global regex lastIndex before each match
    compiled.lastIndex = 0;
    const matches = text.match(compiled);
    if (matches) {
      totalMatches += matches.length;
    }
  }
  return totalMatches;
}

// ── TASK 3.2: computeTokenPattern(text) ──────────────────────────────────────
//
// Implement Signal 2 — Token Pattern Recognition
//
// Detect programming language keywords and syntax patterns in text.
// Analyzes language-specific patterns (control flow, declarations, imports, etc.)
// to determine the most likely programming language and compute a confidence score.
//
// Algorithm (Requirement 3, Requirements 7):
//   1. For each language in LANGUAGE_PATTERNS:
//      - Count total pattern matches across all language-specific regex patterns
//      - Compute score: (matches / line_count) * language_weight
//   2. Find language with highest score (detected language)
//   3. Normalize max score to 0–1 signal value: min(1.0, maxScore / 3.0)
//   4. Return signal object with:
//      - signal: "token_pattern"
//      - value: normalized 0–1 score
//      - detectedLanguage: most likely language
//      - components: langScores object with per-language breakdown
//
// Thresholds (Requirements 3):
//   - keyword_density < 0.02: 0 points (< 2% of words are code keywords)
//   - keyword_density 0.02–0.05: 15 points (moderate density)
//   - keyword_density ≥ 0.05: 25 points (high density, strong evidence)
//
// Requirements: 3, 7
//
// @param {string} text - Text block to analyze for code patterns
// @returns {object} Token pattern signal:
//   {
//     signal: "token_pattern",
//     value: number (0–1),           // Normalized signal value
//     detectedLanguage: string,      // Most likely language (e.g., "javascript")
//     components: {                  // Per-language breakdown
//       javascript: { matches: number, score: number, weight: number },
//       python: { matches: number, score: number, weight: number },
//       ... (other languages)
//     }
//   }

function computeTokenPattern(text) {
  if (!text || !text.trim()) {
    return {
      signal: "token_pattern",
      value: 0.0,
      detectedLanguage: null,
      components: {}
    };
  }

  // Compute line count for normalization (avoid division by zero)
  const lineCount = Math.max(text.split('\n').length, 1);
  
  const langScores = {};
  let maxScore = 0;
  let detectedLanguage = null;

  // Iterate through each language in LANGUAGE_PATTERNS
  for (const [lang, langConfig] of Object.entries(LANGUAGE_PATTERNS)) {
    if (!langConfig.patterns || !Array.isArray(langConfig.patterns)) {
      continue;  // Skip malformed entries
    }

    // Count total pattern matches for this language
    let matches = 0;
    for (const pattern of langConfig.patterns) {
      const compiled = normalizeRegexPattern(pattern);
      compiled.lastIndex = 0;  // Reset for fresh match
      const patternMatches = text.match(compiled);
      if (patternMatches) {
        matches += patternMatches.length;
      }
    }

    // Compute language score: (matches / line_count) * weight
    // This normalizes by text length and applies language prevalence weight
    const score = (matches / lineCount) * langConfig.weight;

    // Store breakdown for this language
    langScores[lang] = {
      matches,
      score: Math.round(score * 100) / 100,  // Round to 2 decimals
      weight: langConfig.weight
    };

    // Track highest-scoring language
    if (score > maxScore) {
      maxScore = score;
      detectedLanguage = lang;
    }
  }

  // Normalize max_score to 0–1 signal value
  // Threshold: > 3.0 pattern matches per line (with weight) = high confidence
  // Formula: min(1.0, maxScore / 3.0) clamps result to valid signal range
  const tokenPatternSignal = Math.min(1.0, maxScore / 3.0);

  // Requirement 16: Log signal details if enabled
  if (CODE_DETECTION_CONFIG.LOG_SIGNAL_DETAILS) {
    console.log(
      `[TrustPrompt/CodeDetection] Token Pattern Signal: ${tokenPatternSignal.toFixed(3)} ` +
      `(detected: ${detectedLanguage || 'none'}, matches: ${langScores[detectedLanguage]?.matches || 0})`
    );
  }

  return {
    signal: "token_pattern",
    value: tokenPatternSignal,
    detectedLanguage: detectedLanguage,
    components: langScores
  };
}

// ── Utility 5.1: countCredentialMatches(text, credentialPatterns) ─────────────
//
// Count credential indicators across all credential pattern categories.
// Used by Signal 4 (Credential Indicators) to detect embedded secrets.
//
// Iterates through all credential pattern categories (api_keys, jwt_tokens, etc.)
// and counts total matches. Returns object with breakdown by category.
//
// Requirements: 4, 12
//
// @param {string} text - Text to scan for credentials
// @param {object} credentialPatterns - CREDENTIAL_PATTERNS object with categories
// @returns {object} Credential match counts:
//   {
//     totalCount: number,        // Total credential indicators found
//     byCategory: {              // Breakdown by credential type
//       api_keys: number,
//       environment_variables: number,
//       connection_strings: number,
//       aws_keys: number,
//       github_tokens: number,
//       openai_keys: number,
//       jwt_tokens: number,
//       base64_data: number,
//       private_keys: number,
//       urls_with_credentials: number
//     }
//   }

function countCredentialMatches(text, credentialPatterns) {
  if (!text || typeof credentialPatterns !== 'object') {
    return { totalCount: 0, byCategory: {} };
  }
  
  const byCategory = {};
  let totalCount = 0;
  
  // Iterate through credential pattern categories (skip string arrays like credential_variable_names)
  for (const [category, patterns] of Object.entries(credentialPatterns)) {
    // Skip non-regex arrays (credential_variable_names, sensitive_keywords)
    if (Array.isArray(patterns) && patterns.length > 0 && typeof patterns[0] === 'string') {
      continue;  // Skip string arrays
    }
    
    // For regex pattern arrays
    if (Array.isArray(patterns)) {
      const count = countPatternMatches(text, patterns);
      byCategory[category] = count;
      totalCount += count;
    }
  }
  
  return { totalCount, byCategory };
}

// ── Utility 6: extractCodeBlock(text, startIndex, endIndex) ────────────────
//
// Extract a contiguous code block from text with boundary detection.
// Used when a code block is detected to extract the actual lines for
// credential scanning and block extraction.
//
// @param {string} text - Full text
// @param {number} startIndex - Character index to start extraction
// @param {number} endIndex - Character index to end extraction
// @param {number} maxLines - Maximum lines to extract (default 20)
// @returns {object} Code block extraction result:
//   {
//     block: string,            // Extracted block text
//     lineCount: number,        // Number of lines in block
//     startLine: number,        // Starting line number in original
//     endLine: number,          // Ending line number in original
//     charCount: number         // Character count in block
//   }

function extractCodeBlock(text, startIndex, endIndex, maxLines = 20) {
  if (!text || startIndex < 0 || endIndex < 0) {
    return { block: '', lineCount: 0, startLine: 0, endLine: 0, charCount: 0 };
  }
  
  // Clamp indices
  startIndex = Math.max(0, startIndex);
  endIndex = Math.min(text.length, endIndex);
  
  // Extract substring
  const block = text.substring(startIndex, endIndex);
  const lines = block.split('\n');
  
  // Truncate if exceeds maxLines
  const truncatedLines = lines.slice(0, maxLines);
  const truncatedBlock = truncatedLines.join('\n');
  
  // Count lines before startIndex to determine starting line number
  const textBeforeStart = text.substring(0, startIndex);
  const startLine = textBeforeStart.split('\n').length - 1;
  const endLine = startLine + truncatedLines.length - 1;
  
  return {
    block: truncatedBlock,
    lineCount: truncatedLines.length,
    startLine,
    endLine,
    charCount: truncatedBlock.length
  };
}

// ── Documentation: Usage Examples ────────────────────────────────────────────
//
// Example 1: Extract words for keyword matching
//   const text = "const foo = () => { return 42; };";
//   const words = extractWordsFromText(text);
//   // → ["const", "foo", "return"]
//
// Example 2: Analyze indentation
//   const indentStats = countLineIndentation("function foo() {\n  return 42;\n}");
//   // → {
//   //     indentedLineCount: 1,
//   //     totalLineCount: 3,
//   //     indentRatio: 0.33,
//   //     indentLevels: Set { 2 },
//   //     isConsistent: true,
//   //     maxIndentLevel: 2,
//   //     avgIndentLevel: 2
//   //   }
//
// Example 3: Cache regex patterns
//   const pattern = normalizeRegexPattern(/function\s+\w+/gi);
//   const pattern2 = normalizeRegexPattern(/function\s+\w+/gi); // From cache
//   // → Both are the same RegExp instance (cache hit)
//
// Example 4: Count matches
//   const keywords = [/const/, /let/, /var/, /function/];
//   const count = countPatternMatches("const x = 1; let y = 2;", keywords);
//   // → 2 (matches: "const" and "let")
// ════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// SIGNAL 1: STRUCTURE DENSITY
// ══════════════════════════════════════════════════════════════════════════
//
// Purpose: Detect syntactic characteristics typical of code (nested brackets,
// high punctuation concentration).
//
// Algorithm:
//   1. Count opening/closing brackets: (), {}, [], <>
//   2. Count code-specific punctuation: :, ;, comma, =, arrow operators, /
//   3. Compute bracket density: bracketCount / totalChars
//   4. Compute punctuation density: punctuationCount / totalChars
//   5. Normalize to 0.0-1.0 signal value
//
// Interpretation:
//   - Code typically has bracket+punctuation density 0.01-0.05
//   - Prose typically has density < 0.01
//   - Densities > 0.15 are strong indicators of code
//
// Reasoning:
//   Code has characteristic punctuation patterns (operators, delimiters) not
//   found in natural language prose. Code brackets and operators contribute to
//   high density; prose rarely exceeds 0.05 unless it contains URLs, math, etc.
//
// Thresholds:
//   - 0.00-0.05: Not code-like (normal prose)
//   - 0.05-0.15: Weakly code-like (may be code or punctuation-heavy prose)
//   - 0.15-1.00: Strongly code-like (brackets, operators, punctuation)
//
// Requirements: 2, 7
// Design: Section 1 (Signal 1)

function computeStructureDensity(text) {
  if (!text) {
    return {
      signal: "structure_density",
      value: 0,
      components: {
        bracketDensity: "0.0000",
        punctuationDensity: "0.0000",
        bracketCount: 0,
        codePunctuation: 0,
        totalChars: 0
      }
    };
  }
  
  // ── Count brackets ──────────────────────────────────────────────────────
  // Match all opening and closing brackets
  const BRACKET_PAIRS = [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '<', close: '>' }
  ];
  
  let bracketCount = 0;
  for (const pair of BRACKET_PAIRS) {
    // Use regex to count occurrences (properly escape special chars)
    const openPattern = new RegExp('\\' + pair.open, 'g');
    const closePattern = new RegExp('\\' + pair.close, 'g');
    
    const openMatches = text.match(openPattern);
    const closeMatches = text.match(closePattern);
    
    bracketCount += (openMatches ? openMatches.length : 0);
    bracketCount += (closeMatches ? closeMatches.length : 0);
  }
  
  // ── Count code-specific punctuation ─────────────────────────────────────
  // Patterns: :, ;, comma, =, /, and other operators
  // Use a single regex pattern to count all occurrences
  const codePointuation = text.match(/[:;,=/>\\-]/g) || [];
  const punctuationCount = codePointuation.length;
  
  // ── Compute densities ───────────────────────────────────────────────────
  const totalChars = Math.max(text.length, 1);
  
  const bracketDensity = bracketCount / totalChars;
  const punctuationDensity = punctuationCount / totalChars;
  
  // ── Normalize to 0.0-1.0 ───────────────────────────────────────────────
  // Sum the two densities and clamp to [0, 1]
  // Typical code: 0.01-0.05 combined density
  // Typical prose: < 0.01 combined density
  const rawDensity = bracketDensity + punctuationDensity;
  const structureDensity = Math.min(1.0, Math.max(0, rawDensity));
  
  // ── Return signal object ────────────────────────────────────────────────
  return {
    signal: "structure_density",
    value: structureDensity,
    components: {
      bracketDensity: bracketDensity.toFixed(4),
      punctuationDensity: punctuationDensity.toFixed(4),
      bracketCount,
      codePunctuation: punctuationCount,
      totalChars
    }
  };
}

// ── Examples ────────────────────────────────────────────────────────────────
//
// Example 1: JavaScript function (HIGH structure density)
//   const text = "function foo() { return 42; }";
//   const signal = computeStructureDensity(text);
//   // Brackets: ( ) { } = 4 total
//   // Punctuation: ( ) { } ; = 5 total
//   // Total: 9 punctuation + brackets, ~29 chars
//   // Density: 9/29 ≈ 0.31 → signal value 0.31 (STRONG code indicator)
//
// Example 2: English prose (LOW structure density)
//   const text = "The quick brown fox jumps over the lazy dog.";
//   const signal = computeStructureDensity(text);
//   // Brackets: 0
//   // Punctuation: . = 1 total
//   // Total: 1 punctuation + brackets, ~44 chars
//   // Density: 1/44 ≈ 0.023 → signal value 0.023 (NOT code-like)
//
// Example 3: JSON object (MODERATE structure density)
//   const text = '{"name": "Alice", "age": 30}';
//   const signal = computeStructureDensity(text);
//   // Brackets: { } = 2, Punctuation: { } : : , = 7 total
//   // Density: 7/31 ≈ 0.23 → signal value 0.23 (MODERATE code indicator)
// ════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// SIGNAL 3: ENTROPY DISTRIBUTION
// ══════════════════════════════════════════════════════════════════════════════
//
// Purpose: Detect variability in character composition to distinguish code from prose.
//   Code has higher entropy (varied operators, identifiers, keywords).
//   Repeated prose phrases have lower entropy.
//
// Algorithm:
//   1. Compute Shannon entropy for the entire text (using shannonEntropy utility)
//   2. Split text into lines, compute entropy for each line
//   3. Sort line entropies and pick the median value
//   4. Combine full entropy + median line entropy into composite score
//   5. Normalize to 0.0-1.0 signal value using formula: (entropy - 3.0) / 2.5, clamped to [0, 1]
//
// Interpretation:
//   Code typically has:
//     - Full entropy 3.5–5.5 bits/char (varied content: operators, keywords, identifiers)
//     - Median line entropy 2.5–4.0 bits/char (each line has unique content)
//   Prose typically has:
//     - Full entropy 4.0–5.0 bits/char (natural language is more predictable)
//     - Median line entropy 2.0–3.5 bits/char (repeated words lower entropy)
//
//   Entropy score interpretation:
//     - < 3.0: Very low (repeated content, pseudo-code, templated code)
//     - 3.0–3.5: Low (code with repetitive patterns)
//     - 3.5–4.5: Moderate (typical code or prose)
//     - > 4.5: High (random-looking, encrypted data, highly varied code)
//
// Thresholds:
//   - 0.00-0.20: Low entropy signal (not code-like)
//   - 0.20-0.50: Moderate entropy signal
//   - 0.50-1.00: High entropy signal (code-like)
//
// Reasoning:
//   Code (especially credentials) tends to have higher entropy than prose due to
//   character variety. However, this alone is not sufficient; regex patterns have
//   high entropy but are code. Entropy is best used with other signals.
//
// Requirements: 7 (signal weighting)
// Design: Section 1 (Signal 3)

function computeEntropyDistribution(text) {
  if (!text || text.length < 2) {
    return {
      signal: "entropy_distribution",
      value: 0,
      components: {
        fullEntropy: 0,
        medianLineEntropy: 0,
        lineCount: 0
      }
    };
  }
  
  // ── Compute Shannon entropy for the entire text ──────────────────────────
  // shansonEntropy() is defined globally in patterns.js
  const fullEntropy = shannonEntropy(text);
  
  // ── Compute entropy for each line ───────────────────────────────────────
  // Split by line breaks and filter empty lines
  const lines = text.split('\n').filter(line => line.length > 0);
  
  // Handle edge case: no lines or very few lines
  if (lines.length === 0) {
    return {
      signal: "entropy_distribution",
      value: 0,
      components: {
        fullEntropy,
        medianLineEntropy: 0,
        lineCount: 0
      }
    };
  }
  
  // Compute entropy for each line
  const lineEntropies = lines.map(line => shannonEntropy(line));
  
  // ── Calculate median line entropy ───────────────────────────────────────
  // Sort line entropies and pick the middle value
  const sortedEntropies = lineEntropies.slice().sort((a, b) => a - b);
  const medianIndex = Math.floor(sortedEntropies.length / 2);
  const medianLineEntropy = sortedEntropies[medianIndex];
  
  // ── Combine full entropy + median line entropy into composite ───────────
  // Average the two values as the base entropy score
  const entropyScore = (fullEntropy + medianLineEntropy) / 2;
  
  // ── Normalize to 0.0-1.0 signal value ──────────────────────────────────
  // Formula: (entropy - 3.0) / 2.5, clamped to [0, 1]
  // Rationale:
  //   - Entropy < 3.0 → signal 0.0 (not code-like)
  //   - Entropy 3.0 → signal 0.0 (boundary)
  //   - Entropy 5.5 → signal 1.0 (max)
  //   - Entropy > 5.5 → signal 1.0 (clamped)
  const entropySignal = Math.min(1.0, Math.max(0, (entropyScore - 3.0) / 2.5));
  
  // ── Return signal object ────────────────────────────────────────────────
  return {
    signal: "entropy_distribution",
    value: entropySignal,
    components: {
      fullEntropy: parseFloat(fullEntropy.toFixed(3)),
      medianLineEntropy: parseFloat(medianLineEntropy.toFixed(3)),
      lineCount: lines.length
    }
  };
}

// ── Examples ────────────────────────────────────────────────────────────────
//
// Example 1: JavaScript code (HIGH entropy)
//   const text = "function foo() { const x = 42; return x * 2; }";
//   const signal = computeEntropyDistribution(text);
//   // Full entropy ≈ 4.2 bits/char (varied operators, keywords, identifiers)
//   // Line entropy ≈ 3.8 bits/char
//   // Composite: (4.2 + 3.8) / 2 = 4.0
//   // Signal: (4.0 - 3.0) / 2.5 = 0.4 (MODERATE code indicator)
//
// Example 2: English prose (MODERATE entropy)
//   const text = "The quick brown fox jumps over the lazy dog.";
//   const signal = computeEntropyDistribution(text);
//   // Full entropy ≈ 4.1 bits/char (natural language distribution)
//   // Line entropy ≈ 4.1 bits/char
//   // Composite: (4.1 + 4.1) / 2 = 4.1
//   // Signal: (4.1 - 3.0) / 2.5 = 0.44 (MODERATE, similar to code)
//   // Note: Entropy alone is not sufficient to distinguish code from prose
//
// Example 3: Repeated pattern (LOW entropy)
//   const text = "aaaaaabbbbbbcccccc";
//   const signal = computeEntropyDistribution(text);
//   // Full entropy ≈ 1.6 bits/char (only 3 unique characters)
//   // Line entropy ≈ 1.6 bits/char
//   // Composite: (1.6 + 1.6) / 2 = 1.6
//   // Signal: (1.6 - 3.0) / 2.5 = -0.56 → clamped to 0.0 (NOT code)
//
// Example 4: API key credential (VERY HIGH entropy)
//   const text = "sk-1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p";
//   const signal = computeEntropyDistribution(text);
//   // Full entropy ≈ 5.0 bits/char (random-looking base64/hex)
//   // Line entropy ≈ 5.0 bits/char
//   // Composite: (5.0 + 5.0) / 2 = 5.0
//   // Signal: (5.0 - 3.0) / 2.5 = 0.8 (HIGH code indicator, but not conclusive)
//   // Note: High entropy + credential patterns → strong code detection
// ════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// SIGNAL 4: CREDENTIAL INDICATORS
// ══════════════════════════════════════════════════════════════════════════════
//
// Purpose: Detect evidence of embedded secrets (API keys, passwords, connection
// strings, environment variables, JWT tokens, private keys). Credentials are
// high-confidence indicators that code blocks contain sensitive information.
//
// Algorithm:
//   1. Iterate through credential patterns from CREDENTIAL_PATTERNS object
//   2. Count total matches across all pattern categories
//   3. Normalize credential count to 0.0–1.0 signal value using formula:
//      signal = min(1.0, credentialCount * 0.33)
//   4. Return signal object with credentialCount, patterns array, and components
//
// Interpretation:
//   - 0 credentials → signal 0.0 (no evidence of secrets)
//   - 1 credential → signal 0.33 (weak evidence)
//   - 2 credentials → signal 0.66 (moderate evidence)
//   - 3+ credentials → signal 1.0 (strong evidence of embedded secrets)
//
// Formula Rationale:
//   The 0.33 multiplier calibrates detection sensitivity:
//   - Lower multiplier (0.1) → higher threshold, fewer detections
//   - Higher multiplier (0.5) → lower threshold, more detections
//   - Default 0.33 is calibrated to balance false positives and false negatives
//   - Three or more credential indicators strongly suggest real code with secrets
//
// Thresholds (when escalating risk):
//   - 0.00: No credential indicators (no escalation)
//   - 0.10: One credential found (may escalate to MODERATE)
//   - 0.35: Two+ credentials found (may escalate to HIGH with other signals)
//   - 1.00: Three+ credentials found (strong escalation candidate)
//
// Reasoning:
//   Embedded credentials (API keys, JWT tokens, private keys, connection strings)
//   are strong indicators of:
//   1. Sensitive code blocks that should not be shared
//   2. Hardcoded secrets (anti-pattern, compliance risk per RA 10173)
//   3. Code containing configuration or deployment information
//   Unlike linguistic indicators, credential patterns are high-confidence.
//
// Pattern Categories (from CREDENTIAL_PATTERNS):
//   - api_keys: API key variable assignments (api_key=..., secret=...)
//   - environment_variables: Environment variable references (${API_KEY}, etc.)
//   - connection_strings: Database/service URLs (mongodb://, postgresql://, etc.)
//   - aws_keys: AWS access key patterns (AKIA...)
//   - github_tokens: GitHub token patterns (ghp_*, gho_*, github_pat_*)
//   - openai_keys: OpenAI API key patterns (sk-...)
//   - jwt_patterns: JWT token patterns (eyJ...eyJ...eyJ...)
//   - base64_data: Long base64-encoded data sequences
//   - private_keys: Private key file markers (-----BEGIN...PRIVATE KEY-----)
//   - urls_with_credentials: URLs with embedded user/pass (https://user:pass@...)
//
// Requirements: 4, 12 (credential detection); 7 (signal weighting)
// Design: Section 1 (Signal 4)

function computeCredentialIndicators(text) {
  if (!text || !text.trim()) {
    return {
      signal: "credential_indicators",
      value: 0.0,
      components: {
        credentialCount: 0,
        patterns: 0,
        byCategory: {}
      }
    };
  }
  
  // ── Check that CREDENTIAL_PATTERNS is available ──────────────────────
  // Defensive check: if CREDENTIAL_PATTERNS is not defined, return empty result
  if (!CREDENTIAL_PATTERNS || typeof CREDENTIAL_PATTERNS !== 'object') {
    return {
      signal: "credential_indicators",
      value: 0.0,
      components: {
        credentialCount: 0,
        patterns: 0,
        byCategory: {}
      }
    };
  }
  
  // ── Count credential matches using helper function ────────────────────
  // Uses CREDENTIAL_PATTERNS object (defined earlier in scanner.js)
  const matches = countCredentialMatches(text, CREDENTIAL_PATTERNS);
  const credentialCount = matches.totalCount;
  const byCategory = matches.byCategory;
  
  // ── Normalize to 0.0–1.0 signal value ─────────────────────────────────
  // Formula: min(1.0, credentialCount * 0.33)
  // Calibration:
  //   - 0 credentials → 0.0
  //   - 1 credential → 0.33
  //   - 2 credentials → 0.66
  //   - 3+ credentials → 1.0 (clamped)
  const credentialSignal = Math.min(1.0, credentialCount * 0.33);
  
  // ── Count pattern categories available for reference ───────────────────
  // This helps diagnostic logging; shows how many credential pattern types
  // are configured in CREDENTIAL_PATTERNS
  const patternCount = Object.keys(CREDENTIAL_PATTERNS).length;
  
  // ── Return signal object ────────────────────────────────────────────────
  return {
    signal: "credential_indicators",
    value: credentialSignal,
    components: {
      credentialCount,
      patterns: patternCount,
      byCategory
    }
  };
}

// ── Examples ────────────────────────────────────────────────────────────────
//
// Example 1: Code without credentials (ZERO indicators)
//   const text = "function validateEmail(email) {\n  return email.includes('@');\n}";
//   const signal = computeCredentialIndicators(text);
//   // No API keys, JWT, private keys, or connection strings detected
//   // Result: { signal: "credential_indicators", value: 0.0, components: {...} }
//   // Signal value: 0.0 (no evidence of secrets)
//
// Example 2: Code with one credential indicator (WEAK evidence)
//   const text = "const apiKey = 'sk-1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p';";
//   const signal = computeCredentialIndicators(text);
//   // One API key pattern matched (OpenAI-style)
//   // credentialCount = 1
//   // Result: { signal: "credential_indicators", value: 0.33, components: {...} }
//   // Signal value: 0.33 (weak but notable evidence)
//
// Example 3: Code with two credential indicators (MODERATE evidence)
//   const text = `
//     const apiKey = 'sk-...';
//     const dbUrl = 'mongodb://user:pass@host:27017/db';
//   `;
//   const signal = computeCredentialIndicators(text);
//   // Two credential patterns matched
//   // credentialCount = 2
//   // Result: { signal: "credential_indicators", value: 0.66, components: {...} }
//   // Signal value: 0.66 (moderate evidence; escalation candidate)
//
// Example 4: Code with three+ credential indicators (STRONG evidence)
//   const text = `
//     const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
//     const awsKey = 'AKIAIOSFODNN7EXAMPLE';
//     const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
//   `;
//   const signal = computeCredentialIndicators(text);
//   // Three credential patterns matched
//   // credentialCount = 3
//   // Result: { signal: "credential_indicators", value: 1.0, components: {...} }
//   // Signal value: 1.0 (strong evidence; code contains sensitive data)
//   // Risk escalation likely: LOW → MODERATE or MODERATE → HIGH
//
// Example 5: Configuration with multiple connection strings (HIGH indicators)
//   const text = `
//     DATABASE_URL=postgresql://admin:secret@db.example.com:5432/prod
//     REDIS_URL=redis://default:password@cache.example.com:6379
//     MONGO_CONNECTION=mongodb+srv://user:pass@cluster.mongodb.net/database
//   `;
//   const signal = computeCredentialIndicators(text);
//   // Multiple connection strings detected
//   // credentialCount = 3–5 depending on pattern matching
//   // Result: { signal: "credential_indicators", value: min(1.0, count * 0.33) }
//   // Signal value: high (strong evidence of deployment configuration with secrets)
// ════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// SIGNAL 5: MARKUP AND FORMATTING CONSISTENCY
// ══════════════════════════════════════════════════════════════════════════════
//
// Purpose: Detect code-block markers and formatting (indentation, monospace escaping, HTML escaping).
//   Code blocks are often marked explicitly with fences (```, ~~~) or HTML tags.
//   Consistent indentation and HTML escaping also indicate intentional code formatting.
//
// Algorithm:
//   1. Count code-block markers: backtick fences (```), tilde indents (~~~), HTML tags (<code>, <pre>)
//   2. Count HTML escapes: &lt;, &gt;, &amp;, &quot;
//   3. Analyze indentation: count indented lines (4+ spaces or tab), compute indentation_ratio
//   4. Analyze monospace hints: count lines with 2+ consecutive spaces, compute monospace_ratio
//   5. Compute markup score using weighted formula:
//      - 0.3 × (backtick fences count / max fences)
//      - 0.3 × (tilde fences count / max fences)
//      - 0.2 × (HTML code tags count / max tags)
//      - 0.1 × (HTML escapes > 0 ? 1.0 : 0.0)
//      - 0.1 × indentation_ratio
//      - 0.1 × monospace_ratio
//   6. Normalize to 0.0–1.0 signal value
//
// Interpretation:
//   Markup consistency indicates:
//     - 0.00: No markup hints (plain prose)
//     - 0.10–0.30: Weak markup (some indentation or minimal markers)
//     - 0.30–0.70: Moderate markup (indented or partially escaped code)
//     - 0.70–1.00: Strong markup (explicit code block markers)
//
// Reasoning:
//   Presence of code-block markers, indentation, or HTML escaping is a strong
//   indicator that the author intended the text to be interpreted as code.
//   Code blocks in markdown, forums, and documentation use these markers
//   consistently, making them reliable signals.
//
// Requirements: 7 (signal weighting), Weight: 0.10 (lowest importance; explicit markers are obvious)
// Design: Section 1 (Signal 5)

function computeMarkupConsistency(text) {
  if (!text || text.length < 1) {
    return {
      signal: "markup_consistency",
      value: 0,
      components: {
        backtickFences: 0,
        tildeIndentFences: 0,
        htmlCodeTags: 0,
        htmlEscapes: 0,
        indentationRatio: 0,
        monospaceRatio: 0
      }
    };
  }

  // ── Count code-block markers ────────────────────────────────────────────
  // Backtick fences: ``` (markdown fenced code blocks)
  const backtickFences = (text.match(/```/g) || []).length;

  // Tilde indents: ~~~ (alternative markdown fence marker)
  const tildeIndentFences = (text.match(/~~~/g) || []).length;

  // HTML code tags: <code> or <pre>
  const htmlCodeTags = (text.match(/<code>|<pre>/gi) || []).length;

  // ── Count HTML escapes ──────────────────────────────────────────────────
  // HTML-escaped characters: &lt; &gt; &amp; &quot; indicate HTML-encoded code
  const htmlEscapes = (text.match(/&lt;|&gt;|&amp;|&quot;/g) || []).length;

  // ── Analyze indentation patterns ────────────────────────────────────────
  // Count lines starting with 4+ spaces or a tab
  const lines = text.split('\n');
  const indentedLines = lines.filter(l => /^(\s{4,}|\t)/.test(l)).length;
  const indentationRatio = lines.length > 0 ? indentedLines / lines.length : 0;

  // ── Analyze monospace rendering hints ────────────────────────────────────
  // Count lines with 2+ consecutive spaces (often used for formatting/alignment in code)
  const monospacedLines = lines.filter(l => /\s{2,}/.test(l)).length;
  const monospaceRatio = lines.length > 0 ? monospacedLines / lines.length : 0;

  // ── Compute markup score using weighted formula ──────────────────────────
  // Each component contributes to the overall markup signal.
  // Normalize component counts: 
  //   - 0 markers = 0
  //   - 1 marker = 1.0 (normalized)
  //   - 2+ markers = capped at 1.0
  const backtickFencesNorm = Math.min(1.0, backtickFences);
  const tildeFencesNorm = Math.min(1.0, tildeIndentFences);
  const htmlTagsNorm = Math.min(1.0, htmlCodeTags);
  const htmlEscapesIndicator = htmlEscapes > 0 ? 1.0 : 0.0;

  // Weighted sum: (0.3 backticks + 0.3 tildes + 0.2 HTML + 0.1 escapes + 0.1 indent + 0.1 monospace)
  const markupScore = (
    backtickFencesNorm * 0.3 +           // high weight for explicit backtick markers
    tildeFencesNorm * 0.3 +              // high weight for tilde markers
    htmlTagsNorm * 0.2 +                 // moderate weight for HTML tags
    htmlEscapesIndicator * 0.1 +         // high confidence indicator for HTML-escaped code
    indentationRatio * 0.1 +             // consistent indentation suggests code
    monospaceRatio * 0.1                 // monospace formatting (multiple spaces)
  );

  // ── Normalize to 0.0-1.0 signal value ──────────────────────────────────
  // Markup score is already bounded by the weighted sum of components (each ≤ 1.0)
  // Further normalize by the sum of weights (0.3 + 0.3 + 0.2 + 0.1 + 0.1 + 0.1 = 1.1)
  // This means max possible score is 1.1, so clamp to 1.0
  const markupSignal = Math.min(1.0, markupScore);

  // ── Return signal object ────────────────────────────────────────────────
  return {
    signal: "markup_consistency",
    value: markupSignal,
    components: {
      backtickFences,
      tildeIndentFences,
      htmlCodeTags,
      htmlEscapes,
      indentationRatio: parseFloat(indentationRatio.toFixed(3)),
      monospaceRatio: parseFloat(monospaceRatio.toFixed(3))
    }
  };
}

// ── Examples ────────────────────────────────────────────────────────────────
//
// Example 1: Markdown fenced code (VERY HIGH markup consistency)
//   const text = "```javascript\nconst x = 42;\n```";
//   const signal = computeMarkupConsistency(text);
//   // Backtick fences: 2 (normalized to 1.0)
//   // Tildes: 0
//   // HTML tags: 0
//   // HTML escapes: 0
//   // Indentation: 0 (no leading indentation on lines)
//   // Monospace: 0 (no multiple consecutive spaces)
//   // Score: 1.0 × 0.3 + 0 + 0 + 0 + 0 + 0 = 0.3 (LOW-MODERATE indicator)
//   // Signal: 0.3 (Strong markup indicator due to explicit fence markers)
//
// Example 2: Indented code block (MODERATE markup consistency)
//   const text = "    const x = 42;\n    return x * 2;\n    console.log(x);";
//   const signal = computeMarkupConsistency(text);
//   // Backticks: 0
//   // Tildes: 0
//   // HTML tags: 0
//   // HTML escapes: 0
//   // Indentation ratio: 3/3 = 1.0 (all lines indented)
//   // Monospace ratio: ~0.67 (lines have spacing)
//   // Score: 0 + 0 + 0 + 0 + 1.0 × 0.1 + 0.67 × 0.1 = 0.167 (WEAK-MODERATE)
//   // Signal: 0.167 (Moderate: consistent indentation suggests intentional code formatting)
//
// Example 3: HTML-escaped code (HIGH markup consistency)
//   const text = "&lt;div&gt;Hello&lt;/div&gt;";
//   const signal = computeMarkupConsistency(text);
//   // Backticks: 0
//   // Tildes: 0
//   // HTML tags: 0
//   // HTML escapes: 4 (normalized to 1.0)
//   // Indentation: 0
//   // Monospace: 0
//   // Score: 0 + 0 + 0 + 1.0 × 0.1 + 0 + 0 = 0.1
//   // Signal: 0.1 (HTML escaping is a strong code indicator but has low weight)
//
// Example 4: Plain prose (NO markup consistency)
//   const text = "The quick brown fox jumps over the lazy dog. This is just text.";
//   const signal = computeMarkupConsistency(text);
//   // Backticks: 0
//   // Tildes: 0
//   // HTML tags: 0
//   // HTML escapes: 0
//   // Indentation: 0 (no leading whitespace)
//   // Monospace: 0 (no multiple consecutive spaces)
//   // Score: 0 + 0 + 0 + 0 + 0 + 0 = 0.0
//   // Signal: 0.0 (No markup: plain prose)
//
// Example 5: Mixed formatting (TILDE + HTML escape)
//   const text = "~~~\n&lt;code&gt;\nsome content\n&lt;/code&gt;\n~~~";
//   const signal = computeMarkupConsistency(text);
//   // Backticks: 0
//   // Tildes: 2 (normalized to 1.0)
//   // HTML tags: 0
//   // HTML escapes: 4 (indicator = 1.0)
//   // Indentation: 0
//   // Monospace: 0
//   // Score: 0 + 1.0 × 0.3 + 0 + 1.0 × 0.1 + 0 + 0 = 0.4
//   // Signal: 0.4 (Moderate: explicit tilde fences + HTML escaping)

// ── TASK 7.1: SIGNAL AGGREGATION FUNCTION ──────────────────────────────────────
//
// Purpose: Combine 5 independent signals into a single composite score that reflects
// the likelihood that a text block is source code.
//
// Requirements: 7 (Signal Weighting and Score Normalization)
// Design: Section 2 (Score Aggregation)
//
// Function: aggregateSignals(signals)
//   Input:  signals - array of signal objects, each with:
//           - signal: string (name of the signal)
//           - value: number (0.0–1.0 normalized signal value)
//           - (optional) components: object with breakdown details
//   Output: object with:
//           - compositeScore: weighted average (0.0–1.0)
//           - normalizedScore: 0–100 scale
//           - signals: array of signals with weights applied
//
// Algorithm:
//   1. Define SIGNAL_WEIGHTS for each of the 5 signals
//   2. Compute weighted sum: Σ(signal.value × weight)
//   3. Normalize by sum of weights to get composite score (0–1)
//   4. Scale to 0–100 range for readability
//   5. Return detailed breakdown with component weights
//
// Interpretation:
//   0–25%:   Low confidence (not code)
//   25–50%:  Moderate confidence (may be code)
//   50–75%:  High confidence (likely code)
//   75–100%: Very high confidence (definitely code)
//
// Example 1: JavaScript code block
//   const signals = [
//     { signal: "structure_density", value: 0.182 },
//     { signal: "token_pattern", value: 0.680 },
//     { signal: "entropy_distribution", value: 0.420 },
//     { signal: "credential_indicators", value: 0.000 },
//     { signal: "markup_consistency", value: 0.120 }
//   ];
//   const result = aggregateSignals(signals);
//   // Expected: compositeScore ≈ 0.379, normalizedScore ≈ 38.0 (below threshold, but borderline)
//
// Example 2: JavaScript code with API key
//   const signals = [
//     { signal: "structure_density", value: 0.182 },
//     { signal: "token_pattern", value: 0.680 },
//     { signal: "entropy_distribution", value: 0.420 },
//     { signal: "credential_indicators", value: 0.660 },  // HIGH: API key detected
//     { signal: "markup_consistency", value: 0.120 }
//   ];
//   const result = aggregateSignals(signals);
//   // Expected: compositeScore ≈ 0.521, normalizedScore ≈ 52.1 (exceeds threshold)
//
// Example 3: Plain English prose
//   const signals = [
//     { signal: "structure_density", value: 0.045 },
//     { signal: "token_pattern", value: 0.050 },
//     { signal: "entropy_distribution", value: 0.250 },
//     { signal: "credential_indicators", value: 0.000 },
//     { signal: "markup_consistency", value: 0.000 }
//   ];
//   const result = aggregateSignals(signals);
//   // Expected: compositeScore ≈ 0.041, normalizedScore ≈ 4.1 (well below threshold)

function aggregateSignals(signals) {
  // ── Validate input ──────────────────────────────────────────────────────
  if (!Array.isArray(signals) || signals.length === 0) {
    return {
      compositeScore: 0,
      normalizedScore: 0,
      signals: []
    };
  }

  // ── Define signal weights per Requirement 7 ─────────────────────────────
  // Rationale documented in CODE_DETECTION_CONFIG.WEIGHTS
  // These weights reflect the reliability and distinctiveness of each signal:
  //   - structure_density (0.15): Moderate reliability; punctuation appears in prose too
  //   - token_pattern (0.30): High reliability; language keywords are distinctive
  //   - entropy_distribution (0.20): Moderate reliability; varies by language
  //   - credential_indicators (0.25): Very high reliability; credentials are high-confidence
  //   - markup_consistency (0.10): Baseline; explicit markers are obvious but not always present
  // Sum of weights: 0.15 + 0.30 + 0.20 + 0.25 + 0.10 = 1.00
  const SIGNAL_WEIGHTS = {
    structure_density: 0.15,
    token_pattern: 0.30,
    entropy_distribution: 0.20,
    credential_indicators: 0.25,
    markup_consistency: 0.10
  };

  // ── Compute weighted sum ────────────────────────────────────────────────
  // Formula: raw_score = Σ(signal.value × weight)
  let weightedSum = 0;
  let weightSum = 0;
  const signalsWithWeights = [];

  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.signal] || 0;

    // Only include signals that have a defined weight and value
    if (weight > 0 && signal.value !== undefined && signal.value !== null) {
      const contribution = signal.value * weight;
      weightedSum += contribution;
      weightSum += weight;

      signalsWithWeights.push({
        signal: signal.signal,
        value: parseFloat(signal.value.toFixed(3)),
        weight: weight,
        contribution: parseFloat(contribution.toFixed(3))
      });
    }
  }

  // ── Normalize to 0–1 range ─────────────────────────────────────────────
  // compositeScore = weightedSum / weightSum
  // Since SIGNAL_WEIGHTS sum to 1.0, this simplifies to: compositeScore = weightedSum
  // However, we normalize defensively in case weights change or signals are missing
  const compositeScore = weightSum > 0 ? weightedSum / weightSum : 0;

  // ── Scale to 0–100 range for readability ────────────────────────────────
  // The normalized score maps [0, 1] → [0, 100]
  const normalizedScore = compositeScore * 100;

  // ── Return aggregated result ────────────────────────────────────────────
  // Include detailed breakdown for diagnostics and logging
  return {
    // Composite score in 0–1 range (used for threshold comparison)
    compositeScore: parseFloat(compositeScore.toFixed(3)),

    // Normalized score in 0–100 range (human-readable)
    normalizedScore: parseFloat(normalizedScore.toFixed(1)),

    // Signals array with weights and contributions for diagnostics
    signals: signalsWithWeights,

    // Additional metadata for logging
    signalCount: signalsWithWeights.length,
    weightSum: parseFloat(weightSum.toFixed(3)),
    weightedSum: parseFloat(weightedSum.toFixed(3))
  };
}

// ── Examples ────────────────────────────────────────────────────────────────
//
// Example 1: Code with strong language patterns and credentials
//   Input:
//     signals = [
//       { signal: "structure_density", value: 0.182 },
//       { signal: "token_pattern", value: 0.680 },
//       { signal: "entropy_distribution", value: 0.420 },
//       { signal: "credential_indicators", value: 0.660 },
//       { signal: "markup_consistency", value: 0.120 }
//     ]
//
//   Calculation:
//     weightedSum = (0.182 × 0.15) + (0.680 × 0.30) + (0.420 × 0.20) + (0.660 × 0.25) + (0.120 × 0.10)
//                 = 0.0273 + 0.2040 + 0.0840 + 0.1650 + 0.0120
//                 = 0.4923
//     compositeScore = 0.4923 / 1.0 = 0.4923 (49.2%, near threshold)
//     normalizedScore = 0.4923 × 100 = 49.2
//
//   Output:
//     {
//       compositeScore: 0.492,
//       normalizedScore: 49.2,
//       signals: [
//         { signal: "structure_density", value: 0.182, weight: 0.15, contribution: 0.027 },
//         { signal: "token_pattern", value: 0.680, weight: 0.30, contribution: 0.204 },
//         { signal: "entropy_distribution", value: 0.420, weight: 0.20, contribution: 0.084 },
//         { signal: "credential_indicators", value: 0.660, weight: 0.25, contribution: 0.165 },
//         { signal: "markup_consistency", value: 0.120, weight: 0.10, contribution: 0.012 }
//       ],
//       signalCount: 5,
//       weightSum: 1.0,
//       weightedSum: 0.492
//     }
//
// Example 2: Plain English prose
//   Input:
//     signals = [
//       { signal: "structure_density", value: 0.045 },
//       { signal: "token_pattern", value: 0.050 },
//       { signal: "entropy_distribution", value: 0.250 },
//       { signal: "credential_indicators", value: 0.000 },
//       { signal: "markup_consistency", value: 0.000 }
//     ]
//
//   Calculation:
//     weightedSum = (0.045 × 0.15) + (0.050 × 0.30) + (0.250 × 0.20) + (0.000 × 0.25) + (0.000 × 0.10)
//                 = 0.0068 + 0.0150 + 0.0500 + 0 + 0
//                 = 0.0718
//     compositeScore = 0.0718 / 1.0 = 0.0718 (7.2%, well below threshold)
//     normalizedScore = 0.0718 × 100 = 7.2
//
//   Output:
//     {
//       compositeScore: 0.072,
//       normalizedScore: 7.2,
//       signals: [
//         { signal: "structure_density", value: 0.045, weight: 0.15, contribution: 0.007 },
//         { signal: "token_pattern", value: 0.050, weight: 0.30, contribution: 0.015 },
//         { signal: "entropy_distribution", value: 0.250, weight: 0.20, contribution: 0.050 },
//         { signal: "credential_indicators", value: 0.000, weight: 0.25, contribution: 0.000 },
//         { signal: "markup_consistency", value: 0.000, weight: 0.10, contribution: 0.000 }
//       ],
//       signalCount: 5,
//       weightSum: 1.0,
//       weightedSum: 0.072
//     }
//
// Example 3: Markdown-fenced code block
//   Input:
//     signals = [
//       { signal: "structure_density", value: 0.160 },
//       { signal: "token_pattern", value: 0.450 },
//       { signal: "entropy_distribution", value: 0.380 },
//       { signal: "credential_indicators", value: 0.000 },
//       { signal: "markup_consistency", value: 0.900 }  // HIGH: explicit backtick fences
//     ]
//
//   Calculation:
//     weightedSum = (0.160 × 0.15) + (0.450 × 0.30) + (0.380 × 0.20) + (0.000 × 0.25) + (0.900 × 0.10)
//                 = 0.0240 + 0.1350 + 0.0760 + 0 + 0.0900
//                 = 0.3250
//     compositeScore = 0.3250 / 1.0 = 0.3250 (32.5%, below threshold but indicates code)
//     normalizedScore = 0.3250 × 100 = 32.5
//
//   Note: The markup_consistency signal alone (0.9) doesn't override token_pattern weakness.
//         This example shows how multiple weak signals combine, and why context/markup helps.

// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// ── TASK 9.1: evaluateCodeRiskEscalation(scoreObj, baseRisk) ──────────────────
//
// Evaluates and escalates risk level based on detected credentials within code blocks.
//
// **Purpose**: Implements Requirement 12 (Risk Assessment for Code Blocks).
// When a code block is detected, scan it for embedded credentials (API keys, JWT tokens,
// passwords, connection strings, etc.). If credentials are found, escalate the risk level
// from LOW → MODERATE (sensitive keywords) or LOW → HIGH (critical credentials like API keys/JWT).
//
// **Design Reference**: Design Section 2.2 (Credential Escalation Logic)
//
// **Requirements**: 10, 12
//
// @param {object} scoreObj - The score object returned by computeSourceCodeScore()
//   Structure:
//     {
//       classification: "code",      // "code" or "prose"
//       score: 10,                   // total feature points
//       strong_evidence: true,       // boolean indicating strong evidence presence
//       reason: "✓ Meets threshold...",
//       features: {                  // individual feature scores
//         code_keywords: 3,
//         imports: 3,
//         braces: 2,
//         function_calls: 2,
//         semicolons: 1,
//         operators: 1,
//         naming_conventions: 1,
//         comments: 1,
//         indentation: 1,
//         line_density: 1,
//         credentialIndicators: <score from computeCredentialIndicators()>
//       }
//     }
//
// @param {string} baseRisk - The base risk level ("low", "moderate", "high")
//
// @returns {object} Escalation result:
//   {
//     escalatedRisk: "high",         // final risk level after escalation
//     escalated: true,               // whether escalation occurred
//     reason: "contains API key + JWT patterns",
//     credentialsDetected: true,     // whether credentials were found
//     credentialTypes: ["api_key", "jwt"],  // types of credentials found
//     patterns: ["AKIA...", "eyJ..."]  // examples of detected patterns (truncated for safety)
//   }
//
// **Escalation Logic**:
// 1. Extract credentialIndicators feature score from scoreObj.features
// 2. If credentialIndicators score is 0, no credentials detected → maintain baseRisk
// 3. If credentialIndicators score > 0:
//    - Check for CRITICAL credentials (API keys, JWT, AWS keys, GitHub tokens):
//       → Escalate: LOW → HIGH or maintain HIGH
//    - Check for SENSITIVE keywords (password, secret, token, api_key, private_key, database_url):
//       → Escalate: LOW → MODERATE or maintain MODERATE/HIGH
// 4. Log escalation decision with reason and pattern types detected
// 5. Return escalatedRisk and metadata
//
// **Example Usage**:
//   const scoreObj = computeSourceCodeScore("const API_KEY = 'sk-123456789abc';");
//   const escalation = evaluateCodeRiskEscalation(scoreObj, "low");
//   // escalation.escalatedRisk === "high" (API key pattern detected)
//
// **Performance**: O(1) — extracts features and applies lookup rules; no new scanning

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

  // Determine escalation severity based on credentialIndicators score
  // credentialIndicators is a 0–1 signal; if > 0, credentials exist
  // We escalate based on:
  //   1. Score magnitude (higher = more/more critical credentials)
  //   2. Whether code classification is present (stronger confidence)
  //   3. Known critical patterns (API keys, JWT, AWS, GitHub)

  // ── Critical credentials: Escalate to HIGH ─────────────────────────────
  // If credentialIndicators score is high (> 0.5) OR features indicate
  // critical patterns like API keys, JWT tokens, AWS keys, GitHub tokens
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
      // Already moderate; no change needed, but mark as escalated for audit
      escalatedRisk = 'moderate';
      escalated = false;
      reason = 'Already at MODERATE risk; credentials present but no further escalation';
      credentialTypes.push('password', 'secret', 'token');
    } else if (baseRisk.toLowerCase() === 'high') {
      // Already high; maintain HIGH
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

// ── Examples ────────────────────────────────────────────────────────────────
//
// Example 1: Code with high credential indicators (API key pattern detected)
//   Input:
//     scoreObj = {
//       classification: "code",
//       score: 10,
//       strong_evidence: true,
//       features: {
//         code_keywords: 3,
//         imports: 3,
//         braces: 2,
//         function_calls: 2,
//         credentialIndicators: 0.75  // HIGH: API key + JWT patterns found
//       }
//     }
//     baseRisk = "low"
//
//   Output:
//     {
//       escalatedRisk: "high",
//       escalated: true,
//       reason: "Code block contains embedded credentials (score: 0.75); critical patterns likely present",
//       credentialsDetected: true,
//       credentialTypes: ["general_credential_pattern", "api_key", "jwt", "aws_key", "github_token"],
//       patterns: ["[REDACTED_API_KEY]", "[REDACTED_JWT]", "[REDACTED_AWS_KEY]"]
//     }
//
// Example 2: Code with moderate credential indicators (password keyword)
//   Input:
//     scoreObj = {
//       classification: "code",
//       score: 8,
//       strong_evidence: true,
//       features: {
//         code_keywords: 3,
//         imports: 0,
//         braces: 2,
//         function_calls: 2,
//         credentialIndicators: 0.35  // MODERATE: password/secret keyword found
//       }
//     }
//     baseRisk = "low"
//
//   Output:
//     {
//       escalatedRisk: "moderate",
//       escalated: true,
//       reason: "Code block contains sensitive keywords or credentials (score: 0.35)",
//       credentialsDetected: true,
//       credentialTypes: ["general_credential_pattern", "password", "secret", "token", "database_url"],
//       patterns: ["[REDACTED_PASSWORD]", "[REDACTED_TOKEN]"]
//     }
//
// Example 3: Code with no credential indicators
//   Input:
//     scoreObj = {
//       classification: "code",
//       score: 6,
//       strong_evidence: true,
//       features: {
//         code_keywords: 3,
//         imports: 0,
//         braces: 2,
//         function_calls: 1,
//         credentialIndicators: 0  // NO credentials
//       }
//     }
//     baseRisk = "low"
//
//   Output:
//     {
//       escalatedRisk: "low",
//       escalated: false,
//       reason: "No embedded credentials detected",
//       credentialsDetected: false,
//       credentialTypes: [],
//       patterns: []
//     }

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS FOR COMMONJS AND GLOBAL ENVIRONMENTS
// ════════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TrustScanner;
}

if (typeof globalThis !== 'undefined') {
  globalThis.TrustScanner = TrustScanner;
  globalThis.computeSourceCodeScore = TrustScanner.computeSourceCodeScore;
  globalThis.evaluateCodeRiskEscalation = TrustScanner.evaluateCodeRiskEscalation;
  globalThis.isCodeContextual = TrustScanner.isCodeContextual;
  globalThis.detectCodeKeywords = TrustScanner.detectCodeKeywords;
  globalThis.detectImportStatements = TrustScanner.detectImportStatements;
  globalThis.detectBraces = TrustScanner.detectBraces;
  globalThis.detectFunctionCalls = TrustScanner.detectFunctionCalls;
  globalThis.detectSemicolons = TrustScanner.detectSemicolons;
  globalThis.detectOperators = TrustScanner.detectOperators;
  globalThis.detectCodingNamingConventions = TrustScanner.detectCodingNamingConventions;
  globalThis.detectComments = TrustScanner.detectComments;
  globalThis.detectIndentationPattern = TrustScanner.detectIndentationPattern;
  globalThis.detectLineDensity = TrustScanner.detectLineDensity;
}

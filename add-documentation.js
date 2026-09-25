// Prepend comprehensive framework documentation to scanner.js (Tasks 17.1 + 17.2)
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'scanner.js');
const content = fs.readFileSync(filePath, 'utf8');

// Only add if not already present
if (content.includes('TASK 17.1: MULTI-FEATURE SOURCE CODE DETECTION FRAMEWORK')) {
  console.log('Documentation already present. Skipping.');
  process.exit(0);
}

const docBlock = `// ══════════════════════════════════════════════════════════════════════════════
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

`;

// Insert the documentation block after line 19 (after the existing header)
// Find the end of the original header comment block
const insertPoint = content.indexOf('\n/* global TrustNormalizer');
if (insertPoint === -1) {
  console.error('Could not find insertion point in scanner.js');
  process.exit(1);
}

const newContent = content.slice(0, insertPoint) + '\n' + docBlock + content.slice(insertPoint);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Documentation added successfully to scanner.js');
console.log('File size before:', content.length, 'bytes');
console.log('File size after:', newContent.length, 'bytes');

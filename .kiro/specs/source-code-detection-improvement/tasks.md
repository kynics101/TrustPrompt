# Implementation Plan: Source Code Detection Improvement

## Overview

Implement a 10-feature scoring framework that improves source code detection through dual threshold validation (composite score ≥ 6 AND strong evidence required). Features are classified as strong evidence (Code Keywords, Imports, Braces, Function Calls) and weak evidence (Semicolons, Operators, Naming Conventions, Comments, Indentation, Line Density). This feature detects unformatted code blocks, distinguishes code from prose with higher accuracy, and escalates risk when credentials are detected. The framework is configurable, logged, and integrates seamlessly with the existing scanner.js PATH A pipeline.

---

## Tasks

### 1. Set Up Signal Computation Infrastructure

- [x] 1.1 Create shared utilities for signal computation
  - Implement `shannonEntropy(text)` — compute entropy in bits/char (if not already present)
  - Implement `extractWordsFromText(text)` — tokenize text for keyword matching
  - Implement `countLineIndentation(text)` — analyze indentation patterns
  - Add helper: `normalizeRegexPattern(pattern)` — pre-compile and cache regex patterns
  - Add to `scanner.js` or new `code-detector.js` module
  - _Requirements: 1, 7_

- [x] 1.2 Define signal computation constants and configuration
  - Create `CODE_DETECTION_CONFIG` object with thresholds, weights, logging flags
  - Define language-specific keyword sets (JavaScript, Python, Java, SQL, Shell, JSON, XML/HTML)
  - Define credential pattern collection (API key, JWT, passwords, connection strings, etc.)
  - Define comment marker patterns per language
  - Add to `scanner.js`
  - _Requirements: 1, 15_

- [x]* 1.3 Write unit tests for shared utilities
  - Test `shannonEntropy()` with known values (uniform string H=0, random H≈2.0)
  - Test `extractWordsFromText()` with various punctuation
  - Test `countLineIndentation()` with tabs, spaces, mixed indentation
  - _Requirements: 13_

---

### 2. Implement Feature 1 — Code Keywords (Strong Evidence)

- [x] 2.1 Implement `detectCodeKeywords(text)` function
  - Create comprehensive keyword list: control flow (if, else, for, while, return), declarations (function, class, const, let, var, def), type keywords (int, string, boolean, void), module keywords (import, export, require, from, use), language-specific (this, self, new, instanceof)
  - Count keyword matches (case-insensitive word boundary matching)
  - Return 3 points if 1+ keyword found (strong evidence), 0 points otherwise
  - Return feature object with: score, keywordMatches (array), count
  - Reference: Design Section 1.1 (Feature 1: Code Keywords)
  - _Requirements: 2, 7_

- [x]* 2.2 Write unit tests for code keywords feature
  - Test with JavaScript code containing function, const, return (expect 3 points)
  - Test with Python code containing def, import, return (expect 3 points)
  - Test with English prose (expect 0 points, no keyword matches)
  - Test boundary cases: empty string, single keyword, multiple keywords
  - _Requirements: 13, 14_

---

### 3. Implement Feature 2 — Import/Require Statements (Strong Evidence)

- [x] 3.1 Implement `detectImportStatements(text)` function
  - Create language-specific import patterns: JavaScript (import, require, export), Python (import, from...import), Java/C# (import, using, namespace), C/C++ (#include, #import), Go (import), Rust (use, mod), PHP (require, include)
  - Count import statement matches using regex patterns
  - Return 3 points if 1+ import found (strong evidence), 0 points otherwise
  - Return feature object with: score, importMatches (array), languages detected
  - Reference: Design Section 1.2 (Feature 2: Import/Require Statements)
  - _Requirements: 3, 7_

- [x]* 3.2 Write unit tests for import statements feature
  - Test with JavaScript import/require (expect 3 points)
  - Test with Python import statements (expect 3 points)
  - Test with Java import statements (expect 3 points)
  - Test with English prose (expect 0 points, no import matches)
  - Test edge cases: malformed imports, comments containing import keyword
  - _Requirements: 13, 14_

---

### 4. Implement Feature 3 — Braces (Strong Evidence)

- [x] 4.1 Implement `detectBraces(text)` function
  - Count opening and closing curly braces: {, }
  - Compute brace density: (totalBraces / textLength)
  - Return 2 points if braceDensity ≥ 0.03 OR totalBraces ≥ 2 (strong evidence), 0 points otherwise
  - Return feature object with: score, openBraces, closeBraces, density
  - Reference: Design Section 1.3 (Feature 3: Braces)
  - _Requirements: 7_

- [x]* 4.2 Write unit tests for braces feature
  - Test with JavaScript function with multiple braces (expect 2 points)
  - Test with code containing single pair of braces (expect 2 points)
  - Test with prose (expect 0 points, no braces)
  - Test with edge cases: mismatched braces, braces in strings
  - _Requirements: 13, 14_

---

### 5. Implement Feature 4 — Function Calls (Strong Evidence)

- [x] 5.1 Implement `detectFunctionCalls(text)` function
  - Define patterns for function/method invocation: identifier(...), obj.method(...), builtin objects (console.log, window.alert, etc.)
  - Count matches using regex: /\b[a-zA-Z_$][\w$]*\s*\(/ and /\b[a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*\s*\(/
  - Return 2 points if 2+ function calls found (strong evidence), 1 point if 1 call (weak evidence), 0 points otherwise
  - Return feature object with: score, functionCallMatches (array), count
  - Reference: Design Section 1.4 (Feature 4: Function Calls)
  - _Requirements: 4, 7_

- [x]* 5.2 Write unit tests for function calls feature
  - Test with code containing multiple function calls (expect 2 points)
  - Test with code containing single function call (expect 1 point)
  - Test with prose (expect 0 points, no function calls)
  - Test edge cases: method chaining, builtin object calls, parentheses in prose
  - _Requirements: 13, 14_

---

### 6. Implement Features 5–10 — Weak Evidence Features (1 point each)

- [x] 6.1 Implement `detectSemicolons(text)` function
  - Count semicolon occurrences (;)
  - Return 1 point if 1+ semicolon found (weak evidence), 0 points otherwise
  - Return feature object with: score, semicolonCount
  - Reference: Design Section 1.2 (Feature 5: Semicolons)
  - _Requirements: 7_

- [x] 6.2 Implement `detectOperators(text)` function
  - Define operator patterns: arithmetic (+, -, *, /, %), logical (&&, ||, !), bitwise (&, |, ^), assignment (=, +=, -=, etc.)
  - Count operator matches using regex: /(\+\+|--|\*\*|&&|\|\||<<|>>|===|!==|[+\-*\/%&|^!=<>]=|[+\-*\/%&|^<>!~])/g
  - Return 1 point if 1+ operator found (weak evidence), 0 points otherwise
  - Return feature object with: score, operatorCount, operatorTypes
  - Reference: Design Section 1.2 (Feature 6: Operators)
  - _Requirements: 7_

- [x] 6.3 Implement `detectCodingNamingConventions(text)` function
  - Define patterns for camelCase (/\b[a-z]+([A-Z][a-z]+)+\b/) and snake_case (/\b[a-z_]+_[a-z_]+\b/)
  - Count total matches for both patterns
  - Return 1 point if 2+ naming convention matches found (weak evidence), 0 points otherwise
  - Return feature object with: score, camelCaseMatches, snake_caseMatches
  - Reference: Design Section 1.2 (Feature 7: camelCase/snake_case)
  - _Requirements: 7_

- [x] 6.4 Implement `detectComments(text)` function
  - Define comment patterns: //, #, --, /*, */, """, ''', <!--
  - Count comment marker matches
  - Return 1 point if 1+ comment marker found (weak evidence), 0 points otherwise
  - Return feature object with: score, commentCount, commentTypes
  - Reference: Design Section 1.2 (Feature 8: Comments)
  - _Requirements: 7_

- [x] 6.5 Implement `detectIndentationPattern(text)` function
  - Count lines starting with 4+ spaces or tabs
  - Compute indentation ratio: indentedLines / totalLines
  - Return 1 point if indentationRatio ≥ 0.2 (weak evidence), 0 points otherwise
  - Return feature object with: score, indentedLineCount, ratio
  - Reference: Design Section 1.2 (Feature 9: Indentation)
  - _Requirements: 7_

- [x] 6.6 Implement `detectLineDensity(text)` function
  - Compute average characters per line
  - Return 1 point if 30 ≤ avgCharsPerLine ≤ 150 AND 3+ lines (weak evidence), 0 points otherwise
  - Return feature object with: score, avgCharsPerLine, lineCount
  - Reference: Design Section 1.2 (Feature 10: Line Density)
  - _Requirements: 7_

- [x]* 6.7 Write unit tests for weak evidence features
  - Test detectSemicolons with JavaScript (expect 1 point)
  - Test detectOperators with code (expect 1 point)
  - Test detectCodingNamingConventions with camelCase code (expect 1 point)
  - Test detectComments with code containing comments (expect 1 point)
  - Test detectIndentationPattern with indented code (expect 1 point)
  - Test detectLineDensity with code-like line lengths (expect 1 point)
  - Test all with English prose (expect 0 points)
  - _Requirements: 13, 14_

---

### 7. Implement Composite Feature Scoring Algorithm

- [x] 7.1 Implement `computeSourceCodeScore(text)` main algorithm
  - Call all 10 feature detection functions: detectCodeKeywords, detectImportStatements, detectBraces, detectFunctionCalls, detectSemicolons, detectOperators, detectCodingNamingConventions, detectComments, detectIndentationPattern, detectLineDensity
  - Compute total score: sum of all feature points (max 3+3+2+2+1+1+1+1+1+1 = 16)
  - Determine strong_evidence_present: true if (code_keywords > 0 OR imports > 0 OR braces > 0 OR function_calls ≥ 2)
  - Apply dual threshold classification rule:
    - IF (total_score ≥ 6) AND (strong_evidence_present = true) THEN classification = "code"
    - ELSE classification = "prose"
  - Return score object with: classification, score, strong_evidence, reason, features object
  - Reference: Design Section 1.3 (Composite Feature Scoring Algorithm)
  - _Requirements: 7, 9_

- [x]* 7.2 Write unit tests for composite scoring algorithm
  - Test with JavaScript code (expect score ≥ 6 + strong evidence = "code" classification)
  - Test with prose containing high weak feature scores (expect classification = "prose" due to no strong evidence)
  - Test with score = 8 but no strong evidence (expect "prose")
  - Test with score = 4 + strong evidence (expect "prose" due to low score)
  - Test edge cases: empty string, single keyword, minimum threshold crossing
  - _Requirements: 13, 14_

---

### 8. Implement Threshold Calibration and Configuration

- [x] 8.1 Create CODE_DETECTION_CONFIG object
  - Define `enableSourceCodeDetection: true`
  - Define `scoreThreshold: 6` (configurable, dual threshold with strong evidence requirement)
  - Define `requireStrongEvidence: true`
  - Define feature-specific configuration: each feature has {enabled, strong (boolean), points}
  - Define credential escalation patterns: API keys, JWT, passwords, connection strings, private keys, AWS keys, GitHub tokens
  - Define risk escalation thresholds: credentialFound escalates to "moderate", credentialAndCode escalates to "high"
  - Define logging flags: logScores, verbosity
  - Reference: Design Section 1.4
  - _Requirements: 8, 15_

- [x] 8.2 Implement `updateCodeDetectionConfig(newConfig)` function
  - Accept partial config update object
  - Merge with existing CODE_DETECTION_CONFIG
  - Log updated values
  - Validate threshold ranges (1–16 for score, boolean for requireStrongEvidence)
  - Reference: Design Section 1.4
  - _Requirements: 8, 15_

- [x]* 8.3 Write tests for configuration management
  - Test config update with valid parameters
  - Test config merge (partial updates)
  - Test threshold validation (reject invalid ranges)
  - _Requirements: 8_

---

### 9. Implement Risk Escalation Logic

- [x] 9.1 Implement `evaluateCodeRiskEscalation(scoreObj, baseRisk)` function
  - Extract features object from scoreObj
  - Check if credential patterns detected (credentialIndicators feature, if present in feature set)
  - If credentials detected AND code classification, escalate LOW → MODERATE or HIGH based on credential severity
  - If code block contains API key/JWT patterns, escalate to HIGH
  - If code block without credentials, maintain base risk (LOW)
  - Log escalation decision with reason and pattern detected
  - Return escalated risk level
  - Reference: Design Section 2.2 (Credential Escalation Logic)
  - _Requirements: 10, 12_

- [x]* 9.2 Write tests for risk escalation
  - Test escalation from LOW → MODERATE with credentials detected
  - Test escalation from LOW → HIGH with critical credentials (API keys, JWT)
  - Test no escalation for code without credentials (maintain LOW)
  - Test log message format and detail
  - _Requirements: 10, 12_

---

### 10. Implement Context-Aware Detection

- [x] 10.1 Implement `isCodeContextual(text, normalizedFullText, matchIndex)` function
  - Extract 100 characters before and after match
  - Define context trigger phrases: "here is", "like this", "code:", "function:", "example:", etc.
  - Search for trigger phrases in lookahead/lookbehind windows
  - Return boolean indicating if context suggests intentional code sharing
  - Reference: Design Section 6
  - _Requirements: 10_

- [x] 10.2 Implement context-aware risk elevation
  - When context is positive (trigger phrases present), increase risk from LOW → MODERATE
  - Log context detection result
  - Reference: Requirements 10
  - _Requirements: 10_

- [x]* 10.3 Write tests for context-aware detection
  - Test with code + trigger phrase (expect elevated risk)
  - Test with code + no trigger phrase (expect base risk)
  - Test with multiple trigger phrases
  - _Requirements: 10_

---

### 11. Implement Logging and Diagnostics Framework

- [x] 11.1 Implement `logCodeDetection(scoreObj, findings)` function
  - Check CODE_DETECTION_CONFIG.logScores flag
  - Log composite score with timestamp
  - If verbosity enabled, log feature detection results: each feature (name, score, threshold, pass/fail)
  - Log strong evidence presence (YES/NO) and list strong features detected
  - Log classification result (CODE or PROSE) and reason
  - If risk escalation occurred, log escalation details
  - Use verbosity level (info, debug) to control output detail
  - Reference: Design Section 3 (Logging and Diagnostics)
  - _Requirements: 16_

- [x] 11.2 Implement diagnostic output formatting
  - Format: [TrustPrompt/CodeDetection] Feature: name score/max (threshold: X) [✓ PASS / ✗ FAIL]
  - Include strong evidence section: "Strong Evidence: CODE_KEYWORDS (3 pts), IMPORTS (3 pts)"
  - Include total score and threshold comparison
  - Example: "[TrustPrompt/CodeDetection] Total Score: 10 (threshold: 6) | Strong Evidence: YES | Classification: CODE"
  - Reference: Design Section 3 (Example Output)
  - _Requirements: 16_

- [x]* 11.3 Write tests for logging and diagnostics
  - Test log output format with code block
  - Test verbosity level filtering (debug vs info)
  - Test with logScores disabled (expect no output)
  - Test escalation logging format
  - _Requirements: 16_

---

### 12. Integrate into Scanner.js PATH A

- [x] 12.1 Update runPathA() to apply multi-feature scoring for source_code pattern
  - When pattern.id === "source_code", apply multi-feature scoring via computeSourceCodeScore()
  - Compute all 10 features for matched code block
  - Aggregate into total score and check dual threshold (score ≥ 6 AND strong_evidence_present)
  - If classification = "prose" (below threshold or no strong evidence), skip finding
  - If classification = "code" (meets dual threshold), proceed to finding creation
  - Create finding object with enhanced codeMetrics field including all feature scores
  - Reference: Design Section 2.1 (Integration), Requirements 9, 11
  - _Requirements: 9, 11, 17_

- [x] 12.2 Implement unformatted code block extraction
  - When multi-feature scoring triggers (classification = "code"), extract code block boundaries
  - Start: first line with code characteristics (keywords OR imports OR braces OR function calls)
  - End: last consecutive line with code characteristics
  - Maximum 20 lines per block (avoid capturing entire documents)
  - Preserve original indentation and line breaks
  - Extract raw matched text for finding.rawMatch field
  - Reference: Requirements 11
  - _Requirements: 11_

- [x] 12.3 Apply embedded credential detection within code blocks
  - After detecting code block via multi-feature scoring, scan block for credential patterns
  - Credential patterns: API keys, JWT tokens, passwords, connection strings, private keys, AWS keys, GitHub tokens
  - If credential found, escalate risk from LOW → MODERATE or HIGH (depending on credential type)
  - Mark finding with escalation reason and credential type
  - Log detection: "[TrustPrompt/code] code block + [credential_type] detected → [ESCALATED_RISK]"
  - Reference: Requirements 12
  - _Requirements: 12_

- [x]* 12.4 Write integration tests for PATH A + multi-feature
  - Mock text with unformatted JavaScript code (expect detection + code classification)
  - Mock text with Python code (expect detection + code classification)
  - Mock text with English prose (expect rejection, classification = "prose")
  - Mock text with code containing API key (expect detection + HIGH risk escalation)
  - Test with mixed markdown and unformatted code (expect both detected)
  - Test deduplication if same block matches both markdown and multi-feature
  - _Requirements: 9, 11, 12, 17_

---

### 13. Implement Markdown Regex Fallback and Deduplication

- [~] 13.1 Ensure markdown pattern continues to work
  - Keep existing source_code pattern: /```[\s\S]*?```|`[^`\n]{10,}`|^[ \t]{4,}.{1,}(?:\n[ \t]{4,}.+)*/gm
  - Pattern matches: triple-backtick fences, inline code, indented blocks
  - Multi-feature scoring should complement, not replace, markdown matching
  - Reference: Design Section 2 (Integration), Requirement 9
  - _Requirements: 9, 17_

- [~] 13.2 Implement deduplication logic
  - When both markdown regex and multi-signal score detect same code block
  - Merge findings: keep one entry, prefer multi-signal match (contains more metadata)
  - Log deduplication: "[TrustPrompt/code] Deduplicated: markdown + multi-signal → 1 finding"
  - Reference: Requirements 9
  - _Requirements: 9_

- [ ]* 13.3 Write tests for markdown and deduplication
  - Test markdown fence detection (should still work)
  - Test inline code detection (should still work)
  - Test indented code detection
  - Test deduplication (same block matched both ways)
  - _Requirements: 9, 17_

---

### 14. Performance Testing and Optimization

- [~] 14.1 Measure baseline performance of feature computations
  - Profile each feature function with 100 iterations (500-char blocks)
  - Record per-feature execution time
  - Target: each feature < 0.5ms, total < 5ms per block
  - Reference: Requirements 13, Design Section 7 (Performance Optimization)
  - _Requirements: 13_

- [~] 14.2 Optimize feature computation if needed
  - Use pre-compiled regex patterns (cache at module load time)
  - Implement lazy evaluation: compute expensive features only if needed
  - Implement early exit: if composite score falls below threshold mid-way, stop
  - For very large blocks (>1000 chars), implement sampling strategy
  - Reference: Design Section 7
  - _Requirements: 13_

- [ ]* 14.3 Write performance benchmarks
  - Benchmark 100 source_code pattern matches
  - Measure multi-feature scoring latency per block
  - Measure total PATH A latency overhead
  - Verify target met: < 5% overhead vs baseline
  - _Requirements: 13_

---

### 15. Create Test Dataset and Calibration

- [~] 15.1 Create positive test samples (code blocks)
  - Generate 20+ valid JavaScript code samples
  - Generate 10+ valid Python code samples
  - Generate 10+ valid SQL code samples
  - Generate 5+ valid Shell/Bash code samples
  - Include formatted (markdown) and unformatted variants
  - Reference: Requirements 14, 13 (test coverage)
  - _Requirements: 14_

- [~] 15.2 Create negative test samples (prose)
  - Generate 20+ English prose samples (paragraphs, documentation)
  - Generate 10+ technical documentation samples (may contain code-like punctuation)
  - Generate 10+ configuration file samples (YAML, JSON, TOML)
  - Include edge cases (mixed code/prose, unusual formatting)
  - Reference: Requirements 14, 13
  - _Requirements: 14_

- [~] 15.3 Calibrate threshold and weights
  - Run test suite against all samples
  - Compute True Positive Rate (TPR): detect code blocks correctly
  - Compute True Negative Rate (TNR): reject prose correctly
  - Compute False Positive Rate: prose incorrectly flagged as code
  - Compute False Negative Rate: code blocks missed
  - Adjust CODE_DETECTION_CONFIG thresholds/weights to meet targets
  - Target: TPR ≥ 90%, TNR ≥ 85%, FPR ≤ 15%
  - Reference: Requirements 14, 8
  - _Requirements: 8, 14_

- [ ]* 15.4 Write calibration test suite
  - Automate testing against positive/negative samples
  - Compute accuracy metrics (TPR, TNR, FPR, FNR)
  - Log results to calibration report
  - Identify edge cases and document known limitations
  - _Requirements: 14_

---

### 16. Checkpoint — Ensure All Tests Pass

- [~] 16.1 Run full test suite
  - Verify all unit tests pass (10 feature functions)
  - Verify all integration tests pass (PATH A + multi-feature)
  - Verify all performance benchmarks met
  - Verify calibration accuracy targets met (TPR/TNR)
  - Verify no regressions in existing scanner tests
  - Checkpoint: Ensure all tests pass, ask the user if questions arise.

---

### 17. Documentation and Finalization

- [~] 17.1 Add inline documentation to scanner.js
  - Document multi-feature scoring framework (how and why)
  - Document each of 10 feature detection functions (parameters, return value, interpretation)
  - Document dual threshold classification rule (score ≥ 6 AND strong_evidence required)
  - Document configuration parameters and tuning recommendations
  - Add links to design document and requirements
  - Reference: Requirements 18, 16
  - _Requirements: 18, 16_

- [~] 17.2 Create diagnostic examples in comments
  - Include example input: JavaScript function
  - Show expected feature scores for each of 10 features
  - Show strong evidence detection (keywords, imports, braces, function calls)
  - Show final score calculation (sum of features)
  - Show dual threshold evaluation and classification result
  - Reference: Design Section 3 (Example Output)
  - _Requirements: 18, 16_

- [ ]* 17.3 Create QA validation checklist
  - Verify code detection on representative samples
  - Verify credential escalation works
  - Verify threshold tuning meets accuracy targets
  - Verify logging output format
  - Verify performance baseline met
  - _Requirements: 13, 14_

---

## Notes

- All 10 feature computation functions are independent; they can be computed in parallel if performance requires
- Strong evidence features (keywords, imports, braces, function calls ≥2) are critical for dual threshold validation
- Weak evidence features (semicolons, operators, naming, comments, indentation, line density) provide supporting signals
- Configuration is module-level constants in scanner.js (CODE_DETECTION_CONFIG); can be updated at runtime
- Logging respects CODE_DETECTION_CONFIG.verbosity; avoid noise in production
- Threshold default scoreThreshold: 6 is calibrated via test suite; may need tuning based on production false positive rate
- Dual threshold rule: MUST have score ≥ 6 AND strong_evidence to classify as code
- Credential escalation is critical for governance integration; HIGH-risk code blocks participate in risk scoring
- Performance target < 5ms per block ensures scanner latency remains acceptable for typical documents
- Integration maintains backward compatibility with existing markdown regex and other PATH A patterns
- Multi-feature scoring is opt-in via CODE_DETECTION_CONFIG.enableSourceCodeDetection flag

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "3.1", "4.1", "5.1", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "5.2", "6.7", "7.1"] },
    { "id": 3, "tasks": ["7.2", "8.1", "8.2", "9.1", "10.1", "10.2", "11.1", "11.2"] },
    { "id": 4, "tasks": ["8.3", "9.2", "10.3", "11.3"] },
    { "id": 5, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 6, "tasks": ["12.4", "13.1", "13.2"] },
    { "id": 7, "tasks": ["13.3", "14.1", "14.2"] },
    { "id": 8, "tasks": ["14.3", "15.1", "15.2", "15.3"] },
    { "id": 9, "tasks": ["15.4", "16.1"] },
    { "id": 10, "tasks": ["17.1", "17.2"] },
    { "id": 11, "tasks": ["17.3"] }
  ]
}
```

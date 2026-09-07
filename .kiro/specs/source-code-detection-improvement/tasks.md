# Implementation Plan: Source Code Detection Improvement

## Overview

Implement a multi-signal scoring framework that improves source code detection through five independent signals (structure density, token pattern, entropy distribution, credential indicators, markup consistency). This feature detects unformatted code blocks, distinguishes code from prose with higher accuracy, and escalates risk when credentials are detected. The framework is configurable, logged, and integrates seamlessly with the existing scanner.js PATH A pipeline.

---

## Tasks

### 1. Set Up Signal Computation Infrastructure

- [ ] 1.1 Create shared utilities for signal computation
  - Implement `shannonEntropy(text)` — compute entropy in bits/char (if not already present)
  - Implement `extractWordsFromText(text)` — tokenize text for keyword matching
  - Implement `countLineIndentation(text)` — analyze indentation patterns
  - Add helper: `normalizeRegexPattern(pattern)` — pre-compile and cache regex patterns
  - Add to `scanner.js` or new `code-detector.js` module
  - _Requirements: 1, 7_

- [ ] 1.2 Define signal computation constants and configuration
  - Create `CODE_DETECTION_CONFIG` object with thresholds, weights, logging flags
  - Define language-specific keyword sets (JavaScript, Python, Java, SQL, Shell, JSON, XML/HTML)
  - Define credential pattern collection (API key, JWT, passwords, connection strings, etc.)
  - Define comment marker patterns per language
  - Add to `scanner.js`
  - _Requirements: 1, 15_

- [ ]* 1.3 Write unit tests for shared utilities
  - Test `shannonEntropy()` with known values (uniform string H=0, random H≈2.0)
  - Test `extractWordsFromText()` with various punctuation
  - Test `countLineIndentation()` with tabs, spaces, mixed indentation
  - _Requirements: 13_

---

### 2. Implement Signal 1 — Structure Density

- [ ] 2.1 Implement `computeStructureDensity(text)` function
  - Count opening/closing brackets: (), {}, [], <>
  - Count code-specific punctuation: :, ;, comma, =, arrow, /
  - Compute bracket density: bracket_count / total_chars
  - Compute punctuation density: punctuation_count / total_chars
  - Normalize to 0.0–1.0 signal value
  - Return signal object with components: bracketDensity, punctuationDensity, counts
  - Reference: Design Section 1 (Signal 1)
  - _Requirements: 2, 7_

- [ ]* 2.2 Write unit tests for structure density signal
  - Test with JavaScript function (expect high density ~0.18)
  - Test with English prose (expect low density ~0.02)
  - Test with pseudo-code and mixed punctuation
  - Test boundary cases (empty string, single character)
  - _Requirements: 13, 14_

---

### 3. Implement Signal 2 — Token Pattern Recognition

- [ ] 3.1 Implement language pattern detection objects
  - Create LANGUAGE_PATTERNS object with JavaScript, Python, SQL, Shell, JSON, XML/HTML entries
  - Each entry: weight (language prevalence factor) + array of regex patterns (keywords, syntax)
  - Include control flow, declarations, type keywords, module/import, common objects
  - Reference: Design Section 1 (Signal 2)
  - _Requirements: 3, 7_

- [ ] 3.2 Implement `computeTokenPattern(text)` function
  - Iterate through LANGUAGE_PATTERNS
  - For each language, count keyword pattern matches
  - Compute score: (matches / line_count) * language_weight
  - Normalize to 0.0–1.0 signal value
  - Return signal object with detectedLanguage and langScores components
  - Reference: Design Section 1 (Signal 2)
  - _Requirements: 3, 7_

- [ ]* 3.3 Write unit tests for token pattern signal
  - Test with JavaScript code (expect language detection + high score ~0.68)
  - Test with Python code (expect Python detection)
  - Test with SQL query (expect SQL detection)
  - Test with English prose (expect low scores for all languages)
  - _Requirements: 13, 14_

---

### 4. Implement Signal 3 — Entropy Distribution

- [ ] 4.1 Implement `computeEntropyDistribution(text)` function
  - Compute Shannon entropy for entire text (using existing shannonEntropy utility)
  - Split into lines, compute entropy for each line
  - Calculate median line entropy (sort and pick middle value)
  - Combine full entropy + median line entropy into composite score
  - Normalize to 0.0–1.0 signal value using formula: (entropy - 3.0) / 2.5 clamped to [0, 1]
  - Return signal object with fullEntropy, medianLineEntropy, lineCount
  - Reference: Design Section 1 (Signal 3)
  - _Requirements: 7_

- [ ]* 4.2 Write unit tests for entropy distribution signal
  - Test with code (expect entropy 3.5–5.5 bits/char)
  - Test with prose (expect entropy 4.0–5.0 bits/char)
  - Test with repeated patterns (expect low entropy)
  - Test with random/encrypted data (expect high entropy)
  - _Requirements: 13, 14_

---

### 5. Implement Signal 4 — Credential Indicators

- [ ] 5.1 Create credential detection pattern collection
  - API key patterns: api_key=..., secret=..., secret_key=..., api_secret=...
  - Environment variables: ${API_KEY}, ${SECRET}, etc.
  - Connection strings: mongodb://, postgresql://, mysql://, redis://, etc.
  - AWS keys: AKIA[A-Z0-9]{16}
  - GitHub tokens: ghp_*, gho_*, github_pat_*
  - OpenAI keys: sk-[A-Za-z0-9]{20,}
  - JWT patterns: eyJ[A-Za-z0-9-_]*.eyJ[A-Za-z0-9-_]*.eyJ[A-Za-z0-9-_]*
  - Base64 data: [A-Za-z0-9+/]{40,}
  - Private keys: -----BEGIN.*PRIVATE KEY-----
  - URLs with embedded credentials: https://user:pass@host
  - Reference: Design Section 1 (Signal 4)
  - _Requirements: 4, 7_

- [ ] 5.2 Implement `computeCredentialIndicators(text)` function
  - Iterate through credential patterns
  - Count total matches across all patterns
  - Normalize to 0.0–1.0 signal value: min(1.0, credentialCount * 0.33)
  - Return signal object with credentialCount, patterns array
  - Reference: Design Section 1 (Signal 4)
  - _Requirements: 4, 7_

- [ ]* 5.3 Write unit tests for credential indicators signal
  - Test with code containing API key (expect high score ~0.5+)
  - Test with code containing JWT (expect high score)
  - Test with connection string (expect signal detection)
  - Test with prose containing "password" (expect no matches)
  - _Requirements: 13, 14_

---

### 6. Implement Signal 5 — Markup and Formatting Consistency

- [ ] 6.1 Implement `computeMarkupConsistency(text)` function
  - Count code-block markers: backtick fences (```), tilde indents (~~~), HTML tags (<code>, <pre>)
  - Count HTML escapes: &lt;, &gt;, &amp;, &quot;
  - Analyze indentation: count indented lines, compute indentation_ratio
  - Analyze monospace hints: count lines with 2+ consecutive spaces
  - Compute markup score using weighted formula (0.3 backticks + 0.3 tildes + 0.2 HTML + 0.1 escapes + 0.1 indent + 0.1 monospace)
  - Normalize to 0.0–1.0 signal value
  - Return signal object with component breakdowns
  - Reference: Design Section 1 (Signal 5)
  - _Requirements: 7_

- [ ]* 6.2 Write unit tests for markup consistency signal
  - Test with markdown fenced code (expect high score ~0.8+)
  - Test with indented code (expect moderate score)
  - Test with HTML-escaped code (expect high score)
  - Test with plain prose (expect low score)
  - _Requirements: 13, 14_

---

### 7. Implement Score Aggregation

- [ ] 7.1 Implement `aggregateSignals(signals)` function
  - Define SIGNAL_WEIGHTS object: structure_density 0.15, token_pattern 0.30, entropy 0.20, credential 0.25, markup 0.10
  - Compute weighted sum: Σ(signal.value × weight)
  - Normalize by sum of weights
  - Return object with: compositeScore, normalizedScore (0–100), signals array with weights
  - Reference: Design Section 2
  - _Requirements: 7_

- [ ]* 7.2 Write unit tests for score aggregation
  - Test with code signals (expect composite > 0.50)
  - Test with prose signals (expect composite < 0.50)
  - Test weight distribution and normalization
  - Verify total weights sum correctly
  - _Requirements: 13, 14_

---

### 8. Implement Threshold Calibration and Configuration

- [ ] 8.1 Create CODE_DETECTION_CONFIG object
  - Define `enableSourceCodeDetection: true`
  - Define `codeScoreThreshold: 0.50` (configurable)
  - Define `credentialEscalationThreshold: 0.35`
  - Define signal-specific configuration (thresholds, weights, enabled flags)
  - Define logging flags: logScores, logSignalDetails, logEscalations, verbosity
  - Reference: Design Section 3
  - _Requirements: 8, 15_

- [ ] 8.2 Implement `updateCodeDetectionConfig(newConfig)` function
  - Accept partial config update object
  - Merge with existing CODE_DETECTION_CONFIG
  - Log updated values
  - Validate threshold ranges (0–1.0)
  - Reference: Design Section 3
  - _Requirements: 8, 15_

- [ ]* 8.3 Write tests for configuration management
  - Test config update with valid parameters
  - Test config merge (partial updates)
  - Test threshold validation (reject invalid ranges)
  - _Requirements: 8_

---

### 9. Implement Risk Escalation Logic

- [ ] 9.1 Implement `evaluateCodeRiskEscalation(signals, baseRisk)` function
  - Extract credential_indicators signal from signals array
  - If credentialSignal > credentialEscalationThreshold, escalate LOW → MODERATE
  - If credentialSignal > 0.35 AND compositeScore > 0.50, escalate to HIGH
  - If code contains API key/JWT patterns, finding already HIGH (maintained)
  - Log escalation decision with reason
  - Return escalated risk level
  - Reference: Design Section 4
  - _Requirements: 10, 12_

- [ ]* 9.2 Write tests for risk escalation
  - Test escalation from LOW → MODERATE with credentials
  - Test escalation from LOW → HIGH with high credential signals
  - Test log message format
  - _Requirements: 10, 12_

---

### 10. Implement Context-Aware Detection

- [ ] 10.1 Implement `isCodeContextual(text, normalizedFullText, matchIndex)` function
  - Extract 100 characters before and after match
  - Define context trigger phrases: "here is", "like this", "code:", "function:", "example:", etc.
  - Search for trigger phrases in lookahead/lookbehind windows
  - Return boolean indicating if context suggests intentional code sharing
  - Reference: Design Section 6
  - _Requirements: 10_

- [ ] 10.2 Implement context-aware risk elevation
  - When context is positive (trigger phrases present), increase risk from LOW → MODERATE
  - Log context detection result
  - Reference: Requirements 10
  - _Requirements: 10_

- [ ]* 10.3 Write tests for context-aware detection
  - Test with code + trigger phrase (expect elevated risk)
  - Test with code + no trigger phrase (expect base risk)
  - Test with multiple trigger phrases
  - _Requirements: 10_

---

### 11. Implement Logging and Diagnostics Framework

- [ ] 11.1 Implement `logCodeDetection(findings, signals, compositeScore)` function
  - Check CODE_DETECTION_CONFIG.logScores flag
  - Log composite score with timestamp
  - If logSignalDetails enabled, log each signal (name, value, weight, threshold)
  - If logEscalations enabled, log any risk elevations with reasons
  - Use verbosity level (debug, info, warn, error) to control output
  - Reference: Design Section 7
  - _Requirements: 16_

- [ ] 11.2 Implement diagnostic output formatting
  - Format: [TrustPrompt/CodeDetection] Signal: value (threshold: X)
  - Include component breakdowns where relevant
  - Include pass/fail indicators (✓ PASS / ✗ FAIL)
  - Reference: Design Section 7.2 (example output)
  - _Requirements: 16_

- [ ]* 11.3 Write tests for logging and diagnostics
  - Test log output format
  - Test verbosity level filtering (debug > info > warn > error)
  - Test with logScores disabled (expect no output)
  - _Requirements: 16_

---

### 12. Integrate into Scanner.js PATH A

- [ ] 12.1 Update runPathA() to apply multi-signal scoring for source_code pattern
  - When pattern.id === "source_code", apply multi-signal scoring before creating finding
  - Compute all 5 signals using helper functions
  - Aggregate signals into composite score
  - Compare composite score against CODE_DETECTION_CONFIG.codeScoreThreshold
  - If below threshold, skip (discard low-confidence match)
  - If above threshold, proceed to finding creation
  - Reference: Design Section 5.1, Requirements 9, 11
  - _Requirements: 9, 11, 17_

- [ ] 12.2 Implement unformatted code block extraction
  - When multi-signal scoring triggers (score ≥ threshold), extract code block boundaries
  - Start: first line with code-like characteristics (indentation + keyword/brace)
  - End: last consecutive line with code-like characteristics
  - Maximum 20 lines per block (avoid capturing entire documents)
  - Preserve original indentation and line breaks
  - Reference: Requirements 11
  - _Requirements: 11_

- [ ] 12.3 Apply embedded credential detection within code blocks
  - After detecting code block via multi-signal, scan block for PATH A credential patterns
  - If API key, JWT, or password found, escalate risk from LOW → HIGH
  - Mark finding with escalation reason
  - Log detection: "[TrustPrompt/code] code block + [credential_type] detected → HIGH risk"
  - Reference: Requirements 12
  - _Requirements: 12_

- [ ]* 12.4 Write integration tests for PATH A + multi-signal
  - Mock text with unformatted JavaScript code (expect detection)
  - Mock text with Python code (expect language detection)
  - Mock text with English prose (expect rejection, score < threshold)
  - Mock text with code containing credentials (expect escalation)
  - Test with various markdown formats (should still work)
  - _Requirements: 9, 11, 12, 17_

---

### 13. Implement Markdown Regex Fallback and Deduplication

- [ ] 13.1 Ensure markdown pattern continues to work
  - Keep existing source_code pattern: /```[\s\S]*?```|`[^`\n]{10,}`|^[ \t]{4,}.{1,}(?:\n[ \t]{4,}.+)*/gm
  - Pattern matches: triple-backtick fences, inline code, indented blocks
  - Multi-signal scoring should complement, not replace, markdown matching
  - Reference: Design Section 5.2, Requirement 9
  - _Requirements: 9, 17_

- [ ] 13.2 Implement deduplication logic
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

- [ ] 14.1 Measure baseline performance of signal computations
  - Profile each signal function with 100 iterations (500-char blocks)
  - Record per-signal execution time
  - Target: each signal < 0.5ms, total < 2ms per block
  - Reference: Requirements 13, Requirement 13 (5ms per block)
  - _Requirements: 13_

- [ ] 14.2 Optimize signal computation if needed
  - Use pre-compiled regex patterns (cache at module load time)
  - Implement lazy evaluation: compute expensive signals only if needed
  - Implement early exit: if composite score falls below threshold mid-way, stop
  - For very large blocks (>1000 chars), implement sampling strategy
  - Reference: Design Section 11
  - _Requirements: 13_

- [ ]* 14.3 Write performance benchmarks
  - Benchmark 100 source_code pattern matches
  - Measure multi-signal scoring latency per block
  - Measure total PATH A latency overhead
  - Verify target met: < 5% overhead vs baseline
  - _Requirements: 13_

---

### 15. Create Test Dataset and Calibration

- [ ] 15.1 Create positive test samples (code blocks)
  - Generate 20+ valid JavaScript code samples
  - Generate 10+ valid Python code samples
  - Generate 10+ valid SQL code samples
  - Generate 5+ valid Shell/Bash code samples
  - Include formatted (markdown) and unformatted variants
  - Reference: Requirements 14, 13 (test coverage)
  - _Requirements: 14_

- [ ] 15.2 Create negative test samples (prose)
  - Generate 20+ English prose samples (paragraphs, documentation)
  - Generate 10+ technical documentation samples (may contain code-like punctuation)
  - Generate 10+ configuration file samples (YAML, JSON, TOML)
  - Include edge cases (mixed code/prose, unusual formatting)
  - Reference: Requirements 14, 13
  - _Requirements: 14_

- [ ] 15.3 Calibrate threshold and weights
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

- [ ] 16.1 Run full test suite
  - Verify all unit tests pass (5 signal functions)
  - Verify all integration tests pass (PATH A + multi-signal)
  - Verify all performance benchmarks met
  - Verify calibration accuracy targets met (TPR/TNR)
  - Verify no regressions in existing scanner tests
  - Checkpoint: Ensure all tests pass, ask the user if questions arise.

---

### 17. Documentation and Finalization

- [ ] 17.1 Add inline documentation to scanner.js
  - Document multi-signal scoring framework (how and why)
  - Document each signal computation function (parameters, return value, interpretation)
  - Document aggregation formula and weight reasoning
  - Document configuration parameters and tuning recommendations
  - Add links to design document and requirements
  - Reference: Requirements 18, 16
  - _Requirements: 18, 16_

- [ ] 17.2 Create diagnostic examples in comments
  - Include example input: JavaScript function
  - Show expected signal values for each signal
  - Show aggregation calculation
  - Show final score and classification
  - Reference: Design Section 7.2 (example output)
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

- All 5 signal computation functions are independent; they can be computed in parallel if performance requires
- Configuration is module-level constants in scanner.js (CODE_DETECTION_CONFIG); can be updated at runtime
- Logging respects CODE_DETECTION_CONFIG.verbosity; avoid noise in production
- Threshold default 0.50 is calibrated via test suite; may need tuning based on production false positive rate
- Credential escalation is critical for governance integration; HIGH-risk code blocks participate in risk scoring
- Performance target < 5ms per block ensures scanner latency remains acceptable for typical documents
- Integration maintains backward compatibility with existing markdown regex and other PATH A patterns
- Multi-signal scoring is opt-in via CODE_DETECTION_CONFIG.enableSourceCodeDetection flag

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "3.1", "3.2", "4.1", "5.1", "5.2", "6.1"] },
    { "id": 2, "tasks": ["2.2", "3.3", "4.2", "5.3", "6.2", "7.1"] },
    { "id": 3, "tasks": ["7.2", "8.1", "8.2", "9.1", "10.1", "10.2", "11.1", "11.2"] },
    { "id": 4, "tasks": ["8.3", "9.2", "10.3", "11.3"] },
    { "id": 5, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 6, "tasks": ["12.4", "13.1", "13.2"] },
    { "id": 7, "tasks": ["13.3", "14.1", "14.2"] },
    { "id": 8, "tasks": ["14.3", "15.1", "15.2", "15.3"] },
    { "id": 9, "tasks": ["15.4"] },
    { "id": 10, "tasks": ["17.1", "17.2"] },
    { "id": 11, "tasks": ["17.3"] }
  ]
}
```

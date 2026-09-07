# Source Code Detection Improvement Requirements

## Introduction

TrustPrompt currently detects source code blocks through a simple regex pattern (`source_code`) that matches markdown code fences (triple backticks) and inline code. However, code can be shared in unformatted plain text (e.g., JavaScript, Python, Java without markdown wrappers), and the current pattern fails to detect or distinguish it reliably.

This feature improves source code detection by implementing multi-signal scoring that analyzes code-specific linguistic and structural indicators within the text, independent of markdown formatting. The new approach detects code shared in plain text, distinguishes it from prose more accurately, and adjusts the risk assessment to reflect that code blocks may contain hardcoded credentials or proprietary logic.

The multi-signal scoring system combines five independent signals: brace density, language keywords, indentation patterns, import/require statements, and comment markers. Each signal contributes a weighted score to determine if a text block is likely source code.

## Glossary

- **System**: TrustPrompt (the browser extension that detects and redacts PII)
- **Source Code Block**: A contiguous text segment containing programming language syntax (e.g., JavaScript, Python, Java, C++)
- **Signal**: An individual indicator that suggests the presence of source code (e.g., brace density, keywords)
- **Multi-Signal Scoring**: An aggregation of weighted signals to compute a likelihood score that text is source code
- **Brace Density**: The ratio of opening/closing braces to total characters; high density suggests source code
- **Language Keyword**: Programming language-specific keywords (e.g., `function`, `class`, `def`, `import`, `var`, `const`, `let`)
- **Indentation Pattern**: Consistent whitespace-based indentation; source code typically has regular indentation, prose rarely does
- **Import/Require Statement**: Language-specific module loading syntax (e.g., `import`, `require`, `from`, `use`, `include`)
- **Comment Marker**: Language-specific comment syntax (e.g., `//`, `#`, `/*`, `--`, `<!--`)
- **Scoring Threshold**: The minimum multi-signal score required to classify a block as source code (determines sensitivity)
- **Risk Assessment**: The qualitative risk level (high / moderate / low) assigned to a detected source code block
- **RA 10173**: Philippine Data Privacy Act; classifies code containing credentials or proprietary logic as sensitive data
- **False Positive**: A prose text block incorrectly classified as source code
- **False Negative**: A source code block that is not detected by the system

## Requirements

### Requirement 1: Multi-Signal Scoring Framework

**User Story:** As a system architect, I want the source code detector to use multiple independent signals to classify text as code, so that detection is more accurate and robust across different code formats and writing styles.

#### Acceptance Criteria

1. THE System SHALL implement a multi-signal scoring function `computeCodeLikelyhood(text)` that aggregates five independent signals
2. EACH signal SHALL be computed independently and contribute to a cumulative likelihood score (0–100 scale)
3. THE System SHALL combine signals using weighted addition: `score = Σ(signal_i × weight_i)` where weights are predefined constants
4. THE System SHALL normalize the final score to a 0–100 scale (0 = definitely not code, 100 = definitely code)
5. THE System SHALL define a configurable threshold (default 50) above which text is classified as source code
6. WHEN the System encounters a text block, THE System SHALL compute the likelihood score before pattern-matching fallback (markdown regex)

### Requirement 2: Signal 1 — Brace Density

**User Story:** As a code detector, I want to measure the density of curly braces in text, so that I can detect code blocks that contain control structures, function definitions, or object literals.

#### Acceptance Criteria

1. WHEN analyzing a text block, THE System SHALL count opening braces `{` and closing braces `}` (not other bracket types)
2. THE System SHALL compute brace density as: `brace_count / (total_characters or 1)`, expressed as a ratio (0–1)
3. THE System SHALL define brace density thresholds:
   - Density ≥ 0.02 (1 brace per 50 characters): moderate evidence of code
   - Density ≥ 0.05 (1 brace per 20 characters): strong evidence of code
4. THE System SHALL assign brace density signal score:
   - 0 points if density < 0.02
   - 10 points if density 0.02–0.04 (moderate)
   - 20 points if density ≥ 0.05 (strong)
5. THE System SHALL count braces that appear in commented or string contexts (conservative approach; avoid reducing signal by stripping comments)

### Requirement 3: Signal 2 — Language Keywords

**User Story:** As a code detector, I want to identify programming language keywords common across multiple languages, so that I can detect code written in JavaScript, Python, Java, C, C++, PHP, Ruby, Go, Rust, and other common languages.

#### Acceptance Criteria

1. WHEN analyzing a text block, THE System SHALL search for language-specific keywords from a predefined keyword set
2. THE System SHALL define a comprehensive keyword list covering:
   - Control flow: `if`, `else`, `for`, `while`, `do`, `switch`, `case`, `break`, `continue`, `return`, `try`, `catch`, `finally`
   - Variable/Function declaration: `function`, `def`, `async`, `await`, `const`, `let`, `var`, `class`, `struct`, `interface`, `enum`
   - Type keywords: `int`, `string`, `bool`, `float`, `double`, `void`, `null`, `undefined`, `true`, `false`
   - Module/Import: `import`, `export`, `require`, `module`, `from`, `as`, `use`, `include`, `namespace`
   - Common methods/objects: `console`, `document`, `window`, `this`, `self`, `super`, `new`, `delete`, `typeof`, `instanceof`

3. EACH keyword SHALL be matched case-insensitively using word boundary assertions (\b) to avoid matching partial words
4. THE System SHALL count keyword occurrences (not unique keyword types) in the text
5. THE System SHALL assign keyword density score:
   - keyword_count = number of keyword matches in text
   - keyword_density = keyword_count / (word_count or 1)
   - 0 points if keyword_density < 0.02 (fewer than 2% of words are code keywords)
   - 15 points if keyword_density 0.02–0.05 (moderate density)
   - 25 points if keyword_density ≥ 0.05 (high density, strong evidence)

### Requirement 4: Signal 3 — Indentation Pattern

**User Story:** As a code detector, I want to analyze indentation consistency, so that I can detect code blocks that follow language indentation conventions (e.g., Python, YAML, JavaScript with consistent indentation).

#### Acceptance Criteria

1. WHEN analyzing a text block, THE System SHALL extract all lines and measure indentation (leading whitespace)
2. THE System SHALL compute indentation statistics:
   - `indent_ratio`: fraction of lines that have leading whitespace (indentation)
   - `indent_consistency`: whether indentation levels follow a predictable pattern (e.g., all indents are multiples of 2 or 4 spaces)
   - `indent_levels`: count of distinct indentation depths observed

3. THE System SHALL assign indentation score based on these conditions:
   - 0 points if indent_ratio < 0.1 (fewer than 10% of lines have indentation; suggests prose)
   - 8 points if indent_ratio 0.1–0.3 (some indentation; weak evidence)
   - 12 points if indent_ratio ≥ 0.3 AND indent_consistency is high (strong evidence; code-like structure)
   - Additional 5 points if indent_levels ≥ 3 (deep nesting is typical in code, rare in prose)

4. INDENT_CONSISTENCY SHALL be true if:
   - All indentation is in multiples of 2, 3, 4, or 8 spaces (common tab/space widths), OR
   - All non-zero indentation uses tabs (Python standard), OR
   - Indentation increases/decreases in predictable steps

### Requirement 5: Signal 4 — Import/Require Statements

**User Story:** As a code detector, I want to identify module loading syntax specific to programming languages, so that I can detect code that explicitly imports dependencies or includes libraries.

#### Acceptance Criteria

1. WHEN analyzing a text block, THE System SHALL search for import/require/include patterns specific to common languages
2. THE System SHALL define patterns for language-specific module loading:
   - JavaScript/Node.js: `import`, `require`, `from`, `export`
   - Python: `import`, `from`, `as`, `__import__`
   - Java/C#: `import`, `package`, `using`, `namespace`
   - C/C++: `#include`, `#import`, `using`, `namespace`
   - Ruby: `require`, `require_relative`, `load`
   - PHP: `require`, `require_once`, `include`, `include_once`, `use`, `namespace`
   - Go: `import`, `package`
   - Rust: `use`, `mod`, `crate`

3. THE System SHALL use regex patterns with word boundary checks to match these keywords in typical import contexts:
   - `import\s+\{?[\w\.\,\s]+\}?\s+from\s+["']` (JavaScript/TypeScript)
   - `from\s+[\w\.]+\s+import\s+[\w\,\s]+` (Python)
   - `require\s*\(\s*["'].*?["']\s*\)` (JavaScript/Ruby)
   - `#include\s+[<"].*?[>"]` (C/C++)

4. EACH import statement match SHALL be counted and contribute to the import signal score:
   - 0 points if no import statements found
   - 10 points if 1 import statement found
   - 15 points if 2–4 import statements found
   - 20 points if ≥ 5 import statements found

### Requirement 6: Signal 5 — Comment Markers

**User Story:** As a code detector, I want to identify comment syntax specific to programming languages, so that I can detect code that includes inline or block comments.

#### Acceptance Criteria

1. WHEN analyzing a text block, THE System SHALL search for comment marker patterns specific to common languages
2. THE System SHALL define patterns for language-specific comment syntax:
   - Single-line comments: `//` (JavaScript, Java, C++, Go, Rust), `#` (Python, Ruby, Shell), `--` (SQL, Lua, Haskell), `'` (VB.NET, VBA)
   - Block comments: `/* ... */` (JavaScript, Java, C, C++, Go, Rust), `""" ... """` (Python), `=begin ... =end` (Ruby), `<!-- ... -->` (HTML)
   - Docstring markers: `"""`, `'''` (Python), `/**` (JSDoc, JavaDoc)

3. THE System SHALL use regex patterns to match these comment markers:
   - `//.*?$` (single-line // comments)
   - `#.*?$` (shell/Python comments)
   - `/\*.*?\*/` (block comments)
   - `""".*?"""` (Python docstrings)

4. EACH comment marker match SHALL be counted and contribute to the comment signal score:
   - 0 points if no comment markers found
   - 5 points if 1–2 comment markers found
   - 10 points if 3–5 comment markers found
   - 15 points if ≥ 6 comment markers found (strong evidence of code with documentation)

### Requirement 7: Signal Weighting and Score Normalization

**User Story:** As a system designer, I want to balance the importance of different signals, so that the multi-signal score reflects the most reliable indicators of source code.

#### Acceptance Criteria

1. THE System SHALL define weights for each signal:
   - Signal 1 (Brace Density): weight = 1.0 (highly distinctive to code, especially JavaScript/Java)
   - Signal 2 (Language Keywords): weight = 1.2 (most reliable; keywords appear frequently in code)
   - Signal 3 (Indentation Pattern): weight = 0.8 (reliable but also appears in formatted prose)
   - Signal 4 (Import/Require): weight = 1.5 (extremely distinctive; rare in prose)
   - Signal 5 (Comment Markers): weight = 0.9 (distinctive but also appears in documentation)

2. THE System SHALL compute the final score as: `raw_score = Σ(signal_i × weight_i)`
3. THE System SHALL normalize `raw_score` to a 0–100 scale:
   - `normalized_score = min(100, (raw_score / max_possible_score) × 100)`
   - `max_possible_score = (20 × 1.0) + (25 × 1.2) + (17 × 0.8) + (20 × 1.5) + (15 × 0.9) = 102.5` (sum of maximum point contributions)

4. THE System SHALL define a configurable threshold (default 50) that determines classification:
   - score ≥ threshold → classify as source code
   - score < threshold → classify as prose or uncertain

### Requirement 8: Threshold Calibration and Tuning

**User Story:** As a product manager, I want the detection threshold to balance false positives and false negatives, so that the system reliably detects code without flagging prose inappropriately.

#### Acceptance Criteria

1. THE System SHALL define a default threshold of 50 (calibrated via test suite on representative code and prose samples)
2. THE System SHALL allow threshold configuration via a system constant (e.g., `SOURCE_CODE_THRESHOLD = 50`)
3. THE System SHALL document the trade-off: lower thresholds (e.g., 40) increase recall (fewer missed code blocks) but increase false positives; higher thresholds (e.g., 60) reduce false positives but may miss code
4. WHEN the System logs scan results, THE System SHALL include the computed score and threshold comparison (e.g., "[TrustPrompt/code] score: 72 (threshold: 50) → DETECTED as code")

### Requirement 9: Markdown Fallback Integration

**User Story:** As a system integrator, I want the new multi-signal scoring to work alongside the existing markdown regex pattern, so that both formatted and unformatted code are detected.

#### Acceptance Criteria

1. WHEN the Scanner processes text, THE System SHALL:
   - First, apply the markdown regex pattern (`\`\`\`[\s\S]*?\`\`\`|\`[^\`\n]{10,}\``) to detect fenced/inline code
   - Then, apply the multi-signal scoring function to text blocks that are not already matched by the markdown regex

2. EACH detected code block (via markdown OR multi-signal scoring) SHALL create a finding with:
   - `patternId: "source_code"`
   - `label: "Source Code Block"`
   - `risk: "low"` (unless elevated by context or credential detection)
   - `source: "A_regex"` (for markdown matches) or `A_multi_signal` (for scoring matches)
   - `rawMatch: text_block` (the matched code)
   - `safeVersion: "[CODE BLOCK REMOVED]"`

3. IF the same code block is matched by both markdown and multi-signal scoring, THE Scanner SHALL deduplicate (keep one finding, preferring the multi-signal match)

### Requirement 10: Context-Aware Code Detection

**User Story:** As a privacy analyst, I want the code detector to consider surrounding context (e.g., is the code block part of a larger explanation or standalone?), so that I can distinguish intentional code sharing from accidental snippets.

#### Acceptance Criteria

1. WHEN the System detects a code block via multi-signal scoring, THE System SHALL examine the 50 characters before and after the block
2. TRIGGER PHRASES for intentional code sharing (increase confidence):
   - `"here is", "here's", "like this", "for example", "such as", "code:", "function:", "script:", "example:"`
   - `"try this", "use this", "run this", "execute this", "implement", "this is the"`

3. IF a trigger phrase appears in the 50-character lookahead/lookbehind, THE System SHALL increase the code block risk from `low` to `moderate` (context suggests intentional sharing)
4. THE System SHALL log the context detection (e.g., "[TrustPrompt/context] code block + trigger phrase → MODERATE risk")

### Requirement 11: Unformatted Code Block Detection

**User Story:** As a privacy analyst, I want to detect source code shared in plain text without markdown formatting, so that I can flag embedded credentials or proprietary algorithms even when pasted informally.

#### Acceptance Criteria

1. WHEN the System analyzes text that scores ≥ threshold on the multi-signal scoring function, THE System SHALL identify it as a likely code block
2. THE System SHALL extract the code block boundaries (typically line-based):
   - Start: first line with code-like characteristics (indentation + keyword/brace)
   - End: last consecutive line with consistent code-like characteristics
   - Include a maximum of 20 consecutive lines (to avoid capturing entire documents as one block)

3. THE System SHALL NOT require markdown formatting; plain text code shall be detected via multi-signal scoring alone
4. WHEN extracting unformatted code blocks, THE System SHALL preserve the original text, including indentation and line breaks

### Requirement 12: Risk Assessment for Code Blocks

**User Story:** As a risk analyst, I want code blocks to be assessed for risk based on their content (credentials, proprietary logic), so that code risk is contextualized appropriately.

#### Acceptance Criteria

1. WHEN a code block is detected, THE System SHALL apply a secondary scan within the code to detect embedded credentials (API keys, JWT, passwords) using existing PATH A patterns
2. IF embedded credentials are detected within the code block, THE System SHALL:
   - Elevate the code block risk from `low` to `high` (credentials in code are critical)
   - Mark the code block finding with `elevated: true` and `elevation_reason: "contains_embedded_credentials"`
   - Log the detection (e.g., "[TrustPrompt/code] code block + JWT detected inside → HIGH risk")

3. IF the code block contains sensitive keywords (e.g., `password`, `secret`, `token`, `api_key`, `private_key`, `database_url`), THE System SHALL elevate risk from `low` to `moderate`
4. WHEN computing overall scan risk, THE System SHALL treat HIGH-risk code blocks as critical findings (participate in governance escalation rules)

### Requirement 13: Performance Baseline

**User Story:** As a performance analyst, I want the multi-signal scoring to have minimal latency, so that overall scan performance is not degraded.

#### Acceptance Criteria

1. WHEN the System processes a 500-character text block for multi-signal scoring, THE computation SHALL complete within 5ms on a modern machine
2. WHEN the System detects multiple code blocks in a single text, THE total latency for all multi-signal scorings SHALL not exceed 20ms (for 3–5 blocks)
3. IF multi-signal scoring exceeds 10ms for a single block, THE System SHALL log a performance warning
4. THE System SHALL use pre-compiled regex patterns (cached) to avoid recompilation overhead

### Requirement 14: Test Coverage and Accuracy Metrics

**User Story:** As a QA engineer, I want to measure the accuracy of code detection across different languages and formats, so that I can identify and fix edge cases.

#### Acceptance Criteria

1. THE System SHALL define a test suite with representative samples:
   - Positive samples: JavaScript, Python, Java, C++, SQL, HTML/CSS code blocks (formatted and unformatted)
   - Negative samples: English prose, technical documentation, configuration files (YAML, JSON, TOML)
   - Edge cases: mixed code/prose, code with unusual formatting, non-English text

2. FOR each sample, THE System SHALL compute the multi-signal score and compare against ground truth classification
3. THE System SHALL measure accuracy metrics:
   - True Positive Rate (TPR) / Recall: percentage of actual code blocks detected
   - True Negative Rate (TNR) / Specificity: percentage of prose blocks correctly not flagged as code
   - False Positive Rate: percentage of prose incorrectly flagged as code
   - False Negative Rate: percentage of code blocks missed

4. THE System SHALL achieve minimum performance targets:
   - TPR ≥ 90% (detect at least 90% of code blocks)
   - TNR ≥ 85% (correctly exclude at least 85% of prose)
   - False Positive Rate ≤ 15% (flag no more than 15% of prose as code)

### Requirement 15: Configuration and Tuning Parameters

**User Story:** As a system maintainer, I want the multi-signal scoring to be configurable, so that I can tune detection sensitivity without modifying scanner logic.

#### Acceptance Criteria

1. THE System SHALL expose the following configuration parameters (as module-level constants in scanner.js):
   - `SOURCE_CODE_THRESHOLD`: default 50 (classification threshold)
   - `BRACE_DENSITY_WEIGHT`: default 1.0
   - `KEYWORD_DENSITY_WEIGHT`: default 1.2
   - `INDENTATION_WEIGHT`: default 0.8
   - `IMPORT_WEIGHT`: default 1.5
   - `COMMENT_WEIGHT`: default 0.9
   - `CODE_CONTEXT_ELEVATION`: boolean (default true) to enable context-aware elevation

2. WHEN any constant is modified, THE System SHALL re-normalize the scoring calculation automatically
3. THE System SHALL log all active configuration values during scanner initialization (e.g., "[TrustPrompt/config] SOURCE_CODE_THRESHOLD=50, keyword weight=1.2")

### Requirement 16: Logging and Diagnostics

**User Story:** As a debugger, I want detailed logging of multi-signal scoring decisions, so that I can verify that the system is detecting code correctly.

#### Acceptance Criteria

1. WHEN the System computes multi-signal scores, THE System SHALL log:
   - Input text (first 50 characters)
   - Each signal's raw score and contribution (e.g., "brace_density: 12/20 points")
   - Normalized final score (e.g., "normalized_score: 72/100")
   - Threshold comparison (e.g., "score 72 ≥ threshold 50 → DETECTED")
   - Final classification (code or prose)

2. DIAGNOSTIC FORMAT:
   ```
   [TrustPrompt/code-scoring] text: "function foo() { ret..."
   [TrustPrompt/code-scoring]   brace_density: 12/20 (2 braces, 0.025 ratio)
   [TrustPrompt/code-scoring]   keywords: 15/25 (3 keywords, 0.12 density)
   [TrustPrompt/code-scoring]   indentation: 12/17 (40% lines indented, consistent)
   [TrustPrompt/code-scoring]   imports: 0/20 (no import statements)
   [TrustPrompt/code-scoring]   comments: 10/15 (3 comment markers)
   [TrustPrompt/code-scoring]   raw_score: 49/102.5 → normalized: 48/100
   [TrustPrompt/code-scoring]   CLASSIFICATION: 48 < 50 (threshold) → PROSE
   ```

3. THE System SHALL respect the existing debug log level (if available) and only output diagnostics when verbose logging is enabled

### Requirement 17: Integration with Existing Patterns

**User Story:** As a system architect, I want the improved code detection to maintain backward compatibility with the existing `source_code` pattern, so that existing tests and code paths continue to work.

#### Acceptance Criteria

1. THE System SHALL retain the existing `source_code` pattern in TRUSTPROMPT_PATTERNS with the original regex (`\`\`\`[\s\S]*?\`\`\`|...`)
2. THE new multi-signal scoring SHALL be an additional detection method, NOT a replacement for the regex pattern
3. WHEN merging findings, IF both the regex pattern and multi-signal scoring detect the same code block, THE System SHALL keep one finding (deduplicate by rawMatch text)
4. THE System SHALL not modify the existing BASE_SCORES, ENTITY_TIER, or governance evaluation logic

### Requirement 18: Documentation and Examples

**User Story:** As a developer, I want clear documentation of the multi-signal scoring algorithm, so that I can understand how the system distinguishes code from prose.

#### Acceptance Criteria

1. THE System SHALL include code comments in scanner.js explaining:
   - The purpose and design of each signal (why it's distinctive to code)
   - The scoring formula and normalization
   - The threshold and its interpretation
   - Example inputs and their expected scores

2. THE System SHALL document the signal weights and their rationale (e.g., "import statements are highly distinctive, weight 1.5")
3. THE System SHALL include examples in comments showing:
   - Sample JavaScript code and its computed score (should be ≥ 50)
   - Sample prose text and its computed score (should be < 50)
   - Edge case examples (mixed code/prose, technical documentation)

### Requirement 19: Scoring Matrix Maintenance

**User Story:** As a system maintainer, I want the multi-signal scoring matrix to remain consistent and auditable, so that changes to scoring are tracked and justified.

#### Acceptance Criteria

1. THE System SHALL document the current scoring matrix in a structured format (e.g., JavaScript object or comment block):
   ```javascript
   const CODE_SCORING_MATRIX = {
     brace_density: { low: 0, moderate: 10, high: 20, weight: 1.0 },
     keywords: { low: 0, moderate: 15, high: 25, weight: 1.2 },
     indentation: { low: 0, moderate: 8, high: 12, bonus: 5, weight: 0.8 },
     imports: { none: 0, few: 10, moderate: 15, many: 20, weight: 1.5 },
     comments: { none: 0, few: 5, moderate: 10, many: 15, weight: 0.9 }
   };
   ```

2. ANY changes to this matrix SHALL be documented with a comment explaining the reason and expected impact on detection accuracy
3. THE System SHALL log the effective matrix during initialization (for audit trail)

### Requirement 20: Distinguishing Code from Prose Heuristics

**User Story:** As a heuristics engineer, I want the multi-signal scoring to learn common patterns that distinguish code from technical prose, so that false positives are minimized.

#### Acceptance Criteria

1. THE System SHALL identify common patterns that appear in prose but are unlikely in code:
   - Proper nouns and capitalization patterns (typical prose; code uses camelCase/snake_case)
   - Common English words and articles (the, a, is, are; rare in code)
   - Sentence-like structure (periods, capitalization, subject-verb patterns)

2. IF a text block has high indentation and keyword density but also contains multiple capitalized sentence fragments, THE System MAY reduce the code score (heuristic: likely formatted documentation, not actual code)
3. THE System SHALL log when heuristics reduce the score (e.g., "[TrustPrompt/heuristic] capitalized prose pattern detected, score reduced: 72 → 62")
4. THE System SHALL make heuristic adjustments optional via a configuration flag (`ENABLE_PROSE_HEURISTICS`, default false to maintain predictability)


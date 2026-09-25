# Requirements Document

# Source Code Detection Requirements

## Introduction

TrustPrompt currently detects personal identifiable information (PII) through regex patterns (PATH A) and gazetteers (PATH B). This feature adds a specialized detector that identifies source code blocks using a scoring algorithm based on linguistic features and structural patterns.

The source code detector uses **regex-based feature extraction** with a scoring system to classify text as source code if:
1. **Total score ≥ 6** (compilation threshold)
2. **At least 1 strong evidence signal present** (validation gate)

This approach is language-agnostic and handles JavaScript, Python, Shell, Java, Go, Rust, and other common programming languages. The detector runs within the scanner pipeline and contributes to the finding system with a single `source_code` pattern entry of `risk: "low"`.

## Glossary

- **System**: TrustPrompt (the extension that detects and redacts PII and sensitive content)
- **Source Code**: Text containing executable or interpreted programming instructions in any language
- **Source Code Block**: Contiguous section of text identified as source code
- **Detector**: The Source Code Detection system that analyzes text for code features
- **Evidence Signal**: A regex-based pattern or heuristic that indicates code presence (weak or strong)
- **Weak Evidence**: A feature indicating possible code, scored 1 point (lower specificity)
- **Strong Evidence**: A feature with high confidence of indicating code, scored 2–3 points (higher specificity)
- **Evidence Validator**: Logic that confirms a detected feature meets validation criteria (gate 2: at least 1 strong signal required)
- **Feature Compilation**: Algorithm that scans text for all evidence signals and aggregates scores
- **Scoring Threshold**: Total score ≥ 6 required for classification as source code
- **Strong Signal Gate**: Requirement that at least 1 strong evidence signal must be present to classify as code
- **Language-Agnostic**: Detector works across multiple programming languages without language-specific rules
- **Risk Level**: Severity of exposure if shared with AI model; source code blocks are classified as `low` risk per existing patterns.js
- **Sanitization**: Safe redaction strategy for source code blocks (currently `[CODE BLOCK REMOVED]`)
- **Minified Code**: Source code with whitespace removed and variables renamed, appearing as dense single/few lines
- **Shell Script**: Command-line instructions for system shells (bash, sh, zsh, PowerShell, cmd)
- **JSON Config**: Structured data in JSON format (not code, but code-adjacent; requires exclusion heuristic)
- **API Documentation Example**: Code snippets in documentation (often legitimate to share; requires context analysis)

## Requirements

### Requirement 1: Source Code Detection via Regex Feature Scoring

**User Story:** As a privacy analyst, I want the System to identify source code blocks in user input using a regex-based scoring system, so that code blocks can be flagged for redaction and protected from exposure to AI models.

#### Acceptance Criteria

1. WHEN the System scans text input, THE Detector SHALL extract evidence signals by applying regex patterns to detect code-related features
2. THE Detector SHALL compute a numeric score by summing point values for detected evidence signals (weak = 1 point, strong = 2–3 points)
3. IF the total score ≥ 6 AND at least 1 strong evidence signal is detected, THEN THE System SHALL classify the text as containing source code
4. IF the total score < 6 OR no strong evidence signal is detected, THEN THE System SHALL NOT classify the text as source code (independent conditions both required)
5. WHEN source code is identified, THE Detector SHALL create a finding with `patternId: "source_code"`, `label: "Source Code Block"`, `risk: "low"`, and `source: "regex_scoring"`
6. WHILE processing a text block, THE Detector SHALL apply all evidence patterns and aggregate scores to produce a single classification decision per block (not per line)

### Requirement 2: Weak Evidence Signals (1 Point Each)

**User Story:** As a system designer, I want to define weak evidence signals that indicate possible code presence, so that the scoring system can identify candidate code blocks with moderate confidence.

#### Acceptance Criteria

1. THE Detector SHALL recognize the following weak evidence signals, each worth 1 point:
   - **Semicolon line-terminator**: Regex `/;[\s]*$/m` — line ends with `;` (common in C-family languages, JavaScript, shell)
   - **Assignment operator**: Regex `/[^=!<>]=(?!=)` — assignment operator `=` not part of comparison (Python, JavaScript, Java, Go, Rust)
   - **Comparison operator**: Regex `/===|==|!=|!==|<=|>=|<>` — multi-character comparison operators (language-specific code markers)
   - **Logical operators**: Regex `/\b(and|or|not|&&|\|\||!)\b` — logical operators (Python: `and`/`or`, others: `&&`/`||`)
   - **camelCase identifier**: Regex `/\b[a-z]+[A-Z][a-zA-Z0-9]*\b` — identifier in camelCase (naming convention in code)
   - **snake_case identifier**: Regex `/\b[a-z]+_[a-z0-9_]*\b` — identifier in snake_case (naming convention in code, especially Python)
   - **Single-line comment**: Regex `/^\s*(\/\/|#|--|;)[\s]*.+$/m` — line starting with comment marker (language-dependent: `//`, `#`, `--`, `;`)
   - **High line density of non-letter characters**: If line density (non-letter chars / total chars) > 40%, award 1 point (indicates operators, brackets, symbols)

2. WHEN processing text, THE Detector SHALL apply each weak evidence pattern independently and accumulate points
3. WHERE a weak evidence signal matches, THE Detector SHALL verify it is not part of natural language (e.g., "don't" contains `'`, but should not trigger code detection on its own)

### Requirement 3: Strong Evidence Signals (2–3 Points Each)

**User Story:** As a system designer, I want to define strong evidence signals with high confidence of code presence, so that the scoring system can reliably identify source code blocks.

#### Acceptance Criteria

1. THE Detector SHALL recognize the following strong evidence signals:
   - **Braces `{}`**: Regex `/\{[^}]*\}|\{[\s\S]*?\}` — matched brace pairs (2 points, Strong) — common in all C-family languages, Go, Rust, Java, JavaScript
   - **Consistent indentation pattern**: Regex to detect 2–4 space or tab indentation across multiple lines with alignment (2 points, Moderate-Strong) — indicates code structure
   - **Function-call pattern `name()`**: Regex `/\b[a-zA-Z_]\w*\s*\([^)]*\)` — identifier followed by parentheses (2 points, Strong) — common in all languages
   - **Code keyword**: Regex matching language keywords from comprehensive list (3 points, Strong):
     - JavaScript/TypeScript: `const`, `let`, `var`, `function`, `async`, `await`, `class`, `extends`, `interface`, `type`, `import`, `export`, `if`, `else`, `for`, `while`, `do`, `switch`, `case`, `break`, `continue`, `return`, `try`, `catch`, `finally`, `throw`, `new`, `delete`, `instanceof`, `typeof`, `this`, `super`, `static`, `get`, `set`, `yield`
     - Python: `def`, `class`, `import`, `from`, `if`, `elif`, `else`, `for`, `while`, `break`, `continue`, `pass`, `return`, `try`, `except`, `finally`, `raise`, `with`, `as`, `lambda`, `yield`, `assert`, `del`, `global`, `nonlocal`, `and`, `or`, `not`, `in`, `is`, `True`, `False`, `None`
     - Java: `public`, `private`, `protected`, `static`, `final`, `abstract`, `class`, `interface`, `extends`, `implements`, `new`, `import`, `package`, `if`, `else`, `for`, `while`, `do`, `switch`, `case`, `break`, `continue`, `return`, `try`, `catch`, `finally`, `throw`, `throws`, `synchronized`, `volatile`, `transient`, `native`, `strictfp`
     - Go: `func`, `package`, `import`, `const`, `var`, `type`, `struct`, `interface`, `if`, `else`, `for`, `switch`, `case`, `default`, `break`, `continue`, `return`, `defer`, `go`, `chan`, `select`, `range`, `map`, `slice`, `append`, `len`, `cap`
     - Rust: `fn`, `let`, `const`, `static`, `mut`, `ref`, `struct`, `enum`, `trait`, `impl`, `use`, `pub`, `mod`, `crate`, `super`, `self`, `if`, `else`, `match`, `for`, `while`, `loop`, `break`, `continue`, `return`, `unsafe`, `async`, `await`, `move`
     - Shell: `if`, `then`, `else`, `elif`, `fi`, `for`, `do`, `done`, `while`, `case`, `esac`, `function`, `export`, `alias`, `declare`, `unset`, `source`, `set`
   - **Import/require statement**: Regex `/^\s*(import|require|from|package|include|#include)\s+['\"\w\-\.\/]/m` (3 points, Strong) — language-independent module import pattern

2. WHEN a strong evidence signal is detected, THE Detector SHALL increment the total score by the specified point value (2 or 3)
3. THE Detector SHALL treat each strong signal independently and accumulate all matching signals
4. WHILE evaluating code keywords, THE System SHALL match keywords as whole words only (word boundary `\b`) to avoid false positives (e.g., "defend" should not match `def`)

### Requirement 4: Feature Compilation and Scoring Algorithm

**User Story:** As a system architect, I want a well-defined algorithm for compiling evidence signals and computing scores, so that classification decisions are consistent and reproducible.

#### Acceptance Criteria

1. THE Detector SHALL implement the following Feature Compilation Algorithm:
   ```
   Algorithm: CompileAndScore(text)
     Input: text (string to analyze)
     Output: score (integer), strongSignals (array of signals), classification (boolean)
     
     1. Initialize score = 0, weakSignals = [], strongSignals = []
     2. FOR EACH weak evidence pattern in WEAK_EVIDENCE_PATTERNS:
        a. IF pattern matches in text:
           i. Append pattern name to weakSignals
           ii. score += 1
     3. FOR EACH strong evidence pattern in STRONG_EVIDENCE_PATTERNS:
        a. IF pattern matches in text:
           i. Append pattern name to strongSignals
           ii. score += pattern.points (2 or 3)
     4. IF score >= 6 AND length(strongSignals) > 0:
        a. classification = TRUE
        b. RETURN score, strongSignals, classification
     5. ELSE:
        a. classification = FALSE
        b. RETURN score, strongSignals, classification
   ```
2. THE Detector SHALL apply patterns to the full normalized text block (not per-line, unless performing line-by-line compilation)
3. WHEN multiple matches of the same pattern exist in the text, THE Detector SHALL count each match (e.g., 3 instances of `;` terminator = +3 points, not +1)
4. THE Detector SHALL aggregate scores across all patterns before checking threshold and strong signal gate

### Requirement 5: Strong Signal Validation Gate

**User Story:** As a system designer, I want to ensure that score alone is insufficient for classification, so that high-scoring natural language text (e.g., mathematical formulas, ASCII tables) is not misclassified as code.

#### Acceptance Criteria

1. WHEN the total score ≥ 6, THE Detector SHALL also check that at least 1 strong evidence signal was detected
2. IF at least 1 strong signal is present, THE Detector SHALL classify text as source code
3. IF no strong signal is detected (even if score ≥ 6), THE Detector SHALL NOT classify text as source code and SHALL set a debug flag `reason: "high_score_no_strong_signal"`
4. THE Strong Signal Validation Gate SHALL be a mandatory filter that prevents false positives from natural language containing many operators or formatting characters

### Requirement 6: Language-Agnostic Design

**User Story:** As a developer, I want the detector to work across multiple programming languages without language-specific configuration, so that code blocks in any language are reliably identified.

#### Acceptance Criteria

1. WHEN source code is provided in any of the supported languages (JavaScript, Python, Shell, Java, Go, Rust, C/C++, etc.), THE Detector SHALL identify it using the language-agnostic evidence signals
2. THE Detector SHALL NOT require prior knowledge of which language is being detected
3. WHERE language-specific keywords are detected, THE System SHALL score them uniformly (3 points per keyword match) regardless of language
4. WHILE processing code, THE Detector SHALL recognize patterns that are common across multiple languages (e.g., `function()`, `if`, `for`, `class`)
5. WHERE code mixes languages (e.g., JavaScript with embedded SQL), THE Detector SHALL treat the text as a single code block and aggregate scores across all languages
6. THE Detector SHALL handle code snippets as short as 10–20 characters and as long as thousands of characters

### Requirement 7: Minified Code Handling

**User Story:** As a privacy analyst, I want the detector to identify minified code (dense single-line code with no whitespace), so that obfuscated code blocks are still detected and protected.

#### Acceptance Criteria

1. WHEN source code is minified (whitespace removed, variables renamed), THE Detector SHALL apply the feature compilation algorithm without modification
2. WHERE minified code contains high density of operators, punctuation, and function calls, THE Detector SHALL accumulate points from weak and strong signals
3. IF minified code includes keywords or import statements, THE Detector SHALL recognize them and apply strong signal scoring
4. WHILE handling minified code, THE Detector SHALL NOT rely on indentation heuristics (as minified code has none) but SHALL rely on keywords, operators, and function-call patterns
5. WHERE minified code reaches the scoring threshold (score ≥ 6 with strong signal), THE Detector SHALL classify it as source code

### Requirement 8: Edge Case: JSON and Config Files

**User Story:** As a system designer, I want to distinguish between JSON/YAML configs and source code, so that configuration files are not over-flagged as code.

#### Acceptance Criteria

1. WHEN text appears to be JSON format (contains `{`, `}`, `:`, `"key": "value"` patterns), THE Detector MAY apply a JSON-specific exclusion heuristic
2. WHERE JSON structure is detected, THE Detector SHALL check if keywords or function calls are present (strong signals)
3. IF JSON contains no keywords or function calls (only data structure), THE Detector SHALL reduce score by 1 or set classification to FALSE even if score ≥ 6
4. WHEN YAML format is detected (contains `:` with indentation but no braces), THE Detector SHALL apply similar exclusion logic
5. WHILE detecting config files, THE Detector SHALL preserve classification if legitimate code syntax is detected (e.g., JavaScript in `scripts` section of package.json)

### Requirement 9: Edge Case: Shell Scripts and Command-Line Instructions

**User Story:** As a privacy analyst, I want the detector to identify shell scripts and command-line instructions, so that shell code blocks are flagged alongside compiled/interpreted languages.

#### Acceptance Criteria

1. WHEN text contains shell-specific keywords (`if`, `then`, `for`, `do`, `function`), THE Detector SHALL apply shell keyword scoring (3 points per keyword)
2. WHERE shell constructs are detected (e.g., `$variable`, `$(command)`, `|` pipes, `>` redirects), THE Detector SHALL assign additional weak signal points
3. WHILE processing shell code, THE Detector SHALL recognize shebang lines (`#!/bin/bash`, `#!/usr/bin/env python`) as strong indicators of executability (2–3 points)
4. IF shell script patterns are detected without shebang, THE Detector SHALL still apply scoring based on keywords and operators

### Requirement 10: Edge Case: API Documentation and Code Examples

**User Story:** As a system designer, I want the detector to handle API documentation containing code snippets, so that documentation is not over-flagged unless it contains actual code.

#### Acceptance Criteria

1. WHEN text appears to be documentation with embedded code examples (e.g., "Usage: `function_name()`" in natural language), THE Detector SHALL apply context awareness
2. WHERE code examples are inline (single line, isolated function call), THE Detector MAY require a higher scoring threshold (e.g., score ≥ 8) or stronger signal presence
3. WHERE code examples are in multi-line indented blocks, THE Detector SHALL apply normal threshold (score ≥ 6 with strong signal)
4. WHILE analyzing documentation, THE Detector SHALL prefer contextual cues: if text contains "example", "usage", "code", the detector MAY be more lenient but SHALL still require strong signals
5. IF documentation contains a multi-line code block with keywords or imports, THE Detector SHALL classify it as code regardless of documentation context

### Requirement 11: Scoring Metadata and Debug Output

**User Story:** As a developer, I want the detector to provide detailed scoring metadata for debugging and validation, so that I can understand why text was or was not classified as code.

#### Acceptance Criteria

1. WHEN classification is performed, THE Detector SHALL return a structured result including:
   - `score` (integer): total accumulated score
   - `weakSignals` (array): names of weak evidence signals detected
   - `strongSignals` (array): names of strong evidence signals detected with point values
   - `classification` (boolean): TRUE if code, FALSE otherwise
   - `reason` (string): human-readable explanation (e.g., "score=8, keywords present", "score=4, no strong signals")
   - `confidence` (0–1): normalized confidence score = min(score / 12, 1.0) × (1 if strongSignals.length > 0 else 0.5)
2. WHEN classification is FALSE, THE Detector SHALL provide a reason flag:
   - `"score_below_threshold"` if score < 6
   - `"no_strong_signals"` if score ≥ 6 but no strong signals detected
   - `"excluded_by_heuristic"` if excluded by JSON/config heuristic
3. THE Detector SHALL log debug output in non-production mode for tracing feature matches

### Requirement 12: Integration with Scanner Pipeline

**User Story:** As a system architect, I want source code detection to integrate with the existing scanner pipeline, so that findings are consistent with PATH A and PATH B results.

#### Acceptance Criteria

1. THE Source Code Detector SHALL run as a dedicated scan pass after PATH A and PATH B
2. WHEN the Scanner invokes source code detection, THE Detector SHALL receive normalized text (same as PATH C linguistic detector)
3. IF source code is detected, THE Detector SHALL create a finding with:
   - `patternId: "source_code"`
   - `label: "Source Code Block"`
   - `risk: "low"`
   - `rawMatch: <original block>`
   - `safeVersion: "[CODE BLOCK REMOVED]"`
   - `source: "regex_scoring"`
   - `validated: true` (scoring algorithm provides deterministic classification)
   - `metadata: { score, weakSignals, strongSignals, reason, confidence }`
4. THE Scanner SHALL include source code findings in deduplication logic (same as PATH A/B)
5. WHILE computing risk score, THE Scanner SHALL treat source code findings as `low` risk (consistent with existing `source_code` pattern in patterns.js)

### Requirement 13: Performance Constraint

**User Story:** As a performance analyst, I want source code detection to have minimal overhead, so that total scan time remains acceptable.

#### Acceptance Criteria

1. WHEN the Detector compiles evidence signals for a typical text block (100–1000 characters), THE algorithm SHALL complete within 20ms on a modern machine
2. THE Detector SHALL use pre-compiled regex patterns (stored as module-level constants) to avoid recompilation on each scan
3. IF a text block exceeds 10,000 characters, THE Detector MAY chunk the text into sections (e.g., 5000-char windows) and classify each section independently
4. WHILE processing, THE Detector SHALL exit early if classification decision is definitive (e.g., strong keyword detected with score already ≥ 6)

### Requirement 14: False Positive Mitigation

**User Story:** As a privacy analyst, I want false positives to be minimized while maintaining high sensitivity, so that legitimate non-code text is not over-flagged.

#### Acceptance Criteria

1. THE Detector SHALL apply context-aware scoring to reduce false positives:
   - Long paragraphs of natural language that happen to contain code-like keywords (e.g., "I **import**ed the data using Python") should score lower
   - Mathematical equations containing operators (e.g., `a = 2 + 3`) should require strong keyword signals to classify as code
2. WHERE weak signals cluster densely (multiple `;` on adjacent lines), THE Detector SHALL count them as cumulative evidence (each `;` adds 1 point)
3. IF text contains a known false-positive pattern (e.g., markdown code fence without content between backticks), THE Detector SHALL skip processing or apply reduced scoring
4. WHILE scoring, THE Detector SHALL not penalize natural language containing contractions (e.g., "don't", "it's") which may trigger operator patterns

### Requirement 15: Test Coverage and Validation

**User Story:** As a QA engineer, I want comprehensive test cases to validate detector accuracy, so that the implementation meets design specification.

#### Acceptance Criteria

1. THE Detector implementation SHALL include test cases covering:
   - Positive cases: JavaScript, Python, Shell, Java, Go, Rust code snippets that should score ≥ 6 with strong signals
   - Negative cases: Natural language, documentation, JSON configs, mathematical formulas that should NOT classify as code
   - Edge cases: Minified code, mixed-language code, one-liners, very long code blocks
   - Boundary cases: score = 5, score = 6, score = 7 (around threshold); presence/absence of strong signals
2. WHEN test cases are executed, THE Detector SHALL achieve:
   - ≥ 95% true positive rate (code correctly identified)
   - ≥ 90% true negative rate (non-code correctly excluded)
   - ≥ 85% precision (minimal false positives)
   - ≥ 85% recall (minimal false negatives)
3. THE test results SHALL be documented in a test report with confusion matrix and per-language accuracy breakdown

---

## Appendix A: Evidence Signals Reference Table

| Signal Type | Pattern | Language | Weak (1pt) | Strong (2-3pt) | Regex |
|---|---|---|---|---|---|
| Semicolon Terminator | `;` at line end | C, Java, JS, Rust, Go | ✓ | | `/;[\s]*$/m` |
| Assignment Operator | `=` not in comparison | Most | ✓ | | `/[^=!<>]=(?!=)` |
| Comparison Operators | `==`, `===`, `!=`, etc. | Most | ✓ | | `/(===\|==\|!=\|!==\|<=\|>=\|<>)` |
| Logical Operators | `&&`, `\|\|`, `and`, `or` | Most | ✓ | | `/(\band\b\|\bor\b\|\b&&\b\|\b\|\|\b)` |
| camelCase Identifiers | Identifier in camelCase | Java, JS, TS, Go | ✓ | | `/\b[a-z]+[A-Z][a-zA-Z0-9]*\b` |
| snake_case Identifiers | Identifier in snake_case | Python, Rust, Go | ✓ | | `/\b[a-z]+_[a-z0-9_]*\b` |
| Single-line Comments | `//`, `#`, `--`, `;` | Most | ✓ | | `/^\s*(\/\/\|#\|--\|;)[\s]*.+$/m` |
| High Line Density | >40% non-letter chars | Most | ✓ | | Custom calculation |
| Braces | `{...}` pairs | C-family, Go, Rust, Java | | ✓ (2pt) | `/\{[^}]*\}\|\{[\s\S]*?\}` |
| Indentation | 2–4 space/tab consistent | Most | | ✓ (2pt) | Custom (multi-line check) |
| Function Calls | `name()` pattern | Most | | ✓ (2pt) | `/\b[a-zA-Z_]\w*\s*\([^)]*\)` |
| Keywords | Language-specific keywords | Per language | | ✓ (3pt) | Combined keyword list |
| Import/Require | `import`, `require`, `#include` | Most | | ✓ (3pt) | `/^\s*(import\|require\|from\|package\|include\|#include)\s+['\"\w\-\.\/]/m` |

---

## Appendix B: Example Scoring Scenarios

### Scenario 1: Simple JavaScript Function (Should Classify as Code)

```javascript
function add(a, b) {
  return a + b;
}
```

**Scoring:**
- Weak signals: assignment (=), camelCase (add, return), comments if present = +2
- Strong signals: keyword (`function`) = +3, braces (`{}`) = +2, function call pattern (`add(a, b)`) = +2
- **Total: 2 + 3 + 2 + 2 = 9**
- **Strong signals present: YES** (keywords, braces, function calls)
- **Classification: CODE** ✓

### Scenario 2: Python Import Statement (Should Classify as Code)

```python
import pandas as pd
from sklearn.model_selection import train_test_split
```

**Scoring:**
- Weak signals: none = +0
- Strong signals: keyword (`import`, `from`) = +3 + 3, import/require statement = +3
- **Total: 3 + 3 + 3 = 9**
- **Strong signals present: YES** (import statement)
- **Classification: CODE** ✓

### Scenario 3: Natural Language with Operators (Should NOT Classify as Code)

```
This document explains mathematical formulas. The equation a = 2 + 3 demonstrates addition.
The result is b = a * 2 where the operator == checks equality.
```

**Scoring:**
- Weak signals: assignment (=) multiple times = +3, comparison (==) = +1, operators (+, *) = +2
- Strong signals: none (no keywords, no braces, no function calls) = +0
- **Total: 3 + 1 + 2 = 6**
- **Strong signals present: NO**
- **Classification: NOT CODE** ✓ (score ≥ 6 but no strong signals)

### Scenario 4: Shell Script (Should Classify as Code)

```bash
#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: $0 <file>"
  exit 1
fi
```

**Scoring:**
- Weak signals: semicolons (;) = +2, variable reference ($1, $0) = +1
- Strong signals: keywords (`if`, `then`, `fi`) = +3, shebang line = +2
- **Total: 2 + 1 + 3 + 2 = 8**
- **Strong signals present: YES** (keywords)
- **Classification: CODE** ✓

### Scenario 5: JSON Config (Should NOT Classify as Code)

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "scripts": {
    "build": "webpack"
  }
}
```

**Scoring:**
- Weak signals: braces detected but JSON heuristic applied = adjusted
- Strong signals: none (no keywords, no function calls beyond key-value structure)
- **Total after JSON exclusion: < 6 or classification bypassed**
- **Classification: NOT CODE** ✓ (by JSON heuristic)

### Scenario 6: Minified JavaScript (Should Classify as Code)

```javascript
const add=(a,b)=>{return a+b};const mul=(a,b)=>{return a*b};export{add,mul};
```

**Scoring:**
- Weak signals: semicolons (;) = +4, assignment (=) = +3, operators (*, +) = +2, parentheses density = +1
- Strong signals: keywords (`const`, `return`, `export`) = +3, braces (`{}`) = +2, arrow functions (`=>`) = pattern match = +1, import/export = +3
- **Total: 4 + 3 + 2 + 1 + 3 + 2 + 1 + 3 = 19**
- **Strong signals present: YES**
- **Classification: CODE** ✓

---

## Appendix C: Correctness Properties

### Property 1: Consistency — Same Input Always Produces Same Classification

**Correctness property:** For any given text block T, calling `classify(T)` multiple times SHALL produce identical results.

```
FOR ALL text T:
  classify(T).classification == classify(T).classification
  classify(T).score == classify(T).score
  classify(T).strongSignals == classify(T).strongSignals
```

**Test approach:** Generate 50 random code and non-code samples, call classify() twice on each, verify identical results.

### Property 2: Threshold Monotonicity — Higher Score Never Decreases Classification

**Correctness property:** If text T1 is classified as code with score S1, and T2 extends T1 with additional code features (score S2 > S1), then T2 SHALL also be classified as code.

```
FOR ALL text T1, T2 where T2 = T1 + "<code_snippet>":
  score(T2) >= score(T1)
  (classify(T1) == CODE) => (classify(T2) == CODE)
```

**Test approach:** Take 20 code snippets, append additional code to each, verify score increases and classification remains CODE.

### Property 3: Strong Signal Necessity — Code Requires Strong Signal When Score ≥ 6

**Correctness property:** No text block with score ≥ 6 but no strong signals SHALL be classified as code.

```
FOR ALL text T:
  (score(T) >= 6) AND (strongSignals(T) == [])
  => classify(T).classification == FALSE
```

**Test approach:** Manually craft text with score = 6–8 using only weak signals, verify all are NOT classified as code.

### Property 4: Language Agnosticism — Detector Recognizes Code Across Languages

**Correctness property:** Code in any supported language (JS, Python, Shell, Java, Go, Rust) SHALL reach classification if it contains keywords or strong signals.

```
FOR ALL languages L in {JavaScript, Python, Shell, Java, Go, Rust}:
  FOR ALL code snippets C in language L:
    (keywords(C) OR imports(C) OR braces(C)) => classify(C).classification == CODE
```

**Test approach:** Test 5–10 code snippets per language, verify all classify as CODE.

### Property 5: Determinism — No Randomness in Classification Algorithm

**Correctness property:** The classification algorithm SHALL be deterministic with no randomness or probabilistic behavior.

```
classify(T) is a pure function with no side effects
```

**Test approach:** Code inspection and property verification (no random elements used).

---

## Appendix D: Test Scenarios and Edge Cases

### Positive Test Cases (Should Classify as CODE)

1. **Simple Function**: JavaScript, Python, Go function definitions
2. **Class Definition**: Java, Python, Rust class with methods
3. **Import Statement**: `import`, `require`, `from ... import`
4. **Loop Structure**: `for`, `while`, `do...while` with body
5. **Conditional**: `if...else`, `switch...case` statements
6. **Try-Catch Block**: Error handling syntax
7. **Variable Declaration**: `const`, `let`, `var`, `def`, `fn`
8. **Function Call Chain**: Method chaining with dots: `obj.method().method()`
9. **Lambda/Arrow Function**: `=>`, `lambda` anonymous functions
10. **Minified Code**: Single-line dense code with no whitespace
11. **Shell Script**: Bash/Python with shebang and commands
12. **One-Liner**: Compact code on single line (e.g., Python one-liner with `;` separators)
13. **Multi-Language**: Mixed code (e.g., JavaScript with embedded SQL in string)
14. **Commented Code**: Code with comment lines interspersed
15. **Indented Block**: Properly indented code matching consistent pattern

### Negative Test Cases (Should NOT Classify as CODE)

1. **Plain English**: Paragraph of natural language text
2. **Mathematical Formula**: Equations with operators but no keywords
3. **JSON/YAML**: Config files with structured data only
4. **CSV Data**: Tabular data with commas and operators
5. **Email Address**: Multiple `@` signs and dots
6. **SQL Query**: While SQL-like, if purely data-focused should require strong signals
7. **Markdown**: Markdown documentation with code fence but minimal content inside
8. **Resume**: Professional resume with job titles and dates
9. **API Documentation**: Usage examples in natural language sentences
10. **Chat Log**: Conversation with emojis and punctuation
11. **Literature**: Novel excerpt or poetry
12. **Technical Writing**: Academic paper with equations
13. **Source Map**: Debug symbol file or stack trace
14. **XML**: Markup with tags and attributes
15. **Poetry**: Formatted text with line breaks and metaphor

### Edge Cases (Boundary Testing)

1. **Score = 5**: Just below threshold (should NOT classify)
2. **Score = 6, No Strong Signals**: Exactly at threshold but fails gate (should NOT classify)
3. **Score = 6, With 1 Strong Signal**: Exactly at threshold with strong signal (should classify)
4. **Score = 7, Weak Signals Only**: Above threshold but no strong signals (should NOT classify)
5. **Score = 100, Very Long Code**: Very high score on 10,000-char code block
6. **Empty String**: Zero-length text (score = 0, classify = FALSE)
7. **Single Character**: Minimal text (e.g., `{`)
8. **Only Whitespace**: Tabs and spaces only
9. **Only Punctuation**: String of symbols: `!@#$%^&*()`
10. **URL**: Text containing many special characters and slashes
11. **License Plate**: Format like "ABC-1234" with hyphens and alphanumeric
12. **Phone Number**: Multiple digits and operators
13. **Regular Expression**: Regex pattern with special characters and operators
14. **HTML/XML**: Markup language with angle brackets and tags
15. **Obfuscated Code**: Code with variable names replaced by single letters or numbers

---

## Appendix E: Language-Specific Keyword Lists

### JavaScript/TypeScript Keywords
`const`, `let`, `var`, `function`, `async`, `await`, `class`, `extends`, `interface`, `type`, `import`, `export`, `if`, `else`, `for`, `while`, `do`, `switch`, `case`, `break`, `continue`, `return`, `try`, `catch`, `finally`, `throw`, `new`, `delete`, `instanceof`, `typeof`, `this`, `super`, `static`, `get`, `set`, `yield`, `default`

### Python Keywords
`def`, `class`, `import`, `from`, `if`, `elif`, `else`, `for`, `while`, `break`, `continue`, `pass`, `return`, `try`, `except`, `finally`, `raise`, `with`, `as`, `lambda`, `yield`, `assert`, `del`, `global`, `nonlocal`, `and`, `or`, `not`, `in`, `is`, `True`, `False`, `None`

### Java Keywords
`public`, `private`, `protected`, `static`, `final`, `abstract`, `class`, `interface`, `extends`, `implements`, `new`, `import`, `package`, `if`, `else`, `for`, `while`, `do`, `switch`, `case`, `break`, `continue`, `return`, `try`, `catch`, `finally`, `throw`, `throws`, `synchronized`, `volatile`, `transient`, `native`, `strictfp`, `void`

### Go Keywords
`func`, `package`, `import`, `const`, `var`, `type`, `struct`, `interface`, `if`, `else`, `for`, `switch`, `case`, `default`, `break`, `continue`, `return`, `defer`, `go`, `chan`, `select`, `range`, `map`, `slice`, `append`, `len`, `cap`, `make`, `new`

### Rust Keywords
`fn`, `let`, `const`, `static`, `mut`, `ref`, `struct`, `enum`, `trait`, `impl`, `use`, `pub`, `mod`, `crate`, `super`, `self`, `if`, `else`, `match`, `for`, `while`, `loop`, `break`, `continue`, `return`, `unsafe`, `async`, `await`, `move`, `dyn`

### Shell Keywords
`if`, `then`, `else`, `elif`, `fi`, `for`, `do`, `done`, `while`, `case`, `esac`, `function`, `export`, `alias`, `declare`, `unset`, `source`, `set`, `readonly`, `typeset`, `local`, `command`, `eval`


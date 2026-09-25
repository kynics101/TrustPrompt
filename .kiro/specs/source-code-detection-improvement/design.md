# Source Code Detection Improvement — Design Document

## Overview

This document specifies the architecture and implementation strategy for a **feature-based scoring system** that improves the detection and risk escalation of source code blocks containing embedded credentials, proprietary logic, or configuration data.

### Scope

The feature improves detection and risk classification of source code blocks through:
1. **Feature-based detection framework** — identifies 6+ distinct code characteristics
2. **Strong evidence classification** — separates critical indicators from supporting evidence
3. **Composite scoring algorithm** — combines feature evidence into a confidence score
4. **Dual threshold validation** — requires both score threshold AND strong evidence presence
5. **Context-aware escalation** — raises risk when code contains embedded secrets
6. **Markdown regex integration** — works alongside existing markdown fence detection
7. **Logging and diagnostics** — comprehensive framework for debugging and tuning

### Goals

- **Reduce False Negatives**: Detect code blocks (formatted and unformatted) that contain executable logic or secrets
- **Reduce False Positives**: Distinguish code from prose via strong evidence types; don't flag based on weak signals alone
- **Strong Evidence Requirement**: Require at least one strong evidence type (keywords, imports, function calls, or braces) to classify as code
- **Configurability**: Enable tuning of thresholds without code changes
- **Transparency**: Log feature detection and scoring decisions for audit and debugging

---

## Architecture

### 1. Feature-Based Detection Framework

Each code block is analyzed for 6+ distinct features, classified as either **strong evidence** or **weak evidence**:

| Feature | Type | Points | Detection Method |
|---------|------|--------|------------------|
| **Code Keywords** | Strong | 3 | Regex match on control flow, declarations, type keywords |
| **Import/Require Statements** | Strong | 3 | Regex pattern match on language-specific module loading |
| **Braces (Density)** | Strong | 2 | Curly brace count relative to text length |
| **Function Calls** | Strong | 2 | Regex pattern: `identifier(...)` with balanced parens |
| **Semicolons** | Weak | 1 | Statement terminators (JavaScript, Java, C-family) |
| **Operators** | Weak | 1 | Mathematical/logical operators: `+`, `-`, `*`, `/`, `%`, `&&`, `\|\|`, `!` |
| **camelCase/snake_case** | Weak | 1 | Consistent naming conventions typical of code |
| **Comments** | Weak | 1 | Language-specific comment markers: `//`, `#`, `/*`, `--` |
| **Indentation Pattern** | Weak | 1 | Lines with leading whitespace (4+ space or tab indent) |
| **Line Density Consistency** | Weak | 1 | Average characters per line (code: 40–120 chars/line) |

**Strong Evidence Types**: Code Keywords, Import/Require Statements, Braces, Function Calls

**Weak Evidence Features**: Semicolons, Operators, camelCase/snake_case, Comments, Indentation, Line Density

---

### 1.1 Feature Detection: Strong Evidence

#### Feature 1: Code Keywords

**Purpose**: Identify programming language keywords that are extremely unlikely in prose.

**Detection Pseudocode**:
```pascal
FUNCTION detectCodeKeywords(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or points)
  
  SEQUENCE
    keywords ← {
      // Control flow
      "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
      "return", "try", "catch", "finally", "throw",
      
      // Declarations
      "function", "class", "async", "await", "const", "let", "var",
      "def", "async def", "struct", "interface", "enum", "namespace",
      
      // Type keywords
      "int", "string", "boolean", "bool", "void", "null", "undefined",
      "true", "false", "float", "double", "long", "short",
      
      // Module/Imports
      "import", "export", "require", "from", "as", "use", "include",
      
      // Other language-specific
      "this", "self", "super", "new", "delete", "instanceof", "typeof"
    }
    
    matches ← 0
    FOR EACH keyword IN keywords DO
      pattern ← "\b" + keyword + "\b"
      matches ← matches + countMatches(text, pattern)  // case-insensitive
    END FOR
    
    IF matches ≥ 1 THEN
      RETURN 3 points  // strong evidence
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**:
- 1+ keywords found → **3 points** (strong evidence)
- 0 keywords → **0 points**

**Reasoning**: Code keywords (`function`, `const`, `def`, `import`, `if`, `return`) virtually never appear in prose except in technical documentation about code itself. A single occurrence is strong evidence.

---

#### Feature 2: Import/Require Statements

**Purpose**: Identify module loading syntax specific to languages.

**Detection Pseudocode**:
```pascal
FUNCTION detectImportStatements(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or points)
  
  SEQUENCE
    patterns ← {
      // JavaScript/TypeScript
      /import\s+\{?[\w\.\,\s]+\}?\s+from\s+["'][\w\.\/-]+["']/,
      /require\s*\(\s*["'][\w\.\/-]+["']\s*\)/,
      /export\s+(?:default\s+)?(?:function|class|const|let|var)/,
      
      // Python
      /^import\s+[\w\.]+/m,
      /^from\s+[\w\.]+\s+import\s+[\w\,\s]+/m,
      
      // Java/C#
      /^import\s+[\w\.]+;?/m,
      /^using\s+[\w\.]+;?/m,
      /^namespace\s+[\w\.]+/m,
      
      // C/C++
      /#include\s+[<"][\w\.\/-]+[>"]/,
      /#import\s+[<"][\w\.\/-]+[>"]/,
      
      // Go
      /^import\s+\(/m,
      /^import\s+"[\w\.\/-]+"/m,
      
      // Rust
      /^use\s+[\w\:\:]+/m,
      /^mod\s+[\w]+/m,
      
      // PHP
      /(?:require|include|require_once|include_once)\s+["'][\w\.\/-]+["']/
    }
    
    matches ← 0
    FOR EACH pattern IN patterns DO
      matches ← matches + countMatches(text, pattern)
    END FOR
    
    IF matches ≥ 1 THEN
      RETURN 3 points  // strong evidence
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**:
- 1+ import/require found → **3 points** (strong evidence)
- 0 imports → **0 points**

**Reasoning**: Module loading syntax (`import`, `require`, `use`, `#include`) is virtually exclusive to code. Prose never uses these patterns.

---

#### Feature 3: Braces (Density)

**Purpose**: Detect curly braces that denote code blocks, functions, objects.

**Detection Pseudocode**:
```pascal
FUNCTION detectBraces(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or points)
  
  SEQUENCE
    openBraces ← countOccurrences(text, "{")
    closeBraces ← countOccurrences(text, "}")
    
    totalBraces ← openBraces + closeBraces
    textLength ← length(text)
    
    braceDensity ← totalBraces / MAX(textLength, 1)
    
    // Code typically has 1 brace per 30–50 characters (density 0.02–0.03)
    // Prose has 0 braces
    
    IF braceDensity ≥ 0.03 THEN
      RETURN 2 points  // strong evidence
    ELSE IF totalBraces ≥ 2 THEN
      RETURN 2 points  // even low density with 2+ braces is code-like
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**:
- Brace density ≥ 0.03 OR 2+ braces found → **2 points** (strong evidence)
- Fewer braces → **0 points**

**Reasoning**: Curly braces are essential to code blocks in most languages (JavaScript, Java, C, Python, Go) but never appear in prose. Even a few braces are strong evidence.

---

#### Feature 4: Function Calls

**Purpose**: Identify function/method invocation patterns.

**Detection Pseudocode**:
```pascal
FUNCTION detectFunctionCalls(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or points)
  
  SEQUENCE
    // Pattern: identifier followed by parentheses with content
    // Examples: foo(), console.log(), array.map(), obj.method()
    
    patterns ← {
      /\b[a-zA-Z_$][\w$]*\s*\(/g,          // function calls: foo(
      /\b[a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*\s*\(/g,  // method calls: obj.foo(
      /\b(?:console|window|document|process)\.\w+\s*\(/g  // builtin objects
    }
    
    matches ← 0
    FOR EACH pattern IN patterns DO
      matches ← matches + countMatches(text, pattern)
    END FOR
    
    IF matches ≥ 2 THEN
      RETURN 2 points  // strong evidence
    ELSE IF matches = 1 THEN
      RETURN 1 point   // weak evidence (could be prose with "()")
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**:
- 2+ function calls detected → **2 points** (strong evidence)
- 1 function call → **1 point** (weak evidence)
- 0 function calls → **0 points**

**Reasoning**: Function call syntax (identifier followed by balanced parentheses) is specific to code and rarely appears in prose. Multiple occurrences confirm code.

---

### 1.2 Feature Detection: Weak Evidence

#### Feature 5: Semicolons

**Detection Pseudocode**:
```pascal
FUNCTION detectSemicolons(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or 1 point)
  
  SEQUENCE
    semicolons ← countOccurrences(text, ";")
    lines ← splitLines(text)
    
    // Semicolons terminate statements in JavaScript, Java, C, C++
    // Prose rarely uses semicolons except in lists
    
    IF semicolons ≥ 1 THEN
      RETURN 1 point  // weak evidence
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**: 1+ semicolons → **1 point** (weak evidence)

---

#### Feature 6: Operators

**Detection Pseudocode**:
```pascal
FUNCTION detectOperators(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or 1 point)
  
  SEQUENCE
    operatorPatterns ← {
      // Arithmetic: +, -, *, /, %, **
      // Logical: &&, ||, !, ^, &, |, ~
      // Comparison: ==, ===, !=, !==, <, >, <=, >=, <=>
      // Assignment: =, +=, -=, *=, /=, %=, &&=, ||=, &=, |=, ^=, >>=, <<=
      // Bitwise: <<, >>, &, |, ^, ~
      
      /(\+\+|--|\*\*|&&|\|\||<<|>>|===|!==|<=>|[+\-*\/%&|^!=<>]=|[+\-*\/%&|^<>!~])/g
    }
    
    matches ← 0
    FOR EACH pattern IN operatorPatterns DO
      matches ← matches + countMatches(text, pattern)
    END FOR
    
    IF matches ≥ 1 THEN
      RETURN 1 point  // weak evidence
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**: 1+ operators → **1 point** (weak evidence)

---

#### Feature 7: camelCase/snake_case Identifiers

**Detection Pseudocode**:
```pascal
FUNCTION detectCodingNamingConventions(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or 1 point)
  
  SEQUENCE
    // camelCase: myVariable, userId, fetchUserData
    // snake_case: my_variable, user_id, fetch_user_data
    
    camelCasePattern ← /\b[a-z]+([A-Z][a-z]+)+\b/g
    snake_casePattern ← /\b[a-z_]+_[a-z_]+\b/g
    
    camelCaseMatches ← countMatches(text, camelCasePattern)
    snake_caseMatches ← countMatches(text, snake_casePattern)
    
    totalMatches ← camelCaseMatches + snake_caseMatches
    
    IF totalMatches ≥ 2 THEN
      RETURN 1 point  // weak evidence (consistent naming convention)
    ELSE IF totalMatches = 1 THEN
      RETURN 0 points // single match could be prose (e.g., "someword")
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**: 2+ camelCase/snake_case identifiers → **1 point** (weak evidence)

---

#### Feature 8: Comments

**Detection Pseudocode**:
```pascal
FUNCTION detectComments(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or 1 point)
  
  SEQUENCE
    commentPatterns ← {
      /\/\/.*?$/gm,           // JavaScript/Java/C++ single-line
      /#.*?$/gm,              // Python/Shell single-line
      /--.*?$/gm,             // SQL/Lua single-line
      /\/\*[\s\S]*?\*\//g,    // Block comments
      /"""[\s\S]*?"""/g,      // Python docstrings
      /'''[\s\S]*?'''/g,      // Python triple quotes
      /<!--[\s\S]*?-->/g      // HTML comments
    }
    
    matches ← 0
    FOR EACH pattern IN commentPatterns DO
      matches ← matches + countMatches(text, pattern)
    END FOR
    
    IF matches ≥ 1 THEN
      RETURN 1 point  // weak evidence
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**: 1+ comment markers → **1 point** (weak evidence)

---

#### Feature 9: Indentation Pattern

**Detection Pseudocode**:
```pascal
FUNCTION detectIndentationPattern(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or 1 point)
  
  SEQUENCE
    lines ← splitLines(text)
    indentedLines ← 0
    
    FOR EACH line IN lines DO
      IF line starts with 4 spaces OR line starts with 1+ tabs THEN
        indentedLines ← indentedLines + 1
      END IF
    END FOR
    
    indentationRatio ← indentedLines / MAX(length(lines), 1)
    
    IF indentationRatio ≥ 0.2 THEN  // at least 20% of lines indented
      RETURN 1 point  // weak evidence
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**: 20%+ of lines indented → **1 point** (weak evidence)

---

#### Feature 10: Line Density Consistency

**Detection Pseudocode**:
```pascal
FUNCTION detectLineDensity(text)
  INPUT: text (string to analyze)
  OUTPUT: score (0 or 1 point)
  
  SEQUENCE
    lines ← splitLines(text)
    
    // Calculate average characters per line
    totalChars ← 0
    FOR EACH line IN lines DO
      totalChars ← totalChars + length(line)
    END FOR
    
    avgCharsPerLine ← totalChars / MAX(length(lines), 1)
    
    // Code typically: 40–120 chars per line
    // Prose typically: 60–90 chars per line (can overlap)
    // Minified code: 80–200 chars per line
    // Short code lines (e.g., shell): 10–50 chars per line
    
    IF 30 ≤ avgCharsPerLine ≤ 150 AND length(lines) ≥ 3 THEN
      RETURN 1 point  // weak evidence (code-like density)
    ELSE
      RETURN 0 points
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring**: 30–150 chars/line AND 3+ lines → **1 point** (weak evidence)

---

### 1.3 Composite Feature Scoring Algorithm

**Main Algorithm**:
```pascal
FUNCTION computeSourceCodeScore(text)
  INPUT: text (string to analyze)
  OUTPUT: classification (code or prose), score (0–10+), strong_evidence_present (boolean)
  
  SEQUENCE
    // ─── Detect all 10 features ──────────────────────────────────
    feature_code_keywords ← detectCodeKeywords(text)
    feature_imports ← detectImportStatements(text)
    feature_braces ← detectBraces(text)
    feature_function_calls ← detectFunctionCalls(text)
    
    feature_semicolons ← detectSemicolons(text)
    feature_operators ← detectOperators(text)
    feature_naming_conventions ← detectCodingNamingConventions(text)
    feature_comments ← detectComments(text)
    feature_indentation ← detectIndentationPattern(text)
    feature_line_density ← detectLineDensity(text)
    
    // ─── Check for strong evidence ──────────────────────────────
    strong_evidence_present ← (
      feature_code_keywords > 0 OR
      feature_imports > 0 OR
      feature_braces > 0 OR
      feature_function_calls ≥ 2
    )
    
    // ─── Calculate total score ──────────────────────────────────
    total_score ← (
      feature_code_keywords +
      feature_imports +
      feature_braces +
      feature_function_calls +
      feature_semicolons +
      feature_operators +
      feature_naming_conventions +
      feature_comments +
      feature_indentation +
      feature_line_density
    )
    
    // ─── Classification rule: MUST meet BOTH conditions ──────────
    // RULE: source code IF (total_score ≥ 6) AND (strong_evidence_present)
    
    IF total_score ≥ 6 AND strong_evidence_present THEN
      RETURN {
        classification: "code",
        score: total_score,
        strong_evidence: true,
        reason: "✓ Meets threshold (score ≥ 6) AND has strong evidence"
      }
    ELSE IF total_score ≥ 6 AND NOT strong_evidence_present THEN
      RETURN {
        classification: "prose",
        score: total_score,
        strong_evidence: false,
        reason: "✗ Meets score threshold but NO strong evidence type"
      }
    ELSE
      RETURN {
        classification: "prose",
        score: total_score,
        strong_evidence: strong_evidence_present,
        reason: "✗ Below score threshold (< 6) OR no strong evidence"
      }
    END IF
  END SEQUENCE
END FUNCTION
```

**Scoring Summary**:
- **Strong Evidence Required**: At least ONE of {Code Keywords, Imports, Braces, 2+ Function Calls}
- **Score Threshold**: Total score ≥ 6
- **Final Classification**:
  - `code` IF (score ≥ 6) AND (strong_evidence_present = true)
  - `prose` OTHERWISE

**Examples**:
- Score 8 with 1 keyword + 2 semicolons = **CODE** ✓ (meets both conditions)
- Score 8 with only semicolons/operators (no keywords/imports/braces/calls) = **PROSE** ✗ (lacks strong evidence)
- Score 5 with 1 keyword = **PROSE** ✗ (below score threshold)

---

### 1.4 Configuration

```javascript
const CODE_DETECTION_CONFIG = {
  enableSourceCodeDetection: true,
  scoreThreshold: 6,               // minimum total score
  requireStrongEvidence: true,     // must have at least one strong type
  
  features: {
    code_keywords: { enabled: true, strong: true, points: 3 },
    import_statements: { enabled: true, strong: true, points: 3 },
    braces: { enabled: true, strong: true, points: 2 },
    function_calls: { enabled: true, strong: true, points: 2 },
    
    semicolons: { enabled: true, strong: false, points: 1 },
    operators: { enabled: true, strong: false, points: 1 },
    naming_conventions: { enabled: true, strong: false, points: 1 },
    comments: { enabled: true, strong: false, points: 1 },
    indentation: { enabled: true, strong: false, points: 1 },
    line_density: { enabled: true, strong: false, points: 1 }
  },
  
  // Risk escalation
  credentialPatterns: [
    /(?:api[_-]?key|secret|password|pwd|token|auth|credential|bearer)/gi,
    /AKIA[A-Z0-9]{16}/g,           // AWS access key
    /(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}/g,
    /sk-[A-Za-z0-9\-]{20,}/g,      // OpenAI
    /eyJ[A-Za-z0-9\-_]{7,}\.eyJ[A-Za-z0-9\-_]{7,}\./g  // JWT
  ],
  
  escalateTo: {
    credentialFound: "moderate",
    credentialAndCode: "high"
  },
  
  // Logging
  logScores: true,
  verbosity: "info"
};
```

---

## 2. Integration with Existing Scanner

### 2.1 Placement in Pipeline

The code detection feature integrates into `scanner.js` as part of PATH A:

```pascal
FUNCTION runPathA(normalisedText)
  INPUT: normalisedText (scanned text)
  OUTPUT: findings (array of pattern matches)
  
  SEQUENCE
    findings ← []
    
    FOR EACH pattern IN TRUSTPROMPT_PATTERNS DO
      IF pattern.id = "source_code" THEN
        // ─── NEW: Multi-feature detection with dual threshold ───
        
        matches ← applyRegex(pattern.regex, normalisedText)
        
        FOR EACH match IN matches DO
          // Compute feature scores
          features ← {
            code_keywords: detectCodeKeywords(match),
            imports: detectImportStatements(match),
            braces: detectBraces(match),
            function_calls: detectFunctionCalls(match),
            semicolons: detectSemicolons(match),
            operators: detectOperators(match),
            naming_conventions: detectCodingNamingConventions(match),
            comments: detectComments(match),
            indentation: detectIndentationPattern(match),
            line_density: detectLineDensity(match)
          }
          
          score ← computeSourceCodeScore(match)
          
          // Check dual threshold
          IF score.classification ≠ "code" THEN
            log "[TrustPrompt/CodeDetection] Low confidence (score: " + score.score + ")"
            continue  // Skip low-confidence matches
          END IF
          
          // Assess risk escalation
          risk ← pattern.risk
          IF detectCredentials(match) THEN
            risk ← "moderate"
            log "[TrustPrompt/CodeDetection] Credentials detected; escalated to moderate"
          END IF
          
          finding ← {
            patternId: pattern.id,
            label: pattern.label,
            risk: risk,
            rawMatch: match,
            safeVersion: "[CODE BLOCK REMOVED]",
            validated: true,
            source: "A_regex_scored",
            codeMetrics: {
              score: score.score,
              strong_evidence: score.strong_evidence,
              classification: score.classification,
              reason: score.reason,
              features: features
            }
          }
          
          findings.push(finding)
        END FOR
      ELSE
        // ─── Existing pattern handling ───
        findings.push(...)
      END IF
    END FOR
    
    RETURN findings
  END SEQUENCE
END FUNCTION
```

### 2.2 Credential Escalation Logic

```pascal
FUNCTION detectCredentials(codeText)
  INPUT: codeText (source code to analyze)
  OUTPUT: hasCredentials (boolean)
  
  SEQUENCE
    FOR EACH pattern IN CONFIG.credentialPatterns DO
      IF pattern matches in codeText THEN
        RETURN true
      END IF
    END FOR
    RETURN false
  END SEQUENCE
END FUNCTION
```

---

## 3. Logging and Diagnostics

### 3.1 Feature Detection Logging

```pascal
FUNCTION logFeatureDetection(text, features, score)
  INPUT: text, features (detected features), score (classification result)
  OUTPUT: log output to console
  
  SEQUENCE
    IF NOT CONFIG.logScores THEN RETURN END IF
    
    log "[TrustPrompt/CodeDetection] Feature Analysis:"
    
    // Strong evidence
    IF features.code_keywords > 0 THEN
      log "  [Strong] Code Keywords: " + features.code_keywords + " points"
    END IF
    IF features.imports > 0 THEN
      log "  [Strong] Imports: " + features.imports + " points"
    END IF
    IF features.braces > 0 THEN
      log "  [Strong] Braces: " + features.braces + " points"
    END IF
    IF features.function_calls ≥ 2 THEN
      log "  [Strong] Function Calls: " + features.function_calls + " points"
    END IF
    
    // Weak evidence
    log "  [Weak] Semicolons: " + features.semicolons
    log "  [Weak] Operators: " + features.operators
    log "  [Weak] Naming: " + features.naming_conventions
    log "  [Weak] Comments: " + features.comments
    log "  [Weak] Indentation: " + features.indentation
    log "  [Weak] Line Density: " + features.line_density
    
    log ""
    log "  Total Score: " + score.score + " (threshold: 6)"
    log "  Strong Evidence: " + (score.strong_evidence ? "YES" : "NO")
    log "  Classification: " + score.classification
    log "  Reason: " + score.reason
  END SEQUENCE
END FUNCTION
```

### 3.2 Example Output

```
[TrustPrompt/CodeDetection] Feature Analysis:
  [Strong] Code Keywords: 3 points (function, return, const)
  [Strong] Braces: 2 points (2 braces, density 0.032)
  [Weak] Semicolons: 1 point (2 semicolons)
  [Weak] Operators: 1 point (3 operators detected)
  [Weak] Naming: 0 points
  [Weak] Comments: 1 point (1 comment marker)
  [Weak] Indentation: 1 point (40% of lines indented)
  [Weak] Line Density: 1 point (avg 65 chars/line)

  Total Score: 10 (threshold: 6)
  Strong Evidence: YES
  Classification: CODE
  Reason: ✓ Meets threshold (score ≥ 6) AND has strong evidence

[TrustPrompt/CodeDetection] Risk Escalation Check:
  Credentials detected: API_KEY pattern found
  Risk escalated: low → moderate
```

---

## 4. Data Structures

### 4.1 Features Object

```javascript
{
  code_keywords: 3,          // strong evidence
  import_statements: 3,      // strong evidence
  braces: 2,                 // strong evidence
  function_calls: 2,         // strong evidence
  semicolons: 1,             // weak evidence
  operators: 1,              // weak evidence
  naming_conventions: 1,     // weak evidence
  comments: 1,               // weak evidence
  indentation: 1,            // weak evidence
  line_density: 1            // weak evidence
}
```

### 4.2 Score Object

```javascript
{
  classification: "code",                    // "code" or "prose"
  score: 10,                                 // total feature points
  strong_evidence: true,                     // boolean
  reason: "✓ Meets threshold AND has strong evidence"
}
```

### 4.3 Enhanced Finding Structure

```javascript
{
  patternId: "source_code",
  label: "Source Code Block",
  risk: "moderate",                         // escalated from "low"
  rawMatch: "function foo() { return 42; }",
  safeVersion: "[CODE BLOCK REMOVED]",
  validated: true,
  source: "A_regex_scored",
  codeMetrics: {
    score: 10,
    strong_evidence: true,
    classification: "code",
    reason: "✓ Meets threshold (score ≥ 6) AND has strong evidence",
    features: {
      code_keywords: 3,
      imports: 3,
      braces: 2,
      function_calls: 2,
      // ... weak evidence features
    }
  }
}
```

---

## 5. Correctness Properties

### Property 1: Dual Threshold Validation
*For any* text block, the system SHALL classify as code IF AND ONLY IF (total_score ≥ 6) AND (at least one strong evidence type present).

### Property 2: Strong Evidence Necessity
*For any* prose text, the system SHALL NOT classify as code, even if weak features accumulate to score ≥ 6.

### Property 3: Code Recognition
*For any* legitimate code block (JavaScript function, SQL query, Python script), the system SHALL detect at least one strong evidence type and compute score ≥ 6, resulting in classification as code.

### Property 4: Credential Escalation
*For any* code block containing credential patterns, the system SHALL elevate risk from "low" to "moderate" or "high".

### Property 5: Prose Rejection
*For any* natural language prose, the system SHALL score below 6 or lack strong evidence, resulting in classification as prose.

---

## 6. Edge Cases and Handling

### 6.1 Minified Code
**Challenge**: Minified code has no indentation, few comments, long lines.
**Handling**: Strong feature detection (keywords, imports, braces) will catch minified code.

### 6.2 Shell Scripts
**Challenge**: Shell code has different syntax (no braces, different keywords).
**Handling**: Import detection and comment markers will identify shell scripts.

### 6.3 JSON/YAML Configuration Files
**Challenge**: JSON and YAML may have braces/colons but are not executable code.
**Handling**: Require strong evidence (keywords, imports, function calls). JSON alone won't trigger code classification.

### 6.4 Mixed Code/Prose
**Challenge**: Documentation explaining code snippets.
**Handling**: Analyze each distinct code block separately; prose describing code won't meet strong evidence criteria.

---

## 7. Performance Optimization

### 7.1 Benchmark Targets

- **Per-feature analysis**: 50–100 character block in <0.5ms per feature
- **All 10 features**: <5ms total computation
- **Per-block classification**: <10ms (including feature + threshold check)
- **Total PATH A overhead**: <5% slower than baseline

### 7.2 Optimization Strategies

1. **Pre-compiled Regex**: Cache all regex patterns
2. **Early Exit**: If score already exceeds threshold and strong evidence found, skip remaining weak features
3. **Lazy Evaluation**: Compute expensive features only if basic ones don't meet criteria
4. **Line Sampling**: For very large blocks, sample representative lines instead of analyzing entire block

---

## 8. Integration Checklist

### Code Changes Required

- [ ] Implement 10 feature detection functions in `code-detector.js` or `scanner.js`
- [ ] Implement `computeSourceCodeScore()` main algorithm
- [ ] Update `runPathA()` to call multi-feature scoring for `source_code` pattern
- [ ] Implement credential detection and risk escalation
- [ ] Add logging and diagnostic output functions
- [ ] Update configuration with feature points and thresholds
- [ ] Preserve existing markdown regex as fallback
- [ ] Update finding structure to include `codeMetrics` field

### Testing Requirements

- **Unit Tests**: Each feature function with code/prose samples
- **Integration Tests**: Full scan with mixed code blocks, verify scoring and escalation
- **Regression Tests**: Existing source_code detection still works
- **Edge Cases**: Minified code, shell scripts, JSON, HTML, mixed content
- **Performance Tests**: Verify overhead < 5% on real scans

---

## 9. Future Extensions

1. **Machine Learning Classification**: Train on labeled code/non-code examples
2. **Language-Specific Weighting**: Adjust feature weights based on detected language
3. **AST Parsing**: Parse code blocks to extract structure (if available)
4. **Semantic Credential Detection**: Cross-reference detected credentials with known patterns (Stripe, OpenAI, etc.)
5. **Context Integration**: Consider surrounding text for intentional code sharing

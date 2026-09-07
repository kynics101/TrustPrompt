# Source Code Detection Improvement — Design Document

## Overview

This document specifies the architecture and implementation strategy for a multi-signal scoring framework that improves the detection and risk escalation of source code blocks containing embedded credentials, proprietary logic, or configuration data.

### Scope

The feature improves detection and risk classification of source code blocks through:
1. **Multi-signal scoring framework** — combines 5 independent signals
2. **Signal computation algorithms** — each signal extracts specific code characteristics
3. **Score normalization and aggregation** — combines signals into a composite score
4. **Threshold calibration** — configurable detection thresholds
5. **Context-aware escalation** — raises risk when code contains embedded secrets
6. **Markdown regex fallback** — integrates with existing code block detection
7. **Logging and diagnostics** — comprehensive framework for debugging and tuning

### Goals

- **Reduce False Negatives**: Detect code blocks that may not match classic markdown fence patterns (indented, HTML-escaped, inline code)
- **Reduce False Positives**: Distinguish code blocks from normal prose containing curly braces, brackets, or technical terms
- **Risk Escalation**: Elevate "low" code findings to "moderate" when they contain evidence of embedded secrets
- **Configurability**: Enable tuning of thresholds without code changes
- **Transparency**: Log all signal computations and decisions for audit and tuning

---

## Architecture

### 1. Multi-Signal Scoring Framework

Each code block is analyzed through 5 independent signals:

#### Signal 1: Structure Density

**Purpose**: Detect syntactic characteristics typical of code (nested brackets, high punctuation concentration).

**Algorithm**:
```javascript
function computeStructureDensity(text) {
  const BRACKET_PAIRS = [
    ['(', ')'],
    ['{', '}'],
    ['[', ']'],
    ['<', '>']
  ];
  
  let bracketCount = 0;
  for (const [open, close] of BRACKET_PAIRS) {
    bracketCount += (text.match(new RegExp(`\\${open}`, 'g')) || []).length;
    bracketCount += (text.match(new RegExp(`\\${close}`, 'g')) || []).length;
  }
  
  // Lines with code-like punctuation: colon, semicolon, comma, arrow, equals
  const lineCount = text.split('\n').length;
  const codePunctuation = (text.match(/[:;,=→=>/\\]/g) || []).length;
  const punctuationDensity = codePunctuation / Math.max(text.length, 1);
  
  const bracketDensity = bracketCount / Math.max(text.length, 1);
  
  // Normalize to 0–1
  // Typical code has 0.01–0.05 punctuation density
  // Typical code has 0.01–0.03 bracket density
  const structureDensity = Math.min(1.0, bracketDensity + punctuationDensity);
  
  return {
    signal: "structure_density",
    value: structureDensity,
    components: {
      bracketDensity,
      punctuationDensity,
      bracketCount,
      codePunctuation
    }
  };
}
```

**Thresholds**:
- `0.00–0.05`: Not code-like (normal prose)
- `0.05–0.15`: Weakly code-like (may be code or punctuation-heavy prose)
- `0.15–1.00`: Strongly code-like (brackets, operators, punctuation)

**Reasoning**: Code has characteristic punctuation patterns (operators, delimiters) not found in natural language prose. Prose rarely has density >0.05.

---

#### Signal 2: Token Pattern Recognition

**Purpose**: Identify language-specific keywords and syntax patterns (variable declarations, function definitions, imports, comments).

**Algorithm**:
```javascript
const LANGUAGE_PATTERNS = {
  javascript: {
    weight: 1.2,
    patterns: [
      /\b(?:const|let|var|function|async|await|class|import|export|require)\b/i,
      /\b(?:return|throw|try|catch|finally|if|else|for|while|do)\b/i,
      /\b(?:new|instanceof|typeof|void|delete|in|of)\b/i,
      /=>|[a-zA-Z0-9_]+\s*:\s*(?:function|async function|\(.*?\)|{)/,  // arrow fn or method
      /\/\/.*$|\/\*[\s\S]*?\*\//  // single-line or block comment
    ]
  },
  python: {
    weight: 1.1,
    patterns: [
      /\b(?:def|class|import|from|return|async|await|if|elif|else|for|while|try|except|finally)\b/,
      /^\s{4,}[a-zA-Z_]/m,  // indented blocks
      /#.*$/m,              // comments
      /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/m  // assignments
    ]
  },
  sql: {
    weight: 1.0,
    patterns: [
      /\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|DATABASE)\b/i,
      /\b(?:AND|OR|NOT|IN|BETWEEN|LIKE|EXISTS)\b/i,
      /;$/m  // SQL statement terminator
    ]
  },
  shell: {
    weight: 0.9,
    patterns: [
      /^\s*(?:#!/bin/bash|#!/bin/sh)$/m,  // shebang
      /\b(?:if|then|else|fi|for|do|done|while|case|esac|function)\b/,
      /\$\{[A-Za-z0-9_]+\}|\$[A-Za-z0-9_]+/,  // variable expansion
      /\|\s*(?:grep|sed|awk|cut|sort|uniq)/  // pipelines
    ]
  },
  json: {
    weight: 0.8,
    patterns: [
      /^\s*\{[\s\S]*\}$/,  // top-level object
      /"[^"]*"\s*:/,        // key-value pairs
      /^\s*\[[\s\S]*\]$/m   // top-level array
    ]
  },
  xml_html: {
    weight: 0.7,
    patterns: [
      /<[a-zA-Z][^>]*>/,    // XML/HTML tags
      /<!DOCTYPE|<html|<body|<div|<span/i,
      /xmlns:|xsi:/,        // XML namespaces
      /\/>/                 // self-closing tags
    ]
  }
};

function computeTokenPattern(text) {
  const langScores = {};
  let maxScore = 0;
  let detectedLanguage = null;
  
  for (const [lang, config] of Object.entries(LANGUAGE_PATTERNS)) {
    let matches = 0;
    for (const pattern of config.patterns) {
      matches += (text.match(pattern) || []).length;
    }
    
    const score = (matches / Math.max(text.split('\n').length, 1)) * config.weight;
    langScores[lang] = { matches, score };
    
    if (score > maxScore) {
      maxScore = score;
      detectedLanguage = lang;
    }
  }
  
  // Normalize to 0–1: >3 language pattern matches = high confidence
  const tokenPatternSignal = Math.min(1.0, maxScore / 3.0);
  
  return {
    signal: "token_pattern",
    value: tokenPatternSignal,
    detectedLanguage,
    components: langScores
  };
}
```

**Thresholds**:
- `0.00–0.20`: No code patterns detected
- `0.20–0.50`: Weak language indicators
- `0.50–1.00`: Strong language patterns

**Reasoning**: Code contains language-specific keywords, operators, and syntax that do not appear in normal prose. A JavaScript function declaration, Python import, or SQL SELECT is a strong indicator.

---

#### Signal 3: Entropy Distribution

**Purpose**: Detect variability in character composition (code has high entropy; repeated phrases have low entropy).

**Algorithm**:
```javascript
function computeEntropyDistribution(text) {
  // Compute Shannon entropy for the entire text
  const fullEntropy = shannonEntropy(text);
  
  // Compute entropy for lines and take the median
  const lines = text.split('\n').filter(l => l.length > 3);
  const lineEntropies = lines.map(line => shannonEntropy(line));
  lineEntropies.sort((a, b) => a - b);
  const medianLineEntropy = lineEntropies[Math.floor(lineEntropies.length / 2)];
  
  // Code typically has:
  //   - Full entropy 3.5–5.5 bits/char (varied content)
  //   - Median line entropy 2.5–4.0 bits/char (each line has some uniqueness)
  // Prose typically has:
  //   - Full entropy 4.0–5.0 bits/char (natural language is more predictable)
  //   - Median line entropy 2.0–3.5 bits/char (repeated words lower entropy)
  
  const entropyScore = (fullEntropy + medianLineEntropy) / 2;
  
  // Normalize: score 3.0–5.5 → signal 0.0–1.0
  const entropySignal = Math.min(1.0, Math.max(0, (entropyScore - 3.0) / 2.5));
  
  return {
    signal: "entropy_distribution",
    value: entropySignal,
    components: {
      fullEntropy,
      medianLineEntropy,
      lineCount: lines.length
    }
  };
}
```

**Thresholds**:
- Entropy < 3.0: Very low (repeated content, pseudo-code)
- Entropy 3.0–3.5: Low (code with repetitive patterns)
- Entropy 3.5–4.5: Moderate (typical code or prose)
- Entropy > 4.5: High (random-looking, encrypted, or highly varied)

**Reasoning**: Code (especially credentials) tends to have higher entropy than prose due to character variety. However, this alone is not sufficient; regex patterns have high entropy but are code.

---

#### Signal 4: Credential Indicators

**Purpose**: Detect evidence of embedded secrets (API keys, passwords, connection strings, environment variables).

**Algorithm**:
```javascript
function computeCredentialIndicators(text) {
  const credentialPatterns = [
    // Variable assignments with secret-like values
    /(?:api[_-]?key|secret|password|pwd|token|auth|credential|bearer|api_secret|private_key)\s*[:=]\s*["']?[A-Za-z0-9\-_+\/=]{10,}["']?/gi,
    // Environment variable references
    /\$\{(?:API_KEY|SECRET|PASSWORD|TOKEN|BEARER|AUTH)\}/gi,
    // Connection strings (mongodb://, postgresql://, mysql://)
    /(?:mongodb|postgresql|mysql|mariadb|redis|amqp):\/\/[^\s]+/gi,
    // AWS access key pattern (AKIA...)
    /AKIA[A-Z0-9]{16}/g,
    // GitHub token patterns
    /(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}/g,
    // OpenAI key (sk-...)
    /sk-[A-Za-z0-9\-]{20,}/g,
    // JWT patterns (basic heuristic)
    /eyJ[A-Za-z0-9\-_]{7,}\.eyJ[A-Za-z0-9\-_]{7,}\.[A-Za-z0-9\-_]{20,}/g,
    // Base64-encoded data (long sequences of base64 chars)
    /[A-Za-z0-9+\/]{40,}={0,3}(?:\n|$)/g,
    // Private key markers
    /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    // URLs with embedded credentials
    /https?:\/\/(?:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@)?[^\s]+/g
  ];
  
  let credentialCount = 0;
  for (const pattern of credentialPatterns) {
    credentialCount += (text.match(pattern) || []).length;
  }
  
  // Normalize: 0 indicators = 0.0, 1+ indicators = 0.5, 3+ = 1.0
  const credentialSignal = Math.min(1.0, credentialCount * 0.33);
  
  return {
    signal: "credential_indicators",
    value: credentialSignal,
    components: {
      credentialCount,
      patterns: credentialPatterns.length
    }
  };
}
```

**Thresholds**:
- `0.00`: No credential indicators
- `0.33`: One potential credential indicator
- `0.67`: Two potential indicators
- `1.00`: Three or more indicators

**Reasoning**: Finding credential patterns (API keys, connection strings, private keys) in code blocks is a strong indicator of embedded secrets and high risk.

---

#### Signal 5: Markup and Formatting Consistency

**Purpose**: Detect code-block markers and formatting (indentation, monospace escaping, HTML escaping).

**Algorithm**:
```javascript
function computeMarkupConsistency(text) {
  // Count code-block markers
  const backtickFences = (text.match(/```/g) || []).length;
  const tildeIndentFences = (text.match(/~~~\n/g) || []).length;
  const htmlCodeTags = (text.match(/<code>|<pre>/gi) || []).length;
  const htmlEscapes = (text.match(/&lt;|&gt;|&amp;|&quot;/g) || []).length;
  
  // Detect consistent indentation (4 spaces or tab)
  const lines = text.split('\n');
  const indentedLines = lines.filter(l => /^(\s{4,}|\t)/.test(l)).length;
  const indentationRatio = indentedLines / Math.max(lines.length, 1);
  
  // Detect monospace rendering hints (two or more spaces on same line)
  const monospacedLines = lines.filter(l => /\s{2,}/.test(l)).length;
  const monospaceRatio = monospacedLines / Math.max(lines.length, 1);
  
  // Markup score: presence of code markers or high indentation suggests code
  const markupScore = (
    backtickFences * 0.3 +           // high weight for explicit markers
    tildeIndentFences * 0.3 +
    htmlCodeTags * 0.2 +
    (htmlEscapes > 0 ? 0.1 : 0) +    // HTML-escaped code is very likely code
    indentationRatio * 0.1 +         // consistent indentation suggests code
    monospaceRatio * 0.1
  );
  
  const markupSignal = Math.min(1.0, markupScore);
  
  return {
    signal: "markup_consistency",
    value: markupSignal,
    components: {
      backtickFences,
      tildeIndentFences,
      htmlCodeTags,
      htmlEscapes,
      indentationRatio: indentationRatio.toFixed(2),
      monospaceRatio: monospaceRatio.toFixed(2)
    }
  };
}
```

**Thresholds**:
- `0.00`: No markup hints
- `0.10–0.30`: Weak markup (some indentation)
- `0.30–0.70`: Moderate markup (indented or partially escaped)
- `0.70–1.00`: Strong markup (explicit code block markers)

**Reasoning**: Presence of code-block markers, indentation, or HTML escaping is a strong indicator that the author intended the text to be interpreted as code.

---

### 2. Score Aggregation

After computing all 5 signals, combine them into a composite score:

```javascript
function aggregateSignals(signals) {
  const SIGNAL_WEIGHTS = {
    structure_density:       0.15,  // weak signal (prone to false positives)
    token_pattern:           0.30,  // strong signal (language patterns are reliable)
    entropy_distribution:    0.20,  // moderate signal (but entropy varies by language)
    credential_indicators:   0.25,  // very strong signal (credentials are high-confidence)
    markup_consistency:      0.10   // baseline signal (explicit markers are obvious)
  };
  
  let weightedSum = 0;
  let weightSum = 0;
  
  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.signal] || 0;
    weightedSum += signal.value * weight;
    weightSum += weight;
  }
  
  const compositeScore = weightSum > 0 ? weightedSum / weightSum : 0;
  
  return {
    compositeScore,
    normalizedScore: Math.min(1.0, Math.max(0, compositeScore)),
    signals: signals.map(s => ({
      signal: s.signal,
      value: s.value.toFixed(3),
      weight: SIGNAL_WEIGHTS[s.signal]
    }))
  };
}
```

**Composite Score Interpretation**:
- `0.00–0.25`: Low confidence (not code)
- `0.25–0.50`: Moderate confidence (may be code)
- `0.50–0.75`: High confidence (likely code)
- `0.75–1.00`: Very high confidence (definitely code)

---

### 3. Threshold Calibration and Configuration

Thresholds are configurable via a configuration object:

```javascript
const CODE_DETECTION_CONFIG = {
  // ── Global thresholds ────────────────────────────────────────
  enableSourceCodeDetection:  true,
  codeScoreThreshold:         0.50,    // composite score to trigger "code block" finding
  credentialEscalationThreshold: 0.35, // credential signal alone triggers escalation
  
  // ── Signal-specific thresholds ────────────────────────────────
  signals: {
    structure_density: {
      threshold: 0.10,
      weight:    0.15,
      enabled:   true
    },
    token_pattern: {
      threshold: 0.25,
      weight:    0.30,
      enabled:   true
    },
    entropy_distribution: {
      threshold: 0.40,
      weight:    0.20,
      enabled:   true
    },
    credential_indicators: {
      threshold: 0.10,  // very sensitive; even one credential is concerning
      weight:    0.25,
      enabled:   true,
      escalatesToModerate: true  // if this signal > threshold, escalate to moderate
    },
    markup_consistency: {
      threshold: 0.20,
      weight:    0.10,
      enabled:   true
    }
  },
  
  // ── Logging and diagnostics ──────────────────────────────────
  logScores:          true,
  logSignalDetails:   true,
  logEscalations:     true,
  verbosity:          "info"  // "debug", "info", "warn", "error"
};
```

Configuration can be updated at runtime:

```javascript
function updateCodeDetectionConfig(newConfig) {
  Object.assign(CODE_DETECTION_CONFIG, newConfig);
  console.log("[TrustPrompt/CodeDetection] Config updated:", CODE_DETECTION_CONFIG);
}
```

---

### 4. Risk Escalation Logic

When credential indicators are detected, escalate code block risk:

```javascript
function evaluateCodeRiskEscalation(signals, baseRisk) {
  const credentialSignal = signals.find(s => s.signal === "credential_indicators");
  
  if (credentialSignal && credentialSignal.value >= CODE_DETECTION_CONFIG.signals.credential_indicators.threshold) {
    const escalateTo = CODE_DETECTION_CONFIG.signals.credential_indicators.escalatesToModerate;
    if (escalateTo) {
      console.log(`[TrustPrompt/CodeDetection] Credential escalation: ${baseRisk} → moderate`);
      return "moderate";
    }
  }
  
  return baseRisk;
}
```

**Escalation Rules**:
1. If `credential_indicators > 0.10`, escalate finding from "low" to "moderate"
2. If `credential_indicators > 0.35` AND composite score > 0.50, escalate to "high"
3. If code contains API key / JWT patterns (detected by PATH A), finding is already "high"

---

### 5. Integration with Existing Scanner

#### 5.1 Placement in Pipeline

The code detection improvement integrates into `scanner.js` as part of PATH A:

```javascript
function runPathA(normalisedText) {
  const findings = [];
  
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    if (!pattern.regex) continue;
    
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    
    while ((match = re.exec(normalisedText)) !== null) {
      const raw = match[0];
      
      // ... (existing entropy and context checks)
      
      // NEW: For source_code pattern, apply multi-signal scoring
      if (pattern.id === "source_code") {
        const signals = [
          computeStructureDensity(raw),
          computeTokenPattern(raw),
          computeEntropyDistribution(raw),
          computeCredentialIndicators(raw),
          computeMarkupConsistency(raw)
        ];
        
        const { compositeScore, signals: signalDetails } = aggregateSignals(signals);
        
        if (compositeScore < CODE_DETECTION_CONFIG.codeScoreThreshold) {
          console.log(`[TrustPrompt/CodeDetection] Low confidence (${compositeScore.toFixed(2)}); discarding`);
          continue;  // Skip low-confidence matches
        }
        
        let riskLevel = pattern.risk;
        riskLevel = evaluateCodeRiskEscalation(signals, riskLevel);
        
        findings.push({
          patternId:   pattern.id,
          label:       pattern.label,
          risk:        riskLevel,
          rawMatch:    raw,
          safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[CODE BLOCK REMOVED]",
          validated:   true,  // Multi-signal scoring provides confidence
          source:      "A_regex_scored",
          codeMetrics: {
            compositeScore,
            signals: signalDetails
          }
        });
      } else {
        // Existing pattern handling
        findings.push({...});
      }
    }
  }
  
  return findings;
}
```

#### 5.2 Markdown Regex Fallback

Preserve existing markdown detection and enhance it:

```javascript
// Keep existing regex to catch explicit markdown fences
{
  id: "source_code",
  label: "Source Code Block",
  reason: "Code blocks may contain hardcoded credentials, internal logic, proprietary algorithms, or configuration details that should not be shared externally. Even seemingly harmless code can reveal system architecture or security assumptions.",
  regex: /```[\s\S]*?```|`[^`\n]{10,}`|^[ \t]{4,}.{1,}(?:\n[ \t]{4,}.+)*/gm,  // fences + indented
  risk: "low",
  validate: null,
  sanitize: (_m) => "[CODE BLOCK REMOVED]"
}
```

The regex matches:
- Triple-backtick fences: ` ```...``` `
- Inline code: `` `code` ``
- Indented code blocks (4+ spaces): multiline indented text

When a match is found, the multi-signal scoring framework evaluates it. If score is high, the risk escalates to "moderate". If credentials are detected, it may escalate to "high".

---

## 6. Context-Aware Detection

### 6.1 Contextual Heuristics

```javascript
function isCodeContextual(text, normalizedFullText, matchIndex) {
  // Check if the match is surrounded by code-like context
  const BEFORE_WINDOW = 100;
  const AFTER_WINDOW = 100;
  
  const before = normalizedFullText.slice(
    Math.max(0, matchIndex - BEFORE_WINDOW),
    matchIndex
  );
  const after = normalizedFullText.slice(
    matchIndex + text.length,
    Math.min(normalizedFullText.length, matchIndex + text.length + AFTER_WINDOW)
  );
  
  // Surrounding code indicators
  const contextIndicators = [
    /code|snippet|example|implementation|function|class|method|variable/gi,
    /paste|gist|github|repo|repository|source/gi,
    /python|javascript|java|bash|shell|sql|console|terminal|output/gi
  ];
  
  const contextScore = contextIndicators.reduce((acc, pattern) => {
    return acc + 
      (before.match(pattern) || []).length +
      (after.match(pattern) || []).length;
  }, 0);
  
  return contextScore > 0;
}
```

---

## 7. Logging and Diagnostics Framework

### 7.1 Diagnostic Output

```javascript
function logCodeDetection(findings, signals, compositeScore) {
  if (!CODE_DETECTION_CONFIG.logScores) return;
  
  console.log(`[TrustPrompt/CodeDetection] Composite Score: ${compositeScore.toFixed(3)}`);
  
  if (CODE_DETECTION_CONFIG.logSignalDetails) {
    for (const signal of signals) {
      console.log(
        `  [Signal] ${signal.signal}: ${signal.value.toFixed(3)} ` +
        `(weight: ${signal.weight}, threshold: ${CODE_DETECTION_CONFIG.signals[signal.signal].threshold})`
      );
    }
  }
  
  if (CODE_DETECTION_CONFIG.logEscalations && findings.length > 0) {
    for (const f of findings) {
      console.log(
        `[TrustPrompt/CodeDetection] Escalation: ${f.patternId} ` +
        `risk: ${f.risk}, metrics: ${JSON.stringify(f.codeMetrics, null, 2)}`
      );
    }
  }
}
```

### 7.2 Debug Output Format

Example output for a code block containing an API key:

```
[TrustPrompt/CodeDetection] Processing source_code match (length 234)
  [Signal] structure_density: 0.182 (weight: 0.15, threshold: 0.10)
  [Signal] token_pattern: 0.680 (weight: 0.30, threshold: 0.25) — javascript detected
  [Signal] entropy_distribution: 0.420 (weight: 0.20, threshold: 0.40)
  [Signal] credential_indicators: 0.660 (weight: 0.25, threshold: 0.10) — 2 indicators found
  [Signal] markup_consistency: 0.120 (weight: 0.10, threshold: 0.20)
  Composite Score: 0.521 (threshold: 0.50) ✓ PASS
[TrustPrompt/CodeDetection] Escalation: source_code → moderate
  Reason: credential_indicators signal (0.660) exceeds escalation threshold (0.35)
  Findings: 1
```

---

## 8. Data Structures

### 8.1 Signal Structure

```javascript
{
  signal: "credential_indicators",
  value: 0.660,                    // normalized 0–1
  components: {
    credentialCount: 2,
    patterns: 10
  }
}
```

### 8.2 Aggregated Score Structure

```javascript
{
  compositeScore: 0.521,
  normalizedScore: 0.521,
  signals: [
    { signal: "structure_density", value: "0.182", weight: 0.15 },
    { signal: "token_pattern", value: "0.680", weight: 0.30 },
    { signal: "entropy_distribution", value: "0.420", weight: 0.20 },
    { signal: "credential_indicators", value: "0.660", weight: 0.25 },
    { signal: "markup_consistency", value: "0.120", weight: 0.10 }
  ]
}
```

### 8.3 Enhanced Finding Structure

```javascript
{
  patternId: "source_code",
  label: "Source Code Block",
  risk: "moderate",                    // escalated from "low"
  rawMatch: "const apiKey = 'sk-...'",
  safeVersion: "[CODE BLOCK REMOVED]",
  validated: true,
  source: "A_regex_scored",
  codeMetrics: {                       // NEW
    compositeScore: 0.521,
    signals: [
      { signal: "credential_indicators", value: "0.660", weight: 0.25 },
      // ... other signals
    ]
  }
}
```

---

## 9. Integration Checklist

### 9.1 Code Changes Required

- [ ] Add signal computation functions to `scanner.js` or new `code-detector.js` module
- [ ] Add `aggregateSignals()` function
- [ ] Add `CODE_DETECTION_CONFIG` configuration object
- [ ] Update `runPathA()` to apply multi-signal scoring to `source_code` pattern
- [ ] Add `evaluateCodeRiskEscalation()` to governance rule evaluation
- [ ] Add helper function `isCodeContextual()`
- [ ] Add logging framework functions
- [ ] Update `BASE_SCORES` and `ENTITY_TIER` if needed for escalated findings
- [ ] Update existing `source_code` pattern in `TRUSTPROMPT_PATTERNS`

### 9.2 Testing Requirements

- **Unit Tests**: Each signal function with sample code and prose
- **Integration Tests**: Full scan with mixed code blocks, verify escalation logic
- **Regression Tests**: Existing source_code detection still works
- **Calibration Tests**: Verify threshold configuration changes behavior
- **Performance Tests**: Multi-signal scoring adds minimal overhead (<5ms per code block)

---

## 10. Correctness Properties

### Property 1: Valid Code Recognition
*For any* legitimate code block (JavaScript function, SQL query, Python class), the multi-signal score SHALL exceed the threshold (0.50) and the block SHALL be flagged as `source_code`.

### Property 2: Prose Rejection
*For any* natural language prose (paragraph, bullet list, descriptive text), the composite score SHALL be below threshold and the text SHALL NOT be flagged as `source_code`.

### Property 3: Credential Escalation
*For any* code block that contains API key, JWT, or password pattern, the `credential_indicators` signal SHALL exceed 0.10 and the finding's `risk` SHALL be escalated to `moderate` or `high`.

### Property 4: Threshold Configurability
*For any* valid configuration update via `updateCodeDetectionConfig()`, subsequent scans SHALL apply the new thresholds and produce different results (higher threshold → fewer matches, lower threshold → more matches).

### Property 5: Signal Independence
*For any* code block, each signal SHALL be computed independently and SHALL NOT depend on other signals' values. The composite score SHALL be a weighted average of independent values.

---

## 11. Performance Optimization

### 11.1 Benchmark Targets

- **Per-block analysis**: 50–100 character code block in <1ms
- **Multi-signal computation**: 5 signals computed in <2ms
- **Full source_code pattern**: 10 matches across 10KB text in <20ms
- **Total PATH A overhead**: <5% slower than baseline (existing patterns only)

### 11.2 Optimization Strategies

1. **Lazy Evaluation**: Compute expensive signals only if basic signals already meet threshold
2. **Regex Caching**: Pre-compile credential patterns
3. **Early Exit**: If composite score falls below threshold midway, stop computing remaining signals
4. **Sampling**: For very large code blocks, sample lines instead of analyzing entire block

---

## 12. Configuration Example

```javascript
// Tuned for high sensitivity (more detections, may have false positives)
const SENSITIVE_CONFIG = {
  enableSourceCodeDetection: true,
  codeScoreThreshold: 0.40,
  signals: {
    token_pattern: { weight: 0.40 },       // increase weight
    credential_indicators: { weight: 0.30 }
  }
};

// Tuned for high specificity (fewer detections, fewer false positives)
const CONSERVATIVE_CONFIG = {
  enableSourceCodeDetection: true,
  codeScoreThreshold: 0.65,                // higher threshold
  signals: {
    token_pattern: { weight: 0.35 },       // decrease weight
    structure_density: { threshold: 0.15 } // higher threshold
  }
};
```

---

## 13. Future Extensions

1. **Machine Learning Classifier**: Train a model on labeled code/non-code examples
2. **Language-Specific Parsers**: Use actual parsers for JavaScript, Python, etc. (if available)
3. **AST Analysis**: Parse code blocks to extract structure (function definitions, variable assignments)
4. **Semantic Credential Detection**: Cross-reference detected credentials with known patterns (Stripe test keys, etc.)
5. **Differential Scoring**: Weight signals based on detected language (weight token_pattern higher for JavaScript than for natural language)


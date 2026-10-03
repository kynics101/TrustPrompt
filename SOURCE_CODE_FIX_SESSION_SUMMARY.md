# Source Code Detection PATH A Integration - Fix Summary

## Problem
Source code detection was running and successfully identifying code (e.g., "Score: 6, Classification: code"), but findings were not being recorded in PATH A, remaining at A:0.

## Root Cause
**`runSourceCodeDetection()` was being called with `rawText` instead of the normalized `textRegex`.**

Line 2354 in scanner.js:
```javascript
// BEFORE (WRONG):
const sourceCodeFindings = runSourceCodeDetection(rawText);

// AFTER (CORRECT):
const sourceCodeFindings = runSourceCodeDetection(textRegex);
```

### Why This Matters
- `rawText`: Original unmodified user input
- `textRegex`: Text normalized specifically for regex-based pattern matching (preserves code structure)
- `textNLP`: Text normalized for NLP analysis (may alter code structure)

The `extractUnformattedCodeBlocks()` function expects properly structured text to detect code-like lines by:
- Looking for code keywords (const, let, var, if, for, etc.)
- Detecting indentation patterns
- Finding braces, semicolons, function calls
- Analyzing line structure

Using the normalized `textRegex` ensures the text maintains the structure needed for accurate code detection.

## Changes Made

### 1. Fixed Function Call (scanner.js line 2354)
```javascript
// Changed from:
const sourceCodeFindings = runSourceCodeDetection(rawText);

// Changed to:
const sourceCodeFindings = runSourceCodeDetection(textRegex);
```

### 2. Enhanced Debugging in runSourceCodeDetection()
Added detailed logging to trace:
- Input text length
- Number of blocks extracted
- Each block being processed
- Finding creation and push operations
- Error handling with try/catch blocks

### 3. Verification Points in scan()
Logging already present at:
- Line 2357: SOURCE CODE DETECTION findings count
- Line 2378: PATH A findings after concat
- Line 2402: After merge count
- Line 2408: After suppressPlaceholders
- Line 2415: FINAL RESULT with A:, B:, C:, SRC: breakdown

## How Source Code Flows Through PATH A

```
rawText ("const myValue = 5;")
         ↓
TrustNormalizer.normalize()
         ↓ Returns { masked, textRegex, textNLP, wasCapsConverted }
         ↓
runSourceCodeDetection(textRegex)  ← KEY FIX: Was using rawText
         ↓
extractUnformattedCodeBlocks(textRegex)
         ↓ Detects code-like lines with keywords/syntax
         ↓
computeSourceCodeScore() → Classification: 'code', Score: 6+
         ↓
findings.push({ patternId: 'source_code', ... })  ← Verified in logging
         ↓
sourceCodeFindings array returned
         ↓
pathAFindings.concat(sourceCodeFindings)  ← Added to PATH A at line 2378
         ↓
mergeAndDedupe() → consolidated findings
         ↓
suppressPlaceholders() → filter known placeholders
         ↓
computeRiskScore() → BASE_SCORES['source_code'] = 5 points (Moderate)
         ↓
Final Result: A:1, score: 5.00, findings: [source_code]
```

## Scoring Information

- **Pattern ID**: `source_code`
- **BASE_SCORE**: 5 (Moderate-impact, per Table 10 of specification)
- **Classification**: Code or Prose (determined by computeSourceCodeScore)
- **Features**:
  - Strong evidence (3 pts each): code_keywords, imports, braces, function_calls
  - Weak evidence (1 pt each): semicolons, assignments, camelCase, comments, line_density
  - Classification threshold: Score ≥ 6 AND at least one strong evidence marker

## Expected Console Output After Fix

```
[TrustPrompt/scanner] Running SOURCE CODE DETECTION (FIRST - before linguistic analysis)...
[TrustPrompt/scanner] runSourceCodeDetection: extracted 1 blocks
[TrustPrompt/scanner] Processing block: "const myValue = 5;" classification=code
[TrustPrompt/scanner] Pushing finding: patternId=source_code, risk=low
[TrustPrompt/scanner] runSourceCodeDetection returning 1 findings
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
[TrustPrompt/scanner] Added 1 source code findings to PATH A
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5 | findings: 1 (A:1 B:0 C:0 SRC:1)
```

## Testing
The fix enables:
1. Single-line code like `const myValue = 5;` to be detected
2. Multi-line code blocks to be detected
3. Source code findings to be added to PATH A (not a separate SRC path)
4. Risk score of 5.00 (Moderate) for source code
5. Governance rule evaluation with source code as a valid entity type

## Verification Checklist
- [ ] Run test with `const myValue = 5;` → expect A:1, findings:[source_code], score:5.00
- [ ] Run test with multi-line code block → expect A:1, findings:[source_code], score:5.00
- [ ] Verify console shows "SOURCE CODE DETECTION findings: 1"
- [ ] Verify console shows "Added 1 source code findings to PATH A"
- [ ] Verify governance rules apply correctly (Rule 2/3 eligibility checks)
- [ ] Verify "const" and "myValue" are no longer detected as names/org (PATH C improvement)

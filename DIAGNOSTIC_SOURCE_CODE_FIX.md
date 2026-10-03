# Diagnostic Guide: Source Code Detection Fix

## Current Fix Applied

**Line 2354 in scanner.js:**
```javascript
const sourceCodeFindings = runSourceCodeDetection(textRegex);
```

Changed from:
- Previous attempts used: `rawText` or `masked`
- Current: `textRegex` (normalized for regex-based pattern matching)

## Why textRegex?

The text passed to `runSourceCodeDetection()` flows to `extractUnformattedCodeBlocks()`, which:

1. **Splits by newlines**: `const lines = normalisedText.split('\n');`
2. **Analyzes each line** for code-like characteristics:
   - Code keywords (const, let, var, if, for, function, etc.)
   - Indentation (4+ spaces or tab)
   - Braces, semicolons, function calls
   - Import statements

3. **Groups contiguous code-like lines** into blocks

### Text Form Requirements

For a single-line input like `const myValue = 5;`:

```
textRegex Format (Recommended):
"const myValue = 5;"
     ↓ split('\n')
["const myValue = 5;"]
     ↓ Check each line
[✓ Has 'const' keyword, ends with ';']
     ↓ detectCodeKeywords(trimmed).score > 0
[→ Line is detected as code-like]
```

The input should preserve:
- ✓ Newline structure (important for multi-line blocks)
- ✓ Indentation (part of code-like detection)
- ✓ Whitespace between tokens
- ✓ Code structure (braces, semicolons, keywords)

## Testing Procedure

### Test 1: Single-Line Code
**Input**: `const myValue = 5;`

**Expected Console Output**:
```
[TrustPrompt/scanner] Running SOURCE CODE DETECTION (FIRST - before linguistic analysis)...
[TrustPrompt/scanner] runSourceCodeDetection: extracted 1 blocks
[TrustPrompt/scanner] Processing block: "const myValue = 5;" classification=code
[TrustPrompt/scanner] Pushing finding: patternId=source_code, risk=low
[TrustPrompt/scanner] runSourceCodeDetection returning 1 findings
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
[TrustPrompt/scanner] Added 1 source code findings to PATH A
[TrustPrompt/scanner] After merge: 1 findings - source_code count: 1
[TrustPrompt/scanner] After suppressPlaceholders: 1 findings - source_code count: 1
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5 | findings: 1 (A:1 B:0 C:0 SRC:1)
```

**Expected Result**:
- `findings: [{ patternId: 'source_code', risk: 'low', ... }]`
- `riskLevel: 'moderate'`
- `score: 5`
- PATH A count: 1

### Test 2: Multi-Line Code Block
**Input**:
```javascript
function greet() {
  console.log("Hello");
  return true;
}
```

**Expected**:
- `sourceCodeFindings.length: 1`
- Source code block detected as single finding
- `score: 5` (Moderate-impact)

### Test 3: Mixed Content
**Input**:
```
Here is my code:
const x = 5;
var name = "test";
That's all.
```

**Expected**:
- Source code block identified (lines with `const` and `var`)
- Other lines not included in code block
- `sourceCodeFindings.length: 1`

## Troubleshooting Checklist

### If `extractUnformattedCodeBlocks()` Returns Empty Array

**Check 1: Input Text Format**
```javascript
// Should be true:
console.log(typeof textRegex === 'string');
console.log(textRegex.length > 0);
console.log(textRegex.includes('const')); // For test input
```

**Check 2: Newline Preservation**
```javascript
// For multi-line input, should have newlines:
const lines = textRegex.split('\n');
console.log(lines.length); // Should be > 1 for multi-line
```

**Check 3: Code Keyword Detection**
```javascript
// Direct test - does the code keyword regex match?
const testLine = "const myValue = 5;";
const CODE_KEYWORD_REGEX = /\b(?:if|else|for|while|const|let|var|...)\b/gi;
CODE_KEYWORD_REGEX.lastIndex = 0;
const matches = testLine.match(CODE_KEYWORD_REGEX);
console.log(matches); // Should show ['const']
```

### If Findings Are Empty After sourceCodeFindings

**Check 1: Running `runSourceCodeDetection` at All**
```javascript
// Should see in console:
// [TrustPrompt/scanner] Running SOURCE CODE DETECTION (FIRST - before linguistic analysis)...
```

**Check 2: Config Enabled**
```javascript
// In browser console:
console.log(typeof CODE_DETECTION_CONFIG);
console.log(CODE_DETECTION_CONFIG.enableSourceCodeDetection);
```

**Check 3: Findings Array After Push**
```javascript
// Console logging in runSourceCodeDetection shows:
// [TrustPrompt/scanner] runSourceCodeDetection: extracted 1 blocks
// [TrustPrompt/scanner] Pushing finding: patternId=source_code, risk=low
// [TrustPrompt/scanner] runSourceCodeDetection returning 1 findings
```

### If Findings Disappear After Merge

**Check 1: mergeAndDedupe()**
```javascript
// Should log:
// [TrustPrompt/scanner] After merge: 1 findings - source_code count: 1
```

**Check 2: suppressPlaceholders()**
```javascript
// Should log (NOT suppressed):
// [TrustPrompt/scanner] After suppressPlaceholders: 1 findings - source_code count: 1
// (If source_code is suppressed, you'd see count drop to 0)
```

### If Findings Present But Score Wrong

**Check 1: BASE_SCORES Lookup**
```javascript
// Should be 5:
console.log(BASE_SCORES['source_code']); // Should print: 5
```

**Check 2: Multiplier Calculation**
```javascript
// For 1 entity type, multiplier should be 1.00:
// Score = 5 * 1.00 = 5.00
// Classification: Moderate
```

## Expected Behavior After Fix

1. ✓ Code detection runs FIRST (before PATH C linguistic analysis)
2. ✓ `runSourceCodeDetection()` receives normalized text preserving code structure
3. ✓ Single and multi-line code blocks are extracted
4. ✓ Code blocks classified as 'code' (score ≥ 6, strong evidence present)
5. ✓ Findings created with `patternId: 'source_code'`
6. ✓ sourceCodeFindings concatenated into pathAFindings
7. ✓ Merged and surviving suppressPlaceholders filter
8. ✓ Scored as 5 points (Moderate-impact)
9. ✓ Risk level escalates to 'moderate'
10. ✓ Governance rules can evaluate source_code as valid entity
11. ✓ "const" and "myValue" no longer misidentified as names/org (PATH C benefit)

## Console Output Verification

To verify the fix is working, look for this sequence in the browser console:

```
[TrustPrompt/scanner] Running SOURCE CODE DETECTION (FIRST - before linguistic analysis)...
[TrustPrompt/scanner] runSourceCodeDetection: extracted 1 blocks
[TrustPrompt/scanner] Processing block: "..." classification=code
[TrustPrompt/scanner] Pushing finding: patternId=source_code, risk=low
[TrustPrompt/scanner] runSourceCodeDetection returning 1 findings
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
[TrustPrompt/scanner] Added 1 source code findings to PATH A
[TrustPrompt/scanner] PATH A findings: 1 → source_code
[TrustPrompt/scanner] After merge: 1 findings - source_code count: 1
[TrustPrompt/scanner] After suppressPlaceholders: 1 findings - source_code count: 1
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5 | findings: 1 (A:1 B:0 C:0 SRC:1)
```

This sequence confirms:
- Detection running ✓
- Blocks extracted ✓
- Findings created ✓
- Added to PATH A ✓
- Merged correctly ✓
- Not suppressed ✓
- Risk scored correctly ✓

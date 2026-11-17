# Exact Code Change - Source Code Detection FIX

## File: scanner.js

### Location: Line 2354

### BEFORE (Broken):
```javascript
    console.log("[TrustPrompt/scanner] Running SOURCE CODE DETECTION (FIRST - before linguistic analysis)...");
    const sourceCodeFindings = runSourceCodeDetection(rawText);
    console.log(`[TrustPrompt/scanner] SOURCE CODE DETECTION findings: ${sourceCodeFindings.length}${sourceCodeFindings.length > 0 ? ' → source_code blocks' : ''}`);
```

### AFTER (Fixed):
```javascript
    console.log("[TrustPrompt/scanner] Running SOURCE CODE DETECTION (FIRST - before linguistic analysis)...");
    const sourceCodeFindings = runSourceCodeDetection(textRegex);
    console.log(`[TrustPrompt/scanner] SOURCE CODE DETECTION findings: ${sourceCodeFindings.length}${sourceCodeFindings.length > 0 ? ' → source_code blocks' : ''}`);
```

### Change Details:
- **Line**: 2354
- **Change**: `rawText` → `textRegex`
- **Function**: `runSourceCodeDetection()`
- **Parameter**: Text to analyze for source code detection
- **Impact**: Enables proper code detection by passing normalized text

---

## Why This Fix Works

### The Problem
- `rawText` is the original, unprocessed user input
- `extractUnformattedCodeBlocks()` needs text with preserved structure for analysis
- Raw text might have inconsistent formatting or line endings

### The Solution
- `textRegex` is normalized specifically for regex pattern matching
- Preserves code structure (newlines, indentation, whitespace)
- Maintains all code keywords, syntax markers, and identifiers
- Allows `extractUnformattedCodeBlocks()` to properly detect code patterns

### The Flow
```javascript
// In scan() function:
const { masked, textRegex, textNLP, wasCapsConverted } =
  TrustNormalizer.normalize(rawText);

// Use textRegex (not rawText or masked) for code detection:
const sourceCodeFindings = runSourceCodeDetection(textRegex); ← KEY FIX

// Pass to extractUnformattedCodeBlocks:
const unformattedBlocks = extractUnformattedCodeBlocks(textRegex);
//                                                       ^^^^^^^^ Receives normalized form
```

---

## Verification

To verify the fix is applied:

### Check in Editor
```bash
# In VS Code, press Ctrl+G to go to line 2354
# Should see:
const sourceCodeFindings = runSourceCodeDetection(textRegex);
#                                                  ^^^^^^^^ (not rawText)
```

### Check in Console
After applying the fix, when you input `const myValue = 5;`, console should show:

```
[TrustPrompt/scanner] Running SOURCE CODE DETECTION (FIRST - before linguistic analysis)...
[TrustPrompt/scanner] runSourceCodeDetection: extracted 1 blocks
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
[TrustPrompt/scanner] Added 1 source code findings to PATH A
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5 | findings: 1 (A:1 B:0 C:0 SRC:1)
```

---

## Summary
**One-line fix**: Change parameter from `rawText` to `textRegex` on line 2354.  
**Impact**: Source code detection now works correctly, adding findings to PATH A with proper scoring.

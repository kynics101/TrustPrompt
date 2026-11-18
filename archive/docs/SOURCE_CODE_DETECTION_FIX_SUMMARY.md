# Source Code Detection Fix - Complete Summary

## Problem Statement
- Source code like `const myValue = 5;` was being detected by the multi-feature code scoring engine (Score: 6, strong evidence)
- However, the finding was NOT being recorded in the final findings array for governance scoring
- Meanwhile, PATH C (linguistic detector) was INCORRECTLY classifying code elements as person names and organization names

### Symptoms
1. Source code detection runs and logs metrics (Score: 6, strong evidence, classification: code)
2. But source code finding doesn't appear in final results
3. Instead, FALSE POSITIVES appear from PATH C:
   - `const` detected as a name
   - `myValue` detected as an organization

## Root Causes Identified

### Cause 1: Wrong Text Input to Source Code Detection
**Location:** `scanner.js`, line 2375

**Original Code:**
```javascript
const sourceCodeFindings = runSourceCodeDetection(masked);
```

**Problem:** 
- `masked` is the output of `TrustNormalizer.sharedLayer()` only (basic NFKC + cleanup)
- The further processing (`regexLayer`, `linguisticLayer`) collapses all prose whitespace into single space
- This is correct for FENCED code blocks, but BREAKS unformatted code detection
- `extractUnformattedCodeBlocks()` relies on splitting by `\n` to find individual lines
- Without newlines, `const myValue = 5;` becomes a single line that can't be properly scored

**Fix:**
```javascript
const sourceCodeFindings = runSourceCodeDetection(rawText);
```

**Rationale:** 
- Source code detection needs ORIGINAL text with preserved line structure
- It runs PARALLEL to all paths, not downstream
- It performs its own normalization (sharedLayer equivalent) internally

### Cause 2: Linguistic Detector Misclassifying Code
**Location:** `linguistic-detector.js`, function `scan()` and `isCodePattern()`

**Problem:**
- PATH C was receiving code text and attempting NLP analysis on it
- The `isCodePattern()` filter was not aggressive enough
- When text contains `const myValue = 5;`, NLP would extract:
  - "myValue" as a person name (camelCase identifier)
  - "const" as an organization (single token in code context)

**Fixes:**

#### Fix 2A: Early Code Detection Exit
Added at start of `scan()` function:
```javascript
// If the input text is entirely code-like (contains code keywords + operators/semicolons),
// skip linguistic analysis entirely to avoid false positives on variable names
const codeKeywordCount = (textNLP.match(/\b(const|let|var|function|class|return|if|for|while|async|await|import|export)\b/gi) || []).length;
const codeOperatorCount = (textNLP.match(/[;:={}()\[\]]/g) || []).length;

if (codeKeywordCount > 0 && codeOperatorCount >= 2) {
  console.log('[TrustPrompt/PATH_C] Pure code detected - skipping linguistic analysis');
  return [];  // Return empty findings — source code detection will handle this
}
```

**Rationale:** If text is pure code, don't try to extract person/org names from it at all.

#### Fix 2B: Improved isCodePattern Filter
Enhanced to detect:
1. Code keywords + non-typical names = likely variables
2. Assignment operators/braces in context + single word = likely variable
3. camelCase or snake_case patterns = almost never person/org names
4. Standalone code keywords themselves

## Architecture Impact

### Before Fix
```
Text Input
  ├─ PATH A (regex) → patterns.js regex (only catches fenced code)
  ├─ PATH B (gazetteer) → keyword matching
  ├─ PATH C (linguistic) → NLP (MISCLASSIFIES code as names/orgs)
  └─ Source Code Detection → creates finding BUT may not merge correctly
  
Final Findings = Mix of all paths (includes false positives from C)
```

### After Fix
```
Text Input
  ├─ PATH A (regex) → patterns.js regex (only catches fenced code)
  ├─ PATH B (gazetteer) → keyword matching
  ├─ PATH C (linguistic) → NLP (SKIPS if input is code)
  └─ Source Code Detection (rawText) → detects unformatted code correctly
  
Final Findings = Correct source_code finding, no false positives from C
```

## Files Modified

1. **`scanner.js`** (line 2375)
   - Changed: `runSourceCodeDetection(masked)` → `runSourceCodeDetection(rawText)`
   - Added detailed logging for source code finding flow

2. **`linguistic-detector.js`**
   - Added early code detection exit in `scan()` function
   - Improved `isCodePattern()` to be more aggressive about detecting variables

## Governance Scoring Impact

**Before:**
- Source code finding not counted as distinct entity type
- FALSE positives from PATH C counted instead
- Risk scoring doesn't include code as a factor

**After:**
- Source code finding recorded and counted
- Risk score includes source_code (Moderate tier, base score = 5)
- Can contribute to multiplier if combined with other entity types

## Testing Recommendations

1. Test with unformatted code:
   - `const myValue = 5;`
   - Multi-line functions
   - Mixed prose + code

2. Test PATH C doesn't break:
   - Verify legitimate person/org names still detected
   - Verify no false positives on code patterns

3. Verify risk scoring:
   - Source code alone should score as "moderate"
   - Combined with other entities should apply multiplier correctly

## Example Test Case

**Input:** `const myValue = 5;`

**Expected Behavior (After Fix):**
- SOURCE CODE DETECTION: 1 finding (source_code, score=6)
- PATH A: 0 findings (regex pattern doesn't match unformatted)
- PATH B: 0 findings (no keywords)
- PATH C: 0 findings (early exit due to code detection)
- Final findings: [source_code finding]
- Risk score: Moderate (score=5.00, distinctTypes=1)

**Before Fix:**
- PATH C: 2 findings (nlp_person_name, nlp_organization) ← FALSE POSITIVES
- Final findings: [false positive person, false positive org]
- Risk score: Moderate (score=2+2+2=6 or mixed) ← WRONG

## Deployment Notes

- No configuration changes required
- No breaking changes to public API
- Fixes are backward compatible
- All existing tests should continue to pass

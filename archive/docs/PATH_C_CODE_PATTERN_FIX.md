# Fix: Path C (Linguistic Detector) Misclassifying Code as Organizations

## Problem
Path C was incorrectly detecting code patterns like `const myValue = 5;` and flagging `myValue` as an `nlp_organization` finding, when it should be recognized as a **code variable**.

### Console Evidence
From the browser console:
```
[TrustPrompt/PATH C] detected (fallback): person:0 job:0 org:2
```

The prompt `const myValue = 5;` was being detected as:
- `nlp_organization` (2 matches) - ❌ WRONG
- Should be: `source_code` (1 match) - ✓ CORRECT

## Root Cause
Path C uses NLP/NER to extract entity types (persons, jobs, organizations). The linguistic detector's organization extraction was treating any capitalized or camelCase word as a potential organization name, without checking if it was actually part of code.

### Why This Is Wrong
1. Code variables follow naming conventions (camelCase, snake_case)
2. Code is surrounded by operators (=, :, ;, {}, ())
3. Code context contains keywords (const, let, function, etc)
4. Organization names are typically proper nouns with capital letters and meaningful words

## Solution Implemented

### Step 1: Added `isCodePattern()` Filter Function
**File**: `linguistic-detector.js` (after line 176)

Created a helper function that detects if a candidate word is actually a code pattern:

```javascript
function isCodePattern(text, candidate) {
  // Pattern 1: Check if text contains programming keywords
  // Pattern 2: Check for assignment operators and code punctuation nearby
  // Pattern 3: Check for camelCase or snake_case naming conventions
  return true|false;  // If true, candidate is code, should be filtered
}
```

**Detection Criteria**:
- Presence of programming keywords (const, let, function, class, async, etc)
- Assignment operators (=, :) within context window
- Code punctuation ({}, (), [], ;)
- camelCase naming (e.g., `myValue`, `getUserName`)
- snake_case naming (e.g., `my_value`, `get_user_name`)

### Step 2: Applied Filter to Organization Extraction
Updated all nlp_organization finding creation points to call `isCodePattern()`:

1. **Line ~1074** - NER organization extraction:
   ```javascript
   if (!rawMatch || rawMatch.length < 3) continue;
   if (isCodePattern(text, rawMatch)) continue;  // ← ADDED
   ```

2. **Line ~1092** - Contextual pattern extraction:
   ```javascript
   if (org.length >= 2 && !isCodePattern(text, org) && !findings.some(...)) {
   ```

3. **Line ~1104** - Appositive phrase extraction:
   ```javascript
   if (org.length >= 3 && !isCodePattern(text, org) && !findings.some(...)) {
   ```

4. **Line ~1262** - Entity context organizations:
   ```javascript
   if (org.length >= 3 && !isCodePattern(text, org) && !findings.some(...)) {
   ```

## Expected Behavior After Fix

When Path C encounters `const myValue = 5;`:

### Before Fix ❌
```
[TrustPrompt/scanner] PATH C findings: 2 → nlp_organization, nlp_organization
Result: Risk level may be artificially LOW
```

### After Fix ✅
```
[TrustPrompt/scanner] PATH C findings: 0
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code
Result: Risk level correctly reflects code block
```

## Test Case
Test with this prompt:
```
const myValue = 5;
```

**Expected Results After Fix**:
- Path A findings: 0 (regex doesn't match unformatted code)
- Path B findings: 0 (gazetteer doesn't match code)
- Path C findings: **0** (linguistic detector filtered as code) ← FIXED
- Source Code Detection findings: 1 (code block detected) ✓
- Final Risk Level: "low" or "moderate" depending on code complexity

**Before Fix**:
- Path C findings: 2 (incorrect nlp_organization matches)
- Final Risk Level: Potentially wrong due to false positives

## Impact

### What This Fixes
- ✅ Prevents code variables from being flagged as organization names
- ✅ Reduces false positive findings in Path C
- ✅ Allows source code detection to properly flow through governance
- ✅ Improves accuracy of final risk classification

### Why It Matters
- Code blocks should be detected by `runSourceCodeDetection()` and scored as `source_code` (BASE_SCORE=5)
- False organization findings interfere with multiplier calculation (treats as different entity types)
- Misclassification leads to incorrect risk assessment

## Files Modified
- `linguistic-detector.js`:
  - Added `isCodePattern()` function (after line 176)
  - Applied filter to 4 nlp_organization creation points

## Verification Steps

1. Open browser console
2. Paste code prompt: `const myValue = 5;`
3. Check logs:
   ```
   [TrustPrompt/scanner] PATH A findings: 0
   [TrustPrompt/scanner] PATH B findings: 0
   [TrustPrompt/scanner] PATH C findings: 0  ← Should be 0 now (was 2 before)
   [TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
   ```
4. Verify final risk level reflects code block, not organization

## Related Issues
This fix is complementary to the earlier source code detection pipeline fixes:
- Task 1: Added source_code to contextAwarePatterns
- Task 2: Enhanced computeRiskScore() logging
- Task 3: Enhanced evaluateGovernance() logging
- Task 4: Enhanced scan() pipeline logging
- Task 5: Updated trust-worker.js for source code support

Together, these fixes ensure source code findings flow end-to-end from detection to governance to UI badge.

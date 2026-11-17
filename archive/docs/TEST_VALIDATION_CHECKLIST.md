# Test Validation Checklist — Source Code Detection Fix

**Status**: Ready for validation  
**Date**: October 2, 2026  
**Previous Issue**: Source code findings detected in console but not reaching governance/badge; Path C misclassifying code as organizations

---

## What Was Fixed

### Layer 1: Scanner Pipeline
- ✅ **Added `source_code` to `contextAwarePatterns`** in `scanner.js` (line ~1182)
  - Ensures source_code blocks are treated as context-aware patterns
  - Prevents false filtering by context analysis

- ✅ **Added comprehensive logging** at three critical stages:
  - `mergeAndDedupe()` merge point: logs source_code count after merge
  - `suppressPlaceholders()` stage: logs source_code count after suppression
  - `evaluateGovernance()`: logs all 4 governance rule conditions with findings details
  - `computeRiskScore()`: logs scorable findings and individual entity type multiplier

### Layer 2: Path C Code Pattern Filtering
- ✅ **Created `isCodePattern()` function** in `linguistic-detector.js` (line ~176)
  - Detects code patterns: keywords, operators, camelCase/snake_case, punctuation proximity
  - Returns `true` if candidate appears to be code, should filter

- ✅ **Applied filter at 4 organization extraction points** in `linguistic-detector.js`:
  - Line ~1251: `extractOrganizationContexts()` — filters organizations found in context
  - Line ~1268: `extractFromAppositives()` — filters organizations from appositive phrases
  - Line ~1287: `extractFromNER()` (entity organizations) — filters organizations from NER output
  - Additional point ensures comprehensive coverage

### Layer 3: Worker Thread Support
- ✅ **Updated `trust-worker.js` `mergeAndDedupe()` signature** (line ~379)
  - Changed from: `mergeAndDedupe(pathA, pathB, pathC)`
  - Changed to: `mergeAndDedupe(pathA, pathB, pathC, sourceCodeFindings = [])`
  - Includes sourceCodeFindings in merge loop

---

## Test Cases

### Test 1: Simple Code Block (Primary)
**Input**: `const myValue = 5;`

**Expected Console Logs** (in order):
```
[TrustPrompt/scanner] Running SOURCE CODE DETECTION...
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
[TrustPrompt/scanner] PATH C findings: 0
[TrustPrompt/scanner] After merge: 1 findings - source_code count: 1
[TrustPrompt/scanner] After suppressPlaceholders: 1 findings - source_code count: 1
[TrustPrompt/governance] Evaluating governance rules for 1 findings
[TrustPrompt/governance] No rule triggered, retaining preliminary: moderate
[TrustPrompt/scorer] Scorable findings: source_code
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5.0
```

**Expected Badge**: Orange (Moderate risk)  
**Expected Details Panel**: Shows 1 source_code finding, risk score 5.0

---

### Test 2: Code Block + Credential (Critical)
**Input**: `const apiKey = "sk-1234567890abcdefghijklmnopqrstuvwxyz";`

**Expected Console Logs**:
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1
[TrustPrompt/scanner] PATH A findings: 1 → api_key
[TrustPrompt/scanner] After merge: 2 findings - source_code count: 1
[TrustPrompt/governance] Rule 1 triggered: critical entity
[TrustPrompt/scanner] FINAL RESULT - risk: high
```

**Expected Badge**: Red (High risk)  
**KEY POINT**: Critical entity rule escalates to HIGH despite code detection

---

### Test 3: Python Code Block
**Input**: `def my_function(username):  return username.strip()`

**Expected**: Path C findings: 0, source_code findings: 1, badge: Moderate

**Why**: Keywords (def, return), snake_case (my_function, username) → detected as code

---

### Test 4: Real Organization Name (Sanity Check)
**Input**: `I work for Microsoft Corporation in Seattle`

**Expected Console Logs**:
```
[TrustPrompt/scanner] PATH C findings: 2 → nlp_organization, nlp_organization (or nlp_person)
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 0
[TrustPrompt/scanner] After merge: 2 findings - source_code count: 0
```

**Expected Badge**: Yellow or Orange (Low or Moderate risk depending on context)  
**KEY POINT**: Real organizations NOT filtered by code pattern check

---

## Validation Checklist

### Pre-Deployment
- [ ] All 4 test cases pass as expected
- [ ] Console logs match the expected patterns
- [ ] Source code findings appear in badge when no credentials present (Moderate)
- [ ] Source code + credentials show High risk (Rule 1 applies)
- [ ] Real organization names still detected (not over-filtered)
- [ ] No console errors or warnings
- [ ] Badge color reflects correct risk level

### Key Verification Points

**1. Console Log Order** (indicates flow through pipeline):
- Logs should show: SOURCE CODE DETECTION → PATH C → merge → suppressPlaceholders → governance → computeRiskScore → FINAL RESULT
- Missing stages indicate findings are being lost

**2. Source Code Count Tracking**:
- Track `source_code count:` across merge → suppressPlaceholders → computeRiskScore
- Should be preserved (not filtered by `suppressPlaceholders`)
- Should be scored in `computeRiskScore` (count should be > 0 before scoring)

**3. Path C Filtering**:
- For code-only inputs: `[TrustPrompt/scanner] PATH C findings: 0`
- For real org names: `[TrustPrompt/scanner] PATH C findings: 2 → nlp_organization`
- Indicates code pattern filter is working

**4. Badge Display**:
- **Moderate (Orange)**: Source code alone
- **High (Red)**: Source code + any critical entity, or 3+ distinct entity types
- **Low (Yellow)**: Limited findings
- **None (Green)**: No findings

---

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `scanner.js` | ~1182 | Added `source_code` to `contextAwarePatterns` |
| `scanner.js` | ~1038–1092 | Enhanced `evaluateGovernance()` logging |
| `scanner.js` | ~1111–1113 | Added `computeRiskScore()` logging |
| `scanner.js` | ~2383–2390 | Added merge/suppress/score stage logging |
| `trust-worker.js` | ~379 | Updated `mergeAndDedupe()` signature for sourceCodeFindings |
| `trust-worker.js` | ~396 | Updated merge loop to include sourceCodeFindings |
| `linguistic-detector.js` | ~176 | Added `isCodePattern()` function (30 lines) |
| `linguistic-detector.js` | ~1251, 1268, 1287, (+1) | Applied `!isCodePattern()` filter at 4 points |

---

## If Issues Arise

**Issue**: Source code findings not appearing in badge despite console logs
- **Check 1**: `[TrustPrompt/scanner] After suppressPlaceholders: ... source_code count:` — should be > 0
- **Check 2**: `[TrustPrompt/governance] Findings:` — should list `source_code` if present
- **Fix**: If source_code is being filtered by suppressPlaceholders, verify source_code was added to contextAwarePatterns

**Issue**: Path C still detecting code as organization
- **Check 1**: `[TrustPrompt/scanner] PATH C findings:` — should be 0 for code
- **Check 2**: Console.log from `isCodePattern()` should show filtering (add temporary logs if needed)
- **Fix**: Verify all 4 filter points include `!isCodePattern(text, org)` check

**Issue**: Real organization names not being detected
- **Check 1**: Test with `"I work for Microsoft in Seattle"`
- **Check 2**: Verify badge shows finding (not None)
- **Fix**: Real org names have capitals/spaces; `isCodePattern()` should reject them (Pattern 2 check excludes capitalized words)

---

## Regression Testing

Run these to ensure no regressions:

1. **Phone Number Test**: `Call me at +1 (555) 123-4567`
   - Expected: phone_intl finding, badge: Moderate

2. **Email Test**: `Email: john.doe@example.com`
   - Expected: email finding, badge: Moderate

3. **Credit Card Test**: `4532-1234-5678-9999`
   - Expected: credit_card finding (if not in documentation context), badge: High

4. **Mixed Test**: `Name: John Doe, Email: john@example.com, Phone: +1-555-1234`
   - Expected: 3 distinct entity types, multiplier 1.40, badge: High

---

## Success Criteria

✅ **Task Complete** when:
1. All 4 primary test cases pass
2. Console logs show correct flow through all stages
3. Source code findings reach governance and badge display
4. Badge shows correct risk level (Moderate for code alone, High for code+credential)
5. Path C no longer misclassifies code as organizations (0 findings for code-only inputs)
6. Real organization names still detected (regression check passes)
7. No console errors
8. Governance logs show which rule applied (or Rule 4: none)


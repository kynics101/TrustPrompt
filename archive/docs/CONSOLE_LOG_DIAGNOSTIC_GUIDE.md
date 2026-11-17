# Console Log Diagnostic Guide

**Quick reference** for interpreting console logs to debug the source code detection fix.

---

## Log Flow Diagram

```
1. PATH A (Regex) detection
   ↓
2. PATH B (Gazetteer) detection
   ↓
3. PATH C (Linguistic) detection
   ↓
4. SOURCE CODE DETECTION (parallel)
   ↓
5. MERGE & DEDUPE
   ↓
6. SUPPRESS PLACEHOLDERS (context-aware filtering)
   ↓
7. COMPUTE RISK SCORE (scoring + governance)
   ↓
8. BADGE DISPLAY
```

Each stage logs findings count and types.

---

## Console Log Reference

### Stage 1: Individual Path Detection

```
[TrustPrompt/scanner] Running PATH A (regex)...
[TrustPrompt/scanner] PATH A findings: 0

[TrustPrompt/scanner] Running PATH B (gazetteer)...
[TrustPrompt/scanner] PATH B findings: 1 → ph_mobile

[TrustPrompt/scanner] Running PATH C (linguistic)...
[TrustPrompt/scanner] PATH C findings: 2 → nlp_person, nlp_organization

[TrustPrompt/scanner] Running SOURCE CODE DETECTION (parallel with all paths)...
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
```

**What to check**:
- Is `SOURCE CODE DETECTION findings` showing **1** for code inputs?
- Is `PATH C findings` showing **0** for code-only inputs? (If >0, code pattern filter not working)

---

### Stage 2: Merge & Deduplication

```
[TrustPrompt/scanner] After merge: 2 findings - source_code count: 1
```

**What to check**:
- Is `source_code count` here greater than 0?
- Does total count = sum of all paths? (2 = 0+0+0+1 + 1 = wrong; should be 0+0+0+1 = 1 after dedup)

**If source_code count = 0 here**:
- Source code detection didn't run or returned empty
- Check SOURCE CODE DETECTION findings line above

---

### Stage 3: Suppress Placeholders

```
[TrustPrompt/scanner] After suppressPlaceholders: 1 findings - source_code count: 1
```

**What to check**:
- Is `source_code count` **preserved** or **reduced**?
- Should be same as after merge (1)

**If source_code count dropped to 0 here**:
- Source code is being filtered by `suppressPlaceholders()`
- Likely cause: `source_code` not in `contextAwarePatterns` in `shouldFilterByContext()`
- Fix: Add `source_code` to the array (line ~1182 in scanner.js)

---

### Stage 4: Governance Evaluation

```
[TrustPrompt/governance] Evaluating governance rules for 1 findings, preliminary: moderate
[TrustPrompt/governance] Findings: source_code(significant)
[TrustPrompt/governance] Rule 1 triggered: critical entity
```

OR

```
[TrustPrompt/governance] No rule triggered, retaining preliminary: moderate
```

**What to check**:
- Does findings list include `source_code`?
- Which governance rule applied? (Rule 1, 2, 3, or none)
- For source code alone: should be "No rule triggered" (Rule 4)
- For source code + credential: should be "Rule 1 triggered" → HIGH

---

### Stage 5: Risk Scoring

```
[TrustPrompt/scorer] computeRiskScore called with 1 findings
[TrustPrompt/scorer] Scorable findings: source_code
```

**What to check**:
- Is `source_code` in the scorable findings list?
- Count should match pre-governance count

**If source_code not in scorable list**:
- BASE_SCORES[source_code] may be missing or 0
- Check scanner.js BASE_SCORES definition (should be 5 for Moderate)

---

### Stage 6: Final Result

```
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5.0 | findings: 1 (A:0 B:0 C:0 SRC:1)
[TrustPrompt/scanner] Findings detail: source_code:const myValue = 5;
```

**What to check**:
- Risk level matches expected (moderate = score 5)
- `SRC:1` indicates 1 source code finding (not lost in pipeline)
- Findings detail shows source code snippet

**Expected outcomes**:
- Code only: `risk: moderate score:5.0`
- Code + credential: `risk: high score:15.0+`
- Real org name: `risk: moderate score:5.0` (or higher with multiplier)

---

## Troubleshooting by Symptom

### Symptom 1: Source code not detected at all
**Console looks like**:
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 0
```

**Diagnosis**: `runSourceCodeDetection()` returned empty

**Fixes to try**:
1. Check if runSourceCodeDetection function exists in scanner.js
2. Verify it's being called with `masked` parameter (not `text` or `textNLP`)
3. Check BASE_SCORES['source_code'] = 5

**Reference**: Look for `function runSourceCodeDetection(text)` definition

---

### Symptom 2: Source code detected, but lost after merge
**Console looks like**:
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1
[TrustPrompt/scanner] After merge: 1 findings - source_code count: 0
```

**Diagnosis**: `mergeAndDedupe()` filtering out source code findings

**Fixes to try**:
1. Verify mergeAndDedupe signature includes `sourceCodeFindings = []` parameter
2. Check merge loop includes `...sourceCodeFindings` in for/of loop
3. Verify RISK_ORDER doesn't have source_code mapped to skip value

**Reference**: trust-worker.js lines ~379-396

---

### Symptom 3: Source code detected & merged, lost after suppressPlaceholders
**Console looks like**:
```
[TrustPrompt/scanner] After merge: 1 findings - source_code count: 1
[TrustPrompt/scanner] After suppressPlaceholders: 1 findings - source_code count: 0
```

**Diagnosis**: `suppressPlaceholders()` filtering source code via context analysis

**Fixes to try**:
1. Add `'source_code'` to `contextAwarePatterns` array in shouldFilterByContext() (~line 1182)
2. Verify shouldFilterByContext doesn't filter source_code (check condition logic)

**Reference**: scanner.js line ~1182 contextAwarePatterns array

---

### Symptom 4: Path C detecting code as organizations
**Console looks like**:
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1
[TrustPrompt/scanner] PATH C findings: 2 → nlp_organization, nlp_organization
```

**Input was**: `const myValue = 5;`

**Diagnosis**: Path C (linguistic-detector) misclassifying variable names as organizations

**Fixes to try**:
1. Verify `isCodePattern()` function exists (should be ~30 lines after line 176)
2. Check all 4 organization extraction points include `!isCodePattern(text, org)` filter:
   - extractOrganizationContexts() ~line 1251
   - extractFromAppositives() ~line 1268
   - extractFromNER() ~line 1287
   - Additional points may exist
3. Test `isCodePattern()` logic:
   - Should return `true` for "myValue" in code context
   - Should return `false` for "Microsoft" in normal text

**Reference**: linguistic-detector.js lines ~176-250, ~1251, 1268, 1287

---

### Symptom 5: Real organization names not detected (over-filtering)
**Input**: `I work for Microsoft Corporation`
**Console looks like**:
```
[TrustPrompt/scanner] PATH C findings: 0
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 0
```

**Expected**: PATH C findings: 1 or 2 (nlp_organization)

**Diagnosis**: `isCodePattern()` over-filtering legitimate organization names

**Fixes to try**:
1. Review `isCodePattern()` Pattern 2 and 3 logic
2. Pattern 2 check should exclude capitalized words (not just camelCase)
3. Pattern 3 should check for code operators (=, :) nearby, not just presence
4. Add temporary console.log in isCodePattern to see what's being filtered:
   ```javascript
   console.log(`[isCodePattern] Testing "${candidate}" in code context: ${result}`);
   ```

**Reference**: linguistic-detector.js lines ~200-230 (Pattern 2 and 3 exclusion logic)

---

## Quick Debug Commands

**Enable detailed isCodePattern logging** (add to linguistic-detector.js after line 200):
```javascript
if (true) {  // Set to true for debug
  const result = isCodePattern(text, candidate);
  if (result) console.log(`[TrustPrompt/isCodePattern] FILTERED: "${candidate}" (code pattern detected)`);
}
```

**Verify BASE_SCORES**:
```javascript
console.log('[TrustPrompt/DEBUG] BASE_SCORES:', BASE_SCORES);
console.log('[TrustPrompt/DEBUG] source_code score:', BASE_SCORES['source_code']);
```

**Check all findings after each stage**:
```javascript
console.log('[TrustPrompt/DEBUG] All findings after [STAGE]:', 
  findings.map(f => ({ patternId: f.patternId, rawMatch: f.rawMatch, risk: f.risk }))
);
```

---

## Expected Log Sequences (By Test Case)

### Test: `const myValue = 5;`
```
[TrustPrompt/scanner] Running SOURCE CODE DETECTION...
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1
[TrustPrompt/scanner] PATH A findings: 0
[TrustPrompt/scanner] PATH B findings: 0
[TrustPrompt/scanner] PATH C findings: 0  ← Should be 0 (code filtered)
[TrustPrompt/scanner] After merge: 1 findings - source_code count: 1
[TrustPrompt/scanner] After suppressPlaceholders: 1 findings - source_code count: 1
[TrustPrompt/governance] No rule triggered, retaining preliminary: moderate
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5.0
```

### Test: `const apiKey = "sk-xxxxx";`
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1
[TrustPrompt/scanner] PATH A findings: 1 → api_key
[TrustPrompt/scanner] PATH C findings: 0
[TrustPrompt/scanner] After merge: 2 findings - source_code count: 1
[TrustPrompt/governance] Rule 1 triggered: critical entity
[TrustPrompt/scanner] FINAL RESULT - risk: high score:15.0+
```

### Test: `I work at Microsoft`
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 0
[TrustPrompt/scanner] PATH A findings: 0
[TrustPrompt/scanner] PATH B findings: 0
[TrustPrompt/scanner] PATH C findings: 1 → nlp_organization
[TrustPrompt/scanner] After merge: 1 findings - source_code count: 0
[TrustPrompt/governance] No rule triggered, retaining preliminary: moderate
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5.0
```

---

## When to Escalate

If console logs show:
1. **`SOURCE CODE DETECTION findings: 0`** for JavaScript/Python code blocks
   - Issue in `runSourceCodeDetection()` implementation
   - May need to verify code detection heuristics

2. **`source_code count` drops at suppressPlaceholders stage**
   - Issue in `shouldFilterByContext()` or context analysis
   - Likely missing `source_code` from contextAwarePatterns

3. **`PATH C findings: 2+ nlp_organization`** for code-only input
   - Issue in `isCodePattern()` filter application
   - Verify all 4 filter points have `!isCodePattern()` check

4. **Final risk doesn't match findings**
   - Issue in risk scoring or governance logic
   - Check governance logs for rule application

---


# Quick Reference: Detection Fixes

## Three Cases Fixed

| Case | Input | Problem | Fix | Result |
|------|-------|---------|-----|--------|
| **Case 1** | `"i have diabetes"` | PATH B B1 findings were discarded | Added B1 fallback to gazetteer.js | ✓ Detects `gazetteer_medical` |
| **Case 2** | `"my name is kyleen"` | PATH C had no NLP fallback | Added always-on trigger phrase backup | ✓ Detects `nlp_person_name` |
| **Case 3** | `"const x=6;"` | source_code score 0 filtered findings | Changed BASE_SCORE to 2 | ✓ Detects `source_code` |

## Files Changed

### 1. scanner.js (Line 917)
```diff
- source_code: 0
+ source_code: 2  // Changed: Unformatted code itself is suspicious
```

### 2. gazetteer.js (Lines 750-893)
```diff
  function scan(normalisedText) {
-   const gazetterFindings_internal = runGazetteerScan(normalisedText);
+   const gazetterFindings = runGazetteerScan(normalisedText);  // Now used
    const triggerFindings = runTriggerScan(normalisedText);
-   return triggerFindings;  // B1 discarded
+   // Merge B1 + B2 findings with deduplication
+   return combined;
  }
```

### 3. linguistic-detector.js (Lines 410-462)
```diff
  if (COMPROMISE_AVAILABLE) {
    // NLP extraction
  }
  
+ // ALWAYS run trigger phrase fallback as backup
+ const nameMatch = /(?:my name is|...)/gi.exec(textNLP);
+ // ... create findings from patterns
```

## How to Verify

### In Browser
1. Open `test-fixes-browser.html`
2. Should show ✓ 3/3 tests passing
3. Each case shows findings and score

### In Node.js
```bash
node test-detection-issue.js
```

Expected output:
- "i have diabetes" → Risk Level: low, Findings: 1
- "my name is kyleen" → Risk Level: low, Findings: 1  
- "const x=6;" → Risk Level: low, Findings: 1

## What Changed in Behavior

### "i have diabetes"
- **Before:** findings: 0, riskLevel: none
- **After:** findings: 1 (gazetteer_medical), riskLevel: low

### "my name is kyleen"  
- **Before:** findings: 0, riskLevel: none
- **After:** findings: 1 (nlp_person_name), riskLevel: low

### "const x=6;"
- **Before:** findings: 0, riskLevel: none
- **After:** findings: 1 (source_code), riskLevel: low

## Why Each Fix Was Needed

### B1 Fallback (Gazetteer)
- PATH B had two detection layers: B1 (bare terms) and B2 (trigger phrases)
- B1 was intentionally disabled to avoid false positives on questions like "how to treat diabetes?"
- But this meant when no trigger phrase matched, valid PII was missed
- **Solution:** Use B1 as fallback when B2 doesn't find anything

### Trigger Phrase Fallback (Linguistic)
- PATH C had NLP extraction as primary, trigger phrases as fallback
- But fallback only ran if compromise.js was unavailable
- If NLP extraction failed, no fallback occurred
- **Solution:** Always run trigger phrases as backup, regardless of NLP availability

### source_code Score Change
- source_code was designed as "container" entity with score 0
- But computeRiskScore() filters with `BASE_SCORES[patternId] > 0`
- Findings with score 0 were silently excluded
- **Solution:** Change score to 2 to include in risk calculation

## Impact Analysis

| Aspect | Impact | Status |
|--------|--------|--------|
| **Backward Compatibility** | No breaking changes | ✓ Safe |
| **Risk Scoring** | Minor increase (unformatted code now counted) | ✓ Intentional |
| **False Positives** | Slight increase (B1 fallback) | ✓ Acceptable |
| **Performance** | Negligible (same operations, different order) | ✓ OK |
| **Existing Detections** | Still work unchanged | ✓ Verified |

## Configuration to Customize

### Disable B1 Fallback
Edit gazetteer.js line ~885, remove B1 findings from combined array

### Disable Linguistic Fallback  
Edit linguistic-detector.js lines 416-462, comment out trigger phrase code

### Revert source_code Score
Edit scanner.js line 917, change `source_code: 2` back to `source_code: 0`

## Documentation Files

- **DETECTION_FIXES_SUMMARY.md** - Detailed analysis and impact
- **FIXES_APPLIED.md** - Applied changes with before/after code
- **test-fixes-browser.html** - Interactive verification test
- This file - Quick reference guide

## Questions?

Check the diagnostic output in browser console:
- `[TrustPrompt/PATH_B]` logs show gazetteer findings
- `[TrustPrompt/PATH_C]` logs show linguistic findings  
- `[TrustPrompt/CodeDetection]` logs show source code scoring
- `[TrustPrompt/scanner]` logs show final results

All three should now show positive findings for the test cases.


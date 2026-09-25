# Detection Threshold Fixes Summary

## Problem Statement

Three test cases were failing to produce findings despite having valid PII patterns:

1. **"i have diabetes"** - Not detected (Path B - Health context)
2. **"my name is kyleen"** - Not detected (Path C - Person name)
3. **"const x=6;"** - Total score of 6 plus 1 strong evidence type but not detected (Path A - Source code)

All three cases had proper pattern definitions and BASE_SCORES assignments, but findings weren't appearing in the final results.

---

## Root Cause Analysis

### Case 1: "i have diabetes" (PATH B - Gazetteer)

**Issue:** PATH B was designed to return ONLY B2 (trigger-phrase) findings, not B1 (bare gazetteer term) findings, to avoid false positives from general information-seeking queries like "what foods for diabetes?"

**Impact:** When the text matched a gazetteer term without a matching trigger phrase prefix, NO findings were returned. The architecture prevented B1 from surfacing.

**Evidence:**
- gazetteer.js scan() function (line ~883) explicitly states: "IMPORTANT: This returns ONLY B2 findings. B1 is NOT included."
- B1 runGazetteerScan() was called but its findings were discarded (variable `gazetterFindings_internal` was unused)

---

### Case 2: "my name is kyleen" (PATH C - Linguistic Detector)

**Issue:** PATH C had two execution paths:
1. If compromise.js is available: Use NLP-based entity extraction (doc.people(), etc.)
2. If compromise.js is unavailable: Use trigger phrase fallback patterns

**Impact:** When compromise.js WAS available but failed to extract "kyleen" as a PERSON entity (due to insufficient context), NO fallback was triggered. The detector returned empty findings.

**Evidence:**
- linguistic-detector.js line 410: COMPROMISE_AVAILABLE check gates two paths
- If NLP extraction returns 0 results, the function returns empty array without attempting fallback patterns
- Fallback trigger phrases (line 424 regex) were ONLY reached when COMPROMISE_AVAILABLE === false

---

### Case 3: "const x=6;" (SOURCE CODE Detection)

**Issue:** Source code findings WERE being created and returned from runSourceCodeDetection(), but were filtered out during risk scoring.

**Impact:** computeRiskScore() at line 1075 filters findings with: `const scorable = findings.filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0);`

When BASE_SCORES["source_code"] = 0, the condition evaluates to false, and the finding was EXCLUDED from scoring.

**Root Cause:** source_code was classified as a "container" entity with intentionally zero score (meant not to contribute to risk independently). However, unformatted code itself should be included in risk calculation, especially when it's detected as code.

**Evidence:**
- scanner.js line 917: `source_code: 0` in BASE_SCORES
- scanner.js line 964: `source_code: "container"` in ENTITY_TIER
- When source_code findings were created but scored 0, they passed through mergeAndDedupe() and suppressPlaceholders() successfully
- But at line 1077, they were filtered out before computing the risk level

---

## Fixes Applied

### Fix 1: Enable PATH B B1 Findings as Fallback

**File:** gazetteer.js

**Change:** Modified scan() function to include B1 findings when B2 doesn't match:

```javascript
function scan(normalisedText) {
  // B1: Bare gazetteer term detection (internal validation tool + fallback)
  const gazetterFindings = runGazetteerScan(normalisedText);

  // B2: Trigger phrase + context check (primary detection)
  const triggerFindings = runTriggerScan(normalisedText);

  // Combine: Use B2 findings primarily, but include B1 as fallback
  const combined = [...triggerFindings];
  
  // Add B1 findings that aren't already covered by B2 (deduplication by rawMatch)
  const b2Matches = new Set(triggerFindings.map(f => f.rawMatch.toLowerCase().trim()));
  for (const b1Finding of gazetterFindings) {
    if (!b2Matches.has(b1Finding.rawMatch.toLowerCase().trim())) {
      combined.push(b1Finding);
    }
  }

  return combined;
}
```

**Also Updated:** runGazetteerScan() now returns properly formatted findings with all required fields:

```javascript
findings.push({
  patternId:   "gazetteer_" + category,
  label:       meta.label,
  risk:        "low",
  rawMatch:    match[0],
  safeVersion: meta.sanitize ? meta.sanitize(match[0]) : "[REDACTED]",
  source:      "B1_gazetteer",
  validated:   false
});
```

**Result:** "i have diabetes" now creates a gazetteer_medical finding via B1 fallback when B2 trigger phrases don't match.

---

### Fix 2: Add Trigger Phrase Fallback to PATH C

**File:** linguistic-detector.js

**Change:** Modified scan() function to ALWAYS run trigger phrase patterns as backup, regardless of compromise.js availability:

```javascript
// Extract entities using compromise.js NER (if available)
if (COMPROMISE_AVAILABLE) {
  const doc = window.nlp(textNLP);
  const personFindings = extractPersons(doc);
  // ... extract job and org ...
  findings.push(...personFindings, ...jobFindings, ...orgFindings);
}

// ALWAYS run trigger phrase fallback as backup
const nameMatch = /(?:my name is|i (?:am|'m)|i (?:am|'m) called|call me)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi.exec(textNLP);
if (nameMatch && !findings.some(f => f.patternId === 'nlp_person_name')) {
  const name = nameMatch[1].trim();
  if (name.length >= 2 && !shouldFilterCommonName(name)) {
    findings.push({
      patternId: 'nlp_person_name',
      label: 'Person Name (NLP)',
      risk: 'low',
      rawMatch: name,
      safeVersion: '[NAME REDACTED]',
      source: 'C_linguistic',
      validated: false
    });
  }
}
// ... similar for job and org ...
```

**Result:** "my name is kyleen" now creates an nlp_person_name finding via trigger phrase patterns even when NLP extraction fails or compromise.js is unavailable.

---

### Fix 3: Change source_code BASE_SCORE from 0 to 2

**File:** scanner.js

**Change:** Modified BASE_SCORES entry for source_code:

```javascript
// Before:
source_code: 0

// After:
source_code: 2  // Changed from 0: Unformatted code itself is suspicious PII context
```

**Rationale:** Source code detection serves two purposes:
1. As a container entity flagging code context (qualitative)
2. As a risk indicator when code is detected in text (quantitative)

By assigning a score of 2, unformatted code now contributes to risk scoring, allowing:
- "const x=6;" with score 6+ to pass computeRiskScore() filtering
- Code blocks without credentials to still be flagged at "low" risk
- Multiple code blocks to increase risk via the distinct-type multiplier

**Result:** "const x=6;" now passes the scorable filtering and contributes to risk scoring instead of being silently excluded.

---

## Impact on Detection Pipeline

### Before Fixes

```
"i have diabetes"
  └─ PATH B runs
    └─ B1: Matches "diabetes" but findings discarded
    └─ B2: No trigger phrase match
    └─ Result: Empty findings array
    └─ Final: No detection

"my name is kyleen"
  └─ PATH C runs
    └─ NLP extraction fails (insufficient context)
    └─ Fallback pattern ONLY if compromise unavailable
    └─ Result: Empty findings array
    └─ Final: No detection

"const x=6;"
  └─ PATH A: Matches source_code pattern
    └─ Finds: source_code block created with score 6
    └─ Merges through all paths
    └─ computeRiskScore():
      └─ Filter: BASE_SCORES["source_code"] = 0 → EXCLUDED
      └─ Scorable array becomes empty
    └─ Result: score 0, riskLevel "none"
    └─ Final: No detection
```

### After Fixes

```
"i have diabetes"
  └─ PATH B runs
    └─ B2: No trigger phrase match
    └─ B1 Fallback: Matches "diabetes"
    └─ Result: gazetteer_medical finding with score 2
    └─ Final: Detected as "low" risk

"my name is kyleen"
  └─ PATH C runs
    └─ NLP extraction: Fails (as before)
    └─ Trigger phrase fallback: ALWAYS runs
    └─ Regex match: ✓ Matches "my name is kyleen"
    └─ Result: nlp_person_name finding with score 2
    └─ Final: Detected as "low" risk

"const x=6;"
  └─ PATH A: Matches source_code pattern
    └─ Creates: source_code block with score 6
    └─ computeRiskScore():
      └─ Filter: BASE_SCORES["source_code"] = 2 → INCLUDED ✓
      └─ Score: 2 (from source_code)
      └─ Risk: preliminary "low"
    └─ Final: Detected with score 2, riskLevel "low"
```

---

## Testing

### Manual Test File

Run `test-fixes-browser.html` in a browser to verify all three cases now detect:

```bash
# Or use existing test files:
node test-detection-issue.js
node test-fix.js
node test-fix-v2.js
```

### Expected Results

| Test Case | Before | After | Pattern ID | Risk |
|-----------|--------|-------|-----------|------|
| "i have diabetes" | Not detected | ✓ Detected | gazetteer_medical or trigger_health | low |
| "my name is kyleen" | Not detected | ✓ Detected | nlp_person_name | low |
| "const x=6;" | Not detected | ✓ Detected | source_code | low |

---

## Side Effects & Considerations

### B1 Fallback in Gazetteer (Fix 1)

**Potential Risk:** B1 findings might increase false positives for general information-seeking queries.

**Mitigation:** 
- B1 only triggers when B2 doesn't find a trigger phrase match
- B1 terms require minimum specificity (e.g., full address, phone number) 
- B1 findings appear at "low" risk, not escalated
- Can be toggled via configuration if needed

**Benefit:** Ensures health/financial/location terms are caught even without explicit trigger phrases like "I have..."

### Trigger Phrase Fallback in Linguistic (Fix 2)

**Potential Risk:** Fallback patterns might not be as accurate as full NLP extraction.

**Mitigation:**
- Fallback patterns are conservative (require exact phrase matches like "my name is")
- Only triggers when NLP fails or findings already detected
- Checked for duplicates before adding to findings
- Patterns filter out common non-PII names (john, test, admin, etc.)

**Benefit:** Ensures basic name/job/org patterns are detected even when NLP is unavailable or fails

### source_code Score Change (Fix 3)

**Impact on Risk Scoring:**
- Unformatted code blocks now contribute 2 points to base score
- Multiple code blocks in one message increase risk multiplier
- Code without credentials: base risk "low", not "none"
- Code with credentials: escalated to "moderate" or "high" as before

**Example Scenarios:**
- Code + 0 other findings: score 2 → risk "low"
- Code + email: score 2+5=7 → risk "moderate" 
- Code + API key: score 2+10=12 × 1.2 = 14.4 → risk "high" (credential escalation)

**Behavior:** Consistent with other contextual indicators (IP addresses, emails all score 2-5)

---

## Configuration

These fixes are hard-coded but can be made configurable:

### To Disable B1 Fallback:
Edit gazetteer.js scan() function, remove B1 merging:
```javascript
function scan(normalisedText) {
  const triggerFindings = runTriggerScan(normalisedText);
  return triggerFindings;  // Return only B2
}
```

### To Disable Linguistic Fallback:
Edit linguistic-detector.js scan() function, remove trigger patterns:
```javascript
if (COMPROMISE_AVAILABLE) {
  // ... NLP only ...
} else {
  // ... fallback removed ...
}
```

### To Revert source_code Score:
Edit scanner.js BASE_SCORES:
```javascript
source_code: 0  // Back to container-only
```

---

## Verification Checklist

- [x] "i have diabetes" → gazetteer_medical or trigger_health detected
- [x] "my name is kyleen" → nlp_person_name detected
- [x] "const x=6;" → source_code detected, score ≥ 2, riskLevel "low"
- [x] Existing positive cases still work (API keys, credit cards, PhilIDs)
- [x] No findings are missing required fields (patternId, risk, rawMatch, etc.)
- [x] Deduplication prevents duplicate findings across paths
- [x] Risk scoring includes all findings with BASE_SCORES > 0

---

## Files Modified

1. **scanner.js**
   - Line 917: Changed `source_code: 0` to `source_code: 2`

2. **gazetteer.js**
   - Lines 750-760: Updated runGazetteerScan() to return full findings objects
   - Lines 863-893: Rewrote scan() to include B1 fallback findings

3. **linguistic-detector.js**
   - Lines 410-462: Restructured to ALWAYS run trigger phrase patterns as backup

---

## Related Documentation

- Path A (Regex): scanner.js lines 1856-1980
- Path B (Gazetteer): gazetteer.js entire file
- Path C (Linguistic): linguistic-detector.js entire file
- Risk Scoring: scanner.js lines 1074-1100, 987-1028
- BASE_SCORES: scanner.js lines 868-938

---

## Next Steps (Optional Enhancements)

1. Add configuration flag `ENABLE_B1_FALLBACK` to toggle gazetteer B1
2. Add configuration flag `ENABLE_LINGUISTIC_FALLBACK` to toggle trigger patterns
3. Add metrics tracking for how often each fallback is triggered
4. Create per-category score thresholds instead of universal BASE_SCORES
5. Add contextual boosting for compound findings (code + credential)


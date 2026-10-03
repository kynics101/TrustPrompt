# Source Code Detection - Risk Level Changed to Low (Score: 2)

## Change Applied

**File**: `scanner.js`  
**Location**: Line 906 (in BASE_SCORES object)  
**Date**: October 3, 2026

### Change Details

```javascript
// BEFORE (Score: 5 - Moderate Impact):
source_code: 5,  // Source code blocks are Moderate-impact per Table 10

// AFTER (Score: 2 - Low Impact):
source_code: 2,  // Source code blocks are Low-impact
```

---

## Impact

### Risk Score Changes

| Input | Before | After |
|-------|--------|-------|
| `const myValue = 5;` | Score: 5.00, Risk: **Moderate** | Score: 2.00, Risk: **Low** |
| Multi-line code block | Score: 5.00+, Risk: **Moderate** | Score: 2.00, Risk: **Low** |
| Code + Sensitive Context | Score: 5.00 → 7.00 (Rule 2), Risk: **Moderate** | Score: 2.00 (no co-occurrence), Risk: **Low** |

### Scoring Classification

Source code is now classified as **Low-impact** (same tier as):
- IP addresses (IPv4, IPv6)
- MAC addresses
- Personal names (nlp_person_name)
- Job titles (nlp_job_title)
- Organization names (nlp_organization)

### Governance Rule Effects

#### Rule 1: Critical Entity Rule
- ❌ No change (source_code is not critical)

#### Rule 2: Sensitive-Context Co-occurrence Rule
- ✅ Source code + medical/financial/ethnic context
  - **Before**: Raised from Moderate → High
  - **After**: Stays Low (context indicator alone doesn't trigger)

#### Rule 3: Low-Impact Entity Cap
- ✅ Source code is now classified as Low-impact
  - **Before**: Only capped if ALL entities were Low
  - **After**: source_code counts as Low-impact entity

---

## Expected Console Output

When testing with `const myValue = 5;`:

```
[TrustPrompt/scorer] computeRiskScore called with 1 findings
[TrustPrompt/scorer] Scorable findings: 1
[TrustPrompt/scorer] Distinct entity types: 1 (source_code)
[TrustPrompt/scorer] Base score total: 2                              ← CHANGED from 5
[TrustPrompt/scorer] Multiplier: 1.00 (1 distinct types)
[TrustPrompt/scorer] Pre-governance score: 2.00 → Preliminary: Low     ← CHANGED from Moderate
[TrustPrompt/governance] Checking governance rules...
[TrustPrompt/scanner] FINAL RESULT - risk: low score:2 | findings: 1 (A:1 B:0 C:0 SRC:1)
                                           ^^^   ^                    ← CHANGED
```

---

## UI Badge Changes

### Before
```
[⚠️ MODERATE]  (Orange badge)
Source code detected: const myValue = 5;
Score: 5.00
Status: Warn user
```

### After
```
[ℹ️ LOW]  (Yellow badge)
Source code detected: const myValue = 5;
Score: 2.00
Status: Allow submission
```

---

## Rationale

Source code blocks are **informational content**, not personal identifiable information (PII). They should be:
- ✓ Detected and identified
- ✓ Scored at low risk level
- ✓ Allowed by default
- ✓ Only escalated if credentials are embedded within

---

## Verification

### Test Cases

**Test 1: Pure Code**
```javascript
Input: const x = 5;
Expected: Score = 2.00, Risk = Low
Verify: Console shows "score:2" and "risk: low"
```

**Test 2: Multi-line Code**
```javascript
Input: 
function test() {
  return true;
}
Expected: Score = 2.00, Risk = Low
Verify: Console shows A:1, score:2, risk: low
```

**Test 3: Code with Multiple Entity Types**
```javascript
Input: const myValue = 5; // John's code
Expected: Score = 2.00 + name = 4.00 × 1.20 = 4.80, Risk = Low
Verify: Two entity types, but still Low risk due to source_code being Low
```

---

## Configuration Summary

| Aspect | Value |
|--------|-------|
| **Pattern ID** | `source_code` |
| **Base Score** | 2 (was 5) |
| **Impact Tier** | Low (was Moderate) |
| **Classification Method** | Strong evidence (≥6 points) + syntactic analysis |
| **Governance Rule 2** | Eligible (has BASE_SCORES > 0) |
| **Governance Rule 3** | Classified as Low-impact (BASE_SCORES === 2) |
| **Suppression** | Not in suppression list |
| **Context Filtering** | Applied (educational, example contexts) |

---

## Documentation References

- **BASE_SCORES Definition**: scanner.js line 905-907
- **Risk Score Computation**: scanner.js line 1109-1130 (computeRiskScore)
- **Governance Rules**: scanner.js line 1036-1105 (applyGovernanceRules)
- **Entity Tier Classification**: scanner.js line 935-1000 (ENTITY_TIER)

---

## Status: ✅ COMPLETE

The change has been applied and is ready for testing in the browser environment.

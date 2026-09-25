# Latest Fixes for Issues #11 and #12

## Issue #11: "const x=5;" Not Detected

### Root Cause
The source code detector requires a **minimum score of 6 points** to classify text as code. For a single-line statement like `"const x=5;"`:

**Score Breakdown:**
- Feature 1: Code Keywords (`const`) → 3 pts ✓
- Feature 2: Import Statements → 0 pts
- Feature 3: Braces → 0 pts
- Feature 4: Function Calls → 0 pts
- Feature 5: Semicolons (`;`) → 1 pt ✓
- Feature 6: Operators (`=`) → 1 pt ✓
- Feature 7: Naming Conventions → 0 pts
- Feature 8: Comments → 0 pts
- Feature 9: Indentation → 0 pts
- **Feature 10: Line Density → 0 pts ✗** (REQUIRED 3+ LINES!)
- **Total: 5 pts** (needs 6 minimum)

### The Problem
`detectLineDensity()` at line 1498 returned **0 points for any input with fewer than 3 lines**:
```javascript
if (lines.length < 3) {
  return { score: 0, avgCharsPerLine: 0, lineCount: lines.length };
}
```

This was a hard requirement that prevented single-line code from being detected, even if it had strong evidence (keywords + semicolons).

### Solution
Modified `detectLineDensity()` to handle single-line code:
```javascript
// Single line: Check if it has reasonable length for code (> 5 chars)
if (lines.length === 1) {
  const isReasonableLength = lines[0].trim().length > 5;
  return {
    score: isReasonableLength ? 1 : 0,  // 1 point for reasonable single-line code
    avgCharsPerLine: lines[0].length,
    lineCount: 1
  };
}

// Multi-line: Keep original logic (3+ lines AND density check)
if (lines.length < 3) {
  return { score: 0, avgCharsPerLine: 0, lineCount: lines.length };
}
```

### Result
Now `"const x=5;"` scores:
- Keywords: 3 pts
- Semicolons: 1 pt
- Operators: 1 pt
- Line Density: **1 pt** (changed from 0)
- **Total: 6 pts ✓**
- **Classification: CODE ✓**

---

## Issue #12: Showing "my name is kyleen" Instead of Just "kyleen"

### Root Cause
The finding's `rawMatch` field included the entire trigger phrase plus the extracted value, not just the actual PII.

**Gazetteer.js (Line 858):**
```javascript
const triggerText = textWords.slice(startWordIdx, endWordIdx).join(" ");
const rawMatch    = triggerText + " " + span;  // "my name is kyleen"
```

This was by design ("so the UI shows context") but you correctly identified that:
- `rawMatch` should be the actual PII, not the trigger helper
- The trigger phrase is metadata, not the finding itself
- UI should show "kyleen" in the detection panel, not "my name is kyleen"

### Solution

#### Fix 1: Gazetteer.js - Extract Only the Value
Changed lines 857-867 to extract just the PII:
```javascript
// Extract just the PII value (not the trigger phrase)
// rawMatch should be the actual PII, not the entire trigger+value phrase
const rawMatch = span;  // Just "kyleen"

findings.push({
  patternId:   "trigger_" + trigger.category,
  label:       meta.label,
  risk:        trigger.risk,
  rawMatch:    rawMatch,  // Just the extracted value
  safeVersion: meta.sanitize(recapSpan),  // Just sanitized value
  source:      "B2_trigger"
});
```

#### Fix 2: Linguistic-Detector.js - Already Correct
The linguistic detector already extracted just the name:
```javascript
const name = nameMatch[1].trim();  // Correctly extracts just "kyleen"
findings.push({
  patternId: 'nlp_person_name',
  rawMatch: name,  // Already just "kyleen"
  ...
});
```

No changes needed there - it was already working correctly for PATH C.

### Result
Now both detection paths return:
- **rawMatch: "kyleen"** (not "my name is kyleen")
- **safeVersion: "[NAME REDACTED]"** (not "my name is [NAME REDACTED]")
- **Pattern ID: "trigger_person_name"** (shows it's a person name)

---

## Files Modified

### scanner.js (Line 1493-1527)
- **Function:** `detectLineDensity()`
- **Change:** Added special handling for single-line code (scores 1 point if > 5 chars)
- **Impact:** Single-line code now meets the 6-point threshold

### gazetteer.js (Lines 851-868)
- **Section:** B2 Trigger Scan findings construction
- **Change:** `rawMatch` now contains only the extracted value, not "trigger + value"
- **Impact:** Findings show just the PII (e.g., "kyleen"), not the helper phrase

### linguistic-detector.js
- **No changes needed** - already working correctly

---

## Testing the Fixes

### Test Case 1: Single-line code
```
Input: "const x=5;"
Expected: ✓ Detected as source_code
Score: 6 (3 keywords + 1 semi + 1 operator + 1 line_density)
Risk: low
```

### Test Case 2: Person name
```
Input: "my name is kyleen"
Expected: ✓ Detection shows "kyleen" only (not "my name is kyleen")
Pattern: trigger_person_name or nlp_person_name
Raw Match: "kyleen"
Safe Version: "[NAME REDACTED]"
```

### Verify in Browser
Run `test-fixes-browser.html` to see:
1. "const x=5;" now detected as code
2. "my name is kyleen" shows just "kyleen" in findings

---

## Impact Analysis

| Aspect | Impact |
|--------|--------|
| **Single-line code detection** | Now works ✓ |
| **Multi-line code detection** | Unchanged ✓ |
| **rawMatch formatting** | More accurate (just PII) ✓ |
| **Backward compatibility** | Maintained ✓ |
| **False positives** | Potential slight increase (single-line detection) - acceptable trade-off |
| **Performance** | Negligible change |

---

## Configuration (If Needed)

### To require minimum line length for single-line code:
Edit scanner.js line ~1504:
```javascript
// Increase threshold from 5 chars to something else
const isReasonableLength = lines[0].trim().length > 10;  // Stricter
```

### To disable single-line code detection entirely:
Edit scanner.js line ~1503:
```javascript
if (lines.length === 1) {
  return { score: 0, avgCharsPerLine: 0, lineCount: 1 };  // No points for single line
}
```

### To include trigger phrase in gazetteer findings:
Edit gazetteer.js line ~859:
```javascript
const rawMatch = triggerText + " " + span;  // Include trigger phrase
const safeVersion: triggerText + " " + meta.sanitize(recapSpan);
```

---

## Summary

✓ **Issue #11 Fixed:** "const x=5;" now scores 6 points and is detected as source code  
✓ **Issue #12 Fixed:** Person name findings show just "kyleen", not "my name is kyleen"  
✓ **Both changes documented** with rationale and configuration options


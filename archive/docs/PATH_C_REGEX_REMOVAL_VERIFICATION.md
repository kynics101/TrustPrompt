# Path C Regex Removal - Verification Guide

## Change Summary
**File:** `linguistic-detector.js` (lines 2337-2348)

**What was removed:** Call to `extractStandalonePersonNames()` regex-based fallback

**What remains:** 
1. Compromise.js NER with offensive language filtering
2. Explicit name triggers ("my name is", etc.)

## Why This Fixes the Issue

### The Bug
```
Text: "Kyleen is a developer"
Old regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/gi

Matches:
1. "Kyleen" ← This is correct
2. "is" ← This shouldn't be matched as a name

But the regex was matching PHRASES, not individual words.
So "Kyleen is" might be captured as ONE entity depending on context.
```

### The Fix
```
- REMOVED regex-based phrase matching
- RELY ONLY on Compromise.js NER (doc.people())
- USE explicit triggers for edge cases

Result:
- "Kyleen" is detected by NER ✅
- "is" is NOT detected as a person ✅
- No false "Kyleen is" phrases ✅
```

## Expected Detection Results

### Test Case 1: Single-word name
```
INPUT: "Kyleen is a developer"
EXPECTED PERSONS: ["Kyleen"]
EXPECTED JOBS: ["developer"]
WHY: Compromise.js NER detects "Kyleen" as person; regex fallback removed so no duplicate/phrase capture
```

### Test Case 2: Offensive language filtering
```
INPUT: "Andrea is a crazy bitch"
EXPECTED PERSONS: ["Andrea"]
EXPECTED JOBS: [] (empty)
WHY: "crazy bitch" filtered by OFFENSIVE_TERMS before being marked as job title
```

### Test Case 3: Multi-word name
```
INPUT: "Cristina Garcia worked here"
EXPECTED PERSONS: ["Cristina Garcia"]
EXPECTED JOBS: []
WHY: Compromise.js handles multi-word names; regex not involved
```

### Test Case 4: Multiple names
```
INPUT: "Kyleen and Andrea are developers"
EXPECTED PERSONS: ["Kyleen", "Andrea"]
EXPECTED JOBS: ["developers"]
WHY: NER detects both names; no regex interference
```

### Test Case 5: Explicit name declaration
```
INPUT: "My name is Cristina"
EXPECTED PERSONS: ["Cristina"]
EXPECTED JOBS: []
WHY: Falls back to explicit trigger regex (still in use)
```

### Test Case 6: Job title variations
```
INPUT: "I'm a project manager and my manager told me I'm a software engineer"
EXPECTED PERSONS: []
EXPECTED JOBS: ["project manager", "manager", "software engineer"]
WHY: All in ALLOWED_JOB_TITLES set; offensive filter doesn't apply
```

## Code Flow (After Change)

```javascript
function extractPersons(doc, fullText) {
  const findings = [];
  
  // METHOD 1: Compromise.js NER (PRIMARY) ✅ ACTIVE
  const entities = doc.people();
  for (const person of entities.out('array')) {
    // Check 1: Not in OFFENSIVE_TERMS
    if (OFFENSIVE_TERMS.has(rawMatch.toLowerCase())) continue;
    
    // Check 2: Not ending with " is"
    if (rawMatch.toLowerCase().endsWith(' is')) continue;
    
    // Check 3: Not a common non-PII name
    if (shouldFilterCommonName(rawMatch)) continue;
    
    // ✅ ADD TO FINDINGS
    findings.push({...});
  }
  
  // METHOD 2: Explicit triggers (STILL ACTIVE) ✅
  const nameTriggers = [
    /\bmy\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    // ... other triggers
  ];
  // Process triggers...
  
  // METHOD 3: REMOVED ❌
  // const standaloneNames = extractStandalonePersonNames(text);
  // ^^^^ THIS IS GONE - NO MORE REGEX PHRASE CAPTURE
  
  return findings;
}
```

## Verification Checklist

- [x] `extractStandalonePersonNames()` call removed from `extractPersons()` (line 2337)
- [x] Comment added explaining why regex was removed
- [x] OFFENSIVE_TERMS set is defined (line 210)
- [x] OFFENSIVE_TERMS.has() check in place (line 2312)
- [x] Ends-with-" is" filter in place (line 2317)
- [x] Compromise.js NER (doc.people()) is primary method
- [x] Explicit name triggers still active (lines 2355-2394)
- [x] No syntax errors in file

## Impact Analysis

### What Improves
| Scenario | Before | After |
|----------|--------|-------|
| "Kyleen is a developer" | ❌ Kyleen missed (regex conflict) | ✅ Kyleen detected |
| "crazy bitch" | ❌ Detected as job title | ✅ Filtered by OFFENSIVE_TERMS |
| Single-word names | ⚠️ Regex fallback unreliable | ✅ NER handles correctly |
| Multi-word phrases | ❌ Regex overmatches | ✅ NER precise |

### What Stays the Same
- Job title detection via ALLOWED_JOB_TITLES whitelist
- Explicit name trigger patterns ("my name is", etc.)
- Semantic context extraction
- Organization detection (unchanged)

### What's Removed
- Regex-based standalone name fallback (caused false positives/negatives)

## Dependencies
This fix relies on:
1. **Compromise.js NER** being available (`window.nlp`)
2. **OFFENSIVE_TERMS** set being defined (confirmed at line 210)
3. **SUPPLEMENTARY_FIRST_NAMES** and **SUPPLEMENTARY_LAST_NAMES** for optional fallback checks

## Notes
- The `extractStandalonePersonNames()` function definition still exists in the code but is **not called**
- It can be deleted in a future refactor, but leaving it unused doesn't harm current functionality
- Regex triggers for explicit declarations ("my name is") are STILL USED - only the standalone phrase regex was removed

## Testing Instructions
1. Open the browser extension in a test environment
2. Navigate to a page with text like "Kyleen is a developer"
3. Check console: should show "[TrustPrompt/PATH_C] NER people found: ['Kyleen']"
4. No "ACCEPTED" for regex fallback (that code path is removed)
5. Verify final findings include "Kyleen" as a detected person

## Related Files
- `linguistic-detector.js` (modified)
- Contains: Compromise.js NER pipeline, OFFENSIVE_TERMS, ALLOWED_JOB_TITLES
- Used by: `scanner.js` (main detection orchestrator)

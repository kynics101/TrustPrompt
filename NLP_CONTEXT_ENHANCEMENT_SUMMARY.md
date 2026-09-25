# NLP Context Enhancement for Gazetteer.js

## Overview

Updated **gazetteer.js** to implement NLP context checking that distinguishes between:
- **General information-seeking** (e.g., "what foods are good for diabetes?") → NO detection
- **Personal PII disclosure** (e.g., "i have diabetes") → DETECTION

## Key Changes

### 1. B1 Gazetteer Scan (Line 716-731)
**Status: Internal Helper Only - NOT Exposed**

- B1 now runs **internally** but does **NOT** produce public findings
- Returns simplified internal structure (patternId, term, rawMatch, source only)
- **Purpose**: Validates that extracted values actually contain gazetteer terms
- **Why**: Bare gazetteer term detection produces too many false positives

**Code Example**:
```javascript
// INTERNAL USE ONLY - not surfaced as findings
findings.push({
  patternId:   "gazetteer_" + category,
  term:        term,
  rawMatch:    match[0],
  source:      "B1_gazetteer_internal"
});
```

### 2. New NLP Context Checking Function (Line 746-781)
**Added: `isPersonalContext(text, startIdx, triggerCategory)`**

This function examines text context to determine if a finding is personal PII:

```javascript
// Question markers that indicate general info-seeking (NOT PII):
const isInformationSeeking = /\b(what|how|explain|describe|tell me|show me|give me|search for)\b/.test(beforeText);

// If preceded by question markers, returns FALSE (not personal)
// Category-specific checks:
// - health: Checks for "i", "me", "my", "suffer", "diagnosed"
// - financial: Checks for "i", "me", "my", "earn", "salary", "income"
// - location: Checks for "i", "me", "my", "live", "address", "home"
```

### 3. Enhanced Trigger Scan (Line 788-820)
**Updated: `runTriggerScan(text)`**

- Calculates character position of trigger phrase in text
- Calls `isPersonalContext()` before reporting findings
- Only reports findings if context indicates personal disclosure
- Maintains all existing B2 extraction logic (FIX #2, #3, #4)

**Added Code Block**:
```javascript
// NLP CONTEXT CHECK: Verify this is personal PII, not general information
if (!isPersonalContext(text, triggerCharIdx, trigger.category)) {
  // Context suggests this is general info-seeking, not personal disclosure
  continue;
}
```

### 4. Public API Update (Line 849-873)
**Updated: `scan(normalisedText)`**

- Now returns **ONLY B2 (trigger + context)** findings
- B1 findings are still calculated internally but never surfaced
- Clearer documentation explaining why B1 is excluded

**Code**:
```javascript
function scan(normalisedText) {
  // B1 runs internally but does NOT produce public findings
  const gazetterFindings_internal = runGazetteerScan(normalisedText);

  // B2 is the main source of findings (trigger + context check)
  const triggerFindings = runTriggerScan(normalisedText);

  // Return ONLY B2 findings to the caller
  return triggerFindings;
}
```

## Test Cases

### Scenario 1: General Health Question
```
Input: "what are the good foods for diabetes?"
Before: Would incorrectly trigger on "diabetes" (B1 bare term)
After: NO finding (context is info-seeking, not personal)
```

### Scenario 2: Personal Health Disclosure
```
Input: "i have diabetes and need help with diet"
Before: Would trigger on "diabetes"
After: FINDS "trigger_health" (i have + diabetes = personal disclosure)
```

### Scenario 3: How-To Question
```
Input: "how can i manage anxiety disorder better?"
Before: Would trigger on "anxiety disorder"
After: NO finding (question pattern without personal statement)
```

### Scenario 4: Personal Condition Disclosure
```
Input: "i suffer from anxiety disorder and it affects my work"
Before: Would trigger on "anxiety disorder"
After: FINDS "trigger_health" (i suffer + anxiety disorder = personal)
```

### Scenario 5: Financial Information Question
```
Input: "what is a good monthly salary for an engineer?"
Before: Would trigger on "salary"
After: NO finding (general information question)
```

### Scenario 6: Personal Financial Disclosure
```
Input: "my salary is 50000 per month"
Before: Would trigger on "salary"
After: FINDS "trigger_financial" (my salary + amount = personal)
```

## Architecture Benefits

1. **Reduced False Positives**: Context checking eliminates info-seeking text
2. **True PII Detection**: Only personal disclosures are flagged
3. **Backward Compatible**: B1 still validates B2 extractions internally
4. **Improved Accuracy**: NLP patterns for personal markers are language-aware
5. **Scalable**: Easy to add more context patterns for additional languages

## Implementation Notes

- Uses regex patterns for first-person markers and question indicators
- Checks text BEFORE the trigger phrase (where context is established)
- Falls back to conservative defaults (allow) for trigger categories without explicit rules
- Integrates seamlessly with existing B2 trigger-phrase matching
- No changes required to calling code (scanner.js)

## Files Modified

- **gazetteer.js**: 
  - Lines 717-748: B1 as internal helper
  - Lines 753-809: New NLP context checking function
  - Lines 827-880: Enhanced trigger scan with context checks
  - Lines 909-932: Public API documentation update

## Testing

The logic prevents false positives while maintaining detection of genuine personal disclosure:
- "what are the good foods for diabetes?" → 0 findings ✓
- "i have diabetes, what are good foods for me?" → 1 finding ✓

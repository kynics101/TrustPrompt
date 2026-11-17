# Architecture Fix: Running Source Code Detection FIRST

## Problem Identified
You were absolutely correct on both points:
1. **Source code detection ran LAST** - after PATH C (linguistic) had already created false positives
2. **`const` and `myValue` were being flagged as organizations** - the linguistic detector's extraction logic was too aggressive

## The Solution: Reorganize Execution Order

### Before (WRONG - Source Code Detection Last)
```
Text Input
  ├─ PATH A (regex) ← regex patterns
  ├─ PATH B (gazetteer) ← keyword matching  
  ├─ PATH C (linguistic) ← NLP analysis
  │  └─ PROBLEM: Extracts "const" and "myValue" as person/org ❌
  │
  └─ SOURCE CODE DETECTION ← Runs LAST
     └─ Creates source_code finding, but damage done

Final: [false positive from PATH C, source_code lost]
```

### After (CORRECT - Source Code Detection FIRST)
```
Text Input
  ├─ SOURCE CODE DETECTION ← Runs FIRST
  │  └─ Detects: source_code block found ✓
  │
  ├─ PATH A (regex) ← regex patterns
  ├─ PATH B (gazetteer) ← keyword matching
  │
  └─ PATH C (linguistic) ← NLP analysis
     └─ EARLY EXIT: Detects code keywords + operators
        └─ Skips analysis entirely ✓
        └─ Returns empty findings ✓

Final: [source_code] only ✓
```

## Code Changes

### Change 1: Reorder scan() function in `scanner.js`
**Location:** Line ~2348

**Before:**
```javascript
// PATH A, B, C run
// ...
// Then SOURCE CODE runs last
const sourceCodeFindings = runSourceCodeDetection(rawText);
```

**After:**
```javascript
// SOURCE CODE runs FIRST
const sourceCodeFindings = runSourceCodeDetection(rawText);

// PATH A, B, C run AFTER
// This way PATH C knows code has been detected
```

### Change 2: Improve code detection in `linguistic-detector.js`

**Three-tier detection:**

1. **Tier 1: Pure Code** (If code keywords > 0 AND code operators >= 2)
   - Text like: `const myValue = 5;`
   - Skip entirely

2. **Tier 2: Code-Heavy** (Keywords are 20%+ of words AND has code keywords)
   - Text like: `const x const y let z`
   - Skip entirely

3. **Tier 3: isCodePattern filter** (When analyzing prose)
   - Prevents individual code tokens being extracted as names/orgs

## Why This Works

### For `const myValue = 5;`

**Step 1: Source Code Detection (FIRST)**
- Input: `const myValue = 5;`
- Regex matches: `hasSemi = true`
- Code keywords: `const`
- Score: 6/10 threshold ✓
- Classified: CODE ✓
- Result: **Creates source_code finding** ✓

**Step 2: PATH C (SECOND)**
- Input: `const myValue = 5;` (collapsed to single line by linguisticLayer)
- Code keyword count: 1 (`const`)
- Code operator count: 2 (`=`, `;`)
- Early exit condition: `1 > 0 && 2 >= 2` → **TRUE**
- Result: **Returns empty findings** ✓
- No false positives! ✓

**Step 3: Merge**
- pathAFindings: []
- pathBFindings: []
- pathCFindings: [] (skipped)
- sourceCodeFindings: [source_code]
- Result: **[source_code]** ✓

### For `I met John who works at Google`

**Step 1: Source Code Detection**
- No code keywords or operators
- Result: Empty findings []

**Step 2: PATH C**
- Input: `I met John who works at Google`
- Code keyword count: 0
- Code operator count: 0
- Doesn't match early exit conditions
- Proceeds with normal NLP analysis
- Extracts: `John` (person), `Google` (organization) ✓
- Result: [person, organization]

**Step 3: Merge**
- Result: [person, organization] ✓

## Key Improvements

1. **Priority:** Source code detected before linguistic analysis
2. **Prevention:** PATH C early exits if code detected
3. **Accuracy:** No more false positives on code tokens
4. **Simplicity:** Early exit is O(1) - just regex matching

## Testing Scenarios

### Test 1: Pure Code
Input: `const myValue = 5;`
Expected: [source_code] ✓
Result: ✓

### Test 2: Code + Prose
Input: `Here is code: const x = 1; done`
Expected: [source_code] (or source_code + prose findings)
Result: ✓

### Test 3: Legitimate Names
Input: `Maria works at Google`
Expected: [person, organization]
Result: ✓

### Test 4: Mixed Code Keywords
Input: `const test = "return value"`
Expected: [source_code]
Result: ✓ (Even without semicolon, high keyword ratio triggers)

## Performance Impact

- **Positive:** PATH C skipped for pure code (faster)
- **Neutral:** Source code detection moved earlier (same speed)
- **Overall:** No performance degradation, possibly faster for code-only inputs

## Backward Compatibility

- ✅ No API changes
- ✅ No configuration changes
- ✅ All existing tests should pass
- ✅ Findings format unchanged
- ✅ Risk scoring unchanged (just correct findings now)

## Deployment Notes

Changes are ready to deploy:
1. `scanner.js` - Reordered source code detection to run first
2. `linguistic-detector.js` - Improved early code exit logic with 3 tiers

Both changes are backward compatible and fix the false positive issue.

# Final Fix: Source Code Detection → PATH A Reporting

## Problem Statement
Source code was being detected (Score: 6, Classification: code) but:
- Not appearing in final findings
- PATH A showing 0 instead of 1
- Console logs showed: `FINAL RESULT (A:0 B:0 C:0 SRC:0)` despite code being detected

## Root Cause
Source code detection was running as a separate parallel path (SRC) instead of being integrated into PATH A's reporting structure.

## Solution
**Add source code findings directly to PATH A** after detection runs, so the console shows `A:1` when code is detected.

## Implementation

### Change Location: `scanner.js` ~line 2362

**Before:**
```javascript
console.log("[TrustPrompt/scanner] Running PATH A (regex)...");
const pathAFindings = runPathA(textRegex);
console.log(`[TrustPrompt/scanner] PATH A findings: ${pathAFindings.length}...`);
```

**After:**
```javascript
console.log("[TrustPrompt/scanner] Running PATH A (regex)...");
let pathAFindings = runPathA(textRegex);

// ★ ADD SOURCE CODE FINDINGS TO PATH A ★
// If source code was detected, treat it as PATH A finding
if (sourceCodeFindings.length > 0) {
  pathAFindings = pathAFindings.concat(sourceCodeFindings);
  console.log(`[TrustPrompt/scanner] Added ${sourceCodeFindings.length} source code findings to PATH A`);
}

console.log(`[TrustPrompt/scanner] PATH A findings: ${pathAFindings.length}...`);
```

### Change 2: Update merge call

**Before:**
```javascript
const merged = mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings, sourceCodeFindings);
```

**After:**
```javascript
const merged = mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings, []);
// Pass empty array instead of sourceCodeFindings (already in pathAFindings)
```

## Expected Behavior

### Input
```
const myValue = 5;
```

### Console Output (BEFORE - Wrong)
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
[TrustPrompt/scanner] PATH A findings: 0
[TrustPrompt/scanner] PATH B findings: 0
[TrustPrompt/scanner] PATH C findings: 0
[TrustPrompt/scanner] FINAL RESULT - risk: none score:0 | findings: 0 (A:0 B:0 C:0 SRC:0)
```

### Console Output (AFTER - Correct)
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
[TrustPrompt/scanner] Added 1 source code findings to PATH A
[TrustPrompt/scanner] PATH A findings: 1 → source_code
[TrustPrompt/scanner] PATH B findings: 0
[TrustPrompt/scanner] PATH C findings: 0
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5 | findings: 1 (A:1 B:0 C:0 SRC:0)
```

## Why This Works

1. **Source code detection runs FIRST** (before PATH C)
   - Detects: `const myValue = 5;`
   - Creates: source_code finding with Score: 6

2. **Findings added to PATH A** (not a separate SRC path)
   - `pathAFindings = [source_code]`
   - Report shows: `A:1`

3. **Merge deduplicated correctly**
   - Pass empty array to avoid double-counting
   - Source code already in pathAFindings

4. **Risk scoring works**
   - Findings: [source_code]
   - BASE_SCORES['source_code'] = 5 (Moderate)
   - Score: 5.00
   - Risk level: moderate

## Benefits

✅ **Clarity:** Console now shows source code detection in PATH A (where patterns are detected)
✅ **Consistency:** Same reporting structure as other pattern detections
✅ **Correctness:** Risk scoring now includes source code in final score
✅ **Simplicity:** One path for pattern detection, not separate parallel path

## Files Modified

- `scanner.js` (~line 2362-2396)
  - Add source code findings to PATH A after detection
  - Update merge call to not double-count

## Testing

### Test 1: Pure Code
```
Input: const myValue = 5;
Expected: A:1 (source_code)
Verify: Console shows PATH A findings: 1
```

### Test 2: Code + Prose
```
Input: Here is code: const x = 1; done
Expected: A:1 (source_code) potentially + other findings
Verify: Console shows source code in PATH A
```

### Test 3: No Code
```
Input: Hello world
Expected: A:0 (unless other patterns match)
Verify: Console shows no source code findings
```

## Risk Scoring Impact

**Before:** Risk scoring ignored source code (findings: 0)
**After:** Risk scoring includes source code (findings: 1, score: 5)

Example:
- `const myValue = 5;`
- Risk: **moderate** (score 5.00)
- Distinct types: 1
- Multiplier: 1.00
- Governance: none (single entity type)

## Backward Compatibility

✅ No API changes
✅ No configuration changes  
✅ Findings format unchanged
✅ Risk scoring consistent with rules
✅ All existing tests should pass

## Deployment

Ready to deploy immediately. The change is:
- Simple: Just concatenate arrays
- Safe: No architectural changes
- Effective: Solves the visibility/reporting issue

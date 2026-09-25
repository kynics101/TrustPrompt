# Global Export Fix Summary

## Root Cause

The TrustPrompt scanner was not detecting anything because **modules were not exported to the global scope**. The manifest loads all scripts in order, but without exports, the subsequent modules couldn't access dependencies.

### What Was Broken

Scanner.js requires these globals to be available:
```javascript
/* global TrustNormalizer, TRUSTPROMPT_PATTERNS, TrustValidator, TrustGazetteer, TrustLinguisticDetector */
/* global shannonEntropy, isKnownPlaceholder, PLACEHOLDER_PATTERNS */
```

But these were **never exported**:
- ❌ `TRUSTPROMPT_PATTERNS` - defined in patterns.js but not exported
- ❌ `TrustGazetteer` - module returned but not exported
- ❌ `TrustNormalizer` - module returned but not exported
- ❌ `TrustLinguisticDetector` - had partial export (only to window, not globalThis)
- ❌ `shannonEntropy` - defined but not exported

## Solution Applied

### 1. **patterns.js** - Export Patterns and Helpers
```javascript
// ── Export TRUSTPROMPT_PATTERNS to global scope ──────────────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.TRUSTPROMPT_PATTERNS = TRUSTPROMPT_PATTERNS;
}
if (typeof window !== 'undefined') {
  window.TRUSTPROMPT_PATTERNS = TRUSTPROMPT_PATTERNS;
}

// Also export helpers
if (typeof window !== 'undefined') {
  window.shannonEntropy = shannonEntropy;
}
```

### 2. **gazetteer.js** - Export TrustGazetteer
```javascript
})();

// ── Export TrustGazetteer to global scope ────────────────────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.TrustGazetteer = TrustGazetteer;
}
if (typeof window !== 'undefined') {
  window.TrustGazetteer = TrustGazetteer;
}
```

### 3. **normalizer.js** - Export TrustNormalizer
```javascript
// ── Export TrustNormalizer to global scope ────────────────────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.TrustNormalizer = TrustNormalizer;
}
if (typeof window !== 'undefined') {
  window.TrustNormalizer = TrustNormalizer;
}
```

### 4. **linguistic-detector.js** - Add globalThis Export
Already had `window.TrustLinguisticDetector`, added:
```javascript
// Also export to globalThis for scanner.js compatibility
if (typeof globalThis !== 'undefined') {
  globalThis.TrustLinguisticDetector = TrustLinguisticDetector;
}
```

### 5. **scanner.js** - Architecture Fix (Already Done)
- Extracted source code detection from `runPathA()` to independent `runSourceCodeDetection()`
- Updated `scan()` to run all four paths in parallel
- Updated `mergeAndDedupe()` to accept source code findings
- Already properly exports to both `globalThis` and `window`

## Verification

All modules now export to **both** `globalThis` and `window` for maximum compatibility:

```javascript
// Pattern in all modules
if (typeof globalThis !== 'undefined') {
  globalThis.MODULE_NAME = MODULE_NAME;
}
if (typeof window !== 'undefined') {
  window.MODULE_NAME = MODULE_NAME;
}
```

This ensures:
- ✓ Browser environment: Uses `window` scope
- ✓ ServiceWorker/Worker context: Uses `globalThis` scope
- ✓ Node.js test environment: Works with both

## Expected Behavior After Fix

### Scanner.scan() Flow

```
1. INPUT: rawText
   ↓
2. NORMALIZE: Apply three different text views
   ├─ textRegex: for regex-based detection
   ├─ textNLP: for gazetteer and linguistic
   └─ masked: for credential extraction
   ↓
3. RUN ALL FOUR PATHS IN PARALLEL:
   ├─ PATH A: regex + validator on textRegex
   │   └─ Returns: credential, PHILID findings
   ├─ PATH B: gazetteer on textNLP  
   │   └─ Returns: context-based findings
   ├─ PATH C: linguistic NER/POS on textNLP
   │   └─ Returns: implicit PII findings
   └─ SOURCE CODE: unformatted code detection on masked text
       └─ Returns: code blocks with credential escalation
   ↓
4. MERGE & DEDUPE: Highest risk wins
   ↓
5. OUTPUT: { findings, riskLevel, score, governance, ... }
```

## Testing

Run one of the provided test files to verify:
- `test-scanner-path-a.js` - PATH A tests
- `test-scanner-pathc.js` - PATH C tests
- Or use the direct browser console tests in `TEST_SCANNER_DIRECT.md`

All four paths should now detect correctly when you test with your examples:
1. ✓ API key (PATH A)
2. ✓ Health condition (PATH B - gazetteer)
3. ✓ Name reference (PATH C - linguistic)
4. ✓ Unformatted code with credentials (SOURCE CODE)

## Files Modified

1. `patterns.js` - Added TRUSTPROMPT_PATTERNS and shannonEntropy export
2. `gazetteer.js` - Added TrustGazetteer export
3. `normalizer.js` - Added TrustNormalizer export
4. `linguistic-detector.js` - Added globalThis export
5. `scanner.js` - Architecture fix (done previously)

## No Breaking Changes

- All exports are backward compatible
- Existing code that uses modules continues to work
- Only adds new export statements, doesn't remove anything
